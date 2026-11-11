import { AudioMixer, type Voice } from "@papit/audio";
import { Playlists, type PlaylistName } from "./playlists";

export type Volumes = { everything: number; music: number; sounds: number; ambience: number };
export type Vec = readonly [number, number, number] | number[];
/** `at` places it in the world, heard from where `listen` last put the ears. Without it, it's in my head. */
/**
 * `half` is the distance where it's half as loud, `offset` seconds into it (wrapped, for loops). `reach` instead
 * fades it out to silence at that many metres (full up to `near`), for small sounds like steps.
 */
export type PlayOptions = { rate?: number; volume?: number; at?: Vec; half?: number; reach?: number; near?: number; loop?: boolean; offset?: number; fadeIn?: number; bus?: "sfx" | "ambience" };

/** How much of the music is left while it's dipped, for slow motion and the kill cam. */
const MUSIC_DIP = .25;
/** And of the ambience. */
const AMBIENCE_DIP = .4;
/** The distance where a sound is half as loud, in metres. */
const HALF = 9;

/**
 * The game's audio on `@papit/audio`: a master, with music, ambience and sounds buses under it. Sound
 * effects are registered by name, with versions of which one is picked at random. Songs stream from the
 * playlists in `songs.json`. Sounds with `at` are placed in 3D, heard from `listen`.
 */
export class Sound {
    readonly volumes: Volumes = { everything: 1, music: .6, sounds: 1, ambience: .8 };
    readonly mixer: AudioMixer;
    private playlists: Playlists | null = null;
    private files = new Map<string, string[]>();
    private ready = new Map<string, Promise<string[]>>();
    private decoded = new Set<string>();
    private lengths = new Map<string, number>();
    private muted = false;
    private dipped = false;
    private hushed = false;
    private urls = new Map<string, Promise<string | null>>();
    private songLengths = new Map<string, Promise<number>>();
    private wanted: PlaylistName | null = null;

    /** `songs` is where `songs.json` and the songs are, asked for with `fetch`. */
    constructor(private songs = "/audio/songs") {
        this.mixer = new AudioMixer({ buses: ["music", "ambience", "sfx"] });
        this.mixer.addEventListener("statechange", () => this.started());
        this.apply(0);
        // the mixer gives up after its first gesture, and iOS refuses a resume from pointerdown, after an app
        // switch or a call ("interrupted"): every later tap tries again while it isn't running (bugs.md)
        const wake = () => {
            const context = this.mixer.context as AudioContext;
            if (context.state !== "running" && this.mixer.state !== "closed") this.unlock();
            // the music's element too: a phone only starts it from a tap
            this.playlists?.wake();
        };
        for (const type of ["touchend", "click", "keydown"]) window.addEventListener(type, wake, true);
    }

    /** A browser only starts audio from a tap, so call this from one. The mixer also does it on the first tap. */
    unlock() {
        void this.mixer.unlock().catch(() => { /* the next tap tries again */ });
    }

    /** The mixer listens for the first tap or key by itself, this stays for callers. */
    unlockOnFirstTap() { }

    get running() {
        return this.mixer.state === "running";
    }

    get mute() {
        return this.muted;
    }

    set mute(value: boolean) {
        this.muted = value;
        this.apply();
    }

    setVolume(name: keyof Volumes, value: number) {
        this.volumes[name] = value;
        this.apply();
    }

    /** Which playlist plays, `null` for none. Before the first tap it waits, then starts. */
    playlist(name: PlaylistName | null) {
        this.wanted = name;
        this.playlists?.play(name);
    }

    /** The playlist playing now. */
    get playing() {
        return this.wanted;
    }

    /** Skips to the next song of the playlist. */
    next() {
        this.playlists?.next();
    }

    /** Sounds by name, each a list of files of which one is picked at random. */
    register(files: Record<string, string[]>) {
        for (const [name, list] of Object.entries(files))
        {
            this.files.set(name, list);
            this.ready.set(name, this.decodeAll(name, list));
        }
    }

    /** Whether `name` is decoded and can play now. */
    has(name: string) {
        return this.decoded.has(name);
    }

    /** Plays one version of `name`. Resolves to its voice, or `null` when it can't play (unknown, broken, locked). */
    async play(name: string, { rate = 1, volume = 1, at, half = HALF, reach, near = 2, loop = false, offset = 0, fadeIn, bus = "sfx" }: PlayOptions = {}): Promise<Voice | null> {
        const ids = await this.ready.get(name);
        if (!ids?.length || this.mixer.state === "closed") return null;
        const id = ids[Math.floor(Math.random() * ids.length)];
        return this.mixer.play(id, {
            bus, loop, rate, volume, fadeIn, offset: offset % (this.lengths.get(id) || 1),
            // inverse: 1 / (1 + (distance - 1) / half)
            spatial: !at ? undefined : reach
                // linear: full up to `near`, silent at `reach`
                ? { position: { x: at[0], y: at[1], z: at[2] }, distanceModel: "linear", refDistance: near, maxDistance: reach, rolloff: 1, panningModel: "equalpower" }
                : { position: { x: at[0], y: at[1], z: at[2] }, refDistance: 1, rolloff: 1 / half, panningModel: "equalpower" },
        });
    }

