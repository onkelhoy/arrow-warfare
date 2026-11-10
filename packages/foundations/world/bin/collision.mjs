// The buildings' collision, inside their 3D files: each `asset/models/buildings/<name>.glb` has objects named
// `collision` (`collision.001`, ... in Blender), each a box of 8 corners around walls (one, an L-shaped house two).
// It may have `stairs`, a wedge up outside stairs (walked up in steps from its low end to its high end), and
// `landing`, a box whose top is stood on (the platform the stairs lead to).
// The game reads them from the file (src/collision.ts, written here) and never draws them.
// Buildings found to have outside stairs (STAIRS below) get a `stairs` and a `landing` when their boxes are put in.
//
// A file without a `collision` object gets its boxes found and put in: a footprint of the places walled in on all
// sides at waist height (posts, awnings and stairs don't count), its largest rectangles. A file that has them is
// never changed: open it in Blender, move or resize the boxes (keep them boxes, the game takes each one's bounds),
// add `stairs`, export to asset/edited/buildings/<name>.glb and run bin/models.mjs (which runs this), or export
// over asset/models/buildings/<name>.glb and run this.
//   node bin/collision.mjs           puts in what's missing, writes src/collision.ts
//   node bin/collision.mjs --force   finds every file's boxes again (replacing the ones in the files)
import fs from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname);
const folder = path.resolve(here, "../asset/models/buildings");
const target = path.resolve(here, "../src/collision.ts");

/** Not walled boxes: the watchtower's legs and platform are blocks of their own (`tower` in src/maps.ts). */
const SKIP = new Set(["watchtower"]);
/** Nodes for the game, not drawn. */
const HIDDEN = /^(collision|stairs|landing)/i;

/**
 * The outside stairs found by looking at the models (the steps' treads), put in with the boxes: a wedge from the
 * foot (x across, z, on the ground) up to the landing, and the landing. [x0, x1, foot z, top z, height, landing's far z].
 */
const STAIRS = {
    townhouse: [-2.95, -2, 2.25, -.6, 2.67, -2.95],
    "townhouse-2": [-2.95, -2, 2.25, -.6, 2.67, -2.95],
    "townhouse-3": [-2.95, -2, 2.25, -.6, 2.67, -2.95],
    "timber-house": [-3.55, -2.65, 1.75, -.85, 2.57, -3.2],
    "timber-house-2": [-3.55, -2.65, 1.75, -.85, 2.57, -3.2],
};

function readGlb(file) {
    const data = fs.readFileSync(file);
    const length = data.readUInt32LE(12);
    const json = JSON.parse(data.subarray(20, 20 + length).toString());
    const binAt = 20 + length;
    const bin = binAt < data.length ? data.subarray(binAt + 8, binAt + 8 + data.readUInt32LE(binAt)) : Buffer.alloc(0);
    return { json, bin: Buffer.from(bin) };
}

