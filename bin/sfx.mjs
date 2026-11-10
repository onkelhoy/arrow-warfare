// Renders every sound effect to packages/foundations/sound/asset/sfx/<name>-<n>.wav and lists them in sfx.json.
// Replace a wav to change a sound (keep the name). Run: node bin/sfx.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const RATE = 44100;
const out = join(import.meta.dirname, "../packages/foundations/sound/asset/sfx");
mkdirSync(out, { recursive: true });

let seed = 1;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const jit = (v, j = .08) => v * (1 + (rnd() * 2 - 1) * j);

/** A sound is a list of voices, summed. */
function render(length, voices) {
    const n = Math.ceil(length * RATE), data = new Float32Array(n);
    for (const v of voices) v(data);
    let peak = 0;
    for (const x of data) peak = Math.max(peak, Math.abs(x));
    if (peak > .95) for (let i = 0; i < n; i++) data[i] *= .95 / peak;
    return data;
}

const env = (t, at, attack, length) => t < at ? 0 : t < at + attack ? (t - at) / attack : Math.exp(-5 * (t - at - attack) / length);
const wave = { sine: p => Math.sin(p * 2 * Math.PI), tri: p => 1 - 4 * Math.abs((p % 1) - .5), saw: p => 2 * (p % 1) - 1, square: p => (p % 1) < .5 ? 1 : -1 };

/** A pitch sliding from `from` to `to`. */
const tone = (type, from, to, length, volume, at = 0, attack = .003) => data => {
    let phase = 0;
    const end = Math.min(data.length, Math.ceil((at + length * 1.5) * RATE));
    for (let i = Math.floor(at * RATE); i < end; i++) {
        const t = i / RATE, k = Math.min(1, (t - at) / length);
        phase += from * Math.pow(to / from, k) / RATE;
        data[i] += wave[type](phase) * env(t, at, attack, length) * volume;
    }
};

/** Noise through a two pole band pass. */
const noise = (freq, q, length, volume, at = 0, attack = .002, sweep = 1) => data => {
    let a = 0, b = 0;
    const end = Math.min(data.length, Math.ceil((at + length * 1.5) * RATE));
    for (let i = Math.floor(at * RATE); i < end; i++) {
        const t = i / RATE, k = Math.min(1, (t - at) / length);
        const f = freq * Math.pow(sweep, k), w = 2 * Math.PI * f / RATE, r = Math.max(.5, 1 - w / (2 * q));
        const y = (rnd() * 2 - 1) * (1 - r) * 2 + 2 * r * Math.cos(w) * a - r * r * b;
        b = a; a = y;
        data[i] += y * env(t, at, attack, length) * volume;
    }
};

/** Each sound: how many versions, its length, and its voices (called fresh per version, so jit varies). */
const sounds = {
    creak: [3, .12, () => [noise(jit(1400, .2), 6, .05, .5)]],
    twang: [4, .4, () => [tone("tri", jit(190), 70, .22, .5), tone("saw", jit(380), 120, .08, .12), noise(3000, 1, .05, .3)]],
    wood: [3, .3, () => [tone("sine", jit(160), 70, .16, .7), noise(jit(900), 2, .04, .5)]],
    ground: [3, .25, () => [tone("sine", jit(90), 50, .12, .5), noise(jit(500), 1, .07, .35)]],
    // softer: a low muffled thud, no drum ring
    body: [4, .3, () => [tone("sine", jit(85), 45, .09, .45, 0, .008), noise(jit(350), .8, .08, .5, 0, .006)]],
    kill: [2, .9, () => [tone("sine", 85, 32, .55, 1), tone("tri", 170, 60, .2, .5), noise(1200, 2, .05, .6), tone("sine", 660, 640, .35, .08, .04)]],
    pant: [2, 1.8, () => [0, 1, 2, 3].map(i => noise(jit(i % 2 ? 900 : 1300), .7, .3, .25, i * .42, .12))],
    pickup: [2, .2, () => [tone("tri", jit(520), 900, .09, .3)]],
    empty: [2, .1, () => [tone("square", 140, 120, .05, .08)]],
    stretch: [3, .5, () => [noise(jit(700), 8, .35, .25, 0, .25, 2.2), tone("saw", jit(110), 160, .35, .03, 0, .25)]],
    whoosh: [4, .7, () => [noise(jit(500), 1.5, .35, .7, 0, .25, 4), noise(jit(2500), 3, .2, .2, .15, .1, .6)]],
    hop: [3, .3, () => [noise(jit(1800), .8, .06, .3, 0, .01), tone("sine", jit(110), 60, .08, .3, .02)]],
    grunt: [4, .4, () => { const f = jit(130, .2); return [tone("saw", f, f * .7, .18, .25, 0, .03), tone("square", f * 2, f * 1.4, .12, .05, 0, .03), noise(jit(600), 2, .15, .2, 0, .03)]; }],
    heartbeat: [2, .8, () => [tone("sine", 60, 40, .08, .9, 0, .005), tone("sine", 55, 38, .1, .7, .22, .005)]],
};

