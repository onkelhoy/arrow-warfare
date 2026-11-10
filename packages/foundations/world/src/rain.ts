import { GameObject, type Camera } from "@papit/game-engine";
import { MeshBuilder, type Batch, type Light, type Renderer, type Vec3 } from "@arrow-warfare/render";

import type { Field } from "./field";

export type RainSetting = {
    /** Drops falling around the camera at once (quality). */
    drops?: number;
    /** Little splashes where they land. */
    splashes?: boolean;
    /** Lightning now and then, it lights up the sky. */
    lightning?: boolean;
};

/** How far round the camera it rains, and how high above it the drops start. */
const REACH = 13;
/** None closer than this, a drop at the eye is a pole. */
const NEAREST = 1.2;
const ABOVE = 14;
/** Metres per second down, and the wind's push sideways. */
const FALL = 15;
const WIND: [number, number] = [1.6, .7];
/** A streak's length and width. */
const LENGTH = .55;
const WIDTH = .012;
/** Splashes only this close, further they're too small to see. */
const SPLASH_REACH = 11;
const SPARKS = 3;
const POOL = 700;
/** Seconds between lightning, at least and at most. */
const LIGHTNING: [number, number] = [14, 40];
/** A flash's brightness over its 0.6 s: a strike, a dip, a second flicker, fading. */
const FLASH = [0, 1, .35, .15, .85, .5, .3, .18, .1, .05, 0];

const DROP = [.72, .8, .9] as Vec3;
const WHITE: Vec3 = [1, 1, 1];

/**
 * Rain like a block game: thin streaks falling all round the camera, tiny splashes where they land on the
 * ground or a roof, and lightning that lights up the sky now and then (`onLightning` hears it, for the
 * thunder). Add it to the engine, it follows `camera`.
 */
export class Rain extends GameObject {
    /** A flash: how far off it was, in metres, so the thunder comes after. */
    onLightning: ((distance: number) => void) | null = null;
    private streaks: Batch;
    private sparks: Batch | null = null;
    /** Per drop: x, y, z, where it lands. */
    private drops: Float32Array;
    /** Per spark: x, y, z, vx, vy, vz, age, life. */
    private pool = new Float32Array(POOL * 8);
    private alive = 0;
    private matrix = new Float32Array(16);
    private nextFlash: number;
    private flashing = -1;
    private base: Light | null = null;
    private readonly lightning: boolean;
    private readonly count: number;

    constructor(private renderer: Renderer, private field: Field, private camera: Camera, setting: RainSetting = {}) {
        super();
        this.count = Math.max(0, Math.round(setting.drops ?? 900));
        this.lightning = setting.lightning ?? true;
        this.nextFlash = between(...LIGHTNING) * .5;
        const streak = new MeshBuilder().box(DROP, { at: [0, -.5, 0] }).build();
        this.streaks = renderer.batch(streak, { capacity: this.count, emissive: .45, dynamic: true });
        if (setting.splashes ?? true) this.sparks = renderer.batch(new MeshBuilder().box(DROP).build(), { capacity: POOL, emissive: .5, dynamic: true });

        // matrices are written straight in each frame, the tint only once
        for (let i = 0; i < this.count; i++) this.streaks.tint(i, WHITE);
        if (this.sparks) for (let i = 0; i < POOL; i++) this.sparks.tint(i, WHITE);
        if (this.sparks) this.sparks.count = 0;
        this.drops = new Float32Array(this.count * 4);
        const [cx, cy, cz] = this.eye();
        // spread through the whole column at the start, so it doesn't begin as one sheet
        for (let i = 0; i < this.count; i++) this.spawn(i, cx, cy, cz, Math.random());
        for (let i = 0; i < 16; i++) this.matrix[i] = 0;
        this.matrix[15] = 1;
    }

    override update(dt: number) {
        dt = Math.min(dt, .1);
        const [cx, cy, cz] = this.eye();
        const { drops, matrix } = this;
        const fall = FALL * dt, wx = WIND[0] * dt, wz = WIND[1] * dt;
        // the streak leans with the wind
        matrix[0] = WIDTH; matrix[10] = WIDTH;
        matrix[4] = -WIND[0] / FALL * LENGTH; matrix[5] = LENGTH; matrix[6] = -WIND[1] / FALL * LENGTH;

        for (let i = 0; i < this.count; i++)
        {
            const at = i * 4;
            let x = drops[at] + wx, y = drops[at + 1] - fall, z = drops[at + 2] + wz;
            const dx = x - cx, dz = z - cz;
            if (y <= drops[at + 3])
            {
                if (this.sparks && dx * dx + dz * dz < SPLASH_REACH * SPLASH_REACH && (y - cy) * (y - cy) < 36) this.splash(x, drops[at + 3], z);
                this.spawn(i, cx, cy, cz, 0);
                x = drops[at]; y = drops[at + 1]; z = drops[at + 2];
            }
            else if (dx * dx + dz * dz > REACH * REACH)
            {
                // I walked away from it: it starts again on my other side
                x = cx - dx * .95; z = cz - dz * .95;
                drops[at + 3] = this.field.roof(x + WIND[0] * (y - drops[at + 3]) / FALL, z);
            }
            drops[at] = x; drops[at + 1] = y; drops[at + 2] = z;
            matrix[12] = x; matrix[13] = y; matrix[14] = z;
            this.streaks.matrix(i, matrix);
        }
        this.streaks.count = this.count;
        this.updateSparks(dt);
        this.updateLightning(dt);
    }

