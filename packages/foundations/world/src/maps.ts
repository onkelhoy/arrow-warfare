import { IrregularGrid } from "@papit/irregular-grid";

import type { ModelName } from "./catalog";
import { sizeOf } from "./files";
import { inDisc, inside, type Field, type FieldSetting, type Placed, type TreeAmount } from "./field";

/**
 * What each map puts in the field from the seed, before the trees and the small things: buildings, streets,
 * fields, ponds, watch towers and props. Everything big also goes in `field.blocks` (walking and arrows)
 * and `field.taken` (so grass and trees keep out), and levels the ground under it (`field.flats`).
 */

type Random = () => number;

/** The nature pack is darker than our meadow, its models are drawn a little brighter. */
const NATURE_BRIGHT = 1.25;
/** Fraction of a building's bounds that blocks: eaves and steps stick out past the walls. */
const WALLS = .82;

const TREES: ModelName[] = [
    "nature/CommonTree_1", "nature/CommonTree_2", "nature/CommonTree_3", "nature/CommonTree_4", "nature/CommonTree_5",
    "nature/BirchTree_1", "nature/BirchTree_2", "nature/BirchTree_3", "nature/BirchTree_5",
    "nature/PineTree_2", "nature/PineTree_3", "nature/PineTree_4",
];
const WILLOWS: ModelName[] = ["nature/Willow_1", "nature/Willow_2", "nature/Willow_4"];
const ROCKS: ModelName[] = ["nature/Rock_Moss_1", "nature/Rock_Moss_2", "nature/Rock_Moss_3", "nature/Rock_Moss_4", "nature/Rock_Moss_5", "nature/Rock_Moss_6", "nature/Rock_Moss_7", "nature/Rock_4", "nature/Rock_6"];
const BUSHES: ModelName[] = ["nature/Bush_1", "nature/Bush_2", "nature/BushBerries_1", "nature/BushBerries_2", "nature/Plant_3", "nature/Plant_5"];
const COUNTRY_HOUSES: ModelName[] = ["buildings/cabin", "buildings/cabin-2", "buildings/cottage", "buildings/cottage-2", "buildings/stone-house", "buildings/stone-house-2"];
const BARNS: ModelName[] = ["buildings/barracks", "buildings/smithy", "buildings/cabin", "buildings/cabin-2"];
const TOWN_HOUSES: ModelName[] = [
    "buildings/townhouse", "buildings/townhouse-2", "buildings/townhouse-3", "buildings/timber-house", "buildings/timber-house-2",
    "buildings/brick-house", "buildings/brick-house-2", "buildings/stone-house", "buildings/stone-house-2", "buildings/tavern",
    "buildings/bakery", "buildings/general-store", "buildings/bank", "buildings/corner-house",
];
/** The Buildings Pack's tall town houses, mixed in with the others in the city. */
const CITY_HOUSES: ModelName[] = [
    ...TOWN_HOUSES, "buildings/city-long", "buildings/city-narrow", "buildings/city-gable-long", "buildings/city-gable",
    "buildings/city-brick", "buildings/city-brick-narrow", "buildings/city-manor",
];
/** Metres across a street, kerbs and all. */
const STREET = 4.6;
const FARM_PROPS: ModelName[] = ["props/hay", "props/bale", "props/bale", "props/cart-hay", "props/cart-sacks", "props/barrel", "props/crate", "props/sack", "props/pumpkin", "props/big-pumpkin"];
const TOWN_PROPS: ModelName[] = ["props/barrel", "props/crate", "props/sack", "props/bench", "props/street-lamp", "props/food-cart", "props/cart-sacks", "props/basket", "props/bucket"];
const STALLS: ModelName[] = ["props/fruit-stall", "props/bread-stall", "props/cloth-stall", "props/fish-stall"];

const AMOUNT: Record<TreeAmount, number> = { none: 0, few: 1, many: 2.2 };