    /** Puts the ears at `x, y, z` looking along `forward`, every frame. */
    listen(at: Vec, forward: Vec, up: Vec = [0, 1, 0]) {
        this.mixer.setListener({ x: at[0], y: at[1], z: at[2] }, { x: forward[0], y: forward[1], z: forward[2] }, { x: up[0], y: up[1], z: up[2] });
    }

    /** The context and the sounds bus, for effects that are made rather than played from a file. */
    get output() {
        return this.running ? { context: this.mixer.context as AudioContext, destination: this.mixer.bus("sfx").gain } : null;
    }

    /** Where the songs are (`songs.json` is next to it). */
    get songFolder() {
        return this.songs;
    }

    /**
     * A song fetched as a blob (so it plays on the static site too, see `Playlists`), kept: resolves to its
     * url, or null.
     */
    songUrl(name: string) {
        let found = this.urls.get(name);
        if (!found)
        {
            found = fetch(`${this.songs}/${encodeURIComponent(name)}${/\.\w+$/.test(name) ? "" : ".mp3"}`)
                .then(async response => response.ok ? URL.createObjectURL(await response.blob()) : null)
                .catch(() => null);
            this.urls.set(name, found);
        }
        return found;
    }

    /** Seconds a song lasts (fetching it, see `songUrl`), 0 when it can't be read. */
    songLength(name: string) {
        let found = this.songLengths.get(name);
        if (!found)
        {
            found = this.songUrl(name).then(url => {
                if (!url) return 0;
                return new Promise<number>(done => {
                    const element = new Audio();
                    element.preload = "metadata";
                    element.onloadedmetadata = () => done(Number.isFinite(element.duration) ? element.duration : 0);
                    element.onerror = () => done(0);
                    element.src = url;
                });
            });
            this.songLengths.set(name, found);
        }
        return found;
    }

    /**
     * A tavern's song takes the music over (one song at a time, phones can't play two), `null` gives it back
     * to the playlist, which goes on where it was. See `Playlists.tavern`.
     */
    tavern(song: Parameters<Playlists["tavern"]>[0]) {
        this.playlists?.tavern(song);
    }

    /** How loud the tavern's song is (0..1) and where it's heard from. */
    tavernVolume(volume: number, at?: Vec) {
        this.playlists?.tavernVolume(volume, at ? { x: at[0], y: at[1], z: at[2] } : undefined);
    }

    /** Puts the tavern's song at `seconds` (back on the shared clock). */
    tavernSeek(seconds: number) {
        this.playlists?.tavernSeek(seconds);
    }

    /** The tavern's song playing now and the second it's at, or null. */
    get tavernPlaying() {
        const song = this.playlists?.tavernSong, at = this.playlists?.tavernAt;
        return song && at != null ? { song, at } : null;
    }

    /** Pulls the music and the ambience down, for slow motion, and lets them back up. */
    dip(value: boolean) {
        this.dipped = value;
        this.apply(.4);
    }

    /** Fades the music to silence (over about `seconds`) and keeps it there, for the fanfare; `false` brings it back. */
    hush(value: boolean, seconds = 1.2) {
        this.hushed = value;
        this.mixer.bus("music").fadeTo(this.musicLevel(), { seconds });
        this.mixer.bus("tavern").fadeTo(this.tavernLevel(), { seconds });
    }

    private musicLevel() {
        return this.hushed ? 0 : this.volumes.music * (this.dipped ? MUSIC_DIP : 1);
    }

    /** Taverns' songs are music too, on their own bus. */
    private tavernLevel() {
        return this.hushed ? 0 : this.volumes.music * (this.dipped ? MUSIC_DIP : 1);
    }

    private apply(seconds = 0) {
        const { mixer, volumes } = this;
        mixer.master.fadeTo(this.muted ? 0 : volumes.everything, { seconds: 0 });
        mixer.bus("sfx").fadeTo(volumes.sounds, { seconds: 0 });
        mixer.bus("ambience").fadeTo(volumes.ambience * (this.dipped ? AMBIENCE_DIP : 1), { seconds });
        mixer.bus("music").fadeTo(this.musicLevel(), { seconds });
        mixer.bus("tavern").fadeTo(this.tavernLevel(), { seconds });
    }

    /** The songs start once audio runs, an `<audio>` element won't play before a tap. */
    private started() {
        if (this.playlists || this.mixer.state !== "running") return;
        this.playlists = new Playlists(this.mixer.context as AudioContext, this.mixer.bus("music").gain, this.mixer.bus("tavern").gain, this.songs);
        this.playlists.play(this.wanted);
    }

    /** Decodes every version, the ones that load are added to the mixer as `name#i`. */
    private async decodeAll(name: string, list: string[]) {
        const buffers = await Promise.all(list.map(url => this.decode(url)));
        const ids: string[] = [];
        buffers.forEach((buffer, i) => {
            if (!buffer || this.files.get(name) !== list) return;
            const id = `${name}#${i}`;
            this.mixer.add(id, buffer);
            this.lengths.set(id, buffer.duration);
            ids.push(id);
        });
        if (ids.length) this.decoded.add(name);
        return ids;
    }

    /** A missing or broken file means silence, not a crash. */
    private async decode(url: string) {
        try
        {
            const response = await fetch(url);
            if (!response.ok) return null;
            return await this.mixer.context.decodeAudioData(await response.arrayBuffer());
        }
        catch
        {
            return null;
        }
    }
}
