/**
 * The few 4x4 matrix steps the renderer needs every frame, on plain column major arrays so nothing is
 * allocated in the loop. The engine's camera gives the view and projection, this composes instances.
 */

export type Vec3 = [number, number, number];
export type Mat4 = Float32Array;

export const mat4 = () => identity(new Float32Array(16));

export function identity(out: Mat4) {
    out.fill(0);
    out[0] = out[5] = out[10] = out[15] = 1;
    return out;
}

/** `out = a * b`, `out` may be `a` or `b`. */
export function multiply(out: Mat4, a: ArrayLike<number>, b: ArrayLike<number>) {
    const r = TEMP;
    for (let col = 0; col < 4; col++)
    {
        for (let row = 0; row < 4; row++)
        {
            r[col * 4 + row] =
                a[row] * b[col * 4] +
                a[4 + row] * b[col * 4 + 1] +
                a[8 + row] * b[col * 4 + 2] +
                a[12 + row] * b[col * 4 + 3];
        }
    }
    out.set(r);
    return out;
}
const TEMP = new Float32Array(16);

/**
 * Position, then yaw (around y), pitch (around x) and roll (around z), then scale. Writes 16 numbers into
 * `out` at `offset`, so an instance buffer is filled in place.
 */
export function compose(out: Float32Array, offset: number, x: number, y: number, z: number, yaw = 0, pitch = 0, roll = 0, sx = 1, sy = sx, sz = sx) {
    const cy = Math.cos(yaw), syw = Math.sin(yaw);
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const cr = Math.cos(roll), sr = Math.sin(roll);

    // R = Ry * Rx * Rz
    const m00 = cy * cr + syw * sp * sr, m01 = sr * cp, m02 = -syw * cr + cy * sp * sr;
    const m10 = -cy * sr + syw * sp * cr, m11 = cr * cp, m12 = sr * syw + cy * sp * cr;
    const m20 = syw * cp, m21 = -sp, m22 = cy * cp;

    out[offset] = m00 * sx; out[offset + 1] = m01 * sx; out[offset + 2] = m02 * sx; out[offset + 3] = 0;
    out[offset + 4] = m10 * sy; out[offset + 5] = m11 * sy; out[offset + 6] = m12 * sy; out[offset + 7] = 0;
    out[offset + 8] = m20 * sz; out[offset + 9] = m21 * sz; out[offset + 10] = m22 * sz; out[offset + 11] = 0;
    out[offset + 12] = x; out[offset + 13] = y; out[offset + 14] = z; out[offset + 15] = 1;
    return out;
}

/** The general inverse, `false` when there is none. */
export function invert(out: Mat4, m: ArrayLike<number>) {
    const a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3];
    const a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7];
    const a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11];
    const a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15];

    const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10;
    const b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
    const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30;
    const b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;

    let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    if (!det) return false;
    det = 1 / det;

    out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
    out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
    out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
    out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
    out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
    out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
    out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
    out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
    out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
    out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
    out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
    out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
    out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
    out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
    out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
    out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
    return true;
}

/** A point through a matrix, in place. */
export function transformPoint(m: ArrayLike<number>, p: Vec3) {
    const [x, y, z] = p;
    p[0] = m[0] * x + m[4] * y + m[8] * z + m[12];
    p[1] = m[1] * x + m[5] * y + m[9] * z + m[13];
    p[2] = m[2] * x + m[6] * y + m[10] * z + m[14];
    return p;
}

export function normalize(v: Vec3) {
    const length = Math.hypot(v[0], v[1], v[2]) || 1;
    v[0] /= length; v[1] /= length; v[2] /= length;
    return v;
}

/** `#rrggbb` to 0..1 numbers. */
export function rgb(hex: string): Vec3 {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
}

export function mix(a: Vec3, b: Vec3, t: number): Vec3 {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
