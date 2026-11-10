// core
import { Camera, GameEngine, GameObject, orbit } from "@papit/game-engine";
import { WOUND } from "@arrow-warfare/archery";
import { beam, Field, Meadow } from "@arrow-warfare/world";
import { rgb, Renderer, type Vec3 } from "@arrow-warfare/render";

// component
import { Bodies, Rig, type RigInput } from "@arrow-warfare/rig";

const engine = new GameEngine({ name: "main", query: "canvas", type: "webgl2", theme: true });
const layer = engine.layers.main;
const renderer = engine.add(new Renderer(layer));
const form = document.querySelector("form")!;

const field = new Field({ seed: 3, size: "small", trees: "none", buildings: "none", props: "none", towers: "none" });
engine.add(new Meadow(renderer, field, { palette: "noon", grass: .2 }));
const ground = (x: number, z: number) => field.height(x, z);
const bodies = new Bodies(renderer);
const capsules = renderer.batch(beam(6), { capacity: 120, dynamic: true, emissive: 1 });

const CLOTHES = ["#d8433a", "#3a6fd8", "#e8b52c", "#8a4fd0", "#3aa860", "#e07a2c"].map(rgb);
const SKIN: Vec3[] = [[.98, .82, .68], [.86, .64, .46], [.6, .42, .3], [.4, .27, .2], [.93, .72, .56], [.7, .5, .36]];

type Figure = { rig: Rig; input: (t: number) => Partial<RigInput>; x: number; z: number };
const still = (x: number, z: number, extra: Partial<RigInput>, yaw = 0): Figure => ({ rig: new Rig(ground), x, z, input: () => ({ yaw, ...extra }) });
const figures: Figure[] = [
    // the one in the middle walks a circle with the form's settings
    { rig: new Rig(ground), x: 0, z: 0, input: () => ({}) },
    still(-3, -2.5, {}),
    still(-1.5, -3, { draw: 1, pitch: .2 }),
    still(0, -3.2, { wounds: WOUND.leftLeg }),
    still(1.5, -3, { wounds: WOUND.leftLeg | WOUND.rightLeg }),
    still(3, -2.5, { dead: true }),
];

let walked = 0;
const data = () => new FormData(form);
let t = 0;
engine.add(new class extends GameObject {
    override update(dt: number) {
        t += dt;
        const form = data();
        const speed = Number(form.get("speed"));
        walked += speed * dt;
        const radius = 2;
        const angle = walked / radius;
        const wounds = (form.get("leftArm") ? WOUND.leftArm : 0) | (form.get("rightArm") ? WOUND.rightArm : 0) | (form.get("leftLeg") ? WOUND.leftLeg : 0) | (form.get("rightLeg") ? WOUND.rightLeg : 0);
        let index = 0;
        // `?only=3` shows one figure alone
        const only = search.get("only");
        const shown = figures.filter((_, i) => only === null || String(i) === only).map((figure) => {
            const i = figures.indexOf(figure);
            const own = i === 0;
            const x = own ? Math.cos(angle) * radius : figure.x, z = own ? Math.sin(angle) * radius : figure.z;
            // walking the circle anticlockwise seen from above: facing along it
            const yaw = own ? Math.PI - angle : 0;
            const base: RigInput = {
                x, y: ground(x, z), z, yaw, pitch: Number(form.get("pitch")), draw: Number(form.get("draw")), left: !!form.get("left"),
                stage: form.get("panting") ? 3 : 0, wounds: own ? wounds : 0, resting: !!form.get("resting") && own, dead: !!form.get("dead") && own, blow: { part: "torso", direction: [0, 0, 1], power: .7 },
            };
            if (!own) Object.assign(base, { pitch: 0, draw: 0, stage: 0 }, figure.input(t));
            figure.rig.update(dt, base);
            if (form.get("capsules"))
            {
                for (const capsule of figure.rig.capsules)
                {
                    const a = figure.rig.world(capsule.a), b = figure.rig.world(capsule.b);
                    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
                    const length = Math.hypot(dx, dy, dz) || .01;
                    capsules.place(index, a[0], a[1], a[2], Math.atan2(-dx, -dz), Math.asin(Math.max(-1, Math.min(1, dy / length))), 0, capsule.radius * 2, capsule.radius * 2, length);
                    capsules.tint(index++, [1, .2, .2], .6);
                }
            }
            return { rig: figure.rig, look: { clothes: CLOTHES[i], skin: SKIN[i] } };
        });
        capsules.count = index;
        bodies.draw(shown);
    }
}());

// `?yaw=3&distance=4&x=0&z=-3` to look from elsewhere
const search = new URLSearchParams(location.search);
const number = (name: string, fallback: number) => Number(search.get(name) ?? fallback);
const target = { position: { x: number("x", 0), y: 0, z: number("z", -1) } };
target.position.y = field.height(target.position.x, target.position.z) + number("y", .6);
layer.camera = new Camera({ far: 400, controllers: [orbit({ target, distance: number("distance", 7), pitch: number("pitch", .35), yaw: number("yaw", .4), max: 30 })] });
for (const [key, value] of search) {
    const field = form.elements.namedItem(key) as HTMLInputElement | null;
    if (field) field.type === "checkbox" ? field.checked = value === "1" : field.value = value;
}
engine.start();
