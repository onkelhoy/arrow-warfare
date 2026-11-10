import type { Block, Field } from "@arrow-warfare/world";

import type { Vec } from "./body";

/** A shot as it goes over the network: everything every phone needs to fly the same arrow. */
export type Shot = {
    /** `<shooter>:<n>`. */
    id: string;
    by: string;
    /** Shared ms it left the bow. */
    time: number;
    x: number; y: number; z: number;
    /** Unit direction. */
    dx: number; dy: number; dz: number;
    speed: number;
    /** What flies, an arrow if not said. */
    kind?: Projectile;
};

/** One weapon for everyone in a game: the bow's arrows or a gun's bullets. */
export type Projectile = "arrow" | "revolver" | "rifle";

/**
 * Muzzle speed (m/s), quadratic drag (per metre) and how long a shot lives (s). Real ones: a .45 revolver
 * round leaves at about 280 m/s and slows fast, a rifle's at about 850 and keeps it, so it stays flat for
 * longer (at 100 m it has dropped some 8 cm, the revolver's over 70 cm). Arrows' speed comes from the draw.
 */
export const BALLISTICS: Record<Projectile, { speed: number; drag: number; life: number }> = {
    arrow: { speed: 0, drag: .0016, life: 10 },
    revolver: { speed: 280, drag: .0023, life: 3 },
    rifle: { speed: 850, drag: .0006, life: 3 },
};

/** A bullet, not an arrow: nothing to see once it stops, nothing to pick up. */
export function isBullet(shot: Shot) {
    return !!shot.kind && shot.kind !== "arrow";
}

/** What an arrow ended up in. `body` is a player, `id` says who. */
export type Rest = { in: "ground" | "wood" | "wall" } | { in: "body"; id: string };

export type Arrow = {
    shot: Shot;
    /** The tip. */
    x: number; y: number; z: number;
    vx: number; vy: number; vz: number;
    /** Shared ms the arrow has been flown to. */
    at: number;
    /** Where it was the step before, for hit tests. */
    from: Vec;
    rest: Rest | null;
    /** In body space while it's in a player. */
    local?: { point: Vec; direction: Vec };
    /** Gone for good (flew off, or picked up). */
    gone: boolean;
};

export const GRAVITY = 9.81;
/** Seconds per step, the same on every phone so arrows land the same. */
export const STEP = 1 / 120;
/** How deep a tip goes in. */
const DEPTH = .14;
/** The forest wall catches arrows this far past the meadow's edge, up to `WALL_HEIGHT` over the ground. */
const WALL = .8;
const WALL_HEIGHT = 9;

export function launch(shot: Shot): Arrow {
    return {
        shot,
        x: shot.x, y: shot.y, z: shot.z,
        vx: shot.dx * shot.speed, vy: shot.dy * shot.speed, vz: shot.dz * shot.speed,
        at: shot.time,
        from: [shot.x, shot.y, shot.z],
        rest: null,
        gone: false,
    };
}

/**
 * Flies `arrow` on to shared ms `until` in fixed steps, stopping at what it hits in the field. `step` is
 * called after each step with the segment it moved, a player hit test can stop it there by returning true.
 */
export function fly(arrow: Arrow, until: number, field: Field, step?: (from: Vec, to: Vec) => boolean) {
    const ms = STEP * 1000;
    const { drag, life } = BALLISTICS[arrow.shot.kind ?? "arrow"] ?? BALLISTICS.arrow;
    while (!arrow.rest && !arrow.gone && arrow.at + ms <= until)
    {
        arrow.at += ms;
        const from: Vec = [arrow.x, arrow.y, arrow.z];
        arrow.from = from;
        const speed = Math.hypot(arrow.vx, arrow.vy, arrow.vz);
        const slow = 1 - drag * speed * STEP;
        arrow.vx *= slow;
        arrow.vz *= slow;
        arrow.vy = arrow.vy * slow - GRAVITY * STEP;
        const to: Vec = [arrow.x + arrow.vx * STEP, arrow.y + arrow.vy * STEP, arrow.z + arrow.vz * STEP];

        if (step?.(from, to)) return;
        const hit = worldHit(field, from, to);
        if (hit)
        {
            const [t, kind] = hit;
            const length = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]) || 1;
            arrow.x = from[0] + (to[0] - from[0]) * t + (to[0] - from[0]) / length * DEPTH;
            arrow.y = from[1] + (to[1] - from[1]) * t + (to[1] - from[1]) / length * DEPTH;
            arrow.z = from[2] + (to[2] - from[2]) * t + (to[2] - from[2]) / length * DEPTH;
            arrow.rest = { in: kind };
            return;
        }
        [arrow.x, arrow.y, arrow.z] = to;
        if ((arrow.at - arrow.shot.time) / 1000 > life || arrow.y < -20) arrow.gone = true;
        else if (Math.hypot(arrow.x, arrow.z) > field.radius + WALL && arrow.y > field.height(arrow.x, arrow.z) + WALL_HEIGHT) arrow.gone = true;
    }
}

