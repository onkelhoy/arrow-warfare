import type { Sound, Vec } from "./sound";

export type SfxName = "creak" | "twang" | "wood" | "ground" | "body" | "kill" | "pant" | "pickup" | "empty" | "whoosh" | "grunt" | "step" | "wetstep" | "hop" | "heartbeat" | "stretch" | "gunshot" | "reload" | "flyby";
/** `at` places it in the world (3D), without it it's in my head. */
export type SfxOptions = { volume?: number; at?: Vec; rate?: number };

/**
 * The game's sound effects, files listed in `sfx.json` (made by `bin/sfx.mjs`, replace a file to
 * change a sound). Each name has versions, one is picked at random.
 */
export class Sfx {
    constructor(private sound: Sound, folder = "/sfx") {
        register(sound, folder);
    }

    play(name: SfxName, { volume = 1, at, rate = 1 }: SfxOptions = {}) {
        if (volume <= .001 || !this.sound.running) return;
        void this.sound.play(name, { volume, at, rate });
    }
}

const registered = new WeakMap<Sound, Set<string>>();

/** Reads `sfx.json` in `folder` and registers its sounds, once per sound and folder. */
export function register(sound: Sound, folder = "/sfx") {
    const done = registered.get(sound) ?? new Set<string>();
    registered.set(sound, done);
    if (done.has(folder)) return;
    done.add(folder);
    fetch(`${folder}/sfx.json`)
        .then(response => response.json() as Promise<Record<string, string[]>>)
        .then(list => sound.register(Object.fromEntries(Object.entries(list).map(([name, files]) => [name, files.map(file => `${folder}/${file}`)]))))
        .catch(() => { /* no sounds, silence */ });
}
