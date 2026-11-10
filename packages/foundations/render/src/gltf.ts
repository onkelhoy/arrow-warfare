import { loadGLTF, rig, sample, type GLTF, type GLTFNode, type Mesh, type Rig } from "@papit/game-mesh";

import { invert, mat4, multiply, type Mat4 } from "./math";
import { STRIDE, type MeshData } from "./mesh";

/** `@papit/game-mesh`'s glTF, kept for skins and animations later. */
export type { GLTF } from "@papit/game-mesh";
export { loadGLTF } from "@papit/game-mesh";

export type GLTFSetting = {
    /** 0 keeps the file's colour, 1 takes the instance's tint (clothes in the player's colour). */
    tint?: number;
    /** Only the nodes with these names (and what's under them). */
    nodes?: string[];
    /** One normal per triangle, the low poly look (default). Off keeps the file's (or the loader's smooth) normals. */
    flat?: boolean;
};

/** glTF vertex colours are linear, ours (and `MeshBuilder`'s) are sRGB as written. */
const toSRGB = (value: number) => Math.pow(Math.max(0, Math.min(1, value)), 1 / 2.2);

/** A `.glb` or `.gltf` from a url as one mesh, see `fromGLTF`. */
export async function loadModel(url: string, setting?: GLTFSetting): Promise<MeshData> {
    return fromGLTF(await loadGLTF(url), setting);
}

/**
 * The default scene of a glTF as one mesh for `Renderer.batch`: every node's transform baked in,
 * indices unrolled, vertex colours (times the base colour) kept. Skins are drawn in their bind pose.
 */
