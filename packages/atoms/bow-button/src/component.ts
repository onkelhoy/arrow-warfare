// system
import { CustomElement, html, property } from "@papit/web-component";

// local
import sheet from "./style.css" with { type: "css" };
import type { DrawEvent } from "./types";

/**
 * The bow button. Hold a thumb on it and the bow draws by time (the game decides how fast). The same
 * thumb aims freely, every direction. Let go in the shoot strip at the right edge of the screen (`edge`
 * pixels wide) and it shoots, let go anywhere else and the bow comes down.
 *
 * @element aw-bow-button
 *
 * @property {number} edge pixels from the right edge of the window where letting go shoots
 * @property {boolean} active a thumb is on it (reflected)
 * @property {boolean} disabled can't draw now, shown dimmed (reflected). It still tells about the thumb
 *
 * @fires drawstart {DrawEvent} the thumb went down on it
 * @fires drawmove {DrawEvent} the thumb moved
 * @fires drawend {DrawEvent} the thumb let go, `shoot` says if it was in the strip
 */
export class BowButton extends CustomElement {
    static sheet = sheet;

    @property({ type: Number }) edge: number = 90;
    @property({ type: Boolean, reflect: true }) active: boolean = false;
    @property({ type: Boolean, reflect: true }) disabled: boolean = false;

    /** The thumb is in the shoot strip. */
    shoot = false;

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

    private inStrip(x: number) {
        return x >= window.innerWidth - this.edge;
    }

    private handledown = (event: PointerEvent) => {
        if (this.pointer !== null) return;
        event.preventDefault();
        event.stopPropagation();
        this.pointer = event.pointerId;
        this.setPointerCapture(event.pointerId);
        this.startX = this.lastX = event.clientX;
        this.startY = this.lastY = event.clientY;
        this.shoot = false;
        this.active = true;
        this.show(0, 0);
        this.fire("drawstart", 0, 0);
    }

    private handlemove = (event: PointerEvent) => {
        if (event.pointerId !== this.pointer) return;
        const dx = event.clientX - this.lastX, dy = event.clientY - this.lastY;
        this.lastX = event.clientX;
        this.lastY = event.clientY;
        this.shoot = this.inStrip(event.clientX);
        this.show(event.clientX - this.startX, event.clientY - this.startY);
        this.fire("drawmove", dx, dy);
    }

    private handleup = (event: PointerEvent) => {
        if (event.pointerId !== this.pointer) return;
        this.shoot = this.inStrip(event.clientX);
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
        this.show(0, 0);
        this.fire("drawend", 0, 0);
        this.shoot = false;
    }

    private fire(type: string, dx: number, dy: number) {
        this.dispatchEvent(new CustomEvent<DrawEvent>(type, { detail: { dx, dy, shoot: this.shoot }, bubbles: true, composed: true }));
    }

    /** The string from the button to the thumb. */
    private show(x: number, y: number) {
        const length = Math.hypot(x, y);
        this.style.setProperty("--string-length", `${length}px`);
        this.style.setProperty("--string-angle", `${Math.atan2(y, x) - Math.PI / 2}rad`);
        this.toggleAttribute("shooting", this.shoot);
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
