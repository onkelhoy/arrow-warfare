import { seeded } from "@arrow-warfare/render";

export type MapSize = "small" | "medium" | "large";
export type TreeAmount = "none" | "few" | "many";

export type FieldSetting = {
    seed: number;
    size?: MapSize;
    trees?: TreeAmount;
};

/** Metres from the middle to the forest edge. */
export const RADIUS: Record<MapSize, number> = { small: 28, medium: 42, large: 60 };
/** Meadow trees per square metre. */
const TREES: Record<TreeAmount, number> = { none: 0, few: .0025, many: .008 };
/** How deep the forest wall is. */
const WALL = 12;

export type Tree = { x: number; z: number; kind: number; variant: number; yaw: number; scale: number };
export type Prop = { x: number; z: number; yaw: number; scale: number; variant: number };
/** Something round to bump into and, later, shoot into. */
export type Obstacle = { x: number; z: number; radius: number; height: number };
export type Spawn = { x: number; z: number; yaw: number };

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
    private noise: (x: number, z: number) => number;

    constructor(setting: FieldSetting) {
        this.seed = setting.seed >>> 0;
        this.radius = RADIUS[setting.size ?? "medium"];
        this.noise = valueNoise(this.seed);
        const random = seeded(this.seed ^ 0x9e3779b9);
        const r = this.radius;
        const area = Math.PI * r * r;

        // trees in the meadow, apart from each other
        const wanted = Math.round(area * TREES[setting.trees ?? "few"]);
        for (let tries = 0; this.trees.length < wanted && tries < wanted * 30; tries++)
        {
            const [x, z] = inDisc(random, r - 3);
            if (this.trees.some(tree => (tree.x - x) ** 2 + (tree.z - z) ** 2 < 25)) continue;
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
            this.stones.push({ x, z, yaw: random() * 6, scale: .6 + random() * 1.2, variant: Math.floor(random() * STONES) });
        }
        for (const tree of [...this.trees, ...this.wall.filter((_, i) => i % 4 === 0)])
        {
            if (random() > .5) continue;
            for (let i = 0, count = 1 + Math.floor(random() * 4); i < count; i++)
            {
                const angle = random() * Math.PI * 2, distance = .7 + random() * 1.6;
                this.mushrooms.push({ x: tree.x + Math.cos(angle) * distance, z: tree.z + Math.sin(angle) * distance, yaw: random() * 6, scale: .7 + random() * .7, variant: 0 });
            }
        }
        for (let i = 0, count = Math.round(area * .05); i < count; i++)
        {
            // flowers grow in patches of one colour
            const [x, z] = inDisc(random, r);
            const patch = this.noise(x / 9 + 50, z / 9 + 50);
            if (random() > patch * 1.6) continue;
            this.flowers.push({ x, z, yaw: random() * 6, scale: .8 + random() * .5, variant: 0, colour: Math.floor((this.noise(x / 14 - 20, z / 14) * 5)) % 5 });
        }
        for (let i = 0, count = Math.min(7000, Math.round(area * .85)); i < count; i++)
        {
            const [x, z] = inDisc(random, r + 2);
            this.grass.push({ x, z, yaw: random() * 6, scale: .7 + random() * .7, variant: 0 });
        }
    }

    /** Smooth 0..1 noise of this field, for colour patches. */
    patch(x: number, z: number) {
        return this.noise(x / 11 - 70, z / 11 + 40);
    }

    /** Ground height: gentle hills, rising into the forest. */
    height(x: number, z: number) {
        const hills = this.noise(x / 22, z / 22) * 1.4 + this.noise(x / 8 + 31, z / 8 - 17) * .35;
        const out = Math.hypot(x, z) - (this.radius - 4);
        return hills + (out > 0 ? (out / 14) ** 2 * 3 : 0);
    }

    /** Pushes a circle at `x, z` out of every obstacle and back inside the edge. */
    collide(x: number, z: number, radius: number): [number, number] {
        for (const obstacle of this.obstacles)
        {
            const dx = x - obstacle.x, dz = z - obstacle.z;
            const reach = obstacle.radius + radius;
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
        const ring = this.radius * .7;
        const start = random() * Math.PI * 2;
        groups.forEach((group, g) => {
            const angle = start + g / groups.length * Math.PI * 2;
            group.forEach((id, i) => {
                // members side by side along the ring, 2.5 m apart
                const along = (i - (group.length - 1) / 2) * 2.5 / ring;
                let x = Math.cos(angle + along) * ring, z = Math.sin(angle + along) * ring;
                [x, z] = this.collide(x, z, .6);
                spawns[id] = { x, z, yaw: Math.atan2(x, z) };
            });
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
            if (this.obstacles.every(o => (o.x - x) ** 2 + (o.z - z) ** 2 > (o.radius + space) ** 2)) return [x, z];
        }
        return inDisc(random, within);
    }
}

function inDisc(random: () => number, radius: number): [number, number] {
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
