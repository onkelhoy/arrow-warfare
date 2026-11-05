import { GameObject, type Camera, type Layer2D, type Layer3D } from "@papit/game-engine";

import { compose, invert, mat4, multiply, normalize, type Vec3 } from "./math";
import { STRIDE, type MeshData } from "./mesh";
import { SKY_FRAGMENT, SKY_VERTEX, TOON_FRAGMENT, TOON_VERTEX } from "./shaders";

/** Floats per instance: a matrix and a tint (rgb, then a brightness). */
const INSTANCE = 20;

/** The light, sky and air, all colours 0..1. `Atmosphere` in `world` sets it from the time of day. */
export type Light = {
    /** Towards the sun, normalized by the renderer. */
    sunDirection: Vec3;
    sunColour: Vec3;
    /** Hemisphere light from above and from below. */
    sky: Vec3;
    ground: Vec3;
    zenith: Vec3;
    horizon: Vec3;
    fogColour: Vec3;
    /** 1 / the distance where fog is about two thirds. */
    fogDensity: number;
    /** The sun (or the moon) drawn flat in the sky towards `sunDirection`, and its ring halo. */
    disc: Vec3;
    ring: Vec3;
    /** The disc's angular radius in radians, the ring is a third wider. */
    discSize: number;
    /** 1 draws the disc as the moon, with craters. */
    moon: number;
    /** 0..1. */
    stars: number;
};

export const NOON: Light = {
    sunDirection: [.4, .8, .3],
    sunColour: [.75, .7, .6],
    sky: [.55, .62, .7],
    ground: [.32, .36, .22],
    zenith: [.35, .6, .9],
    horizon: [.75, .87, .95],
    fogColour: [.72, .84, .9],
    fogDensity: 1 / 90,
    disc: [1, .97, .8],
    ring: [.85, .94, .85],
    discSize: .05,
    moon: 0,
    stars: 0,
};

export type BatchSetting = {
    /** Instances it can hold, it grows when more are added. */
    capacity?: number;
    /** How far the top of the model sways in the wind, 0 is still. Sway draws both sides. */
    sway?: number;
    /** 1 is unlit, for things that glow. */
    emissive?: number;
    /** Draw the back of each triangle too. */
    twoSided?: boolean;
    /** Changed often (players), uploaded with a streaming hint. */
    dynamic?: boolean;
    /** Drawn last, over everything: what's in my own hands, so it never goes into a tree. */
    front?: boolean;
};

/** One mesh drawn many times in one call. Set instances by index, they're uploaded once before drawing. */
export class Batch {
    count = 0;
    visible = true;
    data: Float32Array;
    readonly sway: number;
    readonly emissive: number;
    readonly twoSided: boolean;
    readonly front: boolean;
    private dirty = true;
    private uploaded = 0;
    readonly buffer: WebGLBuffer;
    readonly vao: WebGLVertexArrayObject;