export function layout(field: Field, random: Random, setting: FieldSetting) {
    const scale = field.radius / 42;
    const buildings = AMOUNT[setting.buildings ?? "few"];
    const props = AMOUNT[setting.props ?? "few"];
    const towers = Math.round(AMOUNT[setting.towers ?? "none"] * (1 + scale));

    if (field.map === "city") city(field, random, buildings);
    else if (field.map === "farm") farm(field, random, scale, buildings);
    else meadow(field, random, scale, buildings);

    for (let i = 0; i < towers; i++)
    {
        const spot = space(field, random, field.radius - 6, 3.2);
        if (spot) tower(field, spot[0], spot[1], Math.atan2(-spot[0], -spot[1]) + Math.PI);
    }

    // cover for everyone: rocks and bushes, and the map's own things
    const things = Math.round(props * 14 * scale * scale);
    for (let i = 0; i < things; i++)
    {
        const spot = space(field, random, field.radius - 2, 1.2);
        if (!spot) continue;
        const roll = random();
        if (roll < .4) rock(field, random, spot[0], spot[1]);
        else if (roll < .75 || field.map === "field") bush(field, random, spot[0], spot[1]);
        else prop(field, pick(random, field.map === "farm" ? FARM_PROPS : TOWN_PROPS), spot[0], spot[1], random() * Math.PI * 2);
    }
    // a few nature trees among the meadow's own
    if (field.map !== "city")
        for (let i = 0, count = Math.round(4 * scale * scale * (setting.trees === "none" ? 0 : setting.trees === "many" ? 2.5 : 1)); i < count; i++)
        {
            const spot = space(field, random, field.radius - 3, 2.5);
            if (spot) tree(field, random, spot[0], spot[1]);
        }
}

// ------------------------------------------------------------------ the maps

/** The meadow with ponds and lily pads, and a few cottages if buildings are on. */
function meadow(field: Field, random: Random, scale: number, buildings: number) {
    for (let i = 0, count = Math.max(1, Math.round(1.5 * scale)); i < count; i++)
    {
        const radius = 3 + random() * 2.5;
        // never in the middle, the views and the first steps are there
        const spot = space(field, random, field.radius - radius - 4, radius + 2);
        if (spot && Math.hypot(spot[0], spot[1]) > radius + 6) pond(field, random, spot[0], spot[1], radius);
    }
    for (let i = 0, count = Math.round(buildings * 2 * scale); i < count; i++)
    {
        const spot = space(field, random, field.radius - 8, 5);
        if (spot) building(field, pick(random, COUNTRY_HOUSES), spot[0], spot[1], random() * Math.PI * 2);
    }
}

/** A farmyard in the middle, fenced fields of corn and wheat around it, hay and carts. */
function farm(field: Field, random: Random, scale: number, buildings: number) {
    field.hills = .55;
    const turn = random() * Math.PI * 2;
    const at = (x: number, z: number): [number, number] => [x * Math.cos(turn) + z * Math.sin(turn), -x * Math.sin(turn) + z * Math.cos(turn)];

    // the yard: the farmhouse, a barn across from it, a well between
    const [hx, hz] = at(-6, 0);
    building(field, "buildings/farmhouse", hx, hz, turn + Math.PI / 2);
    const [bx, bz] = at(6.5, 0);
    building(field, pick(random, BARNS), bx, bz, turn - Math.PI / 2);
    const [wx, wz] = at(0, 3);
    prop(field, "props/well", wx, wz, turn);
    for (let i = 0, count = 3 + Math.round(buildings * 2); i < count; i++)
    {
        const [x, z] = at((random() - .5) * 8, (random() - .5) * 8 - 2);
        if (field.open(x, z, 1)) prop(field, pick(random, FARM_PROPS), x, z, random() * Math.PI * 2);
    }

    // fields of crops in rows, each in its own patch of dirt and fenced on two sides
    const fields = Math.round(3 + 2 * scale);
    for (let i = 0; i < fields; i++)
    {
        const width = 9 + random() * 5, depth = 6 + random() * 4;
        const spot = space(field, random, field.radius - Math.max(width, depth) / 2 - 3, Math.max(width, depth) / 2 + 1.5);
        if (!spot) continue;
        crops(field, random, spot[0], spot[1], turn + (random() < .5 ? 0 : Math.PI / 2), width, depth, random() < .55 ? "corn" : "wheat");
    }
    // more barns and sheds out in the country
    for (let i = 0, count = Math.round(buildings * 1.5 * scale); i < count; i++)
    {
        const spot = space(field, random, field.radius - 8, 5);
        if (spot) building(field, pick(random, [...BARNS, ...COUNTRY_HOUSES]), spot[0], spot[1], turn + Math.round(random() * 4) * Math.PI / 2);
    }
}

