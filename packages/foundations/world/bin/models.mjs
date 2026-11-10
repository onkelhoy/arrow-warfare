// The asset pipeline: turns the low poly packs into small untextured .glb files for the maps, then writes
// `src/catalog.ts` with each model's size and triangle count (collisions and placing need the size).
//   node bin/models.mjs          converts what's missing
//   node bin/models.mjs --force  converts everything again
// Sources, all vertex colours only, no textures (the owner wants one low poly look):
// - Quaternius' nature pack (OBJ, a material colour per face): through Blender, headless, colours baked in.
// - pap-adventure's generated models: already glb with vertex colours, through Blender only to turn their inside-out
//   faces outward (the renderer culls back faces, a cabin lost its gable and half its roof).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname);
const out = path.resolve(here, "../asset/models");
const catalog = path.resolve(here, "../src/catalog.ts");
const BLENDER = process.env.BLENDER ?? "/Applications/Blender.app/Contents/MacOS/Blender";
const NATURE = path.join(os.homedir(), "Developer/3d/store/nature/OBJ");
const PAP = path.join(os.homedir(), "Developer/games/pap-adventure/packages/game/assets/asset/models/generated");
const force = process.argv.includes("--force");

const range = (name, count) => Array.from({ length: count }, (_, i) => `${name}_${i + 1}`);

/** Nature models by file name, and the share of triangles kept. No `_Snow`, dead or winter ones for now. */
const nature = {
    ...Object.fromEntries(range("CommonTree", 5).map(name => [name, .5])),
    ...Object.fromEntries(range("BirchTree", 5).map(name => [name, .5])),
    ...Object.fromEntries(range("PineTree", 5).map(name => [name, .6])),
    ...Object.fromEntries(range("Willow", 5).map(name => [name, .5])),
    ...Object.fromEntries([...range("Bush", 2), ...range("BushBerries", 2)].map(name => [name, 1])),
    ...Object.fromEntries([...range("Rock", 7), ...range("Rock_Moss", 7)].map(name => [name, 1])),
    ...Object.fromEntries(range("Plant", 5).map(name => [name, 1])),
    TreeStump: 1, TreeStump_Moss: 1, WoodLog: 1, WoodLog_Moss: 1,
    // crops stand in rows of many, they keep fewer
    Corn_1: .4, Corn_2: .4, Wheat: .4, Lilypad: 1, Flowers: 1,
};

/** pap-adventure's, by folder. The heaviest ones (arcade rows) are left out. */
const pap = {
    buildings: [
        "farmhouse", "cabin", "cabin-2", "cottage", "cottage-2", "smithy", "barracks", "stone-house", "stone-house-2",
        "brick-house", "brick-house-2", "townhouse", "townhouse-2", "townhouse-3", "timber-house", "timber-house-2",
        "tavern", "bakery", "general-store", "bank", "chapel", "corner-house", "watchtower",
    ],
    props: [
        "barrel", "crate", "sack", "cart-hay", "cart-sacks", "well", "bench", "signpost", "street-lamp", "pumpkin",
        "big-pumpkin", "fruit-stall", "bread-stall", "cloth-stall", "fish-stall", "food-cart", "firepit", "basket", "bucket",
    ],
    town: ["fence", "hay", "bale"],
    ground: ["cobble-straight", "cobble-cross", "cobble-t", "cobble-corner", "plaza"],
};

fs.mkdirSync(path.join(out, "nature"), { recursive: true });
const jobs = [];
for (const [name, keep] of Object.entries(nature))
{
    const target = path.join(out, "nature", `${name}.glb`);
    if (force || !fs.existsSync(target)) jobs.push(path.join(NATURE, `${name}.obj`), target, String(keep));
}
for (const [folder, names] of Object.entries(pap))
{
    // the town's few go with the props
    const group = folder === "town" ? "props" : folder;
    fs.mkdirSync(path.join(out, group), { recursive: true });
    for (const name of names)
    {
        const target = path.join(out, group, `${name}.glb`);
        if (force || !fs.existsSync(target)) jobs.push(path.join(PAP, folder, `${name}.glb`), target, "1");
    }
}
if (jobs.length)
{
    console.log(`models: ${jobs.length / 3} through Blender`);
    execFileSync(BLENDER, ["-b", "--factory-startup", "--python", path.join(here, "blender-glb.py"), "--", ...jobs], { stdio: ["ignore", "ignore", "inherit"] });
}

// the catalog: size from the position bounds, triangles from the indices
const entries = [];
let bytes = 0;
for (const group of fs.readdirSync(out).sort())
{
    for (const file of fs.readdirSync(path.join(out, group)).filter(file => file.endsWith(".glb")).sort())
    {
        const data = fs.readFileSync(path.join(out, group, file));
        bytes += data.length;
        const length = data.readUInt32LE(12);
        const json = JSON.parse(data.subarray(20, 20 + length).toString());
        let triangles = 0;
        const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
        for (const mesh of json.meshes) for (const primitive of mesh.primitives)
        {
            const position = json.accessors[primitive.attributes.POSITION];
            triangles += (primitive.indices !== undefined ? json.accessors[primitive.indices].count : position.count) / 3;
            for (let k = 0; k < 3; k++)
            {
                min[k] = Math.min(min[k], position.min[k]);
                max[k] = Math.max(max[k], position.max[k]);
            }
        }
        const round = values => values.map(value => Math.round(value * 100) / 100);
        entries.push({ name: `${group}/${file.replace(/\.glb$/, "")}`, triangles, kb: Math.round(data.length / 1024), min: round(min), max: round(max) });
    }
}

fs.writeFileSync(catalog, `// Written by bin/models.mjs, don't edit by hand.

/** A model in \`asset/models\`: its bounds in metres (y up, as in the file) and its size for phones. */
export type ModelInfo = { triangles: number; kb: number; min: [number, number, number]; max: [number, number, number] };

export const CATALOG = {
${entries.map(entry => `    "${entry.name}": { triangles: ${entry.triangles}, kb: ${entry.kb}, min: [${entry.min.join(", ")}], max: [${entry.max.join(", ")}] },`).join("\n")}
} satisfies Record<string, ModelInfo>;

export type ModelName = keyof typeof CATALOG;
`);

const heavy = entries.filter(entry => entry.triangles > 3000).map(entry => `${entry.name} ${entry.triangles}`);
console.log(`models: ${entries.length} in asset/models, ${(bytes / 1024 / 1024).toFixed(1)} MB${heavy.length ? `, over 3000 triangles: ${heavy.join(", ")}` : ""}`);
