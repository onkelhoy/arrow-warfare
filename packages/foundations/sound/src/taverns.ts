import type { Voice } from "@papit/audio";
import type { Sound, Vec } from "./sound";

/** Metres: a tavern's song starts to be heard here. */
const REACH = 36;
/** The first metres in: the game's music drops fast to about half, the tavern comes in a little louder. */
const EDGE = 5;
/** Closer than this it's the tavern alone. */
const INSIDE = 3;
/** How much of the game's music is left past the edge, and how loud the tavern is there. */
const HALF_MUSIC = .5, EDGE_TAVERN = .6;
/** Seconds between looking for the nearest tavern. */
const PICK = .5;
/** Metres another tavern must be nearer than the one playing before the song moves to it. */
const SWITCH = 3;
/** Seconds the song may run off the clock before it's put back. */
const DRIFT = 1.5;

const smooth = (t: number) => t * t * (3 - 2 * t);

/**
 * The taverns' music (`tavern` in `songs.json`): one song at a time for the whole game, on the shared clock, so
 * every phone hears the same song at the same place in it, and walking away and back picks it up where the
 * time has got to. It plays from the nearest tavern in reach (one voice, moved when another is clearly nearer),
 * so between two taverns it's still the one song. The game's music stays: at the edge of the reach it drops to
 * about half while the tavern comes in a little louder, then they blend slowly, the tavern alone only right at
 * it. `clock` is the shared time in ms. Call `update` every frame with where the ears are.
 */
export class Taverns {
    private songs: Promise<{ name: string; length: number }[]>;
    private playing: { at: Vec; voice: Voice; name: string; started: number; offset: number } | null = null;
    private starting = false;
    private next = 0;
    private stopped = false;

    constructor(private sound: Sound, private places: Vec[], private clock: () => number = () => Date.now()) {
        this.songs = places.length ? fetch(`${sound.songFolder}.json`)
            .then(response => response.ok ? response.json() : {})
            .then((raw: { tavern?: unknown }) => Array.isArray(raw?.tavern) ? raw.tavern.filter((name): name is string => typeof name === "string") : [])
            .then(names => Promise.all(names.map(async name => ({ name, length: await sound.songLength(name) }))))
            .then(songs => songs.filter(song => song.length > 0))
            .catch(() => []) : Promise.resolve([]);
    }

    update(dt: number, ears: Vec) {
        if (this.stopped || !this.places.length || !this.sound.running) return;
        const distance = (at: Vec) => Math.hypot(at[0] - ears[0], at[1] - ears[1], at[2] - ears[2]);
        const near = this.playing ? distance(this.playing.at) : Infinity;
        const [music, tavern] = levels(near);
        this.sound.duck(1 - music);
        this.playing?.voice.fadeTo(tavern, { seconds: .3 });

        this.next -= dt;
        if (this.next > 0) return;
        this.next = PICK;
        let nearest: Vec | null = null;
        for (const at of this.places) if (distance(at) < REACH + 2 && (!nearest || distance(at) < distance(nearest))) nearest = at;
        if (!nearest)
        {
            if (this.playing && near > REACH + 4) this.end();
            return;
        }
        if (!this.playing)
        {
            if (!this.starting) void this.start(nearest);
            return;
        }
        // the song moves to a tavern clearly nearer, without starting over
        if (nearest !== this.playing.at && distance(nearest) < near - SWITCH)
        {
            this.playing.at = nearest;
            this.playing.voice.setPosition({ x: nearest[0], y: nearest[1], z: nearest[2] });
        }
        // put back on the clock if it's run off (a stall, a hidden tab), or on to the next song
        void this.songs.then(songs => {
            const playing = this.playing;
            if (!playing) return;
            const now = this.now(songs);
            const ran = playing.offset + (performance.now() - playing.started) / 1000;
            if (!now || now.name !== playing.name || Math.abs(now.offset - ran) > DRIFT) this.restart(playing.at);
        });
    }

    stop() {
        this.stopped = true;
        this.playing?.voice.stop({ seconds: 1.5 });
        this.playing = null;
        this.sound.duck(0);
    }

    /** The song and the second in it the shared clock is at: the songs one after the other, round and round. */
    private now(songs: { name: string; length: number }[]) {
        const total = songs.reduce((sum, song) => sum + song.length, 0);
        if (!total) return null;
        let at = (this.clock() / 1000) % total;
        for (const song of songs)
        {
            if (at < song.length) return { name: song.name, offset: at };
            at -= song.length;
        }
        return null;
    }

    private end() {
        this.playing?.voice.stop({ seconds: 2 });
        this.playing = null;
    }

    private restart(at: Vec) {
        this.end();
        void this.start(at);
    }

    private async start(at: Vec) {
        this.starting = true;
        const songs = await this.songs;
        const now = this.now(songs);
        const id = now ? await this.sound.song(now.name) : null;
        this.starting = false;
        if (!id || !now || this.stopped || this.playing) return;
        // the clock moved on while it loaded
        const offset = this.now(songs)?.name === now.name ? this.now(songs)!.offset : now.offset;
        const voice = this.sound.mixer.play(id, {
            bus: "tavern", volume: 0, offset,
            // placed for its direction only, how loud it is follows `levels`
            spatial: { position: { x: at[0], y: at[1], z: at[2] }, refDistance: 1, rolloff: 0, panningModel: "equalpower" },
        });
        voice.onended = () => {
            if (this.playing?.voice !== voice) return;
            this.playing = null;
        };
        this.playing = { at, voice, name: now.name, started: performance.now(), offset };
    }
}

/** How loud the game's music and the tavern are `distance` metres from the tavern playing, 0..1 each. */
function levels(distance: number): [number, number] {
    if (distance >= REACH) return [1, 0];
    if (distance > REACH - EDGE)
    {
        const t = smooth((REACH - distance) / EDGE);
        return [1 - (1 - HALF_MUSIC) * t, EDGE_TAVERN * t];
    }
    const t = smooth(Math.max(0, Math.min(1, (REACH - EDGE - distance) / (REACH - EDGE - INSIDE))));
    return [HALF_MUSIC * (1 - t), EDGE_TAVERN + (1 - EDGE_TAVERN) * t];
}
