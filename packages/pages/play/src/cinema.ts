import { fly, heading, isBullet, launch, powerOf, STEP, type Shot, type Vec } from "@arrow-warfare/archery";
import type { Pose } from "@arrow-warfare/net";
import type { Renderer, Vec3 } from "@arrow-warfare/render";
import { Bodies, Rig, type Blow } from "@arrow-warfare/rig";
import { BODY, type Field } from "@arrow-warfare/world";
import type { Camera } from "@papit/game-engine";

import type { Arrows } from "./arrows";
import type { Blood } from "./blood";
import type { HitRecord, Replay } from "./replay";
import { footing } from "./footing";
import { SIT_EYE } from "./walker";

/**
 * The kill cam's timing, to tune it in one place. Seconds are real (on screen), ms are the round's.
 * 1. the shooter's own eyes, real time, up to just before the shot
 * 2. the release from a cinematic angle, slowing down
 * 3. riding above and behind the arrow or bullet (skipped for a short shot)
 * 4. the hit, slowest of all, and the body going down
 */
export const KILLCAM = {
    /** ms of the shooter's view before the shot (less if this phone has less of them). */
    lead: 5000,
    /** ms before the shot that the eyes cut to the release. */
    cut: 350,
    /** Seconds of the release, and ms of the round it shows after the shot (at most). */
    release: 2.6,
    releaseAfter: 120,
    /** Metres: a shot closer than this has no ride along, one camera from the release to the hit. */
    close: 8,
    /** Metres a second the ride along shows the flight at: a bullet far slower than an arrow. */
    arrowShown: 14,
    bulletShown: 7,
    /** Seconds the ride along lasts, at least and at most. */
    rideLeast: 1.6,
    rideMost: 6,
    /** The camera over the projectile: metres behind it and above it. */
    rideBehind: 1.3,
    rideAbove: .5,
    /** Seconds of the hit and the fall, and ms of the round after the hit it shows. */
    strike: 6,
    strikeAfter: 2200,
};

type Look = { clothes: Vec3; skin: Vec3 };
export type SoundName = "twang" | "whoosh" | "body" | "kill" | "grunt" | "gunshot" | "heartbeat";

/** What the kill cam needs from the round. */
export type FilmWorld = {
    renderer: Renderer;
    field: Field;
    camera: Camera;
    replay: Replay;
    arrows: Arrows;
    blood: Blood;
    lookOf(id: string): Look | null;
    /** Someone the replay has nothing on: where they're drawn now. */
    fallback(id: string): Pose | null;
    sound(name: SoundName, at: Vec | undefined, volume: number, rate: number): void;
    /** The shooter's bow or gun and hands in front of the camera, while the film looks through their eyes. Null hides them. */
    hands?: { show(id: string | null, pose: Pose | null, dt: number): void; shot(): void };
};

/** A stretch of the film: `real` seconds showing shared ms `from` to `to`, and where the camera is. */
type Shot_ = {
    name: "eyes" | "release" | "flyby" | "follow" | "strike";
    real: number;
    from: number;
    to: number;
    /** 0..1 of real time to 0..1 of replay time. */
    ease?: (u: number) => number;
    camera(time: number, u: number): { eye: Vec; look: Vec };
};

type Cue = { time: number; play(): void };

/** Points the camera from `eye` at `look`. */
export function aim(camera: Camera, eye: Vec, look: Vec, roll = 0) {
    const dx = look[0] - eye[0], dy = look[1] - eye[1], dz = look[2] - eye[2];
    const length = Math.hypot(dx, dy, dz) || 1;
    camera.position.set(eye);
    camera.rotation.set([Math.asin(Math.max(-1, Math.min(1, dy / length))), Math.atan2(-dx, -dz), roll]);
    camera.zoom = 1;
}

