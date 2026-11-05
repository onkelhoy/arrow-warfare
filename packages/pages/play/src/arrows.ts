import { fly, heading, hitBody, launch, toWorld, type Arrow, type BodyHit, type BodyPlace, type Shot, type Vec } from "@arrow-warfare/archery";
import { multiply, type Batch, type Renderer, type Vec3 } from "@arrow-warfare/render";
import { arrow as arrowModel, ARROW_LENGTH, type Field } from "@arrow-warfare/world";
import type { Camera } from "@papit/game-engine";

/** ms an arrow can't hit its own shooter, so it leaves the bow. */
const OWN_GRACE = 300;
/** Pick up reach: metres sideways from my feet, and how high up. */
export const REACH = { side: 1.6, low: -.4, high: 2.6 };

export type Landed = { arrow: Arrow; kind: "ground" | "wood" | "wall" };
export type Struck = { arrow: Arrow; id: string; hit: BodyHit; place: BodyPlace };

/**
 * Every arrow of the round. Each phone flies each shot from the shared clock, so they all land the same.
 * Hits on players are only tested for the bodies this phone judges (mine): the one who's hit decides.
 */
export class Arrows {
    readonly all = new Map<string, Arrow>();
    private batch: Batch;
    private colours = new Map<string, Vec3>();
    private viewProjection = new Float32Array(16);

    /** `colourOf` a shooter is their feathers. */
    constructor(private renderer: Renderer, private field: Field, private colourOf: (id: string) => Vec3) {
        this.batch = renderer.batch(arrowModel(), { capacity: 32, dynamic: true });
    }

    add(shot: Shot) {
        if (this.all.has(shot.id)) return null;
        const arrow = launch(shot);
        this.all.set(shot.id, arrow);
        this.colours.set(shot.id, this.colourOf(shot.by));
        return arrow;
    }

    /** It went into a player, as they said. */
    stick(id: string, body: string, point: Vec, direction: Vec) {
        const arrow = this.all.get(id);
        if (!arrow || arrow.gone) return null;
        arrow.rest = { in: "body", id: body };
        arrow.local = { point, direction };
        return arrow;
    }

    remove(id: string) {
        const arrow = this.all.get(id);
        if (arrow) arrow.gone = true;
    }

    /**
     * Flies everything on to `now`. `judge` are the bodies this phone decides hits for, with where they
     * are. Returns what landed in the field and what struck a judged body.
     */
    update(now: number, judge: { id: string; place: BodyPlace }[]) {
        const landed: Landed[] = [];
        const struck: Struck[] = [];
        for (const arrow of this.all.values())
        {
            if (arrow.rest || arrow.gone) continue;
            fly(arrow, now, this.field, (from, to) => {
                for (const body of judge)
                {
                    if (body.id === arrow.shot.by && arrow.at - arrow.shot.time < OWN_GRACE) continue;
                    const hit = hitBody(body.place, from, to);
                    if (!hit) continue;
                    arrow.rest = { in: "body", id: body.id };
                    arrow.local = { point: hit.point, direction: hit.direction };
                    struck.push({ arrow, id: body.id, hit, place: body.place });
                    return true;
                }
                return false;
            });
            // the step above may have set it
            const rest = arrow.rest as Arrow["rest"];
            if (rest && rest.in !== "body") landed.push({ arrow, kind: rest.in });
        }
        return { landed, struck };
    }

    /** Where an arrow's tip is and where it points, a body's arrows riding along with it. */
    where(arrow: Arrow, now: number, bodyOf: (id: string) => BodyPlace | null): { tip: Vec; direction: Vec } | null {
        if (arrow.gone) return null;
        if (arrow.rest?.in === "body")
        {
            const place = bodyOf(arrow.rest.id);
            if (!place || !arrow.local) return null;
            return { tip: toWorld(place, arrow.local.point), direction: toWorld(place, arrow.local.direction, 0) };
        }
        const direction = heading(arrow);
        if (arrow.rest) return { tip: [arrow.x, arrow.y, arrow.z], direction };
        // between steps: carried on to now, so it flies smooth
        const ahead = Math.max(0, now - arrow.at) / 1000;
        return { tip: [arrow.x + arrow.vx * ahead, arrow.y + arrow.vy * ahead, arrow.z + arrow.vz * ahead], direction };
    }

    draw(now: number, bodyOf: (id: string) => BodyPlace | null) {
        let index = 0;
        for (const [id, arrow] of this.all)
        {
            const at = this.where(arrow, now, bodyOf);
            if (!at) continue;
            const [dx, dy, dz] = at.direction;
            // the model points along -z
            const yaw = Math.atan2(-dx, -dz), pitch = Math.asin(Math.max(-1, Math.min(1, dy)));
            this.batch.place(index, at.tip[0], at.tip[1], at.tip[2], yaw, pitch);
            this.batch.tint(index, this.colours.get(id) ?? [1, 1, 1]);
            index++;
        }
        this.batch.count = index;
    }

    /**
     * The arrow to pick up for a tap at `x, y` on screen: resting, within reach of my feet, and the one
     * nearest the tap within `radius` pixels.
     */
    pickable(x: number, y: number, radius: number, me: { x: number; y: number; z: number }, now: number, camera: Camera, width: number, height: number, bodyOf: (id: string) => BodyPlace | null) {
        multiply(this.viewProjection, camera.projectionMatrix, camera.viewMatrix);
        const m = this.viewProjection;
        let best: string | null = null, bestDistance = radius;
        for (const [id, arrow] of this.all)
        {
            if (!arrow.rest || arrow.gone) continue;
            const at = this.where(arrow, now, bodyOf);
            if (!at) continue;
            // the middle of the shaft, it's what sticks out
            const half = arrow.rest.in === "body" ? .45 : .35;
            const px = at.tip[0] - at.direction[0] * ARROW_LENGTH * half;
            const py = at.tip[1] - at.direction[1] * ARROW_LENGTH * half;
            const pz = at.tip[2] - at.direction[2] * ARROW_LENGTH * half;
            if (Math.hypot(px - me.x, pz - me.z) > REACH.side) continue;
            const up = py - me.y;
            if (up < REACH.low || up > REACH.high) continue;
            const cx = m[0] * px + m[4] * py + m[8] * pz + m[12];
            const cy = m[1] * px + m[5] * py + m[9] * pz + m[13];
            const w = m[3] * px + m[7] * py + m[11] * pz + m[15];
            if (w <= .05) continue;
            const sx = (cx / w * .5 + .5) * width, sy = (1 - (cy / w * .5 + .5)) * height;
            const distance = Math.hypot(sx - x, sy - y);
            if (distance < bestDistance)
            {
                bestDistance = distance;
                best = id;
            }
        }
        return best;
    }

    destroy() {
        this.renderer.removeBatch(this.batch);
        this.all.clear();
    }
}
