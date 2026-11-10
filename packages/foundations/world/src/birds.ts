import { compose, mat4, MeshBuilder, multiply, transformPoint, type Batch, type MeshData, type Renderer, type Vec3 } from "@arrow-warfare/render";
import type { Field } from "./field";

export type BirdKind = "tiny" | "crow" | "owl";
/** The sound a bird makes, by name in `sfx.json`. */
export type BirdCall = "bird" | "crow" | "owl";
export type BirdTime = "night" | "dawn" | "noon" | "sunset";

// ------------------------------------------------------------------ models

/**
 * A bird in two parts: the body (wings folded flat into it are not part of it) and one wing, the right one,
 * its shoulder at the origin reaching along +x, flat in x z. The left is the same wing mirrored. Bodies face +z.
 */
export type BirdModel = { body: MeshData; wing: MeshData; shoulder: Vec3; size: number };

/** A small brown bird; the back and the wings take the instance's tint, so a flock isn't all one colour. */
function tinyModel(): BirdModel {
    const body = new MeshBuilder()
        .ball("#ffffff", { at: [0, .07, 0], scale: [.045, .045, .07], tint: 1 }, 1)
        .ball("#e8d2ae", { at: [0, .058, .01], scale: [.038, .032, .055] }, 1)
        .ball("#ffffff", { at: [0, .105, .055], scale: .033, tint: 1 }, 1)
        .cylinder("#d9a441", { at: [0, .1, .085], pitch: Math.PI / 2, scale: [.016, .03, .016] }, 4, .5, 0)
        .ball("#111111", { at: [.024, .112, .07], scale: .007 }, 0)
        .ball("#111111", { at: [-.024, .112, .07], scale: .007 }, 0)
        .box("#ffffff", { at: [0, .08, -.085], pitch: -.25, scale: [.045, .01, .06], tint: 1 })
        .cylinder("#8a6a4a", { at: [.015, 0, .005], scale: [.006, .035, .006] }, 3, .5, .5, false)
        .cylinder("#8a6a4a", { at: [-.015, 0, .005], scale: [.006, .035, .006] }, 3, .5, .5, false)
        .build();
    const wing = new MeshBuilder()
        .box("#ffffff", { at: [.05, 0, -.012], scale: [.1, .008, .055], tint: 1 })
        .box("#5a4632", { at: [.085, 0, -.03], scale: [.04, .006, .035] })
        .build();
    return { body, wing, shoulder: [.03, .085, .015], size: .2 };
}

/** A crow, black all over, a heavy grey beak. */
function crowModel(): BirdModel {
    const black = "#1d1e24", dark = "#121318";
    const body = new MeshBuilder()
        .ball(black, { at: [0, .2, 0], scale: [.11, .1, .2] }, 1)
        .ball(black, { at: [0, .27, .17], scale: .075 }, 1)
        .cylinder("#3a3a3e", { at: [0, .26, .22], pitch: Math.PI / 2, scale: [.04, .1, .045] }, 4, .5, 0)
        .ball("#c9b26a", { at: [.05, .29, .2], scale: .01 }, 0)
        .ball("#c9b26a", { at: [-.05, .29, .2], scale: .01 }, 0)
        .box(dark, { at: [0, .22, -.24], pitch: -.2, scale: [.12, .02, .16] })
        .cylinder(dark, { at: [.04, 0, .02], scale: [.012, .12, .012] }, 3, .5, .5, false)
        .cylinder(dark, { at: [-.04, 0, .02], scale: [.012, .12, .012] }, 3, .5, .5, false)
        .build();
    const wing = new MeshBuilder()
        .box(black, { at: [.15, 0, -.02], scale: [.3, .015, .16] })
        // the long feathers at the tip, spread like fingers
        .box(dark, { at: [.36, 0, -.02], yaw: .15, scale: [.14, .01, .03] })
        .box(dark, { at: [.36, 0, -.06], yaw: .3, scale: [.13, .01, .03] })
        .box(dark, { at: [.35, 0, .02], scale: [.13, .01, .03] })
        .build();
    return { body, wing, shoulder: [.07, .25, .05], size: .6 };
}

