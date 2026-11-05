import { compose, mat4, rgb, transformPoint, type Mat4, type Vec3 } from "./math";

/** Floats per vertex: position 3, normal 3, colour 4 (the 4th is how much the instance tint replaces it). */
export const STRIDE = 10;

/** Triangles, flat shaded, ready for `Renderer.mesh`. */
export type MeshData = { vertices: Float32Array; count: number };

export type Colour = string | Vec3;

export type Place = {
    at?: Vec3;
    /** Around y, x and z, in radians. */
    yaw?: number;
    pitch?: number;
    roll?: number;
    /** One number for all three axes, or one each. */
    scale?: number | Vec3;
    /** 0 keeps the colour, 1 takes the instance's tint instead (clothes in the player's colour). */
    tint?: number;
};

/**
 * Low poly models in code: add shapes, each placed and coloured, then `build()`. Every triangle gets its
 * own normal, which gives the faceted toon look without a texture.
 */
export class MeshBuilder {
    private data: number[] = [];
    private matrix = mat4();

    /** A triangle in model space, counter clockwise seen from the outside. */
    triangle(a: Vec3, b: Vec3, c: Vec3, colour: Colour, tint = 0) {
        const [r, g, bl] = typeof colour === "string" ? rgb(colour) : colour;
        const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
        const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
        let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const length = Math.hypot(nx, ny, nz) || 1;
        nx /= length; ny /= length; nz /= length;
        for (const p of [a, b, c]) this.data.push(p[0], p[1], p[2], nx, ny, nz, r, g, bl, tint);
        return this;
    }

    /** A flat four sided face, `a b c d` counter clockwise. */
    quad(a: Vec3, b: Vec3, c: Vec3, d: Vec3, colour: Colour, tint = 0) {
        return this.triangle(a, b, c, colour, tint).triangle(a, c, d, colour, tint);
    }

    /** A box of size 1 around its centre, placed. */
    box(colour: Colour, place: Place = {}) {
        const p = this.placer(place);
        const v = (x: number, y: number, z: number) => p([x * .5, y * .5, z * .5]);
        const t = place.tint ?? 0;
        this.quad(v(-1, -1, 1), v(1, -1, 1), v(1, 1, 1), v(-1, 1, 1), colour, t);
        this.quad(v(1, -1, -1), v(-1, -1, -1), v(-1, 1, -1), v(1, 1, -1), colour, t);
        this.quad(v(1, -1, 1), v(1, -1, -1), v(1, 1, -1), v(1, 1, 1), colour, t);
        this.quad(v(-1, -1, -1), v(-1, -1, 1), v(-1, 1, 1), v(-1, 1, -1), colour, t);
        this.quad(v(-1, 1, 1), v(1, 1, 1), v(1, 1, -1), v(-1, 1, -1), colour, t);
        this.quad(v(-1, -1, -1), v(1, -1, -1), v(1, -1, 1), v(-1, -1, 1), colour, t);
        return this;
    }

    /**
     * A tube from y 0 to y 1 with `sides` sides, `bottom` and `top` radius. A top of 0 is a cone.
     * `wobble` moves each ring point a bit, seeded by `seed`, for a hand made look.
     */
    cylinder(colour: Colour, place: Place = {}, sides = 6, bottom = .5, top = .5, caps = true, wobble = 0, seed = 1) {
        const p = this.placer(place);
        const t = place.tint ?? 0;
        const random = seeded(seed);
        const ring = (radius: number, y: number) => Array.from({ length: sides }, (_, i) => {
            const angle = i / sides * Math.PI * 2;
            const r = radius * (1 + (random() - .5) * wobble);
            return p([Math.cos(angle) * r, y, -Math.sin(angle) * r]);
        });
        const low = ring(bottom, 0);
        const high = top > 0 ? ring(top, 1) : null;
        const tip = p([0, 1, 0]);
        for (let i = 0; i < sides; i++)
        {
            const j = (i + 1) % sides;
            if (high) this.quad(low[i], low[j], high[j], high[i], colour, t);
            else this.triangle(low[i], low[j], tip, colour, t);
        }
        if (caps)
        {
            const base = p([0, 0, 0]);
            for (let i = 0; i < sides; i++) this.triangle(base, low[(i + 1) % sides], low[i], colour, t);
            if (high)
            {
                const cap = p([0, 1, 0]);
                for (let i = 0; i < sides; i++) this.triangle(cap, high[i], high[(i + 1) % sides], colour, t);
            }
        }
        return this;
    }

