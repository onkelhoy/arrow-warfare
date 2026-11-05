import "@papit/button";
import { Camera, GameEngine, GameObject } from "@papit/game-engine";
import { effect } from "@papit/signals";
import { Draw, KEY_DRAW, LETHAL, powerOf, speedOf, standing, Tally, Wounds, ZONES, type BodyPlace, type DrawEvent, type Shot, type Vec, type Zone } from "@arrow-warfare/archery";
import { adopt, COLOURS, settings, SKINS, t, teamName, wears, type GameState, type Results } from "@arrow-warfare/core";
import { packPose, POSE_RATE, unpackPose } from "@arrow-warfare/net";
import { Renderer, rgb, type Vec3 } from "@arrow-warfare/render";
import { Rig } from "@arrow-warfare/rig";
import { Sfx, type SfxName, type Sound } from "@arrow-warfare/sound";
import { currentPalette, Field, Meadow, type PaletteName } from "@arrow-warfare/world";

import { Arrows } from "./arrows";
import { Controls } from "./controls";
import { FirstPerson } from "./firstperson";
import { Hud, nameTag } from "./hud";
import { Others } from "./others";
import { Replay } from "./replay";
import { Walker } from "./walker";
import sheet from "./style.css" with { type: "css" };

/** What play needs from the network. Without it (the view) everything stays on this phone. */
export type PlayNet = {
    /** The shared clock, in ms. */
    shared(): number;
    sendFast(peers: string[], data: ArrayBuffer): void;
    /** Returns a function that stops listening. */
    onFast(handler: (data: ArrayBuffer, sender: string) => void): () => void;
    /** Reliable, to each of `to` (me included: it comes straight back). */
    send(to: string[], type: string, payload: unknown): void;
    /** Returns a function that stops listening. */
    on(type: string, handler: (payload: any, sender: string) => void): () => void;
};

export type PlayOptions = {
    state: GameState;
    me: string;
    host: boolean;
    net?: PlayNet;
    sound?: Sound;
    onBack(): void;
    /** The host's: the round is over, here's how it went. */
    onEnd?(results: Results): void;
    /** The view: my phone judges hits on everyone, so the stand-ins can be shot. */
    bots?: boolean;
    /** Inside a box on a page (the view), not the whole screen. */
    contained?: boolean;
    /** The quiver as the rule says, even on this machine (where it's unlimited for developing). */
    ruleArrows?: boolean;
};

/** The insides, for the views and headless runs. Loosely typed: the types bundler can't follow Maps and Sets. */
export type PlayDebug = {
    /** A wound as if an arrow went in, `null` heals everything. */
    injure(zone: Zone | null): void;
    [inside: string]: any;
};

/** At most this many device pixels per CSS pixel, a 3x phone draws at half its resolution. */
const PIXELS = 1.5;
/** ms the host waits after a death before deciding the round, so a last trade of arrows is a draw. */
const SETTLE = 2200;
/** ms the winner is shown before the results. */
const SHOW_WINNER = 3200;

/** `point` and `direction` are in the hit part's own space, `at` is where in the world. */
type Hit = { arrow: string; victim: string; zone: Zone; part: string; point: Vec; direction: Vec; place: BodyPlace; at: Vec; distance: number; time: number };

/**
 * The round in first person. Everyone builds the same field from the state's seed and rules, starts at
 * their spawn, walks and shoots. Shots go to everyone and every phone flies them the same. Whoever is hit
 * says so (their pose is exact on their own phone), the host turns hits into deaths and calls the end.
 */
