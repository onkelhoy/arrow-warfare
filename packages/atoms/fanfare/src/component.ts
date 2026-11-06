import { CustomElement, html, property, unsafeHTML } from "@papit/web-component";

import sheet from "./style.css" with { type: "css" };
import type { FanfareEvent } from "./types";

/** The kazoo phrases in `asset/audio/`, one is picked at random each time. */
export const FANFARES = [
    "tunetank.com_kazoo-victory-phrase.wav",
    "tunetank.com_kazoo-victory.wav",
    "tunetank.com_kazoo-winning-phrase.wav",
];

/** How long the trumpets take to swing in, before they blow (ms). Matches the CSS. */
const SWING = 650;
/** How long they droop, sad that it's over, before they swing out (ms). */
const DROOP = 900;

/** A long herald trumpet pointing right, its banner hanging under the tube. */
const TRUMPET = `<svg class="trumpet" viewBox="0 0 320 190" aria-hidden="true">
    <g class="banner">
        <path class="cloth" d="M96 52 h110 v78 l-27 -16 l-28 16 l-27 -16 l-28 16 Z"/>
        <path class="trim" d="M96 52 h110 v12 h-110 Z"/>
        <path class="crest" d="M151 72 l14 6 v12 q0 14 -14 20 q-14 -6 -14 -20 v-12 Z"/>
        <path class="cord" d="M100 50 q-4 -10 2 -16 M202 50 q4 -10 -2 -16"/>
    </g>
    <g class="horn">
        <rect class="tube" x="18" y="40" width="210" height="12" rx="6"/>
        <rect class="knob" x="70" y="35" width="12" height="22" rx="4"/>
        <rect class="knob" x="160" y="35" width="12" height="22" rx="4"/>
        <path class="mouth" d="M4 38 h18 v16 h-18 q-6 -8 0 -16 Z"/>
        <g class="bell">
            <path class="flare" d="M222 40 Q262 36 300 6 Q312 46 300 86 Q262 56 222 52 Z"/>
            <ellipse class="rim" cx="301" cy="46" rx="9" ry="40"/>
            <path class="shine" d="M236 42 Q264 36 290 18" />
        </g>
    </g>
    <g class="notes">
        <text x="300" y="30">♪</text>
        <text x="300" y="50">♫</text>
        <text x="300" y="70">♪</text>
    </g>
</svg>`;

/**
 * A short silly fanfare: two herald trumpets with banners swing up from the sides of the container, blow a
 * kazoo victory (one of three, at random), droop a bit sadly and swing back out. CSS and an SVG, no canvas.
 * Put it over something, it fills its positioned parent and never takes a tap.
 */
export class Fanfare extends CustomElement {
    static sheet = sheet;

    /** 0..1. */
    @property({ type: Number }) volume: number = 1;
    /** Where the audio files are served. */
    @property({ type: String }) folder: string = "/audio";
    /** Stay up after the sound instead of swinging back out. */
    @property({ type: Boolean }) stay: boolean = false;

    private sounds = new Map<string, Promise<string | null>>();
    private timers: number[] = [];
    private audio: HTMLAudioElement | null = null;
    private source: AudioBufferSourceNode | null = null;
    private buffers = new Map<string, Promise<AudioBuffer | null>>();
    /** An unlocked Web Audio output to play through. Phones (iOS) often refuse an `<audio>` started outside a tap. */
    output: { context: AudioContext; destination: AudioNode } | null = null;

    connectedCallback() {
        super.connectedCallback();
        // fetched early so the toot comes on time; through fetch, so a static build's base path works
        for (const file of FANFARES) this.load(file);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this.stop();
    }

    /** Swing in, toot, droop, swing out. Resolves when it's done (or straight after the toot with `stay`). */
    async play() {
        this.stop();
        const file = FANFARES[Math.floor(Math.random() * FANFARES.length)];
        this.setAttribute("state", "up");
        this.dispatch("fanfare-start", file);
        await this.wait(SWING);

        this.setAttribute("state", "blowing");
        const length = await this.toot(file);
        await this.wait(length);

        this.setAttribute("state", "droop");
        this.dispatch("fanfare-end", file);
        if (this.stay) return;
        await this.wait(DROOP);
        this.lower();
    }

    /** Back out of view, without a sound. */
    lower() {
        this.stop();
        this.setAttribute("state", "down");
        this.wait(SWING).then(() => {
            if (this.getAttribute("state") === "down") this.removeAttribute("state");
        });
    }

    private stop() {
        for (const timer of this.timers) clearTimeout(timer);
        this.timers.length = 0;
        this.audio?.pause();
        this.audio = null;
        try { this.source?.stop(); } catch { /* not started */ }
        this.source = null;
    }

    private wait(ms: number) {
        return new Promise<void>(resolve => this.timers.push(window.setTimeout(resolve, ms)));
    }

    private async tootThrough({ context, destination }: { context: AudioContext; destination: AudioNode }, file: string, url: string) {
        if (!this.buffers.has(file)) this.buffers.set(file, fetch(url).then(r => r.arrayBuffer()).then(data => context.decodeAudioData(data)).catch(() => null));
        const buffer = await this.buffers.get(file);
        if (!buffer) return 2200;
        if (context.state === "suspended") await context.resume().catch(() => {});
        const source = context.createBufferSource();
        source.buffer = buffer;
        const gain = context.createGain();
        gain.gain.value = Math.max(0, Math.min(1, this.volume));
        source.connect(gain).connect(destination);
        source.start();
        this.source = source;
        return Math.max(800, buffer.duration * 1000);
    }

    /** Plays it, gives how long it lasts in ms (a guess when it can't play). */
    private async toot(file: string) {
        const url = await this.load(file);
        if (!url || this.volume <= 0) return 2200;
        if (this.output) return this.tootThrough(this.output, file, url);
        const audio = new Audio(url);
        audio.volume = Math.max(0, Math.min(1, this.volume));
        this.audio = audio;
        try
        {
            await audio.play();
        }
        catch
        {
            return 2200;
        }
        if (!Number.isFinite(audio.duration) || !audio.duration) await new Promise(resolve => audio.addEventListener("loadedmetadata", resolve, { once: true }));
        return Math.max(800, (audio.duration - audio.currentTime) * 1000 || 2200);
    }

    private load(file: string) {
        let found = this.sounds.get(file);
        if (!found)
        {
            found = fetch(`${this.folder}/${encodeURIComponent(file)}`)
                .then(response => response.ok ? response.blob() : null)
                .then(blob => blob ? URL.createObjectURL(blob) : null)
                .catch(() => null);
            this.sounds.set(file, found);
        }
        return found;
    }

    private dispatch(name: "fanfare-start" | "fanfare-end", file: string) {
        this.dispatchEvent(new CustomEvent<FanfareEvent>(name, { detail: { file } }));
    }

    render() {
        return html`
            <div class="side left" part="left">${unsafeHTML(TRUMPET)}</div>
            <div class="side right" part="right">${unsafeHTML(TRUMPET)}</div>
        `;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "aw-fanfare": Fanfare;
    }
}
