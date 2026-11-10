// The ambience, rendered by bin/sfx.mjs: loops that wrap without a seam, and calls (birds, owls).
// The crickets are a recording (bin/crickets.mjs). Each entry is [versions, make(version) => Float32Array at AMBIENCE_RATE]. Replace a wav to change one.

export const AMBIENCE_RATE = 16000;
const R = AMBIENCE_RATE;
const TAU = Math.PI * 2;

let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const between = (a, b) => a + rnd() * (b - a);
const white = () => rnd() * 2 - 1;

function normalize(data, peak = .9) {
    let top = 0;
    for (const x of data) top = Math.max(top, Math.abs(x));
    if (top > 0) for (let i = 0; i < data.length; i++) data[i] *= peak / top;
    return data;
}

/** `data` is `seconds` plus `fade` long, its tail is crossfaded into its head so it loops without a seam. */
function loopify(data, seconds, fade) {
    const n = Math.round(seconds * R), f = Math.round(fade * R), out = data.slice(0, n);
    for (let i = 0; i < f; i++) {
        const k = i / f;
        out[i] = data[i] * Math.sin(k * Math.PI / 2) + data[n + i] * Math.cos(k * Math.PI / 2);
    }
    return out;
}

/** Adds `fn(t)` for `length` seconds from `at`, wrapping around the end (for loops). */
function stamp(data, at, length, fn) {
    const n = data.length, start = Math.round(at * R), count = Math.round(length * R);
    for (let j = 0; j < count; j++) data[((start + j) % n + n) % n] += fn(j / R, j / count);
}

/** A two pole band pass, RBJ. */
function bandpass(freq, q) {
    const w = TAU * freq / R, alpha = Math.sin(w) / (2 * q), a0 = 1 + alpha;
    const b0 = alpha / a0, b2 = -alpha / a0, a1 = -2 * Math.cos(w) / a0, a2 = (1 - alpha) / a0;
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    return x => {
        const y = b0 * x + b2 * x2 - a1 * y1 - a2 * y2;
        x2 = x1; x1 = x; y2 = y1; y1 = y;
        return y;
    };
}

/** A one pole low pass with a cutoff that can move. */
function lowpass() {
    let y = 0;
    return (x, freq) => (y += (1 - Math.exp(-TAU * freq / R)) * (x - y));
}

/** Always: air through the trees, swelling in gusts that repeat with the loop. */
function wind() {
    const seconds = 12, fade = 1.5, data = new Float32Array((seconds + fade) * R);
    const low = lowpass(), lower = lowpass(), rustle = bandpass(1800, .8);
    for (let i = 0; i < data.length; i++) {
        const t = i / R, p = TAU * t / seconds;
        const gust = Math.max(0, .5 + .22 * Math.sin(p) + .15 * Math.sin(3 * p + 1) + .1 * Math.sin(5 * p + 2) + .05 * Math.sin(11 * p + 4));
        const x = white();
        const body = lower(low(x, 180 + 520 * gust), 260 + 700 * gust);
        // the leaves, only in the strong part of a gust
        data[i] = body * (.3 + gust * gust) * 3 + rustle(x) * Math.max(0, gust - .55) * .5;
    }
    return normalize(loopify(data, seconds, fade), .7);
}

/** Ponds: a few frogs, each croaking at its own pace. */
function frogs() {
    const seconds = 8, data = new Float32Array(seconds * R);
    for (let c = 0; c < 4; c++) {
        const croaks = [5, 7, 4, 6][c], period = seconds / croaks, offset = rnd() * period;
        const pitch = between(140, 300), pulses = 3 + Math.floor(rnd() * 6), rate = between(18, 32), volume = between(.4, 1) * (c ? .6 : 1);
        const formant = bandpass(between(700, 1300), 3);
        for (let k = 0; k < croaks; k++) {
            // now and then one skips a croak
            if (rnd() < .2) continue;
            const at = offset + k * period + between(-.1, .1);
            for (let p = 0; p < pulses; p++) {
                const f = pitch * (1 + .08 * (p / pulses));
                stamp(data, at + p / rate, .05, (t, u) => {
                    let x = 0;
                    for (let h = 1; h <= 6; h++) x += Math.sin(TAU * f * h * t) / h;
                    return (x * .6 + formant(x) * 2) * Math.exp(-6 * u) * Math.min(1, u * 20) * volume;
                });
            }
        }
    }
    return normalize(data, .8);
}

/** Lanterns and fires: small pops, some bigger cracks, and a soft roar under them. */
function crackle() {
    const seconds = 6, fade = .8, data = new Float32Array(seconds * R);
    const pop = (at, length, volume, freq) => {
        const band = bandpass(freq, 1.2);
        stamp(data, at, length, (t, u) => band(white()) * Math.exp(-7 * u) * volume);
    };
    for (let t = 0; t < seconds; t += -Math.log(1 - rnd()) / 22) pop(t, between(.002, .006), rnd() ** 3, between(2000, 6000));
    for (let t = 0; t < seconds; t += -Math.log(1 - rnd()) / 1.6) pop(t, between(.01, .03), between(.5, 1), between(900, 2500));
    const roar = new Float32Array((seconds + fade) * R), low = lowpass(), lower = lowpass();
    for (let i = 0; i < roar.length; i++) {
        const t = i / R;
        roar[i] = lower(low(white(), 400), 300) * (.7 + .3 * Math.sin(TAU * t * 1.3) * Math.sin(TAU * t * .37)) * 1.6;
    }
    const under = loopify(roar, seconds, fade);
    for (let i = 0; i < data.length; i++) data[i] += under[i];
    return normalize(data, .8);
}

