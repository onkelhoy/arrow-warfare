import type { Camera } from "@papit/game-engine";
import { BODY, type Field, type Spawn } from "@arrow-warfare/world";

import type { Controls } from "./controls";

/** Metres per second, walking with the stick all the way. Slower while drawing comes with the bow. */
export const WALK = 4.6;
/** How quickly the walk speeds up and slows down, per second. */
const GRIP = 10;
const PITCH = 1.35;
/** Head bob in metres, and steps per metre. */
const BOB = .035;
const STEPS = .85;

/** Me: walking the field in first person, the camera at my eyes. */
export class Walker {
    x: number;
    z: number;
    y = 0;
    yaw: number;
    pitch = 0;
    /** Metres per second over the ground. */
    speed = 0;
    private vx = 0;
    private vz = 0;
    private stride = 0;

    constructor(private field: Field, spawn: Spawn) {
        this.x = spawn.x;
        this.z = spawn.z;
        this.yaw = spawn.yaw;
        this.y = field.height(this.x, this.z);
    }

    update(dt: number, controls: Controls, sensitivity: number) {
        const [turnX, turnY] = controls.look(sensitivity);
        this.yaw -= turnX;
        this.pitch = Math.max(-PITCH, Math.min(PITCH, this.pitch - turnY));

        // forward is -z at yaw 0, right is +x
        const [mx, my] = controls.move;
        const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
        const wantX = (-sin * my + cos * mx) * WALK;
        const wantZ = (-cos * my - sin * mx) * WALK;
        const grip = 1 - Math.exp(-dt * GRIP);
        this.vx += (wantX - this.vx) * grip;
        this.vz += (wantZ - this.vz) * grip;

        const fromX = this.x, fromZ = this.z;
        [this.x, this.z] = this.field.collide(this.x + this.vx * dt, this.z + this.vz * dt, BODY.radius);
        // what the obstacles let through is the real speed, so walking into a tree doesn't bob
        const moved = Math.hypot(this.x - fromX, this.z - fromZ);
        this.speed = dt > 0 ? moved / dt : 0;
        this.stride += moved * STEPS * Math.PI;
        this.y = this.field.height(this.x, this.z);
    }

    /** Puts the camera at my eyes. */
    place(camera: Camera) {
        const bob = Math.abs(Math.sin(this.stride)) * BOB * Math.min(1, this.speed / WALK);
        camera.position.set([this.x, this.y + BODY.eye + bob, this.z]);
        camera.rotation.set([this.pitch, this.yaw, 0]);
    }
}
