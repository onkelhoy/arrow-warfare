import { loadGLTF, Rigged, type GLTF } from "@arrow-warfare/render";

export type GunKind = "revolver" | "rifle";

type Point = [number, number, number];

/**
 * A gun's file, the names of its animations (`bin/models.mjs` brings them from the FPS Guns pack) and how it's
 * held. Both files have the muzzle towards -z, up +y, the grip towards +z, 9.6 units long: `scale` makes metres.
 * `muzzle`, `grip` (the trigger hand), `fore` (the other hand, the rifle's) and `sight` (the top of the front
 * sight, read off the posed meshes) are in the file's units.
 */
export const GUN_FILES: Record<GunKind, { file: string; fire: string; reload: string; scale: number; muzzle: Point; grip: Point; fore: Point | null; sight: Point }> = {
    revolver: { file: "/models/guns/revolver.glb", fire: "Fire", reload: "Reload", scale: .034, muzzle: [0, 1.3, -4.85], grip: [0, -1, 2.6], fore: null, sight: [0, 2.73, -4.57] },
    rifle: { file: "/models/guns/rifle.glb", fire: "FireWBullet", reload: "Reload", scale: .115, muzzle: [0, .5, -4.75], grip: [0, -.2, 1.9], fore: [0, -.25, -1.6], sight: [0, .78, -4.45] },
};

const cache = new Map<GunKind, Promise<GLTF | null>>();

/** A gun of its own (each holds its pose), cut into rigid pieces. `null` if the file couldn't be fetched. */
export async function loadGun(kind: GunKind): Promise<Rigged | null> {
    let found = cache.get(kind);
    if (!found)
    {
        found = loadGLTF(GUN_FILES[kind].file).catch(error => {
            console.warn(`world: no gun ${kind}`, error);
            return null;
        });
        cache.set(kind, found);
    }
    const gltf = await found;
    return gltf ? new Rigged(gltf) : null;
}