const add = (a: Vec, b: Vec, k = 1): Vec => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const mix = (a: Vec, b: Vec, t: number): Vec => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
/** Flat, at right angles to `d`. */
const side = (d: Vec): Vec => {
    const length = Math.hypot(d[0], d[2]) || 1;
    return [-d[2] / length, 0, d[0] / length];
};

/**
 * The kill cam: the shot that killed `victim`, played again from the replay in slow motion. The shooter
 * letting go from a cinematic angle, a flyby as the arrow passes, riding behind it as it closes in, and
 * the strike seen from the side as the body falls. Everyone is drawn as they were, on rigs of its own.
 */
export class Film {
    private bodies: Bodies;
    private rigs = new Map<string, Rig>();
    private ends = new Map<string, HitRecord & { blow: Blow | null }>();
    private shots: Shot_[] = [];
    private cues: Cue[] = [];
    private index = 0;
    private clock = 0;
    private time = 0;
    /** Replay ms per real ms this frame, for slowing the blood. */
    rate = 1;
    done = true;
    victim = "";
    killer = "";

    constructor(private world: FilmWorld) {
        this.bodies = new Bodies(world.renderer);
    }

    /** Keep the bodies drawn once it's over (a view that stays on the last frame). */
    hold = false;

    /**
     * Ready to play the death of `victim`. False when there's nothing to show. `watch` is no kill cam:
     * a bystander close to the victim, in real time, from a while before the shot to after the fall.
     */
    start(victim: string, killer: string, arrowId: string, mode: "film" | "watch" = "film"): boolean {
        const { replay } = this.world;
        const hit = replay.hits.get(arrowId);
        const shot = replay.shots.get(arrowId);
        if (!hit) return false;
        this.victim = victim;
        this.killer = killer;
        this.mode = mode;
        this.shots = [];
        this.cues = [];
        this.eyesOf = null;
        this.index = 0;
        this.clock = 0;
        this.rigs.clear();
        // when and where each body went down
        this.ends.clear();
        for (const other of replay.hits.values())
        {
            // the one up to this strike (with lives, someone can fall more than once)
            if (!other.lethal || (this.ends.has(other.victim) && other.time > hit.time)) continue;
            // what threw them: the arrow's way as it went in, and its power
            const by = replay.shots.get(other.arrow);
            const flown = by ? this.path(by, other.time) : [];
            const blow = flown.length ? { part: other.part, direction: flown[flown.length - 1].direction, power: powerOf(by!.speed) } : null;
            this.ends.set(other.victim, { ...other, blow });
        }

        const strike = hit.time;
        const path = shot ? this.path(shot, strike) : [];
        const at = hit.at;
        const direction: Vec = path.length ? path[path.length - 1].direction : [0, 0, -1];
        const across = side(direction);
        const shooter = shot && shot.by !== victim ? replay.at(shot.by, shot.time) ?? this.world.fallback(shot.by) : null;
        const ground = (p: Vec, above = .3): Vec => [p[0], Math.max(p[1], this.world.field.height(p[0], p[2]) + above), p[2]];
        const arrowAt = (time: number) => {
            if (!path.length) return { tip: at, direction };
            const i = Math.max(0, Math.min(path.length - 1, Math.round((time - path[0].time) / (path[1] ? path[1].time - path[0].time : 1))));
            return path[i];
        };
        let start = strike - 300;

        if (mode === "watch")
        {
            // standing off to the side of them, a little towards the shooter, seeing it as it happens
            const from = (shot ? shot.time : strike) - 1500;
            const eye = ground(add(add(add(at, across, 2.2), direction, -.4), [0, .1, 0]), .7);
            this.shots.push({
                name: "strike", real: (strike + 3500 - from) / 1000, from, to: strike + 3500,
                camera: () => {
                    const body = this.rigs.get(victim);
                    const lying: Vec = body?.doll ? [body.where.x, body.where.y, body.where.z] : add(at, [0, -.3, 0]);
                    return { eye, look: mix(at, lying, .6) };
                },
            });
            start = from;
            if (shot) this.cues.push({ time: shot.time, play: () => this.world.sound(isBullet(shot) ? "gunshot" : "twang", [shot.x, shot.y, shot.z], .6, 1) });
        }
        else if (shot && shooter && path.length > 1)
        {
            const by = shot.by;
            const flight = strike - shot.time;
            const yaw = shooter.yaw;
            const forward: Vec = [-Math.sin(yaw), 0, -Math.cos(yaw)], right: Vec = [Math.cos(yaw), 0, -Math.sin(yaw)];
            const hand = shooter.left ? -1 : 1;
            const body: Vec = [shooter.x, shooter.y, shooter.z];

            // 1. through their eyes, real time, as far back as this phone has them
            const since = Math.max(replay.since(by), shot.time - KILLCAM.lead);
            const cut = shot.time - KILLCAM.cut;
            if (cut - since > 400 && replay.at(by, since))
            {
                this.eyesOf = by;
                this.shots.push({
                    name: "eyes", real: (cut - since) / 1000, from: since, to: cut,
                    camera: time => {
                        const pose = replay.at(by, time) ?? shooter;
                        const low = pose.resting || (pose.wounds & 12) === 12;
                        const eye: Vec = [pose.x, pose.y + (low ? SIT_EYE : BODY.eye), pose.z];
                        const c = Math.cos(pose.pitch);
                        return { eye, look: [eye[0] - Math.sin(pose.yaw) * c * 10, eye[1] + Math.sin(pose.pitch) * 10, eye[2] - Math.cos(pose.yaw) * c * 10] };
                    },
                });
            }
            start = this.shots.length ? since : shot.time - 750;

            // 2. the release: in front, on the bow side, low, closing in a little, slowing down
            const look = add(add(body, [0, .95, 0]), forward, .35);
            const far = ground(add(add(add(body, forward, 1.9), right, -1.25 * hand), [0, .75, 0]));
            const reach = Math.hypot(at[0] - shot.x, at[1] - shot.y, at[2] - shot.z);
            const close = reach < KILLCAM.close;
            // never past the hit: a bullet (or a short arrow) is there within a few ms
            const leave = close ? strike - 60 : Math.max(shot.time + 5, Math.min(shot.time + KILLCAM.releaseAfter, strike - 30));
            const releaseFrom = this.shots.length ? cut : start;
            this.shots.push({ name: "release", real: KILLCAM.release * (close ? 1.3 : 1), from: releaseFrom, to: leave, ease: u => Math.sin(u * Math.PI / 2), camera: (_, u) => ({ eye: mix(far, look, u * .22), look: close ? mix(look, at, u * .6) : look }) });
            this.cues.push({ time: shot.time, play: () => {
                this.sound(isBullet(shot) ? "gunshot" : "twang", [shot.x, shot.y, shot.z], 1);
                this.world.hands?.shot();
            } });

            // 3. riding over it, looking down along its way to them; a bullet shown much slower than an arrow
            if (!close && strike - 60 - leave > 0)
            {
                const shown = isBullet(shot) ? KILLCAM.bulletShown : KILLCAM.arrowShown;
                const real = Math.max(KILLCAM.rideLeast, Math.min(KILLCAM.rideMost, reach / shown));
                this.shots.push({
                    name: "follow", real, from: leave, to: strike - 60,
                    camera: time => {
                        const now = arrowAt(time);
                        // closing in, the camera comes down behind it so the one it's going to fills the view
                        const left = Math.min(1, Math.hypot(at[0] - now.tip[0], at[2] - now.tip[2]) / 6);
                        const eye = add(add(now.tip, now.direction, -KILLCAM.rideBehind), [0, KILLCAM.rideAbove * (.4 + .6 * left), 0]);
                        return { eye, look: mix(add(now.tip, now.direction, 6), at, 1 - left) };
                    },
                });
                this.cues.push({ time: leave + (strike - leave) * .4, play: () => this.sound("whoosh", undefined, .9) });
            }
            void flight;
        }

        // the strike: from the side, the arrow going in and the body going down, slowest at the hit
        if (mode === "film") this.pushStrike(victim, at, start, strike, across, direction, ground);
        const strength = shot ? powerOf(shot.speed) : .6;
        this.cues.push({ time: strike, play: () => {
            this.sound("body", at, 1);
            this.sound("kill", undefined, .6 + .4 * strength);
            this.sound("grunt", at, .9, 1.05);
            // the heart, slow, as they go down
            if (mode === "film") for (const late of [0, 900]) setTimeout(() => !this.done && this.sound("heartbeat", undefined, .7, .8), late);
        } });
        return this.finishStart(strike, shot, strength);
    }

