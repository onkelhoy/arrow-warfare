import { seeded } from "@arrow-warfare/render";

import type { ModelName } from "./catalog";
import { layout } from "./maps";

export type MapSize = "small" | "medium" | "large";
export type TreeAmount = "none" | "few" | "many";

export type MapKind = "field" | "farm" | "city";


export type FieldSetting = {
    seed: number;
    size?: MapSize;
    trees?: TreeAmount;
    map?: MapKind;
    /** Rocks, bushes and things to hide behind. */
    props?: TreeAmount;
    buildings?: TreeAmount;
    towers?: TreeAmount;
};

/** Metres from the middle to the forest edge. */
/** Metres between sides on a spawn ring, at least. */
const SPACING = 7;
export const RADIUS: Record<MapSize, number> = { small: 28, medium: 42, large: 80 };
/** Meadow trees per square metre. */
const TREES: Record<TreeAmount, number> = { none: 0, few: .0025, many: .008 };
/** How deep the forest wall is. */
const WALL = 12;

export type Tree = { x: number; z: number; kind: number; variant: number; yaw: number; scale: number };
export type Prop = { x: number; z: number; yaw: number; scale: number; variant: number };
/** Something round to bump into and shoot into. `soft` only stops walking (a pond). */
export type Obstacle = { x: number; z: number; radius: number; height: number; soft?: boolean };
export type Spawn = { x: number; z: number; yaw: number };
/** A model from `asset/models` standing in the field. `y` is where its bottom sits. `bright` lifts dark packs. */
export type Placed = { model: ModelName; x: number; y: number; z: number; yaw: number; scale: number; bright?: number };
/**
 * A box that blocks walking and arrows, turned by `yaw` around y: `hx`, `hz` are half its size along its own
 * x and z, from `bottom` to `top`. A `floor` can be stood on (a tower's platform). A `rail` only stops walking,
 * shots go between its bars.
 */
export type Block = { x: number; z: number; yaw: number; hx: number; hz: number; bottom: number; top: number; floor?: boolean; rail?: boolean };
/** The ground made level: `level` inside `radius`, easing back to the hills over `blend` metres. */
export type Flat = { x: number; z: number; radius: number; level: number; blend: number };
/** Water at `level`, a shallow bowl under it. Walked in slowly, arrows sink. */
export type Pond = { x: number; z: number; radius: number; level: number };
/** Where a watch tower's ladder is: a box to climb in (same shape as a block), up to `top`. `tx, tz` is the tower. */
export type Ladder = { x: number; z: number; yaw: number; hx: number; hz: number; bottom: number; top: number; tx: number; tz: number };
/** A patch of the ground in another colour (fields of dirt), a box like a block. */
export type Patch = { x: number; z: number; yaw: number; hx: number; hz: number; colour: [number, number, number] };

/** A cobbled street from `a` to `b`, `width` across, drawn on the ground. Stops nothing. */
export type Street = { ax: number; az: number; bx: number; bz: number; width: number };
/** A round cobbled place where streets meet, or a square. */
export type Junction = { x: number; z: number; radius: number };

/** Metres a foot can step up onto a floor (and how far under its top a block stops counting). */
export const STEP_UP = .45;
/** Metres the round cobbled places stand over the ground, over the streets' kerbs; walked on. */
export const SQUARE_LIFT = .13;
/** How tall a player is for blocks: a box higher than this over the feet is walked under. */
const TALL = 1.5;

/** Tree kinds have this many looks each. */
export const VARIANTS = 2;
/** Stones have this many looks. */
export const STONES = 3;

/**
 * The meadow from a seed: every phone that gets the same setting builds the same field. Circular, with the
 * forest wall around it. Units are metres, y is up, the middle is 0, 0.
 */
export class Field {
    readonly seed: number;
    readonly radius: number;
    readonly trees: Tree[] = [];
    readonly wall: Tree[] = [];
    readonly grass: Prop[] = [];
    readonly flowers: (Prop & { colour: number })[] = [];
    readonly mushrooms: Prop[] = [];
    readonly stones: Prop[] = [];
    readonly logs: Prop[] = [];
    readonly stumps: Prop[] = [];
    readonly obstacles: Obstacle[] = [];
    readonly map: MapKind;
    readonly models: Placed[] = [];
    readonly blocks: Block[] = [];
    readonly flats: Flat[] = [];
    readonly ponds: Pond[] = [];
    readonly ladders: Ladder[] = [];
    readonly patches: Patch[] = [];
    readonly streets: Street[] = [];
    readonly junctions: Junction[] = [];
    /** Where the maps' model trees stand, so no tree grows into another. */
    readonly treeSpots: { x: number; z: number }[] = [];
    /** Places taken by something big (buildings, ponds, streets), so the small things keep out. */
    readonly taken: { x: number; z: number; radius: number }[] = [];
    /** How rolling the ground is, 1 is the meadow. */
    hills = 1;
    private noise: (x: number, z: number) => number;

