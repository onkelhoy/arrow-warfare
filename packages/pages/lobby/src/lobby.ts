import "@papit/button";
import "@papit/input";
import "@papit/tabs";
import { mountChat } from "@arrow-warfare/chat";
import { adopt, ARROWS_DEFAULT, COLOURS, escape, FORCE_AFTER, MAX_LIMIT, NAME_IDEA_LENGTH, t, teamName, WEAK_PING, wears, type ChatLine, type GameState, type Player, type Rules } from "@arrow-warfare/core";
import { inviteBlock } from "@arrow-warfare/invite-dialog";

import sheet from "./style.css" with { type: "css" };

type Field = HTMLElement & { value: string };

/** What the lobby asks for. The host's actions only show for the host, everyone else sees the tabs read-only. */
export type LobbyActions = {
    ready(ready: boolean): void;
    chat(text: string, team: boolean): void;
    idea(team: string, text: string): void;
    vote(team: string, idea: string): void;
    leave(): void;
    // host only
    game(change: { name?: string; password?: string; max?: number }): void;
    rules(change: Partial<Rules>): void;
    lock(locked: boolean): void;
    kick(player: string): void;
    createTeam(): void;
    deleteTeam(team: string): void;
    assign(player: string, team: string | null): void;
    force(ids: string[]): void;
};

const colourName = (index: number) => t(`colour.${COLOURS[index]?.name ?? "red"}`);
const swatch = (index: number) => `<i class="aw-swatch" style="background: ${COLOURS[index]?.hex}"></i>`;

/** "henry (red)", in the colour they wear. */
export const playerLabel = (state: GameState, player: Player) =>
    `${swatch(wears(state, player))}${escape(player.name)} <span class="aw-dim">(${colourName(wears(state, player))})</span>`;

/**
 * The lobby: a header with ready and lock, the panel tabs (Invite, Game, Players, Teams, Rules) and the
 * chat. It only draws what it's given in `update`, the decisions are the host's, through `actions`.
 */