export function fromGLTF(gltf: GLTF, setting: GLTFSetting = {}): MeshData {
    const parts: { mesh: Mesh; matrix: Mat4 }[] = [];
    const walk = (index: number, parent: Mat4, picked: boolean) => {
        const node = gltf.nodes[index];
        const matrix = multiply(mat4(), parent, local(node));
        const take = picked || !setting.nodes || setting.nodes.includes(node.name ?? "");
        if (take && node.mesh !== undefined)
            for (const mesh of gltf.meshes[node.mesh].primitives) parts.push({ mesh, matrix });
        for (const child of node.children) walk(child, matrix, take);
    };
    for (const root of gltf.roots) walk(root, mat4(), false);

    const count = parts.reduce((sum, { mesh }) => sum + (mesh.indices?.length ?? mesh.positions.length / 3), 0);
    const vertices = new Float32Array(count * STRIDE);
    const tint = setting.tint ?? 0;
    const flat = setting.flat ?? true;
    let o = 0;
    for (const { mesh, matrix: m } of parts)
    {
        const n = normalMatrix(m);
        const { positions: p, normals: nr, colors: c, indices } = mesh;
        const total = indices?.length ?? p.length / 3;
        for (let k = 0; k < total; k++)
        {
            const i = indices ? indices[k] : k;
            const x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2];
            vertices[o] = m[0] * x + m[4] * y + m[8] * z + m[12];
            vertices[o + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
            vertices[o + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
            const nx = nr[i * 3], ny = nr[i * 3 + 1], nz = nr[i * 3 + 2];
            const wx = n[0] * nx + n[4] * ny + n[8] * nz, wy = n[1] * nx + n[5] * ny + n[9] * nz, wz = n[2] * nx + n[6] * ny + n[10] * nz;
            const length = Math.hypot(wx, wy, wz) || 1;
            vertices[o + 3] = wx / length; vertices[o + 4] = wy / length; vertices[o + 5] = wz / length;
            vertices[o + 6] = c ? toSRGB(c[i * 4]) : 1;
            vertices[o + 7] = c ? toSRGB(c[i * 4 + 1]) : 1;
            vertices[o + 8] = c ? toSRGB(c[i * 4 + 2]) : 1;
            vertices[o + 9] = tint;
            o += STRIDE;
        }
    }
    if (flat) flatten(vertices, count);
    return { vertices, count };
}

/** One rigid piece of a skinned model: its triangles all follow the same joints by the same weights. */
export type RiggedPart = { mesh: MeshData; joints: number[]; weights: number[] };

/**
 * A skinned glTF with rigid pieces (a gun: frame, hammer, drum, trigger, magazine) cut into one mesh per
 * joint mix, so the renderer draws each piece with one matrix instead of skinning on the GPU. The pose comes
 * from `@papit/game-mesh`'s `rig` and `sample`, the pieces' matrices are the same blend Blender's skinning
 * makes (so a piece weighted half to its parent moves half way, as in the file).
 */
export class Rigged {
    readonly parts: RiggedPart[] = [];
    readonly rig: Rig;
    /** The armature node and what's above it, which `rig` leaves out. */
    private root = mat4();
    private scratch = mat4();

    constructor(readonly gltf: GLTF, setting: GLTFSetting = {}) {
        this.rig = rig(gltf, 0);
        const skin = gltf.skins[0];
        // the root joint's ancestors
        const parent = new Map<number, number>();
        gltf.nodes.forEach((node, index) => node.children.forEach(child => parent.set(child, index)));
        const chain: number[] = [];
        for (let at = parent.get(skin.joints[0]); at !== undefined; at = parent.get(at)) chain.unshift(at);
        for (const index of chain) multiply(this.root, this.root, local(gltf.nodes[index]));

        const node = gltf.nodes.find(node => node.skin === 0 && node.mesh !== undefined)!;
        const tint = setting.tint ?? 0;
        const groups = new Map<string, { joints: number[]; weights: number[]; triangles: number[] }>();
        for (const mesh of gltf.meshes[node.mesh!].primitives)
        {
            const { positions: p, colors: c, indices, joints = new Uint16Array(0), weights = new Float32Array(0) } = mesh;
            const total = indices?.length ?? p.length / 3;
            for (let k = 0; k < total; k += 3)
            {
                // a triangle goes with its first corner's mix
                const first = indices ? indices[k] : k;
                const mix: [number, number][] = [];
                for (let w = 0; w < 4; w++) if (weights[first * 4 + w] > 1e-3) mix.push([joints[first * 4 + w], weights[first * 4 + w]]);
                mix.sort((a, b) => a[0] - b[0]);
                const key = mix.map(([j, w]) => `${j}:${w.toFixed(2)}`).join(",");
                let group = groups.get(key);
                if (!group) groups.set(key, group = { joints: mix.map(m => m[0]), weights: mix.map(m => m[1]), triangles: [] });
                for (let v = 0; v < 3; v++)
                {
                    const i = indices ? indices[k + v] : k + v;
                    group.triangles.push(p[i * 3], p[i * 3 + 1], p[i * 3 + 2], c ? toSRGB(c[i * 4]) : 1, c ? toSRGB(c[i * 4 + 1]) : 1, c ? toSRGB(c[i * 4 + 2]) : 1);
                }
            }
        }
        for (const { joints, weights, triangles } of groups.values())
        {
            const count = triangles.length / 6;
            const vertices = new Float32Array(count * STRIDE);
            for (let v = 0; v < count; v++)
            {
                const o = v * STRIDE, t = v * 6;
                vertices[o] = triangles[t]; vertices[o + 1] = triangles[t + 1]; vertices[o + 2] = triangles[t + 2];
                vertices[o + 6] = triangles[t + 3]; vertices[o + 7] = triangles[t + 4]; vertices[o + 8] = triangles[t + 5];
                vertices[o + 9] = tint;
            }
            flatten(vertices, count);
            this.parts.push({ mesh: { vertices, count }, joints, weights });
        }
        this.pose(null, 0);
    }

    /** All the pieces as one mesh, posed as now (the model's space): for the gun others hold. */
    bake(): MeshData {
        const count = this.parts.reduce((sum, part) => sum + part.mesh.count, 0);
        const vertices = new Float32Array(count * STRIDE);
        const m = mat4();
        let o = 0;
        this.parts.forEach((part, index) => {
            this.matrix(m, index);
            const v = part.mesh.vertices;
            for (let k = 0; k < part.mesh.count; k++, o += STRIDE)
            {
                const i = k * STRIDE, x = v[i], y = v[i + 1], z = v[i + 2];
                vertices[o] = m[0] * x + m[4] * y + m[8] * z + m[12];
                vertices[o + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
                vertices[o + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
                for (let e = 6; e < STRIDE; e++) vertices[o + e] = v[i + e];
            }
        });
        flatten(vertices, count);
        return { vertices, count };
    }

    /** The animation's length in seconds, 0 if there's none by that name. */
    duration(name: string) {
        return this.gltf.animations.find(animation => animation.name === name)?.duration ?? 0;
    }

    /** Poses the pieces `time` seconds into the animation `name`, or the first frame of the first one with `null`. */
    pose(name: string | null, time: number) {
        const animation = name === null ? this.gltf.animations[0] : this.gltf.animations.find(animation => animation.name === name);
        if (animation) sample(animation, Math.max(0, Math.min(animation.duration, time)), this.rig, false);
        this.rig.armature.update();
        this.rig.update();
    }

    /** Piece `index`'s matrix in the model's space (the file's, armature node included) into `out`. */
    matrix(out: Mat4, index: number) {
        const { joints, weights } = this.parts[index];
        const m = this.rig.matrices, s = this.scratch;
        s.fill(0);
        for (let k = 0; k < joints.length; k++)
        {
            const o = joints[k] * 16, w = weights[k];
            for (let e = 0; e < 16; e++) s[e] += m[o + e] * w;
        }
        return multiply(out, this.root, s);
    }
}

/** A skinned `.glb` from a url cut into rigid pieces, see `Rigged`. */
export async function loadRigged(url: string, setting?: GLTFSetting) {
    return new Rigged(await loadGLTF(url), setting);
}

/** Every triangle's three normals set to its face's. */
function flatten(v: Float32Array, count: number) {
    for (let t = 0; t < count; t += 3)
    {
        const a = t * STRIDE, b = a + STRIDE, c = b + STRIDE;
        const ux = v[b] - v[a], uy = v[b + 1] - v[a + 1], uz = v[b + 2] - v[a + 2];
        const wx = v[c] - v[a], wy = v[c + 1] - v[a + 1], wz = v[c + 2] - v[a + 2];
        let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
        const length = Math.hypot(nx, ny, nz) || 1;
        nx /= length; ny /= length; nz /= length;
        for (const o of [a, b, c])
        {
            v[o + 3] = nx; v[o + 4] = ny; v[o + 5] = nz;
        }
    }
}

/** A node's own matrix: the file's, or translation, rotation (quaternion) and scale. */
function local(node: GLTFNode): Mat4 {
    if (node.matrix) return Float32Array.from(node.matrix);
    const [x, y, z, w] = node.rotation;
    const [sx, sy, sz] = node.scale;
    const out = mat4();
    out[0] = (1 - 2 * (y * y + z * z)) * sx; out[1] = 2 * (x * y + z * w) * sx; out[2] = 2 * (x * z - y * w) * sx;
    out[4] = 2 * (x * y - z * w) * sy; out[5] = (1 - 2 * (x * x + z * z)) * sy; out[6] = 2 * (y * z + x * w) * sy;
    out[8] = 2 * (x * z + y * w) * sz; out[9] = 2 * (y * z - x * w) * sz; out[10] = (1 - 2 * (x * x + y * y)) * sz;
    [out[12], out[13], out[14]] = node.translation;
    return out;
}

/** The inverse transpose, so normals stay right under uneven scale. */
function normalMatrix(m: Mat4): Mat4 {
    const inverse = mat4();
    if (!invert(inverse, m)) return m;
    const out = mat4();
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) out[c * 4 + r] = inverse[r * 4 + c];
    return out;
}