    /** A low poly ball of radius 1 (an icosahedron, `detail` times split), placed. */
    ball(colour: Colour | ((point: Vec3) => Colour), place: Place = {}, detail = 1, wobble = 0, seed = 1) {
        const p = this.placer(place);
        const t = place.tint ?? 0;
        const random = seeded(seed);
        const bumps = new Map<string, number>();
        const bump = (v: Vec3) => {
            const key = v.map(n => n.toFixed(3)).join();
            if (!bumps.has(key)) bumps.set(key, 1 + (random() - .5) * wobble);
            return bumps.get(key)!;
        };
        for (let [a, b, c] of icosphere(detail))
        {
            const [pa, pb, pc] = [a, b, c].map(v => {
                const k = bump(v);
                return p([v[0] * k, v[1] * k, v[2] * k]);
            });
            const middle: Vec3 = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
            this.triangle(pa, pb, pc, typeof colour === "function" ? colour(middle) : colour, t);
        }
        return this;
    }

    /** A flat blade from the ground up, two sided by the renderer, for grass. */
    blade(colour: Colour, tipColour: Colour, place: Place = {}, width = .08, height = 1) {
        const p = this.placer(place);
        const a = p([-width / 2, 0, 0]), b = p([width / 2, 0, 0]), c = p([0, height, 0]);
        const [r1, g1, b1] = typeof colour === "string" ? rgb(colour) : colour;
        const [r2, g2, b2] = typeof tipColour === "string" ? rgb(tipColour) : tipColour;
        // the blade faces +z, the renderer flips the normal for its back
        for (const [point, colours] of [[a, [r1, g1, b1]], [b, [r1, g1, b1]], [c, [r2, g2, b2]]] as const)
            this.data.push(point[0], point[1], point[2], 0, .6, .8, colours[0], colours[1], colours[2], 0);
        return this;
    }

    /** Another builder's triangles, placed. */
    add(other: MeshBuilder | MeshData, place: Place = {}) {
        const data = other instanceof MeshBuilder ? other.build().vertices : other.vertices;
        const p = this.placer(place);
        const normal = this.normalPlacer(place);
        for (let i = 0; i < data.length; i += STRIDE)
        {
            const point = p([data[i], data[i + 1], data[i + 2]]);
            const n = normal([data[i + 3], data[i + 4], data[i + 5]]);
            this.data.push(...point, ...n, data[i + 6], data[i + 7], data[i + 8], place.tint ?? data[i + 9]);
        }
        return this;
    }

    build(): MeshData {
        return { vertices: new Float32Array(this.data), count: this.data.length / STRIDE };
    }

    private placer(place: Place) {
        const matrix = this.place(place);
        return (point: Vec3) => transformPoint(matrix, point);
    }

    private normalPlacer(place: Place) {
        const rotation = compose(mat4(), 0, 0, 0, 0, place.yaw, place.pitch, place.roll);
        return (n: Vec3) => transformPoint(rotation, n);
    }

    private place({ at = [0, 0, 0], yaw, pitch, roll, scale = 1 }: Place): Mat4 {
        const [sx, sy, sz] = typeof scale === "number" ? [scale, scale, scale] : scale;
        return compose(this.matrix, 0, at[0], at[1], at[2], yaw, pitch, roll, sx, sy, sz);
    }
}

/** The same numbers for the same seed, 0..1 (mulberry32). */
export function seeded(seed: number) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function icosphere(detail: number) {
    const t = (1 + Math.sqrt(5)) / 2;
    const points: Vec3[] = [
        [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
        [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
        [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
    ].map(p => unit(p as Vec3));
    let faces: [Vec3, Vec3, Vec3][] = [
        [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
        [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
        [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
        [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
    ].map(([a, b, c]) => [points[a], points[b], points[c]]);
    for (let i = 0; i < detail; i++)
    {
        faces = faces.flatMap(([a, b, c]) => {
            const ab = unit(half(a, b)), bc = unit(half(b, c)), ca = unit(half(c, a));
            return [[a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]] as [Vec3, Vec3, Vec3][];
        });
    }
    return faces;
}

const half = (a: Vec3, b: Vec3): Vec3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
const unit = (v: Vec3): Vec3 => {
    const length = Math.hypot(...v);
    return [v[0] / length, v[1] / length, v[2] / length];
};