/** An owl, upright, a pale face with big yellow eyes and ear tufts. */
function owlModel(): BirdModel {
    const brown = "#7d5e40", light = "#d8c29c", dark = "#4f3a28";
    const body = new MeshBuilder()
        .ball(brown, { at: [0, .2, 0], scale: [.13, .18, .12] }, 1, .1, 4)
        .ball(light, { at: [0, .17, .05], scale: [.1, .13, .08] }, 1)
        .ball(brown, { at: [0, .4, 0], scale: [.11, .095, .1] }, 1)
        .ball(light, { at: [0, .4, .06], scale: [.085, .07, .05] }, 1)
        .ball("#f2c230", { at: [.035, .41, .1], scale: .022 }, 1)
        .ball("#f2c230", { at: [-.035, .41, .1], scale: .022 }, 1)
        .ball("#111111", { at: [.035, .41, .118], scale: .01 }, 0)
        .ball("#111111", { at: [-.035, .41, .118], scale: .01 }, 0)
        .cylinder("#3b3226", { at: [0, .385, .11], pitch: Math.PI * .65, scale: [.02, .035, .02] }, 4, .5, 0)
        .cylinder(dark, { at: [.06, .47, 0], roll: -.35, scale: [.04, .07, .03] }, 4, .5, 0)
        .cylinder(dark, { at: [-.06, .47, 0], roll: .35, scale: [.04, .07, .03] }, 4, .5, 0)
        .box(dark, { at: [0, .05, -.08], pitch: .3, scale: [.08, .1, .02] })
        .cylinder("#c9a24a", { at: [.04, 0, .03], scale: [.02, .04, .02] }, 4, .5, .5, false)
        .cylinder("#c9a24a", { at: [-.04, 0, .03], scale: [.02, .04, .02] }, 4, .5, .5, false)
        .build();
    const wing = new MeshBuilder()
        .box(brown, { at: [.16, 0, -.02], scale: [.32, .015, .2] })
        .box(dark, { at: [.24, .004, -.06], scale: [.14, .01, .06] })
        .box(light, { at: [.12, -.004, .03], scale: [.18, .01, .08] })
        .build();
    return { body, wing, shoulder: [.1, .3, 0], size: .55 };
}

export const BIRD_MODELS: Record<BirdKind, () => BirdModel> = { tiny: tinyModel, crow: crowModel, owl: owlModel };

/** Where a bird's parts go: its place, whether it flies, how far the wings are up (-1..1 in flight). */
export type BirdPose = { x: number; y: number; z: number; yaw: number; pitch?: number; roll?: number; flying: boolean; flap: number };

const scratch = mat4(), local = mat4(), lean = mat4();

/**
 * Puts the body and both wings of a bird at `pose`: the body at `index` of `body`, the wings at `index * 2`
 * and `index * 2 + 1` of `wings`. Folded the wings lie along the back (an owl's hang at its sides).
 */
export function poseBird(kind: BirdKind, model: BirdModel, pose: BirdPose, body: Batch, wings: Batch, index: number, scale = 1) {
    compose(scratch, 0, pose.x, pose.y, pose.z, pose.yaw, pose.pitch ?? 0, pose.roll ?? 0, scale);
    let [sx, sy, sz] = model.shoulder;
    // an owl flies leaning forward, near flat, its wings from where its shoulders went
    if (kind === "owl" && pose.flying)
    {
        compose(lean, 0, 0, .25, -.15, 0, 1.05, 0, 1);
        multiply(local, scratch, lean);
        body.matrix(index, local);
        [, sy, sz] = transformPoint(lean, [sx, sy, sz]);
    }
    else body.matrix(index, scratch);
    for (const side of [1, -1])
    {
        const flap = pose.flap * (kind === "tiny" ? 1.1 : .9);
        let yaw = 0, roll = flap, pitch = 0, size = 1;
        if (!pose.flying)
        {
            if (kind === "owl") { roll = -1.5; yaw = -.1; size = .65; }
            else { yaw = 1.45; roll = -.15; pitch = -.08; size = .9; }
        }
        compose(local, 0, sx * side, sy, sz, yaw * side, pitch, roll * side, size * side, size, size);
        multiply(local, scratch, local);
        wings.matrix(index * 2 + (side > 0 ? 0 : 1), local);
    }
}

