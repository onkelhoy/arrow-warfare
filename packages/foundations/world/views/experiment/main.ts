// core
import { Camera, GameEngine, orbit } from "@papit/game-engine";
import { invert, mat4, multiply, rgb, Renderer, type Batch, type Vec3 } from "@arrow-warfare/render";

// component
import {
    birchTree, body, currentPalette, Field, sizeOf, flower, grassTuft, head, log, Meadow, mushroom, NECK,
    pineTree, roundTree, stone, stump, type MapKind, type MapSize, type PaletteName, type TreeAmount,
} from "@arrow-warfare/world";

const engine = new GameEngine({ name: "main", query: "canvas", type: "webgl2", theme: true });
const layer = engine.layers.main;
const renderer = engine.add(new Renderer(layer));
const form = document.querySelector("form")!;
// `?map=farm&view=above` and so on preset the form
for (const [key, value] of new URLSearchParams(location.search)) (form.elements.namedItem(key) as HTMLSelectElement | null)?.setAttribute("data-preset", value);
for (const element of form.querySelectorAll<HTMLSelectElement | HTMLInputElement>("[data-preset]")) element.value = element.dataset.preset!;

let meadow: Meadow | null = null;
let shown: Field | null = null;
let extra: Batch[] = [];
const target = { position: { x: 0, y: 0, z: 0 } };

const CLOTHES = ["#d8433a", "#3a6fd8", "#e8b52c", "#8a4fd0", "#3aa860", "#e07a2c"].map(rgb);
const SKIN: Vec3[] = [[.98, .82, .68], [.86, .64, .46], [.6, .42, .3], [.4, .27, .2]];

function build() {
    if (meadow) engine.remove(meadow);
    for (const batch of extra) renderer.removeBatch(batch);
    extra = [];

    const data = new FormData(form);
    const choice = String(data.get("palette"));
    const palette: PaletteName = choice === "clock" ? currentPalette() : choice as PaletteName;
    const view = String(data.get("view"));

    if (view === "models")
    {
        // every model side by side on a plain field without trees
        const field = new Field({ seed: 3, size: "small", trees: "none", buildings: "none", props: "none", towers: "none" });
        meadow = engine.add(new Meadow(renderer, field, { palette, grass: .15 }));
        const row = [roundTree(1), roundTree(2), pineTree(1), birchTree(1), log(), stump(), stone(1), mushroom(), flower(), grassTuft(1)];
        row.forEach((mesh, i) => {
            const batch = renderer.batch(mesh, { capacity: 1, sway: i >= 8 ? .12 : 0 });
            const x = (i - row.length / 2) * 2.6;
            batch.add(x, field.height(x, 0), 0, .4, 1, [.9, .42, .62]);
            extra.push(batch);
        });
        addPlayers([{ x: 0, z: 4, yaw: Math.PI }, { x: 2, z: 4, yaw: Math.PI * .7 }], field);
        target.position = { x: 0, y: 1.2, z: 0 };
        look(10, .2);
        return;
    }

    const field = new Field({
        seed: Number(data.get("seed")) || 0, size: data.get("size") as MapSize, trees: data.get("trees") as TreeAmount,
        map: data.get("map") as MapKind, props: data.get("props") as TreeAmount, buildings: data.get("buildings") as TreeAmount, towers: data.get("towers") as TreeAmount,
    });
    meadow = engine.add(new Meadow(renderer, field, { palette }));
    shown = field;
    if (view === "backdrop")
    {
        // standing in the middle, eye high, looking out at the mountains and the castle (drag to turn)
        target.position = { x: 0, y: field.height(0, 0) + 1.7, z: 0 };
        look(1, .05);
        return;
    }
    target.position = { x: 0, y: 0, z: 0 };
    look(view === "spawns" ? 45 : 70, view === "spawns" ? .9 : .55);

    if (view === "spawns")
    {
        const players = ["a", "b", "c", "d", "e", "f"].map((id, i) => ({ id, team: i < 3 ? "red" : i < 5 ? "blue" : null }));
        const spawns = field.spawns(players);
        addPlayers(players.map(player => spawns[player.id]), field, players.map(player => player.team === "red" ? 0 : player.team === "blue" ? 1 : 2));
    }
}

function addPlayers(spots: { x: number; z: number; yaw: number }[], field: Field, colours = spots.map((_, i) => i)) {
    const bodies = renderer.batch(body(), { capacity: spots.length });
    const heads = renderer.batch(head(), { capacity: spots.length });
    spots.forEach((spot, i) => {
        const y = field.height(spot.x, spot.z);
        bodies.add(spot.x, y, spot.z, spot.yaw, 1, CLOTHES[colours[i] % CLOTHES.length]);
        heads.add(spot.x, y + NECK, spot.z, spot.yaw, 1, SKIN[i % SKIN.length]);
    });
    extra.push(bodies, heads);
}