    constructor(private gl: WebGL2RenderingContext, readonly mesh: Mesh, private setting: BatchSetting = {}) {
        this.data = new Float32Array(Math.max(1, setting.capacity ?? 16) * INSTANCE);
        this.sway = setting.sway ?? 0;
        this.emissive = setting.emissive ?? 0;
        this.twoSided = setting.twoSided ?? this.sway > 0;
        this.front = setting.front ?? false;
        this.buffer = gl.createBuffer()!;
        this.vao = gl.createVertexArray()!;

        gl.bindVertexArray(this.vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, mesh.buffer);
        const bytes = STRIDE * 4;
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, bytes, 0);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 3, gl.FLOAT, false, bytes, 12);
        gl.enableVertexAttribArray(2);
        gl.vertexAttribPointer(2, 4, gl.FLOAT, false, bytes, 24);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
        for (let i = 0; i < 5; i++)
        {
            gl.enableVertexAttribArray(3 + i);
            gl.vertexAttribPointer(3 + i, 4, gl.FLOAT, false, INSTANCE * 4, i * 16);
            gl.vertexAttribDivisor(3 + i, 1);
        }
        gl.bindVertexArray(null);
    }

    /** Adds an instance, returns its index. */
    add(x: number, y: number, z: number, yaw = 0, scale = 1, tint: Vec3 = WHITE, brightness = 1) {
        const index = this.count++;
        this.grow(this.count);
        this.place(index, x, y, z, yaw, 0, 0, scale, scale, scale);
        this.tint(index, tint, brightness);
        return index;
    }

    /** Moves an instance, `scale` is uniform unless `sy`, `sz` are given. */
    place(index: number, x: number, y: number, z: number, yaw = 0, pitch = 0, roll = 0, sx = 1, sy = sx, sz = sx) {
        this.grow(index + 1);
        compose(this.data, index * INSTANCE, x, y, z, yaw, pitch, roll, sx, sy, sz);
        this.dirty = true;
    }

    /** An instance's matrix straight in. */
    matrix(index: number, matrix: ArrayLike<number>) {
        this.grow(index + 1);
        this.data.set(matrix, index * INSTANCE);
        this.dirty = true;
    }

    tint(index: number, colour: Vec3, brightness = 1) {
        this.grow(index + 1);
        const at = index * INSTANCE + 16;
        this.data[at] = colour[0]; this.data[at + 1] = colour[1]; this.data[at + 2] = colour[2]; this.data[at + 3] = brightness;
        this.dirty = true;
    }

    clear() {
        this.count = 0;
        this.dirty = true;
    }

    /** Uploads what changed, returns whether there's anything to draw. */
    upload() {
        if (!this.visible || !this.count) return false;
        if (!this.dirty) return true;
        const { gl } = this;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
        const usage = this.setting.dynamic ? gl.STREAM_DRAW : gl.STATIC_DRAW;
        if (this.uploaded < this.data.length)
        {
            gl.bufferData(gl.ARRAY_BUFFER, this.data, usage);
            this.uploaded = this.data.length;
        }
        else gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.data, 0, this.count * INSTANCE);
        this.dirty = false;
        return true;
    }

    destroy() {
        this.gl.deleteBuffer(this.buffer);
        this.gl.deleteVertexArray(this.vao);
    }

    private grow(count: number) {
        if (count * INSTANCE <= this.data.length) return;
        const bigger = new Float32Array(Math.max(count, this.data.length / INSTANCE * 2) * INSTANCE);
        bigger.set(this.data);
        this.data = bigger;
    }
}

const WHITE: Vec3 = [1, 1, 1];

/** Triangles on the GPU, shared by the batches that draw it. */
export class Mesh {
    readonly buffer: WebGLBuffer;
    readonly count: number;

    constructor(private gl: WebGL2RenderingContext, data: MeshData) {
        this.buffer = gl.createBuffer()!;
        this.count = data.count;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
        gl.bufferData(gl.ARRAY_BUFFER, data.vertices, gl.STATIC_DRAW);
    }

    destroy() {
        this.gl.deleteBuffer(this.buffer);
    }
}

type Uniforms = Record<string, WebGLUniformLocation | null>;

/**
 * Draws the sky, then every batch, through the layer's camera. Add it to the engine as a game object
 * (`engine.add(renderer)`) on a `webgl2` layer.
 */
export class Renderer extends GameObject {
    readonly gl: WebGL2RenderingContext;
    light: Light = structuredClone(NOON);
    /** Seconds, drives the sway. */
    time = 0;
    /** Drawn after the sky, in order. */
    readonly batches: Batch[] = [];
    /** Triangles drawn last frame, for the stats. */
    drawn = 0;

    private toon: WebGLProgram;
    private sky: WebGLProgram;
    private toonUniforms: Uniforms;
    private skyUniforms: Uniforms;
    private skyVao: WebGLVertexArrayObject;
    private viewProjection = mat4();
    private inverse = mat4();

    constructor(readonly surface: Layer3D) {
        super();
        this.gl = surface.gl;
        const gl = this.gl;
        this.toon = program(gl, TOON_VERTEX, TOON_FRAGMENT);
        this.sky = program(gl, SKY_VERTEX, SKY_FRAGMENT);
        this.toonUniforms = uniforms(gl, this.toon, ["uViewProjection", "uTime", "uSway", "uCamera", "uSunDirection", "uSunColour", "uSky", "uGround", "uFogColour", "uFogDensity", "uEmissive"]);
        this.skyUniforms = uniforms(gl, this.sky, ["uInverseViewProjection", "uZenith", "uHorizon", "uFogColour", "uSunDirection", "uDisc", "uRing", "uDiscSize", "uMoon", "uStars"]);
        this.skyVao = gl.createVertexArray()!;
        this.layer = surface.name;
    }