// ------------------------------------------------------------------ flock

/** Where a bird can sit: on the ground, a tree's crown, a roof. */
type Spot = { x: number; y: number; z: number; tree: boolean };

type Bird = {
    kind: BirdKind;
    x: number; y: number; z: number; yaw: number; pitch: number; roll: number;
    state: "ground" | "perch" | "fly" | "circle" | "fall" | "dead";
    /** Seconds until it does something else. */
    wait: number;
    nextCall: number;
    phase: number;
    /** A flight: from, to, how far along (0..1), how long, how high the arc. */
    from: Vec3; to: Vec3; along: number; time: number; arc: number;
    /** Where it lands after the flight. */
    then: "ground" | "perch" | "circle";
    /** Circling: the middle, radius, angle, height. */
    centre: [number, number]; radius: number; angle: number; height: number;
    vy: number;
    tint: Vec3;
    /** The owl only shows at night. */
    away: boolean;
};

/** Each tiny bird's colour: sparrow browns, a greyer one, a reddish one. */
const TINTS: Vec3[] = [[.55, .4, .27], [.48, .36, .25], [.5, .5, .48], [.62, .38, .25], [.42, .33, .22]];
/** How near someone (metres) scares each kind off where it sits. */
const SHY: Record<BirdKind, number> = { tiny: 6, crow: 9, owl: 5 };
/** How big a target each is for an arrow (radius, metres). */
const TARGET: Record<BirdKind, number> = { tiny: .22, crow: .35, owl: .35 };
/** Metres a second in flight. */
const SPEED: Record<BirdKind, number> = { tiny: 7, crow: 8, owl: 6 };
/** Seconds between each one's calls, by day (crows and tiny birds) and night (the owl). */
const CALLS: Record<BirdKind, [number, number]> = { tiny: [40, 110], crow: [14, 40], owl: [7, 20] };
/** How lively the tiny birds sing at each time: a multiplier on how often. */
const SONG: Record<BirdTime, number> = { dawn: 1.5, noon: 1, sunset: .8, night: 0 };

export type BirdsSetting = { tiny?: number; crows?: number; owl?: boolean };

/**
 * The birds of one phone (not shared, each phone has its own): tiny birds in flocks on the ground that fly
 * up into the trees and onto roofs when someone comes near or an arrow lands close, crows circling high
 * that land on roofs and treetops now and then, and an owl in a tree at night. `onCall` is each call, in 3D
 * from the bird. An arrow through one drops it, silent. `update` every frame, `startle` where arrows land.
 */
export class Birds {
    /** A bird calls from `at`. */
    onCall: (call: BirdCall, at: Vec3, volume: number) => void = () => { };
    private birds: Bird[] = [];
    private batches = new Map<BirdKind, { body: Batch; wings: Batch; model: BirdModel; list: Bird[] }>();
    private spots: Spot[] = [];
    private time: BirdTime = "noon";
    private raining = false;

    constructor(private renderer: Renderer, private field: Field, setting: BirdsSetting = {}) {
        this.findSpots();
        const tiny = setting.tiny ?? 12, crows = setting.crows ?? 4;
        // tiny birds in flocks of 3 to 5 on the ground
        for (let made = 0; made < tiny;)
        {
            const [cx, cz] = this.groundSpot();
            const flock = Math.min(tiny - made, 3 + Math.floor(Math.random() * 3));
            for (let i = 0; i < flock; i++, made++)
            {
                const x = cx + (Math.random() - .5) * 2.5, z = cz + (Math.random() - .5) * 2.5;
                this.add("tiny", "ground", x, field.height(x, z), z);
            }
        }
        for (let i = 0; i < crows; i++)
        {
            const bird = this.add("crow", "circle", 0, 0, 0);
            this.circle(bird, true);
        }
        if (setting.owl ?? true)
        {
            const spot = this.treeSpot(0, 0, Infinity);
            if (spot) this.add("owl", "perch", spot.x, spot.y, spot.z).away = true;
        }
        for (const kind of ["tiny", "crow", "owl"] as BirdKind[])
        {
            const list = this.birds.filter(bird => bird.kind === kind);
            if (!list.length) continue;
            const model = BIRD_MODELS[kind]();
            const body = renderer.batch(model.body, { capacity: list.length, dynamic: true });
            const wings = renderer.batch(model.wing, { capacity: list.length * 2, dynamic: true, twoSided: true });
            // white tints to begin with, placed every frame
            for (const _ of list) { body.add(0, -100, 0); wings.add(0, -100, 0); wings.add(0, -100, 0); }
            this.batches.set(kind, { model, list, body, wings });
        }
    }