/** Where the tip points: along the flight, or the way it went in. */
export function heading(arrow: Arrow): Vec {
    const length = Math.hypot(arrow.vx, arrow.vy, arrow.vz) || 1;
    return [arrow.vx / length, arrow.vy / length, arrow.vz / length];
}

/** The first thing in the field the segment goes into: ground, a trunk, a log or stump, the forest wall. */
function worldHit(field: Field, from: Vec, to: Vec): [number, "ground" | "wood" | "wall"] | null {
    let best: [number, "ground" | "wood" | "wall"] | null = null;

    // the ground, where the height changes sign along the segment
    const above0 = from[1] - field.height(from[0], from[2]);
    const above1 = to[1] - field.height(to[0], to[2]);
    if (above1 <= 0 && above0 > 0) best = [above0 / (above0 - above1), "ground"];
    else if (above0 <= 0) best = [0, "ground"];

    const dx = to[0] - from[0], dz = to[2] - from[2];
    const flat = dx * dx + dz * dz;
    if (flat > 1e-12)
    {
        for (const obstacle of field.obstacles)
        {
            if (obstacle.soft) continue;
            const t = circleEntry(from[0] - obstacle.x, from[2] - obstacle.z, dx, dz, obstacle.radius);
            if (t === null || (best && t >= best[0])) continue;
            const y = from[1] + (to[1] - from[1]) * t;
            const ground = field.height(obstacle.x, obstacle.z);
            if (y < ground - .2 || y > ground + obstacle.height) continue;
            best = [t, "wood"];
        }

        // buildings, props, a tower's legs and platform: boxes
        for (const block of field.blocks)
        {
            const t = boxEntry(block, from, to);
            if (t !== null && (!best || t < best[0])) best = [t, "wood"];
        }

        // the forest wall: the inside of a big circle
        const wall = field.radius + WALL;
        const outside = Math.hypot(to[0], to[2]);
        if (outside > wall && Math.hypot(from[0], from[2]) <= wall)
        {
            const t = circleExit(from[0], from[2], dx, dz, wall);
            const y = from[1] + (to[1] - from[1]) * t;
            const x = from[0] + dx * t, z = from[2] + dz * t;
            if (t !== null && (!best || t < best[0]) && y < field.height(x, z) + WALL_HEIGHT) best = [t, "wall"];
        }
    }
    return best;
}

/** When the segment enters a turned box (slabs in the box's own axes), 0..1, or null. */
function boxEntry(box: Block, from: Vec, to: Vec) {
    const c = Math.cos(box.yaw), s = Math.sin(box.yaw);
    const fx = from[0] - box.x, fz = from[2] - box.z;
    const dx = to[0] - from[0], dz = to[2] - from[2];
    const start = [fx * c - fz * s, from[1] - (box.bottom + box.top) / 2, fx * s + fz * c];
    const move = [dx * c - dz * s, to[1] - from[1], dx * s + dz * c];
    const half = [box.hx, (box.top - box.bottom) / 2, box.hz];
    let enter = 0, leave = 1;
    for (let k = 0; k < 3; k++)
    {
        if (Math.abs(move[k]) < 1e-9)
        {
            if (Math.abs(start[k]) > half[k]) return null;
            continue;
        }
        let a = (-half[k] - start[k]) / move[k], b = (half[k] - start[k]) / move[k];
        if (a > b) [a, b] = [b, a];
        enter = Math.max(enter, a);
        leave = Math.min(leave, b);
        if (enter > leave) return null;
    }
    return enter;
}