export function mountLobby(root: HTMLElement, me: string, actions: LobbyActions) {
    adopt(sheet);
    const lobby = document.createElement("main");
    lobby.className = "aw-lobby";
    lobby.innerHTML = `
        <header class="aw-lobby-head">
            <div>
                <h1 class="aw-lobby-name"></h1>
                <p class="aw-lobby-phase aw-dim"></p>
            </div>
            <div class="aw-lobby-buttons">
                <pap-button data-do="ready" color="primary"></pap-button>
                <pap-button data-do="lock" variant="outline" hidden></pap-button>
                <pap-button data-do="leave" variant="clear" size="small">${t("lobby.leave")}</pap-button>
            </div>
        </header>
        <pap-tabs class="aw-lobby-tabs">
            <pap-tab value="players">${t("tab.players")}</pap-tab>
            <pap-tab value="invite">${t("tab.invite")}</pap-tab>
            <pap-tab value="teams">${t("tab.teams")}</pap-tab>
            <pap-tab value="game">${t("tab.game")}</pap-tab>
            <pap-tab value="rules">${t("tab.rules")}</pap-tab>
            <pap-tabpanel value="players"><ul class="aw-players"></ul></pap-tabpanel>
            <pap-tabpanel value="invite"></pap-tabpanel>
            <pap-tabpanel value="teams"><div class="aw-teams"></div></pap-tabpanel>
            <pap-tabpanel value="game">
                <div class="aw-form">
                    <label>${t("game.name")} <pap-input name="name" maxlength="24"></pap-input></label>
                    <label>${t("game.password")} <pap-input name="password" placeholder="${t("game.noPassword")}"></pap-input></label>
                    <label>${t("game.max")} <select name="max">${Array.from({ length: MAX_LIMIT - 1 }, (_, i) => `<option>${i + 2}</option>`).join("")}</select></label>
                    <p class="aw-dim">${t("game.maxNote")}</p>
                </div>
            </pap-tabpanel>
            <pap-tabpanel value="rules">
                <div class="aw-form">
                    <label>${t("rules.arrows")} <select name="arrows">
                        ${Array.from({ length: 10 }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join("")}
                        <option value="0">${t("rules.unlimited")}</option>
                    </select></label>
                </div>
            </pap-tabpanel>
        </pap-tabs>
        <div class="aw-lobby-chat"></div>
        <div class="aw-countdown" aria-live="assertive"></div>
    `;
    root.append(lobby);

    const find = <T extends HTMLElement>(selector: string) => lobby.querySelector<T>(selector)!;
    const invite = inviteBlock();
    find("pap-tabpanel[value=invite]").append(invite.element);
    const chat = mountChat(find(".aw-lobby-chat"), actions.chat);
    const countdown = find(".aw-countdown");

    let state: GameState | null = null;
    let host = false;
    const mine = () => state?.players.find(player => player.id === me);

    // ------------------------------------------------------------------ the header buttons

    find("[data-do=ready]").addEventListener("click", () => actions.ready(!mine()?.ready));
    find("[data-do=lock]").addEventListener("click", () => actions.lock(state?.phase === "open"));
    find("[data-do=leave]").addEventListener("click", () => actions.leave());

    // ------------------------------------------------------------------ the game and rules forms

    const gameName = find<Field>("pap-input[name=name]");
    const password = find<Field>("pap-input[name=password]");
    const max = find<HTMLSelectElement>("select[name=max]");
    const arrows = find<HTMLSelectElement>("select[name=arrows]");
    gameName.addEventListener("change", () => actions.game({ name: gameName.value ?? "" }));
    gameName.addEventListener("input", () => actions.game({ name: gameName.value ?? "" }));
    password.addEventListener("input", () => actions.game({ password: password.value ?? "" }));
    max.addEventListener("change", () => actions.game({ max: Number(max.value) }));
    arrows.addEventListener("change", () => actions.rules({ arrows: Number(arrows.value) }));

    /** A field being typed in keeps what's typed. */
    const set = (field: Field | HTMLSelectElement, value: string) => {
        if (!field.matches(":focus-within") && field.value !== value) field.value = value;
    };

    // ------------------------------------------------------------------ clicks in the lists

    lobby.addEventListener("click", event => {
        const button = (event.target as HTMLElement).closest<HTMLElement>("[data-act]");
        if (!button || !state) return;
        const { act, id = "", team = "" } = button.dataset;
        if (act === "kick") actions.kick(id);
        if (act === "force") actions.force([id]);
        if (act === "force-team") actions.force(state.players.filter(player => player.team === team && !player.ready).map(player => player.id));
        if (act === "create-team") actions.createTeam();
        if (act === "delete-team") actions.deleteTeam(team);
        if (act === "unassign") actions.assign(id, null);
        if (act === "vote") actions.vote(team, id);
        if (act === "idea")
        {
            const field = lobby.querySelector<Field>(`pap-input[data-idea="${team}"]`);
            const text = (field?.value ?? "").trim().slice(0, NAME_IDEA_LENGTH);
            if (text) actions.idea(team, text);
            if (field) field.value = "";
        }
    });
    lobby.addEventListener("change", event => {
        const select = event.target as HTMLSelectElement;
        if (select.dataset.add && select.value) actions.assign(select.value, select.dataset.add);
    });
    lobby.addEventListener("keydown", event => {
        const field = (event.target as HTMLElement).closest<HTMLElement>("pap-input[data-idea]");
        if (field && (event as KeyboardEvent).key === "Enter") field.parentElement?.querySelector<HTMLElement>("[data-act=idea]")?.click();
    });

    // ------------------------------------------------------------------ drawing

    const canForce = () => !!state && host && state.phase === "locked" && forceOpen;
    let forceOpen = false;
    let forceTimer: ReturnType<typeof setTimeout> | undefined;

    const players = () => {
        if (!state) return "";
        return state.players.map(player => {
            const weak = player.ping > WEAK_PING;
            const ping = player.id === state!.host ? t("players.host") : player.ping < 0 ? "…" : `${player.ping} ms`;
            return `<li>
                <span class="aw-player">${playerLabel(state!, player)}${player.id === me ? ` <span class="aw-dim">${t("players.you")}</span>` : ""}</span>
                <span class="aw-ready">${player.ready ? "✓" : ""}</span>
                <span class="aw-ping${weak ? " weak" : ""}" title="${weak ? t("players.weak") : ""}">${ping}${weak ? ` ⚠ ${t("players.weak")}` : ""}</span>
                ${host && !player.ready && canForce() ? `<pap-button size="small" variant="outline" data-act="force" data-id="${player.id}">${t("players.force")}</pap-button>` : ""}
                ${host && player.id !== me ? `<pap-button size="small" variant="clear" data-act="kick" data-id="${player.id}">${t("players.kick")}</pap-button>` : ""}
            </li>`;
        }).join("");
    };

    const teams = () => {
        if (!state) return "";
        const free = state.players.filter(player => !player.team);
        const cards = state.teams.map(team => {
            const members = state!.players.filter(player => player.team === team.id);
            const member = members.some(player => player.id === me);
            const name = teamName(team);
            const voting = team.ideas.length > 1;
            const ideas = team.ideas.map(idea => {
                const voted = idea.votes.includes(me);
                return `<li class="${idea.text === name ? "winning" : ""}">
                    <span>${escape(idea.text)}</span>
                    ${voting ? `<span class="aw-votes">${"●".repeat(idea.votes.length)}</span>` : ""}
                    ${voting && member ? `<button class="aw-vote" data-act="vote" data-team="${team.id}" data-id="${idea.id}" aria-pressed="${voted}">${voted ? t("teams.voted") : t("teams.vote")}</button>` : ""}
                </li>`;
            }).join("");
            return `<article class="aw-team" style="--colour: ${COLOURS[team.colour].hex}">
                <h3>${swatch(team.colour)}${name ? escape(name) : `<span class="aw-dim">${t("teams.unnamed")}</span>`} <span class="aw-dim">(${colourName(team.colour)})</span></h3>
                <ul class="aw-members">${members.map(player => `<li>${escape(player.name)}${player.ready ? " ✓" : ""}${host ? ` <button class="aw-x" data-act="unassign" data-id="${player.id}" aria-label="${t("teams.remove")}">×</button>` : ""}</li>`).join("") || `<li class="aw-dim">${t("teams.empty")}</li>`}</ul>
                ${host && free.length ? `<select data-add="${team.id}"><option value="">${t("teams.add")}</option>${free.map(player => `<option value="${player.id}">${escape(player.name)}</option>`).join("")}</select>` : ""}
                ${team.ideas.length ? `<div class="aw-sign"><p>${t(voting ? "teams.voteName" : "teams.name")}</p><ul>${ideas}</ul></div>` : ""}
                ${member ? `<div class="aw-idea"><pap-input data-idea="${team.id}" maxlength="${NAME_IDEA_LENGTH}" placeholder="${t("teams.ideaPlaceholder")}"></pap-input><pap-button size="small" data-act="idea" data-team="${team.id}">${t("teams.suggest")}</pap-button></div>` : ""}
                ${host ? `<div class="aw-team-host">
                    ${canForce() && members.some(player => !player.ready) ? `<pap-button size="small" variant="outline" data-act="force-team" data-team="${team.id}">${t("teams.force")}</pap-button>` : ""}
                    <pap-button size="small" variant="clear" data-act="delete-team" data-team="${team.id}">${t("teams.delete")}</pap-button>
                </div>` : ""}
            </article>`;
        }).join("");
        return `<p class="aw-dim">${state.teams.length ? t("teams.note") : t("teams.none")}</p>
            ${cards}
            ${host ? `<pap-button variant="outline" data-act="create-team">${t("teams.create")}</pap-button>` : ""}`;
    };

    /** A list is drawn again only when it changed, so a half typed idea or an open select survives. */
    const draw = (selector: string, html: string) => {
        const element = find(selector);
        if (element.dataset.drawn === html) return;
        // keep what's being typed in an idea field
        const typed = new Map<string, string>();
        for (const field of element.querySelectorAll<Field>("pap-input[data-idea]")) typed.set(field.dataset.idea!, field.value);
        const focused = (document.activeElement as HTMLElement | null)?.closest?.("pap-input[data-idea]")?.getAttribute("data-idea");
        element.innerHTML = html;
        element.dataset.drawn = html;
        for (const field of element.querySelectorAll<Field>("pap-input[data-idea]"))
        {
            const value = typed.get(field.dataset.idea!);
            if (value) field.value = value;
            if (field.dataset.idea === focused) field.focus();
        }
    };

    const showTab = (value: string, shown: boolean) => {
        const tab = find(`pap-tab[value=${value}]`);
        tab.hidden = !shown;
        tab.style.display = shown ? "" : "none";
        if (!shown && tab.matches(":state(selected)")) find<HTMLElement>("pap-tab[value=players]").click();
    };

    const render = () => {
        if (!state) return;
        const phase = state.phase;
        const ready = !!mine()?.ready;
        const locked = phase !== "open";

        find(".aw-lobby-name").textContent = state.name || t("lobby.untitled");
        find(".aw-lobby-phase").textContent = t(`phase.${phase}`, { count: String(state.players.filter(player => player.ready).length), total: String(state.players.length) });

        const readyButton = find("[data-do=ready]");
        readyButton.textContent = ready ? t("lobby.notReady") : t("lobby.ready");
        readyButton.toggleAttribute("disabled", phase !== "locked");

        const lock = find("[data-do=lock]");
        lock.hidden = !host;
        lock.style.display = host ? "" : "none";
        lock.textContent = locked ? t("lobby.unlock") : t("lobby.lock");
        lock.toggleAttribute("disabled", phase === "countdown");

        showTab("invite", !locked);
        showTab("teams", locked);

        for (const field of [gameName, password, max, arrows]) field.toggleAttribute("disabled", !host);
        set(gameName, state.name);
        if (!host) set(password, state.password ? "••••" : "");
        set(max, String(state.max));
        set(arrows, String(state.rules.arrows ?? ARROWS_DEFAULT));

        draw(".aw-players", players());
        draw(".aw-teams", teams());
        chat.team(!!mine()?.team);
    };

    return {
        element: lobby,
        update(next: GameState) {
            const lockedNow = next.phase === "locked" && state?.phase !== "locked";
            state = next;
            host = next.host === me;
            if (lockedNow || next.phase !== "locked")
            {
                // the host can force ready a while after locking, `lockedAt` is on the host's clock
                clearTimeout(forceTimer);
                forceOpen = false;
                if (next.phase === "locked" && host)
                {
                    const wait = next.lockedAt + FORCE_AFTER - performance.now();
                    forceTimer = setTimeout(() => { forceOpen = true; render(); }, Math.max(0, wait));
                }
            }
            if (next.phase !== "countdown") countdown.textContent = "";
            render();
        },
        /** The invite link, or words about it while it's made. */
        invite,
        chat(line: ChatLine) {
            chat.add(line);
        },
        /** 3, 2, 1 to `at`, on our own clock. */
        countdown(at: number) {
            for (const number of [3, 2, 1])
            {
                const delay = at - number * 1000 - performance.now();
                if (delay > -900) setTimeout(() => {
                    if (state?.phase !== "countdown") return;
                    countdown.textContent = String(number);
                    countdown.classList.remove("pop");
                    void countdown.offsetWidth;
                    countdown.classList.add("pop");
                }, Math.max(0, delay));
            }
        },
        remove() {
            clearTimeout(forceTimer);
            lobby.remove();
        },
    };
}
