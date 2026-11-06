import { fly, heading, launch, speedOf, STEP, type Shot, type Vec } from "@arrow-warfare/archery";
import type { Pose } from "@arrow-warfare/net";
import { invert, mat4, Renderer, rgb } from "@arrow-warfare/render";
import { apply, Rig } from "@arrow-warfare/rig";
import { Sfx, type Sound } from "@arrow-warfare/sound";
import { Field, Meadow } from "@arrow-warfare/world";
import { Camera, GameEngine, GameObject } from "@papit/game-engine";

import { Arrows } from "./arrows";
import { Blood } from "./blood";
import { aim, Film } from "./cinema";
import { Replay } from "./replay";

/**
 * The kill cam alone, to look at and tune: two players on an empty meadow, the shooter aims exactly at
 * the other's head (or torso) and the whole film plays, as the victim would see it. `stage` holds a
 * canvas with class `killcam-canvas`.
 */
export function mountKillCam(stage: HTMLElement, sound?: Sound) {
    let status = "";

    const engine = new GameEngine({ name: "killcam", query: ".killcam-canvas", type: "webgl2", documentElement: stage });
    const layer = engine.layers.killcam;
    const size = () => {
        layer.setting.width = Math.max(1, Math.round(stage.clientWidth * devicePixelRatio));
        layer.setting.height = Math.max(1, Math.round(stage.clientHeight * devicePixelRatio));
        layer.resize();
    };
    new ResizeObserver(size).observe(stage);
    const camera = new Camera({ fov: 1.1, near: .05, far: 320 });
    layer.camera = camera;
    const renderer = engine.add(new Renderer(layer));
    const field = new Field({ seed: 3, size: "large", trees: "none" });
    engine.add(new Meadow(renderer, field, { palette: "noon", grass: .5 }));

    const sfx = sound ? new Sfx(sound) : null;

    const SHOOTER = "shooter", VICTIM = "victim";
    const looks = {
        [SHOOTER]: { clothes: rgb("#c0392b"), skin: rgb("#f1c27d") },
        [VICTIM]: { clothes: rgb("#2e86de"), skin: rgb("#e0ac69") },
    };
    const colourOf = (id: string) => looks[id as keyof typeof looks]?.clothes ?? rgb("#ffffff");

    let replay = new Replay();
    let arrows = new Arrows(renderer, field, SHOOTER, colourOf);
    let blood = new Blood(renderer, field);
    let film: Film | null = null;

    /** Shared ms of the shot, any number works. */
    const SHOT = 100_000;
    let shots = 0;

    const pose = (time: number, x: number, z: number, yaw: number, pitch = 0, draw = 0): Pose => ({
        time, x, y: field.height(x, z), z, yaw, pitch, speed: 0, draw, stage: 0, left: false, wounds: 0, resting: false,
    });

    /** Where an arrow from `from` at this pitch is when it has come `reach` metres flat, and when. */
    function flight(from: Vec, yaw: number, pitch: number, speed: number, reach: number) {
        const shot: Shot = {
            id: "aim", by: SHOOTER, time: 0, x: from[0], y: from[1], z: from[2],
            dx: -Math.sin(yaw) * Math.cos(pitch), dy: Math.sin(pitch), dz: -Math.cos(yaw) * Math.cos(pitch), speed,
        };
        const arrow = launch(shot);
        while (!arrow.gone && !arrow.rest && arrow.at < 20_000)
        {
            const flat = Math.hypot(arrow.x - from[0], arrow.z - from[2]);
            if (flat >= reach) return { shot, y: arrow.y, at: arrow.at, direction: heading(arrow), tip: [arrow.x, arrow.y, arrow.z] as Vec };
            fly(arrow, arrow.at + STEP * 1000, field);
        }
        return null;
    }

    function shoot(distance: number, power: number, part: "head" | "torso" = "head") {
        film?.skip();
        film?.destroy();
        arrows.destroy();
        blood.destroy();
        replay = new Replay();
        arrows = new Arrows(renderer, field, SHOOTER, colourOf);
        blood = new Blood(renderer, field);

        // the shooter faces -z, the victim `distance` away facing back
        const sx = 0, sz = distance / 2, vx = 0, vz = -distance / 2;
        const victimRig = new Rig((x, z) => field.height(x, z));
        const standing = pose(0, vx, vz, Math.PI);
        for (let i = 0; i < 20; i++) victimRig.update(1 / 60, { ...standing, dead: false });
        const capsule = victimRig.capsules.find(c => c.part === part)!;
        const middle: Vec = [(capsule.a[0] + capsule.b[0]) / 2, (capsule.a[1] + capsule.b[1]) / 2, (capsule.a[2] + capsule.b[2]) / 2];
        // its front, facing the shooter
        const target = victimRig.world([middle[0], middle[1], middle[2] - capsule.radius * .9]);

        const shooterRig = new Rig((x, z) => field.height(x, z));
        const aimPose = pose(0, sx, sz, 0, 0, 1);
        for (let i = 0; i < 40; i++) shooterRig.update(1 / 60, { ...aimPose, dead: false });
        const from = shooterRig.world(apply(shooterRig.bow, [0, 0, 0]));
        const reach = Math.hypot(target[0] - from[0], target[2] - from[2]);
        const yaw = Math.atan2(-(target[0] - from[0]), -(target[2] - from[2]));
        const speed = speedOf(power);

        // the pitch that lands on the target, by halves
        let low = -.4, high = .9, best = null as ReturnType<typeof flight>;
        for (let i = 0; i < 40; i++)
        {
            const pitch = (low + high) / 2;
            const result = flight(from, yaw, pitch, speed, reach);
            if (!result || result.y < target[1]) low = pitch;
            else high = pitch;
            if (result) best = result;
        }
        if (!best)
        {
            status = "Too far for that power.";
            return status;
        }
        const pitch = (low + high) / 2;

        const id = `${SHOOTER}:${++shots}`;
        const shot: Shot = { ...best.shot, id, time: SHOT };
        const strike = SHOT + best.at;
        // their poses, a little more often than sent: the shooter draws for a second and lets go
        for (let time = SHOT - 4000; time <= strike + 4000; time += 33)
        {
            const drawing = Math.max(0, Math.min(1, (time - (SHOT - 1300)) / 1100));
            replay.pose(SHOOTER, pose(time, sx, sz, yaw, pitch, time < SHOT ? drawing : 0));
            if (time <= strike) replay.pose(VICTIM, { ...standing, time });
        }
        replay.shot(shot);
        arrows.add(shot);

        // the hit, in the head's own space as the victim's phone sends it
        const inverse = mat4();
        invert(inverse, victimRig.place);
        const rigPoint = apply(inverse, best.tip), rigDirection = apply(inverse, best.direction, 0);
        replay.hit({
            arrow: id, victim: VICTIM, zone: part, part,
            point: victimRig.toPart(part, rigPoint), direction: victimRig.toPart(part, rigDirection, 0),
            place: { x: vx, y: field.height(vx, vz), z: vz, yaw: Math.PI }, at: best.tip, time: strike, lethal: true,
        });
        replay.death({ id: VICTIM, by: SHOOTER, arrow: id, time: strike });

        film = new Film({
            renderer, field, camera, replay, arrows, blood,
            lookOf: id => looks[id as keyof typeof looks] ?? null,
            fallback: () => null,
            sound: (name, _at, volume, rate) => sfx?.play(name, { volume, rate }),
        });
        status = film.start(VICTIM, SHOOTER, id) ? `${(best.at / 1000).toFixed(2)} s in the air, ${film.length.toFixed(1)} s of film` : "Nothing to show.";
        return status;
    }

    // before a shot: a look at the two of them
    aim(camera, [8, 4, 10], [0, 1, 0]);
    engine.add(new class extends GameObject {
        override update(delta: number) {
            const dt = Math.min(delta, .1);
            if (!film || film.done) return;
            film.update(dt);
            blood.update(dt * film.rate);
        }
    }());
    size();
    engine.start();

    return {
        /** Shoots from `distance` metres at `power` 0..1 and plays the kill cam. Says how it went. */
        shoot,
        skip: () => film?.skip(),
        get playing() { return !!film && !film.done; },
        remove() {
            engine.stop();
            film?.destroy();
            arrows.destroy();
            blood.destroy();
        },
    };
}
