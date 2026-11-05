import { GameObject } from "@papit/game-engine";
import { MeshBuilder, seeded, type Batch, type MeshData, type Renderer, type Vec3 } from "@arrow-warfare/render";

import { PALETTES, type PaletteName } from "./atmosphere";
import { Field, STONES, VARIANTS } from "./field";
import { flower, grassTuft, log, mushroom, stone, stump, TREE_KINDS } from "./models";

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

        if (name === "night") this.addFireflies();
    }

    override update(dt: number) {
        if (!this.fireflies) return;
        this.clock += dt;
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

    const meadow: Vec3[] = [[.43, .66, .28], [.5, .72, .3], [.4, .62, .27], [.55, .72, .32]];
    const forest: Vec3 = [.26, .38, .2];
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
