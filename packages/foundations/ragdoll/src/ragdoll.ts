export type Vec = [number, number, number];

/** A verlet point: where it is, where it was a step ago, its size against the ground. */
export type RagdollPoint = { x: number; y: number; z: number; ox: number; oy: number; oz: number; radius: number };
type Stick = { a: RagdollPoint; b: RagdollPoint; length: number };

export type RagdollOptions = {
    /** m/s². */
    gravity?: number;
    /** How far a point may sink into the ground, metres. */
    sink?: number;
    /** Points' radius, by name, metres. Others get `.05`. */
    radius?: Record<string, number>;
};

/** One fixed physics step. Fixed so every phone, and the slow motion film, gets the same fall. */
export const STEP = 1 / 120;
const PASSES = 6;
const AIR = .998;
/** Velocity kept along the ground per step when touching it. */
const GRIP = .82;
const BOUNCE = .25;
/** Below this speed (m/s) for this long (s), it sleeps. */
const STILL = .2;
const SETTLE = .6;

/**
 * Verlet points and sticks, cowboy's ragdoll in 3D. It knows nothing about bones: it takes named points
 * and pairs of them, and whoever draws reads the points back. Falls on any ground `height(x, z)`.
 * Steps are fixed (`STEP`): `update(dt)` runs as many as `dt` holds, so a slow motion feeds smaller dts
 * and the fall comes out the same.
 */
export class Ragdoll<Name extends string = string> {
    readonly points: Record<Name, RagdollPoint>;
    private sticks: Stick[];
    private gravity: number;
    private sink: number;
    private left = 0;
    private still = 0;
    /** Seconds of physics run. */
    time = 0;
    /** Asleep: no more steps. */
    resting = false;

    constructor(start: Record<Name, Vec>, sticks: readonly (readonly [Name, Name])[], private height: (x: number, z: number) => number, options: RagdollOptions = {}) {
        this.gravity = options.gravity ?? 9.8;
        this.sink = options.sink ?? .03;
        const points = {} as Record<Name, RagdollPoint>;
        for (const name of Object.keys(start) as Name[])
        {
            const [x, y, z] = start[name];
            points[name] = { x, y, z, ox: x, oy: y, oz: z, radius: options.radius?.[name] ?? .05 };
        }
        this.points = points;
        this.sticks = sticks.map(([from, to]) => {
            const a = points[from], b = points[to];
            return { a, b, length: Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) };
        });
    }

    /** Gives every point a velocity, m/s (what the body was doing as it died). */
    moving([vx, vy, vz]: Vec) {
        for (const name in this.points)
        {
            const p = this.points[name];
            p.ox = p.x - vx * STEP;
            p.oy = p.y - vy * STEP;
            p.oz = p.z - vz * STEP;
        }
    }

    /** Adds velocity to one point, m/s. */
    push(name: Name, [vx, vy, vz]: Vec) {
        const p = this.points[name];
        p.ox -= vx * STEP;
        p.oy -= vy * STEP;
        p.oz -= vz * STEP;
        this.resting = false;
        this.still = 0;
    }

    /** Runs the fixed steps `dt` seconds hold. */
    update(dt: number) {
        if (this.resting || !(dt > 0)) return;
        this.left += Math.min(dt, .25);
        while (this.left >= STEP && !this.resting)
        {
            this.left -= STEP;
            this.step();
        }
    }

    /** Runs until `time` seconds of physics, for catching up. */
    runTo(time: number) {
        while (this.time + STEP <= time && !this.resting) this.step();
    }

    /** The middle of some points. */
    centre(names: readonly Name[]): Vec {
        let x = 0, y = 0, z = 0;
        for (const name of names)
        {
            const p = this.points[name];
            x += p.x; y += p.y; z += p.z;
        }
        const n = names.length || 1;
        return [x / n, y / n, z / n];
    }

    private step() {
        this.time += STEP;
        let speed = 0, count = 0;
        for (const name in this.points)
        {
            const p = this.points[name];
            const vx = (p.x - p.ox) * AIR, vy = (p.y - p.oy) * AIR, vz = (p.z - p.oz) * AIR;
            p.ox = p.x; p.oy = p.y; p.oz = p.z;
            p.x += vx;
            p.y += vy - this.gravity * STEP * STEP;
            p.z += vz;
            speed += Math.hypot(vx, vy, vz) / STEP;
            count++;
        }
        for (let pass = 0; pass < PASSES; pass++)
        {
            for (const stick of this.sticks) pull(stick);
            for (const name in this.points) this.ground(this.points[name], pass === PASSES - 1);
        }
        this.still = speed / (count || 1) < STILL ? this.still + STEP : 0;
        if (this.still >= SETTLE) this.resting = true;
    }

    /** Out of the ground, sinking in a little. On the last pass, it drags and bounces a bit. */
    private ground(p: RagdollPoint, last: boolean) {
        const floor = this.height(p.x, p.z) + p.radius - this.sink;
        if (p.y >= floor) return;
        const vy = p.y - p.oy;
        p.y = floor;
        if (!last) return;
        // along the ground it grips, off it a small bounce
        p.ox = p.x - (p.x - p.ox) * GRIP;
        p.oz = p.z - (p.z - p.oz) * GRIP;
        p.oy = p.y + Math.min(0, vy) * BOUNCE;
    }
}

function pull({ a, b, length }: Stick) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const distance = Math.hypot(dx, dy, dz);
    if (distance === 0) return;
    const part = (length - distance) / distance / 2;
    a.x -= dx * part; a.y -= dy * part; a.z -= dz * part;
    b.x += dx * part; b.y += dy * part; b.z += dz * part;
}
