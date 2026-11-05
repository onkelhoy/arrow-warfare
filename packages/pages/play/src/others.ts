import { COLOURS, escape, SKINS, wears, type GameState } from "@arrow-warfare/core";
import { woundOf, type BodyPlace, type Zone } from "@arrow-warfare/archery";
import type { Pose } from "@arrow-warfare/net";
import { multiply, rgb, type Renderer, type Vec3 } from "@arrow-warfare/render";
import { Bodies, Rig } from "@arrow-warfare/rig";
import type { Field, Spawn } from "@arrow-warfare/world";
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
    id: string; poses: Pose[]; label: HTMLElement; clothes: Vec3; skin: Vec3;
    rig: Rig;
    /** Wounds from hits this phone saw (the bots of the view send no poses). */
    wounds: number;
    /** Where they lie, once dead. */
    corpse: BodyPlace | null;
    tip: number;
    /** The pose drawn, a dead body keeps its last. */
    last: Pose;
};

/** Everyone else: their poses as they come, drawn a little in the past and blended between, on their rigs. */
export class Others {
    private others = new Map<string, Other>();
    private bodies: Bodies;
    private viewProjection = new Float32Array(16);
    /** The round is over: bows down. */
    unarmed = false;
    /** Not drawn (the kill cam draws the past instead), they're still followed. */
    hidden = false;
    /** Poses that replace what the network says: the winners walking up to each other at the end. */
    readonly override = new Map<string, Pose>();

    constructor(renderer: Renderer, private field: Field, private labels: HTMLElement, private me: string, spawns: Record<string, Spawn>, state: GameState) {
        this.bodies = new Bodies(renderer);
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
                const pose: Pose = { time: -Infinity, x: spawn.x, y, z: spawn.z, yaw: spawn.yaw, pitch: 0, speed: 0, draw: 0, stage: 0, left: false, wounds: 0, resting: false };
                other = {
                    id: player.id, label, clothes: [1, 1, 1], skin: [1, 1, 1], corpse: null, tip: 0, wounds: 0,
                    rig: new Rig((x, z) => this.field.height(x, z)),
                    poses: [pose], last: pose,
                };
                this.others.set(player.id, other);
            }
            const colour = wears(state, player);
            other.label.innerHTML = `<span style="background: ${COLOURS[colour].hex}"></span>${escape(player.name)}`;
            other.clothes = rgb(COLOURS[colour].hex);
            other.skin = rgb(SKINS[player.skin] ?? SKINS[0]);
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

    /** A wound this phone saw, for bodies that send no poses (the view's bots). */
    hurt(id: string, zone: Zone) {
        const other = this.others.get(id);
        if (other) other.wounds |= woundOf(zone);
    }

    /** A body's rig, null for someone not here. */
    rigOf(id: string): Rig | null {
        return this.others.get(id)?.rig ?? null;
    }

    /** The living, as drawn: for the view, where my phone judges everyone. */
    get living() {
        return [...this.others.values()].filter(other => !other.corpse).map(other => ({ id: other.id, rig: other.rig }));
    }

    /** Where someone is drawn now, null for someone not here. */
    poseOf(id: string): Pose | null {
        const other = this.others.get(id);
        if (!other) return null;
        return other.corpse ? { ...other.last, ...other.corpse } : other.last;
    }

    lookOf(id: string) {
        const other = this.others.get(id);
        return other ? { clothes: other.clothes, skin: other.skin } : null;
    }

    /**
     * Draws everyone as they were `DELAY` ms ago on the shared clock, and puts their names over them.
     * `extra` are more bodies to draw with them (mine, once I'm out of it).
     */
    frame(now: number, dt: number, camera: Camera, width: number, height: number, extra: Parameters<Bodies["draw"]>[0] = []) {
        const at = now - DELAY;
        multiply(this.viewProjection, camera.projectionMatrix, camera.viewMatrix);
        const shown: Parameters<Bodies["draw"]>[0] = [];
        for (const other of this.others.values())
        {
            if (other.corpse) other.tip = Math.min(FALL, other.tip + dt * FALL_SPEED * (.3 + other.tip));
            else other.last = this.override.get(other.id) ?? sample(other.poses, at);
            const pose = other.last;
            const place = other.corpse ?? pose;
            other.rig.update(dt, {
                x: place.x, y: this.field.height(place.x, place.z), z: place.z, yaw: place.yaw,
                pitch: pose.pitch, draw: other.corpse ? 0 : pose.draw, left: pose.left, stage: pose.stage,
                wounds: pose.wounds | other.wounds, resting: pose.resting,
                dead: !!other.corpse, tip: other.tip, unarmed: this.unarmed,
            });
            shown.push({ rig: other.rig, look: { clothes: other.clothes, skin: other.skin } });
            if (this.hidden) other.label.hidden = true;
            else if (!other.corpse) this.placeLabel(other.label, place.x, this.field.height(place.x, place.z) + (pose.resting || (pose.wounds & 12) === 12 ? 1.45 : 1.75), place.z, camera, width, height);
        }
        this.bodies.draw(this.hidden ? [] : [...shown, ...extra]);
    }

    destroy() {
        this.bodies.destroy();
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
export function sample(poses: Pose[], time: number): Pose {
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
        left: b.left,
        wounds: b.wounds,
        resting: b.resting,
    };
}