function wav(data, rate = RATE) {
    const buffer = Buffer.alloc(44 + data.length * 2);
    buffer.write("RIFF", 0); buffer.writeUInt32LE(36 + data.length * 2, 4); buffer.write("WAVEfmt ", 8);
    buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
    buffer.writeUInt32LE(rate, 24); buffer.writeUInt32LE(rate * 2, 28); buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34);
    buffer.write("data", 36); buffer.writeUInt32LE(data.length * 2, 40);
    data.forEach((x, i) => buffer.writeInt16LE(Math.round(Math.max(-1, Math.min(1, x)) * 32767), 44 + i * 2));
    return buffer;
}

const list = {};
for (const [name, [count, length, voices]] of Object.entries(sounds)) {
    list[name] = [];
    for (let i = 1; i <= count; i++) {
        const file = `${name}-${i}.wav`;
        writeFileSync(join(out, file), wav(render(length, voices())));
        list[name].push(file);
    }
}
// the ambience: loops and calls, at a lower rate to keep them small (bin/ambience.mjs)
const { AMBIENCE, AMBIENCE_RATE } = await import("./ambience.mjs");
for (const [name, [count, make, rate = AMBIENCE_RATE]] of Object.entries(AMBIENCE)) {
    list[name] = [];
    for (let i = 1; i <= count; i++) {
        const file = `${name}-${i}.wav`;
        writeFileSync(join(out, file), wav(make(i), rate));
        list[name].push(file);
    }
}
// copied in, not rendered: the guns, from cowboy (packages/game/asset/audio); crickets, owls, crows and rain, recordings (bin/crickets.mjs, bin/calls.mjs, bin/loop.mjs)
const COPIED = {
    // footsteps, rendered by bin/steps.mjs
    step: [1, 2, 3, 4, 5, 6, 7, 8].map(n => `step-${n}.wav`),
    stone: [1, 2, 3, 4, 5, 6, 7, 8].map(n => `stone-${n}.wav`),
    wetstep: [1, 2, 3, 4, 5, 6, 7, 8].map(n => `wetstep-${n}.wav`),
    crickets: ["crickets-1.wav"],
    rain: ["rain-1.wav"],
    owl: ["owl-1.wav", "owl-2.wav", "owl-3.wav"],
    crow: [1, 2, 3, 4, 5, 6].map(n => `crow-${n}.wav`),
    gunshot: ["gunshot-1.mp3", "gunshot-2.mp3"],
    reload: ["reload-1.mp3"],
    flyby: ["flyby-1.mp3", "flyby-2.mp3", "flyby-3.mp3", "flyby-4.mp3", "flyby-5.mp3"],
};
Object.assign(list, COPIED);
writeFileSync(join(out, "sfx.json"), JSON.stringify(list, null, 2) + "\n");
console.log(`${Object.keys(list).length} sounds to ${out}`);
