import { Armature, type Bone } from "@papit/armature";
import { legsHurt, WOUND, type Capsule, type Vec, type Zone } from "@arrow-warfare/archery";
import { compose, invert, mat4, multiply, type Mat4 } from "@arrow-warfare/render";
import type { Ragdoll } from "@arrow-warfare/ragdoll";

import { frame, limp, type Blow, type LimpPoint } from "./limp";

/**
 * The silly body: a big torso, a round head, short arms and tiny legs, rigid parts on an armature. Arms
 * and legs are two bones each, solved by IK: the feet to where they're planted on the ground, the hands
 * to the bow and its string. Everything is in rig space (the feet at 0, facing -z, right is +x), and
 * `place` puts it in the world. Dead, it goes limp: a ragdoll in the world, thrown by what killed it, and
 * `place` is then the identity.
 */

/** Measures, metres in rig space. The hips are the torso's origin. */
export const MEASURE = {
    hip: .33,
    /** Hips while sitting. */
    sit: .12,
    hipWidth: .13,
    thigh: .17,
    shin: .17,
    /** The ankle over the sole. */
    ankle: .05,
    /** Above the hips. */
    shoulder: .58,
    shoulderWidth: .35,
    upperArm: .25,
    forearm: .23,
    neck: .68,
    /** Hit capsule radii. */
    torso: .27,
    head: .25,
    arm: .08,
    leg: .09,
};

export type Part = "head" | "torso" | "leftArm" | "leftForearm" | "rightArm" | "rightForearm" | "leftThigh" | "leftShin" | "rightThigh" | "rightShin";

export type RigInput = {
    /** Feet on the ground, and the way the body faces. */
    x: number; y: number; z: number; yaw: number;
    /** Where they look, up is positive. */
    pitch: number;
    /** 0..1 how far the bow is drawn. */
    draw: number;
    /** Left handed: the bow in the right hand. */
    left: boolean;
    /** 3 is panting. */
    stage: number;
    /** `WOUND` bits. */
    wounds: number;
    /** Sat down to rest. */
    resting: boolean;
    dead: boolean;
    /** What killed them, read once as they go limp. */
    blow?: Blow | null;
    /** Not used any more, the ragdoll falls. */
    tip?: number;
    /** No bow (the round is over, or the view wants the hands). */
    unarmed?: boolean;
};

type Limb = { upper: Bone; lower: Bone; target: Float32Array; pole: Float32Array };
type Foot = { plant: Vec; from: Vec; to: Vec; t: number };

/** How far ahead of the body a foot lands, in seconds of walking. */
const LEAD = .14;
/** Metres for one hop. */
const HOP_LENGTH = .55;
const HOP_HEIGHT = .13;

export class Rig {
    readonly armature = new Armature();
    /** Rig space to the world. */
    readonly place = mat4();
    readonly torso = mat4();
    readonly head = mat4();
    /** The bow's grip, before its bend. Its string is towards +z. */
    readonly bow = mat4();
    readonly hands = [mat4(), mat4()];
    readonly feet = [mat4(), mat4()];
    /** Left then right. */
    readonly arms: Limb[];
    readonly legs: Limb[];
    readonly capsules: Capsule[];
    /** Whether the bow is drawn this frame, and how far. */
    armed = true;
    /** Dead this frame: crossed out eyes. */
    dead = false;
    draw = 0;
    /** Bow side: 1 holds it in the left hand (right handed), -1 in the right. */
    side = 1;
    /** Panting heaves the torso, a scale on its height. */
    heave = 1;

    /** 0 standing .. 1 sitting, eased. */
    private low = 0;
    /** 1 standing up, down to 0 sitting, crawling or lying dead: how much of a shadow to cast. */
    get upright() { return this.where.tip ? 0 : 1 - this.low; }
    /** 0 bow low .. 1 up for a shot, eased. */
    private raise = 0;
    private hop = 0;
    private lift = 0;
    private clock = Math.random() * 10;
    private last: { x: number; z: number } | null = null;
    private vx = 0;
    private vz = 0;
    private steps: Foot[] = [];
    private crawl = 0;
    private scratch = mat4();
    private scratch2 = mat4();

