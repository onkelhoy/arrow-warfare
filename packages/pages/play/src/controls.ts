import "@arrow-warfare/joystick";
import "@arrow-warfare/bow-button";
import type { Joystick } from "@arrow-warfare/joystick";
import type { BowButton, DrawEvent } from "@arrow-warfare/bow-button";
import type { BowPlace } from "@arrow-warfare/core";

/** Radians per pixel dragged on a touch screen, and per pixel of mouse movement, at sensitivity 1. */
const TOUCH_TURN = .0065;
const MOUSE_TURN = .0024;
/** A touch that moves less than this and lets go quickly is a tap. */
const TAP_MOVE = 28;
const TAP_TIME = 500;

const KEYS: Record<string, [x: number, y: number]> = {
    w: [0, 1], arrowup: [0, 1],
    s: [0, -1], arrowdown: [0, -1],
    a: [-1, 0], arrowleft: [-1, 0],
    d: [1, 0], arrowright: [1, 0],
};

type Looker = { x: number; y: number; startX: number; startY: number; at: number; moved: number };

/**
 * What the player asks for, from any device. Touch: the joystick on the left moves, dragging anywhere else
 * looks, holding the bow button draws (by time) and aims, letting go shoots (or cancels on the moved button), a tap picks up. Desktop: click to lock the mouse and look, WASD or
 * the arrows to walk, hold space to draw, click to pick up, E pulls an arrow out of myself.
 * With a gun (`gun`): the bow button is the trigger (press fires, the thumb still aims) with a reload button
 * above it; on a computer a click or space fires and R reloads.
 */
export class Controls {
    /** Looking turned this much since the last `look()`, in radians before sensitivity. */
    private turnX = 0;
    private turnY = 0;
    private keys = new Set<string>();
    private lookers = new Map<number, Looker>();
    readonly joystick: Joystick;
    readonly bow: BowButton;
    readonly surface: HTMLElement;
    /** The mouse isn't locked to look: a click is a tap where it is (dead, watching). */
    free = false;
    /** Space is down. */
    space = false;
    /** A thumb is on the bow button, and letting go now shoots. */
    thumb = false;
    shoot = false;
    /** Taps since the last `taps()`, in CSS pixels on the page. */
    private tapped: [number, number][] = [];
    /** Asked to pull an arrow out of myself (E, or the button) since the last `pulls()`. */
    private pulled = 0;
    /** Trigger presses (a click with the mouse locked, the button, space), and reloads asked for (R, the button), since the last calls. */
    private clicked = 0;
    private reloaded = 0;
    /** The reload button, touch only, shown with a gun. */
    readonly reloadButton: HTMLButtonElement;
    /** A gun instead of the bow: clicks fire rather than pick up. */
    gun = false;

    constructor(root: HTMLElement) {
        this.surface = document.createElement("div");
        this.surface.className = "aw-play-look";
        this.joystick = document.createElement("aw-joystick") as Joystick;
        this.joystick.className = "aw-play-stick";
        this.bow = document.createElement("aw-bow-button") as BowButton;
        this.bow.className = "aw-play-bow";
        this.reloadButton = document.createElement("button");
        this.reloadButton.type = "button";
        this.reloadButton.className = "aw-play-reload";
        this.reloadButton.hidden = true;
        this.reloadButton.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5"/></svg>`;
        this.reloadButton.addEventListener("pointerdown", event => {
            event.preventDefault();
            event.stopPropagation();
            this.reloaded++;
        });
        root.append(this.surface, this.joystick, this.bow, this.reloadButton);

        this.surface.addEventListener("pointerdown", this.handledown);
        this.surface.addEventListener("pointermove", this.handlemove);
        this.surface.addEventListener("pointerup", this.handleup);
        this.surface.addEventListener("pointercancel", this.handlecancel);
        this.bow.addEventListener("drawstart", this.handledraw);
        this.bow.addEventListener("drawmove", this.handledraw);
        this.bow.addEventListener("drawend", this.handledraw);
        document.addEventListener("mousemove", this.handlemouse);
        window.addEventListener("keydown", this.handlekey);
        window.addEventListener("keyup", this.handlekey);
        window.addEventListener("blur", this.handleblur);
        document.addEventListener("visibilitychange", this.handleblur);
        document.addEventListener("focusin", this.handlefocus);
    }

    /** Puts the bow button where the settings say. */
    placeBow(place: BowPlace, _width?: number) {
        this.bow.style.setProperty("--size", `${place.size}px`);
        this.bow.style.left = `calc(${place.x * 100}% - ${place.size / 2}px)`;
        this.bow.style.top = `calc(${place.y * 100}% - ${place.size / 2}px)`;
        // the reload button beside the trigger towards the middle of the screen: under it when it's high up
        const small = Math.round(place.size * .6);
        this.reloadButton.style.setProperty("--size", `${small}px`);
        this.reloadButton.style.left = `calc(${place.x * 100}% - ${place.size * (place.x > .5 ? .95 : -.35)}px)`;
        this.reloadButton.style.top = place.y < .5
            ? `calc(${place.y * 100}% + ${place.size * .5 + 12}px)`
            : `calc(${place.y * 100}% - ${place.size * .5 + small + 12}px)`;
    }

    /** Trigger presses since the last call, with a gun. Counted, so a tap quicker than a frame still fires. */
    triggers() {
        const clicked = this.clicked;
        this.clicked = 0;
        return clicked;
    }

    /** Reloads asked for since the last call. */
    reloads() {
        const reloaded = this.reloaded;
        this.reloaded = 0;
        return reloaded;
    }

