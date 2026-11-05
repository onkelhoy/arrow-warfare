import { GameObject } from "@papit/game-engine";
import { MeshBuilder, seeded, type Batch, type MeshData, type Renderer, type Vec3 } from "@arrow-warfare/render";

import { CLOUDS, PALETTES, type PaletteName } from "./atmosphere";
import { Field, STONES, VARIANTS } from "./field";
import { blob, cloud, flower, grassTuft, log, mushroom, stone, stump, TREE_KINDS } from "./models";

/** How far past the field the clouds go before they come round again, and how fast they drift (m/s). */
const CLOUD_REACH = 90;
const CLOUD_SPEED = 1.2;

/** Petal colours, a flower's `colour` picks one. */
const PETALS: Vec3[] = [[.98, .96, .92], [.98, .82, .25], [.9, .42, .62], [.6, .55, .95], [.95, .5, .3]];

export type MeadowSetting = {
    palette?: PaletteName;
    /** 0..1, how much of the grass is drawn (quality). */
    grass?: number;
};

/**
 * A field put on screen: the ground, every tree, prop and blade as batches on the renderer, and the light
 * of the time of day. Add it to the engine too, it moves the fireflies.
 */
export class Meadow extends GameObject {
    readonly batches: Batch[] = [];
    private fireflies: Batch | null = null;
    private flies: { x: number; y: number; z: number; phase: number }[] = [];
    private clock = 0;
    private clouds: Batch[] = [];
    private sky: { batch: number; index: number; x: number; y: number; z: number; yaw: number; scale: number }[] = [];

    constructor(readonly renderer: Renderer, readonly field: Field, setting: MeadowSetting = {}) {
        super();
        const name = setting.palette ?? "noon";
        renderer.light = structuredClone(PALETTES[name]);
        const at = (x: number, z: number) => field.height(x, z);

        const add = (mesh: MeshData, things: { x: number; z: number; yaw: number; scale: number }[], options: Parameters<Renderer["batch"]>[1] = {}, sink = 0) => {
            if (!things.length) return null;
            const batch = renderer.batch(mesh, { capacity: things.length, ...options });
            for (const thing of things) batch.add(thing.x, at(thing.x, thing.z) - sink, thing.z, thing.yaw, thing.scale);
            this.batches.push(batch);
            return batch;
        };

        this.batches.push(addGround(renderer, field));

        // trees: one batch per kind and look, the meadow's and the wall's together
        const trees = [...field.trees, ...field.wall];
        TREE_KINDS.forEach((kind, k) => {
            for (let variant = 0; variant < VARIANTS; variant++)
                add(kind(field.seed + k * 7 + variant * 13), trees.filter(tree => tree.kind === k && tree.variant === variant), {}, .1);
        });

        // a dark spot under each tree in the meadow, the only shadows there are
        add(blob(), field.trees.map(tree => ({ x: tree.x, z: tree.z, yaw: tree.yaw, scale: tree.scale * 2.4 })), { twoSided: true }, -.03);

        add(log(), field.logs, {}, .05);
        add(stump(), field.stumps, {}, .05);
        for (let variant = 0; variant < STONES; variant++)
            add(stone(field.seed + variant), field.stones.filter(stone => stone.variant === variant), {}, .06);
        add(mushroom(), field.mushrooms);

        const blooms = add(flower(), field.flowers, { sway: .25 });
        field.flowers.forEach((one, i) => blooms?.tint(i, PETALS[one.colour]));

        const share = Math.max(0, Math.min(1, setting.grass ?? 1));
        const grass = field.grass.slice(0, Math.round(field.grass.length * share));
        const tufts = [grassTuft(field.seed), grassTuft(field.seed + 1), grassTuft(field.seed + 2)];
        tufts.forEach((tuft, i) => add(tuft, grass.filter((_, g) => g % tufts.length === i), { sway: .12 }));

        this.addClouds(name);
        if (name === "night") this.addFireflies();
    }

    /** Another time of day, straight away: the light, and the fireflies at night. */
    palette(name: PaletteName) {
        this.renderer.light = structuredClone(PALETTES[name]);
        this.tintClouds(name);
        if (name === "night" && !this.fireflies) this.addFireflies();
        if (name !== "night" && this.fireflies)
        {
            this.renderer.removeBatch(this.fireflies);
            this.fireflies = null;
            this.flies.length = 0;
        }
    }

    override update(dt: number) {
        this.clock += dt;
        // the clouds drift slowly along x with the wind, round again past the edge
        const reach = CLOUD_REACH + this.field.radius;
        for (const one of this.sky)
        {
            one.x += dt * CLOUD_SPEED * (1.2 - one.scale * .3);
            if (one.x > reach) one.x -= reach * 2;
            this.clouds[one.batch].place(one.index, one.x, one.y, one.z, one.yaw, 0, 0, one.scale);
        }
        if (!this.fireflies) return;
        const t = this.clock;
        this.flies.forEach((fly, i) => {
            const glow = .55 + .45 * Math.sin(t * 2.3 + fly.phase * 3);
            this.fireflies!.place(i,
                fly.x + Math.sin(t * .4 + fly.phase) * 1.2,
                fly.y + Math.sin(t * .9 + fly.phase * 2) * .35,
                fly.z + Math.cos(t * .33 + fly.phase) * 1.2,
                0, 0, 0, .05 * glow);
        });
    }

