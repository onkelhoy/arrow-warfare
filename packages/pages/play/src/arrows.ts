import { fly, heading, hitBody, launch, STEP, type Arrow, type BodyHit, type BodyPlace, type Shot, type Vec } from "@arrow-warfare/archery";
import { multiply, type Batch, type Renderer, type Vec3 } from "@arrow-warfare/render";
import type { Rig } from "@arrow-warfare/rig";
import { arrow as arrowModel, ARROW_LENGTH, beam, type Field } from "@arrow-warfare/world";
import type { Camera } from "@papit/game-engine";

import type { HitRecord } from "./replay";

/** ms an arrow can't hit its own shooter, so it leaves the bow. */
const OWN_GRACE = 300;
/** Pick up reach: metres sideways from my feet, and how high up. */
export const REACH = { side: 1.6, low: -.4, high: 2.6 };

/** A white trail behind each flying arrow: seconds it lasts and how thick it starts. Mine shows more. */
const TRAIL = { mine: { life: 1.8, width: .018, brightness: 1.6 }, others: { life: .25, width: .014, brightness: 1.1 } };

/** Metres from the bow before a trail starts. */
const TRAIL_START = 2;

type Point = { x: number; y: number; z: number; at: number };
/** ms of trail behind an arrow in the kill cam, and one flight step. */
const GHOST_TRAIL = 220;
const STEP_MS = STEP * 1000;
/** ms a trail takes to fade once its arrow has landed. */
const TRAIL_FADE = 450;

export type Landed = { arrow: Arrow; kind: "ground" | "wood" | "wall" };
/** `local` is where it went in, in the part's own space. */
export type Struck = { arrow: Arrow; id: string; hit: BodyHit; place: BodyPlace; local: { point: Vec; direction: Vec }; at: Vec; speed: number };