function writeGlb(file, { json, bin }) {
    const pad = (buffer, fill) => buffer.length % 4 ? Buffer.concat([buffer, Buffer.alloc(4 - buffer.length % 4, fill)]) : buffer;
    const text = pad(Buffer.from(JSON.stringify(json)), 0x20), body = pad(bin, 0);
    const header = Buffer.alloc(12), jsonHead = Buffer.alloc(8), binHead = Buffer.alloc(8);
    header.write("glTF", 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(12 + 8 + text.length + 8 + body.length, 8);
    jsonHead.writeUInt32LE(text.length, 0); jsonHead.write("JSON", 4);
    binHead.writeUInt32LE(body.length, 0); binHead.write("BIN\0", 4);
    fs.writeFileSync(file, Buffer.concat([header, jsonHead, text, binHead, body]));
}

function read({ json, bin }, accessor) {
    const view = json.bufferViews[accessor.bufferView];
    const at = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    const size = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[accessor.type];
    const bytes = { 5126: 4, 5125: 4, 5123: 2, 5121: 1 }[accessor.componentType];
    const stride = view.byteStride ?? size * bytes;
    const out = [];
    for (let i = 0; i < accessor.count; i++)
        for (let k = 0; k < size; k++)
        {
            const p = at + i * stride + k * bytes;
            out.push(accessor.componentType === 5126 ? bin.readFloatLE(p) : accessor.componentType === 5125 ? bin.readUInt32LE(p) : accessor.componentType === 5123 ? bin.readUInt16LE(p) : bin.readUInt8(p));
        }
    return out;
}

/** A node's matrix (column major): its own, or translation, rotation, scale. */
function local(node) {
    if (node.matrix) return node.matrix;
    const [x, y, z, w] = node.rotation ?? [0, 0, 0, 1], [sx, sy, sz] = node.scale ?? [1, 1, 1], [tx, ty, tz] = node.translation ?? [0, 0, 0];
    return [
        (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
        2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
        2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
        tx, ty, tz, 1,
    ];
}

function multiply(a, b) {
    const out = new Array(16).fill(0);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) out[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
    return out;
}

const apply = (m, [x, y, z]) => [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];

/** Every mesh node of the scene with its name and the triangles of its meshes, in model space. */
function nodes(glb) {
    const { json } = glb;
    const list = [];
    const walk = (index, parent, name) => {
        const node = json.nodes[index];
        const matrix = multiply(parent, local(node));
        // a hidden node's children are hidden with it
        const own = name ?? (HIDDEN.test(node.name ?? "") ? node.name : null);
        if (node.mesh !== undefined)
        {
            const triangles = [];
            for (const primitive of json.meshes[node.mesh].primitives)
            {
                const p = read(glb, json.accessors[primitive.attributes.POSITION]);
                const points = [];
                for (let i = 0; i < p.length; i += 3) points.push(apply(matrix, [p[i], p[i + 1], p[i + 2]]));
                const indices = primitive.indices !== undefined ? read(glb, json.accessors[primitive.indices]) : points.map((_, i) => i);
                for (let i = 0; i + 2 < indices.length; i += 3) triangles.push([points[indices[i]], points[indices[i + 1]], points[indices[i + 2]]]);
            }
            list.push({ name: own ?? node.name ?? "", hidden: !!own, triangles });
        }
        for (const child of node.children ?? []) walk(child, matrix, own);
    };
    const scene = json.scenes?.[json.scene ?? 0];
    const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    for (const index of scene?.nodes ?? json.nodes.map((_, i) => i)) walk(index, identity, null);
    return list;
}

/** Takes the nodes named like `pattern` out of the file for good: their meshes, accessors and bytes too. */
function remove(glb, pattern) {
    const { json } = glb;
    const gone = new Set(json.nodes.map((node, i) => pattern.test(node.name ?? "") ? i : -1).filter(i => i >= 0));
    if (!gone.size) return;
    const nodeMap = new Map();
    json.nodes = json.nodes.filter((_, i) => !gone.has(i) && nodeMap.set(i, nodeMap.size));
    for (const scene of json.scenes) scene.nodes = scene.nodes.filter(i => nodeMap.has(i)).map(i => nodeMap.get(i));
    for (const node of json.nodes) if (node.children) node.children = node.children.filter(i => nodeMap.has(i)).map(i => nodeMap.get(i));
    // what's still used: meshes by nodes, accessors by meshes, views by accessors
    const meshMap = new Map();
    for (const node of json.nodes) if (node.mesh !== undefined && !meshMap.has(node.mesh)) meshMap.set(node.mesh, meshMap.size);
    json.meshes = [...meshMap.keys()].map(i => json.meshes[i]);
    for (const node of json.nodes) if (node.mesh !== undefined) node.mesh = meshMap.get(node.mesh);
    const accessorMap = new Map();
    const use = (i) => { if (!accessorMap.has(i)) accessorMap.set(i, accessorMap.size); return accessorMap.get(i); };
    for (const mesh of json.meshes) for (const primitive of mesh.primitives)
    {
        for (const key of Object.keys(primitive.attributes)) primitive.attributes[key] = use(primitive.attributes[key]);
        if (primitive.indices !== undefined) primitive.indices = use(primitive.indices);
    }
    json.accessors = [...accessorMap.keys()].map(i => json.accessors[i]);
    const viewMap = new Map();
    for (const accessor of json.accessors) if (!viewMap.has(accessor.bufferView)) viewMap.set(accessor.bufferView, viewMap.size);
    for (const accessor of json.accessors) accessor.bufferView = viewMap.get(accessor.bufferView);
    const parts = [];
    let length = 0;
    json.bufferViews = [...viewMap.keys()].map(i => {
        const view = json.bufferViews[i];
        const pad = (4 - length % 4) % 4;
        parts.push(Buffer.alloc(pad), glb.bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength));
        length += pad;
        const moved = { ...view, byteOffset: length };
        length += view.byteLength;
        return moved;
    });
    glb.bin = Buffer.concat(parts);
    json.buffers[0].byteLength = glb.bin.length;
}

/** Puts `boxes` (8 corners each, a wedge's top 2 may be its bottom's) in the file as nodes named `kind`, replacing any there. */
function putBoxes(glb, boxes, kind = "collision") {
    const { json } = glb;
    remove(glb, new RegExp(`^${kind}`, "i"));
    const scene = json.scenes[json.scene ?? 0];
    // corners: 0-3 the bottom, 4-7 the top, both counter clockwise from above's x0 z0
    const faces = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7];
    boxes.forEach((corners, i) => {
        const positions = Buffer.alloc(8 * 12), indices = Buffer.alloc(faces.length * 2);
        corners.flat().forEach((v, k) => positions.writeFloatLE(v, k * 4));
        faces.forEach((v, k) => indices.writeUInt16LE(v, k * 2));
        const align = Buffer.alloc((4 - glb.bin.length % 4) % 4);
        const at = glb.bin.length + align.length;
        glb.bin = Buffer.concat([glb.bin, align, positions, indices]);
        json.bufferViews.push({ buffer: 0, byteOffset: at, byteLength: positions.length, target: 34962 });
        json.bufferViews.push({ buffer: 0, byteOffset: at + positions.length, byteLength: indices.length, target: 34963 });
        const min = [0, 1, 2].map(k => Math.min(...corners.map(c => c[k]))), max = [0, 1, 2].map(k => Math.max(...corners.map(c => c[k])));
        json.accessors.push({ bufferView: json.bufferViews.length - 2, componentType: 5126, count: 8, type: "VEC3", min, max });
        json.accessors.push({ bufferView: json.bufferViews.length - 1, componentType: 5123, count: faces.length, type: "SCALAR" });
        const name = i ? `${kind}.${String(i).padStart(3, "0")}` : kind;
        json.meshes.push({ name, primitives: [{ attributes: { POSITION: json.accessors.length - 2 }, indices: json.accessors.length - 1 }] });
        json.nodes.push({ name, mesh: json.meshes.length - 1 });
        scene.nodes.push(json.nodes.length - 1);
    });
    json.buffers[0].byteLength = glb.bin.length;
}