/** One sine call: `notes` of [start, length, from Hz, to Hz, volume], with a soft 2nd harmonic. */
function call(seconds, notes, vibrato = 0) {
    const data = new Float32Array(Math.round(seconds * R));
    for (const [at, length, from, to, volume] of notes) {
        let phase = 0;
        stamp(data, at, length, (t, u) => {
            const f = from * (to / from) ** u * (1 + vibrato * Math.sin(TAU * 22 * t));
            phase += f / R;
            const envelope = Math.min(1, u * 12) * Math.min(1, (1 - u) * 6);
            return (Math.sin(TAU * phase) + .15 * Math.sin(2 * TAU * phase)) * envelope * volume;
        });
    }
    return normalize(data, .85);
}

/** Day: songbirds, each version a different kind of call. */
function bird(version) {
    switch ((version - 1) % 6) {
        case 0: { // quick rising tweets
            const n = 3 + Math.floor(rnd() * 4), notes = [];
            for (let i = 0; i < n; i++) notes.push([i * .11, .06, between(2400, 2900), between(4200, 4800), 1 - i * .08]);
            return call(n * .11 + .2, notes);
        }
        case 1: // a two note whistle, high then low
            return call(.9, [[0, .28, 3100, 3000, 1], [.36, .38, 2350, 2250, .9]], .012);
        case 2: { // a falling trill
            const notes = [];
            for (let i = 0; i < 18; i++) notes.push([i * .03, .022, 4200 - i * 60, 3900 - i * 60, .8 + .2 * Math.sin(i)]);
            return call(.8, notes);
        }
        case 3: // a warble
            return call(.9, [[0, .7, 2800, 3300, 1]], .2);
        case 4: { // chip chip chip chee-oo
            const notes = [[0, .05, 3800, 3500, .8], [.12, .05, 3800, 3500, .8], [.24, .05, 3800, 3500, .8], [.38, .22, 4400, 2600, 1]];
            return call(.8, notes);
        }
        default: { // a far, soft cuckoo-like two note
            return call(1, [[0, .25, 1300, 1250, 1], [.32, .35, 1050, 1000, .9]]);
        }
    }
}

/** Night: an owl, hoo... hoo-hoo-hoo, breathy. */
function owl(version) {
    const f = version === 1 ? 380 : 330, seconds = 2.4, data = new Float32Array(seconds * R), breath = bandpass(f * 2, 4);
    const hoots = version === 1 ? [[0, .45], [.85, .25], [1.15, .25], [1.5, .5]] : [[0, .6], [.9, .7]];
    for (const [at, length] of hoots) {
        let phase = 0;
        stamp(data, at, length, (t, u) => {
            phase += f * (1 + .04 * Math.sin(Math.PI * u)) / R;
            const envelope = Math.sin(Math.PI * Math.min(1, u * 1.3)) ** 1.5;
            return (Math.sin(TAU * phase) + .25 * Math.sin(2 * TAU * phase) + breath(white()) * .6) * envelope;
        });
    }
    return normalize(data, .85);
}

/** Rain: a wash of noise, and many small drops patting on leaves and ground. */
function rain() {
    const seconds = 10, fade = 1, data = new Float32Array((seconds + fade) * R);
    const low = lowpass(), lower = lowpass(), hiss = bandpass(5000, .7);
    for (let i = 0; i < data.length; i++) {
        const t = i / R, x = white();
        data[i] = lower(low(x, 2200), 1600) * (.8 + .1 * Math.sin(TAU * t / 5)) * 1.2 + hiss(x) * .12;
    }
    const wash = loopify(data, seconds, fade), out = new Float32Array(seconds * R);
    for (let i = 0; i < out.length; i++) out[i] = wash[i];
    // the drops, wrapping round the loop
    for (let t = 0; t < seconds; t += -Math.log(1 - rnd()) / 260) {
        const band = bandpass(between(1500, 7000), 3), volume = rnd() ** 2 * .5;
        stamp(out, t, between(.004, .012), (_, u) => band(white()) * Math.exp(-6 * u) * volume);
    }
    // now and then a fat drop off a leaf
    for (let t = 0; t < seconds; t += -Math.log(1 - rnd()) / 3) {
        const f = between(900, 1800);
        stamp(out, t, .05, (time, u) => Math.sin(TAU * f * (1 + u * .6) * time) * Math.exp(-8 * u) * .35);
    }
    return normalize(out, .8);
}

/** Thunder far off: a crack (the near one), then a long rumble rolling in swells. */
function thunder(version) {
    const seconds = 7, data = new Float32Array(seconds * R), low = lowpass(), lower = lowpass(), crack = bandpass(1400, .6);
    const near = version === 1, swells = [[.1, 1], [.9, .7], [1.8, .9], [3, .5], [4.2, .3]].map(([at, v]) => [at + between(-.2, .2), v * between(.7, 1.1)]);
    for (let i = 0; i < data.length; i++) {
        const t = i / R, x = white();
        let level = 0;
        for (const [at, v] of swells) if (t > at) level += v * Math.exp(-(t - at) * 1.3) * Math.min(1, (t - at) * 6);
        let y = lower(low(x, 90 + 120 * Math.min(1, level)), 70) * level * 7;
        if (near && t < .5) y += crack(x) * Math.exp(-t * 14) * .8;
        data[i] = y;
    }
    // fade the tail to silence
    for (let i = 0; i < data.length; i++) data[i] *= Math.min(1, (data.length - i) / (R * 1.5));
    return normalize(data, .9);
}

export const AMBIENCE = {
    wind: [1, wind],
    frogs: [1, frogs],
    crackle: [1, crackle],
    bird: [6, bird],
    owl: [2, owl],
    rain: [1, rain],
    thunder: [2, thunder],
};
