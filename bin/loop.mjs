// A loop from a recording (rain): a stretch from the middle, rumble under 90 Hz cut, levelled, its tail
// crossfaded (equal power) into its head so it wraps without a seam, mono 22.05 kHz.
// Run (macOS, uses afconvert): node bin/loop.mjs <recording> <name> [seconds = 24] [fade = 2.5]
// Writes packages/foundations/sound/asset/sfx/<name>-1.wav (listed in bin/sfx.mjs as copied, not rendered).
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const [input, name, secondsText, fadeText] = process.argv.slice(2);
if (!input || !name) throw new Error("usage: node bin/loop.mjs <recording> <name> [seconds] [fade]");
const SECONDS = Number(secondsText) || 24, FADE = Number(fadeText) || 2.5, R = 22050;

const dir = mkdtempSync(join(tmpdir(), "loop-"));
execFileSync("afconvert", ["-f", "WAVE", "-d", "LEI16", input, join(dir, "raw.wav")]);
const b = readFileSync(join(dir, "raw.wav"));
rmSync(dir, { recursive: true });
let p = 12, fmt, data;
while (p < b.length) { const id = b.toString("ascii", p, p + 4), len = b.readUInt32LE(p + 4); if (id === "fmt ") fmt = p + 8; if (id === "data") { data = [p + 8, len]; break; } p += 8 + len; }
const ch = b.readUInt16LE(fmt + 2), rate = b.readUInt32LE(fmt + 4), n = data[1] / 2 / ch;
const mono = new Float32Array(n);
for (let i = 0; i < n; i++) { let s = 0; for (let c = 0; c < ch; c++) s += b.readInt16LE(data[0] + (i * ch + c) * 2) / 32768; mono[i] = s / ch; }

// low pass for the resampling, then down to R
const k = 1 - Math.exp(-2 * Math.PI * 9500 / rate);
let y = 0;
const smooth = mono.map(x => (y += k * (x - y)));
const step = rate / R, all = new Float32Array(Math.floor(n / step));
for (let i = 0; i < all.length; i++) { const q = i * step, j = Math.floor(q), f = q - j; all[i] = smooth[j] * (1 - f) + (smooth[j + 1] ?? 0) * f; }
// high pass twice: no rumble
for (let pass = 0; pass < 2; pass++) {
    const a = Math.exp(-2 * Math.PI * 90 / R);
    let px = 0, py = 0;
    for (let i = 0; i < all.length; i++) { const x = all[i]; py = a * (py + x - px); px = x; all[i] = py; }
}

// the stretch from the middle, `FADE` longer, its tail laid over its head
const length = Math.round(SECONDS * R), fade = Math.round(FADE * R);
const start = Math.max(0, Math.floor((all.length - length - fade) / 2));
if (start + length + fade > all.length) throw new Error("recording too short");
const loop = all.slice(start, start + length);
for (let i = 0; i < fade; i++) {
    const t = i / fade;
    loop[i] = all[start + i] * Math.sin(t * Math.PI / 2) + all[start + length + i] * Math.cos(t * Math.PI / 2);
}
// levelled on its loudness, not a stray peak
let energy = 0, top = 0;
for (const x of loop) { energy += x * x; top = Math.max(top, Math.abs(x)); }
const gain = Math.min(.18 / Math.sqrt(energy / loop.length), .95 / top);
for (let i = 0; i < loop.length; i++) loop[i] *= gain;

const out = join(import.meta.dirname, `../packages/foundations/sound/asset/sfx/${name}-1.wav`);
const buffer = Buffer.alloc(44 + loop.length * 2);
buffer.write("RIFF", 0); buffer.writeUInt32LE(36 + loop.length * 2, 4); buffer.write("WAVEfmt ", 8);
buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
buffer.writeUInt32LE(R, 24); buffer.writeUInt32LE(R * 2, 28); buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34);
buffer.write("data", 36); buffer.writeUInt32LE(loop.length * 2, 40);
loop.forEach((x, i) => buffer.writeInt16LE(Math.round(Math.max(-1, Math.min(1, x)) * 32767), 44 + i * 2));
writeFileSync(out, buffer);
console.log(`${name}: ${SECONDS} s from ${(start / R).toFixed(1)} s, gain ${gain.toFixed(2)}, to ${out}`);
