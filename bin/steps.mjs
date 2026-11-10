// Footsteps, rendered to packages/foundations/sound/asset/sfx: `step` on grass, `stone` on streets and squares,
// `wetstep` in water. Each a heel then a roll to the toe, made of many tiny grains (blades, grit, drops) rather
// than tones, so they sound soft and none two alike. Its own random numbers. Run: node bin/steps.mjs
// (bin/sfx.mjs lists them as copied in, it doesn't render them).
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const R = 44100;
const out = join(import.meta.dirname, "../packages/foundations/sound/asset/sfx");
const COUNT = 8;

let seed = 90210;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const between = (a, b) => a + rnd() * (b - a);
const white = () => rnd() * 2 - 1;

/** A two pole band pass (RBJ), fresh state. */
function bandpass(freq, q) {
    const w = 2 * Math.PI * freq / R, alpha = Math.sin(w) / (2 * q), a0 = 1 + alpha;
    const b0 = alpha / a0, b2 = -alpha / a0, a1 = -2 * Math.cos(w) / a0, a2 = (1 - alpha) / a0;
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    return x => {
        const y = b0 * x + b2 * x2 - a1 * y1 - a2 * y2;
        x2 = x1; x1 = x; y2 = y1; y1 = y;
        return y;
    };
}

function lowpass(freq) {
    let y = 0;
    const k = 1 - Math.exp(-2 * Math.PI * freq / R);
    return x => (y += k * (x - y));
}

/** Adds `fn(t, u)` for `length` seconds from `at`. */
function stamp(data, at, length, fn) {
    const start = Math.round(at * R), count = Math.round(length * R);
    for (let j = 0; j < count && start + j < data.length; j++) if (start + j >= 0) data[start + j] += fn(j / R, j / count);
}

/** A soft thud: noise under `cut` Hz, swelling in over `attack`, gone in `length`. */
function thud(data, at, length, cut, volume, attack = .006) {
    const a = lowpass(cut), b = lowpass(cut);
    stamp(data, at, length, (t, u) => b(a(white())) * Math.min(1, t / attack) * Math.exp(-5 * u) * volume * 6);
}

/** Grains: `count` tiny bursts of band passed noise around `freq`, spread over `spread` seconds from `at`, denser early. */
function grains(data, at, spread, count, freq, volume, length = [.0008, .003], q = 1.5) {
    for (let i = 0; i < count; i++)
    {
        const when = at + spread * rnd() ** 1.6, band = bandpass(freq * between(.6, 1.6), q), size = between(...length);
        const level = volume * (.25 + rnd() ** 2 * .75);
        stamp(data, when, size, (t, u) => band(white()) * Math.exp(-6 * u) * level);
    }
}

/** A soft hiss over `length`, `freq` up, for the swish of the foot through grass. */
function swish(data, at, length, freq, volume) {
    const low = lowpass(freq);
    stamp(data, at, length, (t, u) => {
        const x = white();
        return (x - low(x)) * Math.sin(Math.PI * Math.min(1, u * 1.4)) ** 2 * volume;
    });
}

function finish(data, peak) {
    let top = 0;
    for (const x of data) top = Math.max(top, Math.abs(x));
    const fade = Math.round(.02 * R);
    for (let i = 0; i < data.length; i++) data[i] *= (top ? peak / top : 0) * Math.min(1, (data.length - i) / fade);
    return data;
}

/** On grass: a muffled heel, blades crunching from heel to toe, a little swish. */
function grass() {
    const data = new Float32Array(Math.round(.32 * R)), toe = between(.07, .11);
    thud(data, .004, .07, between(140, 220), 1);
    thud(data, toe, .05, between(160, 240), .45);
    grains(data, .005, .09, 40 + Math.floor(rnd() * 30), between(2600, 4200), .5);
    grains(data, toe, .1, 25 + Math.floor(rnd() * 20), between(3000, 5000), .35);
    swish(data, 0, between(.16, .22), 3000, .05);
    return finish(data, between(.75, .9));
}

/** On stone: a firm heel click, grit scuffing under the sole, a lighter toe. */
function stone() {
    const data = new Float32Array(Math.round(.28 * R)), toe = between(.06, .09);
    const click = (at, volume) => {
        const band = bandpass(between(1100, 1900), 2.2), body = bandpass(between(380, 520), 3);
        stamp(data, at, .025, (t, u) => {
            const x = white();
            return (band(x) * 1.2 + body(x) * .8) * Math.exp(-9 * u) * volume;
        });
    };
    thud(data, 0, .04, between(180, 260), .8, .002);
    click(.002, 1);
    click(toe, .45);
    grains(data, .01, .12, 30 + Math.floor(rnd() * 25), between(4500, 7000), .25, [.0005, .0015], 1.2);
    return finish(data, between(.7, .85));
}

/** In water: a soft squelch and a few drops. */
function wet() {
    const data = new Float32Array(Math.round(.38 * R));
    const wobble = between(18, 30);
    const low = lowpass(between(900, 1400));
    stamp(data, .005, .16, (t, u) => low(white()) * Math.sin(Math.PI * u) * (1 + .6 * Math.sin(2 * Math.PI * wobble * t)) * .9);
    thud(data, .004, .06, 160, .6);
    for (let i = 0, drops = 3 + Math.floor(rnd() * 5); i < drops; i++)
    {
        const at = between(.05, .3), f0 = between(900, 1800), volume = between(.15, .35);
        let p = 0;
        stamp(data, at, .03, (t, u) => Math.sin(p += 2 * Math.PI * f0 * (1 + u * .8) / R) * Math.exp(-7 * u) * volume);
    }
    grains(data, .02, .2, 30, 3500, .15);
    return finish(data, between(.7, .85));
}

function wav(data) {
    const buffer = Buffer.alloc(44 + data.length * 2);
    buffer.write("RIFF", 0); buffer.writeUInt32LE(36 + data.length * 2, 4); buffer.write("WAVEfmt ", 8);
    buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
    buffer.writeUInt32LE(R, 24); buffer.writeUInt32LE(R * 2, 28); buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34);
    buffer.write("data", 36); buffer.writeUInt32LE(data.length * 2, 40);
    data.forEach((x, i) => buffer.writeInt16LE(Math.round(Math.max(-1, Math.min(1, x)) * 32767), 44 + i * 2));
    return buffer;
}

for (const [name, make] of [["step", grass], ["stone", stone], ["wetstep", wet]])
    for (let i = 1; i <= COUNT; i++) writeFileSync(join(out, `${name}-${i}.wav`), wav(make()));
console.log(`steps: ${COUNT} each of step, stone, wetstep`);
