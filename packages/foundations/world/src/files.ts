import { glowing, loadModel, type MeshData, type Vec3 } from "@arrow-warfare/render";

import { CATALOG, type ModelName } from "./catalog";

export { CATALOG, type ModelInfo, type ModelName } from "./catalog";

const cache = new Map<ModelName, Promise<MeshData | null>>();
const glows = new Map<ModelName, Vec3 | null>();

/**
 * A model from `asset/models` (see `bin/models.mjs`), loaded once and kept. `null` if it couldn't be
 * fetched: the map is still played, just without that model.
 */
/** Nodes in the files for the game, not drawn: the buildings' walls, stairs and landings (`bin/collision.mjs`). */
const HIDDEN = /^(collision|stairs|landing)/i;

export function fileModel(name: ModelName): Promise<MeshData | null> {
    let found = cache.get(name);
    if (!found)
    {
        found = loadModel(`/models/${name}.glb`, { skip: HIDDEN }).then(mesh => {
            glows.set(name, glowing(mesh));
            return mesh;
        }).catch(error => {
            console.warn(`world: no model ${name}`, error);
            return null;
        });
        cache.set(name, found);
    }
    return found;
}

/** Where a loaded model's lamp glass or fire is, in its own space, or null if nothing on it glows. */
export function glowOf(name: ModelName) {
    return glows.get(name) ?? null;
}

/** Starts loading models early (during the countdown), so the map is whole when the round starts. */
export function preloadModels(names: ModelName[]) {
    return Promise.all(names.map(fileModel));
}

/** Bounds of a model as `[width, height, depth]` and its middle on x, z. */
export function sizeOf(name: ModelName) {
    const { min, max } = CATALOG[name];
    return { width: max[0] - min[0], height: max[1] - min[1], depth: max[2] - min[2], x: (min[0] + max[0]) / 2, z: (min[2] + max[2]) / 2, bottom: min[1] };
}
