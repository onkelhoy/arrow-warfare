// Animal calls from a recording: split where it goes quiet, each call cleaned (rumble cut, the hiss between
// gated down), levelled, faded at both ends, mono 22.05 kHz.
// Run (macOS, uses afconvert): node bin/calls.mjs <name> <gap seconds> <recording> [more recordings]
// Writes packages/foundations/sound/asset/sfx/<name>-<n>.wav (listed in bin/sfx.mjs as copied, not rendered).
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const [name, gapText, ...inputs] = process.argv.slice(2);
if (!name || !inputs.length) throw new Error("usage: node bin/calls.mjs <name> <gap seconds> <recording>...");
const GAP = Number(gapText) || .3;
const R = 22050;
const out = join(import.meta.dirname, "../packages/foundations/sound/asset/sfx");

function readWav(path) {
    const b = readFileSync(path);
    let p = 12, fmt, data;
    while (p < b.length) { const id = b.toString("ascii", p, p + 4), len = b.readUInt32LE(p + 4); if (id === "fmt ") fmt = p + 8; if (id === "data") { data = [p + 8, len]; break; } p += 8 + len; }
    const ch = b.readUInt16LE(fmt + 2), rate = b.readUInt32LE(fmt + 4), n = data[1] / 2 / ch;
    const mono = new Float32Array(n);
    for (let i = 0; i < n; i++) { let s = 0; for (let c = 0; c < ch; c++) s += b.readInt16LE(data[0] + (i * ch + c) * 2) / 32768; mono[i] = s / ch; }
    return { rate, mono };
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

/** Decoded, resampled to `R`, the rumble under 180 Hz cut. */
function load(input) {
    const dir = mkdtempSync(join(tmpdir(), "calls-"));
    execFileSync("afconvert", ["-f", "WAVE", "-d", "LEI16", input, join(dir, "raw.wav")]);
    const { rate, mono } = readWav(join(dir, "raw.wav"));
    rmSync(dir, { recursive: true });
    // a low pass before taking every other sample or so, then linear resampling
    const lowK = 1 - Math.exp(-2 * Math.PI * 9000 / rate);
    let y = 0;
    const smooth = mono.map(x => (y += lowK * (x - y)));
    const step = rate / R, data = new Float32Array(Math.floor(mono.length / step));
    for (let i = 0; i < data.length; i++) { const p = i * step, j = Math.floor(p), f = p - j; data[i] = smooth[j] * (1 - f) + (smooth[j + 1] ?? 0) * f; }
    // high pass, one pole twice
    for (let pass = 0; pass < 2; pass++) {
        const k = Math.exp(-2 * Math.PI * 180 / R);
        let px = 0, py = 0;
        for (let i = 0; i < data.length; i++) { const x = data[i]; py = k * (py + x - px); px = x; data[i] = py; }
    }
    return data;
}

const calls = [];
for (const input of inputs) {
    const data = load(input);
    // loudness in 10 ms windows
    const W = Math.round(R * .01), levels = [];
    for (let s = 0; s < data.length; s += W) { let e = 0; for (let i = s; i < Math.min(data.length, s + W); i++) e += data[i] ** 2; levels.push(Math.sqrt(e / W)); }
    const sorted = [...levels].sort((a, b) => a - b), floor = sorted[Math.floor(sorted.length * .2)], peak = sorted[sorted.length - 1];
    const threshold = Math.max(floor * 4, peak * .06);
    // runs over the threshold, joined across gaps shorter than GAP
    const runs = [];
    levels.forEach((level, w) => {
        if (level < threshold) return;
        const last = runs[runs.length - 1];
        if (last && (w - last[1]) * .01 <= GAP) last[1] = w + 1;
        else runs.push([w, w + 1]);
    });
    for (const [a, b] of runs) {
        if ((b - a) * .01 < .12) continue;
        const start = Math.max(0, (a - 4) * W), end = Math.min(data.length, (b + 12) * W);
        const call = data.slice(start, end);
        // the hiss between gated down: a soft expander on the 10 ms level
        for (let s = 0; s < call.length; s += W) {
            let e = 0; for (let i = s; i < Math.min(call.length, s + W); i++) e += call[i] ** 2;
            const level = Math.sqrt(e / W), gain = Math.min(1, Math.max(.08, (level / threshold) ** 1.5));
            for (let i = s; i < Math.min(call.length, s + W); i++) call[i] *= gain;
        }
        let top = 0; for (const x of call) top = Math.max(top, Math.abs(x));
        const fade = Math.round(R * .015);
        for (let i = 0; i < call.length; i++) call[i] *= .85 / top * Math.min(1, i / fade, (call.length - 1 - i) / (fade * 4));
        calls.push(call);
        console.log(`${input.split("/").pop()}: ${(start / R).toFixed(2)}–${(end / R).toFixed(2)} s`);
    }
}
calls.forEach((call, i) => writeWav(join(out, `${name}-${i + 1}.wav`), call, R));
console.log(`${calls.length} ${name} calls`);
