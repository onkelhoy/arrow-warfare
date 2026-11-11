/** The two lists in `songs.json` played as playlists (it also has `tavern`, see `Taverns`). */
export type PlaylistName = "lobby" | "game";
export type SongList = Record<PlaylistName, string[]>;

/** Seconds a song fades out before the next one (or a tavern's) comes in. */
const FADE = 1.2;
/** Seconds a tavern's song takes to fade in or out when walking in or out of its reach. */
const TAVERN_FADE = .8;

type Position = { x: number; y: number; z: number };
/** What the one element plays: a song of the playlist, or a tavern's at its place in the shared clock. */
type Track = { kind: "list" | "tavern"; song: string; url: string };

/**
 * All music goes through ONE `<audio>` element. Phones (iOS) play only one media element at a time and only
 * start one from a tap, so two songs at once (the game's and a tavern's) left one of them silent. The element
 * is started from a tap once (`wake`), after that it may switch songs by itself.
 *
 * The playlist plays in a shuffled order, the next song starts when one ends, a new list fades the old song
 * out first. A tavern (`tavern`) takes the element over: the game's song is paused where it was and picked
 * up again from there once the tavern is left. The tavern's song goes through a panner, so it's heard from
 * the tavern's side, and its loudness follows `tavernVolume`.
 */
export class Playlists {
    private list: Promise<SongList>;
    private wanted: PlaylistName | null = null;
    private order: string[] = [];
    private last = "";
    private turn = 0;
    private element = new Audio();
    /** To the music bus (the playlist), and through the panner to the tavern bus. */
    private direct: GainNode;
    private placed: GainNode;
    private panner: PannerNode;
    private track: Track | null = null;
    /** The playlist's song while a tavern has the element, and the second it was at. */
    private paused: { track: Track; at: number } | null = null;
    private tavernWanted: { song: string; url: string; offset: () => number } | null = null;
    private tavernLevel = 0;
    /** The element should be playing (a tap starts it again when the phone stopped it). */
    private live = false;

    constructor(private context: AudioContext, music: AudioNode, tavern: AudioNode, private folder: string) {
        this.list = load(folder);
        this.element.preload = "auto";
        this.element.setAttribute("playsinline", "");
        const source = context.createMediaElementSource(this.element);
        this.direct = context.createGain();
        this.placed = context.createGain();
        this.direct.gain.value = 0;
        this.placed.gain.value = 0;
        this.panner = context.createPanner();
        this.panner.panningModel = "equalpower";
        this.panner.refDistance = 1;
        this.panner.rolloffFactor = 0;
        source.connect(this.direct).connect(music);
        source.connect(this.placed).connect(this.panner).connect(tavern);
        this.element.addEventListener("ended", () => {
            if (this.track?.kind === "list") void this.advance();
            // a tavern's song ran out: `Taverns` asks for the next one
            else if (this.track?.kind === "tavern") this.track = null;
        });
    }

    play(name: PlaylistName | null) {
        if (name === this.wanted) return;
        this.wanted = name;
        this.order = [];
        this.paused = null;
        if (this.track?.kind !== "tavern") void this.advance();
    }

    next() {
        if (this.track?.kind !== "tavern") void this.advance();
    }

    /** From a tap: starts the element if a phone stopped it (or never let it start). */
    wake() {
        if (this.live && this.element.paused && this.element.src) this.element.play().catch(() => { /* the next tap */ });
    }

    /**
     * A tavern's song takes the element (`null` gives it back to the playlist). `offset` says where in the song
     * the shared clock is, asked when it starts. `url` is the song's, fetched already.
     */
    tavern(song: { song: string; url: string; offset: () => number } | null) {
        if (song?.song === this.tavernWanted?.song && song?.url === this.tavernWanted?.url) return;
        this.tavernWanted = song;
        void (song ? this.toTavern(song) : this.fromTavern());
    }

    /** How loud the tavern's song is (0..1), and where it's heard from. */
    tavernVolume(volume: number, at?: Position) {
        this.tavernLevel = volume;
        if (this.track?.kind === "tavern") this.ramp(this.placed, volume, .3);
        if (at)
        {
            const now = this.context.currentTime;
            this.panner.positionX.setValueAtTime(at.x, now);
            this.panner.positionY.setValueAtTime(at.y, now);
            this.panner.positionZ.setValueAtTime(at.z, now);
        }
    }

    tavernSeek(seconds: number) {
        if (this.track?.kind !== "tavern") return;
        try { this.element.currentTime = Math.max(0, seconds); } catch { /* not seekable yet */ }
    }

    /** Seconds into the tavern's song now, or null when it isn't the tavern's. */
    get tavernAt() {
        return this.track?.kind === "tavern" ? this.element.currentTime : null;
    }

    /** The tavern's song playing now. */
    get tavernSong() {
        return this.track?.kind === "tavern" ? this.track.song : null;
    }

