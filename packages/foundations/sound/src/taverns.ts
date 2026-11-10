import type { Voice } from "@papit/audio";
import type { Sound, Vec } from "./sound";

/** Metres: a tavern's song is heard from this close, and fades out past it. */
const REACH = 32;
/** Closer than this the game's music is all but gone. */
const INSIDE = 7;
/** Seconds between looking for the nearest tavern. */
const PICK = .5;

/**
 * Songs from the taverns (`tavern` in `songs.json`), each tavern playing in 3D from where it stands. Walking up
 * to one blends its song in and the game's music down; walking away blends them back. Only the nearest
 * tavern plays. Call `update` every frame with where the ears are.
 */
export class Taverns {
    private list: Promise<string[]>;
    private playing: { at: Vec; voice: Voice } | null = null;
    private starting: Vec | null = null;
    private next = 0;
    private turn = Math.floor(Math.random() * 8);
    private stopped = false;

    constructor(private sound: Sound, private places: Vec[]) {
        this.list = places.length ? fetch(`${sound.songFolder}.json`)
            .then(response => response.ok ? response.json() : {})
            .then((raw: { tavern?: unknown }) => Array.isArray(raw?.tavern) ? raw.tavern.filter((name): name is string => typeof name === "string") : [])
            .catch(() => []) : Promise.resolve([]);
    }

    update(dt: number, ears: Vec) {
        if (this.stopped || !this.places.length || !this.sound.running) return;
        const distance = (at: Vec) => Math.hypot(at[0] - ears[0], at[1] - ears[1], at[2] - ears[2]);
        // the music dips smoothly with how close the playing tavern is
        const near = this.playing ? distance(this.playing.at) : Infinity;
        this.sound.duck(near >= REACH ? 0 : Math.min(1, (REACH - near) / (REACH - INSIDE)));

        this.next -= dt;
        if (this.next > 0) return;
        this.next = PICK;
        let nearest: Vec | null = null;
        for (const at of this.places) if (distance(at) < REACH + 4 && (!nearest || distance(at) < distance(nearest))) nearest = at;
        if (this.playing && this.playing.at !== nearest)
        {
            this.playing.voice.stop({ seconds: 2 });
            this.playing = null;
        }
        if (nearest && !this.playing && this.starting !== nearest) void this.start(nearest);
    }

    stop() {
        this.stopped = true;
        this.playing?.voice.stop({ seconds: 1.5 });
        this.playing = null;
        this.sound.duck(0);
    }

    /** The next song of the list at `at`, and the one after when it ends. */
    private async start(at: Vec) {
        this.starting = at;
        const songs = await this.list;
        const id = songs.length ? await this.sound.song(songs[this.turn++ % songs.length]) : null;
        if (this.starting !== at) return;
        this.starting = null;
        if (!id || this.stopped) return;
        const voice = this.sound.mixer.play(id, {
            bus: "tavern", volume: 0,
            spatial: { position: { x: at[0], y: at[1], z: at[2] }, refDistance: 4, rolloff: .9, maxDistance: 200, panningModel: "equalpower" },
        });
        voice.fadeTo(1, { seconds: 2 });
        voice.onended = () => {
            if (this.playing?.voice !== voice) return;
            this.playing = null;
            void this.start(at);
        };
        this.playing = { at, voice };
    }
}
