/**
 * Where a player can be hit: capsules in the body's own space (feet at 0, facing -z, right is +x). They
 * follow the body as it's placed, tipping over included. The rig gives them from its bones, `CAPSULES`
 * is the body standing still.
 */

export type Zone = "head" | "torso" | "leftArm" | "rightArm" | "leftLeg" | "rightLeg";
export const ZONES: Zone[] = ["head", "torso", "leftArm", "rightArm", "leftLeg", "rightLeg"];

export type Vec = [number, number, number];
/** `part` names the bone it's on, a stuck arrow rides along with it. */
export type Capsule = { zone: Zone; part?: string; a: Vec; b: Vec; radius: number };

export const CAPSULES: Capsule[] = [
    { zone: "head", a: [0, 1.17, 0], b: [0, 1.3, 0], radius: .25 },
    { zone: "torso", a: [0, .32, 0], b: [0, .92, 0], radius: .3 },
    { zone: "leftArm", a: [-.36, .88, 0], b: [-.62, .45, 0], radius: .09 },
    { zone: "rightArm", a: [.36, .88, 0], b: [.62, .45, 0], radius: .09 },
    { zone: "leftLeg", a: [-.13, 0, 0], b: [-.13, .3, 0], radius: .1 },
    { zone: "rightLeg", a: [.13, 0, 0], b: [.13, .3, 0], radius: .1 },
];

/** A body in the world: feet at x y z, turned by yaw, tipped back by `tip` radians when dead. */
export type BodyPlace = { x: number; y: number; z: number; yaw: number; tip?: number };

/** A point (or with `w` 0 a direction) from body space to the world. */
export function toWorld(place: BodyPlace, local: Vec, w = 1): Vec {
    const [lx, ly, lz] = local;
    const tip = place.tip ?? 0;
    // tip around the body's x (the top goes to +z, backwards), then yaw around y
    const ct = Math.cos(tip), st = Math.sin(tip);
    const y1 = ly * ct - lz * st, z1 = ly * st + lz * ct;
    const cy = Math.cos(place.yaw), sy = Math.sin(place.yaw);
    return [cy * lx + sy * z1 + place.x * w, y1 + place.y * w, -sy * lx + cy * z1 + place.z * w];
}

/** The other way. */
export function toLocal(place: BodyPlace, world: Vec, w = 1): Vec {
    const dx = world[0] - place.x * w, dy = world[1] - place.y * w, dz = world[2] - place.z * w;
    const cy = Math.cos(place.yaw), sy = Math.sin(place.yaw);
    const lx = cy * dx - sy * dz, z1 = sy * dx + cy * dz;
    const tip = place.tip ?? 0;
    const ct = Math.cos(tip), st = Math.sin(tip);
    return [lx, dy * ct + z1 * st, -dy * st + z1 * ct];
}

export type BodyHit = { zone: Zone; part: string; t: number; point: Vec; direction: Vec };

/**
 * The first capsule the segment `from → to` goes through, `t` 0..1 along it. `point` and `direction` are in
 * body space, so a stuck arrow can ride along.
 */
export function hitBody(place: BodyPlace, from: Vec, to: Vec, capsules: Capsule[] = CAPSULES): BodyHit | null {
    const a = toLocal(place, from), b = toLocal(place, to);
    // far away: skip the capsules
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2 - .7, mz = (a[2] + b[2]) / 2;
    const half = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / 2;
    if (Math.hypot(mx, my, mz) > half + 1.2) return null;

    let best: BodyHit | null = null;
    for (const capsule of capsules)
    {
        const [s, , distance] = closest(a, b, capsule.a, capsule.b);
        if (distance > capsule.radius || (best && s >= best.t)) continue;
        const length = half * 2 || 1;
        const direction: Vec = [(b[0] - a[0]) / length, (b[1] - a[1]) / length, (b[2] - a[2]) / length];
        // back up from the closest point to about where the arrow went in
        const back = Math.sqrt(Math.max(0, capsule.radius ** 2 - distance ** 2)) * .6;
        const t = Math.max(0, s - back / length);
        best = { zone: capsule.zone, part: capsule.part ?? capsule.zone, t, point: [a[0] + (b[0] - a[0]) * t + direction[0] * .1, a[1] + (b[1] - a[1]) * t + direction[1] * .1, a[2] + (b[2] - a[2]) * t + direction[2] * .1], direction };
    }
    return best;
}

/** Closest points of segments p1→q1 and p2→q2: their params and the distance between them. */
function closest(p1: Vec, q1: Vec, p2: Vec, q2: Vec): [number, number, number] {
    const d1 = sub(q1, p1), d2 = sub(q2, p2), r = sub(p1, p2);
    const a = dot(d1, d1), e = dot(d2, d2), f = dot(d2, r);
    let s = 0, t = 0;
    if (a <= 1e-9 && e <= 1e-9) return [0, 0, Math.hypot(...r)];
    if (a <= 1e-9)
    {
        t = clamp(f / e);
    }
    else
    {
        const c = dot(d1, r);
        if (e <= 1e-9)
        {
            s = clamp(-c / a);
        }
        else
        {
            const b = dot(d1, d2), denom = a * e - b * b;
            s = denom > 1e-9 ? clamp((b * f - c * e) / denom) : 0;
            t = (b * s + f) / e;
            if (t < 0) { t = 0; s = clamp(-c / a); }
            else if (t > 1) { t = 1; s = clamp((b - c) / a); }
        }
    }
    const c1 = [p1[0] + d1[0] * s, p1[1] + d1[1] * s, p1[2] + d1[2] * s];
    const c2 = [p2[0] + d2[0] * t, p2[1] + d2[1] * t, p2[2] + d2[2] * t];
    return [s, t, Math.hypot(c1[0] - c2[0], c1[1] - c2[1], c1[2] - c2[2])];
}

const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const clamp = (n: number) => Math.max(0, Math.min(1, n));