    /** Takes every batch off the renderer. */
    override destroy() {
        for (const batch of this.batches) this.renderer.removeBatch(batch);
        this.batches.length = 0;
        if (this.fireflies) this.renderer.removeBatch(this.fireflies);
        this.fireflies = null;
        for (const batch of this.clouds) this.renderer.removeBatch(batch);
        this.clouds.length = this.sky.length = 0;
    }

    /** Clouds high over the meadow and the forest, a few shapes, coloured by the time of day. */
    private addClouds(name: PaletteName) {
        const random = seeded(this.field.seed ^ 0xc10d);
        const reach = CLOUD_REACH + this.field.radius;
        const shapes = 3, count = 16;
        for (let k = 0; k < shapes; k++) this.clouds.push(this.renderer.batch(cloud(this.field.seed + k * 5), { capacity: count, emissive: .55, fog: 0, dynamic: true }));
        for (let i = 0; i < count; i++)
        {
            const batch = i % shapes;
            const one = { batch, index: this.clouds[batch].count, x: (random() * 2 - 1) * reach, y: 32 + random() * 16, z: (random() * 2 - 1) * reach, yaw: (random() - .5) * .6, scale: .8 + random() * .9 };
            this.clouds[batch].add(one.x, one.y, one.z, one.yaw, one.scale);
            this.sky.push(one);
        }
        this.tintClouds(name);
    }

    private tintClouds(name: PaletteName) {
        for (const one of this.sky) this.clouds[one.batch].tint(one.index, CLOUDS[name]);
    }

    private addFireflies() {
        const random = seeded(this.field.seed ^ 0xf1f1);
        const mesh = new MeshBuilder().ball("#f4ffa0", {}, 0).build();
        const count = Math.round(this.field.radius * 3);
        this.fireflies = this.renderer.batch(mesh, { capacity: count, emissive: 1, dynamic: true });
        for (let i = 0; i < count; i++)
        {
            const angle = random() * Math.PI * 2, distance = Math.sqrt(random()) * (this.field.radius + 4);
            const x = Math.cos(angle) * distance, z = Math.sin(angle) * distance;
            this.flies.push({ x, y: this.field.height(x, z) + .5 + random() * 1.6, z, phase: random() * 10 });
            this.fireflies.add(x, 0, z, 0, .05);
        }
    }
}

/** The ground: a grid over the field and a bit into the forest, flat shaded, meadow colours in patches. */
function addGround(renderer: Renderer, field: Field) {
    const reach = field.radius + 26;
    const cell = 2;
    const n = Math.ceil(reach * 2 / cell);
    const random = seeded(field.seed ^ 0x6a09);
    const corner = (i: number, j: number): Vec3 => {
        // a little jitter so the grid doesn't show
        const x = -reach + i * cell + (i > 0 && i < n ? (random() - .5) * .6 : 0);
        const z = -reach + j * cell + (j > 0 && j < n ? (random() - .5) * .6 : 0);
        return [x, field.height(x, z), z];
    };
    const grid: Vec3[][] = [];
    for (let i = 0; i <= n; i++)
    {
        grid.push([]);
        for (let j = 0; j <= n; j++) grid[i].push(corner(i, j));
    }

    const meadow: Vec3[] = [[.48, .74, .3], [.55, .8, .32], [.45, .7, .29], [.6, .8, .34]];
    const forest: Vec3 = [.3, .45, .23];
    const ground = new MeshBuilder();
    const colourAt = (p: Vec3): Vec3 => {
        const distance = Math.hypot(p[0], p[2]);
        const patch = meadow[Math.min(meadow.length - 1, Math.floor(field.patch(p[0], p[2]) * meadow.length))];
        const into = Math.max(0, Math.min(1, (distance - field.radius) / 4));
        return [patch[0] + (forest[0] - patch[0]) * into, patch[1] + (forest[1] - patch[1]) * into, patch[2] + (forest[2] - patch[2]) * into];
    };
    for (let i = 0; i < n; i++)
    {
        for (let j = 0; j < n; j++)
        {
            const a = grid[i][j], b = grid[i + 1][j], c = grid[i + 1][j + 1], d = grid[i][j + 1];
            if (Math.hypot(a[0], a[2]) > reach) continue;
            // counter clockwise seen from above
            const middle1: Vec3 = [(a[0] + c[0] + d[0]) / 3, 0, (a[2] + c[2] + d[2]) / 3];
            const middle2: Vec3 = [(a[0] + b[0] + c[0]) / 3, 0, (a[2] + b[2] + c[2]) / 3];
            ground.triangle(a, d, c, colourAt(middle1));
            ground.triangle(a, c, b, colourAt(middle2));
        }
    }
    const batch = renderer.batch(ground.build(), { capacity: 1 });
    batch.add(0, 0, 0);
    return batch;
}