    /** The time of day: tiny birds sing most at dawn and sleep at night, the owl only comes out then. */
    setTime(time: BirdTime) {
        this.time = time;
        for (const bird of this.birds) if (bird.kind === "owl" && bird.state !== "dead") bird.away = time !== "night";
    }

    /** Rain: fewer calls. */
    rain(on: boolean) {
        this.raining = on;
    }

    /** Something loud at `at` (an arrow landing, a shot): the birds within `reach` metres take off. */
    startle(at: Vec3, reach = 9) {
        for (const bird of this.birds)
        {
            if (bird.away || (bird.state !== "ground" && bird.state !== "perch")) continue;
            if (Math.hypot(bird.x - at[0], bird.y - at[1], bird.z - at[2]) < reach * (bird.kind === "tiny" ? 1 : .7)) this.scare(bird, at[0], at[2]);
        }
    }

    /** Whether the segment `from → to` goes through a bird, which falls. */
    hit(from: Vec3, to: Vec3) {
        const dx = to[0] - from[0], dy = to[1] - from[1], dz = to[2] - from[2];
        const length2 = dx * dx + dy * dy + dz * dz || 1;
        for (const bird of this.birds)
        {
            if (bird.away || bird.state === "fall" || bird.state === "dead") continue;
            // the middle of its body, an owl's sits higher
            const cy = bird.y + (bird.kind === "tiny" ? .07 : bird.kind === "crow" ? .2 : .25);
            const t = Math.max(0, Math.min(1, ((bird.x - from[0]) * dx + (cy - from[1]) * dy + (bird.z - from[2]) * dz) / length2));
            const distance = Math.hypot(from[0] + dx * t - bird.x, from[1] + dy * t - cy, from[2] + dz * t - bird.z);
            if (distance > TARGET[bird.kind]) continue;
            bird.state = "fall";
            bird.vy = 0;
            bird.y = cy;
            // the rest of a flock nearby flies off
            this.startle([bird.x, bird.y, bird.z], 7);
            return true;
        }
        return false;
    }

    /** Moves them on by `dt` seconds. `near` is where people are, they keep away from them. */
    update(dt: number, near: { x: number; z: number }[]) {
        const song = SONG[this.time] * (this.raining ? .35 : 1);
        for (const bird of this.birds)
        {
            if (bird.away) continue;
            bird.phase += dt;
            switch (bird.state)
            {
                case "ground": this.onGround(bird, dt, near); break;
                case "perch": this.onPerch(bird, dt, near); break;
                case "fly": this.flying(bird, dt); break;
                case "circle": this.circling(bird, dt); break;
                case "fall": this.falling(bird, dt); break;
            }
            // calls: the owl at night, crows any time but night, tiny birds by the time of day
            if (bird.state === "fall" || bird.state === "dead") continue;
            const often = bird.kind === "tiny" ? song : bird.kind === "crow" ? (this.time === "night" ? 0 : this.raining ? .5 : 1) : 1;
            if (!often) continue;
            bird.nextCall -= dt * often;
            if (bird.nextCall > 0) continue;
            const [least, most] = CALLS[bird.kind];
            bird.nextCall = least + Math.random() * (most - least);
            // tiny birds in flight don't sing, crows caw in the air too
            if (bird.kind === "tiny" && bird.state === "fly") continue;
            this.onCall(bird.kind === "tiny" ? "bird" : bird.kind, [bird.x, bird.y + .2, bird.z], bird.kind === "tiny" ? .15 + Math.random() * .12 : bird.kind === "crow" ? .7 : 1);
        }
        this.draw();
    }

    destroy() {
        for (const { body, wings } of this.batches.values())
        {
            this.renderer.removeBatch(body);
            this.renderer.removeBatch(wings);
        }
        this.batches.clear();
    }

