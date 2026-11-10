// core
import { Camera, GameEngine, orbit } from "@papit/game-engine";
import { MeshBuilder, NOON, Renderer, type Batch } from "@arrow-warfare/render";

// component
import { CATALOG, fileModel, sizeOf, type ModelName } from "@arrow-warfare/world";

// every model of a group from `asset/models` in rows, `?group=buildings`, `?only=buildings/watchtower`
const engine = new GameEngine({ name: "main", query: "canvas", type: "webgl2", theme: true });
const layer = engine.layers.main;
const renderer = engine.add(new Renderer(layer));
renderer.light = structuredClone(NOON);
const form = document.querySelector("form")!;
const stats = document.querySelector(".stats")!;
const search = new URLSearchParams(location.search);
const select = form.elements.namedItem("group") as HTMLSelectElement;
select.value = search.get("group") ?? "nature";

let batches: Batch[] = [];
layer.camera = new Camera({ controllers: [orbit({ distance: 30 })] });

async function show() {
    for (const batch of batches) renderer.removeBatch(batch);
    batches = [];
    const only = search.get("only");
    const names = (Object.keys(CATALOG) as ModelName[]).filter(name => only ? name === only : name.startsWith(`${select.value}/`));
    const gap = 1.5;
    const columns = Math.ceil(Math.sqrt(names.length));
    const cell = Math.max(...names.map(name => Math.max(sizeOf(name).width, sizeOf(name).depth))) + gap;
    const ground = new MeshBuilder().box("#6fa646", { at: [0, -.25, 0], scale: [columns * cell + 4, .5, Math.ceil(names.length / columns) * cell + 4] }).build();
    const floor = renderer.batch(ground, { capacity: 1 });
    floor.add(0, 0, 0);
    batches.push(floor);
    let triangles = 0;
    await Promise.all(names.map(async (name, i) => {
        const mesh = await fileModel(name);
        if (!mesh) return;
        const size = sizeOf(name);
        const x = (i % columns - (columns - 1) / 2) * cell, z = (Math.floor(i / columns) - (Math.ceil(names.length / columns) - 1) / 2) * cell;
        const batch = renderer.batch(mesh, { capacity: 1 });
        batch.add(x - size.x, -size.bottom, z - size.z);
        batches.push(batch);
        triangles += mesh.count / 3;
    }));
    const distance = Number(search.get("distance")) || Math.max(8, columns * cell * .9);
    layer.camera = new Camera({ controllers: [orbit({ distance, pitch: Number(search.get("pitch") ?? .45), yaw: Number(search.get("yaw") ?? .5), max: 160 })] });
    stats.textContent = `${names.length} models, ${triangles} triangles: ${names.map(name => name.split("/")[1]).join(", ")}`;
}

form.addEventListener("change", show);
show();
engine.start();
