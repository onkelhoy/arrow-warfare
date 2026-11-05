import type { BodyPlace, Shot, Vec, Zone } from "@arrow-warfare/archery";
import type { Pose } from "@arrow-warfare/net";

import { sample } from "./others";

/** Seconds of the round every phone keeps, for the kill cam. */
export const KEEP = 8;

/** An arrow going into someone, with the shared ms it happened at. `point`, `direction` are in the part's space. */
export type HitRecord = {
    arrow: string; victim: string; zone: Zone; part: string;
    point: Vec; direction: Vec; place: BodyPlace;
    /** Where in the world it went in. */
    at: Vec;
    time: number;
    lethal: boolean;
};

export type DeathRecord = { id: string; by: string; arrow: string; time: number };

/**
 * The last seconds of the round, from what every phone gets anyway: everyone's poses (mine as I send
 * them), the shots and the hits. The kill cam plays from here.
 */
export class Replay {
    private poses = new Map<string, Pose[]>();
    readonly shots = new Map<string, Shot>();
    /** By arrow id. */
    readonly hits = new Map<string, HitRecord>();
    /** By who died. */
    readonly deaths = new Map<string, DeathRecord>();

    /** A pose as it arrived, in time order. */
    pose(id: string, pose: Pose) {
        let list = this.poses.get(id);
        if (!list) this.poses.set(id, list = []);
        if (list.length && pose.time <= list[list.length - 1].time) return;
        list.push(pose);
        const old = pose.time - KEEP * 1000;
        while (list.length > 2 && list[1].time < old) list.shift();
    }

    shot(shot: Shot) {
        this.shots.set(shot.id, shot);
        // shots stay while their arrows can still be in the air or in someone
        if (this.shots.size > 200) this.shots.delete(this.shots.keys().next().value!);
    }

    hit(hit: HitRecord) {
        if (!this.hits.has(hit.arrow)) this.hits.set(hit.arrow, hit);
    }

    death(death: DeathRecord) {
        if (!this.deaths.has(death.id)) this.deaths.set(death.id, death);
    }

    /** Where `id` was at shared ms `time`, null if this phone never heard from them. */
    at(id: string, time: number): Pose | null {
        const list = this.poses.get(id);
        if (!list?.length) return null;
        return sample(list, time);
    }

    /** The first time this phone has a pose for `id`. */
    since(id: string) {
        return this.poses.get(id)?.[0]?.time ?? Infinity;
    }

    get players() {
        return [...this.poses.keys()];
    }
}
