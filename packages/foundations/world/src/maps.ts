import type { ModelName } from "./catalog";
import { sizeOf } from "./files";
import { inDisc, type Field, type FieldSetting, type Placed, type TreeAmount } from "./field";

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

/** A town: cobbled streets in a grid, houses along them facing the street, a square with stalls in the middle. */
function city(field: Field, random: Random, buildings: number) {
    field.hills = .12;
    const turn = random() * Math.PI / 2;
    const to = (x: number, z: number): [number, number] => [x * Math.cos(turn) + z * Math.sin(turn), -x * Math.sin(turn) + z * Math.cos(turn)];
    const TILE = 4, BLOCK = 20;
    const reach = field.radius - 6;
    const lines: number[] = [];
    for (let k = -Math.floor(reach / BLOCK); k * BLOCK <= reach; k++) lines.push(k * BLOCK);
    const level = field.rolling(0, 0);
    field.flats.push({ x: 0, z: 0, radius: reach, level, blend: 8 });

    // the square in the middle: plaza tiles, a well and stalls
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++)
    {
        const [x, z] = to(i * TILE, j * TILE);
        tile(field, "ground/plaza", x, z, turn);
    }
    const [wx, wz] = to(0, 0);
    prop(field, "props/well", wx, wz, turn);
    STALLS.forEach((stall, i) => {
        const angle = i / STALLS.length * Math.PI * 2 + Math.PI / 4;
        const [x, z] = to(Math.cos(angle) * 5.2, Math.sin(angle) * 5.2);
        prop(field, stall, x, z, turn - angle - Math.PI / 2);
    });
    field.taken.push({ x: 0, z: 0, radius: 7 });

    // streets: tiles along every line inside the town, crossings where they meet
    const onStreet = (a: number) => lines.includes(a);
    for (const line of lines)
    {
        for (let along = -reach; along <= reach; along += TILE)
        {
            const a = Math.round(along / TILE) * TILE;
            if (Math.abs(a) <= TILE && Math.abs(line) <= TILE) continue;
            for (const [u, v, yaw] of [[line, a, 0], [a, line, Math.PI / 2]] as const)
            {
                if (Math.hypot(u, v) > reach) continue;
                if (yaw && onStreet(u)) continue;
                const [x, z] = to(u, v);
                tile(field, onStreet(u) && onStreet(v) ? "ground/cobble-cross" : "ground/cobble-straight", x, z, turn + yaw);
            }
        }
    }

    // houses on both sides of each street, their fronts (+z) to it, gaps between for alleys to run through
    const fill = .45 + buildings * .2;
    for (const line of lines) for (let along = -reach + 4; along <= reach - 4; along += 8)
    {
        for (const side of [-1, 1])
            for (const across of [0, 1])
            {
                if (random() > fill) continue;
                // across 0 runs along x (a street at z = line), 1 along z
                const u = across ? line + side * 6.5 : along, v = across ? along : line + side * 6.5;
                if (Math.hypot(u, v) > reach - 4 || Math.hypot(u, v) < 10) continue;
                const [x, z] = to(u, v);
                if (!field.open(x, z, 3.2)) continue;
                // facing the street: +z of the model points back at the line
                const yaw = turn + (across ? (side > 0 ? -Math.PI / 2 : Math.PI / 2) : (side > 0 ? Math.PI : 0));
                building(field, pick(random, TOWN_HOUSES), x, z, yaw);
            }
    }
    // the chapel at the edge of town
    const spot = space(field, random, reach - 6, 8);
    if (spot) building(field, "buildings/chapel", spot[0], spot[1], random() * Math.PI * 2);
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

/** A street or square tile, flush with the ground. */
function tile(field: Field, model: ModelName, x: number, z: number, yaw: number) {
    // the cobbles are its lowest 10 cm, the kerbs stand over the ground
    place(field, model, x, z, yaw, 1.01, field.height(x, z) + .02);
    field.taken.push({ x, z, radius: 2.2 });
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