    mesh(data: MeshData) {
        return new Mesh(this.gl, data);
    }

    /** A batch of `mesh`, drawn from now on. */
    batch(mesh: Mesh | MeshData, setting?: BatchSetting) {
        const batch = new Batch(this.gl, mesh instanceof Mesh ? mesh : this.mesh(mesh), setting);
        this.batches.push(batch);
        return batch;
    }

    removeBatch(batch: Batch) {
        const index = this.batches.indexOf(batch);
        if (index >= 0) this.batches.splice(index, 1);
        batch.destroy();
    }

    override update(dt: number) {
        this.time += dt;
    }

    override render(layer: Layer2D | Layer3D) {
        const camera = layer.camera;
        if (!camera) return;
        this.frame(camera);
    }

    /** One frame through `camera`. */
    frame(camera: Camera) {
        const { gl, light } = this;
        multiply(this.viewProjection, camera.projectionMatrix, camera.viewMatrix);
        const eye = camera.worldPosition;
        const sun = normalize([...light.sunDirection] as Vec3);

        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);

        // sky, at the far plane
        gl.useProgram(this.sky);
        invert(this.inverse, this.viewProjection);
        const s = this.skyUniforms;
        gl.uniformMatrix4fv(s.uInverseViewProjection, false, this.inverse);
        gl.uniform3fv(s.uZenith, light.zenith);
        gl.uniform3fv(s.uHorizon, light.horizon);
        gl.uniform3fv(s.uFogColour, light.fogColour);
        gl.uniform3fv(s.uSunDirection, sun);
        gl.uniform3fv(s.uDisc, light.disc);
        gl.uniform3fv(s.uRing, light.ring);
        gl.uniform1f(s.uDiscSize, light.discSize);
        gl.uniform1f(s.uMoon, light.moon);
        gl.uniform1f(s.uStars, light.stars);
        gl.depthMask(false);
        gl.bindVertexArray(this.skyVao);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.depthMask(true);

        // everything else
        gl.useProgram(this.toon);
        const u = this.toonUniforms;
        gl.uniformMatrix4fv(u.uViewProjection, false, this.viewProjection);
        gl.uniform1f(u.uTime, this.time);
        gl.uniform3f(u.uCamera, eye.x, eye.y, eye.z);
        gl.uniform3fv(u.uSunDirection, sun);
        gl.uniform3fv(u.uSunColour, light.sunColour);
        gl.uniform3fv(u.uSky, light.sky);
        gl.uniform3fv(u.uGround, light.ground);
        gl.uniform3fv(u.uFogColour, light.fogColour);
        gl.uniform1f(u.uFogDensity, light.fogDensity);

        let drawn = 0;
        let cleared = false;
        const ordered = this.batches.some(batch => batch.front) ? [...this.batches.filter(batch => !batch.front), ...this.batches.filter(batch => batch.front)] : this.batches;
        for (const batch of ordered)
        {
            if (!batch.upload()) continue;
            if (batch.front && !cleared)
            {
                cleared = true;
                gl.clear(gl.DEPTH_BUFFER_BIT);
            }
            if (batch.twoSided) gl.disable(gl.CULL_FACE);
            else gl.enable(gl.CULL_FACE);
            gl.uniform1f(u.uSway, batch.sway);
            gl.uniform1f(u.uEmissive, batch.emissive);
            gl.bindVertexArray(batch.vao);
            gl.drawArraysInstanced(gl.TRIANGLES, 0, batch.mesh.count, batch.count);
            drawn += batch.mesh.count / 3 * batch.count;
        }
        gl.bindVertexArray(null);
        this.drawn = drawn;
    }
}

function program(gl: WebGL2RenderingContext, vertex: string, fragment: string) {
    const compiled = gl.createProgram()!;
    for (const [type, source] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]] as const)
    {
        const shader = gl.createShader(type)!;
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error("render: shader failed: " + gl.getShaderInfoLog(shader));
        gl.attachShader(compiled, shader);
    }
    gl.linkProgram(compiled);
    if (!gl.getProgramParameter(compiled, gl.LINK_STATUS)) throw new Error("render: program failed: " + gl.getProgramInfoLog(compiled));
    return compiled;
}

function uniforms(gl: WebGL2RenderingContext, compiled: WebGLProgram, names: string[]): Uniforms {
    return Object.fromEntries(names.map(name => [name, gl.getUniformLocation(compiled, name)]));
}