    private async toTavern(song: { song: string; url: string; offset: () => number }) {
        const turn = ++this.turn;
        if (this.track?.kind === "list") this.paused = { track: this.track, at: this.element.currentTime };
        await this.fadeOut(this.track?.kind === "tavern" ? TAVERN_FADE / 2 : TAVERN_FADE);
        if (turn !== this.turn) return;
        this.start({ kind: "tavern", song: song.song, url: song.url }, song.offset());
        this.ramp(this.placed, this.tavernLevel, TAVERN_FADE);
    }

    private async fromTavern() {
        const turn = ++this.turn;
        if (this.track?.kind === "tavern")
        {
            await this.fadeOut(TAVERN_FADE);
            if (turn !== this.turn) return;
            this.track = null;
        }
        const back = this.paused;
        this.paused = null;
        if (back && this.wanted)
        {
            this.start(back.track, back.at);
            this.ramp(this.direct, 1, FADE);
        }
        // the tavern never got the element: the song just comes back up
        else if (this.track?.kind === "list" && !this.element.paused) this.ramp(this.direct, 1, FADE);
        else void this.advance();
    }

    private async advance() {
        const turn = ++this.turn;
        const name = this.wanted;
        await this.fadeOut(FADE);
        if (turn !== this.turn) return;
        if (!name)
        {
            this.stopElement();
            return;
        }

        const songs = (await this.list)[name] ?? [];
        if (!songs.length || turn !== this.turn) return;

        if (!this.order.length) this.order = shuffle(songs, this.last);
        const song = this.order.shift()!;
        this.last = song;

        const url = await blob(`${this.folder}/${encodeURIComponent(song)}${/\.\w+$/.test(song) ? "" : ".mp3"}`);
        // the list (or a tavern) took over while the song loaded
        if (turn !== this.turn)
        {
            if (url) URL.revokeObjectURL(url);
            return;
        }
        if (!url)
        {
            // a missing song is skipped, unless it's the only one
            if (songs.length > 1) setTimeout(() => turn === this.turn && void this.advance(), 500);
            return;
        }
        this.start({ kind: "list", song, url }, 0);
        this.ramp(this.direct, 1, FADE);
    }

    /** The element on to `track` from `at` seconds, both paths silent: the caller fades one in. */
    private start(track: Track, at: number) {
        const old = this.track;
        // a playlist song's blob is kept while a tavern has the element, to go back to it
        if (old && old.kind === "list" && old.url !== track.url && this.paused?.track !== old) URL.revokeObjectURL(old.url);
        this.track = track;
        this.ramp(this.direct, 0, 0);
        this.ramp(this.placed, 0, 0);
        const element = this.element;
        if (element.src !== track.url) element.src = track.url;
        const seek = () => {
            try { element.currentTime = Math.max(0, at); } catch { /* not seekable yet */ }
        };
        if (element.readyState >= 1) seek();
        else element.addEventListener("loadedmetadata", seek, { once: true });
        this.live = true;
        element.play().catch(error => console.warn("music: could not play (a tap starts it)", track.song, error));
    }

    private stopElement() {
        this.live = false;
        this.element.pause();
        if (this.track?.kind === "list" && this.paused?.track !== this.track) URL.revokeObjectURL(this.track.url);
        this.track = null;
    }

    /** Both paths down to silence over `seconds`, then the element pauses. */
    private fadeOut(seconds: number) {
        if (!this.track || this.element.paused) return Promise.resolve();
        this.ramp(this.direct, 0, seconds);
        this.ramp(this.placed, 0, seconds);
        return new Promise<void>(done => setTimeout(() => {
            this.element.pause();
            done();
        }, seconds * 1000 + 30));
    }

    private ramp(gain: GainNode, to: number, seconds: number) {
        const now = this.context.currentTime, param = gain.gain;
        param.cancelScheduledValues(now);
        param.setValueAtTime(param.value, now);
        if (seconds <= 0) param.setValueAtTime(to, now);
        else param.linearRampToValueAtTime(to, now + seconds);
    }
}

/** `songs.json`, with anything that isn't a list of names left out. */
async function load(folder: string): Promise<SongList> {
    const empty: SongList = { lobby: [], game: [] };
    try
    {
        const response = await fetch(`${folder}.json`);
        if (!response.ok) return empty;
        const raw = await response.json();
        const names = (value: unknown) => Array.isArray(value) ? value.filter((name): name is string => typeof name === "string" && !!name) : [];
        return { lobby: names(raw?.lobby), game: names(raw?.game) };
    }
    catch
    {
        console.warn("playlist: no songs.json");
        return empty;
    }
}

async function blob(url: string) {
    try
    {
        const response = await fetch(url);
        if (!response.ok) return null;
        return URL.createObjectURL(await response.blob());
    }
    catch
    {
        return null;
    }
}

/** A new order, and the song that just played doesn't come first again. */
function shuffle(songs: string[], last: string) {
    const order = [...songs];
    for (let i = order.length - 1; i > 0; i--)
    {
        const j = Math.floor(Math.random() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
    }
    if (order.length > 1 && order[0] === last) order.push(order.shift()!);
    return order;
}