export function mountPlay(root: HTMLElement, options: PlayOptions) {
    adopt(sheet);
    const { me, host, onBack } = options;
    const net = options.net ?? loopback();
    let state = options.state;
    const sfx = options.sound ? new Sfx(options.sound) : null;

    const play = document.createElement("main");
    play.className = options.contained ? "aw-play contained" : "aw-play";
    const density = () => Math.min(window.devicePixelRatio || 1, PIXELS);
    play.innerHTML = `
        <canvas class="aw-play-canvas"></canvas>
        <div class="aw-play-names"></div>
        <p class="aw-play-hint">${t("play.hint")}</p>
        ${host ? `<pap-button class="aw-play-back" size="small" variant="outline">${t("play.back")}</pap-button>` : ""}
        <div class="aw-play-turn" role="status"><p>${t("play.turn")}</p></div>
    `;
    root.append(play);
    play.querySelector("pap-button")?.addEventListener("click", onBack);

    const engine = new GameEngine({ name: "main", query: ".aw-play-canvas", type: "webgl2", documentElement: play, contextSetting: { antialias: density() <= 1, powerPreference: "high-performance" } });
    const layer = engine.layers.main;
    // the canvas size is set by hand, the engine would use every device pixel (bugs.md)
    const size = () => {
        layer.setting.width = Math.max(1, Math.round(play.clientWidth * density()));
        layer.setting.height = Math.max(1, Math.round(play.clientHeight * density()));
        layer.resize();
        controls.placeBow(settings().bow, play.clientHeight);
    };
    const camera = new Camera({ fov: 1.1, near: .05, far: 220 });
    layer.camera = camera;
    const renderer = engine.add(new Renderer(layer));

    const field = new Field({ seed: state.seed, size: state.rules.size, trees: state.rules.trees });
    const coarse = matchMedia("(pointer: coarse)").matches;
    // the rule's time of day, or my own clock
    const time = state.rules.time;
    const meadow = engine.add(new Meadow(renderer, field, { palette: time && time !== "clock" ? time : currentPalette(), grass: coarse ? .7 : 1 }));
    const spawns = field.spawns(state.players);
    const walker = new Walker(field, spawns[me] ?? { x: 0, z: 0, yaw: 0 });
    const others = new Others(renderer, field, play.querySelector(".aw-play-names")!, me, spawns, state);
    const controls = new Controls(play);
    const hud = new Hud(play);
    const draw = new Draw();
    const injuries = (state.rules.damage ?? "injuries") === "injuries";
    const wounds = new Wounds();
    // my own body, never drawn: hits on me are judged against it, as others see it
    const myRig = new Rig((x, z) => field.height(x, z));
    const rigOf = (id: string) => id === me ? myRig : others.rigOf(id);

    const player = (id: string) => state.players.find(other => other.id === id);
    const colourOf = (id: string): Vec3 => {
        const found = player(id);
        return rgb(COLOURS[found ? wears(state, found) : 0].hex);
    };
    const tag = (id: string) => {
        const found = player(id);
        return nameTag(found?.name ?? "?", COLOURS[found ? wears(state, found) : 0].hex);
    };
    const mine = player(me);
    const firstPerson = new FirstPerson(renderer, rgb(SKINS[mine?.skin ?? 0] ?? SKINS[0]), colourOf(me), colourOf(me));
    const arrows = new Arrows(renderer, field, me, colourOf);
    const replay = new Replay();

    size();
    window.addEventListener("resize", size);
    const stopBow = effect(() => controls.placeBow(settings().bow, play.clientHeight));

    // ------------------------------------------------------------------ the round

    // unlimited while developing on this machine
    const local = ["localhost", "127.0.0.1"].includes(location.hostname) && !options.ruleArrows;
    let quiver = state.rules.arrows > 0 && !local ? state.rules.arrows : Infinity;
    let shots = 0;
    const dead = new Set<string>();
    let over = false;
    const start = state.go || net.shared();
    const tally = new Tally(start);
    // a round that starts with one side (testing alone) never ends by itself
    const sides = standing(state.players, []).length;
    let settle: ReturnType<typeof setTimeout> | undefined;
    let ending: ReturnType<typeof setTimeout> | undefined;
    const taken = new Set<string>();

    const everyone = () => state.players.map(other => other.id);
    const broadcast = (type: string, payload: unknown) => net.send(everyone(), type, payload);

    /** Volume and pan of something at `at`, as heard from the camera. */
    const heard = (at: Vec): { volume: number; pan: number } => {
        const m = camera.worldMatrix;
        const dx = at[0] - m[12], dy = at[1] - m[13], dz = at[2] - m[14];
        const distance = Math.hypot(dx, dy, dz) || 1;
        return { volume: 1 / (1 + distance / 9), pan: (m[0] * dx + m[1] * dy + m[2] * dz) / distance * .8 };
    };
    const sound = (name: SfxName, at?: Vec, volume = 1) => {
        if (!sfx) return;
        const where = at ? heard(at) : { volume: 1, pan: 0 };
        sfx.play(name, { volume: where.volume * volume, pan: where.pan });
    };
    const vibrate = (pattern: number | number[]) => {
        try { navigator.vibrate?.(pattern); } catch { /* not here */ }
    };

    const unlisten = [
        net.onFast((data, sender) => {
            const pose = unpackPose(data);
            if (!pose || !player(sender)) return;
            others.receive(sender, pose);
            if (!dead.has(sender)) replay.pose(sender, pose);
        }),

        net.on("shoot", (shot: Shot, sender) => {
            if (shot?.by !== sender || !player(sender) || ![shot.time, shot.x, shot.y, shot.z, shot.dx, shot.dy, shot.dz, shot.speed].every(Number.isFinite)) return;
            if (!arrows.add(shot)) return;
            replay.shot(shot);
            tally.shot(sender);
            if (sender !== me) sound("twang", [shot.x, shot.y, shot.z], .8);
        }),

        net.on("hit", (hit: Hit, sender) => {
            if (!hit || (hit.victim !== sender && !options.bots) || !ZONES.includes(hit.zone) || typeof hit.part !== "string") return;
            const arrow = arrows.stick(hit.arrow, hit.victim, hit.part, hit.point, hit.direction);
            if (!arrow) return;
            // arcade: every hit kills. Injuries: the head and torso do, arms and legs wound
            const lethal = !injuries || LETHAL.includes(hit.zone);
            const { victim } = hit;
            const time = Number.isFinite(hit.time) ? hit.time : net.shared();
            replay.hit({ arrow: hit.arrow, victim, zone: hit.zone, part: hit.part, point: hit.point, direction: hit.direction, place: hit.place, at: hit.at, time, lethal });
            tally.taken(victim);
            if (victim !== me) lethal ? others.kill(victim, hit.place) : others.hurt(victim, hit.zone);
            sound("body", hit.at);
            const shooter = arrow.shot.by;
            if (shooter === me && victim !== me)
            {
                // a strong shot lands harder, a kill harder still
                const power = powerOf(arrow.shot.speed);
                const size = lethal ? 1 : .5;
                hud.hit(lethal);
                walker.punch((.01 + .018 * power) * size, (.02 + .04 * power) * size);
                vibrate(lethal ? [20 + Math.round(25 * power), 40, 40 + Math.round(60 * power)] : 20 + Math.round(20 * power));
                if (lethal) sound("kill", undefined, .6 + .4 * power);
            }
            if (!lethal)
            {
                if (player(shooter)) tally.hit(shooter, hit.distance, false);
                hud.line(`${tag(shooter)} ${t(shooter === victim ? "hud.hitSelf" : "hud.hit")} ${shooter === victim ? "" : tag(victim)} ${t(`hud.zone.${hit.zone}`)}`);
            }
            else if (host && !dead.has(victim) && !over) broadcast("death", { id: victim, by: shooter, zone: hit.zone, distance: hit.distance, arrow: hit.arrow });
        }),

        net.on("death", ({ id, by, zone, distance, arrow }, sender) => {
            if (sender !== state.host || dead.has(id)) return;
            dead.add(id);
            replay.death({ id, by, arrow: String(arrow ?? ""), time: replay.hits.get(arrow)?.time ?? net.shared() });
            tally.death(id, net.shared());
            if (player(by)) tally.hit(by, Number(distance) || 0, true);
            hud.line(`${tag(by)} ${t(by === id ? "hud.shotSelf" : "hud.shot")} ${by === id ? "" : tag(id)} ${t(`hud.zone.${zone}`)}`);
            if (id === me) hud.say(t(by === me ? "hud.youSelf" : "hud.youDied", { name: player(by)?.name ?? "?" }), "lose");
            if (host) check();
        }),

        net.on("pick", ({ arrow: id }, sender) => {
            if (!host || over) return;
            const arrow = arrows.all.get(id);
            if (!arrow || !arrow.rest || arrow.gone || taken.has(id) || dead.has(sender) || !player(sender)) return;
            taken.add(id);
            broadcast("picked", { arrow: id, by: sender });
        }),

        net.on("picked", ({ arrow: id, by }, sender) => {
            if (sender !== state.host) return;
            arrows.remove(id);
            tally.picked(by);
            if (by !== me) return;
            if (Number.isFinite(quiver)) quiver++;
            sound("pickup");
        }),

        net.on("over", ({ winner }, sender) => {
            if (sender !== state.host) return;
            over = true;
            others.unarmed = true;
            draw.cancel();
            if (!winner) return hud.say(t("hud.draw"));
            const won = winner.kind === "player" ? winner.id === me : player(me)?.team === winner.id;
            if (winner.kind === "player") return hud.say(won ? t("hud.youWin") : t("hud.wins", { name: player(winner.id)?.name ?? "?" }), won ? "win" : "lose");
            const team = state.teams.find(other => other.id === winner.id);
            const name = team ? teamName(team) || t(`colour.${COLOURS[team.colour].name}`) : "?";
            hud.say(won ? t("hud.youWin") : t("hud.wins", { name }), won ? "win" : "lose");
        }),
    ];

    /** The host: once things settle, is there one side left? */
    const check = () => {
        if (!host || over) return;
        clearTimeout(settle);
        settle = setTimeout(() => {
            if (over || sides <= 1) return;
            const left = standing(state.players, [...dead]);
            if (left.length > 1) return;
            const results = tally.results(state.players, net.shared());
            broadcast("over", { winner: results.winner });
            ending = setTimeout(() => options.onEnd?.(results), SHOW_WINNER);
        }, SETTLE);
    };

    /** My bow lets go: an arrow from my eyes along where I look, sway and all. */
    const fire = (event: DrawEvent) => {
        if (!event || event.kind !== "shot" || quiver <= 0) return;
        quiver--;
        // from the arrow on my bow, else from my eyes along the view
        const m = camera.worldMatrix;
        const length = Math.hypot(m[8], m[9], m[10]) || 1;
        const forward: Vec = [-m[8] / length, -m[9] / length, -m[10] / length];
        const release = firstPerson.release ?? { from: [m[12] + forward[0] * .3, m[13] + forward[1] * .3, m[14] + forward[2] * .3] as Vec, direction: forward };
        const shot: Shot = {
            id: `${me}:${++shots}`, by: me, time: net.shared(),
            x: release.from[0], y: release.from[1], z: release.from[2],
            dx: release.direction[0], dy: release.direction[1], dz: release.direction[2],
            speed: speedOf(event.power),
        };
        broadcast("shoot", shot);
        firstPerson.shot();
        walker.punch(-.006);
        sound("twang", undefined, .5 + event.power * .5);
        if (event.slipped)
        {
            sound("pant");
            vibrate(60);
        }
    };

    /** I was hit: I decide it, and tell everyone. */
    const struck = (hit: Hit) => {
        broadcast("hit", hit);
        if (hit.victim !== me) return;
        if (injuries && !LETHAL.includes(hit.zone))
        {
            // a wound: it hurts, the shot still counts
            wounds.hurt(hit.zone);
            walker.punch(.03, .04);
            walker.shake(.008, .25);
            vibrate(90);
            sound("pant", undefined, .7);
            return;
        }
        wounds.hits++;
        walker.alive = false;
        draw.cancel();
        walker.punch(.05, .08);
        walker.shake(.012, .35);
        vibrate(180);
    };

    /** An arrow out of me, into my quiver: the host settles it like a pick up. The wound stays. */
    const pullOut = () => {
        const stuck = arrows.in(me).filter(arrow => !taken.has(arrow.shot.id));
        if (!walker.alive || over || draw.phase === "drawing" || !stuck.length) return;
        net.send([state.host], "pick", { arrow: stuck[stuck.length - 1].shot.id });
        walker.shake(.006, .2);
        sound("pant", undefined, .5);
    };
    hud.onPull = pullOut;

    // ------------------------------------------------------------------ every frame

    const hint = play.querySelector<HTMLElement>(".aw-play-hint")!;
    let sent = 0;
    let recorded = 0;
    let wanted = false;
    let creak = 0;
    // a game object, so it runs before the frame is drawn and the camera is where I am now
    const driver = engine.add(new class extends GameObject {
        override update(delta: number) {
            tick(Math.min(delta, .1));
        }
    }());
    const tick = (dt: number) => {
        const now = net.shared();
        const alive = walker.alive && !over;
        // what my wounds leave me
        wounds.update(dt, walker.speed);
        walker.posture = walker.alive ? wounds.posture : "stand";
        walker.limit = wounds.walk;
        draw.rate = wounds.drawRate < 1 ? wounds.drawRate / KEY_DRAW : Infinity;
        draw.shake = wounds.shake;
        walker.update(dt, controls, settings().sensitivity, draw);
        walker.place(camera, draw);

        // the bow: the thumb on its button, or space
        const want = alive && (controls.thumb || controls.space);
        if (want && !wanted)
        {
            if (quiver <= 0) sound("empty");
            else draw.start(quiver);
        }
        wanted = want;
        if (draw.phase === "drawing")
        {
            if (controls.thumb) draw.pull(controls.pull, dt);
            else if (controls.space) draw.hold(dt);
            if (!want) fire(draw.release());
            // a creak each step of the pull
            const step = Math.floor(draw.amount * 5);
            if (step > creak) sound("creak", undefined, .3 + draw.amount * .4);
            creak = step;
        }
        else creak = 0;
        fire(draw.update(dt));

        firstPerson.update(dt, camera, draw, { speed: walker.speed, stride: walker.stride, alive: walker.alive }, quiver, settings().hand === "left");
        others.frame(now, dt, camera, play.clientWidth, play.clientHeight);
        myRig.update(dt, {
            x: walker.x, y: walker.y, z: walker.z, yaw: walker.yaw, pitch: walker.pitch,
            draw: draw.phase === "drawing" ? draw.amount : 0, left: settings().hand === "left", stage: draw.stage,
            wounds: wounds.bits, resting: wounds.resting, dead: !walker.alive, tip: 0,
        });

        // arrows, and the bodies my phone judges
        const judge = walker.alive ? [{ id: me, rig: myRig }] : [];
        if (options.bots) judge.push(...others.living.filter(other => !dead.has(other.id)));
        const flown = arrows.update(now, judge);
        for (const landed of flown.landed) sound(landed.kind === "ground" ? "ground" : "wood", [landed.arrow.x, landed.arrow.y, landed.arrow.z]);
        for (const { arrow, id, hit, place, local, at } of flown.struck)
        {
            const distance = Math.hypot(at[0] - arrow.shot.x, at[2] - arrow.shot.z);
            struck({ arrow: arrow.shot.id, victim: id, zone: hit.zone, part: hit.part, point: local.point, direction: local.direction, place: { x: place.x, y: place.y, z: place.z, yaw: place.yaw }, at, distance, time: arrow.at });
        }
        arrows.draw(now, rigOf, [camera.worldMatrix[12], camera.worldMatrix[13], camera.worldMatrix[14]]);

        // picking up: a tap near an arrow in reach, never while drawing
        const width = play.clientWidth, height = play.clientHeight;
        const canPick = alive && draw.phase !== "drawing";
        const radius = Math.max(60, height * .14);
        for (const [x, y] of controls.taps())
        {
            if (!canPick) continue;
            const id = arrows.pickable(x, y, radius, walker.body, now, camera, width, height, rigOf);
            if (id) net.send([state.host], "pick", { arrow: id });
        }
        hud.pickable(canPick && controls.locked && !!arrows.pickable(width / 2, height / 2, radius * .6, walker.body, now, camera, width, height, rigOf));
        for (let i = controls.pulls(); i > 0; i--) pullOut();

        hud.arrows(quiver);
        hud.tired(draw.tunnel);
        hud.damage(wounds.hits);
        hud.wounds(wounds.bits, injuries);
        hud.energy(wounds.energy, wounds.resting);
        hud.pull(alive && draw.phase !== "drawing" ? arrows.in(me).filter(arrow => !taken.has(arrow.shot.id)).length : 0);
        const left = standing(state.players, [...dead]).length;
        hud.standing(t("hud.left", { count: String(left) }));
        controls.bow.hidden = !alive;
        controls.bow.disabled = quiver <= 0 || draw.phase === "panting";
        hint.hidden = coarse || controls.locked;

        const pose = {
            time: now, x: walker.x, y: walker.y, z: walker.z, yaw: walker.yaw, pitch: walker.pitch, speed: walker.speed,
            draw: draw.phase === "drawing" ? draw.amount : 0, stage: draw.stage, left: settings().hand === "left",
            wounds: wounds.bits, resting: wounds.resting,
        };
        // mine, a little more often than it's sent, while I'm alive
        if (walker.alive && now - recorded >= 1000 / 30)
        {
            recorded = now;
            replay.pose(me, pose);
        }
        if (now - sent >= 1000 / POSE_RATE && walker.alive)
        {
            sent = now;
            net.sendFast(everyone().filter(id => id !== me), packPose(pose));
        }
    };
    engine.start();

    // phones play sideways, a fullscreen page can be held there
    (screen.orientation as ScreenOrientation & { lock?(orientation: string): Promise<void> })?.lock?.("landscape").catch(() => undefined);

    /** The insides, for the views and headless runs: also on the element as `debug`. */
    const debug: PlayDebug = {
        walker, draw, arrows, others, hud, replay, firstPerson, wounds, myRig, get quiver() { return quiver; }, get dead() { return [...dead]; },
        /** The view's "injure me": a wound as if an arrow went in, or `null` heals everything. */
        injure(zone: Zone | null) {
            if (!zone) return wounds.heal();
            if (!LETHAL.includes(zone)) wounds.hurt(zone);
        },
    };
    Object.defineProperty(play, "debug", { value: debug });

    return {
        element: play,
        debug,
        /** Another time of day, straight away (the view). */
        palette(name: PaletteName | "clock") {
            meadow.palette(name === "clock" ? currentPalette() : name);
        },
        /** Players who left are gone and count as out, nothing else about the field changes mid round. */
        update(next: GameState) {
            state = next;
            others.update(next);
            if (host) check();
        },
        remove() {
            for (const stop of unlisten) stop();
            stopBow();
            clearTimeout(settle);
            clearTimeout(ending);
            window.removeEventListener("resize", size);
            engine.stop();
            controls.destroy();
            others.destroy();
            arrows.destroy();
            firstPerson.destroy();
            hud.destroy();
            engine.remove(driver);
            engine.remove(meadow);
            engine.remove(renderer);
            renderer.gl.getExtension("WEBGL_lose_context")?.loseContext();
            play.remove();
        },
    };

    /** Alone, for the view: messages to me come straight back, the clock is mine. */
    function loopback(): PlayNet {
        const handlers = new Map<string, ((payload: any, sender: string) => void)[]>();
        return {
            shared: () => performance.now(),
            sendFast: () => undefined,
            onFast: () => () => undefined,
            send(to, type, payload) {
                if (!to.includes(me)) return;
                for (const handler of handlers.get(type) ?? []) handler(structuredClone(payload), me);
            },
            on(type, handler) {
                handlers.set(type, [...(handlers.get(type) ?? []), handler]);
                return () => handlers.set(type, (handlers.get(type) ?? []).filter(other => other !== handler));
            },
        };
    }
}
