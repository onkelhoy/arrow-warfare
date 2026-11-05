import { escape, t } from "@arrow-warfare/core";

/** How many lines the kill feed shows, and for how long. */
const FEED = 4;
const FEED_TIME = 7000;

/**
 * What's drawn over the meadow. Kept very light, a redesign comes later: no crosshair, only a marker on a
 * hit (red on a kill), the arrows left, who's left, a feed of kills, banners, and the tunnel vision.
 */
export class Hud {
    readonly element: HTMLElement;
    private marker: HTMLElement;
    private hand: HTMLElement;
    private quiver: HTMLElement;
    private left: HTMLElement;
    private feed: HTMLElement;
    private banner: HTMLElement;
    private tunnel: HTMLElement;
    private shown = { arrows: "", left: "", tunnel: -1 };

    constructor(root: HTMLElement) {
        this.element = document.createElement("div");
        this.element.className = "aw-hud";
        this.element.innerHTML = `
            <div class="aw-hud-tunnel" hidden></div>
            <div class="aw-hud-marker"><i></i><i></i><i></i><i></i></div>
            <svg class="aw-hud-hand" hidden viewBox="0 0 24 24" aria-hidden="true"><path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11m0-1.5v-6a1.5 1.5 0 0 1 3 0V11m0-5.5a1.5 1.5 0 0 1 3 0V12m0-4.5a1.5 1.5 0 0 1 3 0V15a7 7 0 0 1-7 7h-1.5a6 6 0 0 1-4.7-2.3L3.5 16a1.6 1.6 0 0 1 2.4-2.1L8 16"/></svg>
            <div class="aw-hud-left" aria-live="polite"></div>
            <ol class="aw-hud-feed" aria-live="polite"></ol>
            <div class="aw-hud-quiver"></div>
            <div class="aw-hud-banner" role="status" hidden></div>
        `;
        root.append(this.element);
        const find = (selector: string) => this.element.querySelector<HTMLElement>(selector)!;
        this.marker = find(".aw-hud-marker");
        this.hand = find(".aw-hud-hand");
        this.quiver = find(".aw-hud-quiver");
        this.left = find(".aw-hud-left");
        this.feed = find(".aw-hud-feed");
        this.banner = find(".aw-hud-banner");
        this.tunnel = find(".aw-hud-tunnel");
    }

    /** `Infinity` for unlimited. */
    arrows(count: number) {
        const text = Number.isFinite(count) ? `<b>${count}</b> ${t(count === 1 ? "hud.arrow" : "hud.arrows")}` : t("hud.unlimited");
        if (text === this.shown.arrows) return;
        this.shown.arrows = text;
        this.quiver.innerHTML = text;
        this.quiver.classList.toggle("empty", count === 0);
    }

    /** What's left standing: players, or teams. */
    standing(text: string) {
        if (text === this.shown.left) return;
        this.shown.left = text;
        this.left.textContent = text;
    }

    /** The marker in the middle, red for a kill. */
    hit(kill: boolean) {
        this.marker.classList.remove("show", "kill");
        void this.marker.offsetWidth;
        this.marker.classList.add("show");
        this.marker.classList.toggle("kill", kill);
    }

    /** The hand in the middle, on a computer, when an arrow can be picked up there. */
    pickable(show: boolean) {
        if (this.hand.hidden === !show) return;
        this.hand.hidden = !show;
    }

    /** 0..1 how dark and blurred the edges are. */
    tired(amount: number) {
        // it comes on quickly, then deepens
        const rounded = Math.round(Math.sqrt(amount) * 50) / 50;
        if (rounded === this.shown.tunnel) return;
        this.shown.tunnel = rounded;
        this.tunnel.hidden = rounded <= 0;
        this.tunnel.style.opacity = String(rounded);
    }

    /** A line in the kill feed, `html` already escaped. */
    line(html: string) {
        const item = document.createElement("li");
        item.innerHTML = html;
        this.feed.append(item);
        while (this.feed.children.length > FEED) this.feed.firstElementChild?.remove();
        setTimeout(() => item.remove(), FEED_TIME);
    }

    /** A big message in the middle, empty hides it. */
    say(text: string, kind: "" | "win" | "lose" = "") {
        this.banner.hidden = !text;
        this.banner.textContent = text;
        this.banner.className = `aw-hud-banner ${kind}`;
    }

    destroy() {
        this.element.remove();
    }
}

/** "henry" with their colour dot, for the feed and banners. */
export function nameTag(name: string, hex: string) {
    return `<span class="aw-hud-who"><span style="background: ${hex}"></span>${escape(name)}</span>`;
}
