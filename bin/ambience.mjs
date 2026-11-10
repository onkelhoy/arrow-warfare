// The ambience, rendered by bin/sfx.mjs: loops that wrap without a seam, and calls (birds).
// Crickets, owls, crows and rain are recordings (bin/crickets.mjs, bin/calls.mjs, bin/loop.mjs). Each entry is [versions, make(version) => Float32Array at AMBIENCE_RATE]. Replace a wav to change one.

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

/** The fire's own rate: clicks need the highs. */
export const FIRE_RATE = 32000;

/**
 * A wood fire: sharp irregular clicks, often in little clusters, a louder snap now and then with a short
 * woody ring, a faint hiss and a soft breath under it. Its own random numbers, so the other sounds stay as they are.
 */
function crackle() {
    const F = FIRE_RATE, seconds = 8, data = new Float32Array(seconds * F);
    let s = 4242;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const noise = () => r() * 2 - 1;
    const at = (t, length, fn) => {
        const start = Math.round(t * F), count = Math.max(1, Math.round(length * F));
        for (let j = 0; j < count; j++) data[(start + j) % data.length] += fn(j / count);
    };
    /** A click: a few ms of noise, its lows taken out, falling fast. */
    const click = (t, volume, length) => {
        let low = 0;
        at(t, length, u => {
            const x = noise();
            low += .25 * (x - low);
            return (x - low) * Math.exp(-9 * u) * volume;
        });
    };
    /** A snap: a click and a short ring of the wood, two resonances. */
    const snap = (t, volume) => {
        click(t, volume, .004);
        const f1 = 1400 + r() * 1600, f2 = f1 * (1.6 + r() * .5), decay = 60 + r() * 60;
        at(t, .06, u => {
            const time = u * .06;
            return (Math.sin(Math.PI * 2 * f1 * time) + .5 * Math.sin(Math.PI * 2 * f2 * time)) * Math.exp(-decay * time) * volume * .35 * (1 + noise() * .3);
        });
    };
    // single clicks, quiet mostly, a few loud
    for (let t = 0; t < seconds; t += -Math.log(1 - r()) / 9) click(t, .15 + r() ** 3 * .7, .0006 + r() * .0015);
    // clusters: a handful of clicks within a tenth of a second, as a log splits
    for (let t = r(); t < seconds; t += -Math.log(1 - r()) / 1.3)
    {
        const count = 3 + Math.floor(r() * 7), volume = .3 + r() * .5;
        for (let k = 0, c = t; k < count; k++, c += .005 + r() * .025) click(c, volume * (.4 + r() * .6), .0005 + r() * .001);
    }
    for (let t = r() * 2; t < seconds; t += 1 + -Math.log(1 - r()) * 1.2) snap(t, .7 + r() * .3);
    // the hiss and the breath, slowly coming and going, made seamless by wrapping their start into their end
    let high = 0, low = 0, lower = 0;
    const bed = new Float32Array(data.length);
    for (let pass = 0; pass < 2; pass++)
        for (let i = 0; i < data.length; i++)
        {
            const x = noise(), time = i / F;
            high += .5 * (x - high);
            low += .02 * (x - low);
            lower += .02 * (low - lower);
            const swell = .7 + .3 * Math.sin(Math.PI * 2 * time / 4) * Math.sin(Math.PI * 2 * time / 1.6);
            // the second pass runs on warm filters, so its start joins the end
            if (pass) bed[i] = ((x - high) * .035 + lower * 1.4) * swell;
        }
    for (let i = 0; i < data.length; i++) data[i] += bed[i];
    let top = 0;
    for (const x of data) top = Math.max(top, Math.abs(x));
    for (let i = 0; i < data.length; i++) data[i] *= .85 / top;
    return data;
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

/**
 * Thunder: `1` close, a tearing crack then a heavy roll; `2` further, rolling in swells. Gritty (soft clipped)
 * so a phone speaker, which plays nothing under ~150 Hz, still hears it.
 */
function thunder(version) {
    const near = version === 1, seconds = near ? 8 : 9, data = new Float32Array(seconds * R);
    const low = lowpass(), lower = lowpass(), body = bandpass(180, .7), crack = bandpass(1800, .5), tear = bandpass(700, .6);
    const swells = (near ? [[.05, 1.2], [.6, .9], [1.4, 1], [2.5, .7], [3.8, .45], [5.2, .25]] : [[.3, .6], [1.1, .9], [2.2, 1], [3.4, .7], [4.8, .45], [6.2, .25]])
        .map(([at, v]) => [at + between(-.15, .15), v * between(.8, 1.1)]);
    // crackles inside the roll: little bursts that make it sound torn, not smooth
    const crackles = [];
    for (let t = near ? 0 : .3; t < seconds - 2; t += -Math.log(1 - rnd()) / (near ? 18 : 9)) crackles.push([t, between(.3, 1) * Math.exp(-t / (near ? 1.5 : 2.5))]);
    let ci = 0, burst = 0;
    for (let i = 0; i < data.length; i++) {
        const t = i / R, x = white();
        let level = 0;
        for (const [at, v] of swells) if (t > at) level += v * Math.exp(-(t - at) * 1.1) * Math.min(1, (t - at) * 5);
        while (ci < crackles.length && crackles[ci][0] <= t) burst = Math.max(burst, crackles[ci++][1]);
        burst *= Math.exp(-28 / R);
        const rumble = lower(low(x, 160 + 260 * Math.min(1, level)), 120 + 200 * Math.min(1, level)) * 9 + body(x) * 1.6;
        let y = rumble * level + tear(x) * burst * .9;
        if (near && t < .6) y += crack(x) * Math.exp(-t * 7) * 1.4 + tear(x) * Math.exp(-t * 4) * .8;
        data[i] = Math.tanh(y * 2.2) * .7;
    }
    for (let i = 0; i < data.length; i++) data[i] *= Math.min(1, (data.length - i) / (R * 2));
    return normalize(data, .95);
}

export const AMBIENCE = {
    frogs: [1, frogs],
    crackle: [1, crackle, FIRE_RATE],
    bird: [6, bird],
    thunder: [2, thunder],
};
