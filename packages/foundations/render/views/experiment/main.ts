// core
import { Camera, GameEngine, orbit } from "@papit/game-engine";

// component
import { MeshBuilder, NOON, Renderer, type Vec3 } from "@arrow-warfare/render";

const engine = new GameEngine({ name: "main", query: "canvas", type: "webgl2", theme: true });
const layer = engine.layers.main;
const renderer = engine.add(new Renderer(layer));
renderer.light = structuredClone(NOON);

// a ground plate, a few shapes in the light and fog, and a field of swaying blades
const ground = new MeshBuilder().box("#6fa646", { at: [0, -.25, 0], scale: [80, .5, 80] }).build();
renderer.batch(ground).add(0, 0, 0);

const shapes = new MeshBuilder()
    .box("#c9734a", { at: [-3, .5, 0] })
    .cylinder("#7b5a3a", { at: [0, 0, 0], scale: [.6, 1.6, .6] }, 7, .5, .4, true, .15, 3)
    .ball("#4f8f3a", { at: [0, 2.3, 0], scale: 1.1 }, 1, .25, 7)
    .cylinder("#e6e0d2", { at: [3, 0, 0], scale: [.3, .5, .3] }, 6)
    .ball(point => point[1] > -.2 ? "#d8433a" : "#f2ead8", { at: [3, .5, 0], scale: [.7, .45, .7] }, 1)
    .box("#ffffff", { at: [0, .5, 3], tint: 1 })
    .build();
const many = renderer.batch(shapes, { capacity: 64 });
const colours: Vec3[] = [[.85, .25, .2], [.2, .45, .85], [.95, .75, .2], [.55, .3, .75]];
for (let i = 0; i < 16; i++)
{
    const angle = i / 16 * Math.PI * 2;
    many.add(Math.cos(angle) * 14, 0, Math.sin(angle) * 14, -angle, 1, colours[i % colours.length]);
}
many.add(0, 0, 0, 0, 1, [.3, .7, .4]);

const tuft = new MeshBuilder();
for (let i = 0; i < 5; i++) tuft.blade("#3f7a2c", "#a8d36a", { yaw: i * 1.3, roll: (i - 2) * .15, at: [(i - 2) * .05, 0, 0] }, .08, .5 + i % 3 * .12);
const grass = renderer.batch(tuft.build(), { capacity: 4000, sway: .12 });
for (let i = 0; i < 4000; i++)
{
    const r = 4 + Math.random() * 30, a = Math.random() * Math.PI * 2;
    grass.add(Math.cos(a) * r, 0, Math.sin(a) * r, Math.random() * 6, .8 + Math.random() * .6);
}

layer.camera = new Camera({ controllers: [orbit({ distance: 12, pitch: .35, yaw: .6, max: 60 })] });

const stats = document.querySelector(".stats")!;
let frames = 0, since = performance.now();
engine.loop(() => {
    frames++;
    const now = performance.now();
    if (now - since > 500)
    {
        stats.textContent = `${Math.round(frames * 1000 / (now - since))} fps · ${renderer.drawn} triangles · ${layer.width}×${layer.height}`;
        frames = 0;
        since = now;
    }
});