/**
 * A town on an irregular grid (`@papit/irregular-grid`): its cells are blocks, its edges crooked streets that
 * meet at odd angles. Houses stand along each block's edges facing the street, a square with a well and
 * stalls where the streets meet in the middle, the chapel in a block of its own.
 */
function city(field: Field, random: Random, buildings: number) {
    field.hills = .12;
    const reach = field.radius - 6;
    const level = field.rolling(0, 0);
    field.flats.push({ x: 0, z: 0, radius: reach, level, blend: 8 });

    // one hexagon of blocks, about 18 m across on a medium map, turned any way
    const grid = IrregularGrid.hex({ radius: 1, size: Math.max(38, reach + 8), seed: Math.floor(random() * 2 ** 31), relax: 6, merge: .6 });
    const turn = random() * Math.PI * 2, c = Math.cos(turn), s = Math.sin(turn);
    const vertex = (v: number): [number, number] => {
        const x = grid.positions[v * 2], y = grid.positions[v * 2 + 1];
        return [x * c - y * s, x * s + y * c];
    };
    const half = STREET / 2;

    // streets along every edge, cut off at the edge of town
    for (let e = 0; e < grid.edgeCount; e++)
    {
        const clipped = clip(vertex(grid.edges[e * 2]), vertex(grid.edges[e * 2 + 1]), reach);
        if (!clipped) continue;
        const [[ax, az], [bx, bz]] = clipped;
        field.streets.push({ ax, az, bx, bz, width: STREET });
        const length = Math.hypot(bx - ax, bz - az);
        for (let t = 0; t <= length; t += 2) field.taken.push({ x: ax + (bx - ax) * t / length, z: az + (bz - az) * t / length, radius: half + .3 });
    }

    // where they meet: wide enough to cover the overlap of the sharpest pair
    let middle = 0;
    for (let v = 0; v < grid.vertexCount; v++)
    {
        const [x, z] = vertex(v);
        if (Math.hypot(x, z) < Math.hypot(...vertex(middle))) middle = v;
        if (Math.hypot(x, z) > reach) continue;
        const angles = [...grid.neighboursOfVertex(v)].map(n => {
            const [nx, nz] = vertex(n);
            return Math.atan2(nz - z, nx - x);
        }).sort((a, b) => a - b);
        let sharpest = Math.PI;
        angles.forEach((angle, i) => sharpest = Math.min(sharpest, ((angles[(i + 1) % angles.length] - angle) + Math.PI * 2) % (Math.PI * 2) || Math.PI * 2));
        const radius = Math.min(5, Math.max(half * 1.2, half / Math.tan(sharpest / 2) + .3));
        field.junctions.push({ x, z, radius });
        field.taken.push({ x, z, radius });
    }

    // the square where the middle streets meet: a well, stalls between the streets
    const [mx, mz] = vertex(middle);
    field.junctions.push({ x: mx, z: mz, radius: 8 });
    field.taken.push({ x: mx, z: mz, radius: 8.5 });
    prop(field, "props/well", mx, mz, turn);
    const ways = [...grid.neighboursOfVertex(middle)].map(n => {
        const [nx, nz] = vertex(n);
        return Math.atan2(nz - mz, nx - mx);
    }).sort((a, b) => a - b);
    ways.forEach((way, i) => {
        const next = i + 1 < ways.length ? ways[i + 1] : ways[0] + Math.PI * 2;
        const angle = (way + next) / 2;
        const x = mx + Math.cos(angle) * 5.6, z = mz + Math.sin(angle) * 5.6;
        // its front to the well
        prop(field, STALLS[i % STALLS.length], x, z, Math.atan2(mx - x, mz - z));
    });

    // the blocks: corners round each, the middle of it
    const blocks = Array.from({ length: grid.cellCount }, (_, cell) => {
        const corners = [...grid.cornersOf(cell)].map(vertex);
        const centre: [number, number] = [corners.reduce((sum, p) => sum + p[0], 0) / 4, corners.reduce((sum, p) => sum + p[1], 0) / 4];
        return { corners, centre };
    }).filter(block => Math.hypot(...block.centre) < reach);

    // the chapel in a block of its own, facing its nearest street
    const away = blocks.filter(block => Math.hypot(...block.centre) > 12);
    const chapel = away[Math.floor(random() * away.length)];
    if (chapel)
    {
        const [x, z] = chapel.centre;
        const [fx, fz] = nearestEdge(chapel.corners, x, z);
        if (field.open(x, z, 4)) building(field, "buildings/chapel", x, z, Math.atan2(fx - x, fz - z));
    }

    // houses along each edge of each block, a little gap between, some left out for alleys and yards
    const fill = .5 + buildings * .2;
    for (const block of blocks)
    {
        for (let i = 0; i < 4; i++)
        {
            const [px, pz] = block.corners[i], [qx, qz] = block.corners[(i + 1) % 4];
            const length = Math.hypot(qx - px, qz - pz);
            const ux = (qx - px) / length, uz = (qz - pz) / length;
            // in, towards the middle of the block
            let nx = -uz, nz = ux;
            if ((block.centre[0] - px) * nx + (block.centre[1] - pz) * nz < 0) [nx, nz] = [-nx, -nz];
            const yaw = Math.atan2(-nx, -nz);
            const end = length - half - 1;
            for (let along = half + 1; along < end;)
            {
                if (random() > fill)
                {
                    along += 3 + random() * 3;
                    continue;
                }
                const fits = CITY_HOUSES.filter(model => sizeOf(model).width * .92 <= end - along);
                if (!fits.length) break;
                const model = pick(random, fits), size = sizeOf(model);
                const width = size.width * .92, depth = size.depth;
                const back = half + .5 + depth / 2;
                const x = px + ux * (along + width / 2) + nx * back, z = pz + uz * (along + width / 2) + nz * back;
                // the whole footprint clear of streets and other houses, inside the town
                const free = Math.hypot(x, z) < reach - 2 && [[-1, -1], [-1, 1], [1, -1], [1, 1], [0, 0]].every(([a, b]) => {
                    const cx = x + ux * a * width * .45 + nx * b * depth * .42, cz = z + uz * a * width * .45 + nz * b * depth * .42;
                    return clear(field, cx, cz);
                });
                if (free)
                {
                    building(field, model, x, z, yaw);
                    along += width + .4 + random() * 1.6;
                }
                else along += 2;
            }
        }
    }
}

