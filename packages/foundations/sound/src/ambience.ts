import type { Voice } from "@papit/audio";
import type { Sound, Vec } from "./sound";
import { register } from "./sfx";

export type AmbienceTime = "night" | "dawn" | "noon" | "sunset";
/** Something in the world that sounds all the time: frogs at a pond, a fire crackling, crickets in the forest. */
export type Emitter = { name: "frogs" | "crackle" | "crickets"; at: Vec; volume?: number; half?: number; reach?: number };

const BEDS = ["rain"] as const;
type Bed = typeof BEDS[number];
type CallName = "bird" | "owl" | "crow";

type Mix = {
    /** Volumes of the loops in my head. */
    beds: Record<Bed, number>;
    /** How loud the crickets in the forest are while they sing (they come in bursts). */
    crickets: number;
    /** Seconds between calls, `null` for none. */
    calls: { name: CallName; every: [number, number] } | null;
    /** Seconds between crows cawing somewhere, `null` for none. */
    crows: [number, number] | null;
    /** How loud the frogs are at this time. */
    frogs: number;
};

const MIX: Record<AmbienceTime, Mix> = {
    night: { beds: { rain: 0 }, crickets: .7, calls: { name: "owl", every: [7, 20] }, crows: null, frogs: 1 },
    dawn: { beds: { rain: 0 }, crickets: .2, calls: { name: "bird", every: [1.2, 4] }, crows: [20, 50], frogs: .6 },
    noon: { beds: { rain: 0 }, crickets: 0, calls: { name: "bird", every: [3, 9] }, crows: [25, 70], frogs: .3 },
    sunset: { beds: { rain: 0 }, crickets: .45, calls: { name: "bird", every: [5, 14] }, crows: [15, 40], frogs: .8 },
};

/** Seconds the crickets sing, and are quiet between. */
const CHIRPING: [number, number] = [5, 14];
const QUIET: [number, number] = [4, 20];

/** `mix` in the rain: the rain loud, crickets and birds mostly hiding, the frogs loving it. */
function soaked(mix: Mix): Mix {
    return {
        beds: { rain: .6 },
        crickets: mix.crickets * .3,
        calls: mix.calls && { name: mix.calls.name, every: [mix.calls.every[0] * 3, mix.calls.every[1] * 3] },
        crows: mix.crows && [mix.crows[0] * 2, mix.crows[1] * 2],
        frogs: Math.min(1, mix.frogs * 1.4),
    };
}

/** How many emitters sound at once, the nearest (crickets counted on their own). */
const NEAREST = 4;
const CRICKETS = 3;
/** Seconds between picking the nearest emitters. */
const PICK = .4;
/** Seconds for the mix to change with the time of day. */
const CHANGE = 4;

type Playing = { voice: Promise<Voice | null>; emitter: Emitter };

/**
 * The world's own sounds on the ambience bus: loops in my head for the time of day (crickets at night
 * in bursts, rain), calls now and then somewhere around me (birds by day, an owl at night), and the nearest
 * few emitters in 3D (frogs at the ponds, fires). Call `update` every frame with where the ears are.
 */
export class Ambience {
    private mix: Mix = MIX.noon;
    private name: AmbienceTime = "noon";
    private beds = new Map<string, Promise<Voice | null>>();
    private list: Emitter[] = [];
    private playing = new Map<Emitter, Playing>();
    private nextCall = 2;
    private nextCrow = 8;
    /** The crickets sing until this runs out, then are quiet as long. */
    private chirping = false;
    private nextChirp = 0;
    private nextPick = 0;
    private stopped = false;
    private raining = false;

    constructor(private sound: Sound, folder = "/sfx") {
        register(sound, folder);
    }

    /** Changes the mix to the time of day, fading over a few seconds. */
    time(name: AmbienceTime) {
        this.name = name;
        this.mix = this.raining ? soaked(MIX[name] ?? MIX.noon) : MIX[name] ?? MIX.noon;
        for (const [name, voice] of this.beds) void voice.then(voice => voice?.fadeTo(this.bedLevel(name as Bed), { seconds: CHANGE }));
        for (const playing of this.playing.values()) void playing.voice.then(voice => voice?.fadeTo(this.level(playing.emitter), { seconds: CHANGE }));
    }

    /** A rainy day: the rain loop, fewer crickets and birds, more frogs. */
    rain(on: boolean) {
        this.raining = on;
        this.time(this.name);
    }

    /** Thunder from lightning `distance` metres off, heard once the sound has come that far. */
    thunder(distance: number) {
        if (this.stopped || !this.sound.has("thunder")) return;
        setTimeout(() => {
            if (this.stopped) return;
            // loud and low: closer is louder and a touch higher
            void this.sound.play("thunder", { bus: "ambience", volume: Math.max(.7, 1.25 - distance / 2500), rate: .82 + Math.random() * .1 + (1 - Math.min(1, distance / 1400)) * .08 });
        }, distance / 343 * 1000);
    }

    /** The things that sound in this world. */
    emitters(list: Emitter[]) {
        this.list = list;
    }

