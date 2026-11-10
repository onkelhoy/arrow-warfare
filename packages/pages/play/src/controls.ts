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

    constructor(root: HTMLElement) {
        this.surface = document.createElement("div");
        this.surface.className = "aw-play-look";
        this.joystick = document.createElement("aw-joystick") as Joystick;
        this.joystick.className = "aw-play-stick";
        this.bow = document.createElement("aw-bow-button") as BowButton;
        this.bow.className = "aw-play-bow";
        root.append(this.surface, this.joystick, this.bow);

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
    }

    /** Puts the bow button where the settings say. */
    placeBow(place: BowPlace, _width?: number) {
        this.bow.style.setProperty("--size", `${place.size}px`);
        this.bow.style.left = `calc(${place.x * 100}% - ${place.size / 2}px)`;
        this.bow.style.top = `calc(${place.y * 100}% - ${place.size / 2}px)`;
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
        this.surface.remove();
        this.joystick.remove();
        this.bow.remove();
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
            this.space = event.type === "keydown";
            return;
        }
        const key = event.key.toLowerCase();
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

    private handleblur = () => {
        this.keys.clear();
        this.space = false;
    }
}