    constructor(readonly ground: (x: number, z: number) => number) {
        const limb = (name: string, upper: number, lower: number): Limb => {
            const top = this.armature.add(name, { length: upper });
            const bottom = this.armature.add(`${name}-lower`, { length: lower, parent: top });
            const target = new Float32Array(3), pole = new Float32Array(3);
            this.armature.ik(bottom, { chain: 2, target, pole });
            return { upper: top, lower: bottom, target, pole };
        };
        this.arms = [limb("leftArm", MEASURE.upperArm, MEASURE.forearm), limb("rightArm", MEASURE.upperArm, MEASURE.forearm)];
        this.legs = [limb("leftLeg", MEASURE.thigh, MEASURE.shin), limb("rightLeg", MEASURE.thigh, MEASURE.shin)];
        const capsule = (zone: Zone, part: Part, radius: number): Capsule => ({ zone, part, a: [0, 0, 0], b: [0, 0, 0], radius });
        this.capsules = [
            capsule("head", "head", MEASURE.head),
            capsule("torso", "torso", MEASURE.torso),
            capsule("leftArm", "leftArm", MEASURE.arm), capsule("leftArm", "leftForearm", MEASURE.arm),
            capsule("rightArm", "rightArm", MEASURE.arm), capsule("rightArm", "rightForearm", MEASURE.arm),
            capsule("leftLeg", "leftThigh", MEASURE.leg), capsule("leftLeg", "leftShin", MEASURE.leg),
            capsule("rightLeg", "rightThigh", MEASURE.leg), capsule("rightLeg", "rightShin", MEASURE.leg),
        ];
    }

    /** Where the body is now, for hit tests: the feet and facing, tipped or not. */
    where = { x: 0, y: 0, z: 0, yaw: 0, tip: 0 };
    /** The dead body, once limp. */
    doll: Ragdoll<LimpPoint> | null = null;
    private posed = false;