    // ------------------------------------------------------------------ what each does

    private add(kind: BirdKind, state: Bird["state"], x: number, y: number, z: number) {
        const bird: Bird = {
            kind, x, y, z, yaw: Math.random() * Math.PI * 2, pitch: 0, roll: 0, state,
            wait: 3 + Math.random() * 20, nextCall: Math.random() * CALLS[kind][1], phase: Math.random() * 10,
            from: [x, y, z], to: [x, y, z], along: 0, time: 1, arc: 0, then: "ground",
            centre: [0, 0], radius: 15, angle: 0, height: 20, vy: 0,
            tint: TINTS[Math.floor(Math.random() * TINTS.length)], away: false,
        };
        this.birds.push(bird);
        return bird;
    }

    /** Pecking about: a hop now and then, off when someone comes near, up into a tree after a while. */
    private onGround(bird: Bird, dt: number, near: { x: number; z: number }[]) {
        const threat = this.threat(bird, near);
        if (threat) return this.scare(bird, threat.x, threat.z);
        bird.wait -= dt;
        // a hop: a short step and a turn
        if (Math.random() < dt * .8)
        {
            bird.yaw += (Math.random() - .5) * 2;
            const x = bird.x + Math.sin(bird.yaw) * .15, z = bird.z + Math.cos(bird.yaw) * .15;
            if (Math.hypot(x, z) < this.field.radius - 2 && this.field.open(x, z)) { bird.x = x; bird.z = z; }
        }
        bird.y = this.field.height(bird.x, bird.z);
        // pecking: the body dips
        bird.pitch = Math.sin(bird.phase * 9) > .7 ? .5 : 0;
        if (bird.wait <= 0) this.toPerch(bird, this.perchNear(bird, 25));
    }

    /** Sitting in a tree or on a roof: off when someone comes near, then down to the ground or up circling. */
    private onPerch(bird: Bird, dt: number, near: { x: number; z: number }[]) {
        bird.pitch = 0;
        const threat = this.threat(bird, near);
        if (threat) return this.scare(bird, threat.x, threat.z);
        bird.wait -= dt;
        if (Math.random() < dt * .3) bird.yaw += (Math.random() - .5) * 1.5;
        if (bird.wait > 0) return;
        if (bird.kind === "crow") this.circle(bird);
        else if (bird.kind === "owl") this.toPerch(bird, this.treeSpot(bird.x, bird.z, 30));
        else this.toGround(bird);
    }

    private flying(bird: Bird, dt: number) {
        bird.along = Math.min(1, bird.along + dt / bird.time);
        const t = bird.along;
        // eased at both ends, up in an arc in between
        const s = t * t * (3 - 2 * t);
        const x = bird.from[0] + (bird.to[0] - bird.from[0]) * s;
        const z = bird.from[2] + (bird.to[2] - bird.from[2]) * s;
        const y = bird.from[1] + (bird.to[1] - bird.from[1]) * s + Math.sin(t * Math.PI) * bird.arc;
        const dx = x - bird.x, dy = y - bird.y, dz = z - bird.z;
        if (Math.hypot(dx, dz) > 1e-4) bird.yaw = Math.atan2(dx, dz);
        bird.pitch = Math.max(-.6, Math.min(.6, -Math.atan2(dy, Math.hypot(dx, dz) || 1e-4) * .7));
        bird.roll = 0;
        bird.x = x; bird.y = y; bird.z = z;
        if (t < 1) return;
        bird.pitch = 0;
        if (bird.then === "circle") return this.circle(bird, true);
        bird.state = bird.then;
        bird.wait = bird.kind === "crow" ? 15 + Math.random() * 30 : bird.kind === "owl" ? 60 + Math.random() * 120 : bird.then === "perch" ? 8 + Math.random() * 25 : 15 + Math.random() * 40;
    }

