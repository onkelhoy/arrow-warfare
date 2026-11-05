/**
 * The bow in my hands: how far it's drawn, how tired I am, and what that does to the aim. Touch sets the
 * pull straight from the thumb, the keyboard draws by time. Nothing here knows about the screen.
 */

export type DrawPhase = "idle" | "drawing" | "panting";

/** A drawn bow under this lets down without a shot. */
export const MIN_SHOT = .15;
/** Seconds from nothing to full on the keyboard. */
export const KEY_DRAW = .9;
/** Arrow speed in m/s at the weakest and the strongest shot. */
export const SPEED = { min: 9, max: 34 };
/** Power grows slowly at first: a light pull is a short lob, the last part of the pull counts most. */
const CURVE = 1.6;

/** Seconds of a strong draw before each stage starts. */
export const FATIGUE = {
    /** Steady until here, only a breath of sway. */
    steady: 2,
    /** Tunnel vision starts. */
    tunnel: 4.5,
    /** The arrow slips. */
    slip: 7.5,
};
/** Seconds of panting after a slip. */
export const PANT = 3.2;

/** Sway in radians: always a little while drawn, more as fatigue grows. */
const SWAY_BASE = .0025;
const SWAY_TIRED = .028;

export type DrawEvent = { kind: "shot"; power: number; slipped: boolean } | { kind: "cancel" } | null;

export class Draw {
    phase: DrawPhase = "idle";
    /** 0..1, how far the string is pulled. */
    amount = 0;
    /** Seconds of strong draw, it goes back down when resting. */
    fatigue = 0;
    /** Seconds of panting left. */
    pant = 0;
    /** Time for the sway's wobble, seconds. */
    private clock = Math.random() * 100;
    /** A hurt arm: the most the pull grows a second (Infinity is free), and extra shake in radians. */
    rate = Infinity;
    shake = 0;

    /** Whether a draw can start (not panting). `arrows` is what's in the quiver. */
    canStart(arrows: number) {
        return this.phase === "idle" && arrows > 0;
    }

    start(arrows: number) {
        if (!this.canStart(arrows)) return false;
        this.phase = "drawing";
        this.amount = 0;
        return true;
    }

    /** Touch: the pull from the thumb, 0..1. A hurt arm only gets there slowly. */
    pull(amount: number, dt = 0) {
        if (this.phase !== "drawing") return;
        const want = Math.max(0, Math.min(1, amount));
        this.amount = want > this.amount && Number.isFinite(this.rate) ? Math.min(want, this.amount + this.rate * dt) : want;
    }

    /** Keyboard: drawing by holding, `dt` in seconds. */
    hold(dt: number) {
        if (this.phase === "drawing") this.amount = Math.min(1, this.amount + (Number.isFinite(this.rate) ? Math.min(dt / KEY_DRAW, this.rate * dt) : dt / KEY_DRAW));
    }

    /** Lets go: a shot if it was drawn enough, else the bow comes down. */
    release(): DrawEvent {
        if (this.phase !== "drawing") return null;
        const power = this.amount;
        this.phase = "idle";
        this.amount = 0;
        return power >= MIN_SHOT ? { kind: "shot", power, slipped: false } : { kind: "cancel" };
    }

    /** The bow comes down with no shot (died, or the round ended). */
    cancel() {
        if (this.phase === "drawing") this.phase = "idle";
        this.amount = 0;
    }

    /** Once a frame. Returns the slip when the arrow gets away from a tired archer. */
    update(dt: number): DrawEvent {
        this.clock += dt;
        if (this.phase === "panting")
        {
            this.pant -= dt;
            this.fatigue = Math.max(0, this.fatigue - dt * 1.2);
            if (this.pant <= 0)
            {
                this.pant = 0;
                this.phase = "idle";
            }
            return null;
        }
        if (this.phase === "drawing" && this.amount > .5)
        {
            this.fatigue += dt * this.amount;
            if (this.fatigue >= FATIGUE.slip)
            {
                const power = this.amount;
                this.phase = "panting";
                this.pant = PANT;
                this.amount = 0;
                return { kind: "shot", power, slipped: true };
            }
            return null;
        }
        // resting gets the strength back, twice as fast as it went
        this.fatigue = Math.max(0, this.fatigue - dt * 2);
        return null;
    }

    /** How tired, 0 steady .. 1 about to slip. */
    get tired() {
        return Math.max(0, Math.min(1, (this.fatigue - FATIGUE.steady) / (FATIGUE.slip - FATIGUE.steady)));
    }

    /** 0..1, how dark the edges are. */
    get tunnel() {
        if (this.phase === "panting") return Math.min(1, this.pant / PANT) * .6;
        return Math.max(0, Math.min(1, (this.fatigue - FATIGUE.tunnel) / (FATIGUE.slip - FATIGUE.tunnel)));
    }

    /** 0 none, 1 swaying, 2 tunnel vision, 3 panting: what others see. */
    get stage() {
        if (this.phase === "panting") return 3;
        if (this.fatigue >= FATIGUE.tunnel) return 2;
        if (this.fatigue >= FATIGUE.steady) return 1;
        return 0;
    }

    /** Where the aim drifts, yaw and pitch in radians. A smooth wobble of a few sines. */
    get sway(): [number, number] {
        const drawn = this.phase === "drawing" ? this.amount : 0;
        const panting = this.phase === "panting" ? this.pant / PANT : 0;
        const size = drawn * (SWAY_BASE + SWAY_TIRED * this.tired ** 1.5 + this.shake) + panting * .012;
        if (size <= 0) return [0, 0];
        const t = this.clock * (1 + this.tired * 1.4 + this.shake * 120);
        const yaw = Math.sin(t * 1.3) * .6 + Math.sin(t * 2.9 + 1.7) * .3 + Math.sin(t * 5.3 + .4) * .1;
        const pitch = Math.sin(t * 1.1 + 2.1) * .55 + Math.sin(t * 2.3 + .3) * .35 + Math.sin(t * 6.1) * .1;
        // panting heaves up and down with the breath
        const breath = panting * Math.sin(this.clock * 7) * .02;
        return [yaw * size, pitch * size + breath];
    }

    /** The look turns this much slower while drawn, 1 is free. */
    get look() {
        return this.phase === "drawing" ? 1 - .5 * this.amount : this.phase === "panting" ? .7 : 1;
    }

    /** How quickly the view follows the thumb or mouse, per second. Low is heavy. */
    get follow() {
        return this.phase === "drawing" ? 40 - 30 * this.amount : 40;
    }

    /** Walking speed, 1 is full. */
    get walk() {
        return this.phase === "drawing" ? 1 - .5 * this.amount : this.phase === "panting" ? .55 : 1;
    }
}

/** m/s for a shot of `power` 0..1. */
export function speedOf(power: number) {
    return SPEED.min + (SPEED.max - SPEED.min) * power ** CURVE;
}

/** 0..1 how strong a shot was, from its speed: the hit feel scales with it. */
export function powerOf(speed: number) {
    return Math.max(0, Math.min(1, (speed - SPEED.min) / (SPEED.max - SPEED.min)));
}
