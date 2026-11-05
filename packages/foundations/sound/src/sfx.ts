import type { Sound } from "./sound";

export type SfxName = "creak" | "twang" | "wood" | "ground" | "body" | "kill" | "pant" | "pickup" | "empty";
export type SfxOptions = { volume?: number; pan?: number; rate?: number };

/**
 * The game's sound effects, made with Web Audio rather than played from files: stand-ins until real
 * recordings come. Each is a short burst of oscillators and filtered noise.
 */
export class Sfx {
    private noise: AudioBuffer | null = null;

    constructor(private sound: Sound) { }

    play(name: SfxName, { volume = 1, pan = 0, rate = 1 }: SfxOptions = {}) {
        const output = this.sound.output;
        if (!output || !this.sound.running || volume <= .001) return;
        const { context } = output;
        const now = context.currentTime;
        const gain = context.createGain();
        gain.gain.value = volume;
        const into: AudioNode = gain;
        if (pan)
        {
            const panner = context.createStereoPanner();
            panner.pan.value = Math.max(-1, Math.min(1, pan));
            gain.connect(panner);
            panner.connect(output.destination);
        }
        else gain.connect(output.destination);

        switch (name)
        {
            case "creak":
                this.burst(into, now, .05, 1400 * rate, 6, .25);
                break;
            case "twang":
                this.tone(into, now, "triangle", 190 * rate, 70 * rate, .22, .5);
                this.tone(into, now, "sawtooth", 380 * rate, 120 * rate, .08, .12);
                this.burst(into, now, .05, 3000, 1, .3);
                break;
            case "wood":
                this.tone(into, now, "sine", 160 * rate, 70, .16, .7);
                this.burst(into, now, .04, 900, 2, .5);
                break;
            case "ground":
                this.tone(into, now, "sine", 90 * rate, 50, .12, .5);
                this.burst(into, now, .07, 500, 1, .35);
                break;
            case "body":
                this.tone(into, now, "sine", 120 * rate, 60, .14, .8);
                this.burst(into, now, .06, 700, 1.5, .4);
                break;
            case "kill":
                // the big deep thunk: a falling sub, a knock and a little ring after
                this.tone(into, now, "sine", 85, 32, .55, 1);
                this.tone(into, now, "triangle", 170, 60, .2, .5);
                this.burst(into, now, .05, 1200, 2, .6);
                this.tone(into, now + .04, "sine", 660, 640, .35, .08);
                break;
            case "pant":
                for (let i = 0; i < 4; i++) this.burst(into, now + i * .42, .3, i % 2 ? 900 : 1300, .7, .25, true);
                break;
            case "pickup":
                this.tone(into, now, "triangle", 520, 900, .09, .3);
                break;
            case "empty":
                this.tone(into, now, "square", 140, 120, .05, .08);
                break;
        }
        setTimeout(() => gain.disconnect(), 2500);
    }

    /** A pitch sliding from `from` to `to` Hz, fading out over `length` seconds. */
    private tone(into: AudioNode, at: number, type: OscillatorType, from: number, to: number, length: number, volume: number) {
        const context = into.context as AudioContext;
        const oscillator = context.createOscillator();
        oscillator.type = type;
        oscillator.frequency.setValueAtTime(from, at);
        oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, to), at + length);
        const gain = context.createGain();
        gain.gain.setValueAtTime(volume, at);
        gain.gain.exponentialRampToValueAtTime(.001, at + length);
        oscillator.connect(gain).connect(into);
        oscillator.start(at);
        oscillator.stop(at + length + .02);
    }

    /** Noise through a band pass at `frequency`, `q` wide. `soft` fades in, for breath. */
    private burst(into: AudioNode, at: number, length: number, frequency: number, q: number, volume: number, soft = false) {
        const context = into.context as AudioContext;
        const source = context.createBufferSource();
        source.buffer = this.noiseBuffer(context);
        const filter = context.createBiquadFilter();
        filter.type = "bandpass";
        filter.frequency.value = frequency;
        filter.Q.value = q;
        const gain = context.createGain();
        if (soft)
        {
            gain.gain.setValueAtTime(.001, at);
            gain.gain.exponentialRampToValueAtTime(volume, at + length * .4);
        }
        else gain.gain.setValueAtTime(volume, at);
        gain.gain.exponentialRampToValueAtTime(.001, at + length);
        source.connect(filter).connect(gain).connect(into);
        source.start(at, Math.random());
        source.stop(at + length + .02);
    }

    private noiseBuffer(context: BaseAudioContext) {
        if (this.noise) return this.noise;
        const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        return this.noise = buffer;
    }
}
