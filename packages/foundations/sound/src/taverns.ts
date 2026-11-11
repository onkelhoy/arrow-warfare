import type { Sound, Vec } from "./sound";

/** Metres: walking closer than this, a tavern's song takes the music over. */
const REACH = 9;
/** And further than this it gives it back (a little more, so the edge doesn't flicker). */
const LEAVE = REACH + 1.5;
/** Closer than this it's at full: about the tavern's walls (3.5 m from its middle at most). */
const INSIDE = 4;
/** How loud the tavern's song is at the edge of its reach. */
const EDGE_TAVERN = .35;
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
 * time has got to. Phones play one song at a time, so near a tavern its song takes the music over (the game's
 * song pauses and goes on where it was after), heard from the nearest tavern in reach and louder closer in.
 * `clock` is the shared time in ms. Call `update` every frame with where the ears are.
 */
export class Taverns {
    private songs: Promise<{ name: string; length: number }[]>;
    /** The tavern the song is heard from, while one has the music. */
    private at: Vec | null = null;
    private asked: string | null = null;
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
        if (this.at) this.sound.tavernVolume(level(distance(this.at)), this.at);

        this.next -= dt;
        if (this.next > 0) return;
        this.next = PICK;
        let nearest: Vec | null = null;
        for (const at of this.places) if (!nearest || distance(at) < distance(nearest)) nearest = at;
        const near = this.at ? distance(this.at) : Infinity;
        if (!nearest || (this.at ? near > LEAVE && distance(nearest) > REACH : distance(nearest) > REACH))
        {
            if (this.at) this.end();
            return;
        }
        // in reach, or a tavern clearly nearer: the song is heard from there, without starting over
        if (!this.at || (nearest !== this.at && distance(nearest) < near - SWITCH)) this.at = nearest;
        void this.songs.then(songs => this.keep(songs));
    }

    stop() {
        this.stopped = true;
        this.end();
    }

    /** The song the clock is at, asked for (once), and put back on the clock if it's run off (a stall, a hidden tab). */
    private async keep(songs: { name: string; length: number }[]) {
        if (!this.at || this.stopped) return;
        const now = this.now(songs);
        if (!now) return;
        const playing = this.sound.tavernPlaying;
        if (playing?.song === now.name)
        {
            if (Math.abs(playing.at - now.offset) > DRIFT) this.sound.tavernSeek(now.offset);
            return;
        }
        // asked for already, on its way
        if (this.asked === now.name) return;
        this.asked = now.name;
        const url = await this.sound.songUrl(now.name);
        if (!url || !this.at || this.stopped || this.asked !== now.name) return;
        this.sound.tavern({ song: now.name, url, offset: () => this.now(songs)?.name === now.name ? this.now(songs)!.offset : now.offset });
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
        this.at = null;
        this.asked = null;
        this.sound.tavern(null);
    }
}

/** How loud the tavern's song is `distance` metres from the tavern playing, 0..1. */
function level(distance: number) {
    if (distance >= LEAVE) return 0;
    if (distance >= REACH) return EDGE_TAVERN * (LEAVE - distance) / (LEAVE - REACH);
    const t = smooth(Math.max(0, Math.min(1, (REACH - distance) / (REACH - INSIDE))));
    return EDGE_TAVERN + (1 - EDGE_TAVERN) * t;
}
