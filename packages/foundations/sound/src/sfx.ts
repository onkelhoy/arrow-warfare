import type { Sound } from "./sound";

export type SfxName = "creak" | "twang" | "wood" | "ground" | "body" | "kill" | "pant" | "pickup" | "empty" | "whoosh" | "grunt" | "step" | "hop" | "heartbeat" | "stretch";
export type SfxOptions = { volume?: number; pan?: number; rate?: number };

/**
 * The game's sound effects, files listed in `sfx.json` (made by `bin/sfx.mjs`, replace a file to
 * change a sound). Each name has versions, one is picked at random.
 */
export class Sfx {
    constructor(private sound: Sound, folder = "/sfx") {
        fetch(`${folder}/sfx.json`)
            .then(response => response.json() as Promise<Record<string, string[]>>)
            .then(list => sound.register(Object.fromEntries(Object.entries(list).map(([name, files]) => [name, files.map(file => `${folder}/${file}`)]))))
            .catch(() => { /* no sounds, silence */ });
    }

    play(name: SfxName, { volume = 1, pan = 0, rate = 1 }: SfxOptions = {}) {
        if (volume <= .001 || !this.sound.running) return;
        void this.sound.play(name, { volume, pan, rate });
    }
}
