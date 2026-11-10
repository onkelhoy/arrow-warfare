import type { Camera } from "@papit/game-engine";
import type { Draw } from "@arrow-warfare/archery";
import { compose, mat4, multiply, type Batch, type Renderer, type Rigged, type Vec3 } from "@arrow-warfare/render";
import { arrow, ARROW_LENGTH, beam, bow, BOW, GUN_FILES, hand, type GunKind } from "@arrow-warfare/world";

/** Camera space: x right, y up, -z ahead. Where the grip is held, lowered and up for a shot. */
const LOW = { at: [.24, -.36, -.5] as Vec3, yaw: .35, pitch: .1, roll: -1.05 };
const AIM = { at: [.1, -.1, -.76] as Vec3, yaw: 0, pitch: 0, roll: -.15 };
/** How far up the bow comes the moment a draw starts, the pull brings it the rest of the way. */
const START = .2;
/** Metres ahead where the nocked arrow points: the middle of the view, so the shot goes where I look. */
const CONVERGE = 30;
/** How far behind the tips the nock comes at a full draw, in bow space. */
const PULL = .2;
/** Where the bow arm comes from, for a right handed archer: low on the right, like the bow. */
const SHOULDER: Vec3 = [.3, -.68, -.4];
/** Upper arm and forearm in camera space, a little longer than the body's so they reach. */
const UPPER = .34, FOREARM = .32;
/** The shirt's cuff at the wrist. */
const CUFF: Vec3 = [.94, .89, .78];
/**
 * Camera space, where a gun's grip is held: the revolver out in front in both hands, the rifle's butt in the
 * shoulder. `low` is the drop while walking and after dying. Both aim at `GUN_CONVERGE` ahead in the middle.
 */
const GUN_HOLD: Record<GunKind, { at: Vec3; second: Vec3 }> = {
    revolver: { at: [.17, -.23, -.47], second: [.14, -.28, -.45] },
    rifle: { at: [.13, -.19, -.2], second: [0, 0, 0] },
};
const GUN_CONVERGE = 40;
/** Aimed: the grip in the middle, low enough that the sights line up under the eye. */
const GUN_AIM: Record<GunKind, Vec3> = { revolver: [0, -.14, -.38], rifle: [0, -.135, -.3] };

/**
 * My own bow and hands in front of the camera, drawn last so they never go into a tree. The string comes
 * back and the limbs bend with the draw, it follows the sway, bobs with the walk, kicks on a shot.
 */
export class FirstPerson {
    private bow: Batch;
    private string: Batch;
    private arrow: Batch;
    private hands: Batch;
    private arms: Batch;
    private raise = 0;
    private kick = 0;
    private clock = 0;
    private local = mat4();
    private world = mat4();
    /** The camera this frame. */
    private cameraMatrix: ArrayLike<number> = mat4();
    /** With a gun instead of the bow: its pieces, one batch each. */
    private gun: { kind: GunKind; model: Rigged; batches: Batch[]; fired: number; reloading: number } | null = null;
    private piece = mat4();
    private gunMatrix = mat4();

    constructor(private renderer: Renderer, private skin: Vec3, private clothes: Vec3, private feathers: Vec3) {
        const front = { capacity: 6, dynamic: true, front: true };
        this.bow = renderer.batch(bow(), front);
        this.string = renderer.batch(beam(3), front);
        this.arrow = renderer.batch(arrow(), front);
        this.hands = renderer.batch(hand(), front);
        this.arms = renderer.batch(beam(6), front);
    }

    /** Not drawn: the camera is somewhere else (the kill cam, watching someone). */
    hidden = false;

    /** Where the nocked arrow's tip is and where it points, in the world, while drawing. */
    release: { from: Vec3; direction: Vec3 } | null = null;

    /** The string snaps forward and the bow jumps (or the gun kicks and plays its shot). */
    shot() {
        this.kick = 1;
        if (this.gun) this.gun.fired = 0;
    }

    /** A gun instead of the bow, once its model is in. */
    arm(kind: GunKind, model: Rigged) {
        const front = { capacity: 1, dynamic: true, front: true };
        this.gun = { kind, model, batches: model.parts.map(part => this.renderer.batch(part.mesh, front)), fired: Infinity, reloading: -1 };
        for (const batch of this.gun.batches) batch.tint(0, [1, 1, 1]);
    }

    /** 0..1 through a reload (the model plays it), -1 when not reloading. */
    reloading(progress: number) {
        if (this.gun) this.gun.reloading = progress;
    }