    constructor(setting: FieldSetting) {
        this.seed = setting.seed >>> 0;
        this.radius = RADIUS[setting.size ?? "medium"];
        this.noise = valueNoise(this.seed);
        this.map = setting.map ?? "field";
        const random = seeded(this.seed ^ 0x9e3779b9);
        const r = this.radius;
        const area = Math.PI * r * r;

        // the map's own: buildings, streets, ponds, fields, towers, props (`maps.ts`)
        layout(this, seeded(this.seed ^ 0x3c6ef372), setting);

        // trees in the meadow, apart from each other and from what the map put down
        const wanted = Math.round(area * TREES[setting.trees ?? "few"] * (this.map === "city" ? .4 : 1));
        for (let tries = 0; this.trees.length < wanted && tries < wanted * 30; tries++)
        {
            const [x, z] = inDisc(random, r - 3);
            if (this.crowded(x, z) || !this.open(x, z, 1.5)) continue;
            this.trees.push(this.tree(random, x, z));
        }

        // the forest wall, dense, from just outside the edge
        for (let tries = 0; tries < Math.PI * ((r + WALL) ** 2 - r * r) / 6; tries++)
        {
            const angle = random() * Math.PI * 2;
            const distance = r + 1.2 + Math.sqrt(random()) * WALL;
            const x = Math.cos(angle) * distance, z = Math.sin(angle) * distance;
            if (this.wall.some(tree => (tree.x - x) ** 2 + (tree.z - z) ** 2 < 5.5)) continue;
            this.wall.push(this.tree(random, x, z, 1.1 + random() * .5));
        }

        for (const tree of this.trees) this.obstacles.push({ x: tree.x, z: tree.z, radius: .28 * tree.scale, height: 3 * tree.scale });

        // a few logs and stumps for cover
        for (let i = 0, count = 1 + Math.floor(r / 20); i < count; i++)
        {
            const [x, z] = this.free(random, r - 4, 3);
            const log = { x, z, yaw: random() * Math.PI, scale: .9 + random() * .3, variant: 0 };
            this.logs.push(log);
            // the log is 3 m long along its own x, three circles cover it
            for (const along of [-1.1, 0, 1.1])
            {
                const a = along * log.scale;
                this.obstacles.push({ x: x + Math.cos(log.yaw) * a, z: z - Math.sin(log.yaw) * a, radius: .34 * log.scale, height: .6 * log.scale });
            }
        }
        for (let i = 0, count = 2 + Math.floor(r / 15); i < count; i++)
        {
            const [x, z] = this.free(random, r - 2, 2);
            const scale = .8 + random() * .5;
            this.stumps.push({ x, z, yaw: random() * 6, scale, variant: 0 });
            this.obstacles.push({ x, z, radius: .36 * scale, height: .45 * scale });
        }

        // the small things, everywhere
        for (let i = 0, count = Math.round(area * .004); i < count; i++)
        {
            const [x, z] = inDisc(random, r);
            if (!this.open(x, z, .3)) continue;
            this.stones.push({ x, z, yaw: random() * 6, scale: .6 + random() * 1.2, variant: Math.floor(random() * STONES) });
        }
        for (const tree of [...this.trees, ...this.wall.filter((_, i) => i % 4 === 0)])
        {
            if (random() > .5) continue;
            for (let i = 0, count = 1 + Math.floor(random() * 4); i < count; i++)
            {
                const angle = random() * Math.PI * 2, distance = .7 + random() * 1.6;
                if (!this.open(tree.x + Math.cos(angle) * distance, tree.z + Math.sin(angle) * distance, .2)) continue;
                this.mushrooms.push({ x: tree.x + Math.cos(angle) * distance, z: tree.z + Math.sin(angle) * distance, yaw: random() * 6, scale: .7 + random() * .7, variant: 0 });
            }
        }
        for (let i = 0, count = Math.round(area * .05); i < count; i++)
        {
            // flowers grow in patches of one colour
            const [x, z] = inDisc(random, r);
            const patch = this.noise(x / 9 + 50, z / 9 + 50);
            if (random() > patch * 1.6 * (this.map === "city" ? .3 : 1) || !this.open(x, z, .2)) continue;
            this.flowers.push({ x, z, yaw: random() * 6, scale: .8 + random() * .5, variant: 0, colour: Math.floor((this.noise(x / 14 - 20, z / 14) * 5)) % 5 });
        }
        for (let i = 0, count = Math.min(7000, Math.round(area * .85)); i < count; i++)
        {
            const [x, z] = inDisc(random, r + 2);
            if (!this.open(x, z, .1)) continue;
            this.grass.push({ x, z, yaw: random() * 6, scale: .7 + random() * .7, variant: 0 });
        }
    }

