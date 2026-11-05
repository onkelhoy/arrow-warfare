import "@arrow-warfare/joystick";
import type { Joystick } from "@arrow-warfare/joystick";

/** Radians per pixel dragged on a touch screen, and per pixel of mouse movement, at sensitivity 1. */
const TOUCH_TURN = .0065;
const MOUSE_TURN = .0024;

const KEYS: Record<string, [x: number, y: number]> = {
    w: [0, 1], arrowup: [0, 1],
    s: [0, -1], arrowdown: [0, -1],
    a: [-1, 0], arrowleft: [-1, 0],
    d: [1, 0], arrowright: [1, 0],
};

/**
 * What the player asks for, from any device. Touch: the joystick on the left moves, dragging anywhere else
 * looks. Desktop: click to lock the mouse and look, WASD or the arrows to walk.
 */
export class Controls {
    /** Looking turned this much since the last `look()`, in radians before sensitivity. */
    private turnX = 0;
    private turnY = 0;
    private keys = new Set<string>();
    private lookers = new Map<number, { x: number; y: number }>();
    readonly joystick: Joystick;
    readonly surface: HTMLElement;

    constructor(root: HTMLElement) {
        this.surface = document.createElement("div");
        this.surface.className = "aw-play-look";
        this.joystick = document.createElement("aw-joystick") as Joystick;
        this.joystick.className = "aw-play-stick";
        root.append(this.surface, this.joystick);

        this.surface.addEventListener("pointerdown", this.handledown);
        this.surface.addEventListener("pointermove", this.handlemove);
        this.surface.addEventListener("pointerup", this.handleup);
        this.surface.addEventListener("pointercancel", this.handleup);
        document.addEventListener("mousemove", this.handlemouse);
        window.addEventListener("keydown", this.handlekey);
        window.addEventListener("keyup", this.handlekey);
        window.addEventListener("blur", this.handleblur);
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

    destroy() {
        if (this.locked) document.exitPointerLock();
        document.removeEventListener("mousemove", this.handlemouse);
        window.removeEventListener("keydown", this.handlekey);
        window.removeEventListener("keyup", this.handlekey);
        window.removeEventListener("blur", this.handleblur);
        this.surface.remove();
        this.joystick.remove();
    }

    private handledown = (event: PointerEvent) => {
        if (event.pointerType === "mouse")
        {
            if (!this.locked) this.surface.requestPointerLock?.()?.catch?.(() => undefined);
            return;
        }
        this.surface.setPointerCapture(event.pointerId);
        this.lookers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }

    private handlemove = (event: PointerEvent) => {
        const last = this.lookers.get(event.pointerId);
        if (!last) return;
        this.turnX += (event.clientX - last.x) * TOUCH_TURN;
        this.turnY += (event.clientY - last.y) * TOUCH_TURN;
        last.x = event.clientX;
        last.y = event.clientY;
    }

    private handleup = (event: PointerEvent) => {
        this.lookers.delete(event.pointerId);
    }

    private handlemouse = (event: MouseEvent) => {
        if (!this.locked) return;
        this.turnX += event.movementX * MOUSE_TURN;
        this.turnY += event.movementY * MOUSE_TURN;
    }

    private handlekey = (event: KeyboardEvent) => {
        const key = event.key.toLowerCase();
        if (!(key in KEYS)) return;
        if ((event.target as HTMLElement)?.closest?.("input, textarea, [contenteditable]")) return;
        event.preventDefault();
        if (event.type === "keydown") this.keys.add(key);
        else this.keys.delete(key);
    }

    private handleblur = () => {
        this.keys.clear();
    }
}
