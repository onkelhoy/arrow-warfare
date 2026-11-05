import "@papit/button";
import { adopt, COLOURS, escape, t, teamName, wears, type GameState } from "@arrow-warfare/core";

import sheet from "./style.css" with { type: "css" };

export type ResultsOptions = {
    state: GameState;
    me: string;
    host: boolean;
    onBack(): void;
    onRematch(): void;
};

const seconds = (ms: number) => {
    const s = Math.round(ms / 1000);
    return s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : `${s} s`;
};

/** The end of a round: who won, or a draw, and a row of stats per player. The host goes on from here. */
export function mountResults(root: HTMLElement, { state, me, host, onBack, onRematch }: ResultsOptions) {
    adopt(sheet);
    const results = state.results!;
    const player = (id: string) => state.players.find(other => other.id === id);
    const dot = (colour: number) => `<span class="aw-results-dot" style="background: ${COLOURS[colour].hex}"></span>`;

    let title = t("results.draw");
    const winner = results.winner;
    if (winner?.kind === "player")
    {
        const found = player(winner.id);
        title = winner.id === me ? t("results.you") : t("results.wins", { name: escape(found?.name ?? "?") });
    }
    else if (winner?.kind === "team")
    {
        const team = state.teams.find(other => other.id === winner.id);
        const mine = player(me)?.team === winner.id;
        const name = team ? teamName(team) || t(`colour.${COLOURS[team.colour].name}`) : "?";
        title = mine ? t("results.you") : t("results.wins", { name: escape(name) });
    }

    const rows = [...results.players].sort((a, b) => Number(b.won) - Number(a.won) || b.kills - a.kills || b.alive - a.alive);
    const page = document.createElement("main");
    page.className = "aw-results";
    page.innerHTML = `
        <p class="aw-results-over">${t("results.title")} · ${seconds(results.duration)}</p>
        <h1>${title}</h1>
        ${results.wins ? `<p class="aw-results-over">${t("results.rounds")}: ${Object.entries(results.wins).map(([id, count]) => `${escape((state.teams.find(team => team.id === id) ? teamName(state.teams.find(team => team.id === id)!) : player(id)?.name) || "?")} ${count}`).join(" · ")}</p>` : ""}
        <div class="aw-results-table">
            <table>
                <thead><tr>${["player", "kills", "shots", "hits", "rate", "longest", "picked", "taken", "alive"].map(key => `<th>${t(`results.${key}`)}</th>`).join("")}</tr></thead>
                <tbody>${rows.map(stats => {
                    const found = player(stats.id);
                    const rate = stats.shots ? Math.round(stats.hits / stats.shots * 100) : 0;
                    return `<tr class="${stats.won ? "won" : ""} ${stats.id === me ? "me" : ""}">
                        <td>${found ? dot(wears(state, found)) : ""}${escape(found?.name ?? "?")}</td>
                        <td>${stats.kills}</td><td>${stats.shots}</td><td>${stats.hits}</td><td>${rate}%</td>
                        <td>${stats.longest ? `${stats.longest.toFixed(1)} m` : "–"}</td><td>${stats.picked}</td><td>${stats.taken ?? 0}</td><td>${seconds(stats.alive)}</td>
                    </tr>`;
                }).join("")}</tbody>
            </table>
        </div>
        <div class="aw-results-actions">
            ${host
                ? `<pap-button data-do="rematch" color="primary">${t("results.rematch")}</pap-button><pap-button data-do="back" variant="outline">${t("results.back")}</pap-button>`
                : `<p>${t("results.wait")}</p>`}
        </div>
    `;
    root.append(page);
    page.querySelector("[data-do=rematch]")?.addEventListener("click", onRematch);
    page.querySelector("[data-do=back]")?.addEventListener("click", onBack);

    return { element: page, remove: () => page.remove() };
}
