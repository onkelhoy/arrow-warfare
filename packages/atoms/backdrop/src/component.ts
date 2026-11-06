import { CustomElement, html, property, unsafeHTML } from "@papit/web-component";

import sheet from "./style.css" with { type: "css" };
import { CLOUD, paint } from "./paint";
import type { Sky } from "./types";

const SKIES: Sky[] = ["night", "dawn", "noon", "sunset"];

/** The time of day from the player's own clock, like the game's light. `?palette=sunset` picks one by hand. */
export function skyNow(search: string = location.search, hour = new Date().getHours()): Sky {
    const name = new URLSearchParams(search).get("palette");
    if (name && SKIES.includes(name as Sky)) return name as Sky;
    if (hour < 6 || hour >= 20) return "night";
    if (hour < 10) return "dawn";
    return hour < 17 ? "noon" : "sunset";
}

/**
 * The painted medieval backdrop behind the menus: the game's sky, the sun or moon, drifting clouds,
 * snowy mountains, a castle on its hill and the forest. It fills its container, put it behind the content.
 */
export class Backdrop extends CustomElement {
    static sheet = sheet;

    /** The time of day, empty follows the clock. */
    @property({ type: String, rerender: true }) sky: Sky | "" = "";
    /** Clouds and flags still, for screenshots and people who want less motion. */
    @property({ type: Boolean }) still: boolean = false;

    private painting = paint();

    render() {
        const sky = this.sky || skyNow();
        const clouds = [0, 1, 2, 3, 4].map(i => `<div class="cloud c${i}">${CLOUD}</div>`).join("");
        return html`
            <div class="sky" part="sky" data-sky="${sky}">
                <div class="clouds">${unsafeHTML(clouds)}</div>
                ${unsafeHTML(this.painting)}
            </div>
            <slot></slot>
        `;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "aw-backdrop": Backdrop;
    }
}
