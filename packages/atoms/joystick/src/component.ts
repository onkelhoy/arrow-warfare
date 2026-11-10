// system
import { CustomElement, html, property } from "@papit/web-component";

// local
import sheet from "./style.css" with { type: "css" };
import type { JoystickEvent } from "./types";

/**
 * A touch joystick. Its own box is where a thumb can start: the base appears under the thumb and the knob
 * follows it, up to `radius` pixels away. `x` is right, `y` is up (forward), both -1..1. One pointer at a
 * time: a new touch on it takes over. `reset()` lets go of a thumb whose lift was missed.
 *
 * @element aw-joystick
 *
 * @property {number} radius how far the knob goes, in CSS pixels
 * @property {boolean} active a thumb is on it (reflected)
 *
 * @fires move {JoystickEvent} while it's pushed
 * @fires end {JoystickEvent} when the thumb lets go, x and y are 0
 */
export class Joystick extends CustomElement {
    static sheet = sheet;

    @property({ type: Number }) radius: number = 56;
    @property({ type: Boolean, reflect: true }) active: boolean = false;

    /** -1 left .. 1 right. */
    x = 0;
    /** -1 back .. 1 forward. */
    y = 0;

    private pointer: number | null = null;
    private originX = 0;
    private originY = 0;

    /** How far it's pushed, 0..1. */
    get strength() {
        return Math.min(1, Math.hypot(this.x, this.y));
    }

    connectedCallback() {
        super.connectedCallback();
        this.addEventListener("pointerdown", this.handledown);
        this.addEventListener("pointermove", this.handlemove);
        this.addEventListener("pointerup", this.handleup);
        this.addEventListener("pointercancel", this.handleup);
        this.addEventListener("lostpointercapture", this.handleup);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this.reset();
        this.removeEventListener("pointerdown", this.handledown);
        this.removeEventListener("pointermove", this.handlemove);
        this.removeEventListener("pointerup", this.handleup);
        this.removeEventListener("pointercancel", this.handleup);
        this.removeEventListener("lostpointercapture", this.handleup);
    }

    /** Lets go of the thumb it holds, as if lifted: x and y back to 0. For a lift it never heard. */
    reset() {
        if (this.pointer === null) return;
        const pointer = this.pointer;
        this.pointer = null;
        try { if (this.hasPointerCapture(pointer)) this.releasePointerCapture(pointer); } catch { /* already gone */ }
        this.active = false;
        this.x = this.y = 0;
        this.dispatchEvent(new CustomEvent<JoystickEvent>("end", { detail: { x: 0, y: 0 }, bubbles: true, composed: true }));
    }

    private handledown = (event: PointerEvent) => {
        // a new thumb takes over, the old one may have lifted without telling
        this.reset();
        event.preventDefault();
        this.pointer = event.pointerId;
        try { this.setPointerCapture(event.pointerId); } catch { /* a pointer already gone */ }
        this.x = this.y = 0;
        const box = this.getBoundingClientRect();
        this.originX = event.clientX - box.left;
        this.originY = event.clientY - box.top;
        this.active = true;
        this.place(0, 0);
    }

    private handlemove = (event: PointerEvent) => {
        if (event.pointerId !== this.pointer) return;
        const box = this.getBoundingClientRect();
        let dx = event.clientX - box.left - this.originX;
        let dy = event.clientY - box.top - this.originY;
        const distance = Math.hypot(dx, dy);
        if (distance > this.radius)
        {
            // past the edge the base follows the thumb, so turning back answers at once
            const over = distance - this.radius;
            this.originX += dx / distance * over;
            this.originY += dy / distance * over;
            dx = dx / distance * this.radius;
            dy = dy / distance * this.radius;
        }
        this.place(dx, dy);
        this.x = dx / this.radius;
        this.y = -dy / this.radius;
        this.dispatchEvent(new CustomEvent<JoystickEvent>("move", { detail: { x: this.x, y: this.y }, bubbles: true, composed: true }));
    }

    private handleup = (event: PointerEvent) => {
        if (event.pointerId !== this.pointer) return;
        this.reset();
    }

    private place(dx: number, dy: number) {
        this.style.setProperty("--origin-x", `${this.originX}px`);
        this.style.setProperty("--origin-y", `${this.originY}px`);
        this.style.setProperty("--knob-x", `${dx}px`);
        this.style.setProperty("--knob-y", `${dy}px`);
        this.style.setProperty("--radius", `${this.radius}px`);
    }

    render() {
        return html`
            <div class="base" part="base"><div class="knob" part="knob"></div></div>
            <slot></slot>
        `;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "aw-joystick": Joystick;
    }
}