    update(dt: number, input: RigInput) {
        if (input.dead) return this.limp(dt, input);
        this.doll = null;
        this.posed = true;
        this.clock += dt;
        const { x, y, z, yaw } = input;
        this.where = { x, y, z, yaw, tip: 0 };
        compose(this.place, 0, x, y, z, yaw, this.where.tip);

        // how fast over the ground, a jump is a teleport (a spawn, a first pose)
        const moved = this.last ? Math.hypot(x - this.last.x, z - this.last.z) : Infinity;
        const jumped = moved > 2;
        if (!jumped && dt > 0)
        {
            const grip = 1 - Math.exp(-dt * 10);
            this.vx += ((x - this.last!.x) / dt - this.vx) * grip;
            this.vz += ((z - this.last!.z) / dt - this.vz) * grip;
        }
        else this.vx = this.vz = 0;
        this.last = { x, z };
        const speed = input.dead ? 0 : Math.hypot(this.vx, this.vz);

        const legs = legsHurt(input.wounds);
        const sitting = !input.dead && (input.resting || legs >= 2);
        const hopping = !input.dead && !sitting && legs === 1;
        const ease = (from: number, to: number, rate: number) => from + (to - from) * (1 - Math.exp(-dt * rate));
        this.low = ease(this.low, sitting ? 1 : 0, 5);
        this.dead = input.dead;
        this.armed = !input.dead && !input.unarmed;
        this.draw = this.armed ? input.draw : 0;
        this.raise = ease(this.raise, this.draw > .02 ? 1 : 0, 8);
        this.side = input.left ? -1 : 1;
        const side = this.side, r = this.raise, low = this.low;

        // hopping: the whole body goes up and down, a hop each `HOP_LENGTH`, a little balancing bounce standing
        if (hopping && !jumped)
        {
            this.hop += moved / HOP_LENGTH * Math.PI;
            this.lift = ease(this.lift, Math.abs(Math.sin(this.hop)) * HOP_HEIGHT * Math.min(1, speed / 1.2 + .15), 30);
        }
        else this.lift = ease(this.lift, 0, 12);
        // crawling: a lurch along with the hands
        if (sitting && !jumped) this.crawl += moved * 9;

        // ------------------------------------------------------------ torso and head
        const stepping = this.steps.reduce((most, foot) => Math.max(most, foot.t < 1 ? Math.sin(Math.PI * foot.t) : 0), 0);
        const hipY = MEASURE.hip + (MEASURE.sit - MEASURE.hip) * low - stepping * .015 * Math.min(1, speed / 2) + this.lift;
        const panting = input.stage === 3;
        this.heave = panting ? 1 + Math.sin(this.clock * 7) * .035 : 1;
        const lean = (input.dead ? 0 : input.pitch * .3 * (1 - r * .5)) + (panting ? -.12 : 0) - low * .12 + (sitting ? Math.sin(this.crawl) * .05 * Math.min(1, speed) : 0);
        // drawn, an archer turns side on: the bow shoulder towards the target
        const twist = -.45 * r * side;
        compose(this.torso, 0, 0, hipY, 0, twist, lean);
        const shoulderY = MEASURE.shoulder * this.heave;
        const neck = this.point(this.torso, 0, MEASURE.neck * this.heave, 0);
        compose(this.head, 0, neck[0], neck[1], neck[2], 0, input.dead ? 0 : input.pitch * .6);

        // ------------------------------------------------------------ the bow
        const middle = this.point(this.torso, 0, shoulderY, 0);
        const wounded = (input.wounds & (side > 0 ? WOUND.leftArm : WOUND.rightArm)) !== 0;
        const shake = (input.stage >= 2 ? Math.sin(this.clock * 29) * .02 * this.draw : 0) + (wounded ? Math.sin(this.clock * 23) * .025 * (.3 + this.draw) : 0);
        compose(this.scratch, 0, middle[0], middle[1], middle[2], 0, input.pitch * r + shake);
        const bx = (-.4 + .28 * r) * side, by = -.33 + .33 * r, bz = -.12 - .36 * r;
        const roll = (-.2 * (1 - r) + (.6 - .48 * this.draw) * r) * side, tilt = -1.1 * (1 - r);
        compose(this.scratch2, 0, bx, by, bz, 0, tilt, roll);
        multiply(this.bow, this.scratch, this.scratch2);

        // ------------------------------------------------------------ arms
        const [bowArm, stringArm] = side > 0 ? [this.arms[0], this.arms[1]] : [this.arms[1], this.arms[0]];
        for (const [i, arm] of this.arms.entries())
        {
            const s = i === 0 ? -1 : 1;
            const shoulder = this.point(this.torso, s * MEASURE.shoulderWidth, shoulderY, 0);
            arm.upper.offset.set(shoulder);
            // elbows down, out and back
            arm.pole.set([shoulder[0] + s * .45, shoulder[1] - .3, shoulder[2] + .4]);
            const hurt = (input.wounds & (i === 0 ? WOUND.leftArm : WOUND.rightArm)) !== 0;
            let target: Vec;
            if (arm === bowArm && this.armed) target = this.point(this.bow, 0, 0, .03);
            else if (arm === stringArm && this.armed && r > .05)
            {
                // the string hand at the nock, coming from the side as the bow comes up
                const nock = this.point(this.bow, 0, 0, .1 + .3 * this.draw);
                const rest = this.restHand(shoulder, s, low, speed);
                target = [rest[0] + (nock[0] - rest[0]) * r, rest[1] + (nock[1] - rest[1]) * r, rest[2] + (nock[2] - rest[2]) * r];
            }
            else target = this.restHand(shoulder, s, low, speed);
            if (hurt && !input.dead) target[1] -= .04;
            arm.target.set(target);
        }

        // ------------------------------------------------------------ legs
        this.footing(dt, input, speed, jumped, sitting, hopping);

        this.armature.update();

        for (const [i, arm] of this.arms.entries()) compose(this.hands[i], 0, arm.lower.tail[0], arm.lower.tail[1], arm.lower.tail[2]);
        for (const [i, leg] of this.legs.entries())
        {
            const tucked = hopping && (input.wounds & (i === 0 ? WOUND.leftLeg : WOUND.rightLeg)) !== 0;
            compose(this.feet[i], 0, leg.lower.tail[0], leg.lower.tail[1], leg.lower.tail[2], 0, low * 1.3 + (tucked ? -.6 : 0));
        }
        this.updateCapsules();
    }