/** Whether `x, z` is off every street and junction and outside every block. */
function clear(field: Field, x: number, z: number) {
    for (const block of field.blocks) if (inside(block, x, z, .2)) return false;
    for (const junction of field.junctions) if ((junction.x - x) ** 2 + (junction.z - z) ** 2 < (junction.radius + .3) ** 2) return false;
    for (const street of field.streets)
    {
        const dx = street.bx - street.ax, dz = street.bz - street.az;
        const t = Math.max(0, Math.min(1, ((x - street.ax) * dx + (z - street.az) * dz) / (dx * dx + dz * dz)));
        if (Math.hypot(street.ax + dx * t - x, street.az + dz * t - z) < street.width / 2 + .3) return false;
    }
    return true;
}

/** The part of the line from `a` to `b` inside the circle of `radius` round the middle, or null. */
function clip(a: [number, number], b: [number, number], radius: number): [[number, number], [number, number]] | null {
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const qa = dx * dx + dz * dz, qb = 2 * (a[0] * dx + a[1] * dz), qc = a[0] ** 2 + a[1] ** 2 - radius ** 2;
    const root = qb * qb - 4 * qa * qc;
    if (root <= 0) return null;
    const t0 = Math.max(0, (-qb - Math.sqrt(root)) / (2 * qa)), t1 = Math.min(1, (-qb + Math.sqrt(root)) / (2 * qa));
    if (t1 - t0 < .05) return null;
    return [[a[0] + dx * t0, a[1] + dz * t0], [a[0] + dx * t1, a[1] + dz * t1]];
}

/** The middle of the edge of `corners` nearest to `x, z`. */
function nearestEdge(corners: [number, number][], x: number, z: number): [number, number] {
    const middles = corners.map((p, i) => [(p[0] + corners[(i + 1) % corners.length][0]) / 2, (p[1] + corners[(i + 1) % corners.length][1]) / 2] as [number, number]);
    return middles.reduce((best, m) => Math.hypot(m[0] - x, m[1] - z) < Math.hypot(best[0] - x, best[1] - z) ? m : best);
}

