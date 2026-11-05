import "@papit/button";
import "@papit/input";
import { adopt, cleanName, escape, NAME_LENGTH, settings, t, updateSettings } from "@arrow-warfare/core";

import sheet from "./style.css" with { type: "css" };

type Field = HTMLElement & { value: string };

export type MenuOptions = {
    /** Who sent the link we arrived by, `null` when there's no link. */
    by: string | null;
    onHost(): void;
    onJoin(): void;
};

/** Your name, saved, then host a game, or join the one the link is for. */
export function mountMenu(root: HTMLElement, { by, onHost, onJoin }: MenuOptions) {
    adopt(sheet);
    const menu = document.createElement("main");
    menu.className = "aw-menu";
    const invited = by !== null;
    menu.innerHTML = `
        <h1>${t("menu.title")}</h1>
        ${invited ? `<p class="aw-menu-invited">${by ? t("menu.invitedBy", { name: escape(by) }) : t("menu.invited")}</p>` : ""}
        <form class="aw-menu-form">
            <label>${t("menu.yourName")} <pap-input name="name" maxlength="${NAME_LENGTH}" autocomplete="nickname"></pap-input></label>
            <label class="aw-menu-password" hidden>${t("menu.password")} <pap-input name="password" type="password"></pap-input></label>
            <pap-button data-do="go" color="primary">${invited ? t("menu.join") : t("menu.host")}</pap-button>
            ${invited ? `<pap-button data-do="own" variant="clear" size="small">${t("menu.hostOwn")}</pap-button>` : ""}
        </form>
        <p class="aw-menu-status" role="status"></p>
    `;
    root.append(menu);

    const find = <T extends HTMLElement>(selector: string) => menu.querySelector<T>(selector)!;
    const name = find<Field>("pap-input[name=name]");
    const status = find(".aw-menu-status");
    const passwordRow = find(".aw-menu-password");
    const password = find<Field>("pap-input[name=password]");
    const go = find("[data-do=go]");
    name.value = settings().name;

    let waiting: ((value: string) => void) | null = null;

    const named = () => {
        const value = cleanName(name.value ?? "");
        if (!value)
        {
            status.textContent = t("menu.needName");
            return false;
        }
        updateSettings({ name: value });
        return true;
    };

    const press = () => {
        if (waiting)
        {
            const answer = waiting;
            waiting = null;
            answer(password.value ?? "");
            return;
        }
        if (!named()) return;
        busy(true);
        if (invited) onJoin();
        else onHost();
    };
    const busy = (on: boolean) => {
        go.toggleAttribute("disabled", on);
        name.toggleAttribute("disabled", on);
    };

    find("form").addEventListener("submit", event => { event.preventDefault(); press(); });
    go.addEventListener("click", press);
    for (const field of [name, password]) field.addEventListener("keydown", event => { if ((event as KeyboardEvent).key === "Enter") press(); });
    menu.querySelector("[data-do=own]")?.addEventListener("click", () => {
        if (!named()) return;
        busy(true);
        onHost();
    });

    return {
        element: menu,
        status(text: string) {
            status.textContent = text;
        },
        /** Lets the menu be used again, after a link that didn't work. */
        free() {
            busy(false);
        },
        /** Asks for the game's password, `wrong` when the last one didn't work. */
        askPassword(wrong: boolean) {
            status.textContent = wrong ? t("menu.wrongPassword") : t("menu.needsPassword");
            passwordRow.hidden = false;
            go.removeAttribute("disabled");
            go.textContent = t("menu.join");
            return new Promise<string>(resolve => {
                waiting = value => {
                    go.setAttribute("disabled", "");
                    resolve(value);
                };
            });
        },
        remove() {
            menu.remove();
        },
    };
}
