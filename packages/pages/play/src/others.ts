import { COLOURS, escape, SKINS, wears, type GameState } from "@arrow-warfare/core";
import { toWorld, type BodyPlace } from "@arrow-warfare/archery";
import type { Pose } from "@arrow-warfare/net";
import { compose, mat4, multiply, rgb, type Batch, type Renderer } from "@arrow-warfare/render";
import { arrow, body, bow, head, NECK, type Field, type Spawn } from "@arrow-warfare/world";
import type { Camera } from "@papit/game-engine";

/** ms behind the newest pose that others are drawn, so there's usually a pose on each side to blend. */
const DELAY = 110;
/** How far past the newest pose a player is carried on before they wait. */
const AHEAD = 250;
/** Names further away than this aren't shown. */
const NAMES = 70;
/** How far a body tips over when it dies, and how fast. */
const FALL = Math.PI / 2 * .94;
const FALL_SPEED = 3.2;

type Other = {
    id: string; poses: Pose[]; label: HTMLElement; stride: number; lastX: number; lastZ: number; colour: number; skin: number;
    /** 0 bow low .. 1 up for a shot, eased. */
    raise: number;
    /** Where they lie, once dead. */
    corpse: BodyPlace | null;
    tip: number;
    /** What was drawn this frame, for hit tests and stuck arrows. */
    place: BodyPlace;
    clock: number;
};

/** Everyone else: their poses as they come, drawn a little in the past and blended between. */
export class Others {
    private others = new Map<string, Other>();
    private bodies: Batch;
    private heads: Batch;
    private bows: Batch;
    private nocked: Batch;
    private viewProjection = new Float32Array(16);
    private local = mat4();
    private world = mat4();
    private holder = mat4();

