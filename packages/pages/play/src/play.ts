import "@papit/button";
import { mountChat } from "@arrow-warfare/chat";
import { Camera, GameEngine, GameObject } from "@papit/game-engine";
import { effect } from "@papit/signals";
import { Draw, heading, KEY_DRAW, LETHAL, powerOf, speedOf, standing, Tally, Wounds, ZONES, type BodyPlace, type DrawEvent, type Shot, type Vec, type Zone } from "@arrow-warfare/archery";
import { adopt, CHAT_LENGTH, COLOURS, settings, SKINS, t, teamName, wears, type GameState, type Results } from "@arrow-warfare/core";
import { packPose, POSE_RATE, unpackPose } from "@arrow-warfare/net";
import { Renderer, rgb, type Vec3 } from "@arrow-warfare/render";
import { Rig } from "@arrow-warfare/rig";
import { Sfx, type SfxName, type Sound } from "@arrow-warfare/sound";
import { currentPalette, Field, Meadow, type PaletteName } from "@arrow-warfare/world";

import { Arrows } from "./arrows";
import { Blood } from "./blood";
import { aim, Film } from "./cinema";
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
/** ms the winner is shown before the results, after the last kill cam. */
const SHOW_WINNER = 3200;
/** ms from the end of the round to the results with a winner: the last kill cam, then the circle. */
const FINAL_SHOW = 15_000;
/** Seconds the winners take to walk up beside the shooter. */
const WALK_UP = 1.6;
/** A medieval horn with a little banner hanging from it, in the winner's colour. */
const HORN = `<svg class="aw-play-horn" viewBox="0 0 120 220" aria-hidden="true">
    <path class="banner" d="M38 92 L78 86 L80 150 L60 138 L42 156 Z"/>
    <path class="body" d="M58 214 C54 170 44 120 30 70 C22 44 14 26 4 14 L40 2 C42 22 46 46 52 76 C62 124 68 170 66 214 Z"/>
    <path class="ring" d="M28 62 L50 56 M38 112 L56 108 M48 170 L64 168"/>
    <ellipse class="bell" cx="22" cy="8" rx="20" ry="7" transform="rotate(-18 22 8)"/>
</svg>`;
/** Seconds of the spirit leaving my body. */
const SPIRIT = 1.5;
/** How far a body tips over when it dies (as in `others`). */
const FALL = Math.PI / 2 * .94;

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
        <div class="aw-play-spirit"></div>
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
        controls.placeBow(settings().bow, play.clientWidth);
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
    others.onStep = at => sound("step", at, .6);
    const controls = new Controls(play);
    const hud = new Hud(play);
    const draw = new Draw();
    const injuries = (state.rules.damage ?? "injuries") === "injuries";
    const friendly = state.rules.friendly !== false;
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
    // the chat of the dead: only they send and see it
    const deadChat = document.createElement("div");
    deadChat.className = "aw-play-dead";
    deadChat.hidden = true;
    deadChat.innerHTML = `<button class="aw-play-dead-toggle" type="button">${t("chat.dead")}</button><div class="aw-play-dead-panel" hidden></div>`;
    play.append(deadChat);
    const deadToggle = deadChat.querySelector<HTMLButtonElement>("button")!;
    const deadPanel = deadChat.querySelector<HTMLElement>(".aw-play-dead-panel")!;
    const chat = mountChat(deadPanel, text => {
        const to = [...new Set([...dead, me])];
        net.send(to, "deadchat", { text });
    }, { all: t("chat.dead") });
    deadToggle.addEventListener("click", () => {
        deadPanel.hidden = !deadPanel.hidden;
        deadToggle.classList.remove("unread");
    });
    const firstPerson = new FirstPerson(renderer, rgb(SKINS[mine?.skin ?? 0] ?? SKINS[0]), colourOf(me), colourOf(me));
    const arrows = new Arrows(renderer, field, me, colourOf);
    const replay = new Replay();
    const blood = new Blood(renderer, field);

    size();
    window.addEventListener("resize", size);
    const stopBow = effect(() => controls.placeBow(settings().bow, play.clientWidth));

    // keep the screen awake while playing, again when coming back to the tab
    let wake: WakeLockSentinel | null = null;
    let playing = true;
    const awake = () => {
        if (!playing || document.visibilityState !== "visible" || !("wakeLock" in navigator)) return;
        navigator.wakeLock.request("screen").then(lock => {
            if (playing) wake = lock;
            else lock.release().catch(() => undefined);
        }).catch(() => undefined);
    };
    awake();
    document.addEventListener("visibilitychange", awake);

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
    const sound = (name: SfxName, at?: Vec, volume = 1, rate = 1) => {
        if (!sfx) return;
        const where = at ? heard(at) : { volume: 1, pan: 0 };
        sfx.play(name, { volume: where.volume * volume, pan: where.pan, rate });
    };
    const vibrate = (pattern: number | number[]) => {
        try { navigator.vibrate?.(pattern); } catch { /* not here */ }
    };

    // ------------------------------------------------------------------ what the camera shows

    /**
     * play: my eyes. spirit: I just died, the camera leaves my body. film: the kill cam. watch: following
     * someone alive, in third person. circle: the end, around the winners.
     */
    type View = "play" | "spirit" | "film" | "watch" | "circle";
    let view: View = "play";
    const mySkin = rgb(SKINS[mine?.skin ?? 0] ?? SKINS[0]);
    const lookOf = (id: string) => id === me ? { clothes: colourOf(me), skin: mySkin } : others.lookOf(id);
    const myPose = () => ({
        time: net.shared(), x: walker.x, y: walker.y, z: walker.z, yaw: walker.yaw, pitch: walker.pitch, speed: 0,
        draw: 0, stage: 0, left: settings().hand === "left", wounds: wounds.bits, resting: wounds.resting,
    });
    const film = new Film({
        renderer, field, camera, replay, arrows, blood, lookOf,
        fallback: id => id === me ? myPose() : others.poseOf(id),
        sound: (name, at, volume, rate) => sound(name, at, volume, rate),
    });
    /** The spirit leaving: from where my eyes were, the way I faced. */
    const spirit = { time: 0, from: [0, 0, 0] as Vec, yaw: 0 };
    /** A kill cam waiting for its hit to arrive (the host's death can come before the victim's hit). */
    let queued: { victim: string; killer: string; arrow: string; until: number } | null = null;
    let watching: string | null = null;
    const watchEye: Vec = [0, 0, 0];
    const watchLook: Vec = [0, 0, 0];
    /** The death that ended the round, and whether its kill cam has been shown. */
    let finalDeath: string | null = null;
    let finalShown = false;
    let winner: Results["winner"] = null;
    /** How far my body has tipped over. */
    let myTip = 0;

    const setView = (next: View) => {
        view = next;
        play.classList.toggle("film", next === "film");
        play.classList.toggle("spirit", next === "spirit");
        play.classList.toggle("out", next !== "play");
        others.hidden = next === "film";
        firstPerson.hidden = next !== "play";
        hud.skippable(next === "film" || next === "spirit");
        if (next !== "watch") hud.watching("");
        options.sound?.dip(next === "film" || next === "spirit" || next === "circle");
    };

    /** The kill cam of `victim`'s death, once this phone has the hit. */
    const startFilm = (victim: string, killer: string, arrow: string) => {
        if (!replay.hits.has(arrow) && net.shared() < (queued?.until ?? Infinity))
        {
            queued ??= { victim, killer, arrow, until: net.shared() + 1200 };
            return;
        }
        queued = null;
        if (over && finalDeath === victim) finalShown = true;
        if (film.start(victim, killer, arrow))
        {
            hud.say("");
            setView("film");
            return;
        }
        afterFilm(victim, killer);
    };

    /** After a kill cam: the final one if it's still to come, the end, or watching the killer. */
    const afterFilm = (victim: string, killer: string) => {
        if (over)
        {
            const last = finalDeath ? replay.deaths.get(finalDeath) : null;
            if (!finalShown && last)
            {
                finalShown = true;
                return startFilm(last.id, last.by, last.arrow);
            }
            return finale();
        }
        if (walker.alive) return setView("play");
        watch(killer !== victim && !dead.has(killer) ? killer : null);
    };

    /** The ones still standing that I can watch, my team first. */
    const watchable = () => {
        const team = player(me)?.team;
        const alive = state.players.filter(other => other.id !== me && !dead.has(other.id) && others.poseOf(other.id));
        return [...alive.filter(other => team && other.team === team), ...alive.filter(other => !team || other.team !== team)].map(other => other.id);
    };

    const watch = (target: string | null) => {
        const list = watchable();
        const was = watching;
        watching = target && list.includes(target) ? target : list[0] ?? null;
        if (view !== "watch" || was !== watching)
        {
            const pose = watching ? others.poseOf(watching) : null;
            // from where the camera is, it swoops over to them
            const m = camera.worldMatrix;
            watchEye.splice(0, 3, m[12], m[13], m[14]);
            if (pose) watchLook.splice(0, 3, pose.x, pose.y + 1, pose.z);
        }
        setView("watch");
        hud.watching(watching ? `${t("hud.watching", { name: tag(watching) })} · ${t("hud.switch")}` : "");
    };

    /** The end: the winners, standing together, the camera low and going round them. */
    const circle = {
        time: 0, members: [] as { id: string; from: Vec; to: Vec; yaw: number }[], centre: [0, 0, 0] as Vec, angle: 0, radius: 4,
        shown: false,
    };
    const winnerSign = document.createElement("div");
    winnerSign.className = "aw-play-winner";
    winnerSign.hidden = true;
    play.append(winnerSign);
    const horns = document.createElement("div");
    horns.className = "aw-play-horns";
    horns.innerHTML = HORN + HORN;
    play.append(horns);

    /** The round is over and its last kill cam shown: who won. */
    const finale = () => {
        const members = winner ? state.players.filter(other => !dead.has(other.id) && (winner!.kind === "player" ? other.id === winner!.id : other.team === winner!.id)).map(other => other.id) : [];
        const at = (id: string) => id === me ? myPose() : others.poseOf(id);
        if (!winner || !members.some(at))
        {
            setView(walker.alive ? "play" : "watch");
            if (!walker.alive) watch(watching);
            return hud.say(winner ? t("hud.wins", { name: winnerName() }) : t("hud.draw"), winner ? "win" : "");
        }
        // the one who fired the last shot in the middle, the rest walk up beside them
        const shooter = finalDeath ? replay.deaths.get(finalDeath)?.by : undefined;
        const leader = members.includes(shooter ?? "") && at(shooter!) ? shooter! : members.find(at)!;
        const place = at(leader)!;
        const right: Vec = [Math.cos(place.yaw), 0, -Math.sin(place.yaw)];
        const order = [leader, ...members.filter(id => id !== leader && at(id))];
        circle.members = order.map((id, i) => {
            const now = at(id)!;
            const step = Math.ceil(i / 2) * 1.05 * (i % 2 ? 1 : -1);
            const x = place.x + right[0] * step, z = place.z + right[2] * step;
            return { id, from: [now.x, now.y, now.z], to: [x, field.height(x, z), z], yaw: place.yaw };
        });
        const xs = circle.members.map(member => member.to);
        circle.centre = [xs.reduce((sum, p) => sum + p[0], 0) / xs.length, place.y, xs.reduce((sum, p) => sum + p[2], 0) / xs.length];
        circle.radius = 3.4 + .55 * xs.length;
        circle.angle = place.yaw;
        circle.time = 0;
        circle.shown = false;
        hud.say("");
        others.names = false;
        winnerSign.textContent = t("hud.wins", { name: winnerName() });
        const team = winner.kind === "team" ? state.teams.find(other => other.id === winner!.id) : null;
        winnerSign.style.setProperty("--colour", COLOURS[team ? team.colour : player(leader) ? wears(state, player(leader)!) : 0].hex);
        horns.style.setProperty("--colour", winnerSign.style.getPropertyValue("--colour"));
        setView("circle");
    };

    const winnerName = () => {
        if (!winner) return "";
        if (winner.kind === "player") return player(winner.id)?.name ?? "?";
        const team = state.teams.find(other => other.id === winner!.id);
        return team ? teamName(team) || t(`colour.${COLOURS[team.colour].name}`) : "?";
    };

    /** Where on the screen a point in the world is, null behind the camera. */
    const onScreen = (p: Vec): [number, number] | null => {
        const v = camera.viewMatrix, q = camera.projectionMatrix;
        const x = v[0] * p[0] + v[4] * p[1] + v[8] * p[2] + v[12], y = v[1] * p[0] + v[5] * p[1] + v[9] * p[2] + v[13], z = v[2] * p[0] + v[6] * p[1] + v[10] * p[2] + v[14];
        const cx = q[0] * x + q[4] * y + q[8] * z + q[12], cy = q[1] * x + q[5] * y + q[9] * z + q[13], w = q[3] * x + q[7] * y + q[11] * z + q[15];
        if (w <= .05) return null;
        return [(cx / w * .5 + .5) * play.clientWidth, (1 - (cy / w * .5 + .5)) * play.clientHeight];
    };

    /** A tap anywhere: skips the kill cam, or watches the next player. */
    const tapped = () => {
        if (view === "spirit") spirit.time = SPIRIT;
        else if (view === "film")
        {
            film.skip();
            afterFilm(film.victim, film.killer);
        }
        else if (view === "watch")
        {
            const list = watchable();
            watch(list[(list.indexOf(watching ?? "") + 1) % Math.max(1, list.length)] ?? null);
        }
    };

    /** The camera for the views that aren't my eyes, each frame. */
    const direct = (dt: number) => {
        if (queued && (replay.hits.has(queued.arrow) || net.shared() >= queued.until)) startFilm(queued.victim, queued.killer, queued.arrow);
        if (view === "spirit")
        {
            spirit.time += dt;
            const u = Math.min(1, spirit.time / (SPIRIT - .3));
            const e = u * u * (3 - 2 * u);
            const forward: Vec = [-Math.sin(spirit.yaw), 0, -Math.cos(spirit.yaw)];
            const body: Vec = [walker.x, walker.y + .45, walker.z];
            const out: Vec = [body[0] - forward[0] * 1.9, body[1] + 1.75, body[2] - forward[2] * 1.9];
            const eye: Vec = [spirit.from[0] + (out[0] - spirit.from[0]) * e, spirit.from[1] + (out[1] - spirit.from[1]) * e, spirit.from[2] + (out[2] - spirit.from[2]) * e];
            const ahead: Vec = [spirit.from[0] + forward[0] * 4, spirit.from[1], spirit.from[2] + forward[2] * 4];
            const k = Math.min(1, e * 1.4);
            aim(camera, eye, [ahead[0] + (body[0] - ahead[0]) * k, ahead[1] + (body[1] - ahead[1]) * k, ahead[2] + (body[2] - ahead[2]) * k], (1 - e) * .3);
            if (spirit.time >= SPIRIT && !queued)
            {
                const death = replay.deaths.get(me);
                const hit = [...replay.hits.values()].find(other => other.victim === me && other.lethal);
                const arrow = death?.arrow || hit?.arrow || "";
                startFilm(me, death?.by ?? arrows.all.get(arrow)?.shot.by ?? me, arrow);
            }
        }
        else if (view === "film")
        {
            film.update(dt);
            if (film.done) afterFilm(film.victim, film.killer);
        }
        else if (view === "circle")
        {
            circle.time += dt;
            // the others walk up to their places beside the shooter, then they all turn to face the same way
            const walk = Math.min(1, circle.time / WALK_UP);
            for (const member of circle.members)
            {
                const e = walk * walk * (3 - 2 * walk);
                const x = member.from[0] + (member.to[0] - member.from[0]) * e, z = member.from[2] + (member.to[2] - member.from[2]) * e;
                const moving = Math.hypot(member.to[0] - member.from[0], member.to[2] - member.from[2]) > .2 && walk < 1;
                const yaw = moving ? Math.atan2(-(member.to[0] - member.from[0]), -(member.to[2] - member.from[2])) : member.yaw;
                if (member.id === me)
                {
                    walker.x = x;
                    walker.z = z;
                    walker.y = field.height(x, z);
                    walker.yaw = yaw;
                    walker.pitch = 0;
                }
                else others.override.set(member.id, { time: net.shared(), x, y: field.height(x, z), z, yaw, pitch: .15, speed: moving ? 2.5 : 0, draw: 0, stage: 0, left: false, wounds: 0, resting: false });
            }
            // low, looking up at them, going round
            circle.angle += dt * .32;
            const [cx, cy, cz] = circle.centre;
            const eye: Vec = [cx - Math.sin(circle.angle) * circle.radius, 0, cz - Math.cos(circle.angle) * circle.radius];
            eye[1] = Math.max(cy + .65, field.height(eye[0], eye[2]) + .65);
            aim(camera, eye, [cx, cy + 1.05, cz]);
            if (circle.time >= WALK_UP && !circle.shown)
            {
                circle.shown = true;
                winnerSign.hidden = false;
                horns.classList.add("up");
                sound("fanfare");
            }
            const top = onScreen([cx, cy + 2.05, cz]);
            if (top) winnerSign.style.transform = `translate(${top[0].toFixed(1)}px, ${top[1].toFixed(1)}px) translate(-50%, -100%)`;
        }
        else if (view === "watch")
        {
            const pose = watching ? others.poseOf(watching) : null;
            if (watching && (!pose || dead.has(watching))) return watch(null);
            if (!pose) return;
            const forward: Vec = [-Math.sin(pose.yaw), 0, -Math.cos(pose.yaw)];
            const low = pose.resting || (pose.wounds & 12) === 12;
            const want: Vec = [pose.x - forward[0] * 3.4, pose.y + (low ? 1.5 : 2.1), pose.z - forward[2] * 3.4];
            want[1] = Math.max(want[1], field.height(want[0], want[2]) + .6);
            const look: Vec = [pose.x + forward[0] * 2.5, pose.y + (low ? .6 : 1), pose.z + forward[2] * 2.5];
            const k = 1 - Math.exp(-dt * 3.5);
            for (let i = 0; i < 3; i++)
            {
                watchEye[i] += (want[i] - watchEye[i]) * k;
                watchLook[i] += (look[i] - watchLook[i]) * k * 1.6;
            }
            aim(camera, watchEye, watchLook);
        }
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
            sound("grunt", hit.at, lethal ? 1 : .7, .9 + Math.random() * .25);
            blood.spray(hit.at, heading(arrow), powerOf(arrow.shot.speed));
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
            if (by === me && id !== me) kills++;
            hud.line(`${tag(by)} ${t(by === id ? "hud.shotSelf" : "hud.shot")} ${by === id ? "" : tag(id)} ${t(`hud.zone.${zone}`)}`);
            if (id === me) hud.say(t(by === me ? "hud.youSelf" : "hud.youDied", { name: player(by)?.name ?? "?" }), "lose");
            // the one I watch went down: I see it as they did, then follow who got them
            if (id === watching && view === "watch") startFilm(id, by, String(arrow ?? ""));
            if (host) check();
        }),

        net.on("deadchat", ({ text }, sender) => {
            const found = player(sender);
            // only the dead talk, and only the dead listen
            if (!found || walker.alive || (!dead.has(sender) && sender !== me) || typeof text !== "string") return;
            const clean = text.replace(/\s+/g, " ").trim().slice(0, CHAT_LENGTH);
            if (!clean) return;
            chat.add({ from: sender, name: found.name, colour: wears(state, found), text: clean, team: false });
            if (deadPanel.hidden) deadToggle.classList.add("unread");
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

        net.on("over", ({ winner: won, last }, sender) => {
            if (sender !== state.host || over) return;
            over = true;
            others.unarmed = true;
            draw.cancel();
            winner = won ?? null;
            finalDeath = typeof last === "string" ? last : null;
            // everyone sees the last kill: those in a kill cam see it once theirs is over
            if ((view === "film" && film.victim === finalDeath) || (view === "spirit" && finalDeath === me)) finalShown = true;
            if (view === "film" || view === "spirit" || queued) return;
            const death = finalDeath ? replay.deaths.get(finalDeath) : null;
            if (!death) return finale();
            finalShown = true;
            startFilm(death.id, death.by, death.arrow);
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
            const last = [...replay.deaths.values()].sort((a, b) => b.time - a.time)[0];
            broadcast("over", { winner: results.winner, last: last?.id ?? null });
            // the last kill cam and the winners' circle first
            ending = setTimeout(() => options.onEnd?.(results), results.winner ? FINAL_SHOW : SHOW_WINNER + 6000);
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
        // out of my body: the camera rises from my eyes and looks back at me lying there
        const m = camera.worldMatrix;
        spirit.time = 0;
        spirit.from = [m[12], m[13], m[14]];
        spirit.yaw = walker.yaw;
        setView("spirit");
        controls.free = true;
        if (controls.locked) document.exitPointerLock();
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
    let botShots = 0;
    let kills = 0;
    let recorded = 0;
    let wanted = false;
    /** This draw started from the bow button (it shoots only in the strip). */
    let byThumb = false;
    let creak = 0;
    let feet = 0;
    const whooshed = new Set<string>();
    let beat = 0;
    // a game object, so it runs before the frame is drawn and the camera is where I am now
    const driver = engine.add(new class extends GameObject {
        override update(delta: number) {
            tick(Math.min(delta, .1));
        }
    }());
    const tick = (dt: number) => {
        const now = net.shared();
        const alive = walker.alive && !over && view === "play";
        // what my wounds leave me
        wounds.update(dt, walker.speed);
        walker.posture = walker.alive ? wounds.posture : "stand";
        walker.limit = wounds.walk;
        draw.rate = wounds.drawRate < 1 ? wounds.drawRate / KEY_DRAW : Infinity;
        draw.shake = wounds.shake;
        if (walker.alive && view === "play") walker.update(dt, controls, settings().sensitivity, draw);
        if (view === "play") walker.place(camera, draw);
        else direct(dt);
        if (!walker.alive) myTip = Math.min(FALL, myTip + dt * 3.2 * (.3 + myTip));
        arrows.showMine = !walker.alive;

        // the bow: the thumb on its button, or space
        const want = alive && (controls.thumb || controls.space);
        if (want && !wanted)
        {
            if (quiver <= 0) sound("empty");
            else draw.start(quiver);
            byThumb = controls.thumb;
        }
        wanted = want;
        if (draw.phase === "drawing")
        {
            draw.hold(dt);
            // a thumb lets go: shoots only in the strip at the right edge
            if (!want)
            {
                if (byThumb && !controls.shoot) draw.cancel();
                else fire(draw.release());
            }
            // a creak each step of the pull, the string stretching higher
            const step = Math.floor(draw.amount * 5);
            if (step > creak)
            {
                sound("creak", undefined, .3 + draw.amount * .4);
                sound("stretch", undefined, .3 + draw.amount * .5, .8 + draw.amount * .7);
            }
            creak = step;
        }
        else creak = 0;
        fire(draw.update(dt));
        controls.bow.style.setProperty("--pull", String(draw.phase === "drawing" ? draw.amount : 0));

        // my feet in the grass, a hop on one leg, a heartbeat when I'm spent
        if (alive)
        {
            const foot = Math.floor(walker.posture === "hop" ? walker.hop / Math.PI : walker.stride / Math.PI);
            if (foot !== feet && walker.speed > .3) sound(walker.posture === "hop" ? "hop" : "step", undefined, .35);
            feet = foot;
            beat -= dt;
            if (wounds.energy < .25 && beat <= 0)
            {
                sound("heartbeat", undefined, .4 + (.25 - wounds.energy) * 2);
                beat = .6 + wounds.energy * 2;
            }
        }
        firstPerson.update(dt, camera, draw, { speed: walker.speed, stride: walker.stride, alive: walker.alive }, quiver, settings().hand === "left");
        const meToo = !walker.alive || (view === "circle" && circle.members.some(member => member.id === me));
        others.frame(now, dt, camera, play.clientWidth, play.clientHeight, meToo ? [{ rig: myRig, look: { clothes: colourOf(me), skin: mySkin } }] : []);
        myRig.update(dt, {
            x: walker.x, y: walker.y, z: walker.z, yaw: walker.yaw, pitch: walker.pitch,
            draw: draw.phase === "drawing" ? draw.amount : 0, left: settings().hand === "left", stage: draw.stage,
            wounds: wounds.bits, resting: wounds.resting, dead: !walker.alive, tip: myTip, unarmed: over,
        });

        // arrows, and the bodies my phone judges
        const judge = walker.alive ? [{ id: me, rig: myRig }] : [];
        if (options.bots) judge.push(...others.living.filter(other => !dead.has(other.id)));
        const flown = arrows.update(now, judge, friendly ? undefined : (shooter, id) => {
            const team = state.players.find(player => player.id === shooter)?.team;
            return !!team && team === state.players.find(player => player.id === id)?.team;
        });
        // someone's arrow passing close by me: a whoosh from its side
        {
            const m = camera.worldMatrix;
            for (const arrow of arrows.all.values())
            {
                if (arrow.rest || arrow.gone || arrow.shot.by === me || whooshed.has(arrow.shot.id)) continue;
                const dx = m[12] - arrow.x, dy = m[13] - arrow.y, dz = m[14] - arrow.z;
                if (Math.hypot(dx, dy, dz) < 5 && dx * arrow.vx + dy * arrow.vy + dz * arrow.vz < 0)
                {
                    whooshed.add(arrow.shot.id);
                    sound("whoosh", [arrow.x, arrow.y, arrow.z], 1.4);
                }
            }
        }
        for (const landed of flown.landed) sound(landed.kind === "ground" ? "ground" : "wood", [landed.arrow.x, landed.arrow.y, landed.arrow.z]);
        for (const { arrow, id, hit, place, local, at } of flown.struck)
        {
            const distance = Math.hypot(at[0] - arrow.shot.x, at[2] - arrow.shot.z);
            struck({ arrow: arrow.shot.id, victim: id, zone: hit.zone, part: hit.part, point: local.point, direction: local.direction, place: { x: place.x, y: place.y, z: place.z, yaw: place.yaw }, at, distance, time: arrow.at });
        }
        blood.update(dt * (view === "film" ? film.rate : 1));
        if (view !== "film") arrows.draw(now, rigOf, [camera.worldMatrix[12], camera.worldMatrix[13], camera.worldMatrix[14]]);

        // picking up: a tap near an arrow in reach, never while drawing
        const width = play.clientWidth, height = play.clientHeight;
        const canPick = alive && draw.phase !== "drawing";
        const radius = Math.max(60, height * .14);
        const taps = controls.taps();
        if (view !== "play" && taps.length) tapped();
        for (const [x, y] of taps)
        {
            if (!canPick) continue;
            const id = arrows.pickable(x, y, radius, walker.body, now, camera, width, height, rigOf);
            if (id) net.send([state.host], "pick", { arrow: id });
        }
        hud.pickable(canPick && controls.locked && !!arrows.pickable(width / 2, height / 2, radius * .6, walker.body, now, camera, width, height, rigOf));
        for (let i = controls.pulls(); i > 0; i--) pullOut();

        deadChat.hidden = walker.alive;
        hud.arrows(quiver);
        hud.kills(kills);
        hud.tired(draw.tunnel);
        hud.damage(wounds.hits);
        hud.wounds(wounds.bits, injuries);
        hud.energy(wounds.energy, wounds.resting);
        hud.pull(alive && draw.phase !== "drawing" ? arrows.in(me).filter(arrow => !taken.has(arrow.shot.id)).length : 0);
        const left = standing(state.players, [...dead]).length;
        hud.standing(t("hud.left", { count: String(left) }));
        controls.bow.hidden = !alive;
        controls.joystick.hidden = !walker.alive || view !== "play";
        controls.bow.disabled = quiver <= 0 || draw.phase === "panting";
        hint.hidden = coarse || controls.locked || view !== "play";

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
        walker, draw, arrows, others, hud, replay, film, get view() { return view; }, firstPerson, wounds, myRig, get quiver() { return quiver; }, get dead() { return [...dead]; },
        /** The view's "a bot shoots me": the nearest standing bot sends a strong arrow at my chest. */
        shootMe(by?: string, at = me) {
            const pose = (id: string) => others.poseOf(id);
            const bot = by ?? others.living.map(other => other.id).filter(id => !dead.has(id))
                .sort((a, b) => Math.hypot(pose(a)!.x - walker.x, pose(a)!.z - walker.z) - Math.hypot(pose(b)!.x - walker.x, pose(b)!.z - walker.z))[0];
            const from = bot ? (bot === me ? myPose() : pose(bot)) : null;
            const to = at === me ? myPose() : pose(at);
            if (!bot || !from || !to || dead.has(at)) return;
            const start: Vec = [from.x, from.y + 1.2, from.z], target: Vec = [to.x, to.y + .62, to.z];
            const dx = target[0] - start[0], dy = target[1] - start[1], dz = target[2] - start[2];
            const flat = Math.hypot(dx, dz), speed = 32;
            // a little up, for the drop on the way
            const up = dy / flat + 9.81 * flat / (2 * speed * speed);
            const length = Math.hypot(dx, flat * up, dz);
            const shot: Shot = { id: `${bot}:${++botShots}`, by: bot, time: net.shared(), x: start[0], y: start[1], z: start[2], dx: dx / length, dy: flat * up / length, dz: dz / length, speed };
            if (!arrows.add(shot)) return;
            replay.shot(shot);
            tally.shot(bot);
            sound("twang", start, .8);
        },
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
            playing = false;
            document.removeEventListener("visibilitychange", awake);
            wake?.release().catch(() => undefined);
            clearTimeout(settle);
            clearTimeout(ending);
            window.removeEventListener("resize", size);
            engine.stop();
            controls.destroy();
            others.destroy();
            arrows.destroy();
            film.destroy();
            winnerSign.remove();
            deadChat.remove();
            horns.remove();
            blood.destroy();
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
