/** The guns: everyone gets the same one when the rule says so. */
export type GunKind = "revolver" | "rifle";

/**
 * Rounds in a full gun, seconds to reload (the length of the model's reload), the least seconds between
 * shots (the hammer, the bolt). Spare rounds are unlimited unless the rule says (`Gun.spare`): then a reload
 * takes what's left, and a fallen player's rounds can be taken.
 *
 * How it shoots: `zero` metres is where the bullet meets the sights (it drops under them further on, so far
 * off you aim higher). `hip` and `aimed` are how far off a shot can go (radians, a cone), `moving` is added at a
 * full walk, `bloom` for each quick shot after another (gone again at `settle` per second). The recoil: `kick`
 * the view jumps up and springs back, `climb` of it stays (pull it back down), `side` at most to either side.
 */
export const GUNS: Record<GunKind, GunSpec> = {
    revolver: { magazine: 6, reload: 1.9, interval: .4, zero: 15, hip: .03, aimed: .004, moving: .045, bloom: .02, settle: .06, kick: .07, climb: .015, side: .025 },
    rifle: { magazine: 5, reload: 1.1, interval: 1, zero: 30, hip: .05, aimed: .0012, moving: .07, bloom: .03, settle: .05, kick: .11, climb: .03, side: .02 },
};

export type GunSpec = {
    magazine: number; reload: number; interval: number;
    zero: number; hip: number; aimed: number; moving: number; bloom: number; settle: number;
    kick: number; climb: number; side: number;
};

export type GunEvent = "shot" | "empty" | "reloaded" | null;

/** One player's gun: the rounds in it, a reload under way, the hammer or bolt between shots. */
export class Gun {
    rounds: number;
    /** Rounds to reload from, `Infinity` for unlimited. */
    spare: number;
    /** Seconds left of a reload, 0 when not reloading. */
    reloading = 0;
    /** Seconds until the next shot can go. */
    private wait = 0;
    /** Radians the next shot can go off for the shots just before it, see `GunSpec.bloom`. */
    bloom = 0;

    /** `spare` rounds on top of a full gun, 0 is unlimited. */
    constructor(readonly kind: GunKind, spare = 0) {
        this.rounds = GUNS[kind].magazine;
        this.spare = spare > 0 ? spare : Infinity;
    }

    /** Every round I have, loaded or not (what I leave behind). */
    get total() {
        return this.rounds + this.spare;
    }

    get spec() {
        return GUNS[this.kind];
    }

    /** 0..1 through the reload, for the HUD. */
    get progress() {
        return this.reloading > 0 ? 1 - this.reloading / this.spec.reload : 0;
    }

    /** The trigger: a shot if one's ready, a click if it's empty (which starts the reload). */
    pull(): GunEvent {
        if (this.reloading > 0 || this.wait > 0) return null;
        if (this.rounds <= 0)
        {
            this.reload();
            this.wait = .25;
            return "empty";
        }
        this.rounds--;
        this.wait = this.spec.interval;
        return "shot";
    }

    /**
     * How far off (radians, a cone) a shot goes now: `aim` 0..1 how far up at the eye, `moving` 0..1 of a
     * full walk, `steady` 1 normally (more with a hurt arm). Call before `fired`.
     */
    spread(aim: number, moving: number, steady = 1) {
        const spec = this.spec;
        const still = spec.hip + (spec.aimed - spec.hip) * aim;
        return (still + spec.moving * Math.min(1, moving) * (1 - aim * .75) + this.bloom) * steady;
    }

    /** A shot went: the next one quick after it goes wider. */
    fired() {
        this.bloom = Math.min(this.spec.bloom * 3, this.bloom + this.spec.bloom);
    }

    /** Starts a reload unless the gun is full or one's under way. Returns whether it started. */
    reload() {
        if (this.reloading > 0 || this.rounds >= this.spec.magazine || this.spare <= 0) return false;
        this.reloading = this.spec.reload;
        return true;
    }

    /** Stops a reload (dying): the rounds stay as they were. */
    cancel() {
        this.reloading = 0;
    }

    update(dt: number): GunEvent {
        this.wait = Math.max(0, this.wait - dt);
        this.bloom = Math.max(0, this.bloom - this.spec.settle * dt);
        if (this.reloading <= 0) return null;
        this.reloading -= dt;
        if (this.reloading > 0) return null;
        this.reloading = 0;
        const take = Math.min(this.spec.magazine - this.rounds, this.spare);
        this.rounds += take;
        this.spare -= take;
        return "reloaded";
    }
}
