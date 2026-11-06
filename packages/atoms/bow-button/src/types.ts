/** `dx`, `dy` are CSS pixels the thumb moved for aiming since the last event. `shoot`: the thumb left the button and is back on it. */
export type DrawEvent = { dx: number; dy: number; shoot: boolean };
