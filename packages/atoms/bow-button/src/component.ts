// system
import { CustomElement, html, property } from "@papit/web-component";

// local
import sheet from "./style.css" with { type: "css" };
import type { DrawEvent } from "./types";

/**
 * The bow button. Hold a thumb on it and the bow draws by time (the game decides how fast). The same
 * thumb aims freely, every direction. Slide off it to aim, come back onto it and let go to shoot. Let go
 * anywhere else and the bow comes down.
 *
 * @element aw-bow-button
 *
 * @property {boolean} active a thumb is on it (reflected)
 * @property {boolean} disabled can't draw now, shown dimmed (reflected). It still tells about the thumb
 *
 * @fires drawstart {DrawEvent} the thumb went down on it
 * @fires drawmove {DrawEvent} the thumb moved
 * @fires drawend {DrawEvent} the thumb let go, `shoot` says if it was back on the button
 */
export class BowButton extends CustomElement {
    static sheet = sheet;

    @property({ type: Boolean, reflect: true }) active: boolean = false;
    @property({ type: Boolean, reflect: true }) disabled: boolean = false;

    /** The thumb left the button and is back on it. */
    shoot = false;

    private pointer: number | null = null;
    private lastX = 0;
    private lastY = 0;
    /** The thumb has been off the button since it went down. */
    private left = false;

    connectedCallback() {
        super.connectedCallback();
        this.addEventListener("pointerdown", this.handledown);
        this.addEventListener("pointermove", this.handlemove);
        this.addEventListener("pointerup", this.handleup);
        this.addEventListener("pointercancel", this.handlecancel);
        this.addEventListener("lostpointercapture", this.handlecancel);
        this.addEventListener("contextmenu", this.handlemenu);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this.removeEventListener("pointerdown", this.handledown);
        this.removeEventListener("pointermove", this.handlemove);
        this.removeEventListener("pointerup", this.handleup);
        this.removeEventListener("pointercancel", this.handlecancel);
        this.removeEventListener("lostpointercapture", this.handlecancel);
        this.removeEventListener("contextmenu", this.handlemenu);
    }

    private handlemenu = (event: Event) => event.preventDefault();

    /** On the button, a little bigger than it looks so the thumb finds it blind. */
    private onButton(x: number, y: number) {
        const box = this.getBoundingClientRect();
        const r = box.width / 2;
        return Math.hypot(x - (box.left + r), y - (box.top + box.height / 2)) <= r * 1.25;
    }

    private check(x: number, y: number) {
        const on = this.onButton(x, y);
        if (!on) this.left = true;
        this.shoot = this.left && on;
        this.toggleAttribute("shooting", this.shoot);
    }

    private handledown = (event: PointerEvent) => {
        if (this.pointer !== null) return;
        event.preventDefault();
        event.stopPropagation();
        this.pointer = event.pointerId;
        this.setPointerCapture(event.pointerId);
        this.lastX = event.clientX;
        this.lastY = event.clientY;
        this.shoot = false;
        this.left = false;
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

    private handlecancel = (event: PointerEvent) => {
        if (event.pointerId !== this.pointer) return;
        this.shoot = false;
        this.finish();
    }

    private finish() {
        this.pointer = null;
        this.active = false;
        this.removeAttribute("shooting");
        this.fire("drawend", 0, 0);
        this.shoot = false;
    }

    private fire(type: string, dx: number, dy: number) {
        this.dispatchEvent(new CustomEvent<DrawEvent>(type, { detail: { dx, dy, shoot: this.shoot }, bubbles: true, composed: true }));
    }

    render() {
        return html`
            <div class="button" part="button">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M6 3c5 3 5 15 0 18" />
                    <path d="M6 3v18" class="cord" />
                    <path d="M3 12h16m-3-3 3 3-3 3" />
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
