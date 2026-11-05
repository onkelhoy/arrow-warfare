import "@papit/button";
import { adopt, COLOURS, escape, t, wears, type GameState } from "@arrow-warfare/core";

import sheet from "./style.css" with { type: "css" };

/** A placeholder until the meadow exists: who's playing, and the host can take everyone back. */
export function mountPlay(root: HTMLElement, state: GameState, host: boolean, onBack: () => void) {
    adopt(sheet);
    const play = document.createElement("main");
    play.className = "aw-play";
    play.innerHTML = `
        <h1>${t("play.title")}</h1>
        <p>${t("play.soon")}</p>
        <ul>${state.players.map(player => `<li style="--colour: ${COLOURS[wears(state, player)].hex}">${escape(player.name)}</li>`).join("")}</ul>
        ${host ? `<pap-button color="primary">${t("play.back")}</pap-button>` : `<p>${t("play.waitHost")}</p>`}
    `;
    play.querySelector("pap-button")?.addEventListener("click", onBack);
    root.append(play);
    return { element: play, remove: () => play.remove() };
}