/** When a point at `px, pz` moving by `dx, dz` enters a circle at the origin, 0..1, or null. */
function circleEntry(px: number, pz: number, dx: number, dz: number, radius: number) {
    const a = dx * dx + dz * dz, b = 2 * (px * dx + pz * dz), c = px * px + pz * pz - radius * radius;
    if (c <= 0) return 0;
    const disc = b * b - 4 * a * c;
    if (disc < 0) return null;
    const t = (-b - Math.sqrt(disc)) / (2 * a);
    return t >= 0 && t <= 1 ? t : null;
}

function circleExit(px: number, pz: number, dx: number, dz: number, radius: number) {
    const a = dx * dx + dz * dz, b = 2 * (px * dx + pz * dz), c = px * px + pz * pz - radius * radius;
    const disc = Math.max(0, b * b - 4 * a * c);
    return Math.max(0, Math.min(1, (-b + Math.sqrt(disc)) / (2 * a)));
}

/**
 * Whether one can see from `from` to `to`: nothing in the field between (the ground on the way, trunks,
 * walls, the forest wall), and with `soft` no bush either.
 */
export function clear(field: Field, from: Vec, to: Vec, soft = true) {
    if (worldHit(field, from, to)) return false;
    const dx = to[0] - from[0], dz = to[2] - from[2], flat = Math.hypot(dx, dz);
    // hills between: the ground every few metres along
    for (let d = 3; d < flat - 1; d += 3)
    {
        const k = d / flat, x = from[0] + dx * k, z = from[2] + dz * k;
        if (from[1] + (to[1] - from[1]) * k < field.height(x, z)) return false;
    }
    if (!soft || flat < 1e-6) return true;
    for (const obstacle of field.obstacles)
    {
        if (!obstacle.soft) continue;
        const t = circleEntry(from[0] - obstacle.x, from[2] - obstacle.z, dx, dz, obstacle.radius);
        if (t === null || t <= 0) continue;
        const y = from[1] + (to[1] - from[1]) * t;
        if (y < field.height(obstacle.x, obstacle.z) + obstacle.height) return false;
    }
    return true;
}

/**
 * Which way to send a shot of `speed` from `from` so it comes down through `to`, allowing for the drop and
 * the drag as `fly` flies it, and how long it takes (s). Null when it can't get there.
 */
export function solve(from: Vec, to: Vec, speed: number, kind: Projectile = "arrow"): { direction: Vec; time: number } | null {
    const dx = to[0] - from[0], dy = to[1] - from[1], dz = to[2] - from[2], flat = Math.hypot(dx, dz);
    if (flat < .05) return { direction: [0, Math.sign(dy) || 1, 0], time: Math.abs(dy) / speed };
    const { drag } = BALLISTICS[kind] ?? BALLISTICS.arrow;
    let pitch = Math.atan2(dy, flat), time = 0;
    for (let i = 0; i < 6; i++)
    {
        // a point in the upright plane, flown as `fly` does until it's `flat` away
        let x = 0, y = 0, vx = Math.cos(pitch) * speed, vy = Math.sin(pitch) * speed;
        time = 0;
        while (x < flat && time < 10 && vx > .1)
        {
            const slow = 1 - drag * Math.hypot(vx, vy) * STEP;
            vx *= slow;
            vy = vy * slow - GRAVITY * STEP;
            const step = Math.min(1, (flat - x) / (vx * STEP));
            x += vx * STEP * step;
            y += vy * STEP * step;
            time += STEP * step;
        }
        if (x < flat - .01) return null;
        const miss = dy - y;
        if (Math.abs(miss) < .01) break;
        pitch += Math.atan2(miss, flat) * Math.cos(Math.atan2(dy, flat));
        if (pitch > 1.1) return null;
    }
    return { direction: [Math.cos(pitch) * dx / flat, Math.sin(pitch), Math.cos(pitch) * dz / flat], time };
}
