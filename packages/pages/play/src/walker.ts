import type { Camera } from "@papit/game-engine";
import type { Draw } from "@arrow-warfare/archery";
import { BODY, type Field, type Spawn } from "@arrow-warfare/world";

import type { Controls } from "./controls";

/** Metres per second, walking with the stick all the way. The bow slows it down. */
export const WALK = 4.6;
/** How quickly the walk speeds up and slows down, per second. */
const GRIP = 10;
const PITCH = 1.35;
/** Head bob in metres, and steps per metre. */
const BOB = .035;
const STEPS = .85;
/** Lying on the ground, dead. */
const DEAD_EYE = .35;
/** Sitting, rested or with both legs hurt. */
export const SIT_EYE = .66;
/** Metres per second up or down a ladder, and falling. */
const CLIMB = 2.4;
const GRAVITY = 18;
/** Metres per hop, and how high. */
const HOP = { length: .55, height: .12 };

/** Me: walking the field in first person, the camera at my eyes. */
export class Walker {
    x: number;
    z: number;
    y = 0;
    yaw: number;
    pitch = 0;
    /** Metres per second over the ground. */
    speed = 0;
    /** Metres walked, times π: the step rhythm. */
    stride = 0;
    alive = true;
    /** What my wounds leave me: standing, hopping on one leg, or sitting. */
    posture: "stand" | "hop" | "sit" = "stand";
    /** Walking speed my wounds allow, 1 is full. */
    limit = 1;
    private low = 0;
    hop = 0;
    /** On a ladder now. */
    climbing = false;
    private vy = 0;
    private vx = 0;
    private vz = 0;
    /** Look the thumb or mouse asked for that the view hasn't followed yet (heavy while drawn). */
    private pendingYaw = 0;
    private pendingPitch = 0;
    private shakeSize = 0;
    private shakeTime = 0;
    private shakeLength = 1;
    private clock = 0;
    private fallen = 0;
    /** A punch: one kick of the view that springs back, seconds since and how big. */
    private punchTime = 9;
    private punchSize = 0;
    private punchSide = 0;

    constructor(private field: Field, spawn: Spawn) {
        this.x = spawn.x;
        this.z = spawn.z;
        this.yaw = spawn.yaw;
        this.y = field.floor(this.x, this.z);
    }

    /** Standing again at `spawn` (a respawn, a bot taken over). */
    respawn(spawn: Spawn) {
        this.x = spawn.x;
        this.z = spawn.z;
        this.yaw = spawn.yaw;
        this.pitch = 0;
        this.y = this.field.floor(this.x, this.z);
        this.vx = this.vy = this.vz = this.speed = 0;
        this.pendingYaw = this.pendingPitch = 0;
        this.fallen = 0;
        this.climbing = false;
        this.alive = true;
    }

    update(dt: number, controls: Controls, sensitivity: number, draw: Draw) {
        this.clock += dt;
        const [turnX, turnY] = controls.look(sensitivity * draw.look);
        this.pendingYaw += turnX;
        this.pendingPitch += turnY;
        const follow = 1 - Math.exp(-dt * draw.follow);
        const yaw = this.pendingYaw * follow, pitch = this.pendingPitch * follow;
        this.pendingYaw -= yaw;
        this.pendingPitch -= pitch;
        this.yaw -= yaw;
        this.pitch = Math.max(-PITCH, Math.min(PITCH, this.pitch - pitch));
        this.shakeTime = Math.max(0, this.shakeTime - dt);
        this.punchTime += dt;
        if (!this.alive) this.fallen = Math.min(1, this.fallen + dt * 2.5);

        // forward is -z at yaw 0, right is +x
        const [mx, my] = this.alive ? controls.move : [0, 0];
        const fast = WALK * draw.walk * this.limit * this.field.wade(this.x, this.z);
        this.low += ((this.posture === "sit" ? 1 : 0) - this.low) * (1 - Math.exp(-dt * 5));
        const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
        const wantX = (-sin * my + cos * mx) * fast;
        const wantZ = (-cos * my - sin * mx) * fast;
        const grip = 1 - Math.exp(-dt * GRIP);
        this.vx += (wantX - this.vx) * grip;
        this.vz += (wantZ - this.vz) * grip;

        const fromX = this.x, fromZ = this.z;
        // in steps of at most 15 cm, so a slow frame doesn't go through a thin rail
        const steps = Math.max(1, Math.ceil(Math.hypot(this.vx, this.vz) * dt / .15));
        for (let i = 0; i < steps; i++) [this.x, this.z] = this.field.collide(this.x + this.vx * dt / steps, this.z + this.vz * dt / steps, BODY.radius, this.y);
        this.upDown(dt, wantX, wantZ, fromX, fromZ);
        // what the obstacles let through is the real speed, so walking into a tree doesn't bob
        const moved = Math.hypot(this.x - fromX, this.z - fromZ);
        this.speed = dt > 0 ? moved / dt : 0;
        this.stride += moved * STEPS * Math.PI;
        this.hop += moved / HOP.length * Math.PI;
    }

