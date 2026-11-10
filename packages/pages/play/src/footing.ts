import { Rig } from "@arrow-warfare/rig";
import { Field, preloadModels, STEP_UP, type FieldSetting } from "@arrow-warfare/world";

/** A rig whose feet find the ground or the floor it stands on (a tower's platform), not the ground under it. */
export function footing(field: Field) {
    const rig: Rig = new Rig((x, z) => field.floor(x, z, rig.where.y + STEP_UP));
    return rig;
}

/** Starts fetching the round's models while the 3 2 1 runs, so the map is whole when it starts. */
export function preloadRound(state: { seed: number; rules: Omit<FieldSetting, "seed"> }) {
    const field = new Field({ ...state.rules, seed: state.seed });
    return preloadModels([...new Set(field.models.map(one => one.model))]);
}