const bounds = (points) => ({
    min: [0, 1, 2].map(k => Math.round(Math.min(...points.map(p => p[k])) * 100) / 100),
    max: [0, 1, 2].map(k => Math.round(Math.max(...points.map(p => p[k])) * 100) / 100),
});

/**
 * A stairs node as a ramp: its top surface (the highest point over each spot) from where it's lowest to where
 * it's highest, its width across. The ramp's foot is at its bottom.
 */
function ramp(points) {
    const tops = new Map();
    for (const p of points)
    {
        const key = `${p[0].toFixed(2)},${p[2].toFixed(2)}`;
        if (!tops.has(key) || tops.get(key)[1] < p[1]) tops.set(key, p);
    }
    const top = [...tops.values()], ys = top.map(p => p[1]);
    const low = Math.min(...ys), high = Math.max(...ys), band = (high - low) * .15;
    const middle = (list) => [0, 1, 2].map(k => list.reduce((sum, p) => sum + p[k], 0) / list.length);
    const from = middle(top.filter(p => p[1] <= low + band)), to = middle(top.filter(p => p[1] >= high - band));
    from[1] = Math.min(...points.map(p => p[1])); to[1] = high;
    const dx = to[0] - from[0], dz = to[2] - from[2], length = Math.hypot(dx, dz) || 1;
    // across: the spread of the points sideways to the way up
    const across = points.map(p => (p[0] - from[0]) * -dz / length + (p[2] - from[2]) * dx / length);
    const round = (v) => Math.round(v * 100) / 100;
    return { from: from.map(round), to: to.map(round), width: round(Math.max(...across) - Math.min(...across)) };
}