    private pushStrike(victim: string, at: Vec, start: number, strike: number, across: Vec, direction: Vec, ground: (p: Vec, above?: number) => Vec) {
        const eye = ground(add(add(add(at, across, 1.55), direction, -.45), [0, .22, 0]), .25);
        // on from where the last part ended (time never runs back, it would stand still), slowest at the hit
        // and never faster than real time at the end
        const last = this.shots[this.shots.length - 1];
        this.shots.push({
            name: "strike", real: KILLCAM.strike, from: Math.max(start, strike - 60, last?.to ?? -Infinity), to: strike + KILLCAM.strikeAfter, ease: u => .06 * u + .94 * u ** 2.6,
            camera: (_, u) => {
                // a slow turn around the hit
                const turn = u * .4, c = Math.cos(turn), s = Math.sin(turn);
                const ox = eye[0] - at[0], oz = eye[2] - at[2];
                // looking where the body is thrown, from where it was hit
                const body = this.rigs.get(victim);
                const lying: Vec = body?.doll ? [body.where.x, body.where.y, body.where.z] : at;
                const look = mix(at, lying, .8);
                return { eye: [look[0] + ox * c - oz * s, eye[1] + u * .25, look[2] + ox * s + oz * c], look };
            },
        });
    }

    /** The kill cam's sounds go low and long with the slow motion; `watch` (real time) keeps them as they are. */
    private sound(name: SoundName, at: Vec | undefined, volume: number, rate = 1) {
        const slow = this.mode === "film" ? .55 + .4 * Math.min(1, this.rate) : 1;
        this.world.sound(name, at, volume, rate * slow);
    }

