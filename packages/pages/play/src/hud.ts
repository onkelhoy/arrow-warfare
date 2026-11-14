import { WOUND } from "@arrow-warfare/archery";
import { escape, t } from "@arrow-warfare/core";

/** How many lines the kill feed shows, and for how long. */
const FEED = 4;
const FEED_TIME = 7000;

/**
 * What's drawn over the meadow. Kept very light, a redesign comes later: no crosshair, only a marker on a
 * hit (red on a kill), the arrows left, who's left, a feed of kills, banners, the tunnel vision, and with
 * injuries: the damage vignette, a little body with the wounds, the energy and a button to pull arrows out.
 */
export class Hud {
    readonly element: HTMLElement;
    private marker: HTMLElement;
    private hand: HTMLElement;
    private quiver: HTMLElement;
    private killCount: HTMLElement;
    private lifeCount: HTMLElement;
    private watchLine: HTMLElement;
    private skipHint: HTMLElement;
    private left: HTMLElement;
    private feed: HTMLElement;
    private banner: HTMLElement;
    private tunnel: HTMLElement;
    private damageLayer: HTMLElement;
    private figure: HTMLElement;
    private energyBar: HTMLElement;
    private pullButton: HTMLButtonElement;
    private promptButton: HTMLButtonElement;
    private shown = { arrows: "", left: "", tunnel: -1, damage: -1, wounds: -1, energy: -1, pull: -1, kills: -1, watch: "", lives: -2 };

    constructor(root: HTMLElement) {
        this.element = document.createElement("div");
        this.element.className = "aw-hud";
        this.element.innerHTML = `
            <div class="aw-hud-damage" hidden></div>
            <div class="aw-hud-tunnel" hidden></div>
            <div class="aw-hud-marker"><i></i><i></i><i></i><i></i></div>
            <svg class="aw-hud-hand" hidden viewBox="0 0 24 24" aria-hidden="true"><path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11m0-1.5v-6a1.5 1.5 0 0 1 3 0V11m0-5.5a1.5 1.5 0 0 1 3 0V12m0-4.5a1.5 1.5 0 0 1 3 0V15a7 7 0 0 1-7 7h-1.5a6 6 0 0 1-4.7-2.3L3.5 16a1.6 1.6 0 0 1 2.4-2.1L8 16"/></svg>
            <div class="aw-hud-left" aria-live="polite"></div>
            <ol class="aw-hud-feed" aria-live="polite"></ol>
            <div class="aw-hud-counts"><div class="aw-hud-lives" hidden></div><div class="aw-hud-kills" hidden></div><div class="aw-hud-quiver"></div></div>
            <p class="aw-hud-watch" hidden></p>
            <p class="aw-hud-skip" hidden>${t("hud.skip")}</p>
            <div class="aw-hud-body" hidden>
                <svg viewBox="0 0 40 52" aria-hidden="true">
                    <circle data-zone="head" cx="20" cy="9" r="7"/>
                    <rect data-zone="torso" x="11" y="17" width="18" height="20" rx="5"/>
                    <path data-zone="leftArm" d="M10 20 L4 33"/>
                    <path data-zone="rightArm" d="M30 20 L36 33"/>
                    <path data-zone="leftLeg" d="M16 38 L15 48"/>
                    <path data-zone="rightLeg" d="M24 38 L25 48"/>
                </svg>
                <div class="aw-hud-energy" role="meter" aria-label="${t("hud.energy")}"><i></i></div>
            </div>
            <button class="aw-hud-pull" type="button" hidden></button>
            <button class="aw-hud-prompt" type="button" hidden></button>
            <div class="aw-hud-banner" role="status" hidden></div>
        `;
        root.append(this.element);
        const find = (selector: string) => this.element.querySelector<HTMLElement>(selector)!;
        this.marker = find(".aw-hud-marker");
        this.hand = find(".aw-hud-hand");
        this.quiver = find(".aw-hud-quiver");
        this.killCount = find(".aw-hud-kills");
        this.lifeCount = find(".aw-hud-lives");
        this.watchLine = find(".aw-hud-watch");
        this.skipHint = find(".aw-hud-skip");
        this.left = find(".aw-hud-left");
        this.feed = find(".aw-hud-feed");
        this.banner = find(".aw-hud-banner");
        this.tunnel = find(".aw-hud-tunnel");
        this.damageLayer = find(".aw-hud-damage");
        this.figure = find(".aw-hud-body");
        this.energyBar = find(".aw-hud-energy");
        this.pullButton = find(".aw-hud-pull") as HTMLButtonElement;
        this.pullButton.addEventListener("click", () => this.onPull?.());
        this.promptButton = find(".aw-hud-prompt") as HTMLButtonElement;
        this.promptButton.addEventListener("pointerdown", event => {
            event.preventDefault();
            event.stopPropagation();
            this.onPrompt?.();
        });
    }

    /** The pull out button was pressed. */
    onPull: (() => void) | null = null;
    /** The "pick up" prompt was pressed. */
    onPrompt: (() => void) | null = null;

