import { Playlists, type PlaylistName } from "./playlists";

export type Volumes = { everything: number; music: number; sounds: number };
export type PlayOptions = { rate?: number; volume?: number; pan?: number };

/** How much of the music is left while it's dipped, for slow motion and the kill cam. */
const MUSIC_DIP = .25;

/**
 * Plain Web Audio: one gain for everything, with one each for music and sounds under it. Sound effects
 * are registered by name and decoded, songs stream from the playlists in `songs.json`.
 */
export class Sound {
    readonly volumes: Volumes = { everything: 1, music: .6, sounds: 1 };
    private context: AudioContext | null = null;
    private master: GainNode | null = null;
    private sounds: GainNode | null = null;
    private music: GainNode | null = null;
    private playlists: Playlists | null = null;
    private files = new Map<string, string[]>();
    private buffers = new Map<string, Promise<(AudioBuffer | null)[]>>();
    private muted = false;
    private dipped = false;
    private hushed = false;
    private wanted: PlaylistName | null = null;

    /** `songs` is where `songs.json` and the songs are, asked for with `fetch`. */
    constructor(private songs = "/audio/songs") { }

    /** A browser only starts audio from a tap, so call this from one. */
    unlock() {
        if (!this.context)
        {
            const context = this.context = new AudioContext();
            this.master = context.createGain();
            this.sounds = context.createGain();
            this.music = context.createGain();
            this.sounds.connect(this.master);
            this.music.connect(this.master);
            this.master.connect(context.destination);
            this.apply();
            this.playlists = new Playlists(context, this.music, this.songs);
            this.playlists.play(this.wanted);
            for (const name of this.files.keys()) this.decodeAll(name);
        }

        if (this.context.state === "suspended") void this.context.resume();
    }

    /** Listens for the first tap or key, and takes itself away after it. */
    unlockOnFirstTap() {
        const events = ["pointerdown", "keydown"];
        const once = () => {
            this.unlock();
            for (const event of events) window.removeEventListener(event, once, true);
        };
        for (const event of events) window.addEventListener(event, once, true);
    }

    get running() {
        return this.context?.state === "running";
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

    /** Sound effects by name, each a list of files of which one is picked at random. */
    register(files: Record<string, string[]>) {
        for (const [name, list] of Object.entries(files))
        {
            this.files.set(name, list);
            if (this.context) this.decodeAll(name);
        }
    }

    async play(name: string, { rate = 1, volume = 1, pan = 0 }: PlayOptions = {}) {
        const { context, sounds } = this;
        if (!context || !sounds) return;

        const options = (await this.buffers.get(name))?.filter(buffer => buffer !== null);
        if (!options?.length) return;

        const source = context.createBufferSource();
        source.buffer = options[Math.floor(Math.random() * options.length)];
        source.playbackRate.value = rate;

        const gain = context.createGain();
        gain.gain.value = volume;
        let last: AudioNode = source.connect(gain);
        if (pan)
        {
            const panner = context.createStereoPanner();
            panner.pan.value = Math.max(-1, Math.min(1, pan));
            last = last.connect(panner);
        }
        last.connect(sounds);
        source.start();
    }

    /** The context and the sounds gain, for effects that are made rather than played from a file. */
    get output() {
        return this.context && this.sounds ? { context: this.context, destination: this.sounds } : null;
    }

    /** Pulls the music down, for slow motion, and lets it back up. */
    dip(value: boolean) {
        this.dipped = value;
        const { context, music } = this;
        if (!context || !music) return;

        music.gain.cancelScheduledValues(context.currentTime);
        music.gain.setTargetAtTime(this.musicLevel(), context.currentTime, .12);
    }

    /** Fades the music to silence (over about `seconds`) and keeps it there, for the fanfare; `false` brings it back. */
    hush(value: boolean, seconds = 1.2) {
        this.hushed = value;
        const { context, music } = this;
        if (!context || !music) return;

        music.gain.cancelScheduledValues(context.currentTime);
        music.gain.setTargetAtTime(this.musicLevel(), context.currentTime, seconds / 4);
    }

    private musicLevel() {
        return this.hushed ? 0 : this.volumes.music * (this.dipped ? MUSIC_DIP : 1);
    }

    private apply() {
        if (this.master) this.master.gain.value = this.muted ? 0 : this.volumes.everything;
        if (this.sounds) this.sounds.gain.value = this.volumes.sounds;
        if (this.music) this.music.gain.value = this.musicLevel();
    }

    private decodeAll(name: string) {
        const list = this.files.get(name) ?? [];
        this.buffers.set(name, Promise.all(list.map(url => this.decode(url))));
    }

    /** A missing or broken file means silence, not a crash. */
    private async decode(url: string) {
        try
        {
            const response = await fetch(url);
            if (!response.ok) return null;
            return await this.context!.decodeAudioData(await response.arrayBuffer());
        }
        catch
        {
            return null;
        }
    }
}