    /**
     * Height: on the ground or a floor, falling off an edge, or on a ladder. On a ladder, pushing towards the
     * tower climbs, away from it climbs down, and nobody steps off it sideways halfway up.
     */
    private upDown(dt: number, wantX: number, wantZ: number, fromX: number, fromZ: number) {
        const floor = this.field.floor(this.x, this.z, this.y);
        const ladder = this.alive && this.posture !== "sit" ? this.field.ladderAt(this.x, this.z) : null;
        this.climbing = false;
        if (ladder)
        {
            // how much the stick points at the tower: -1 away, 1 straight at it, sideways does nothing
            const want = Math.hypot(wantX, wantZ), away = Math.hypot(ladder.tx - this.x, ladder.tz - this.z) || 1;
            const toward = want > .5 ? (wantX * (ladder.tx - this.x) + wantZ * (ladder.tz - this.z)) / (want * away) : 0;
            if (Math.abs(toward) > .35) this.y += Math.sign(toward) * CLIMB * dt;
            this.y = Math.max(floor, Math.min(ladder.top, this.y));
            this.vy = 0;
            this.climbing = this.y > floor + .05 && this.y < ladder.top - .05;
            // halfway up, the feet stay on the rungs
            if (this.climbing)
            {
                [this.x, this.z] = [fromX, fromZ];
                this.vx = this.vz = 0;
            }
            return;
        }
        if (this.y > floor + .02)
        {
            this.vy -= GRAVITY * dt;
            this.y = Math.max(floor, this.y + this.vy * dt);
        }
        else
        {
            this.y = floor;
            this.vy = 0;
        }
    }

    /** A jolt of the view, `size` in radians, for `length` seconds. */
    shake(size: number, length: number) {
        // a bigger one still going isn't cut short by a small one
        if (this.shakeSize * (this.shakeTime / this.shakeLength) > size) return;
        this.shakeSize = size;
        this.shakeTime = this.shakeLength = length;
    }

    /**
     * One kick of the view that springs back and settles, `size` in radians: a hit lands. Feels like a
     * thump rather than a rattle. `zoom` pushes in a touch with it.
     */
    punch(size: number, zoom = 0) {
        this.punchTime = 0;
        this.punchSize = size;
        this.punchSide = (Math.random() - .5) * .6;
        this.punchZoom = zoom;
    }

    private punchZoom = 0;

    /**
     * A gun's recoil: the view jumps up by `kick` and springs back (positive pitch looks up), `climb` of it stays
     * where it went, to be pulled back down, and it goes up to `side` to either side.
     */
    recoil(kick: number, climb: number, side: number) {
        this.punch(kick, .01);
        this.punchSide = (Math.random() - .5) * 2 * side / Math.max(1e-4, kick);
        this.pitch = Math.max(-PITCH, Math.min(PITCH, this.pitch + climb));
        this.yaw += (Math.random() - .5) * side;
    }

    /** Puts the camera at my eyes, with the bow's sway and any shake on top. */
    place(camera: Camera, draw: Draw) {
        const bob = this.posture === "hop"
            ? Math.abs(Math.sin(this.hop)) * HOP.height * Math.min(1, this.speed / 1.2)
            : Math.abs(Math.sin(this.stride)) * BOB * Math.min(1, this.speed / WALK) * (1 - this.low);
        const [swayYaw, swayPitch] = draw.sway;
        const left = this.shakeTime / this.shakeLength;
        const size = this.shakeSize * left * left;
        const t = this.clock * 55;
        const shakeYaw = (Math.sin(t) + Math.sin(t * 1.7 + 1) * .5) * size;
        const shakePitch = (Math.cos(t * 1.3) + Math.sin(t * 2.3 + 2) * .5) * size;
        // a damped spring: up fast, back a little past, settled in about a third of a second
        const p = this.punchTime;
        const RISE = .05;
        const spring = p < RISE ? Math.sin(p / RISE * Math.PI / 2) : p < .7 ? Math.cos((p - RISE) * 16) * Math.exp(-(p - RISE) * 10) : 0;
        const punch = this.punchSize * spring;
        const standing = BODY.eye + (SIT_EYE - BODY.eye) * this.low;
        const eye = standing + (DEAD_EYE - standing) * this.fallen;
        camera.position.set([this.x, this.y + eye + bob, this.z]);
        camera.rotation.set([this.pitch + swayPitch + shakePitch + punch, this.yaw + swayYaw + shakeYaw + punch * this.punchSide, this.fallen * .35 + punch * this.punchSide * .5]);
        // a little zoom while drawn, as if looking down the arrow
        camera.zoom = 1 + .12 * (draw.phase === "drawing" ? draw.amount : 0) + this.punchZoom * Math.max(0, spring);
    }

    /** Where my feet are, and which way I face: for hit tests. */
    get body() {
        return { x: this.x, y: this.y, z: this.z, yaw: this.yaw };
    }
}