    /** -1..1 each: x right, y forward. */
    get move(): [number, number] {
        let x = this.joystick.x, y = this.joystick.y;
        for (const key of this.keys)
        {
            const [kx, ky] = KEYS[key] ?? [0, 0];
            x += kx;
            y += ky;
        }
        const length = Math.hypot(x, y);
        return length > 1 ? [x / length, y / length] : [x, y];
    }

    get locked() {
        return document.pointerLockElement === this.surface;
    }

    /** Radians to turn right and up since the last call. */
    look(sensitivity: number): [number, number] {
        const turn: [number, number] = [this.turnX * sensitivity, this.turnY * sensitivity];
        this.turnX = this.turnY = 0;
        return turn;
    }

    /** Taps (and clicks with the mouse locked, at the middle) since the last call. */
    taps() {
        const taps = this.tapped;
        this.tapped = [];
        return taps;
    }

    /** The pull out button was pressed. */
    pullOut() {
        this.pulled++;
    }

    /** How many times pulling out was asked for since the last call. */
    pulls() {
        const pulled = this.pulled;
        this.pulled = 0;
        return pulled;
    }

    destroy() {
        if (this.locked) document.exitPointerLock();
        document.removeEventListener("mousemove", this.handlemouse);
        window.removeEventListener("keydown", this.handlekey);
        window.removeEventListener("keyup", this.handlekey);
        window.removeEventListener("blur", this.handleblur);
        document.removeEventListener("visibilitychange", this.handleblur);
        document.removeEventListener("focusin", this.handlefocus);
        this.surface.remove();
        this.joystick.remove();
        this.bow.remove();
        this.reloadButton.remove();
    }

    private handledown = (event: PointerEvent) => {
        if (event.pointerType === "mouse")
        {
            if (this.free)
            {
                const box = this.surface.getBoundingClientRect();
                this.tapped.push([event.clientX - box.left, event.clientY - box.top]);
                return;
            }
            if (!this.locked) this.surface.requestPointerLock?.()?.catch?.(() => undefined);
            else if (event.button === 0 && this.gun) this.clicked++;
            else if (event.button === 0)
            {
                const box = this.surface.getBoundingClientRect();
                this.tapped.push([box.width / 2, box.height / 2]);
            }
            return;
        }
        try { this.surface.setPointerCapture(event.pointerId); } catch { /* a pointer already gone */ }
        this.lookers.set(event.pointerId, { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, at: performance.now(), moved: 0 });
        this.fadeBow();
    }

    /** The bow button fades back while a thumb is looking round, so it hides less of the view. */
    private fadeBow() {
        this.bow.toggleAttribute("looking", this.lookers.size > 0);
    }

    private handlemove = (event: PointerEvent) => {
        const last = this.lookers.get(event.pointerId);
        if (!last) return;
        this.turnX += (event.clientX - last.x) * TOUCH_TURN;
        this.turnY += (event.clientY - last.y) * TOUCH_TURN;
        last.moved = Math.max(last.moved, Math.hypot(event.clientX - last.startX, event.clientY - last.startY));
        last.x = event.clientX;
        last.y = event.clientY;
    }

    private handleup = (event: PointerEvent) => {
        const last = this.lookers.get(event.pointerId);
        this.lookers.delete(event.pointerId);
        this.fadeBow();
        if (!last || last.moved > TAP_MOVE || performance.now() - last.at > TAP_TIME) return;
        const box = this.surface.getBoundingClientRect();
        this.tapped.push([event.clientX - box.left, event.clientY - box.top]);
    }

    private handlecancel = (event: PointerEvent) => {
        this.lookers.delete(event.pointerId);
        this.fadeBow();
    }

    /** The bow button: held, letting go shoots unless on cancel, and the same thumb turning the view. */
    private handledraw = (event: Event) => {
        const { dx, dy, shoot } = (event as CustomEvent<DrawEvent>).detail;
        this.thumb = event.type !== "drawend";
        if (event.type === "drawstart" && this.gun) this.clicked++;
        this.shoot = shoot;
        this.turnX += dx * TOUCH_TURN;
        this.turnY += dy * TOUCH_TURN;
    }

    private handlemouse = (event: MouseEvent) => {
        if (!this.locked) return;
        this.turnX += event.movementX * MOUSE_TURN;
        this.turnY += event.movementY * MOUSE_TURN;
    }

    private handlekey = (event: KeyboardEvent) => {
        if ((event.target as HTMLElement)?.closest?.("input, textarea, [contenteditable], pap-input")) return;
        if (event.code === "Space")
        {
            event.preventDefault();
            if (event.type === "keydown" && !event.repeat && this.gun) this.clicked++;
            this.space = event.type === "keydown";
            return;
        }
        const key = event.key.toLowerCase();
        if (key === "r")
        {
            if (event.type === "keydown" && !event.repeat) this.reloaded++;
            return;
        }
        if (key === "e")
        {
            if (event.type === "keydown" && !event.repeat) this.pulled++;
            return;
        }
        if (!(key in KEYS)) return;
        event.preventDefault();
        if (event.type === "keydown") this.keys.add(key);
        else this.keys.delete(key);
    }

    /** Lets go of everything held: keys, space, the joystick (on blur, a hidden tab, death). */
    release() {
        this.keys.clear();
        this.space = false;
        this.joystick.reset();
    }

    private handleblur = () => this.release();

    /** Typing in a box: its keyups never reach `handlekey`, so a held key would stick. */
    private handlefocus = (event: FocusEvent) => {
        if (!(event.target as HTMLElement)?.closest?.("input, textarea, [contenteditable], pap-input")) return;
        this.keys.clear();
        this.space = false;
    }
}
