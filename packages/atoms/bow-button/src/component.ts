// system
import { CustomElement, html, property } from "@papit/web-component";

// local
import sheet from "./style.css" with { type: "css" };
import type { DrawEvent } from "./types";

/**
 * The bow button. Hold a thumb on it and the bow draws by time (the game decides how fast). The same
 * thumb aims freely, every direction. On press the button snaps to the right edge and becomes a cancel
 * button: let go anywhere to shoot, let go on it to bring the bow down. Then it snaps back. Only where
 * the thumb lets go decides, whatever event ends the press (a cancelled pointer waits for the lift).
 *
 * @element aw-bow-button
 *
 * @property {boolean} active a thumb is on it (reflected)
 * @property {boolean} disabled can't draw now, shown dimmed (reflected). It still tells about the thumb
 *
 * @fires drawstart {DrawEvent} the thumb went down on it
 * @fires drawmove {DrawEvent} the thumb moved
 * @fires drawend {DrawEvent} the thumb let go, `shoot` is false when it let go on the cancel button
 */
export class BowButton extends CustomElement {
    static sheet = sheet;

    @property({ type: Boolean, reflect: true }) active: boolean = false;
    @property({ type: Boolean, reflect: true }) disabled: boolean = false;

    /** Letting go now shoots (the thumb is not on the cancel button). */
    shoot = false;

    private pointer: number | null = null;
    private lastX = 0;
    private lastY = 0;

    connectedCallback() {
        super.connectedCallback();
        this.addEventListener("pointerdown", this.handledown);
        this.addEventListener("pointermove", this.handlemove);
        this.addEventListener("pointerup", this.handleup);
        this.addEventListener("pointercancel", this.handlecancel);
        this.addEventListener("lostpointercapture", this.handlecancel);
        this.addEventListener("contextmenu", this.handlemenu);
        // keeps iOS from taking a still thumb for a long press, which cancels the pointer
        this.addEventListener("touchstart", this.handletouch, { passive: false });
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this.removeEventListener("pointerdown", this.handledown);
        this.removeEventListener("pointermove", this.handlemove);
        this.removeEventListener("pointerup", this.handleup);
        this.removeEventListener("pointercancel", this.handlecancel);
        this.removeEventListener("lostpointercapture", this.handlecancel);
        this.removeEventListener("contextmenu", this.handlemenu);
        this.removeEventListener("touchstart", this.handletouch);
        this.stopWaiting();
    }

    private handlemenu = (event: Event) => event.preventDefault();
    private handletouch = (event: Event) => event.preventDefault();

    /** On the button, a little bigger than it looks so the thumb finds it blind. */
    private onButton(x: number, y: number) {
        const box = this.getBoundingClientRect();
        const r = box.width / 2;
        return Math.hypot(x - (box.left + r), y - (box.top + box.height / 2)) <= r * 1.25;
    }

    private check(x: number, y: number) {
        const on = this.onButton(x, y);
        this.shoot = !on;
        this.toggleAttribute("over", on);
    }

    /** Snap the button to the right edge, same height. */
    private moveAside() {
        const box = this.getBoundingClientRect();
        const margin = 16;
        this.style.translate = `${window.innerWidth - margin - box.right}px 0`;
    }

    private handledown = (event: PointerEvent) => {
        if (this.pointer !== null) return;
        event.preventDefault();
        event.stopPropagation();
        this.pointer = event.pointerId;
        this.setPointerCapture(event.pointerId);
        this.lastX = event.clientX;
        this.lastY = event.clientY;
        this.moveAside();
        this.shoot = true;
        this.active = true;
        this.fire("drawstart", 0, 0);
    }

    private handlemove = (event: PointerEvent) => {
        if (event.pointerId !== this.pointer) return;
        const dx = event.clientX - this.lastX, dy = event.clientY - this.lastY;
        this.lastX = event.clientX;
        this.lastY = event.clientY;
        this.check(event.clientX, event.clientY);
        this.fire("drawmove", dx, dy);
    }

    private handleup = (event: PointerEvent) => {
        if (event.pointerId !== this.pointer) return;
        this.check(event.clientX, event.clientY);
        this.finish();
    }

    /**
     * The browser took the pointer (a gesture, a lost capture) but the thumb may still be down. A touch
     * waits for the finger to really lift, then it's decided by where it was, like a normal let go.
     */
    private handlecancel = (event: PointerEvent) => {
        if (event.pointerId !== this.pointer || this.waiting) return;
        if (event.pointerType !== "touch")
        {
            this.check(this.lastX, this.lastY);
            this.finish();
            return;
        }
        this.waiting = true;
        window.addEventListener("touchmove", this.handlelost, { capture: true });
        window.addEventListener("touchend", this.handlelost, { capture: true });
        window.addEventListener("touchcancel", this.handlelost, { capture: true });
    }

    private waiting = false;

    /** The touches after the pointer was taken: follow the nearest one to the thumb, finish when it lifts. */
    private handlelost = (event: TouchEvent) => {
        let touch: Touch | null = null, best = Infinity;
        for (const each of Array.from(event.changedTouches))
        {
            const distance = Math.hypot(each.clientX - this.lastX, each.clientY - this.lastY);
            if (distance < best)
            {
                best = distance;
                touch = each;
            }
        }
        if (!touch) return;
        if (event.type === "touchmove")
        {
            if (best > 120) return;
            const dx = touch.clientX - this.lastX, dy = touch.clientY - this.lastY;
            this.lastX = touch.clientX;
            this.lastY = touch.clientY;
            this.check(touch.clientX, touch.clientY);
            this.fire("drawmove", dx, dy);
            return;
        }
        // another finger lifting, far from the thumb, isn't it (unless it's the last one down)
        if (best > 120 && event.touches.length > 0) return;
        this.check(touch.clientX, touch.clientY);
        this.finish();
    }

    private stopWaiting() {
        if (!this.waiting) return;
        this.waiting = false;
        window.removeEventListener("touchmove", this.handlelost, { capture: true });
        window.removeEventListener("touchend", this.handlelost, { capture: true });
        window.removeEventListener("touchcancel", this.handlelost, { capture: true });
    }

    private finish() {
        this.stopWaiting();
        this.pointer = null;
        this.active = false;
        this.style.translate = "";
        this.removeAttribute("over");
        this.fire("drawend", 0, 0);
        this.shoot = false;
    }

    private fire(type: string, dx: number, dy: number) {
        this.dispatchEvent(new CustomEvent<DrawEvent>(type, { detail: { dx, dy, shoot: this.shoot }, bubbles: true, composed: true }));
    }

    render() {
        return html`
            <div class="button" part="button">
                <svg class="bow" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M6 3c5 3 5 15 0 18" />
                    <path d="M6 3v18" class="cord" />
                    <path d="M3 12h16m-3-3 3 3-3 3" />
                </svg>
                <svg class="cancel" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M6 6l12 12M18 6 6 18" />
                </svg>
            </div>
            <slot></slot>
        `;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "aw-bow-button": BowButton;
    }
}
