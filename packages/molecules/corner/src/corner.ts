import "@papit/button";
import "@papit/dialog";
import "@papit/icon";
import "@papit/input";
import { effect } from "@papit/signals";
import { adopt, useTheme, canFullscreen, cleanName, NAME_LENGTH, QUALITIES, SENSITIVITY, settings, t, toggleFullscreen, updateSettings, type Quality, type Volumes } from "@arrow-warfare/core";
import type { Sound } from "@arrow-warfare/sound";
import { mountTouchLayout } from "@arrow-warfare/touch-layout";

import { registerIcons } from "./icons";
import sheet from "./style.css" with { type: "css" };

type Dialog = HTMLElement & { showModal(): void; close(): void };
type Field = HTMLElement & { value: string };

const VOLUMES: (keyof Volumes)[] = ["everything", "music", "sounds", "ambience"];

/** The buttons that are always in the top right, and the settings dialog they open. */
export function mountCorner(sound: Sound, root: HTMLElement = document.body) {
    registerIcons();
    useTheme();
    adopt(sheet);

    const corner = document.createElement("div");
    corner.className = "aw-corner";
    corner.innerHTML = `
        <pap-button data-do="fullscreen" size="icon" variant="clear" aria-label="${t("corner.fullscreen")}"><pap-icon name="fullscreen"></pap-icon></pap-button>
        <pap-button data-do="mute" size="icon" variant="clear" aria-label="${t("corner.sound")}"><pap-icon name="sound-on"></pap-icon></pap-button>
        <pap-button data-do="settings" size="icon" variant="clear" aria-label="${t("corner.settings")}"><pap-icon name="settings"></pap-icon></pap-button>
        <pap-dialog header="${t("corner.settings")}" close-outside-click>
            <label class="aw-corner-row">${t("corner.name")} <pap-input name="name" maxlength="${NAME_LENGTH}"></pap-input></label>
            ${VOLUMES.map(name => `<label class="aw-corner-row">${t(`corner.${name}`)} <input type="range" name="${name}" min="0" max="1" step=".01"></label>`).join("")}
            <label class="aw-corner-row">${t("corner.sensitivity")} <input type="range" name="sensitivity" min="${SENSITIVITY.min}" max="${SENSITIVITY.max}" step=".05"></label>
            <label class="aw-corner-row">${t("corner.hand")} <select name="hand"><option value="right">${t("corner.right")}</option><option value="left">${t("corner.left")}</option></select></label>
            <label class="aw-corner-row">${t("corner.quality")} <select name="quality">${QUALITIES.map(quality => `<option value="${quality}">${t(`corner.${quality}`)}</option>`).join("")}</select></label>
            <label class="aw-corner-row">${t("corner.splashes")} <input type="checkbox" name="splashes"></label>
            ${matchMedia("(pointer: coarse)").matches ? `<pap-button data-do="layout" size="small" variant="outline">${t("layout.open")}</pap-button>` : ""}
        </pap-dialog>
    `;
    root.append(corner);

    const find = <T extends HTMLElement>(selector: string) => corner.querySelector<T>(selector)!;
    const panel = find<Dialog>("pap-dialog");
    const name = find<Field>("pap-input");
    const icon = find("[data-do=mute] pap-icon");

    const stop = effect(() => {
        const { mute, volumes } = settings();
        sound.mute = mute;
        for (const name of VOLUMES) sound.setVolume(name, volumes[name]);
        icon.setAttribute("name", mute ? "sound-off" : "sound-on");
    });

    const full = find("[data-do=fullscreen]");
    if (canFullscreen()) full.addEventListener("click", () => void toggleFullscreen());
    else full.remove();

    find("[data-do=mute]").addEventListener("click", () => updateSettings({ mute: !settings().mute }));

    find("[data-do=settings]").addEventListener("click", () => {
        const { name: current, volumes } = settings();
        name.value = current;
        for (const volume of VOLUMES) find<HTMLInputElement>(`input[name=${volume}]`).value = String(volumes[volume]);
        find<HTMLInputElement>("input[name=sensitivity]").value = String(settings().sensitivity);
        find<HTMLSelectElement>("select[name=hand]").value = settings().hand;
        find<HTMLSelectElement>("select[name=quality]").value = settings().quality;
        find<HTMLInputElement>("input[name=splashes]").checked = settings().splashes;
        panel.showModal();
    });

    corner.querySelector("[data-do=layout]")?.addEventListener("click", () => {
        panel.close();
        mountTouchLayout(root);
    });

    name.addEventListener("input", () => {
        const value = cleanName(name.value ?? "");
        if (value) updateSettings({ name: value });
    });

    find<HTMLSelectElement>("select[name=quality]").addEventListener("change", event => {
        const value = (event.target as HTMLSelectElement).value as Quality;
        if (QUALITIES.includes(value)) updateSettings({ quality: value });
    });
    find<HTMLInputElement>("input[name=splashes]").addEventListener("change", event => {
        updateSettings({ splashes: (event.target as HTMLInputElement).checked });
    });
    find<HTMLSelectElement>("select[name=hand]").addEventListener("change", event => {
        updateSettings({ hand: (event.target as HTMLSelectElement).value === "left" ? "left" : "right" });
    });

    panel.addEventListener("input", event => {
        const target = event.target as HTMLInputElement;
        if (target.type !== "range") return;
        if (target.name === "sensitivity") return updateSettings({ sensitivity: Number(target.value) });
        updateSettings({ volumes: { ...settings().volumes, [target.name]: Number(target.value) } });
    });

    return { element: corner, remove: () => { stop(); corner.remove(); } };
}
