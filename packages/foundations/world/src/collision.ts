// Written by bin/collision.mjs from the `collision` and `stairs` objects in asset/models/buildings/*.glb, don't edit by hand.

import type { ModelName } from "./catalog";

/** A box around walls, in the model's own metres (y up, as in the file). */
export type Walls = { min: [number, number, number]; max: [number, number, number] };
/** A ramp up outside stairs, in the model's metres: from `from` (the foot) to `to` (the landing), `width` across. */
export type Stairs = { from: [number, number, number]; to: [number, number, number]; width: number };
/** A building's walls (one box each, an L-shaped house two) and its outside stairs. */
export type Collision = { walls: Walls[]; stairs: Stairs[] };

export const COLLISION: Partial<Record<ModelName, Collision>> = {
    "buildings/bakery": { walls: [{ min: [-2.53, -0.02, -2.11], max: [2.47, 7.29, 2.29] }], stairs: [] },
    "buildings/bank": { walls: [{ min: [-3.48, -0.01, -2.69], max: [3.52, 7.6, 2.71] }], stairs: [] },
    "buildings/barracks": { walls: [{ min: [-4.59, -0.01, -2.4], max: [4.41, 5.46, 2.4] }], stairs: [] },
    "buildings/brick-house-2": { walls: [{ min: [-2.68, -0.01, -2.06], max: [2.52, 6.93, 2.14] }], stairs: [] },
    "buildings/brick-house": { walls: [{ min: [-2.69, -0.02, -2.05], max: [2.51, 6.93, 2.15] }], stairs: [] },
    "buildings/cabin-2": { walls: [{ min: [-2.19, -0.01, -1.93], max: [2.21, 4.15, 1.87] }], stairs: [] },
    "buildings/cabin": { walls: [{ min: [-2.19, -0.01, -1.72], max: [2.21, 4.16, 1.88] }], stairs: [] },
    "buildings/chapel": { walls: [{ min: [-4.4, -0.01, -2.4], max: [4.6, 11.74, 2.4] }, { min: [4.4, -0.01, -1.2], max: [7.2, 11.74, 1.2] }], stairs: [] },
    "buildings/corner-house": { walls: [{ min: [-0.82, -0.01, -2.11], max: [2.98, 6.97, 6.89] }, { min: [-3.02, -0.01, -2.11], max: [-0.82, 6.97, 2.29] }], stairs: [] },
    "buildings/cottage-2": { walls: [{ min: [-2.21, -0.01, -1.78], max: [2.19, 4.6, 1.82] }], stairs: [] },
    "buildings/cottage": { walls: [{ min: [-2.2, -0.01, -1.77], max: [2.2, 4.61, 1.83] }], stairs: [] },
    "buildings/farmhouse": { walls: [{ min: [-0.47, -0.01, -1.95], max: [2.93, 4.8, 6.25] }, { min: [-3.07, -0.01, -1.95], max: [-0.47, 4.8, 2.05] }], stairs: [] },
    "buildings/general-store": { walls: [{ min: [-2.48, -0.02, -2.17], max: [2.52, 6.33, 2.43] }], stairs: [] },
    "buildings/smithy": { walls: [{ min: [-2.48, -0.01, -2.1], max: [2.52, 4.7, 2.3] }], stairs: [] },
    "buildings/stone-house-2": { walls: [{ min: [-2.57, -0.01, -1.96], max: [2.43, 6.82, 2.04] }], stairs: [] },
    "buildings/stone-house": { walls: [{ min: [-2.58, -0.02, -1.96], max: [2.42, 6.83, 2.04] }], stairs: [] },
    "buildings/tavern": { walls: [{ min: [-3.42, -0.01, -2.5], max: [3.58, 7.43, 2.5] }], stairs: [] },
    "buildings/timber-house-2": { walls: [{ min: [-2.4, -0.01, -2.08], max: [2.4, 9, 2.12] }], stairs: [] },
    "buildings/timber-house": { walls: [{ min: [-2.43, -0.01, -2.09], max: [2.37, 8.99, 2.11] }], stairs: [] },
    "buildings/townhouse-2": { walls: [{ min: [-1.65, -0.01, -2.6], max: [1.75, 9.52, 2.4] }], stairs: [] },
    "buildings/townhouse-3": { walls: [{ min: [-1.67, -0.02, -2.42], max: [1.73, 9.52, 2.58] }], stairs: [] },
    "buildings/townhouse": { walls: [{ min: [-1.67, -0.01, -2.39], max: [1.73, 9.52, 2.41] }], stairs: [] },
};