    /** Round and round high up, gliding, now and then down onto a roof or a treetop. */
    private circling(bird: Bird, dt: number) {
        bird.angle += SPEED.crow * .75 / bird.radius * dt;
        const x = bird.centre[0] + Math.cos(bird.angle) * bird.radius, z = bird.centre[1] + Math.sin(bird.angle) * bird.radius;
        bird.yaw = Math.atan2(x - bird.x, z - bird.z);
        bird.x = x; bird.z = z;
        bird.y = bird.height + Math.sin(bird.phase * .4) * 1.5;
        bird.roll = -.3;
        bird.pitch = 0;
        bird.wait -= dt;
        if (bird.wait <= 0) this.toPerch(bird, this.perchNear(bird, 40, true));
    }

    private falling(bird: Bird, dt: number) {
        bird.vy -= 9.8 * dt;
        bird.y += bird.vy * dt;
        bird.roll += dt * 6;
        bird.pitch = .3;
        const ground = this.field.roof(bird.x, bird.z);
        if (bird.y > ground) return;
        bird.y = ground;
        bird.state = "dead";
        bird.roll = Math.PI / 2;
        bird.pitch = 0;
    }

    /** Off and away from `fromX, fromZ`: tiny birds up into a tree or onto a roof, crows up circling. */
    private scare(bird: Bird, fromX: number, fromZ: number) {
        if (bird.kind === "crow") return this.circle(bird);
        const away = Math.atan2(bird.x - fromX, bird.z - fromZ);
        const ahead = { x: bird.x + Math.sin(away) * 15, z: bird.z + Math.cos(away) * 15 };
        const spot = bird.kind === "owl" ? this.treeSpot(ahead.x, ahead.z, 35, bird) : this.perchNear(ahead, 20, false, bird);
        this.toPerch(bird, spot);
    }

    private toPerch(bird: Bird, spot: Spot | null) {
        if (!spot) return this.toGround(bird);
        this.flyTo(bird, [spot.x, spot.y, spot.z], "perch");
    }

    private toGround(bird: Bird) {
        if (bird.kind === "crow") return this.circle(bird);
        const [x, z] = this.groundSpot(bird.x, bird.z, 20);
        this.flyTo(bird, [x, this.field.height(x, z), z], "ground");
    }

    /** Up from where it is into a circle somewhere over the field. */
    private circle(bird: Bird, now = false) {
        const r = this.field.radius;
        const angle = Math.random() * Math.PI * 2, out = Math.random() * r * .6;
        bird.centre = [Math.cos(angle) * out, Math.sin(angle) * out];
        bird.radius = 10 + Math.random() * 15;
        bird.height = 18 + Math.random() * 10;
        bird.wait = 20 + Math.random() * 40;
        const start = Math.random() * Math.PI * 2;
        bird.angle = start;
        const at: Vec3 = [bird.centre[0] + Math.cos(start) * bird.radius, bird.height, bird.centre[1] + Math.sin(start) * bird.radius];
        if (now)
        {
            bird.state = "circle";
            [bird.x, bird.y, bird.z] = at;
            return;
        }
        this.flyTo(bird, at, "circle");
    }

    private flyTo(bird: Bird, to: Vec3, then: Bird["then"]) {
        bird.from = [bird.x, bird.y, bird.z];
        bird.to = to;
        bird.along = 0;
        const distance = Math.hypot(to[0] - bird.x, to[1] - bird.y, to[2] - bird.z);
        bird.time = Math.max(.6, distance / SPEED[bird.kind]);
        bird.arc = Math.min(6, 1 + distance * .15);
        bird.then = then;
        bird.state = "fly";
    }

    /** The nearest person within its shyness, or null. */
    private threat(bird: Bird, near: { x: number; z: number }[]) {
        const shy = SHY[bird.kind] * (bird.state === "perch" ? .7 : 1);
        for (const one of near) if (Math.hypot(one.x - bird.x, one.z - bird.z) < shy) return one;
        return null;
    }

    // ------------------------------------------------------------------ places

    /** The crowns of the trees and the roofs, where birds sit. */
    private findSpots() {
        const { field } = this;
        // the top of each tree kind's crown, in metres at scale 1 (`models.ts`)
        const tops = [3.9, 4.1, 4.3];
        for (const tree of [...field.trees, ...field.wall.filter(tree => Math.hypot(tree.x, tree.z) < field.radius + 5)])
            this.spots.push({ x: tree.x, y: field.height(tree.x, tree.z) - .1 + tops[tree.kind] * tree.scale - .15, z: tree.z, tree: true });
        for (const block of field.blocks)
        {
            if (block.floor || block.rail || block.top - field.height(block.x, block.z) < 2.5) continue;
            this.spots.push({ x: block.x, y: block.top, z: block.z, tree: false });
        }
    }