    /** Smooth 0..1 noise of this field, for colour patches. */
    patch(x: number, z: number) {
        return this.noise(x / 11 - 70, z / 11 + 40);
    }

    /** Ground height: rolling hills to hide behind and shoot down from, rising into the forest. */
    height(x: number, z: number) {
        let height = this.rolling(x, z);
        for (const flat of this.flats)
        {
            const dx = x - flat.x, dz = z - flat.z;
            const reach = flat.radius + flat.blend;
            if (dx * dx + dz * dz >= reach * reach) continue;
            const distance = Math.sqrt(dx * dx + dz * dz);
            const t = distance <= flat.radius ? 1 : 1 - (distance - flat.radius) / flat.blend;
            height += (flat.level - height) * t * t * (3 - 2 * t);
        }
        for (const pond of this.ponds)
        {
            const d2 = ((x - pond.x) ** 2 + (z - pond.z) ** 2) / (pond.radius * pond.radius);
            // a bowl from just over the water at the rim down to 70 cm under it, shallow enough to wade
            if (d2 < 1.3) height = Math.min(height, pond.level + .2 - .9 * Math.max(0, 1 - d2));
        }
        return height;
    }

    /** How deep the water is at `x, z`, 0 out of the ponds. */
    depth(x: number, z: number) {
        let depth = 0;
        for (const pond of this.ponds)
        {
            if ((x - pond.x) ** 2 + (z - pond.z) ** 2 > (pond.radius * 1.15) ** 2) continue;
            depth = Math.max(depth, pond.level - this.height(x, z));
        }
        return depth;
    }

    /** How fast one walks at `x, z`, 1 on land, down to about half in the deepest water. */
    wade(x: number, z: number) {
        return 1 - Math.min(.5, this.depth(x, z) * .75);
    }

    /** The hills alone, before anything was levelled. */
    rolling(x: number, z: number) {
        // big slow swells, smaller humps on them, a little roughness; never steeper than about 1 in 3
        const hills = (this.noise(x / 30 - 9, z / 30 + 4) * 4.6
            + this.noise(x / 13 + 7, z / 13 - 3) * 1.6
            + this.noise(x / 6 + 31, z / 6 - 17) * .3) * this.hills;
        const out = Math.hypot(x, z) - (this.radius - 4);
        return hills + (out > 0 ? (out / 14) ** 2 * 3 : 0);
    }

    /**
     * What a foot at `x, z` stands on, coming from height `y`: the ground, or a floor (a tower's platform)
     * that's under the feet or a step up.
     */
    floor(x: number, z: number, y = -Infinity) {
        let floor = this.height(x, z);
        for (const junction of this.junctions) if ((junction.x - x) ** 2 + (junction.z - z) ** 2 < (junction.radius + .3) ** 2) { floor += SQUARE_LIFT; break; }
        for (const block of this.blocks)
        {
            if (!block.floor || block.top <= floor || block.top > y + STEP_UP || !inside(block, x, z, 0)) continue;
            floor = block.top;
        }
        return floor;
    }

    /** Where rain coming down at `x, z` lands: the top of what's there (a roof, a cart), else the ground. */
    roof(x: number, z: number) {
        let top = this.height(x, z);
        for (const block of this.blocks) if (block.top > top && inside(block, x, z, 0)) top = block.top;
        return top;
    }

    /** The ladder at `x, z`, if a player there can climb. */
    ladderAt(x: number, z: number) {
        return this.ladders.find(ladder => inside(ladder, x, z, 0)) ?? null;
    }

