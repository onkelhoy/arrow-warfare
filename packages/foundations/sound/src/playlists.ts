/** The two lists in `songs.json` played as playlists (it also has `tavern`, see `Taverns`). */
export type PlaylistName = "lobby" | "game";
export type SongList = Record<PlaylistName, string[]>;

/** Seconds for one song to fade into the next. */
const FADE = 1.5;

type Track = { audio: HTMLAudioElement; gain: GainNode; url: string; node: MediaElementAudioSourceNode };

/**
 * Songs stream through an `<audio>` element, so a long song isn't decoded whole into memory. The file is
 * fetched first and played from a blob, which works the same on the dev server and on the static site
 * (only `fetch` is mapped to the site's asset folder there).
 *
 * A playlist plays in a shuffled order, the next song starts when one ends, and switching lists fades
 * the old song out and the new one in.
 */
export class Playlists {
    private list: Promise<SongList>;
    private wanted: PlaylistName | null = null;
    private order: string[] = [];
    private track: Track | null = null;
    private last = "";
    private turn = 0;

    constructor(private context: AudioContext, private output: AudioNode, private folder: string) {
        this.list = load(folder);
    }

    play(name: PlaylistName | null) {
        if (name === this.wanted) return;
        this.wanted = name;
        this.order = [];
        void this.advance();
    }

    next() {
        void this.advance();
    }

    private async advance() {
        const turn = ++this.turn;
        const name = this.wanted;
        this.fadeOut();
        if (!name) return;

        const songs = (await this.list)[name] ?? [];
        if (!songs.length || turn !== this.turn) return;

        if (!this.order.length) this.order = shuffle(songs, this.last);
        const song = this.order.shift()!;
        this.last = song;

        const url = await blob(`${this.folder}/${encodeURIComponent(song)}${/\.\w+$/.test(song) ? "" : ".mp3"}`);
        // the list can change while the song loads
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

        const audio = new Audio(url);
        const node = this.context.createMediaElementSource(audio);
        const gain = this.context.createGain();
        const now = this.context.currentTime;
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(1, now + FADE);
        node.connect(gain).connect(this.output);
        audio.addEventListener("ended", () => turn === this.turn && void this.advance());
        audio.play().catch(error => console.warn("playlist: could not play", song, error));
        this.track = { audio, gain, url, node };
    }

    private fadeOut() {
        const track = this.track;
        if (!track) return;
        this.track = null;

        const now = this.context.currentTime;
        track.gain.gain.cancelScheduledValues(now);
        track.gain.gain.setValueAtTime(track.gain.gain.value, now);
        track.gain.gain.linearRampToValueAtTime(0, now + FADE);
        setTimeout(() => {
            track.audio.pause();
            track.node.disconnect();
            URL.revokeObjectURL(track.url);
        }, FADE * 1000 + 100);
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
