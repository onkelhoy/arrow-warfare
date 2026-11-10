/** The guns: everyone gets the same one when the rule says so. */
export type GunKind = "revolver" | "rifle";

/**
 * Rounds in a full gun, seconds to reload (the length of the model's reload), the least seconds between
 * shots (the hammer, the bolt), and the kick up the view gives (radians). Spare rounds are unlimited unless
 * the rule says (`Gun.spare`): then a reload takes what's left, and a fallen player's rounds can be taken.
 */
export const GUNS: Record<GunKind, { magazine: number; reload: number; interval: number; kick: number }> = {
    revolver: { magazine: 6, reload: 1.9, interval: .4, kick: .035 },
    rifle: { magazine: 5, reload: 1.1, interval: 1, kick: .05 },
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
