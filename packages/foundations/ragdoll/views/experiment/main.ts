import { Ragdoll, type Vec } from "@arrow-warfare/ragdoll";

const height = (x: number, _z: number) => Math.sin(x * .6) * .35 + Math.sin(x * 1.7) * .08;
const canvas = document.querySelector<HTMLCanvasElement>("#fall")!;
const slow = document.querySelector<HTMLInputElement>("#slow")!;
const state = document.querySelector("#state")!;
const scale = 90, left = -2;
const sx = (x: number) => (x - left) * scale, sy = (y: number) => canvas.height - 60 - y * scale;

const sticks = [
    ["pelvis", "chest"], ["head", "chest"], ["lShoulder", "rShoulder"], ["lShoulder", "chest"], ["rShoulder", "chest"],
    ["lShoulder", "pelvis"], ["rShoulder", "pelvis"], ["head", "lShoulder"], ["head", "rShoulder"],
    ["lShoulder", "lElbow"], ["lElbow", "lHand"], ["rShoulder", "rElbow"], ["rElbow", "rHand"],
    ["pelvis", "lHip"], ["pelvis", "rHip"], ["lHip", "rHip"], ["lHip", "chest"], ["rHip", "chest"],
    ["lHip", "lKnee"], ["lKnee", "lFoot"], ["rHip", "rKnee"], ["rKnee", "rFoot"],
] as const;
type Name = typeof sticks[number][number];

let doll: Ragdoll<Name>;
const reset = (power: number) => {
    const g = height(0, 0);
    const at = (x: number, y: number, z: number): Vec => [x, g + y, z];
    doll = new Ragdoll<Name>({
        pelvis: at(0, .33, 0), chest: at(0, .85, 0), head: at(0, 1.2, 0),
        lShoulder: at(0, .9, -.35), rShoulder: at(0, .9, .35), lElbow: at(0, .66, -.42), rElbow: at(0, .66, .42), lHand: at(0, .45, -.45), rHand: at(0, .45, .45),
        lHip: at(0, .33, -.13), rHip: at(0, .33, .13), lKnee: at(0, .17, -.13), rKnee: at(0, .17, .13), lFoot: at(0, .03, -.13), rFoot: at(0, .03, .13),
    }, sticks, height, { radius: { head: .22, chest: .25, pelvis: .15 } });
    doll.push("chest", [4 + power * 10, 1 + power * 2, 0]);
    doll.push("head", [2 + power * 4, 0, 0]);
};
reset(.5);
canvas.addEventListener("click", event => reset(event.offsetX / canvas.clientWidth));

let last = performance.now();
const frame = (now: number) => {
    const dt = (now - last) / 1000;
    last = now;
    doll.update(dt * Number(slow.value));
    const g = canvas.getContext("2d")!;
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.beginPath();
    g.moveTo(0, canvas.height);
    for (let px = 0; px <= canvas.width; px += 5) g.lineTo(px, sy(height(px / scale + left, 0)));
    g.lineTo(canvas.width, canvas.height);
    g.fillStyle = "#5a9c3c";
    g.fill();
    g.strokeStyle = "#222";
    g.lineWidth = 3;
    for (const [a, b] of sticks)
    {
        const p = doll.points[a], q = doll.points[b];
        g.beginPath();
        g.moveTo(sx(p.x), sy(p.y));
        g.lineTo(sx(q.x), sy(q.y));
        g.stroke();
    }
    const head = doll.points.head;
    g.beginPath();
    g.arc(sx(head.x), sy(head.y), head.radius * scale, 0, Math.PI * 2);
    g.stroke();
    state.textContent = `${doll.time.toFixed(2)} s of physics${doll.resting ? " · resting" : ""}`;
    requestAnimationFrame(frame);
};
requestAnimationFrame(frame);