    /** Whether nothing big (a building, a pond, a street) is within `space` of `x, z`. */
    open(x: number, z: number, space = 0) {
        for (const one of this.taken) if ((one.x - x) ** 2 + (one.z - z) ** 2 < (one.radius + space) ** 2) return false;
        for (const pond of this.ponds) if ((pond.x - x) ** 2 + (pond.z - z) ** 2 < (pond.radius + space) ** 2) return false;
        for (const block of this.blocks) if (inside(block, x, z, space)) return false;
        return true;
    }

    /** Whether a tree at `x, z` would stand closer than 5 m to another, the meadow's or a model. */
    crowded(x: number, z: number) {
        return [...this.trees, ...this.treeSpots].some(tree => (tree.x - x) ** 2 + (tree.z - z) ** 2 < 25);
    }

    /** Whether `x, z` is on a street or a square (footsteps on stone there). */
    paved(x: number, z: number) {
        for (const junction of this.junctions) if ((junction.x - x) ** 2 + (junction.z - z) ** 2 < junction.radius ** 2) return true;
        for (const street of this.streets)
        {
            const dx = street.bx - street.ax, dz = street.bz - street.az, length2 = dx * dx + dz * dz || 1;
            const t = Math.max(0, Math.min(1, ((x - street.ax) * dx + (z - street.az) * dz) / length2));
            if (Math.hypot(street.ax + dx * t - x, street.az + dz * t - z) < street.width / 2) return true;
        }
        return false;
    }

    /** The colour of a dirt patch at `x, z`, or null for the meadow's own. */
    patchColour(x: number, z: number) {
        for (const patch of this.patches) if (inside(patch, x, z, 0)) return patch.colour;
        return null;
    }

    /**
     * Pushes a circle at `x, z` out of every obstacle and block and back inside the edge. `y` is where the
     * feet are: a block under them or high over the head lets them by (a tower's platform, walked under).
     */
    collide(x: number, z: number, radius: number, y?: number): [number, number] {
        for (const block of this.blocks)
        {
            if (y !== undefined && (y > block.top - STEP_UP || y + TALL < block.bottom)) continue;
            [x, z] = pushOut(block, x, z, radius);
        }
        for (const obstacle of this.obstacles)
        {
            const dx = x - obstacle.x, dz = z - obstacle.z;
            const reach = obstacle.radius + radius;
            if (y !== undefined && y > this.height(obstacle.x, obstacle.z) + obstacle.height) continue;
            const distance = dx * dx + dz * dz;
            if (distance >= reach * reach) continue;
            const length = Math.sqrt(distance) || 1e-6;
            x = obstacle.x + dx / length * reach;
            z = obstacle.z + dz / length * reach;
        }
        const edge = this.radius - radius;
        const from = Math.hypot(x, z);
        if (from > edge)
        {
            x *= edge / from;
            z *= edge / from;
        }
        return [x, z];
    }

    /**
     * Where everyone starts: spread on a ring around the middle, each team together, facing in.
     * Players come in a fixed order (the host's list), so every phone gets the same answer.
     */
    spawns(players: { id: string; team: string | null }[]): Record<string, Spawn> {
        const random = seeded(this.seed ^ 0x51ed27);
        const groups: string[][] = [];
        const byTeam = new Map<string, string[]>();
        for (const player of players)
        {
            if (!player.team) groups.push([player.id]);
            else if (byTeam.has(player.team)) byTeam.get(player.team)!.push(player.id);
            else
            {
                const team = [player.id];
                byTeam.set(player.team, team);
                groups.push(team);
            }
        }

        const spawns: Record<string, Spawn> = {};
        const start = random() * Math.PI * 2;
        // one ring at 70%; more sides than fit `SPACING` apart (bots) fill rings further in, by their length
        const rings = [.7, .45, .22].map(k => this.radius * k);
        const fits = (ring: number) => Math.max(1, Math.floor(Math.PI * 2 * ring / SPACING));
        const used = groups.length <= fits(rings[0]) ? [rings[0]] : rings;
        const total = used.reduce((sum, ring) => sum + ring, 0);
        let g = 0;
        used.forEach((ring, r) => {
            const count = r === used.length - 1 ? groups.length - g : Math.round(groups.length * ring / total);
            const offset = start + r * .7;
            for (let n = 0; n < count; n++, g++)
            {
                const group = groups[g], angle = offset + n / count * Math.PI * 2;
                group.forEach((id, i) => {
                    // members side by side along the ring, 2.5 m apart, in rows of 8 going in
                    const row = Math.floor(i / 8), across = Math.min(8, group.length - row * 8), here = Math.max(4, ring - row * 2.5);
                    const along = (i % 8 - (across - 1) / 2) * 2.5 / here;
                    let x = Math.cos(angle + along) * here, z = Math.sin(angle + along) * here;
                    [x, z] = this.collide(x, z, .6);
                    spawns[id] = { x, z, yaw: Math.atan2(x, z) };
                });
            }
        });
        return spawns;
    }