    /** Dead: the ragdoll from the last pose, then every part from its points. */
    private limp(dt: number, input: RigInput) {
        if (!this.doll)
        {
            // never posed (a body first seen dead): stand it up once to have a pose to fall from
            if (!this.posed) this.update(1e-4, { ...input, dead: false, blow: null, draw: 0 });
            const w = (p: ArrayLike<number>): Vec => this.world([p[0], p[1], p[2]]);
            const [left, right] = this.arms, [leftLeg, rightLeg] = this.legs;
            this.doll = limp({
                pelvis: w(this.point(this.torso, 0, 0, 0)),
                chest: w(this.point(this.torso, 0, MEASURE.shoulder, 0)),
                head: w(this.point(this.head, 0, .22, 0)),
                lShoulder: w(left.upper.head), lElbow: w(left.upper.tail), lHand: w(left.lower.tail),
                rShoulder: w(right.upper.head), rElbow: w(right.upper.tail), rHand: w(right.lower.tail),
                lHip: w(leftLeg.upper.head), lKnee: w(leftLeg.upper.tail), lFoot: w(leftLeg.lower.tail),
                rHip: w(rightLeg.upper.head), rKnee: w(rightLeg.upper.tail), rFoot: w(rightLeg.lower.tail),
            }, this.ground, [this.vx, 0, this.vz], input.blow ?? null);
            this.vx = this.vz = 0;
            this.last = null;
        }
        const doll = this.doll;
        doll.update(dt);
        const p = doll.points;
        const at = (name: LimpPoint): Vec => [p[name].x, p[name].y, p[name].z];
        const minus = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

        compose(this.place, 0, 0, 0, 0, 0, 0);
        const pelvis = at("pelvis"), chest = at("chest"), head = at("head");
        const across = minus(at("rShoulder"), at("lShoulder"));
        const up = minus(chest, pelvis);
        frame(this.torso, pelvis, across, up);
        const neckUp = minus(head, chest);
        const n = Math.hypot(...neckUp) || 1;
        frame(this.head, [head[0] - neckUp[0] / n * .22, head[1] - neckUp[1] / n * .22, head[2] - neckUp[2] / n * .22], across, neckUp);
        const bone = (b: Bone, from: LimpPoint, to: LimpPoint) => {
            const a = at(from), c = at(to);
            b.head.set(a);
            b.tail.set(c);
            frame(b.worldMatrix as unknown as Float32Array, a, minus(c, a), up);
        };
        const [left, right] = this.arms, [leftLeg, rightLeg] = this.legs;
        bone(left.upper, "lShoulder", "lElbow"); bone(left.lower, "lElbow", "lHand");
        bone(right.upper, "rShoulder", "rElbow"); bone(right.lower, "rElbow", "rHand");
        bone(leftLeg.upper, "lHip", "lKnee"); bone(leftLeg.lower, "lKnee", "lFoot");
        bone(rightLeg.upper, "rHip", "rKnee"); bone(rightLeg.lower, "rKnee", "rFoot");
        frame(this.hands[0], at("lHand"), across, up);
        frame(this.hands[1], at("rHand"), across, up);
        frame(this.feet[0], at("lFoot"), across, minus(at("lKnee"), at("lFoot")));
        frame(this.feet[1], at("rFoot"), across, minus(at("rKnee"), at("rFoot")));

        this.where = { x: pelvis[0], y: pelvis[1], z: pelvis[2], yaw: input.yaw, tip: 1 };
        this.dead = true;
        this.armed = false;
        this.draw = 0;
        this.heave = 1;
        this.updateCapsules();
    }