/** Metres an arrow at `speed` goes on past where it would stop: none when weak, out the other side when strong. */
export function pierce(speed: number, zone: string) {
    const strength = Math.max(0, Math.min(1, (speed - 15) / 15));
    return strength * (zone === "head" || zone === "torso" ? .6 : .3);
}
type RigOf = (id: string) => Rig | null;

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
    /** All the arrows in me are drawn: my body is seen from outside. */
    showMine = false;

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

    /** It went into a player's `part`, as they said, `point` and `direction` in the part's space. */
    stick(id: string, body: string, part: string, point: Vec, direction: Vec) {
        const arrow = this.all.get(id);
        if (!arrow || arrow.gone) return null;
        arrow.rest = { in: "body", id: body };
        arrow.local = { point, direction };
        this.parts.set(id, part);
        return arrow;
    }

    /** The part each stuck arrow is in. */
    private parts = new Map<string, string>();

    remove(id: string) {
        const arrow = this.all.get(id);
        if (arrow) arrow.gone = true;
    }

    /**
     * Flies everything on to `now`. `judge` are the bodies this phone decides hits for, with where they
     * are. Returns what landed in the field and what struck a judged body.
     */
    update(now: number, judge: { id: string; rig: Rig }[]) {
        const landed: Landed[] = [];
        const struck: Struck[] = [];
        for (const arrow of this.all.values())
        {
            if (arrow.rest || arrow.gone) continue;
            fly(arrow, now, this.field, (from, to) => {
                for (const body of judge)
                {
                    if (body.id === arrow.shot.by && arrow.at - arrow.shot.time < OWN_GRACE) continue;
                    const place = body.rig.where;
                    const hit = hitBody(place, from, to, body.rig.capsules);
                    if (!hit) continue;
                    // where it went in, before it goes deeper
                    const at = body.rig.world(hit.point);
                    // a strong arrow goes on through and out the other side
                    const depth = pierce(Math.hypot(arrow.vx, arrow.vy, arrow.vz), hit.zone);
                    hit.point = [hit.point[0] + hit.direction[0] * depth, hit.point[1] + hit.direction[1] * depth, hit.point[2] + hit.direction[2] * depth];
                    const local = { point: body.rig.toPart(hit.part, hit.point), direction: body.rig.toPart(hit.part, hit.direction, 0) };
                    arrow.rest = { in: "body", id: body.id };
                    arrow.local = local;
                    this.parts.set(arrow.shot.id, hit.part);
                    struck.push({ arrow, id: body.id, hit, place: { ...place }, local, at, speed: Math.hypot(arrow.vx, arrow.vy, arrow.vz) });
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
    where(arrow: Arrow, now: number, rigOf: RigOf): { tip: Vec; direction: Vec } | null {
        if (arrow.gone) return null;
        if (arrow.rest?.in === "body")
        {
            const rig = rigOf(arrow.rest.id);
            const part = this.parts.get(arrow.shot.id) ?? "torso";
            if (!rig || !arrow.local) return null;
            return { tip: rig.fromPart(part, arrow.local.point), direction: rig.fromPart(part, arrow.local.direction, 0) };
        }
        const direction = heading(arrow);
        if (arrow.rest) return { tip: [arrow.x, arrow.y, arrow.z], direction };
        // between steps: carried on to now, so it flies smooth
        const ahead = Math.max(0, now - arrow.at) / 1000;
        return { tip: [arrow.x + arrow.vx * ahead, arrow.y + arrow.vy * ahead, arrow.z + arrow.vz * ahead], direction };
    }

    /** `eye` is the camera: trails keep about the same width on screen however far they are. */
    draw(now: number, rigOf: RigOf, eye: Vec) {
        let index = 0;
        for (const [id, arrow] of this.all)
        {
            // in me, only the legs: the rest is up at my eyes, where my body isn't drawn
            if (arrow.rest?.in === "body" && arrow.rest.id === this.me && !this.showMine && !/Thigh|Shin/.test(this.parts.get(id) ?? "")) continue;
            const at = this.where(arrow, now, rigOf);
            if (!at) continue;
            const [dx, dy, dz] = at.direction;
            // the model points along -z
            const yaw = Math.atan2(-dx, -dz), pitch = Math.asin(Math.max(-1, Math.min(1, dy)));
            this.batch.place(index, at.tip[0], at.tip[1], at.tip[2], yaw, pitch);
            this.batch.tint(index, this.colours.get(id) ?? [1, 1, 1]);
            index++;
        }
        this.batch.count = index;
        this.drawTrails(now, rigOf, eye);
    }

    /** A point behind each flying arrow every frame, the old ones let go, drawn thinning out to the tail. */
    private drawTrails(now: number, rigOf: RigOf, eye: Vec) {
        let index = 0;
        for (const [id, arrow] of this.all)
        {
            const trail = TRAIL[arrow.shot.by === this.me ? "mine" : "others"];
            let points = this.trails.get(id);
            if (!arrow.rest && !arrow.gone)
            {
                const at = this.where(arrow, now, rigOf);
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
    pickable(x: number, y: number, radius: number, me: { x: number; y: number; z: number }, now: number, camera: Camera, width: number, height: number, rigOf: RigOf) {
        multiply(this.viewProjection, camera.projectionMatrix, camera.viewMatrix);
        const m = this.viewProjection;
        let best: string | null = null, bestDistance = radius;
        for (const [id, arrow] of this.all)
        {
            // the ones in me are pulled out with their own button
            if (!arrow.rest || arrow.gone || (arrow.rest.in === "body" && arrow.rest.id === this.me)) continue;
            const at = this.where(arrow, now, rigOf);
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

    /** Arrows flown again for the kill cam, by shot id, with the last points of their trails. */
    private ghosts = new Map<string, { arrow: Arrow; trail: Point[] }>();

    /**
     * The arrows as they were at shared ms `time`, for the kill cam: every shot by then flown again from
     * its start, the ones that had gone into someone riding on that body's rig (`rigOf` gives the replay's).
     */
    drawAt(time: number, shots: Iterable<Shot>, hits: Map<string, HitRecord>, rigOf: RigOf, eye: Vec) {
        let index = 0, beams = 0;
        for (const shot of shots)
        {
            if (shot.time > time) continue;
            const colour = this.colours.get(shot.id) ?? this.colourOf(shot.by);
            const hit = hits.get(shot.id);
            let tip: Vec, direction: Vec;
            if (hit && hit.time <= time)
            {
                const rig = rigOf(hit.victim);
                if (!rig) continue;
                tip = rig.fromPart(hit.part, hit.point);
                direction = rig.fromPart(hit.part, hit.direction, 0);
            }
            else
            {
                let ghost = this.ghosts.get(shot.id);
                // time went back (a new kill cam): fly it again from the bow
                if (!ghost || ghost.arrow.at > time + STEP_MS) this.ghosts.set(shot.id, ghost = { arrow: launch(shot), trail: [] });
                const arrow = ghost.arrow;
                fly(arrow, time, this.field);
                if (arrow.gone) continue;
                direction = heading(arrow);
                const ahead = arrow.rest ? 0 : Math.max(0, time - arrow.at) / 1000;
                tip = [arrow.x + arrow.vx * ahead, arrow.y + arrow.vy * ahead, arrow.z + arrow.vz * ahead];
                const trail = ghost.trail;
                if (!arrow.rest)
                {
                    const last = trail[trail.length - 1];
                    if (!last || time > last.at) trail.push({ x: tip[0] - direction[0] * ARROW_LENGTH, y: tip[1] - direction[1] * ARROW_LENGTH, z: tip[2] - direction[2] * ARROW_LENGTH, at: time });
                }
                while (trail.length && time - trail[0].at > GHOST_TRAIL) trail.shift();
                if (arrow.rest) trail.length = 0;
                for (let i = 0; i + 1 < trail.length; i++)
                {
                    const a = trail[i], b = trail[i + 1];
                    const length = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
                    if (length < 1e-4) continue;
                    const fresh = 1 - (time - (a.at + b.at) / 2) / GHOST_TRAIL;
                    const far = Math.hypot(a.x - eye[0], a.y - eye[1], a.z - eye[2]);
                    const width = .012 * fresh * Math.max(1, far / 3);
                    const yaw = Math.atan2(-(b.x - a.x), -(b.z - a.z)), pitch = Math.asin(Math.max(-1, Math.min(1, (b.y - a.y) / length)));
                    this.trail.place(beams, a.x, a.y, a.z, yaw, pitch, 0, width, width, length);
                    this.trail.tint(beams, [1, 1, 1], 1.4 * fresh);
                    beams++;
                }
            }
            const yaw = Math.atan2(-direction[0], -direction[2]), pitch = Math.asin(Math.max(-1, Math.min(1, direction[1])));
            this.batch.place(index, tip[0], tip[1], tip[2], yaw, pitch);
            this.batch.tint(index, colour);
            index++;
        }
        this.batch.count = index;
        this.trail.count = beams;
    }

    /** Where a flown again arrow is at shared ms `time`: for the kill cam's camera. Null before it's shot or once it's gone. */
    ghostAt(shot: Shot, time: number): { tip: Vec; direction: Vec } | null {
        if (time < shot.time) return null;
        const arrow = launch(shot);
        fly(arrow, time, this.field);
        if (arrow.gone) return null;
        const ahead = arrow.rest ? 0 : Math.max(0, time - arrow.at) / 1000;
        return { tip: [arrow.x + arrow.vx * ahead, arrow.y + arrow.vy * ahead, arrow.z + arrow.vz * ahead], direction: heading(arrow) };
    }

    /** The arrows stuck in a body, for pulling them out. */
    in(id: string) {
        return [...this.all.values()].filter(arrow => !arrow.gone && arrow.rest?.in === "body" && arrow.rest.id === id);
    }

    destroy() {
        this.renderer.removeBatch(this.batch);
        this.renderer.removeBatch(this.trail);
        this.all.clear();
    }
}