// ------------------------------------------------------------------ the things in them

function pick<T>(random: Random, list: T[]) {
    return list[Math.floor(random() * list.length)];
}

/** A spot within `within` of the middle with `room` metres free around it, or null. */
function space(field: Field, random: Random, within: number, room: number): [number, number] | null {
    for (let tries = 0; tries < 40; tries++)
    {
        const [x, z] = inDisc(random, Math.max(1, within));
        if (field.open(x, z, room) && field.obstacles.every(o => (o.x - x) ** 2 + (o.z - z) ** 2 > (o.radius + room) ** 2)) return [x, z];
    }
    return null;
}

/** Puts `model` with its footprint's middle at `x, z`, its bottom at `y`. */
function place(field: Field, model: ModelName, x: number, z: number, yaw: number, scale: number, y: number, bright?: number): Placed {
    const size = sizeOf(model);
    // the file's origin may be off its middle: move it so the middle lands on x, z
    const ox = size.x * scale, oz = size.z * scale;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const placed: Placed = { model, x: x - (ox * c + oz * s), y: y - size.bottom * scale, z: z - (-ox * s + oz * c), yaw, scale, bright };
    field.models.push(placed);
    return placed;
}

/** A building on levelled ground, blocking walking and arrows. */
function building(field: Field, model: ModelName, x: number, z: number, yaw: number) {
    const size = sizeOf(model);
    const level = field.height(x, z);
    field.flats.push({ x, z, radius: Math.hypot(size.width, size.depth) / 2, level, blend: 4 });
    place(field, model, x, z, yaw, 1, level - .05);
    field.blocks.push({ x, z, yaw, hx: size.width / 2 * WALLS, hz: size.depth / 2 * WALLS, bottom: level - .5, top: level + size.height * .9 });
    field.taken.push({ x, z, radius: Math.max(size.width, size.depth) / 2 + .5 });
}

/** A smaller thing that blocks: a cart, a barrel, a stall, a well. */
function prop(field: Field, model: ModelName, x: number, z: number, yaw: number) {
    const size = sizeOf(model);
    const y = field.height(x, z);
    place(field, model, x, z, yaw, 1, y - .03);
    if (size.height > .3) field.blocks.push({ x, z, yaw, hx: size.width / 2 * .85, hz: size.depth / 2 * .85, bottom: y - .3, top: y + size.height });
}

function rock(field: Field, random: Random, x: number, z: number) {
    const model = pick(random, ROCKS), size = sizeOf(model);
    const scale = 1.3 + random() * 1.4;
    place(field, model, x, z, random() * Math.PI * 2, scale, field.height(x, z) - .08 * scale, NATURE_BRIGHT);
    field.obstacles.push({ x, z, radius: Math.min(size.width, size.depth) / 2 * scale * .9, height: size.height * scale });
}

/** Bushes hide you but stop nothing. */
function bush(field: Field, random: Random, x: number, z: number) {
    place(field, pick(random, BUSHES), x, z, random() * Math.PI * 2, 1.1 + random() * .7, field.height(x, z) - .05, NATURE_BRIGHT);
}

function tree(field: Field, random: Random, x: number, z: number, model = pick(random, TREES)) {
    const scale = 1.35 + random() * .4;
    place(field, model, x, z, random() * Math.PI * 2, scale, field.height(x, z) - .1, NATURE_BRIGHT);
    field.obstacles.push({ x, z, radius: .22 * scale, height: sizeOf(model).height * scale * .7 });
}

/** Water in a bowl, lily pads on it, reeds and a willow or two on the bank. */
function pond(field: Field, random: Random, x: number, z: number, radius: number) {
    const level = field.height(x, z) - .25;
    field.flats.push({ x, z, radius: radius + 1, level: level + .25, blend: 3 });
    field.ponds.push({ x, z, radius, level });
    // nobody walks in, a circle a little inside the water's edge
    field.obstacles.push({ x, z, radius: radius * .85, height: 3, soft: true });
    for (let i = 0, count = 2 + Math.floor(random() * 4); i < count; i++)
    {
        const [px, pz] = inDisc(random, radius * .7);
        place(field, "nature/Lilypad", x + px, z + pz, random() * Math.PI * 2, .7 + random() * .5, level + .02, NATURE_BRIGHT);
    }
    for (let i = 0, count = 2 + Math.floor(random() * 3); i < count; i++)
    {
        const angle = random() * Math.PI * 2, out = radius + .8 + random() * 1.2;
        const bx = x + Math.cos(angle) * out, bz = z + Math.sin(angle) * out;
        if (random() < .3) tree(field, random, bx, bz, pick(random, WILLOWS));
        else place(field, pick(random, ["nature/Plant_2", "nature/Plant_1", "nature/Flowers"] as ModelName[]), bx, bz, random() * 6, 1 + random() * .5, field.height(bx, bz) - .05, NATURE_BRIGHT);
    }
}

