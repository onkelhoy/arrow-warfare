/** The guns: everyone gets the same one when the rule says so. */
export type GunKind = "revolver" | "rifle";

/**
 * Rounds in a full gun, seconds to reload (the length of the model's reload), the least seconds between
 * shots (the hammer, the bolt), and the kick up the view gives (radians). Magazines are unlimited: a reload
 * always fills the gun, there's nothing to pick up.
 */
export const GUNS: Record<GunKind, { magazine: number; reload: number; interval: number; kick: number }> = {
    revolver: { magazine: 6, reload: 1.9, interval: .4, kick: .035 },
    rifle: { magazine: 5, reload: 1.1, interval: 1, kick: .05 },
};

export type GunEvent = "shot" | "empty" | "reloaded" | null;

/** One player's gun: the rounds in it, a reload under way, the hammer or bolt between shots. */
export class Gun {
    rounds: number;
    /** Seconds left of a reload, 0 when not reloading. */
    reloading = 0;
    /** Seconds until the next shot can go. */
    private wait = 0;

    constructor(readonly kind: GunKind) {
        this.rounds = GUNS[kind].magazine;
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
            return "empty";
        }
        this.rounds--;
        this.wait = this.spec.interval;
        return "shot";
    }

    /** Starts a reload unless the gun is full or one's under way. Returns whether it started. */
    reload() {
        if (this.reloading > 0 || this.rounds >= this.spec.magazine) return false;
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
        this.rounds = this.spec.magazine;
        return "reloaded";
    }
}
