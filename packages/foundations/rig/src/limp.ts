import { Ragdoll, type Vec } from "@arrow-warfare/ragdoll";

/** The dead body's points, in the world. */
export const LIMP_STICKS = [
    // the torso, braced so it stays a box
    ["pelvis", "chest"], ["lShoulder", "rShoulder"], ["lShoulder", "chest"], ["rShoulder", "chest"],
    ["lShoulder", "pelvis"], ["rShoulder", "pelvis"], ["lHip", "rHip"], ["lHip", "chest"], ["rHip", "chest"],
    ["pelvis", "lHip"], ["pelvis", "rHip"], ["lShoulder", "rHip"], ["rShoulder", "lHip"],
    // the head on a stiff neck
    ["head", "chest"], ["head", "lShoulder"], ["head", "rShoulder"], ["head", "pelvis"],
    // limbs
    ["lShoulder", "lElbow"], ["lElbow", "lHand"], ["rShoulder", "rElbow"], ["rElbow", "rHand"],
    ["lHip", "lKnee"], ["lKnee", "lFoot"], ["rHip", "rKnee"], ["rKnee", "rFoot"],
] as const;
export type LimpPoint = typeof LIMP_STICKS[number][number];

const RADIUS: Partial<Record<LimpPoint, number>> = { head: .24, chest: .24, pelvis: .2, lShoulder: .1, rShoulder: .1, lHip: .07, rHip: .07, lHand: .05, rHand: .05, lFoot: .05, rFoot: .05 };

/** The point an arrow in a part pushes. */
export const PUSHED: Record<string, LimpPoint> = {
    head: "head", torso: "chest",
    leftArm: "lElbow", leftForearm: "lHand", rightArm: "rElbow", rightForearm: "rHand",
    leftThigh: "lKnee", leftShin: "lFoot", rightThigh: "rKnee", rightShin: "rFoot",
};

/** What killed them: the part, the arrow's way in the world, its power 0..1. */
export type Blow = { part: string; direction: Vec; power: number };

export function limp(start: Record<LimpPoint, Vec>, ground: (x: number, z: number) => number, moving: Vec, blow: Blow | null) {
    const doll = new Ragdoll<LimpPoint>(start, LIMP_STICKS, ground, { radius: RADIUS as Record<string, number>, sink: .04 });
    doll.moving(moving);
    if (blow)
    {
        const [dx, dy, dz] = blow.direction;
        const length = Math.hypot(dx, dy, dz) || 1;
        const k = (3 + blow.power * 9) / length;
        // the arrow throws the part it hit, the whole body goes along some, a little up off the feet
        doll.push(PUSHED[blow.part] ?? "chest", [dx * k, Math.max(dy * k, 0) + 1, dz * k]);
        for (const name of Object.keys(start) as LimpPoint[]) doll.push(name, [dx * k * .45, 1.2 + blow.power, dz * k * .45]);
        doll.push("lFoot", [-dx * k * .1, 0, -dz * k * .1]);
        doll.push("rFoot", [-dx * k * .1, 0, -dz * k * .1]);
    }
    return doll;
}

/** A frame at `at` with x along `x` (normalised) and y as near `up` as it can, into `out` (column major). */
export function frame(out: Float32Array | number[], at: Vec, x: Vec, up: Vec, xScale = 1) {
    let [ax, ay, az] = x;
    const l = Math.hypot(ax, ay, az) || 1;
    ax /= l; ay /= l; az /= l;
    // y: up without its x part
    const d = up[0] * ax + up[1] * ay + up[2] * az;
    let yx = up[0] - ax * d, yy = up[1] - ay * d, yz = up[2] - az * d;
    let m = Math.hypot(yx, yy, yz);
    if (m < 1e-5)
    {
        // up is along x: any other way
        yx = -ay; yy = ax; yz = 0;
        m = Math.hypot(yx, yy, yz) || 1;
    }
    yx /= m; yy /= m; yz /= m;
    const zx = ay * yz - az * yy, zy = az * yx - ax * yz, zz = ax * yy - ay * yx;
    out[0] = ax * xScale; out[1] = ay * xScale; out[2] = az * xScale; out[3] = 0;
    out[4] = yx; out[5] = yy; out[6] = yz; out[7] = 0;
    out[8] = zx; out[9] = zy; out[10] = zz; out[11] = 0;
    out[12] = at[0]; out[13] = at[1]; out[14] = at[2]; out[15] = 1;
    return out;
}