/** A field of `corn` (tall, hides you) or wheat in rows, on dirt, fenced along its long sides. */
function crops(field: Field, random: Random, x: number, z: number, yaw: number, width: number, depth: number, kind: "corn" | "wheat") {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const world = (u: number, v: number): [number, number] => [x + u * c + v * s, z - u * s + v * c];
    field.patches.push({ x, z, yaw, hx: width / 2, hz: depth / 2, colour: [.55, .42, .27] });
    field.taken.push({ x, z, radius: Math.min(width, depth) / 2 });
    const gap = kind === "corn" ? 1.1 : .75;
    for (let u = -width / 2 + gap / 2; u < width / 2; u += gap)
        for (let v = -depth / 2 + gap / 2; v < depth / 2; v += gap * 1.25)
        {
            const [px, pz] = world(u + (random() - .5) * .2, v + (random() - .5) * .2);
            const model: ModelName = kind === "corn" ? (random() < .5 ? "nature/Corn_1" : "nature/Corn_2") : "nature/Wheat";
            place(field, model, px, pz, random() * Math.PI * 2, kind === "corn" ? .9 + random() * .3 : 1.2 + random() * .3, field.height(px, pz) - .05, 1.1);
        }
    // fences: 4.2 m pieces along the two long sides, a gap left in the middle of one
    const fence = sizeOf("props/fence");
    for (const side of [-1, 1])
        for (let u = -width / 2 + fence.width / 2; u <= width / 2 - fence.width / 2 + .01; u += fence.width)
        {
            if (side > 0 && Math.abs(u) < fence.width / 2) continue;
            const [px, pz] = world(u, side * (depth / 2 + .4));
            prop(field, "props/fence", px, pz, yaw);
        }
}

/**
 * A watch tower, its ladder on the side turned to `yaw` (the model's +z). The platform is a floor at
 * 5.1 m with a rail round it, open where the ladder comes up. Legs block, the space under it doesn't.
 */
export function tower(field: Field, x: number, z: number, yaw: number) {
    const level = field.height(x, z);
    field.flats.push({ x, z, radius: 2.6, level, blend: 3 });
    place(field, "buildings/watchtower", x, z, yaw, 1, level - .05);
    field.taken.push({ x, z, radius: 2.8 });
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const world = (u: number, v: number): [number, number] => [x + u * c + v * s, z - u * s + v * c];
    const box = (u: number, v: number, hx: number, hz: number, bottom: number, top: number, floor = false) => {
        const [bx, bz] = world(u, v);
        field.blocks.push({ x: bx, z: bz, yaw, hx, hz, bottom: level + bottom, top: level + top, floor });
    };
    // the file's measures (bin/models.mjs): the platform from -1.46 to 1.41 on x, -1.36 to 1.52 on z
    const FLOOR = 5.1, RAIL = 6;
    for (const u of [-1.15, 1.15]) for (const v of [-1.1, 1.35]) box(u, v, .15, .15, -.3, FLOOR);
    box(0, .08, 1.44, 1.44, FLOOR - .25, FLOOR, true);
    box(-1.38, .08, .12, 1.44, FLOOR, RAIL);
    box(1.34, .08, .12, 1.44, FLOOR, RAIL);
    box(0, -1.29, 1.44, .12, FLOOR, RAIL);
    // the ladder's side: rail on each side of the gap
    box(-.97, 1.45, .5, .12, FLOOR, RAIL);
    box(.93, 1.45, .5, .12, FLOOR, RAIL);
    const [lx, lz] = world(0, 2);
    field.ladders.push({ x: lx, z: lz, yaw, hx: .45, hz: .55, bottom: level, top: level + FLOOR, tx: x, tz: z });
}