    private tree(random: () => number, x: number, z: number, grow = 1): Tree {
        return { x, z, kind: Math.floor(random() * 3), variant: Math.floor(random() * VARIANTS), yaw: random() * Math.PI * 2, scale: (.85 + random() * .4) * grow };
    }

    /** A spot `space` metres away from every obstacle so far. */
    private free(random: () => number, within: number, space: number): [number, number] {
        for (let tries = 0; tries < 50; tries++)
        {
            const [x, z] = inDisc(random, within);
            if (this.obstacles.every(o => (o.x - x) ** 2 + (o.z - z) ** 2 > (o.radius + space) ** 2) && this.open(x, z, space)) return [x, z];
        }
        return inDisc(random, within);
    }
}

/** Whether `x, z` is in a turned box, grown by `margin`. */
export function inside(box: { x: number; z: number; yaw: number; hx: number; hz: number }, x: number, z: number, margin: number) {
    const dx = x - box.x, dz = z - box.z;
    const c = Math.cos(box.yaw), s = Math.sin(box.yaw);
    // into the box's own axes: its x is (cos, -sin), its z is (sin, cos) for a yaw about y
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    return Math.abs(lx) < box.hx + margin && Math.abs(lz) < box.hz + margin;
}

/** A circle pushed out of a turned box, sideways the shortest way. */
function pushOut(box: Block, x: number, z: number, radius: number): [number, number] {
    const dx = x - box.x, dz = z - box.z;
    const c = Math.cos(box.yaw), s = Math.sin(box.yaw);
    let lx = dx * c - dz * s, lz = dx * s + dz * c;
    if (Math.abs(lx) >= box.hx + radius || Math.abs(lz) >= box.hz + radius) return [x, z];
    const nx = Math.max(-box.hx, Math.min(box.hx, lx)), nz = Math.max(-box.hz, Math.min(box.hz, lz));
    const ox = lx - nx, oz = lz - nz;
    const out = Math.hypot(ox, oz);
    if (out >= radius) return [x, z];
    if (out > 1e-6)
    {
        lx = nx + ox / out * radius;
        lz = nz + oz / out * radius;
    }
    // the middle is inside: out through the nearest side
    else if (box.hx - Math.abs(lx) < box.hz - Math.abs(lz)) lx = Math.sign(lx || 1) * (box.hx + radius);
    else lz = Math.sign(lz || 1) * (box.hz + radius);
    // back to the world: the inverse turn
    return [box.x + lx * c + lz * s, box.z - lx * s + lz * c];
}

export function inDisc(random: () => number, radius: number): [number, number] {
    const angle = random() * Math.PI * 2, distance = Math.sqrt(random()) * radius;
    return [Math.cos(angle) * distance, Math.sin(angle) * distance];
}

/** Smooth 0..1 noise on a grid, the same for the same seed. */
function valueNoise(seed: number) {
    const random = seeded(seed);
    const size = 256;
    const values = Float32Array.from({ length: size }, () => random());
    const perm = Uint8Array.from({ length: size }, (_, i) => i);
    for (let i = size - 1; i > 0; i--)
    {
        const j = Math.floor(random() * (i + 1));
        [perm[i], perm[j]] = [perm[j], perm[i]];
    }
    const at = (x: number, z: number) => values[perm[(perm[x & 255] + z) & 255]];
    const smooth = (t: number) => t * t * (3 - 2 * t);
    return (x: number, z: number) => {
        const x0 = Math.floor(x), z0 = Math.floor(z);
        const tx = smooth(x - x0), tz = smooth(z - z0);
        const a = at(x0, z0), b = at(x0 + 1, z0), c = at(x0, z0 + 1), d = at(x0 + 1, z0 + 1);
        return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
    };
}
