// core
import { GameEngine, GameObject, type Camera } from "@papit/game-engine";
import { mat4, multiply, compose, NOON, Renderer, type Batch, type Rigged } from "@arrow-warfare/render";

// component
import { GUN_FILES, loadGun, type GunKind } from "@arrow-warfare/world";

// both guns side by side in model space (as the file has them), turning; buttons play their animations
const engine = new GameEngine({ name: "main", query: "canvas", type: "webgl2", theme: true });
const layer = engine.layers.main;
const renderer = new Renderer(layer);
renderer.light = structuredClone(NOON);

type Shown = { kind: GunKind; gun: Rigged; batches: Batch[]; play: string | null; time: number };
const shown: Shown[] = [];
const buttons = document.querySelector(".aw-buttons")!;
for (const [index, kind] of (["revolver", "rifle"] as GunKind[]).entries())
    loadGun(kind).then(gun => {
        if (!gun) return;
        const item: Shown = { kind, gun, batches: gun.parts.map(part => renderer.batch(part.mesh, { capacity: 1, dynamic: true, twoSided: true })), play: null, time: 0 };
        item.batches.forEach(batch => { batch.count = 1; batch.tint(0, [1, 1, 1]); });
        (item as Shown & { x: number }).x = index;
        shown.push(item);
        for (const name of gun.gltf.animations.map(animation => animation.name ?? ""))
        {
            const button = buttons.appendChild(document.createElement("button"));
            button.textContent = `${kind} ${name}${name === GUN_FILES[kind].fire ? " (fire)" : ""}`;
            button.onclick = () => { item.play = name; item.time = 0; };
        }
    });

let yaw = .6, drag: number | null = null;
layer.canvas.addEventListener("pointerdown", event => drag = event.clientX);
addEventListener("pointermove", event => {
    if (drag === null) return;
    yaw += (event.clientX - drag) * .01;
    drag = event.clientX;
});
addEventListener("pointerup", () => drag = null);

const view = mat4(), projection = mat4(), place = mat4(), piece = mat4(), world = mat4();
const camera = { viewMatrix: view, projectionMatrix: projection, worldPosition: { x: 0, y: 0, z: 0 } } as unknown as Camera;

class Range extends GameObject {
    override update(dt: number) {
        renderer.time += dt;
        if (drag === null) yaw += dt * .3;
        for (const item of shown)
        {
            if (item.play)
            {
                item.time += dt;
                if (item.time > item.gun.duration(item.play) + .5) item.play = null;
            }
            item.gun.pose(item.play, item.time);
            const x = ((item as Shown & { x: number }).x - .5) * 14;
            compose(place, 0, x, 0, 0, yaw);
            item.batches.forEach((batch, i) => batch.matrix(0, multiply(world, place, item.gun.matrix(piece, i))));
        }
    }

    override render() {
        lookAt([0, 8, 26], layer.width / layer.height);
        renderer.frame(camera);
    }
}

function lookAt(eye: [number, number, number], aspect: number) {
    const length = Math.hypot(...eye);
    const fz = eye.map(v => v / length);
    const rx = fz[2], rz = -fz[0], rl = Math.hypot(rx, rz) || 1;
    const r = [rx / rl, 0, rz / rl];
    const u = [fz[1] * r[2] - fz[2] * r[1], fz[2] * r[0] - fz[0] * r[2], fz[0] * r[1] - fz[1] * r[0]];
    view.set([r[0], u[0], fz[0], 0, r[1], u[1], fz[1], 0, r[2], u[2], fz[2], 0,
        -(r[0] * eye[0] + r[1] * eye[1] + r[2] * eye[2]), -(u[0] * eye[0] + u[1] * eye[1] + u[2] * eye[2]), -(fz[0] * eye[0] + fz[1] * eye[1] + fz[2] * eye[2]), 1]);
    const near = .5, far = 300, f = 1 / Math.tan(.75 / 2);
    projection.set([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) / (near - far), -1, 0, 0, 2 * far * near / (near - far), 0]);
    Object.assign((camera as unknown as { worldPosition: object }).worldPosition, { x: eye[0], y: eye[1], z: eye[2] });
}

engine.add(new Range());
engine.start();
