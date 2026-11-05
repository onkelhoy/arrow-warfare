import "@papit/button";
import { Camera, GameEngine, GameObject } from "@papit/game-engine";
import { adopt, settings, t, type GameState } from "@arrow-warfare/core";
import { packPose, POSE_RATE, unpackPose } from "@arrow-warfare/net";
import { Renderer } from "@arrow-warfare/render";
import { currentPalette, Field, Meadow } from "@arrow-warfare/world";

import { Controls } from "./controls";
import { Others } from "./others";
import { Walker } from "./walker";
import sheet from "./style.css" with { type: "css" };

/** What play needs from the network. Without it (the view) everyone else just stands at their spawn. */
export type PlayNet = {
    /** The shared clock, in ms. */
    shared(): number;
    sendFast(peers: string[], data: ArrayBuffer): void;
    /** Returns a function that stops listening. */
    onFast(handler: (data: ArrayBuffer, sender: string) => void): () => void;
};

export type PlayOptions = {
    state: GameState;
    me: string;
    host: boolean;
    net?: PlayNet;
    onBack(): void;
};

/** At most this many device pixels per CSS pixel, a 3x phone draws at half its resolution. */
const PIXELS = 1.5;

/**
 * The meadow in first person. Everyone builds the same field from the state's seed and rules, starts at
 * their spawn and walks. Poses go out 20 times a second, the others are drawn from theirs.
 */
export function mountPlay(root: HTMLElement, options: PlayOptions) {
    adopt(sheet);
    const { me, host, net, onBack } = options;
    let state = options.state;

    const play = document.createElement("main");
    play.className = "aw-play";
    const scale = Math.min(1, PIXELS / (window.devicePixelRatio || 1));
    play.style.setProperty("--scale", String(scale));
    play.innerHTML = `
        <canvas class="aw-play-canvas"></canvas>
        <div class="aw-play-names"></div>
        <p class="aw-play-hint">${t("play.hint")}</p>
        ${host ? `<pap-button class="aw-play-back" size="small" variant="outline">${t("play.back")}</pap-button>` : ""}
        <div class="aw-play-turn" role="status"><p>${t("play.turn")}</p></div>
    `;
    root.append(play);
    play.querySelector("pap-button")?.addEventListener("click", onBack);

    const engine = new GameEngine({ name: "main", query: ".aw-play-canvas", type: "webgl2", documentElement: play, contextSetting: { antialias: scale >= 1, powerPreference: "high-performance" } });
    const layer = engine.layers.main;
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

    const hint = play.querySelector<HTMLElement>(".aw-play-hint")!;
    const unlisten = net?.onFast((data, sender) => {
        const pose = unpackPose(data);
        if (pose) others.receive(sender, pose);
    });

    let sent = 0;
    // a game object, so it runs before the frame is drawn and the camera is where I am now
    const driver = engine.add(new class extends GameObject {
        override update(delta: number) {
            tick(Math.min(delta, .1));
        }
    }());
    const tick = (dt: number) => {
        walker.update(dt, controls, settings().sensitivity);
        walker.place(camera);

        const now = net?.shared() ?? performance.now();
        others.frame(now, camera, play.clientWidth, play.clientHeight);
        hint.hidden = coarse || controls.locked;

        if (net && now - sent >= 1000 / POSE_RATE)
        {
            sent = now;
            const peers = state.players.map(player => player.id).filter(id => id !== me);
            net.sendFast(peers, packPose({ time: now, x: walker.x, y: walker.y, z: walker.z, yaw: walker.yaw, pitch: walker.pitch, speed: walker.speed }));
        }
    };
    engine.start();

    // phones play sideways, a fullscreen page can be held there
    (screen.orientation as ScreenOrientation & { lock?(orientation: string): Promise<void> })?.lock?.("landscape").catch(() => undefined);

    return {
        element: play,
        /** Players who left disappear, nothing else about the field changes mid round. */
        update(next: GameState) {
            state = next;
            others.update(next);
        },
        remove() {
            unlisten?.();
            engine.stop();
            controls.destroy();
            others.destroy();
            engine.remove(driver);
            engine.remove(meadow);
            engine.remove(renderer);
            renderer.gl.getExtension("WEBGL_lose_context")?.loseContext();
            play.remove();
        },
    };
}
