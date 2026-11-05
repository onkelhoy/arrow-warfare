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
const SIT_EYE = .66;
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
    private hop = 0;
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
        this.y = field.height(this.x, this.z);
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
        const fast = WALK * draw.walk * this.limit;
        this.low += ((this.posture === "sit" ? 1 : 0) - this.low) * (1 - Math.exp(-dt * 5));
        const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
        const wantX = (-sin * my + cos * mx) * fast;
        const wantZ = (-cos * my - sin * mx) * fast;
        const grip = 1 - Math.exp(-dt * GRIP);
        this.vx += (wantX - this.vx) * grip;
        this.vz += (wantZ - this.vz) * grip;

        const fromX = this.x, fromZ = this.z;
        [this.x, this.z] = this.field.collide(this.x + this.vx * dt, this.z + this.vz * dt, BODY.radius);
        // what the obstacles let through is the real speed, so walking into a tree doesn't bob
        const moved = Math.hypot(this.x - fromX, this.z - fromZ);
        this.speed = dt > 0 ? moved / dt : 0;
        this.stride += moved * STEPS * Math.PI;
        this.hop += moved / HOP.length * Math.PI;
        this.y = this.field.height(this.x, this.z);
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
