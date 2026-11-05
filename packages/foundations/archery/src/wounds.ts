import type { Zone } from "./body";

/**
 * Injuries, when the rule is on: the head and torso kill, an arm or a leg is a wound. Wounds are bits, so
 * they fit in the pose: others see them too.
 */
export const WOUND = { leftArm: 1, rightArm: 2, leftLeg: 4, rightLeg: 8 } as const;

/** Where a hit always kills. With the arcade rule, every hit does. */
export const LETHAL: Zone[] = ["head", "torso"];

/** The wound bit for a zone, 0 for the head and torso. */
export function woundOf(zone: Zone): number {
    return zone in WOUND ? WOUND[zone as keyof typeof WOUND] : 0;
}

export const legsHurt = (wounds: number) => Number((wounds & WOUND.leftLeg) !== 0) + Number((wounds & WOUND.rightLeg) !== 0);
export const armsHurt = (wounds: number) => Number((wounds & WOUND.leftArm) !== 0) + Number((wounds & WOUND.rightArm) !== 0);

export type Posture = "stand" | "hop" | "sit";

/** Energy a second while hopping at full hop speed, and back a second standing, and resting. */
const HOP_COST = .2;
const RECOVER = .08;
const REST = .3;
/** Sat down to rest, up again at this much energy. */
const RESTED = .6;

/**
 * My body as the injuries leave it: which parts are hurt, the energy hopping costs, and what that does to
 * walking and drawing.
 */
export class Wounds {
    /** `WOUND` bits. */
    bits = 0;
    /** 0..1. Hopping uses it, out of it I sit down to rest. */
    energy = 1;
    /** Out of energy, sitting until rested. */
    resting = false;
    /** Hits taken this round, for the damage vignette. */
    hits = 0;

    /** A hit in `zone`: true when it's a wound (not the head or torso). */
    hurt(zone: Zone) {
        this.hits++;
        const bit = woundOf(zone);
        this.bits |= bit;
        return bit !== 0;
    }

    heal() {
        this.bits = 0;
        this.energy = 1;
        this.resting = false;
        this.hits = 0;
    }

    get legs() {
        return legsHurt(this.bits);
    }

    get arms() {
        return armsHurt(this.bits);
    }

    get posture(): Posture {
        if (this.legs >= 2 || this.resting) return "sit";
        return this.legs === 1 ? "hop" : "stand";
    }

    /** Once a frame, `speed` in m/s over the ground. */
    update(dt: number, speed: number) {
        if (this.resting)
        {
            this.energy = Math.min(1, this.energy + dt * REST);
            if (this.energy >= RESTED) this.resting = false;
            return;
        }
        if (this.posture === "hop" && speed > .2) this.energy = Math.max(0, this.energy - dt * HOP_COST * Math.min(1.5, speed / HOP_SPEED));
        else this.energy = Math.min(1, this.energy + dt * RECOVER);
        if (this.energy <= 0) this.resting = true;
    }

    /** Walking speed, 1 is full: hopping is slower, crawling much slower, resting still. */
    get walk() {
        if (this.resting) return 0;
        if (this.legs >= 2) return .18;
        return this.legs === 1 ? HOP_SPEED / 4.6 : 1;
    }

    /** How fast the bow can be drawn, 1 is free: a hurt arm draws slower. */
    get drawRate() {
        return this.arms === 0 ? 1 : this.arms === 1 ? .45 : .3;
    }

    /** Radians of extra shake on the aim while drawing. */
    get shake() {
        return this.arms * .007;
    }
}

/** m/s, hopping on one leg. */
export const HOP_SPEED = 2.1;
