import "@papit/button";
import "@papit/input";
import "@arrow-warfare/qr-scanner";
import { adopt, useTheme, cleanName, escape, NAME_LENGTH, settings, t, updateSettings } from "@arrow-warfare/core";

import sheet from "./style.css" with { type: "css" };

type Field = HTMLElement & { value: string };

export type MenuOptions = {
    /** Who sent the link we arrived by, `null` when there's no link. */
    by: string | null;
    onHost(): void;
    onJoin(): void;
    /** A QR code was read, `false` when it wasn't a game link. */
    onScan?(text: string): boolean;
};

/** Your name, saved, then host a game, or join the one the link is for. */
export function mountMenu(root: HTMLElement, { by, onHost, onJoin, onScan }: MenuOptions) {
    useTheme();
    adopt(sheet);
    const menu = document.createElement("main");
    menu.className = "aw-menu";
    const invited = by !== null;
    menu.innerHTML = `
        <h1 class="aw-title">${t("menu.title")}</h1>
        <div class="aw-panel aw-menu-panel">
        ${invited ? `<p class="aw-menu-invited">${by ? t("menu.invitedBy", { name: escape(by) }) : t("menu.invited")}</p>` : ""}
        <form class="aw-menu-form">
            <label>${t("menu.yourName")} <pap-input name="name" maxlength="${NAME_LENGTH}" autocomplete="nickname"></pap-input></label>
            <label class="aw-menu-password" hidden>${t("menu.password")} <pap-input name="password" type="password"></pap-input></label>
            <pap-button data-do="go" color="primary">${invited ? t("menu.join") : t("menu.host")}</pap-button>
            ${!invited && onScan && canScan() ? `<pap-button data-do="scan" variant="outline">${t("menu.scan")}</pap-button>` : ""}
            ${invited ? `<pap-button data-do="own" variant="clear" size="small">${t("menu.hostOwn")}</pap-button>` : ""}
        </form>
        <div class="aw-menu-scan" hidden>
            <aw-qr-scanner></aw-qr-scanner>
            <pap-button data-do="stop" variant="clear" size="small">${t("menu.scanStop")}</pap-button>
        </div>
        <p class="aw-menu-status" role="status"></p>
        <pap-button data-do="giveUp" variant="clear" size="small" hidden>${t("status.stop")}</pap-button>
        </div>
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
    const giveUp = find("[data-do=giveUp]");
    let onStop: (() => void) | null = null;
    giveUp.addEventListener("click", () => onStop?.());

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

    // a phone with a camera: scanning in the app keeps a home screen app from opening Safari
    const scanBox = find(".aw-menu-scan");
    const scanner = find<HTMLElement & { active: boolean }>("aw-qr-scanner");
    const form = find("form");
    const scanning = (on: boolean) => {
        scanner.active = on;
        scanBox.hidden = !on;
        form.hidden = on;
        if (on) status.textContent = t("menu.scanHint");
    };
    menu.querySelector("[data-do=scan]")?.addEventListener("click", () => scanning(true));
    find("[data-do=stop]").addEventListener("click", () => { scanning(false); status.textContent = ""; });
    scanner.addEventListener("scan", event => {
        if (onScan?.((event as CustomEvent<{ text: string }>).detail.text)) return;
        status.textContent = t("menu.scanWrong");
        scanner.active = false;
        scanner.active = true;
    });
    scanner.addEventListener("camera-error", event => {
        scanning(false);
        const reason = (event as CustomEvent<{ reason: string }>).detail.reason;
        status.textContent = t(reason === "denied" ? "menu.cameraDenied" : "menu.cameraMissing");
    });

    return {
        element: menu,
        status(text: string) {
            status.textContent = text;
        },
        /** A Stop button under the status while a join is being tried, null hides it. */
        stopper(stop: (() => void) | null) {
            onStop = stop;
            giveUp.hidden = !stop;
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
            scanner.active = false;
            menu.remove();
        },
    };
}

/** A phone (or tablet) that can ask for a camera. */
function canScan() {
    return !!navigator.mediaDevices?.getUserMedia && window.matchMedia("(pointer: coarse)").matches;
}
