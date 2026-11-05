// system
import { CustomElement, html, property } from "@papit/web-component";

// local
import sheet from "./style.css" with { type: "css" };
import type { DrawEvent } from "./types";

/**
 * The bow button. Put a thumb on it and pull down: how far down is how far the bow is drawn, full at
 * `range` pixels. Sideways the same thumb turns. Once fully drawn the bow stays drawn and the thumb aims
 * freely, up and down too. Back on the button (within `cancel` pixels) the bow comes down, then letting
 * go doesn't shoot. Letting go anywhere else shoots.
 *
 * @element aw-bow-button
 *
 * @property {number} range pixels of pull for a full draw
 * @property {number} cancel pixels around the start where the bow comes down
 * @property {boolean} active a thumb is on it (reflected)
 * @property {boolean} disabled can't draw now, shown dimmed (reflected). It still tells about the thumb
 *
 * @fires drawstart {DrawEvent} the thumb went down on it
 * @fires drawmove {DrawEvent} the thumb moved
 * @fires drawend {DrawEvent} the thumb let go, `pull` is what was drawn
 */
export class BowButton extends CustomElement {
    static sheet = sheet;

    @property({ type: Number }) range: number = 120;
    @property({ type: Number }) cancel: number = 26;
    @property({ type: Boolean, reflect: true }) active: boolean = false;
    @property({ type: Boolean, reflect: true }) disabled: boolean = false;

    /** 0..1. */
    pull = 0;
    /** Fully drawn once, the thumb aims both ways now. */
    anchored = false;

    private pointer: number | null = null;
    private startX = 0;
    private startY = 0;
    private lastX = 0;
    private lastY = 0;

    connectedCallback() {
        super.connectedCallback();
        this.addEventListener("pointerdown", this.handledown);
        this.addEventListener("pointermove", this.handlemove);
        this.addEventListener("pointerup", this.handleup);
        this.addEventListener("pointercancel", this.handleup);
        this.addEventListener("lostpointercapture", this.handleup);
        this.addEventListener("contextmenu", this.handlemenu);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this.removeEventListener("pointerdown", this.handledown);
        this.removeEventListener("pointermove", this.handlemove);
        this.removeEventListener("pointerup", this.handleup);
        this.removeEventListener("pointercancel", this.handleup);
        this.removeEventListener("lostpointercapture", this.handleup);
        this.removeEventListener("contextmenu", this.handlemenu);
    }

    private handlemenu = (event: Event) => event.preventDefault();

    private handledown = (event: PointerEvent) => {
        if (this.pointer !== null) return;
        event.preventDefault();
        event.stopPropagation();
        this.pointer = event.pointerId;
        this.setPointerCapture(event.pointerId);
        this.startX = this.lastX = event.clientX;
        this.startY = this.lastY = event.clientY;
        this.pull = 0;
        this.anchored = false;
        this.active = true;
        this.show(0, 0);
        this.fire("drawstart", 0, 0);
    }

    private handlemove = (event: PointerEvent) => {
        if (event.pointerId !== this.pointer) return;
        const dx = event.clientX - this.lastX, dy = event.clientY - this.lastY;
        this.lastX = event.clientX;
        this.lastY = event.clientY;
        const offsetX = event.clientX - this.startX, offsetY = event.clientY - this.startY;
        const home = Math.hypot(offsetX, offsetY) <= this.cancel;

        if (this.anchored && home) this.anchored = false;
        let aimY = 0;
        if (this.anchored)
        {
            this.pull = 1;
            aimY = dy;
        }
        else
        {
            this.pull = home ? 0 : Math.max(0, Math.min(1, offsetY / this.range));
            if (this.pull >= 1) this.anchored = true;
        }
        this.show(offsetX, offsetY);
        this.fire("drawmove", dx, aimY);
    }

    private handleup = (event: PointerEvent) => {
        if (event.pointerId !== this.pointer) return;
        this.pointer = null;
        this.active = false;
        this.show(0, 0);
        this.fire("drawend", 0, 0);
        this.pull = 0;
        this.anchored = false;
    }

    private fire(type: string, dx: number, dy: number) {
        this.dispatchEvent(new CustomEvent<DrawEvent>(type, { detail: { pull: this.pull, dx, dy, anchored: this.anchored }, bubbles: true, composed: true }));
    }

    /** The string from the button to the thumb. */
    private show(x: number, y: number) {
        const length = Math.hypot(x, y);
        this.style.setProperty("--string-length", `${length}px`);
        this.style.setProperty("--string-angle", `${Math.atan2(y, x) - Math.PI / 2}rad`);
        this.style.setProperty("--pull", String(this.pull));
    }

    render() {
        return html`
            <div class="string" part="string"></div>
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