    /** A hand at rest: hanging by the side, or on the ground beside me sitting, pushing when crawling. */
    private restHand(shoulder: Vec, s: number, low: number, speed: number): Vec {
        const swing = Math.sin(this.crawl + (s > 0 ? Math.PI : 0)) * .08 * Math.min(1, speed);
        const hang: Vec = [shoulder[0] + s * .12, shoulder[1] - .42, shoulder[2] - .03];
        const ground: Vec = [s * .4, .04, .05 + swing];
        return [hang[0] + (ground[0] - hang[0]) * low, hang[1] + (ground[1] - hang[1]) * low, hang[2] + (ground[2] - hang[2]) * low];
    }

    /** The feet: planted in the world and stepping when the body gets ahead, or out front sitting, or hopping. */
    private footing(dt: number, input: RigInput, speed: number, jumped: boolean, sitting: boolean, hopping: boolean) {
        const cos = Math.cos(input.yaw), sin = Math.sin(input.yaw);
        // rig space to the world, flat (the feet are planted in the world)
        const toWorld = (lx: number, lz: number): Vec => {
            const wx = input.x + cos * lx + sin * lz, wz = input.z - sin * lx + cos * lz;
            return [wx, this.ground(wx, wz), wz];
        };
        const toRig = (p: Vec): Vec => {
            const dx = p[0] - input.x, dz = p[2] - input.z;
            return [cos * dx - sin * dz, p[1] - input.y, sin * dx + cos * dz];
        };
        const stepping = !input.dead && !sitting && !hopping;

        if (!this.steps.length || jumped || !stepping)
        {
            this.steps = [-1, 1].map(s => {
                const home = toWorld(s * MEASURE.hipWidth, 0);
                return { plant: home, from: home, to: home, t: 1 };
            });
        }
        else
        {
            const lead = (s: number): Vec => {
                const home = toWorld(s * MEASURE.hipWidth, 0);
                const ahead: Vec = [home[0] + this.vx * LEAD, 0, home[2] + this.vz * LEAD];
                ahead[1] = this.ground(ahead[0], ahead[2]);
                return ahead;
            };
            const far = speed > .3 ? .16 + speed * .05 : .09;
            const length = Math.max(.13, Math.min(.3, .3 - speed * .035));
            this.steps.forEach((foot, i) => {
                const s = i === 0 ? -1 : 1;
                const other = this.steps[1 - i];
                if (foot.t < 1)
                {
                    foot.t = Math.min(1, foot.t + dt / length);
                    const e = foot.t * foot.t * (3 - 2 * foot.t);
                    foot.plant = [foot.from[0] + (foot.to[0] - foot.from[0]) * e, 0, foot.from[2] + (foot.to[2] - foot.from[2]) * e];
                    foot.plant[1] = this.ground(foot.plant[0], foot.plant[2]) + Math.sin(Math.PI * foot.t) * (.05 + .03 * Math.min(1, speed / 3));
                    return;
                }
                const want = lead(s);
                if (other.t < 1 || Math.hypot(want[0] - foot.plant[0], want[2] - foot.plant[2]) < far) return;
                const to: Vec = [want[0] + this.vx * length * .5, 0, want[2] + this.vz * length * .5];
                to[1] = this.ground(to[0], to[2]);
                foot.from = [...foot.plant];
                foot.to = to;
                foot.t = 0;
            });
        }

        for (const [i, leg] of this.legs.entries())
        {
            const s = i === 0 ? -1 : 1;
            const hip = this.point(this.torso, s * MEASURE.hipWidth, 0, 0);
            // undo the lean: the legs hang from the hips, not from a leaning torso
            hip[1] = this.torso[13];
            leg.upper.offset.set(hip);
            const hurt = (input.wounds & (i === 0 ? WOUND.leftLeg : WOUND.rightLeg)) !== 0;
            let foot: Vec;
            if (sitting) foot = [s * .16, MEASURE.ankle, -.3 + (s * Math.sin(this.crawl) * .04)];
            else if (hopping) foot = hurt ? [s * MEASURE.hipWidth, this.lift + .15, .27] : [s * MEASURE.hipWidth, this.lift * .85 + MEASURE.ankle, 0];
            else
            {
                foot = toRig(this.steps[i].plant);
                foot[1] += MEASURE.ankle;
            }
            leg.target.set(foot);
            // knees forward, up when sitting
            leg.pole.set(sitting ? [hip[0], hip[1] + .6, hip[2] - .2] : [hip[0] + s * .05, hip[1] - .1, hip[2] - .6]);
        }
    }

