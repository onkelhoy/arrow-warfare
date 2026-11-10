// core
import { Camera, GameEngine, orbit } from "@papit/game-engine";

// component
import { loadModel, MeshBuilder, NOON, Renderer } from "@arrow-warfare/render";

const engine = new GameEngine({ name: "main", query: "canvas", type: "webgl2", theme: true });
const layer = engine.layers.main;
const renderer = engine.add(new Renderer(layer));
renderer.light = structuredClone(NOON);

const ground = new MeshBuilder().box("#6fa646", { at: [0, -.25, 0], scale: [40, .5, 40] }).build();
renderer.batch(ground).add(0, 0, 0);

// a .glb from Blender (papit's Suzanne, vertex colours), drawn in a ring like any built mesh
const stats = document.querySelector(".stats")!;
try
{
    const model = await loadModel("public/models/suzanne.glb");
    const ring = renderer.batch(model, { capacity: 8 });
    ring.add(0, 1.2, 0);
    for (let i = 0; i < 6; i++)
    {
        const angle = i / 6 * Math.PI * 2;
        ring.add(Math.cos(angle) * 4, 1, Math.sin(angle) * 4, -angle + Math.PI / 2, .7);
    }
    stats.textContent = `${model.count / 3} triangles per model`;
}
catch (error)
{
    stats.textContent = `could not load: ${(error as Error).message}`;
}

layer.camera = new Camera({ controllers: [orbit({ distance: 9, pitch: .35, yaw: .6, max: 40 })] });