/** How far along `d` from `o` the ray goes into triangle `t`, or null (Möller–Trumbore, both faces). */
function hit(o, d, [a, b, c]) {
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const p = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]];
    const det = e1[0] * p[0] + e1[1] * p[1] + e1[2] * p[2];
    if (Math.abs(det) < 1e-9) return null;
    const s = [o[0] - a[0], o[1] - a[1], o[2] - a[2]];
    const u = (s[0] * p[0] + s[1] * p[1] + s[2] * p[2]) / det;
    if (u < 0 || u > 1) return null;
    const q = [s[1] * e1[2] - s[2] * e1[1], s[2] * e1[0] - s[0] * e1[2], s[0] * e1[1] - s[1] * e1[0]];
    const v = (d[0] * q[0] + d[1] * q[1] + d[2] * q[2]) / det;
    if (v < 0 || u + v > 1) return null;
    const t = (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) / det;
    return t > 0 ? t : null;
}

/** The largest rectangle of true cells in `grid` (rows of booleans): [row, col, rows, cols], by histograms. */
function largest(grid) {
    const cols = grid[0].length, heights = new Array(cols).fill(0);
    let best = [0, 0, 0, 0], area = 0;
    grid.forEach((row, r) => {
        for (let c = 0; c < cols; c++) heights[c] = row[c] ? heights[c] + 1 : 0;
        const stack = [];
        for (let c = 0; c <= cols; c++)
        {
            const h = c < cols ? heights[c] : 0;
            while (stack.length && heights[stack[stack.length - 1]] >= h)
            {
                const top = stack.pop(), height = heights[top], left = stack.length ? stack[stack.length - 1] + 1 : 0;
                if (height * (c - left) > area) { area = height * (c - left); best = [r - height + 1, left, height, c - left]; }
            }
            stack.push(c);
        }
    });
    return area ? best : null;
}

/** Cell size of the footprint, metres. */
const CELL = .2;

/**
 * The walls as boxes: a footprint of cells that have walls on all four sides at two heights (posts, awnings and
 * stairs rarely close a cell in), then the largest rectangles of it, up to three (L-shaped houses get two).
 */
function walls(list) {
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (const t of list) for (const v of t) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], v[k]); max[k] = Math.max(max[k], v[k]); }
    const nx = Math.ceil((max[0] - min[0]) / CELL), nz = Math.ceil((max[2] - min[2]) / CELL);
    const ways = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]];
    const grid = [];
    for (let r = 0; r < nz; r++)
    {
        const row = [];
        for (let c = 0; c < nx; c++)
        {
            const x = min[0] + (c + .5) * CELL, z = min[2] + (r + .5) * CELL;
            row.push([1.1, 1.8].every(h => ways.every(d => list.some(t => hit([x, min[1] + h, z], d, t) !== null))));
        }
        grid.push(row);
    }
    const round = (v) => Math.round(v * 100) / 100;
    const y0 = round(min[1]), y1 = round(min[1] + (max[1] - min[1]) * .9);
    const boxes = [];
    for (let k = 0; k < 4; k++)
    {
        const found = largest(grid);
        // a box of 3 m² at least (the outside stairs' landing is less)
        if (!found || found[2] * found[3] * CELL * CELL < 3) break;
        const [r, c, rows, cols] = found;
        for (let i = r; i < r + rows; i++) for (let j = c; j < c + cols; j++) grid[i][j] = false;
        const x0 = round(min[0] + c * CELL), x1 = round(min[0] + (c + cols) * CELL);
        const z0 = round(min[2] + r * CELL), z1 = round(min[2] + (r + rows) * CELL);
        boxes.push([x0, z0, x1, z1]);
    }
    // a wall left open by a strip inside (a passage, a door through): boxes close side by side, along most of each
    // other, become one (the wings of an L stay two)
    const span = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0);
    for (let merged = true; merged;)
    {
        merged = false;
        for (let i = 0; i < boxes.length && !merged; i++)
            for (let j = i + 1; j < boxes.length && !merged; j++)
            {
                const [a, b] = [boxes[i], boxes[j]];
                const gapX = -span(a[0], a[2], b[0], b[2]), gapZ = -span(a[1], a[3], b[1], b[3]);
                const alongZ = span(a[1], a[3], b[1], b[3]) / Math.max(a[3] - a[1], b[3] - b[1]);
                const alongX = span(a[0], a[2], b[0], b[2]) / Math.max(a[2] - a[0], b[2] - b[0]);
                if ((gapX <= 1 && alongZ >= .8) || (gapZ <= 1 && alongX >= .8))
                {
                    boxes[i] = [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
                    boxes.splice(j, 1);
                    merged = true;
                }
            }
    }
    return boxes.map(([x0, z0, x1, z1]) => [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]]);
}