    private mode: "film" | "watch" = "film";

    private finishStart(strike: number, shot: Shot | undefined, strength: number) {
        const { replay } = this.world;
        // a slow swell as the film starts
        if (this.mode === "film") this.cues.push({ time: this.shots[0].from, play: () => this.world.sound("whoosh", undefined, .5, .4) });
        // the drops of every hit in the film, as it happens
        for (const other of replay.hits.values())
        {
            if (other.time <= this.shots[0].from || other.time > strike + KILLCAM.strikeAfter) continue;
            this.cues.push({ time: other.time, play: () => this.spray(other, shot && other.arrow === shot.id ? strength : .5) });
        }
        this.cues.sort((a, b) => a.time - b.time);
        this.time = this.shots[0].from;
        this.done = false;
        return true;
    }

    get length() {
        return this.shots.reduce((sum, shot) => sum + shot.real, 0);
    }

    /** Which part plays now. */
    get part() {
        return this.shots[this.index]?.name ?? "";
    }

    /** Whose eyes the film looks through in its first part. */
    private eyesOf: string | null = null;

    skip() {
        this.done = true;
        this.world.hands?.show(null, null, 0);
        if (!this.hold) this.bodies.draw([]);
    }

    /** One frame of real `dt` seconds. */
    update(dt: number) {
        if (this.done) return;
        this.clock += dt;
        let shot = this.shots[this.index];
        while (shot && this.clock >= shot.real)
        {
            this.clock -= shot.real;
            shot = this.shots[++this.index];
        }
        if (!shot)
        {
            this.skip();
            return;
        }
        const u = this.clock / shot.real;
        const before = this.time;
        this.time = Math.max(before, shot.from + (shot.to - shot.from) * (shot.ease ? shot.ease(u) : u));
        const step = this.time - before;
        this.rate = dt > 0 ? step / 1000 / dt : 0;

        while (this.cues.length && this.cues[0].time <= this.time) this.cues.shift()!.play();
        this.pose(step / 1000);
        const { eye, look } = shot.camera(this.time, u);
        aim(this.world.camera, eye, look);
        // through the shooter's eyes: their bow or gun in front, their body not drawn
        const eyes = shot.name === "eyes" ? this.eyesOf : null;
        this.world.hands?.show(eyes, eyes ? this.world.replay.at(eyes, this.time) : null, dt);
        this.world.arrows.drawAt(this.time, this.world.replay.shots.values(), this.world.replay.hits, id => this.rigs.get(id) ?? null, eye);
    }