function look(distance: number, pitch: number) {
    layer.camera = new Camera({ far: 400, controllers: [orbit({ target, distance, pitch, yaw: .5, max: 160 })] });
}

// the name of the model under the pointer
const canvas = document.querySelector("canvas")!;
canvas.addEventListener("contextmenu", event => event.preventDefault());

// right drag (or shift drag) moves what the camera circles over the ground (papit's \`pan\` is 2D only)
let panning: { x: number; y: number } | null = null;
canvas.addEventListener("pointerdown", event => {
    if (event.button !== 2 && !event.shiftKey) return;
    panning = { x: event.clientX, y: event.clientY };
    event.stopImmediatePropagation();
}, { capture: true });
addEventListener("pointerup", () => panning = null);
addEventListener("pointermove", event => {
    const camera = layer.camera;
    if (!panning || !camera) return;
    const view = camera.viewMatrix as unknown as ArrayLike<number>;
    // the camera's right and forward, flat on the ground
    const rx = view[0], rz = view[8], fx = -view[2], fz = -view[10];
    const r = Math.hypot(rx, rz) || 1, f = Math.hypot(fx, fz) || 1;
    const eye = camera.worldPosition;
    const scale = Math.hypot(eye.x - target.position.x, eye.y - target.position.y, eye.z - target.position.z) * .0015;
    const dx = (event.clientX - panning.x) * scale, dy = (event.clientY - panning.y) * scale;
    target.position = { x: target.position.x - rx / r * dx + fx / f * dy, y: target.position.y, z: target.position.z - rz / r * dx + fz / f * dy };
    panning = { x: event.clientX, y: event.clientY };
}, { capture: true });
const tip = document.body.appendChild(document.createElement("output"));
tip.className = "tip";
canvas.addEventListener("pointermove", event => {
    const camera = layer.camera;
    if (!shown || !camera) return;
    const box = canvas.getBoundingClientRect();
    const nx = (event.clientX - box.left) / box.width * 2 - 1, ny = 1 - (event.clientY - box.top) / box.height * 2;
    const inverse = mat4();
    invert(inverse, multiply(mat4(), camera.projectionMatrix as unknown as ArrayLike<number>, camera.viewMatrix as unknown as ArrayLike<number>));
    const unproject = (z: number): Vec3 => {
        const m = inverse, w = m[3] * nx + m[7] * ny + m[11] * z + m[15];
        return [(m[0] * nx + m[4] * ny + m[8] * z + m[12]) / w, (m[1] * nx + m[5] * ny + m[9] * z + m[13]) / w, (m[2] * nx + m[6] * ny + m[10] * z + m[14]) / w];
    };
    const near = unproject(-1), far = unproject(1);
    let best = Infinity, name = "";
    for (const one of shown.models)
    {
        const size = sizeOf(one.model);
        // into the model's own axes, its box from the file's bounds
        const c = Math.cos(one.yaw), s = Math.sin(one.yaw);
        const local = (p: Vec3): Vec3 => {
            const dx = p[0] - one.x, dz = p[2] - one.z;
            return [(dx * c - dz * s) / one.scale, (p[1] - one.y) / one.scale, (dx * s + dz * c) / one.scale];
        };
        const o = local(near), e = local(far), d: Vec3 = [e[0] - o[0], e[1] - o[1], e[2] - o[2]];
        const lo: Vec3 = [size.x - size.width / 2, 0, size.z - size.depth / 2], hi: Vec3 = [size.x + size.width / 2, size.height, size.z + size.depth / 2];
        let t0 = 0, t1 = 1;
        for (let k = 0; k < 3 && t0 <= t1; k++)
        {
            if (Math.abs(d[k]) < 1e-9) { if (o[k] < lo[k] || o[k] > hi[k]) t0 = 2; continue; }
            const a = (lo[k] - o[k]) / d[k], b = (hi[k] - o[k]) / d[k];
            t0 = Math.max(t0, Math.min(a, b));
            t1 = Math.min(t1, Math.max(a, b));
        }
        if (t0 <= t1 && t0 < best) { best = t0; name = one.model; }
    }
    tip.textContent = name;
    tip.hidden = !name;
    tip.style.left = `${event.clientX + 14}px`;
    tip.style.top = `${event.clientY + 14}px`;
});

form.addEventListener("change", build);
build();


const stats = document.querySelector(".stats")!;
let frames = 0, since = performance.now();
engine.loop(() => {
    frames++;
    const now = performance.now();
    if (now - since > 500)
    {
        stats.textContent = `${Math.round(frames * 1000 / (now - since))} fps · ${renderer.drawn} triangles · ${renderer.batches.length} batches`;
        frames = 0;
        since = now;
    }
});