/** Puts boxes in the buildings missing them (or all, `force`), and writes src/collision.ts from the files. */
export function collision(force = false) {
    const entries = [];
    for (const file of fs.readdirSync(folder).filter(file => file.endsWith(".glb")).sort())
    {
        const name = file.replace(/\.glb$/, ""), at = path.join(folder, file);
        if (SKIP.has(name)) continue;
        let glb = readGlb(at);
        let list = nodes(glb);
        if (force || !list.some(node => /^collision/i.test(node.name)))
        {
            putBoxes(glb, walls(list.filter(node => !node.hidden).flatMap(node => node.triangles)));
            const known = STAIRS[name];
            if (known)
            {
                const [x0, x1, foot, high, rise, far] = known, y = 0;
                // a wedge: its bottom from the foot to under the top, its top edge only over the top end
                putBoxes(glb, [[[x0, y, foot], [x1, y, foot], [x1, y, high], [x0, y, high], [x0, y, foot], [x1, y, foot], [x1, rise, high], [x0, rise, high]]], "stairs");
                putBoxes(glb, [[[x0, rise - .3, high], [x1, rise - .3, high], [x1, rise - .3, far], [x0, rise - .3, far], [x0, rise, high], [x1, rise, high], [x1, rise, far], [x0, rise, far]]], "landing");
            }
            writeGlb(at, glb);
            console.log(`collision: buildings/${name} boxes found and put in the file`);
            glb = readGlb(at);
            list = nodes(glb);
        }
        const boxes = list.filter(node => /^collision/i.test(node.name)).map(node => bounds(node.triangles.flat()));
        const stairs = list.filter(node => /^stairs/i.test(node.name)).map(node => ramp(node.triangles.flat()));
        const landings = list.filter(node => /^landing/i.test(node.name)).map(node => bounds(node.triangles.flat()));
        entries.push({ name: `buildings/${name}`, boxes, stairs, landings });
    }
    const box = (b) => `{ min: [${b.min.join(", ")}], max: [${b.max.join(", ")}] }`;
    fs.writeFileSync(target, `// Written by bin/collision.mjs from the \`collision\` and \`stairs\` objects in asset/models/buildings/*.glb, don't edit by hand.

import type { ModelName } from "./catalog";

/** A box around walls, in the model's own metres (y up, as in the file). */
export type Walls = { min: [number, number, number]; max: [number, number, number] };
/** A ramp up outside stairs, in the model's metres: from \`from\` (the foot) to \`to\` (the landing), \`width\` across. */
export type Stairs = { from: [number, number, number]; to: [number, number, number]; width: number };
/** A building's walls (one box each, an L-shaped house two), its outside stairs, and the landings they lead to (stood on). */
export type Collision = { walls: Walls[]; stairs: Stairs[]; landings: Walls[] };

export const COLLISION: Partial<Record<ModelName, Collision>> = {
${entries.map(entry => `    "${entry.name}": { walls: [${entry.boxes.map(box).join(", ")}], stairs: [${entry.stairs.map(s => `{ from: [${s.from.join(", ")}], to: [${s.to.join(", ")}], width: ${s.width} }`).join(", ")}], landings: [${entry.landings.map(box).join(", ")}] },`).join("\n")}
};
`);
    console.log(`collision: ${entries.length} buildings in src/collision.ts`);
}

if (process.argv[1] === new URL(import.meta.url).pathname) collision(process.argv.includes("--force"));