    /** Everyone holds this gun instead of a bow (see `Bodies.useGun`). */
    useGun(...args: Parameters<Bodies["useGun"]>) {
        this.bodies.useGun(...args);
    }

    destroy() {
        this.bodies.destroy();
    }

    /** Everyone on their own rig, as they were at the film's time. */
    private pose(dt: number) {
        const { replay } = this.world;
        const time = this.time;
        const ids = new Set([...replay.players, this.victim, this.killer]);
        const shown: Parameters<Bodies["draw"]>[0] = [];
        const inside = this.part === "eyes" ? this.eyesOf : null;
        for (const id of ids)
        {
            if (id === inside) continue;
            const look = this.world.lookOf(id);
            let pose = replay.at(id, time) ?? this.world.fallback(id);
            if (!pose || !look) continue;
            const end = this.ends.get(id);
            const dead = !!end && end.time <= time;
            let rig = this.rigs.get(id);
            const fresh = !rig;
            if (!rig)
            {
                rig = footing(this.world.field);
                this.rigs.set(id, rig);
            }
            // they're thrown from where they were hit
            if (dead) pose = { ...pose, x: end.place.x, y: end.place.y, z: end.place.z, yaw: end.place.yaw, draw: 0 };
            rig.update(Math.max(dt, 1e-4), {
                x: pose.x, y: pose.y, z: pose.z, yaw: pose.yaw, pitch: pose.pitch,
                draw: dead ? 0 : pose.draw, left: pose.left, stage: pose.stage, wounds: pose.wounds, resting: pose.resting,
                dead, blow: end?.blow ?? null,
            });
            // dead before the film: already lying where they fell
            if (fresh && dead && rig.doll)
            {
                rig.doll.runTo((time - end.time) / 1000);
                rig.update(1e-4, { x: pose.x, y: 0, z: pose.z, yaw: pose.yaw, pitch: 0, draw: 0, left: pose.left, stage: 0, wounds: pose.wounds, resting: pose.resting, dead });
            }
            shown.push({ rig, look });
        }
        this.bodies.draw(shown);
    }

    private spray(hit: HitRecord, strength: number) {
        const rig = this.rigs.get(hit.victim);
        const direction = rig ? rig.fromPart(hit.part, hit.direction, 0) : [0, 0, -1] as Vec;
        this.world.blood.spray(hit.at, direction, strength);
    }

    /** The killing arrow's flight, a point a step, from the bow to the hit. */
    private path(shot: Shot, until: number) {
        const arrow = launch(shot);
        const points: { time: number; tip: Vec; direction: Vec }[] = [{ time: shot.time, tip: [arrow.x, arrow.y, arrow.z], direction: heading(arrow) }];
        while (!arrow.rest && !arrow.gone && arrow.at < until)
        {
            fly(arrow, arrow.at + STEP * 1000, this.world.field);
            points.push({ time: arrow.at, tip: [arrow.x, arrow.y, arrow.z], direction: heading(arrow) });
            if (points.length > 2400) break;
        }
        return points;
    }
}
