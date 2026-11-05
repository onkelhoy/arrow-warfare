import { COLOURS, escape, SKINS, wears, type GameState } from "@arrow-warfare/core";
import type { Pose } from "@arrow-warfare/net";
import { multiply, rgb, type Batch, type Renderer } from "@arrow-warfare/render";
import { body, head, NECK, type Field, type Spawn } from "@arrow-warfare/world";
import type { Camera } from "@papit/game-engine";

/** ms behind the newest pose that others are drawn, so there's usually a pose on each side to blend. */
const DELAY = 110;
/** How far past the newest pose a player is carried on before they wait. */
const AHEAD = 250;
/** Names further away than this aren't shown. */
const NAMES = 70;

type Other = { id: string; poses: Pose[]; label: HTMLElement; stride: number; lastX: number; lastZ: number; colour: number; skin: number };

/** Everyone else: their poses as they come, drawn a little in the past and blended between. */
export class Others {
    private others = new Map<string, Other>();
    private bodies: Batch;
    private heads: Batch;
    private viewProjection = new Float32Array(16);

    constructor(private renderer: Renderer, private field: Field, private labels: HTMLElement, private me: string, spawns: Record<string, Spawn>, state: GameState) {
        this.bodies = renderer.batch(body(), { capacity: 16, dynamic: true });
        this.heads = renderer.batch(head(), { capacity: 16, dynamic: true });
        this.update(state, spawns);
    }

    /** Players come and go with the state, a new one stands at their spawn until they move. */
    update(state: GameState, spawns: Record<string, Spawn> = {}) {
        const ids = new Set(state.players.map(player => player.id).filter(id => id !== this.me));
        for (const [id, other] of this.others)
        {
            if (ids.has(id)) continue;
            other.label.remove();
            this.others.delete(id);
        }
        for (const player of state.players)
        {
            if (player.id === this.me) continue;
            let other = this.others.get(player.id);
            if (!other)
            {
                const spawn = spawns[player.id] ?? { x: 0, z: 0, yaw: 0 };
                const label = document.createElement("div");
                label.className = "aw-play-name";
                this.labels.append(label);
                other = {
                    id: player.id, label, stride: 0, lastX: spawn.x, lastZ: spawn.z, colour: 0, skin: 0,
                    poses: [{ time: -Infinity, x: spawn.x, y: this.field.height(spawn.x, spawn.z), z: spawn.z, yaw: spawn.yaw, pitch: 0, speed: 0 }],
                };
                this.others.set(player.id, other);
            }
            other.label.innerHTML = `<span style="background: ${COLOURS[wears(state, player)].hex}"></span>${escape(player.name)}`;
            other.colour = wears(state, player);
            other.skin = player.skin;
        }
    }

    receive(id: string, pose: Pose) {
        const other = this.others.get(id);
        if (!other) return;
        const poses = other.poses;
        // late ones are dropped, the channel doesn't keep order
        if (pose.time <= poses[poses.length - 1].time) return;
        poses.push(pose);
        if (poses.length > 12) poses.shift();
    }

    /** Draws everyone as they were `DELAY` ms ago on the shared clock, and puts their names over them. */
    frame(now: number, camera: Camera, width: number, height: number) {
        const at = now - DELAY;
        multiply(this.viewProjection, camera.projectionMatrix, camera.viewMatrix);
        let index = 0;
        for (const other of this.others.values())
        {
            const pose = sample(other.poses, at);
            const moved = Math.hypot(pose.x - other.lastX, pose.z - other.lastZ);
            other.stride += moved * 2.7;
            other.lastX = pose.x;
            other.lastZ = pose.z;
            const ground = this.field.height(pose.x, pose.z);
            const hop = Math.abs(Math.sin(other.stride)) * .06 * Math.min(1, pose.speed / 3);
            const { colour, skin } = other;

            this.bodies.place(index, pose.x, ground + hop, pose.z, pose.yaw);
            this.bodies.tint(index, rgb(COLOURS[colour].hex));
            this.heads.place(index, pose.x, ground + hop + NECK, pose.z, pose.yaw, pose.pitch * .6);
            this.heads.tint(index, rgb(SKINS[skin] ?? SKINS[0]));
            index++;

            this.placeLabel(other.label, pose.x, ground + 1.75, pose.z, camera, width, height);
        }
        this.bodies.count = this.heads.count = index;
    }

    destroy() {
        this.renderer.removeBatch(this.bodies);
        this.renderer.removeBatch(this.heads);
        for (const other of this.others.values()) other.label.remove();
        this.others.clear();
    }

    private placeLabel(label: HTMLElement, x: number, y: number, z: number, camera: Camera, width: number, height: number) {
        const m = this.viewProjection;
        const cx = m[0] * x + m[4] * y + m[8] * z + m[12];
        const cy = m[1] * x + m[5] * y + m[9] * z + m[13];
        const w = m[3] * x + m[7] * y + m[11] * z + m[15];
        const eye = camera.worldPosition;
        const far = Math.hypot(x - eye.x, z - eye.z) > NAMES;
        if (w <= .1 || far)
        {
            label.hidden = true;
            return;
        }
        const sx = (cx / w * .5 + .5) * width;
        const sy = (1 - (cy / w * .5 + .5)) * height;
        label.hidden = sx < -100 || sx > width + 100 || sy < -50 || sy > height + 50;
        if (label.hidden) return;
        label.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) translate(-50%, -100%)`;
    }
}

/** The pose at `time`, blended between the two around it, carried on a little past the newest. */
function sample(poses: Pose[], time: number): Pose {
    const last = poses[poses.length - 1];
    if (time >= last.time)
    {
        const before = poses[poses.length - 2];
        if (!before || !Number.isFinite(before.time) || last.time - before.time <= 0) return last;
        const t = Math.min(time - last.time, AHEAD) / (last.time - before.time);
        return blend(last, { ...last, x: last.x + (last.x - before.x), z: last.z + (last.z - before.z) }, t);
    }
    for (let i = poses.length - 1; i > 0; i--)
    {
        const a = poses[i - 1], b = poses[i];
        if (time < a.time) continue;
        if (!Number.isFinite(a.time)) return b;
        return blend(a, b, (time - a.time) / (b.time - a.time));
    }
    return poses[0];
}

function blend(a: Pose, b: Pose, t: number): Pose {
    let turn = b.yaw - a.yaw;
    turn -= Math.round(turn / (Math.PI * 2)) * Math.PI * 2;
    return {
        time: a.time + (b.time - a.time) * t,
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        z: a.z + (b.z - a.z) * t,
        yaw: a.yaw + turn * t,
        pitch: a.pitch + (b.pitch - a.pitch) * t,
        speed: a.speed + (b.speed - a.speed) * t,
    };
}
