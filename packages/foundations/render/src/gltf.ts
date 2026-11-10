import { loadGLTF, type GLTF, type GLTFNode, type Mesh } from "@papit/game-mesh";

import { invert, mat4, multiply, type Mat4 } from "./math";
import { STRIDE, type MeshData } from "./mesh";

/** `@papit/game-mesh`'s glTF, kept for skins and animations later. */
export type { GLTF } from "@papit/game-mesh";

export type GLTFSetting = {
    /** 0 keeps the file's colour, 1 takes the instance's tint (clothes in the player's colour). */
    tint?: number;
    /** Only the nodes with these names (and what's under them). */
    nodes?: string[];
};

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
            vertices[o + 6] = c ? c[i * 4] : 1;
            vertices[o + 7] = c ? c[i * 4 + 1] : 1;
            vertices[o + 8] = c ? c[i * 4 + 2] : 1;
            vertices[o + 9] = tint;
            o += STRIDE;
        }
    }
    return { vertices, count };
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