    private updateCapsules() {
        const [head, torso, ...limbs] = this.capsules;
        head.a = this.point(this.head, 0, .16, 0);
        head.b = this.point(this.head, 0, .28, 0);
        // the round ends stay inside the torso: the tiny legs below it can be hit
        torso.a = this.point(this.torso, 0, .22, 0);
        torso.b = this.point(this.torso, 0, .42 * this.heave, 0);
        const bones = [this.arms[0].upper, this.arms[0].lower, this.arms[1].upper, this.arms[1].lower, this.legs[0].upper, this.legs[0].lower, this.legs[1].upper, this.legs[1].lower];
        bones.forEach((bone, i) => {
            limbs[i].a = [bone.head[0], bone.head[1], bone.head[2]];
            limbs[i].b = [bone.tail[0], bone.tail[1], bone.tail[2]];
        });
    }

    /** A part's frame in rig space, for arrows stuck in it. */
    frame(part: string): ArrayLike<number> {
        switch (part)
        {
            case "head": return this.head;
            case "torso": return this.torso;
            case "leftArm": return this.arms[0].upper.worldMatrix;
            case "leftForearm": return this.arms[0].lower.worldMatrix;
            case "rightArm": return this.arms[1].upper.worldMatrix;
            case "rightForearm": return this.arms[1].lower.worldMatrix;
            case "leftThigh": return this.legs[0].upper.worldMatrix;
            case "leftShin": return this.legs[0].lower.worldMatrix;
            case "rightThigh": return this.legs[1].upper.worldMatrix;
            case "rightShin": return this.legs[1].lower.worldMatrix;
            default: return this.torso;
        }
    }

    /** A point (or with `w` 0 a direction) from rig space into a part's own space. */
    toPart(part: string, point: Vec, w = 1): Vec {
        const inverse = this.scratch;
        invert(inverse, this.frame(part));
        return apply(inverse, point, w);
    }

    /** A point (or direction) on a part, in the world. */
    fromPart(part: string, local: Vec, w = 1): Vec {
        multiply(this.scratch, this.place, this.frame(part));
        return apply(this.scratch, local, w);
    }

    /** A rig space point (or with `w` 0 a direction) in the world. */
    world(point: Vec, w = 1): Vec {
        return apply(this.place, point, w);
    }

    /** A rig space point through a rig space matrix. */
    private point(m: ArrayLike<number>, x: number, y: number, z: number): Vec {
        return apply(m, [x, y, z], 1);
    }
}

export function apply(m: ArrayLike<number>, [x, y, z]: Vec, w = 1): Vec {
    return [m[0] * x + m[4] * y + m[8] * z + m[12] * w, m[1] * x + m[5] * y + m[9] * z + m[13] * w, m[2] * x + m[6] * y + m[10] * z + m[14] * w];
}

export type { Mat4 };
