// The crickets bed from a recording: band-limited to the cricket (~2.4 kHz and its harmonics), the noise
// floor between chirps gated out, trimmed and crossfaded to loop, mono 24 kHz.
// Run (macOS, uses afconvert): node bin/crickets.mjs <recording.mp3|wav>
// Writes packages/foundations/sound/asset/sfx/crickets-1.wav (listed by bin/sfx.mjs, not rendered).
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const input = process.argv[2];
if (!input) throw new Error("usage: node bin/crickets.mjs <recording>");
const target = join(import.meta.dirname, "../packages/foundations/sound/asset/sfx/crickets-1.wav");

function readWav(path) {
    const b = readFileSync(path);
    let p = 12, fmt, data;
    while (p < b.length) { const id = b.toString("ascii", p, p + 4), len = b.readUInt32LE(p + 4); if (id === "fmt ") fmt = p + 8; if (id === "data") { data = [p + 8, len]; break; } p += 8 + len; }
    const ch = b.readUInt16LE(fmt + 2), rate = b.readUInt32LE(fmt + 4), n = data[1] / 2 / ch;
    const chans = Array.from({ length: ch }, () => new Float32Array(n));
    for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) chans[c][i] = b.readInt16LE(data[0] + (i * ch + c) * 2) / 32768;
    return { rate, chans };
}
function writeWav(path, data, rate) {
    const buffer = Buffer.alloc(44 + data.length * 2);
    buffer.write("RIFF", 0); buffer.writeUInt32LE(36 + data.length * 2, 4); buffer.write("WAVEfmt ", 8);
    buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
    buffer.writeUInt32LE(rate, 24); buffer.writeUInt32LE(rate * 2, 28); buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34);
    buffer.write("data", 36); buffer.writeUInt32LE(data.length * 2, 40);
    data.forEach((x, i) => buffer.writeInt16LE(Math.round(Math.max(-1, Math.min(1, x)) * 32767), 44 + i * 2));
    writeFileSync(path, buffer);
}
function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
    for (let len = 2; len <= n; len <<= 1) {
        const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a);
        for (let i = 0; i < n; i += len) { let cr = 1, ci = 0;
            for (let j = 0; j < len / 2; j++) { const k = i + j, l = k + len / 2, tr = re[l] * cr - im[l] * ci, ti = re[l] * ci + im[l] * cr;
                re[l] = re[k] - tr; im[l] = im[k] - ti; re[k] += tr; im[k] += ti; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } }
    }
}

const dir = mkdtempSync(join(tmpdir(), "crickets-"));
execFileSync("afconvert", ["-f", "WAVE", "-d", "LEI16", input, join(dir, "raw.wav")]);
const { rate, chans } = readWav(join(dir, "raw.wav"));
rmSync(dir, { recursive: true });
let x = chans[0].map((v, i) => (v + (chans[1]?.[i] ?? v)) / 2);
// trim the dead tail (and head)
const thr = 1e-4; let a = 0, b = x.length; while (a < b && Math.abs(x[a]) < thr) a++; while (b > a && Math.abs(x[b - 1]) < thr) b--;
x = x.slice(a + Math.round(.05 * rate), b - Math.round(.15 * rate));
const N = 2048, hop = 512, win = Float64Array.from({ length: N }, (_, i) => .5 - .5 * Math.cos(2 * Math.PI * i / N));
const frames = [];
for (let s = 0; s + N <= x.length; s += hop) {
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let i = 0; i < N; i++) re[i] = x[s + i] * win[i];
    fft(re, im); frames.push([re, im]);
}
const H = N / 2 + 1, mags = frames.map(([re, im]) => Float64Array.from({ length: H }, (_, k) => Math.hypot(re[k], im[k])));
// the noise floor per bin: a low percentile over time (between chirps)
const noise = new Float64Array(H);
for (let k = 0; k < H; k++) { const col = mags.map(m => m[k]).sort((p, q) => p - q); noise[k] = col[Math.floor(col.length * .25)]; }
const band = k => { const f = k * rate / N; if (f < 1700 || f > 9500) return 0; const lo = Math.min(1, (f - 1700) / 400), hi = Math.min(1, (9500 - f) / 1500); return lo * hi; };
const prev = new Float64Array(H), out = new Float64Array(x.length + N);
for (let t = 0; t < frames.length; t++) {
    const [re, im] = frames[t];
    for (let k = 0; k < H; k++) {
        const snr = mags[t][k] / (noise[k] * 2.5 + 1e-12);
        let g = Math.max(.02, Math.min(1, (snr - 1) / 1.5)) * band(k);
        g = Math.max(g, prev[k] * .6); prev[k] = g; // a short release so tails don't flutter
        re[k] *= g; im[k] *= g; if (k > 0 && k < N / 2) { re[N - k] *= g; im[N - k] *= g; }
    }
    for (let i = 0; i < N; i++) im[i] = -im[i];
    fft(re, im);
    for (let i = 0; i < N; i++) out[t * hop + i] += re[i] / N * win[i] / 1.5;
}
// resample to 24 kHz (2:1 average after the 9.5k band limit)
const R = 24000, step = rate / R, y = new Float32Array(Math.floor(x.length / step));
for (let i = 0; i < y.length; i++) { const p = i * step, j = Math.floor(p), f = p - j; y[i] = out[j] * (1 - f) + out[j + 1] * f; }
// loop: the last `fade` seconds crossfaded into the head
const fade = Math.round(.6 * R), n = y.length - fade, loop = y.slice(0, n);
for (let i = 0; i < fade; i++) { const k = i / fade; loop[i] = y[i] * Math.sin(k * Math.PI / 2) + y[n + i] * Math.cos(k * Math.PI / 2); }
let top = 0; for (const v of loop) top = Math.max(top, Math.abs(v));
for (let i = 0; i < loop.length; i++) loop[i] *= .9 / top;
writeWav(target, loop, R);
console.log(`${(loop.length / R).toFixed(2)} s at ${R} Hz, gain ${(0.9 / top).toFixed(1)}x`);
