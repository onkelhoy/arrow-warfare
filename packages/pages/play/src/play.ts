import "@papit/button";
import { Camera, GameEngine, GameObject } from "@papit/game-engine";
import { effect } from "@papit/signals";
import { Draw, powerOf, speedOf, standing, Tally, toWorld, ZONES, type BodyPlace, type DrawEvent, type Shot, type Vec, type Zone } from "@arrow-warfare/archery";
import { adopt, COLOURS, settings, SKINS, t, teamName, wears, type GameState, type Results } from "@arrow-warfare/core";
import { packPose, POSE_RATE, unpackPose } from "@arrow-warfare/net";
import { Renderer, rgb, type Vec3 } from "@arrow-warfare/render";
import { Sfx, type SfxName, type Sound } from "@arrow-warfare/sound";
import { currentPalette, Field, Meadow } from "@arrow-warfare/world";

import { Arrows } from "./arrows";
import { Controls } from "./controls";
import { FirstPerson } from "./firstperson";
import { Hud, nameTag } from "./hud";
import { Others } from "./others";
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
};

/** At most this many device pixels per CSS pixel, a 3x phone draws at half its resolution. */
const PIXELS = 1.5;
/** ms the host waits after a death before deciding the round, so a last trade of arrows is a draw. */
const SETTLE = 2200;
/** ms the winner is shown before the results. */
const SHOW_WINNER = 3200;

type Hit = { arrow: string; victim: string; zone: Zone; point: Vec; direction: Vec; place: BodyPlace; distance: number };

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
    play.className = "aw-play";
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
    const meadow = engine.add(new Meadow(renderer, field, { palette: currentPalette(), grass: coarse ? .7 : 1 }));
    const spawns = field.spawns(state.players);
    const walker = new Walker(field, spawns[me] ?? { x: 0, z: 0, yaw: 0 });
    const others = new Others(renderer, field, play.querySelector(".aw-play-names")!, me, spawns, state);
    const controls = new Controls(play);
    const hud = new Hud(play);
    const draw = new Draw();

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

    size();
    window.addEventListener("resize", size);
    const stopBow = effect(() => controls.placeBow(settings().bow, play.clientHeight));

    // ------------------------------------------------------------------ the round

    // unlimited while developing on this machine
    const local = ["localhost", "127.0.0.1"].includes(location.hostname);
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
            if (pose) others.receive(sender, pose);
        }),

        net.on("shoot", (shot: Shot, sender) => {
            if (shot?.by !== sender || !player(sender) || ![shot.time, shot.x, shot.y, shot.z, shot.dx, shot.dy, shot.dz, shot.speed].every(Number.isFinite)) return;
            if (!arrows.add(shot)) return;
            tally.shot(sender);
            if (sender !== me) sound("twang", [shot.x, shot.y, shot.z], .8);
        }),

        net.on("hit", (hit: Hit, sender) => {
            if (!hit || (hit.victim !== sender && !options.bots) || !ZONES.includes(hit.zone)) return;
            const arrow = arrows.stick(hit.arrow, hit.victim, hit.point, hit.direction);
            if (!arrow) return;
            if (hit.victim !== me) others.kill(hit.victim, hit.place);
            sound("body", toWorld(hit.place, hit.point));
            const shooter = arrow.shot.by;
            if (shooter === me && hit.victim !== me)
            {
                // a kill: every hit is one, until injuries. A strong shot lands harder
                const power = powerOf(arrow.shot.speed);
                hud.hit(true);
                walker.punch(.01 + .018 * power, .02 + .04 * power);
                vibrate([20 + Math.round(25 * power), 40, 40 + Math.round(60 * power)]);
                sound("kill", undefined, .6 + .4 * power);
            }
            if (host && !dead.has(hit.victim) && !over) broadcast("death", { id: hit.victim, by: shooter, zone: hit.zone, distance: hit.distance });
        }),

        net.on("death", ({ id, by, zone, distance }, sender) => {
            if (sender !== state.host || dead.has(id)) return;
            dead.add(id);
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
        walker.alive = false;
        draw.cancel();
        walker.punch(.05, .08);
        walker.shake(.012, .35);
        vibrate(180);
    };

    // ------------------------------------------------------------------ every frame

    const hint = play.querySelector<HTMLElement>(".aw-play-hint")!;
    let sent = 0;
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
            if (controls.thumb) draw.pull(controls.pull);
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

        // arrows, and the bodies my phone judges
        const bodyOf = (id: string) => id === me ? { ...walker.body, tip: 0 } : others.bodyOf(id);
        const judge = walker.alive ? [{ id: me, place: walker.body }] : [];
        if (options.bots) judge.push(...others.living.filter(other => !dead.has(other.id)));
        const flown = arrows.update(now, judge);
        for (const landed of flown.landed) sound(landed.kind === "ground" ? "ground" : "wood", [landed.arrow.x, landed.arrow.y, landed.arrow.z]);
        for (const { arrow, id, hit, place } of flown.struck)
        {
            const point = toWorld(place, hit.point);
            const distance = Math.hypot(point[0] - arrow.shot.x, point[2] - arrow.shot.z);
            struck({ arrow: arrow.shot.id, victim: id, zone: hit.zone, point: hit.point, direction: hit.direction, place: { x: place.x, y: place.y, z: place.z, yaw: place.yaw }, distance });
        }
        arrows.draw(now, bodyOf, [camera.worldMatrix[12], camera.worldMatrix[13], camera.worldMatrix[14]]);

        // picking up: a tap near an arrow in reach, never while drawing
        const width = play.clientWidth, height = play.clientHeight;
        const canPick = alive && draw.phase !== "drawing";
        const radius = Math.max(60, height * .14);
        for (const [x, y] of controls.taps())
        {
            if (!canPick) continue;
            const id = arrows.pickable(x, y, radius, walker.body, now, camera, width, height, bodyOf);
            if (id) net.send([state.host], "pick", { arrow: id });
        }
        hud.pickable(canPick && controls.locked && !!arrows.pickable(width / 2, height / 2, radius * .6, walker.body, now, camera, width, height, bodyOf));

        hud.arrows(quiver);
        hud.tired(draw.tunnel);
        const left = standing(state.players, [...dead]).length;
        hud.standing(t("hud.left", { count: String(left) }));
        controls.bow.hidden = !alive;
        controls.bow.disabled = quiver <= 0 || draw.phase === "panting";
        hint.hidden = coarse || controls.locked;

        if (now - sent >= 1000 / POSE_RATE)
        {
            sent = now;
            const peers = everyone().filter(id => id !== me);
            net.sendFast(peers, packPose({
                time: now, x: walker.x, y: walker.y, z: walker.z, yaw: walker.yaw, pitch: walker.pitch, speed: walker.speed,
                draw: draw.phase === "drawing" ? draw.amount : 0, stage: draw.stage, left: settings().hand === "left",
            }));
        }
    };
    engine.start();

    // phones play sideways, a fullscreen page can be held there
    (screen.orientation as ScreenOrientation & { lock?(orientation: string): Promise<void> })?.lock?.("landscape").catch(() => undefined);

    /** The insides, for the views and headless runs: also on the element as `debug`. */
    const debug = { walker, draw, arrows, others, hud, firstPerson, get quiver() { return quiver; }, dead };
    Object.defineProperty(play, "debug", { value: debug });

    return {
        element: play,
        debug,
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