    /** Moves time on by `dt` seconds with the ears at `ears`. */
    update(dt: number, ears: Vec) {
        if (this.stopped || !this.sound.running) return;
        this.startBeds();

        this.nextCall -= dt;
        const calls = this.mix.calls;
        if (calls && this.nextCall <= 0)
        {
            this.nextCall = calls.every[0] + Math.random() * (calls.every[1] - calls.every[0]);
            this.call(calls.name, ears);
        }
        this.nextCrow -= dt;
        const crows = this.mix.crows;
        if (crows && this.nextCrow <= 0)
        {
            this.nextCrow = crows[0] + Math.random() * (crows[1] - crows[0]);
            this.call("crow", ears);
        }

        // the crickets in bursts: a while singing, a while quiet
        this.nextChirp -= dt;
        if (this.nextChirp <= 0)
        {
            this.chirping = !this.chirping;
            const [least, most] = this.chirping ? CHIRPING : QUIET;
            this.nextChirp = least + Math.random() * (most - least);
            for (const playing of this.playing.values())
            {
                if (playing.emitter.name === "crickets") void playing.voice.then(voice => voice?.fadeTo(this.level(playing.emitter), { seconds: this.chirping ? 1.5 : 2.5 }));
            }
        }

        this.nextPick -= dt;
        if (this.nextPick <= 0)
        {
            this.nextPick = PICK;
            this.pick(ears);
        }
    }

    /** Fades everything out and stays quiet. */
    stop(seconds = 1.5) {
        this.stopped = true;
        for (const voice of this.beds.values()) void voice.then(voice => voice?.stop({ seconds }));
        for (const playing of this.playing.values()) void playing.voice.then(voice => voice?.stop({ seconds }));
        this.beds.clear();
        this.playing.clear();
    }

    private startBeds() {
        for (const name of BEDS)
        {
            // a loop that's silent now isn't started until it's wanted
            if (this.beds.has(name) || !this.mix.beds[name] || !this.sound.has(name)) continue;
            const length = 8;
            this.beds.set(name, this.sound.play(name, { bus: "ambience", loop: true, volume: 0, offset: Math.random() * length })
                .then(voice => voice?.fadeTo(this.bedLevel(name), { seconds: 3 }) ?? null));
        }
    }

    private bedLevel(name: Bed) {
        return this.mix.beds[name];
    }

    /** A bird, a crow or an owl somewhere around me, up in the trees (crows further and higher). */
    private call(name: CallName, ears: Vec) {
        if (!this.sound.has(name)) return;
        const angle = Math.random() * Math.PI * 2, distance = (name === "crow" ? 20 : 12) + Math.random() * 25;
        const at = [ears[0] + Math.cos(angle) * distance, ears[1] + (name === "crow" ? 8 : 4) + Math.random() * 6, ears[2] + Math.sin(angle) * distance];
        const rate = name === "bird" ? .9 + Math.random() * .25 : .95 + Math.random() * .1;
        const volume = name === "owl" ? 1 : name === "crow" ? .6 : .45 + Math.random() * .35;
        void this.sound.play(name, { bus: "ambience", at, half: name === "bird" ? 12 : name === "owl" ? 25 : 18, volume, rate });
    }

    /** The nearest few emitters sound, the rest fade out. */
    private pick(ears: Vec) {
        let near = this.list
            .map(emitter => ({ emitter, distance: Math.hypot(emitter.at[0] - ears[0], emitter.at[1] - ears[1], emitter.at[2] - ears[2]) }))
            // crickets only when it's their time of day
            .filter(({ emitter, distance }) => distance < (emitter.reach ?? 30) && (emitter.name !== "crickets" || this.mix.crickets > 0))
            .sort((a, b) => a.distance - b.distance);
        const crickets = near.filter(({ emitter }) => emitter.name === "crickets").slice(0, CRICKETS);
        near = near.filter(({ emitter }) => emitter.name !== "crickets").slice(0, NEAREST).concat(crickets);
        const wanted = new Set(near.map(({ emitter }) => emitter));

        for (const [emitter, playing] of this.playing)
        {
            if (wanted.has(emitter)) continue;
            void playing.voice.then(voice => voice?.stop({ seconds: 1.5 }));
            this.playing.delete(emitter);
        }
        for (const { emitter } of near)
        {
            if (this.playing.has(emitter) || !this.sound.has(emitter.name)) continue;
            const voice = this.sound.play(emitter.name, {
                bus: "ambience", loop: true, at: emitter.at, half: emitter.half ?? 4, volume: 0, offset: Math.random() * 6,
            }).then(voice => voice?.fadeTo(this.level(emitter), { seconds: 2 }) ?? null);
            this.playing.set(emitter, { voice, emitter });
        }
    }

    private level(emitter: Emitter) {
        const mix = emitter.name === "frogs" ? this.mix.frogs : emitter.name === "crickets" ? this.mix.crickets * (this.chirping ? 1 : 0) : 1;
        return (emitter.volume ?? 1) * mix;
    }
}
