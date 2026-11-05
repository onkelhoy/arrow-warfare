/** `pull` is 0..1. `dx`, `dy` are CSS pixels the thumb moved for aiming since the last event. */
export type DrawEvent = { pull: number; dx: number; dy: number; anchored: boolean };