    /** 0..1 how far a gun is up at the eye, aiming. */
    aim = 0;

    /** Where a gun's bullet leaves from and where it goes, in the world. */
    muzzle: { from: Vec3; direction: Vec3 } | null = null;

    private updateGun(dt: number, camera: Camera, walk: { speed: number; stride: number; alive: boolean }, left: boolean) {
        const gun = this.gun!;
        const side = left ? -1 : 1;
        const spec = GUN_FILES[gun.kind];
        const hold = GUN_HOLD[gun.kind];
        const all = [this.bow, this.string, this.arrow, this.hands, this.arms];
        for (const batch of [this.bow, this.string, this.arrow]) batch.count = 0;
        // dead: the gun drops out of view
        this.raise += ((walk.alive ? 0 : -1) - this.raise) * (1 - Math.exp(-dt * 6));
        this.kick = Math.max(0, this.kick - dt * 5);
        gun.fired += dt;
        if (this.raise < -.6 || this.hidden)
        {
            for (const batch of [...all, ...gun.batches]) batch.count = 0;
            this.muzzle = null;
            return;
        }
        const bob = Math.min(1, walk.speed / 4) * (1 - this.aim * .7);
        const aimed = GUN_AIM[gun.kind], a = this.aim;
        const base: Vec3 = [hold.at[0] * side + (aimed[0] - hold.at[0] * side) * a, hold.at[1] + (aimed[1] - hold.at[1]) * a, hold.at[2] + (aimed[2] - hold.at[2]) * a];
        // a reload takes the gun down and in a little
        const down = gun.reloading >= 0 ? Math.sin(Math.min(1, gun.reloading) * Math.PI) : 0;
        const at: Vec3 = [
            base[0] + Math.cos(walk.stride) * .01 * bob - down * .04 * side,
            base[1] - Math.abs(Math.sin(walk.stride)) * .014 * bob + Math.min(0, this.raise) * .4 - down * .05,
            base[2] + this.kick * this.kick * .06,
        ];
        // the muzzle at the middle of the view, far ahead; the kick tips it up
        const scale = spec.scale;
        const grip = spec.grip, muzzle = spec.muzzle;
        const aimYaw = Math.atan2(at[0], GUN_CONVERGE), aimPitch = Math.atan2(-at[1], GUN_CONVERGE);
        const yaw = aimYaw, pitch = aimPitch + this.kick * this.kick * .25 + down * .5, roll = down * -.6 * side;
        // place: the grip point at `at`
        compose(this.local, 0, 0, 0, 0, yaw, pitch, roll, scale);
        const gx = this.local[0] * grip[0] + this.local[4] * grip[1] + this.local[8] * grip[2];
        const gy = this.local[1] * grip[0] + this.local[5] * grip[1] + this.local[9] * grip[2];
        const gz = this.local[2] * grip[0] + this.local[6] * grip[1] + this.local[10] * grip[2];
        compose(this.local, 0, at[0] - gx, at[1] - gy, at[2] - gz, yaw, pitch, roll, scale);
        this.cameraMatrix = camera.worldMatrix;
        multiply(this.gunMatrix, this.cameraMatrix, this.local);

        // the model's own animation: its shot, played over the time between shots, or the reload
        const duration = (name: string) => gun.model.duration(name);
        if (gun.reloading >= 0) gun.model.pose(spec.reload, gun.reloading * duration(spec.reload));
        else if (gun.fired < duration(spec.fire)) gun.model.pose(spec.fire, gun.fired * (gun.kind === "rifle" ? 2 : 1));
        else gun.model.pose(null, 0);
        gun.batches.forEach((batch, i) => {
            batch.matrix(0, multiply(this.world, this.gunMatrix, gun.model.matrix(this.piece, i)));
            batch.count = 1;
        });

        const inGun = (p: readonly number[]): Vec3 => point(this.local, [p[0], p[1], p[2]]);
        const from = point(this.cameraMatrix, inGun(muzzle));
        const to = point(this.cameraMatrix, [0, 0, -GUN_CONVERGE]);
        const reach = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]) || 1;
        this.muzzle = { from, direction: [(to[0] - from[0]) / reach, (to[1] - from[1]) / reach, (to[2] - from[2]) / reach] };

        // the trigger hand on the grip, the other under it (revolver) or on the fore end (rifle)
        const trigger = inGun(grip);
        const other: Vec3 = spec.fore ? inGun(spec.fore) : [hold.second[0] * side + (at[0] - hold.at[0] * side), hold.second[1] + (at[1] - hold.at[1]), hold.second[2] + (at[2] - hold.at[2])];
        // aimed, the revolver's other hand cups the grip from below
        if (!spec.fore) { other[0] += (trigger[0] - .02 * side - other[0]) * a; other[1] += (trigger[1] - .03 - other[1]) * a; other[2] += (trigger[2] + .01 - other[2]) * a; }
        this.place(this.hands, 0, trigger, this.skin);
        this.place(this.hands, 1, other, this.skin);
        let arms = this.limb(0, [SHOULDER[0] * side, SHOULDER[1], SHOULDER[2]], trigger, [side, -1, .3]);
        arms = this.limb(arms, [-SHOULDER[0] * side, SHOULDER[1], SHOULDER[2]], other, [-side, -1, .3]);
        this.hands.count = 2;
        this.arms.count = arms;
    }

    /** `left`: left handed, the bow in the right hand, everything mirrored. */
    update(dt: number, camera: Camera, draw: Draw, walk: { speed: number; stride: number; alive: boolean }, arrows: number, left = false) {
        if (this.gun) return this.updateGun(dt, camera, walk, left);
        const side = left ? -1 : 1;
        this.clock += dt;
        const drawing = draw.phase === "drawing";
        // the pull lifts the bow from low on my side in towards the middle, upright
        const target = !walk.alive ? -1 : drawing ? START + (1 - START) * draw.amount : draw.phase === "panting" ? -.2 : 0;
        this.raise += (target - this.raise) * (1 - Math.exp(-dt * (drawing ? 12 : 6)));
        this.kick = Math.max(0, this.kick - dt * 4);
        const all = [this.bow, this.string, this.arrow, this.hands, this.arms];
        if (this.raise < -.6 || this.hidden)
        {
            for (const batch of all) batch.count = 0;
            return;
        }

        const r = Math.max(0, this.raise);
        const low = Math.min(0, this.raise);
        const amount = drawing ? draw.amount : 0;
        const bob = Math.min(1, walk.speed / 4) * (1 - r * .7);
        const at: Vec3 = [
            (LOW.at[0] + (AIM.at[0] - LOW.at[0]) * r) * side + Math.cos(walk.stride) * .012 * bob,
            LOW.at[1] + (AIM.at[1] - LOW.at[1]) * r - Math.abs(Math.sin(walk.stride)) * .018 * bob + low * .4,
            LOW.at[2] + (AIM.at[2] - LOW.at[2]) * r + this.kick * this.kick * -.05,
        ];
        // tired arms shake a little on top of the sway the camera already has
        const tremble = draw.tired * amount * .006;
        const yaw = (LOW.yaw + (AIM.yaw - LOW.yaw) * r) * side + Math.sin(this.clock * 31) * tremble;
        const pitch = LOW.pitch + (AIM.pitch - LOW.pitch) * r + Math.sin(this.clock * 27 + 1) * tremble;
        // diagonal low on the right, nearly upright drawn: mirrored for the left handed
        const roll = (LOW.roll + (AIM.roll - LOW.roll) * r) * side;
        // drawn, the limbs bend back and get a touch shorter
        const bend = 1 + amount * .9, shorter = 1 - amount * .06;

        this.cameraMatrix = camera.worldMatrix;
        const grip = mat4();
        compose(grip, 0, at[0], at[1], at[2], yaw, pitch, roll);
        const inBow = (x: number, y: number, z: number): Vec3 => point(grip, [x, y, z]);

        compose(this.local, 0, at[0], at[1], at[2], yaw, pitch, roll, 1, shorter, bend);
        this.bow.matrix(0, multiply(this.world, this.cameraMatrix, this.local));
        this.bow.tint(0, [1, 1, 1]);
        this.bow.count = 1;

        // the string, tip to nock to tip, quivering after a shot
        const quiver = Math.sin(this.clock * 70) * .02 * this.kick;
        const tipZ = BOW.tip * bend;
        const nock = inBow(0, 0, tipZ + PULL * amount + quiver);
        const top = inBow(0, BOW.half * shorter, tipZ), bottom = inBow(0, -BOW.half * shorter, tipZ);
        this.beam(this.string, 0, top, nock, .006, [.93, .9, .82]);
        this.beam(this.string, 1, nock, bottom, .006, [.93, .9, .82]);
        this.string.count = 2;

        // the arrow on the string while drawing
        const nocked = drawing && arrows > 0;
        if (nocked)
        {
            // the nock on the string, the tip pointing at where I look: the shot leaves from here
            const back = inBow(-.018 * side, .012, tipZ + PULL * amount);
            const dx = -back[0], dy = -back[1], dz = -CONVERGE - back[2];
            const length = Math.hypot(dx, dy, dz);
            const tip: Vec3 = [back[0] + dx / length * ARROW_LENGTH, back[1] + dy / length * ARROW_LENGTH, back[2] + dz / length * ARROW_LENGTH];
            this.beam(this.arrow, 0, tip, back, 1, this.feathers, true);
            const from = point(this.cameraMatrix, tip), to = point(this.cameraMatrix, [tip[0] + dx, tip[1] + dy, tip[2] + dz]);
            const reach = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
            this.release = { from, direction: [(to[0] - from[0]) / reach, (to[1] - from[1]) / reach, (to[2] - from[2]) / reach] };
        }
        else this.release = null;
        this.arrow.count = nocked ? 1 : 0;

        // the bow hand on the grip, its arm from low at the side, bent at the elbow
        const hold = inBow(.01 * side, 0, .02);
        this.place(this.hands, 0, hold, this.skin);
        const arms = this.limb(0, [SHOULDER[0] * side, SHOULDER[1], SHOULDER[2]], hold, [side, -1, .3]);
        const hands = 1;
        // the other hand on the string is right at the eye when drawn, too close to show
        this.arms.count = arms;
        this.hands.count = hands;
    }

    /**
     * An arm from `shoulder` to `hand` in camera space: upper arm and forearm in the clothes, a cuff at the
     * wrist, the elbow pushed towards `pole`. Returns the next free arm index.
     */
    private limb(index: number, shoulder: Vec3, hand: Vec3, pole: Vec3) {
        const dx = hand[0] - shoulder[0], dy = hand[1] - shoulder[1], dz = hand[2] - shoulder[2];
        const reach = Math.hypot(dx, dy, dz) || 1e-6;
        const along = Math.min(reach, UPPER + FOREARM - 1e-3);
        // how far along and how far out the elbow is, from the two lengths
        const a = (UPPER * UPPER - FOREARM * FOREARM + along * along) / (2 * along);
        const out = Math.sqrt(Math.max(0, UPPER * UPPER - a * a));
        const u: Vec3 = [dx / reach, dy / reach, dz / reach];
        const dot = pole[0] * u[0] + pole[1] * u[1] + pole[2] * u[2];
        const side: Vec3 = [pole[0] - u[0] * dot, pole[1] - u[1] * dot, pole[2] - u[2] * dot];
        const length = Math.hypot(...side) || 1;
        const elbow: Vec3 = [
            shoulder[0] + u[0] * a + side[0] / length * out,
            shoulder[1] + u[1] * a + side[1] / length * out,
            shoulder[2] + u[2] * a + side[2] / length * out,
        ];
        this.beam(this.arms, index++, shoulder, elbow, .066, this.clothes);
        this.beam(this.arms, index++, elbow, hand, .052, this.clothes);
        this.beam(this.arms, index++, lerp(elbow, hand, .8), lerp(elbow, hand, .9), .06, CUFF);
        return index;
    }

    destroy() {
        for (const batch of [this.bow, this.string, this.arrow, this.hands, this.arms, ...(this.gun?.batches ?? [])]) this.renderer.removeBatch(batch);
    }

    private place(batch: Batch, index: number, at: Vec3, tint: Vec3) {
        compose(this.local, 0, at[0], at[1], at[2]);
        batch.matrix(index, multiply(this.world, this.cameraMatrix, this.local));
        batch.tint(index, tint);
    }

    /** A beam (or, with `whole`, an arrow at its real length) from camera space `from` to `to`. */
    private beam(batch: Batch, index: number, from: Vec3, to: Vec3, thickness: number, tint: Vec3, whole = false) {
        const dx = to[0] - from[0], dy = to[1] - from[1], dz = to[2] - from[2];
        const length = Math.hypot(dx, dy, dz) || 1e-6;
        // the beam runs along -z: point -z from `from` to `to`
        const yaw = Math.atan2(-dx, -dz), pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
        if (whole) compose(this.local, 0, from[0], from[1], from[2], yaw + Math.PI, -pitch);
        else compose(this.local, 0, from[0], from[1], from[2], yaw, pitch, 0, thickness, thickness, length);
        batch.matrix(index, multiply(this.world, this.cameraMatrix, this.local));
        batch.tint(index, tint);
    }

}

function lerp(a: Vec3, b: Vec3, t: number): Vec3 {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** A point through a matrix. */
function point(m: ArrayLike<number>, [x, y, z]: Vec3): Vec3 {
    return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
}
