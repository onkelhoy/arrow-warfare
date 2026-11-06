import "@papit/button";
import "@papit/input";
import { adopt, useTheme, CHAT_LENGTH, COLOURS, escape, t, type ChatLine } from "@arrow-warfare/core";

import sheet from "./style.css" with { type: "css" };

type Field = HTMLElement & { value: string };

/** How many lines each tab keeps. */
const KEEP = 100;

/**
 * Plain text chat. The everyone tab is always there, the team tab only while `team(true)`.
 * `onSend(text, team)` is called with what was written, the lines come back through `add`.
 */
export function mountChat(root: HTMLElement, onSend: (text: string, team: boolean) => void, labels: { all?: string } = {}) {
    useTheme();
    adopt(sheet);
    const chat = document.createElement("section");
    chat.className = "aw-chat";
    chat.innerHTML = `
        <div class="aw-chat-tabs" role="tablist">
            <button role="tab" data-tab="all" aria-selected="true">${labels.all ?? t("chat.everyone")}</button>
            <button role="tab" data-tab="team" aria-selected="false" hidden>${t("chat.team")}</button>
        </div>
        <ol class="aw-chat-lines" data-tab="all" aria-live="polite"></ol>
        <ol class="aw-chat-lines" data-tab="team" aria-live="polite" hidden></ol>
        <form class="aw-chat-form">
            <pap-input maxlength="${CHAT_LENGTH}" placeholder="${t("chat.placeholder")}"></pap-input>
            <pap-button type="submit" size="small">${t("chat.send")}</pap-button>
        </form>
    `;
    root.append(chat);

    const find = <T extends HTMLElement>(selector: string) => chat.querySelector<T>(selector)!;
    const field = find<Field>("pap-input");
    const teamTab = find(`button[data-tab=team]`);
    let tab: "all" | "team" = "all";

    const select = (next: "all" | "team") => {
        tab = next;
        for (const button of chat.querySelectorAll<HTMLElement>("[role=tab]"))
        {
            button.setAttribute("aria-selected", String(button.dataset.tab === next));
            if (button.dataset.tab === next) button.classList.remove("unread");
        }
        for (const list of chat.querySelectorAll<HTMLElement>("ol")) list.hidden = list.dataset.tab !== next;
    };
    for (const button of chat.querySelectorAll<HTMLElement>("[role=tab]"))
        button.addEventListener("click", () => select(button.dataset.tab as "all" | "team"));

    const submit = () => {
        const text = (field.value ?? "").trim().slice(0, CHAT_LENGTH);
        if (!text) return;
        onSend(text, tab === "team");
        field.value = "";
    };
    find("form").addEventListener("submit", event => { event.preventDefault(); submit(); });
    // a pap-input doesn't submit the light DOM form on enter
    field.addEventListener("keydown", event => { if ((event as KeyboardEvent).key === "Enter") submit(); });
    find("pap-button").addEventListener("click", submit);

    return {
        element: chat,
        add(line: ChatLine) {
            const list = find(`ol[data-tab=${line.team ? "team" : "all"}]`);
            const item = document.createElement("li");
            item.innerHTML = `<b style="color: ${COLOURS[line.colour]?.hex ?? "inherit"}">${escape(line.name)}</b> ${escape(line.text)}`;
            list.append(item);
            while (list.children.length > KEEP) list.firstElementChild!.remove();
            list.scrollTop = list.scrollHeight;
            if ((line.team ? "team" : "all") !== tab) find(`button[data-tab=${line.team ? "team" : "all"}]`).classList.add("unread");
        },
        /** In a team or not, which shows or hides the team tab. */
        team(on: boolean) {
            teamTab.hidden = !on;
            if (!on)
            {
                find("ol[data-tab=team]").replaceChildren();
                if (tab === "team") select("all");
            }
        },
        clear() {
            for (const list of chat.querySelectorAll("ol")) list.replaceChildren();
        },
    };
}
