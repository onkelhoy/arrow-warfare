import { MeshBuilder, rgb, seeded, type Batch, type MeshData, type Renderer, type Vec3 } from "@arrow-warfare/render";

import type { PaletteName } from "./atmosphere";

/**
 * The painted backdrop round the meadow, like the menus' (`@arrow-warfare/backdrop`): rolling hills, two
 * rings of snowy mountains and a castle on its hill, far out past the forest. Flat, mostly unlit and in the
 * fog a little, so it reads as a stage backdrop more than as land. The colours follow the time of day.
 */

/** Each layer's colour at each time of day, the same as the menus' painting. */
const COLOURS: Record<PaletteName, { far: Vec3; near: Vec3; snow: Vec3; hills: Vec3; castle: number }> = {
    noon: { far: rgb("#8fb1d6"), near: rgb("#6f93b8"), snow: rgb("#f5fbff"), hills: rgb("#6ea04a"), castle: 1 },
    dawn: { far: rgb("#b6b4cf"), near: rgb("#9592b6"), snow: rgb("#fff4ea"), hills: rgb("#85a356"), castle: .95 },
    sunset: { far: rgb("#a5739a"), near: rgb("#7d5583"), snow: rgb("#ffd2c4"), hills: rgb("#6e6c40"), castle: .8 },
    night: { far: rgb("#2e3870"), near: rgb("#232b5a"), snow: rgb("#8d98c8"), hills: rgb("#1b283c"), castle: .45 },
};

/** How far past the forest edge each ring stands, metres. The camera has to reach the far one. */
export const BACKDROP_REACH = 175;
const HILLS = 62, NEAR = 125, FAR = BACKDROP_REACH;

type Ring = { radius: number; low: number; high: number; peaks: number; seed: number };

/** Heights round a ring: sharp cartoon peaks with shoulders, or soft hills. */
function heights(ring: Ring, segments: number, soft: boolean) {
    const random = seeded(ring.seed);
    const peaks = Array.from({ length: ring.peaks }, (_, i) => ({
        at: (i + .2 + random() * .6) / ring.peaks * Math.PI * 2,
        height: ring.low + random() * (ring.high - ring.low),
        width: (soft ? 1.4 : .8 + random() * .5) * Math.PI * 2 / ring.peaks,
    }));
    return Array.from({ length: segments }, (_, s) => {
        const angle = s / segments * Math.PI * 2;
        let top = ring.low * .35;
        for (const peak of peaks)
        {
            let d = Math.abs(angle - peak.at);
            d = Math.min(d, Math.PI * 2 - d) / (peak.width / 2);
            if (d >= 1) continue;
            const shape = soft ? (1 + Math.cos(d * Math.PI)) / 2 : 1 - d ** 1.1;
            top = Math.max(top, peak.height * shape);
        }
        return top;
    });
}

/** A ring wall of mountains (or hills) seen from inside, its tint taken from the instance. */
function ring(ring: Ring, soft: boolean, snowLine = Infinity): { land: MeshData; snow: MeshData | null } {
    const segments = soft ? 96 : 160;
    const tops = heights(ring, segments, soft);
    const at = (s: number, r: number, y: number): Vec3 => {
        const angle = (s % segments) / segments * Math.PI * 2;
        return [Math.cos(angle) * r, y, Math.sin(angle) * r];
    };
    const land = new MeshBuilder(), snow = new MeshBuilder();
    const base = -12;
    let caps = 0;
    for (let s = 0; s < segments; s++)
    {
        const a = tops[s], b = tops[(s + 1) % segments];
        land.quad(at(s, ring.radius, base), at(s + 1, ring.radius, base), at(s + 1, ring.radius, b), at(s, ring.radius, a), [1, 1, 1], 1);
        if (a > snowLine && b > snowLine)
        {
            // a cap in front of the rock, its hem a zigzag
            const hem = (y: number, s2: number) => snowLine + (y - snowLine) * (.35 + (s2 % 2) * .25);
            snow.quad(at(s, ring.radius - 1, hem(a, s)), at(s + 1, ring.radius - 1, hem(b, s + 1)), at(s + 1, ring.radius - 1, b + .2), at(s, ring.radius - 1, a + .2), [1, 1, 1], 1);
            caps++;
        }
    }
    return { land: land.build(), snow: caps ? snow.build() : null };
}

