import { Draw, fly, launch, speedOf, type Shot } from "@arrow-warfare/archery";
import { Field } from "@arrow-warfare/world";

// a flat stand-in field: no trees, ground at 0, wide enough
const field = { radius: 500, obstacles: [], height: () => 0 } as unknown as Field;

const flight = document.querySelector<HTMLCanvasElement>("#flight")!;
const angle = document.querySelector<HTMLInputElement>("#angle")!;
const plot = () => {
    const g = flight.getContext("2d")!;
    const { width, height } = flight;
    const scale = width / 100;
    g.clearRect(0, 0, width, height);
    g.fillStyle = "#5a9c3c";
    g.fillRect(0, height - 20, width, 20);
    const radians = Number(angle.value) * Math.PI / 180;
    document.querySelector("#angle-value")!.textContent = `${angle.value}°`;
    for (const power of [.25, .5, .75, 1])
    {
        const shot: Shot = { id: "a:1", by: "a", time: 0, x: 0, y: 1.4, z: 0, dx: Math.cos(radians), dy: Math.sin(radians), dz: 0, speed: speedOf(power) };
        const arrow = launch(shot);
        g.beginPath();
        g.moveTo(0, height - 20 - arrow.y * scale);
        for (let t = 0; t < 6000 && !arrow.rest && !arrow.gone; t += 20)
        {
            fly(arrow, t, field);
            g.lineTo(arrow.x * scale, height - 20 - arrow.y * scale);
        }
        g.strokeStyle = `rgb(120 60 20 / ${.3 + power * .7})`;
        g.lineWidth = 2;
        g.stroke();
        g.fillStyle = "#2b1a0e";
        g.fillText(`${Math.round(power * 100)}% ${arrow.x.toFixed(0)} m`, Math.min(width - 70, arrow.x * scale), height - 26);
    }
};
angle.addEventListener("input", plot);
plot();

const canvas = document.querySelector<HTMLCanvasElement>("#draw")!;
const out = document.querySelector("#draw-state")!;
const draw = new Draw();
let space = false;
let said = "";
window.addEventListener("keydown", event => {
    if (event.code !== "Space") return;
    event.preventDefault();
    if (!space) draw.start(1);
    space = true;
});
window.addEventListener("keyup", event => {
    if (event.code !== "Space") return;
    space = false;
    const result = draw.release();
    if (result) said = result.kind === "shot" ? `shot at ${Math.round(result.power * 100)}%` : "let down";
});
const trail: [number, number][] = [];
let last = performance.now();
const loop = (now: number) => {
    const dt = Math.min(.1, (now - last) / 1000);
    last = now;
    if (space) draw.hold(dt);
    const slipped = draw.update(dt);
    if (slipped) said = `slipped at ${Math.round(slipped.power * 100)}%`;
    const [yaw, pitch] = draw.sway;
    trail.push([yaw, pitch]);
    if (trail.length > 120) trail.shift();

    const g = canvas.getContext("2d")!;
    const { width, height } = canvas;
    g.clearRect(0, 0, width, height);
    // the aim's drift, 1 px is .2 milliradians
    g.strokeStyle = "#f2c94c";
    g.beginPath();
    trail.forEach(([x, y], i) => i ? g.lineTo(width / 2 + x * 5000, height / 2 - y * 5000) : g.moveTo(width / 2 + x * 5000, height / 2 - y * 5000));
    g.stroke();
    const vignette = g.createRadialGradient(width / 2, height / 2, 40, width / 2, height / 2, width / 2);
    vignette.addColorStop(0, "rgb(0 0 0 / 0)");
    vignette.addColorStop(1, `rgb(0 0 0 / ${draw.tunnel * .9})`);
    g.fillStyle = vignette;
    g.fillRect(0, 0, width, height);
    g.fillStyle = "#e2553d";
    g.fillRect(20, height - 30, draw.amount * 300, 10);
    g.fillStyle = "#3d7be2";
    g.fillRect(20, height - 16, draw.tired * 300, 6);
    out.textContent = `phase ${draw.phase} · pull ${draw.amount.toFixed(2)} · fatigue ${draw.fatigue.toFixed(1)} s · stage ${draw.stage} · tunnel ${draw.tunnel.toFixed(2)} · walk ${draw.walk.toFixed(2)} · look ${draw.look.toFixed(2)}\n${said}`;
    requestAnimationFrame(loop);
};
requestAnimationFrame(loop);