    /** "Pick up arrow" or "Pick up ammo" when there's one in reach, empty hides it. */
    prompt(text: string) {
        const shown = text ? text + (matchMedia("(pointer: coarse)").matches ? "" : ` · ${t("hud.pickClick")}`) : "";
        if (shown === this.promptButton.textContent && this.promptButton.hidden === !text) return;
        this.promptButton.hidden = !text;
        this.promptButton.textContent = shown;
    }

    /** Hits taken: the edges darken a little more with each, and redden. */
    damage(hits: number) {
        if (hits === this.shown.damage) return;
        this.shown.damage = hits;
        this.damageLayer.hidden = hits <= 0;
        const amount = 1 - .68 ** hits;
        this.damageLayer.style.setProperty("--damage", amount.toFixed(3));
        this.damageLayer.classList.remove("hit");
        void this.damageLayer.offsetWidth;
        if (hits > 0) this.damageLayer.classList.add("hit");
    }

    /** The little body, wounds in red. Hidden without injuries. */
    wounds(bits: number, show: boolean) {
        const key = show ? bits : -2;
        if (key === this.shown.wounds) return;
        this.shown.wounds = key;
        this.figure.hidden = !show;
        for (const [zone, bit] of Object.entries(WOUND)) this.figure.querySelector(`[data-zone=${zone}]`)?.classList.toggle("hurt", (bits & bit) !== 0);
    }

    /** 0..1, shown while it's below full or when resting. */
    energy(amount: number, resting: boolean) {
        const rounded = resting ? -1 - Math.round(amount * 50) : Math.round(amount * 50);
        if (rounded === this.shown.energy) return;
        this.shown.energy = rounded;
        this.energyBar.hidden = amount >= 1 && !resting;
        this.energyBar.classList.toggle("resting", resting);
        this.energyBar.style.setProperty("--energy", amount.toFixed(2));
    }

    /** The button to pull an arrow out of myself, with how many are in me. */
    pull(count: number) {
        if (count === this.shown.pull) return;
        this.shown.pull = count;
        this.pullButton.hidden = count <= 0;
        // on a computer the mouse is locked to look: E does it
        this.pullButton.textContent = t("hud.pull", { count: String(count) }) + (matchMedia("(pointer: coarse)").matches ? "" : " · E");
    }

    /** `Infinity` for unlimited. */
    arrows(count: number) {
        const text = Number.isFinite(count) ? `<b>${count}</b> ${t(count === 1 ? "hud.arrow" : "hud.arrows")}` : t("hud.unlimited");
        if (text === this.shown.arrows) return;
        this.shown.arrows = text;
        this.quiver.innerHTML = text;
        this.quiver.classList.toggle("empty", count === 0);
    }

    /** A gun's rounds out of a full one, or that it's reloading. Empty asks for a reload. */
    rounds(count: number, magazine: number, reloading: boolean, spare = Infinity) {
        const coarse = matchMedia("(pointer: coarse)").matches;
        const extra = Number.isFinite(spare) ? ` · ${t("hud.ammo", { count: String(spare) })}` : "";
        const out = count === 0 && spare <= 0;
        const text = reloading ? t("hud.reloading") : out ? t("hud.noAmmo") : `<b>${count}</b>/${magazine} ${t("hud.rounds")}${extra}${count === 0 && !coarse ? ` · ${t("hud.reloadKey")}` : ""}`;
        if (text === this.shown.arrows) return;
        this.shown.arrows = text;
        this.quiver.innerHTML = text;
        this.quiver.classList.toggle("empty", count === 0 && !reloading);
    }

    /** Lives left (this one included), -1 hides it (one life only). */
    lives(count: number) {
        if (count === this.shown.lives) return;
        this.shown.lives = count;
        this.lifeCount.hidden = count < 0;
        this.lifeCount.innerHTML = `<b>${Math.max(0, count)}</b> ${t(count === 1 ? "hud.life" : "hud.lives")}`;
    }

    /** My kills this round, shown from the first. */
    kills(count: number) {
        if (count === this.shown.kills) return;
        this.shown.kills = count;
        this.killCount.hidden = count <= 0;
        this.killCount.innerHTML = `<b>${count}</b> ${t(count === 1 ? "hud.kill" : "hud.kills")}`;
        this.killCount.classList.remove("pop");
        void this.killCount.offsetWidth;
        this.killCount.classList.add("pop");
    }

    /** Who I'm watching, `html` already escaped, empty hides it. */
    watching(html: string) {
        if (html === this.shown.watch) return;
        this.shown.watch = html;
        this.watchLine.hidden = !html;
        this.watchLine.innerHTML = html;
    }

    /** "Tap to skip", during the kill cam. */
    skippable(show: boolean) {
        if (this.skipHint.hidden === !show) return;
        this.skipHint.hidden = !show;
    }

    /** What's left standing: players, or teams. */
    standing(text: string) {
        if (text === this.shown.left) return;
        this.shown.left = text;
        this.left.textContent = text;
    }

    /** The marker in the middle, red for a kill, white for a wound. */
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