/** The castle, in metres, its gate towards +z. About 34 m wide, 30 m to the tip of the keep's flag. */
function castle(): MeshData {
    const STONE = "#d9cdb4", DARK = "#b9aa8c", ROOF = "#c8372d", WOOD = "#3a2616", GOLD = "#f2c14e", WINDOW = "#3a2c22";
    const m = new MeshBuilder();
    // the keep
    m.box(STONE, { at: [0, 9, -2], scale: [12, 18, 10] });
    for (let x = -5; x <= 5; x += 2.5) m.box(STONE, { at: [x, 18.8, 3], scale: [1.4, 1.6, 1] });
    m.box(WINDOW, { at: [-2.4, 13, 3.05], scale: [1.2, 2.4, .2] });
    m.box(WINDOW, { at: [2.4, 13, 3.05], scale: [1.2, 2.4, .2] });
    m.box(WOOD, { at: [0, 26, -2], scale: [.3, 8, .3] });
    m.box(GOLD, { at: [2, 28.5, -2], scale: [4, 2.6, .2] });
    // the curtain wall and its gate
    m.box(STONE, { at: [0, 4, 6], scale: [30, 8, 2] });
    m.box(STONE, { at: [-14, 4, 0], scale: [2, 8, 12] });
    m.box(STONE, { at: [14, 4, 0], scale: [2, 8, 12] });
    for (let x = -14; x <= 14; x += 2.5) m.box(STONE, { at: [x, 8.6, 6.4], scale: [1.2, 1.2, 1.2] });
    m.box(WOOD, { at: [0, 2.4, 7.05], scale: [4, 4.8, .2] });
    m.box(DARK, { at: [0, 5.2, 7.05], scale: [4.8, .6, .25] });
    // four round towers with pointed red roofs and pennants
    for (const [x, z, h] of [[-15, 7, 14], [15, 7, 14], [-15, -6, 12], [15, -6, 12]])
    {
        m.cylinder(STONE, { at: [x, 0, z], scale: [5, h, 5] }, 8);
        m.cylinder(DARK, { at: [x, h, z], scale: [6, 1, 6] }, 8);
        m.cylinder(ROOF, { at: [x, h + 1, z], scale: [6.4, 6, 6.4] }, 8, .5, 0);
        m.box(WOOD, { at: [x, h + 8, z], scale: [.25, 4, .25] });
        m.box(ROOF, { at: [x + 1.2, h + 9.3, z], scale: [2.4, 1.2, .15] });
        m.box(WINDOW, { at: [x, h * .6, z + 2.45], scale: [.9, 1.8, .2] });
    }
    return m.build();
}

/** The hill the castle stands on, a low round mound. */
function mound(): MeshData {
    return new MeshBuilder().ball([1, 1, 1], { at: [0, -16, 0], scale: [44, 36, 44], tint: 1 }, 2, .06, 3).build();
}

export class Backdrop {
    readonly batches: Batch[] = [];
    private far: Batch;
    private near: Batch;
    private hills: Batch;
    private snow: Batch[] = [];
    private keep: Batch;
    private hill: Batch;

    constructor(private renderer: Renderer, radius: number, seed: number, palette: PaletteName) {
        const make = (mesh: MeshData, fog: number, emissive: number) => {
            const batch = renderer.batch(mesh, { capacity: 1, fog, emissive, twoSided: true });
            this.batches.push(batch);
            return batch;
        };

        const far = ring({ radius: radius + FAR, low: 55, high: 130, peaks: 9, seed: seed ^ 0xfa12 }, false, 78);
        const near = ring({ radius: radius + NEAR, low: 28, high: 72, peaks: 13, seed: seed ^ 0x2ea4 }, false, 46);
        const hills = ring({ radius: radius + HILLS, low: 10, high: 22, peaks: 11, seed: seed ^ 0x4111 }, true);
        this.far = make(far.land, .38, .75);
        this.near = make(near.land, .26, .7);
        this.hills = make(hills.land, .2, .55);
        for (const snow of [far.snow, near.snow]) if (snow) this.snow.push(make(snow, .25, .85));
        for (const batch of this.batches) batch.add(0, 0, 0);

        // the castle on its own hill, between the hills and the near mountains, towards the sunrise side
        const random = seeded(seed ^ 0xca57);
        const angle = random() * Math.PI * 2;
        const distance = radius + HILLS + 42;
        const x = Math.cos(angle) * distance, z = Math.sin(angle) * distance;
        this.hill = make(mound(), .3, .55);
        this.hill.add(x, 0, z);
        this.keep = make(castle(), .45, .55);
        // half again life size, so it stands over the forest like a castle in a painting
        this.keep.add(x, 18, z, Math.atan2(-x, -z), 1.5);

        this.palette(palette);
    }

    palette(name: PaletteName) {
        const colours = COLOURS[name];
        this.far.tint(0, colours.far);
        this.near.tint(0, colours.near);
        this.hills.tint(0, colours.hills);
        this.hill.tint(0, colours.hills);
        for (const snow of this.snow) snow.tint(0, colours.snow);
        this.keep.tint(0, [1, 1, 1], colours.castle);
    }

    destroy() {
        for (const batch of this.batches) this.renderer.removeBatch(batch);
        this.batches.length = 0;
    }
}