    override destroy() {
        this.renderer.removeBatch(this.streaks);
        if (this.sparks) this.renderer.removeBatch(this.sparks);
        this.sparks = null;
        if (this.base) this.renderer.light = this.base;
        this.base = null;
    }

    /** Lightning right now (the view's button). */
    strike() {
        this.nextFlash = 0;
    }

    private eye(): [number, number, number] {
        const m = this.camera.worldMatrix;
        return [m[12], m[13], m[14]];
    }

    /** A new drop at the top of the column round the camera, `height` 0..1 down it for the first fill. */
    private spawn(i: number, cx: number, cy: number, cz: number, height: number) {
        const angle = Math.random() * Math.PI * 2, r = Math.sqrt(NEAREST * NEAREST + Math.random() * (REACH * REACH - NEAREST * NEAREST));
        const x = cx + Math.cos(angle) * r, z = cz + Math.sin(angle) * r;
        const y = cy + ABOVE * (1 - height) - Math.random() * 3;
        // where it lands, after the wind has pushed it on
        const seconds = Math.max(0, y - cy + 2) / FALL;
        const at = i * 4;
        this.drops[at] = x; this.drops[at + 1] = y; this.drops[at + 2] = z;
        this.drops[at + 3] = this.field.roof(x + WIND[0] * seconds, z + WIND[1] * seconds);
    }

    private splash(x: number, y: number, z: number) {
        for (let k = 0; k < SPARKS && this.alive < POOL; k++)
        {
            const at = this.alive++ * 8, angle = Math.random() * Math.PI * 2, out = between(.5, 1.2);
            const p = this.pool;
            p[at] = x; p[at + 1] = y + .02; p[at + 2] = z;
            p[at + 3] = Math.cos(angle) * out; p[at + 4] = between(1.1, 2); p[at + 5] = Math.sin(angle) * out;
            p[at + 6] = 0; p[at + 7] = between(.18, .32);
        }
    }

    private updateSparks(dt: number) {
        const sparks = this.sparks;
        if (!sparks) return;
        const p = this.pool;
        let i = 0;
        while (i < this.alive)
        {
            const at = i * 8;
            p[at + 6] += dt;
            if (p[at + 6] >= p[at + 7])
            {
                // the last one takes its place
                const last = --this.alive * 8;
                for (let k = 0; k < 8; k++) p[at + k] = p[last + k];
                continue;
            }
            p[at + 4] -= 9.8 * dt;
            p[at] += p[at + 3] * dt; p[at + 1] += p[at + 4] * dt; p[at + 2] += p[at + 5] * dt;
            const size = .028 * (1 - p[at + 6] / p[at + 7] * .6);
            sparks.place(i, p[at], p[at + 1], p[at + 2], 0, 0, 0, size);
            i++;
        }
        sparks.count = this.alive;
    }

    private updateLightning(dt: number) {
        if (!this.lightning) return;
        if (this.flashing < 0)
        {
            this.nextFlash -= dt;
            if (this.nextFlash > 0) return;
            this.nextFlash = between(...LIGHTNING);
            this.flashing = 0;
            this.base = structuredClone(this.renderer.light);
            this.onLightning?.(between(300, 3000));
        }
        const base = this.base!;
        this.flashing += dt;
        const at = this.flashing / .6 * (FLASH.length - 1);
        if (at >= FLASH.length - 1)
        {
            this.renderer.light = base;
            this.base = null;
            this.flashing = -1;
            return;
        }
        const k = FLASH[Math.floor(at)] + (FLASH[Math.floor(at) + 1] - FLASH[Math.floor(at)]) * (at % 1);
        const light = this.renderer.light;
        const lift = (from: Vec3, to: Vec3, amount: number) => { for (let c = 0; c < 3; c++) to[c] = from[c] + (FLASH_COLOUR[c] - from[c]) * amount; };
        lift(base.zenith, light.zenith, k * .55);
        lift(base.horizon, light.horizon, k * .65);
        lift(base.fogColour, light.fogColour, k * .5);
        lift(base.sky, light.sky, k * .5);
        lift(base.sunColour, light.sunColour, k * .25);
    }
}

const FLASH_COLOUR: Vec3 = [.82, .86, 1];

function between(a: number, b: number) {
    return a + Math.random() * (b - a);
}