    constructor(private renderer: Renderer, private field: Field, private labels: HTMLElement, private me: string, spawns: Record<string, Spawn>, state: GameState) {
        this.bodies = renderer.batch(body(), { capacity: 16, dynamic: true });
        this.heads = renderer.batch(head(), { capacity: 16, dynamic: true });
        this.bows = renderer.batch(bow(), { capacity: 16, dynamic: true });
        this.nocked = renderer.batch(arrow(), { capacity: 16, dynamic: true });
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
                const y = this.field.height(spawn.x, spawn.z);
                other = {
                    id: player.id, label, stride: 0, lastX: spawn.x, lastZ: spawn.z, colour: 0, skin: 0, raise: 0, corpse: null, tip: 0, clock: Math.random() * 10,
                    place: { x: spawn.x, y, z: spawn.z, yaw: spawn.yaw },
                    poses: [{ time: -Infinity, x: spawn.x, y, z: spawn.z, yaw: spawn.yaw, pitch: 0, speed: 0, draw: 0, stage: 0 }],
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
        if (!other || other.corpse) return;
        const poses = other.poses;
        // late ones are dropped, the channel doesn't keep order
        if (pose.time <= poses[poses.length - 1].time) return;
        poses.push(pose);
        if (poses.length > 12) poses.shift();
    }

    /** They died where they say they were hit: they lie there from now on. */
    kill(id: string, place: BodyPlace) {
        const other = this.others.get(id);
        if (!other || other.corpse) return;
        other.corpse = { x: place.x, y: place.y, z: place.z, yaw: place.yaw };
        other.label.hidden = true;
    }

    /** Where a body is drawn now (tipped over if dead), null for someone not here. */
    bodyOf(id: string): BodyPlace | null {
        return this.others.get(id)?.place ?? null;
    }

    /** The living, as drawn: for the view, where my phone judges everyone. */
    get living() {
        return [...this.others.values()].filter(other => !other.corpse).map(other => ({ id: other.id, place: other.place }));
    }

    /** Draws everyone as they were `DELAY` ms ago on the shared clock, and puts their names over them. */
    frame(now: number, dt: number, camera: Camera, width: number, height: number) {
        const at = now - DELAY;
        multiply(this.viewProjection, camera.projectionMatrix, camera.viewMatrix);
        let index = 0, bows = 0, nocked = 0;
        for (const other of this.others.values())
        {
            other.clock += dt;
            const { colour, skin } = other;
            const pose = other.corpse ? null : sample(other.poses, at);
            let place: BodyPlace, pitch = 0, draw = 0, stage = 0, hop = 0;
            if (pose)
            {
                const moved = Math.hypot(pose.x - other.lastX, pose.z - other.lastZ);
                other.stride += moved * 2.7;
                other.lastX = pose.x;
                other.lastZ = pose.z;
                hop = Math.abs(Math.sin(other.stride)) * .06 * Math.min(1, pose.speed / 3);
                place = { x: pose.x, y: this.field.height(pose.x, pose.z) + hop, z: pose.z, yaw: pose.yaw };
                pitch = pose.pitch;
                draw = pose.draw;
                stage = pose.stage;
            }
            else
            {
                other.tip = Math.min(FALL, other.tip + dt * FALL_SPEED * (.3 + other.tip));
                place = { ...other.corpse!, tip: other.tip };
            }
            other.place = place;
            other.raise += ((draw > .02 ? 1 : 0) - other.raise) * (1 - Math.exp(-dt * 8));

            // panting heaves the whole body
            const heave = stage === 3 ? 1 + Math.sin(other.clock * 7) * .035 : 1;
            compose(this.local, 0, place.x, place.y, place.z, place.yaw, place.tip ?? 0, 0, 1, heave, 1);
            this.bodies.matrix(index, this.local);
            this.bodies.tint(index, rgb(COLOURS[colour].hex));
            const neck = toWorld(place, [0, NECK * heave, 0]);
            this.heads.place(index, neck[0], neck[1], neck[2], place.yaw, (place.tip ?? 0) + pitch * .6);
            this.heads.tint(index, rgb(SKINS[skin] ?? SKINS[0]));
            index++;

            if (pose)
            {
                this.holdBow(other, place, pitch, draw, stage, bows);
                bows++;
                if (draw > .02)
                {
                    // the arrow along the aim, from the string forward
                    this.nocked.matrix(nocked, multiply(this.world, this.holder, compose(this.local, 0, .018, .012, .1 + .3 * draw - .78)));
                    this.nocked.tint(nocked, rgb(COLOURS[colour].hex));
                    nocked++;
                }
                this.placeLabel(other.label, place.x, place.y + 1.75, place.z, camera, width, height);
            }
        }
        this.bodies.count = this.heads.count = index;
        this.bows.count = bows;
        this.nocked.count = nocked;
    }

    /** Low at the side while walking, up in front along the aim while drawing, bent by the draw. */
    private holdBow(other: Other, place: BodyPlace, pitch: number, draw: number, stage: number, index: number) {
        const r = other.raise;
        const shake = stage >= 2 ? Math.sin(other.clock * 29) * .02 * draw : 0;
        // around the shoulders, turned by the aim's pitch when up
        compose(this.holder, 0, place.x, place.y + .95, place.z, place.yaw, pitch * r + shake, 0);
        const x = -.42 + .3 * r, y = -.35 + .35 * r, z = -.1 - .45 * r;
        const roll = -.2 * (1 - r) + .25 * r, tilt = -1.1 * (1 - r);
        const bend = 1 + draw * .9;
        compose(this.local, 0, x, y, z, 0, tilt, roll, 1, 1 - draw * .06, bend);
        this.bows.matrix(index, multiply(this.world, this.holder, this.local));
        this.bows.tint(index, [1, 1, 1]);
        // the nocked arrow is placed in the bow's frame, without its bend
        compose(this.local, 0, x, y, z, 0, tilt, roll);
        multiply(this.holder, this.holder, this.local);
    }

    destroy() {
        for (const batch of [this.bodies, this.heads, this.bows, this.nocked]) this.renderer.removeBatch(batch);
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
        draw: a.draw + (b.draw - a.draw) * t,
        stage: t < .5 ? a.stage : b.stage,
    };
}

