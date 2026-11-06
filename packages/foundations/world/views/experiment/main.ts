// core
import { Camera, GameEngine, orbit } from "@papit/game-engine";
import { rgb, Renderer, type Batch, type Vec3 } from "@arrow-warfare/render";

// component
import {
    birchTree, body, currentPalette, Field, flower, grassTuft, head, log, Meadow, mushroom, NECK,
    pineTree, roundTree, stone, stump, type MapSize, type PaletteName, type TreeAmount,
} from "@arrow-warfare/world";

const engine = new GameEngine({ name: "main", query: "canvas", type: "webgl2", theme: true });
const layer = engine.layers.main;
const renderer = engine.add(new Renderer(layer));
const form = document.querySelector("form")!;

let meadow: Meadow | null = null;
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
        const field = new Field({ seed: 3, size: "small", trees: "none" });
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

    const field = new Field({ seed: Number(data.get("seed")) || 0, size: data.get("size") as MapSize, trees: data.get("trees") as TreeAmount });
    meadow = engine.add(new Meadow(renderer, field, { palette }));
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
