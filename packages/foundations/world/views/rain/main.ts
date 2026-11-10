import { Camera, GameEngine, orbit } from "@papit/game-engine";
import { Renderer } from "@arrow-warfare/render";
import { Ambience, Sound } from "@arrow-warfare/sound";
import { Field, Meadow, Rain, type MapKind, type PaletteName } from "@arrow-warfare/world";

const engine = new GameEngine({ name: "main", query: "canvas", type: "webgl2", theme: true });
const layer = engine.layers.main;
const renderer = engine.add(new Renderer(layer));
const form = document.querySelector("form")!;
const stats = document.querySelector(".stats")!;

const sound = new Sound();
let ambience: Ambience | null = null;
let meadow: Meadow | null = null;
let rain: Rain | null = null;
let field: Field | null = null;
let camera: Camera | null = null;
const target = { position: { x: 0, y: 1.7, z: 0 } };

function build() {
    if (meadow) engine.remove(meadow);
    if (rain) engine.remove(rain);
    ambience?.stop();
    rain = null;

    const data = new FormData(form);
    const palette = String(data.get("palette")) as PaletteName;
    const raining = data.get("rain") === "on";
    field = new Field({ seed: 4, size: "small", map: data.get("map") as MapKind, buildings: "many", props: "many", trees: "few", towers: "few" });
    meadow = engine.add(new Meadow(renderer, field, { palette, rain: raining }));
    target.position = { x: 0, y: field.height(0, 0) + 1.7, z: 0 };
    // standing in the middle at eye height, looking a little down at the splashes
    camera ??= new Camera({ far: 320, controllers: [orbit({ target, distance: .1, pitch: .25, yaw: .5, max: 1 })] });
    layer.camera = camera;

    ambience = new Ambience(sound);
    ambience.rain(raining);
    ambience.time(palette);
    ambience.emitters(field.ponds.map(pond => ({ name: "frogs", at: [pond.x, pond.level, pond.z], half: 3, reach: 35 })));
    if (!raining) return;
    rain = engine.add(new Rain(renderer, field, camera, { drops: Number(data.get("drops")), splashes: data.get("splashes") === "on", lightning: data.get("lightning") === "on" }));
    rain.onLightning = distance => ambience?.thunder(distance);
}

form.addEventListener("change", build);
document.querySelector("#strike")!.addEventListener("click", () => rain?.strike());

let last = performance.now();
engine.loop(() => {
    const now = performance.now();
    const dt = Math.min(.1, (now - last) / 1000);
    last = now;
    const m = layer.camera?.worldMatrix;
    if (m)
    {
        sound.listen([m[12], m[13], m[14]], [-m[8], -m[9], -m[10]], [m[4], m[5], m[6]]);
        ambience?.update(dt, [m[12], m[13], m[14]]);
    }
    stats.textContent = `${Math.round(1 / Math.max(dt, .001))} fps · ${renderer.drawn} triangles`;
});

build();
