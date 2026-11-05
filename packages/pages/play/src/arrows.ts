import { fly, heading, hitBody, launch, toWorld, type Arrow, type BodyHit, type BodyPlace, type Shot, type Vec } from "@arrow-warfare/archery";
import { multiply, type Batch, type Renderer, type Vec3 } from "@arrow-warfare/render";
import { arrow as arrowModel, ARROW_LENGTH, beam, type Field } from "@arrow-warfare/world";
import type { Camera } from "@papit/game-engine";

/** ms an arrow can't hit its own shooter, so it leaves the bow. */
const OWN_GRACE = 300;
/** Pick up reach: metres sideways from my feet, and how high up. */
export const REACH = { side: 1.6, low: -.4, high: 2.6 };

/** A white trail behind each flying arrow: seconds it lasts and how thick it starts. Mine shows more. */
const TRAIL = { mine: { life: 1.8, width: .018, brightness: 1.6 }, others: { life: .25, width: .014, brightness: 1.1 } };

/** Metres from the bow before a trail starts. */
const TRAIL_START = 2;

type Point = { x: number; y: number; z: number; at: number };
/** ms a trail takes to fade once its arrow has landed. */
const TRAIL_FADE = 450;

export type Landed = { arrow: Arrow; kind: "ground" | "wood" | "wall" };
export type Struck = { arrow: Arrow; id: string; hit: BodyHit; place: BodyPlace };

/**
 * Every arrow of the round. Each phone flies each shot from the shared clock, so they all land the same.
 * Hits on players are only tested for the bodies this phone judges (mine): the one who's hit decides.
 */
export class Arrows {
    readonly all = new Map<string, Arrow>();
    private batch: Batch;
    private trail: Batch;
    private trails = new Map<string, Point[]>();
    /** When each arrow stopped, for the trail's fade. */
    private landed = new Map<string, number>();
    private colours = new Map<string, Vec3>();
    private viewProjection = new Float32Array(16);

    /** `colourOf` a shooter is their feathers. */
    constructor(private renderer: Renderer, private field: Field, private me: string, private colourOf: (id: string) => Vec3) {
        this.batch = renderer.batch(arrowModel(), { capacity: 32, dynamic: true });
        this.trail = renderer.batch(beam(3), { capacity: 64, dynamic: true, emissive: 1 });
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

    /** `eye` is the camera: trails keep about the same width on screen however far they are. */
    draw(now: number, bodyOf: (id: string) => BodyPlace | null, eye: Vec) {
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
        this.drawTrails(now, bodyOf, eye);
    }

    /** A point behind each flying arrow every frame, the old ones let go, drawn thinning out to the tail. */
    private drawTrails(now: number, bodyOf: (id: string) => BodyPlace | null, eye: Vec) {
        let index = 0;
        for (const [id, arrow] of this.all)
        {
            const trail = TRAIL[arrow.shot.by === this.me ? "mine" : "others"];
            let points = this.trails.get(id);
            if (!arrow.rest && !arrow.gone)
            {
                const at = this.where(arrow, now, bodyOf);
                // behind the feathers, and only from a little way out: at the bow it would fill the view
                const [dx, dy, dz] = at?.direction ?? [0, 0, 0];
                const back = at && { x: at.tip[0] - dx * ARROW_LENGTH, y: at.tip[1] - dy * ARROW_LENGTH, z: at.tip[2] - dz * ARROW_LENGTH, at: now };
                if (back && Math.hypot(back.x - arrow.shot.x, back.y - arrow.shot.y, back.z - arrow.shot.z) > TRAIL_START)
                {
                    if (!points) this.trails.set(id, points = []);
                    points.push(back);
                }
            }
            if (!points) continue;
            while (points.length && now - points[0].at > trail.life * 1000) points.shift();
            // landed: the whole trail fades together, it doesn't shrink back to the arrow
            let fade = 1;
            if (arrow.rest || arrow.gone)
            {
                if (!this.landed.has(id)) this.landed.set(id, now);
                fade = 1 - (now - this.landed.get(id)!) / TRAIL_FADE;
            }
            if (points.length < 2 || fade <= 0)
            {
                if (arrow.rest || arrow.gone) this.trails.delete(id);
                continue;
            }
            for (let i = 0; i + 1 < points.length; i++)
            {
                const a = points[i], b = points[i + 1];
                const length = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
                if (length < 1e-4) continue;
                // mine stay full along the whole flight, the others' thin out towards the tail
                const age = (now - (a.at + b.at) / 2) / (trail.life * 1000);
                const fresh = (arrow.shot.by === this.me ? Math.min(1, (1 - age) * 3) : 1 - age) * fade;
                if (fresh <= 0) continue;
                const far = Math.hypot(a.x - eye[0], a.y - eye[1], a.z - eye[2]);
                const width = trail.width * fresh * Math.max(1, far / 3);
                // a beam runs along -z, from a to b
                const yaw = Math.atan2(-(b.x - a.x), -(b.z - a.z)), pitch = Math.asin(Math.max(-1, Math.min(1, (b.y - a.y) / length)));
                this.trail.place(index, a.x, a.y, a.z, yaw, pitch, 0, width, width, length);
                this.trail.tint(index, [1, 1, 1], trail.brightness * (.4 + .6 * fresh));
                index++;
            }
        }
        this.trail.count = index;
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
        this.renderer.removeBatch(this.trail);
        this.all.clear();
    }
}
