// core
import { GameEngine, GameObject, type Camera } from "@papit/game-engine";
import { mat4, NOON, Renderer, type Batch } from "@arrow-warfare/render";

// component
import { CATALOG, fileModel, sizeOf, type ModelName } from "@arrow-warfare/world";

// every model in `asset/models` on its own tile, like pap-adventure's gallery: drag one to turn it
const engine = new GameEngine({ name: "main", query: "canvas", type: "webgl2", theme: true });
const layer = engine.layers.main;
const renderer = new Renderer(layer);
renderer.light = structuredClone(NOON);
const gl = renderer.gl;

type Item = { name: ModelName; figure: HTMLElement; batch: Batch | null; yaw: number; drag: number | null };
const items: Item[] = [];
const main = document.querySelector("main")!;
const names = Object.keys(CATALOG) as ModelName[];
for (const group of [...new Set(names.map(name => name.split("/")[0]))])
{
    main.insertAdjacentHTML("beforeend", `<h2>${group}</h2>`);
    const section = main.appendChild(document.createElement("section"));
    for (const name of names.filter(name => name.startsWith(`${group}/`)))
    {
        const figure = section.appendChild(document.createElement("figure"));
        figure.innerHTML = `<figcaption>${name.split("/")[1]}<small>${CATALOG[name].triangles.toLocaleString()} tris</small></figcaption>`;
        const item: Item = { name, figure, batch: null, yaw: .6, drag: null };
        figure.onpointerdown = event => { item.drag = event.clientX; figure.setPointerCapture(event.pointerId); };
        figure.onpointermove = event => {
            if (item.drag === null) return;
            item.yaw += (event.clientX - item.drag) * .01;
            item.drag = event.clientX;
        };
        figure.onpointerup = () => item.drag = null;
        items.push(item);
        fileModel(name).then(mesh => {
            if (!mesh) return;
            item.batch = renderer.batch(mesh, { capacity: 1, twoSided: true });
            item.batch.add(0, 0, 0);
        });
    }
}

const view = mat4(), projection = mat4();
const camera = { viewMatrix: view, projectionMatrix: projection, worldPosition: { x: 0, y: 0, z: 0 } } as unknown as Camera;

class Gallery extends GameObject {
    override update(dt: number) {
        renderer.time += dt;
        for (const item of items) if (item.drag === null) item.yaw += dt * .35;
    }

    override render() {
        gl.enable(gl.SCISSOR_TEST);
        gl.scissor(0, 0, layer.width, layer.height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        const ratio = layer.width / innerWidth;
        for (const item of items)
        {
            const box = item.figure.getBoundingClientRect();
            if (!item.batch || box.bottom < 0 || box.top > innerHeight) continue;
            const x = box.left * ratio, y = layer.height - box.bottom * ratio, w = box.width * ratio, h = box.height * ratio;
            gl.viewport(x, y, w, h);
            gl.scissor(x, y, w, h);
            gl.clear(gl.DEPTH_BUFFER_BIT);
            // only this one, turned, its middle at the origin
            for (const other of items) if (other.batch) other.batch.visible = other === item;
            const size = sizeOf(item.name);
            const c = Math.cos(item.yaw), s = Math.sin(item.yaw);
            item.batch.place(0, -(size.x * c + size.z * s), -size.bottom - size.height / 2, -(-size.x * s + size.z * c), item.yaw, 0, 0, 1);
            const reach = Math.max(size.height, Math.hypot(size.width, size.depth)) * 1.7;
            lookAt([0, reach * .45, reach], w / h, reach);
            renderer.frame(camera);
        }
        gl.disable(gl.SCISSOR_TEST);
        gl.viewport(0, 0, layer.width, layer.height);
    }
}

/** The camera at `eye`, looking at the origin. */
function lookAt(eye: [number, number, number], aspect: number, reach: number) {
    const length = Math.hypot(...eye);
    const fz = eye.map(v => v / length);
    // right = up x back, up = back x right
    const rx = fz[2], rz = -fz[0], rl = Math.hypot(rx, rz) || 1;
    const r = [rx / rl, 0, rz / rl];
    const u = [fz[1] * r[2] - fz[2] * r[1], fz[2] * r[0] - fz[0] * r[2], fz[0] * r[1] - fz[1] * r[0]];
    view.set([r[0], u[0], fz[0], 0, r[1], u[1], fz[1], 0, r[2], u[2], fz[2], 0,
        -(r[0] * eye[0] + r[1] * eye[1] + r[2] * eye[2]), -(u[0] * eye[0] + u[1] * eye[1] + u[2] * eye[2]), -(fz[0] * eye[0] + fz[1] * eye[1] + fz[2] * eye[2]), 1]);
    const near = reach * .02, far = reach * 10, f = 1 / Math.tan(.75 / 2);
    projection.set([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) / (near - far), -1, 0, 0, 2 * far * near / (near - far), 0]);
    Object.assign((camera as unknown as { worldPosition: object }).worldPosition, { x: eye[0], y: eye[1], z: eye[2] });
}

engine.add(new Gallery());
engine.start();