    /** A spot within `reach` of the bird, a free one, a crow's up high. Null when none. */
    private perchNear(bird: { x: number; z: number }, reach: number, high = false, self?: Bird) {
        const free = this.spots.filter(spot => Math.hypot(spot.x - bird.x, spot.z - bird.z) < reach && !this.taken(spot, self));
        if (!free.length) return null;
        const spot = free[Math.floor(Math.random() * free.length)];
        // tiny birds spread over the crown, not all on its top
        if (spot.tree && !high)
        {
            const angle = Math.random() * Math.PI * 2;
            return { ...spot, x: spot.x + Math.cos(angle) * .6, y: spot.y - .4, z: spot.z + Math.sin(angle) * .6 };
        }
        return spot;
    }

    /** A tree for the owl, in the side of its crown. */
    private treeSpot(x: number, z: number, reach: number, self?: Bird) {
        const trees = this.spots.filter(spot => spot.tree && Math.hypot(spot.x - x, spot.z - z) < reach && !this.taken(spot, self));
        if (!trees.length) return null;
        const spot = trees[Math.floor(Math.random() * trees.length)];
        const angle = Math.random() * Math.PI * 2;
        return { ...spot, x: spot.x + Math.cos(angle) * .9, y: spot.y - 1.3, z: spot.z + Math.sin(angle) * .9 };
    }

    /** Whether another bird is heading for or sitting at `spot` (a crown holds a few tiny birds). */
    private taken(spot: Spot, self?: Bird) {
        let count = 0;
        for (const bird of this.birds)
        {
            if (bird === self || bird.state === "dead") continue;
            const [x, z] = bird.state === "fly" ? [bird.to[0], bird.to[2]] : [bird.x, bird.z];
            if (Math.hypot(x - spot.x, z - spot.z) < 1.5) count += bird.kind === "tiny" ? 1 : 3;
        }
        return count >= 3;
    }

    /** Somewhere open in the meadow, near `x, z` if given. */
    private groundSpot(x?: number, z?: number, reach = 20): [number, number] {
        const r = this.field.radius - 3;
        for (let tries = 0; tries < 40; tries++)
        {
            const angle = Math.random() * Math.PI * 2;
            const distance = x === undefined ? Math.sqrt(Math.random()) * r : Math.random() * reach;
            const px = (x ?? 0) + Math.cos(angle) * distance, pz = (z ?? 0) + Math.sin(angle) * distance;
            if (Math.hypot(px, pz) < r && this.field.open(px, pz, 1) && !this.field.depth(px, pz)) return [px, pz];
        }
        return [x ?? 0, z ?? 0];
    }

    // ------------------------------------------------------------------ drawing

    private draw() {
        for (const [kind, { body, wings, model, list }] of this.batches)
        {
            list.forEach((bird, i) => {
                const flying = bird.state === "fly" || bird.state === "circle";
                // fast beats for tiny birds, slow ones for the others, crows glide while circling with a beat now and then
                const beat = kind === "tiny" ? 28 : kind === "crow" ? 9 : 7;
                let flap = Math.sin(bird.phase * beat);
                if (bird.state === "circle") flap = Math.sin(bird.phase * .5) > .6 ? flap : .15 + Math.sin(bird.phase * 1.3) * .05;
                if (bird.state === "fall") flap = Math.sin(bird.phase * 20) * .5;
                const pose: BirdPose = { x: bird.x, y: bird.y, z: bird.z, yaw: bird.yaw, pitch: bird.pitch, roll: bird.roll, flying: flying || bird.state === "fall", flap };
                // the owl by day is hidden
                poseBird(kind, model, pose, body, wings, i, bird.away ? 0 : 1);
                if (kind === "tiny")
                {
                    body.tint(i, bird.tint);
                    wings.tint(i * 2, bird.tint);
                    wings.tint(i * 2 + 1, bird.tint);
                }
            });
        }
    }
}
