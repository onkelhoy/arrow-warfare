import "@papit/button";
import "@arrow-warfare/bow-button";
import { adopt, BOW_PLACE, BOW_SIZE, settings, t, updateSettings, type BowPlace } from "@arrow-warfare/core";

import sheet from "./style.css" with { type: "css" };

/**
 * Place your touch controls: a full screen layer with the bow button on it. Drag it where the thumb likes
 * it, change its size, and it's saved on the device as it moves. The joystick stays where you put your
 * thumb, so only the bow button is placed.
 */
export function mountTouchLayout(root: HTMLElement = document.body, onDone: () => void = () => undefined) {
    adopt(sheet);
    const layer = document.createElement("div");
    layer.className = "aw-layout";
    layer.innerHTML = `
        <p class="aw-layout-title">${t("layout.title")}</p>
        <div class="aw-layout-bow"><aw-bow-button></aw-bow-button></div>
        <div class="aw-layout-bar">
            <label>${t("layout.size")} <input type="range" name="size" min="${BOW_SIZE.min}" max="${BOW_SIZE.max}" step="2"></label>
            <pap-button data-do="reset" size="small" variant="outline">${t("layout.reset")}</pap-button>
            <pap-button data-do="done" size="small" color="primary">${t("layout.done")}</pap-button>
        </div>
    `;
    root.append(layer);
    const find = <T extends HTMLElement>(selector: string) => layer.querySelector<T>(selector)!;
    const holder = find(".aw-layout-bow");
    const size = find<HTMLInputElement>("input[name=size]");

    let place: BowPlace = { ...settings().bow };
    const show = () => {
        holder.style.setProperty("--size", `${place.size}px`);
        holder.style.left = `${place.x * 100}%`;
        holder.style.top = `${place.y * 100}%`;
        size.value = String(place.size);
    };
    const save = (next: BowPlace) => {
        place = next;
        updateSettings({ bow: { ...place } });
        show();
    };
    show();

    let dragging: number | null = null, offsetX = 0, offsetY = 0;
    holder.addEventListener("pointerdown", event => {
        event.preventDefault();
        event.stopPropagation();
        dragging = event.pointerId;
        holder.setPointerCapture(event.pointerId);
        const box = holder.getBoundingClientRect();
        offsetX = event.clientX - (box.left + box.width / 2);
        offsetY = event.clientY - (box.top + box.height / 2);
    }, true);
    holder.addEventListener("pointermove", event => {
        if (event.pointerId !== dragging) return;
        const box = layer.getBoundingClientRect();
        const clamp = (n: number) => Math.max(.03, Math.min(.97, n));
        save({ ...place, x: clamp((event.clientX - offsetX - box.left) / box.width), y: clamp((event.clientY - offsetY - box.top) / box.height) });
    });
    const up = (event: PointerEvent) => {
        if (event.pointerId === dragging) dragging = null;
    };
    holder.addEventListener("pointerup", up);
    holder.addEventListener("pointercancel", up);

    size.addEventListener("input", () => save({ ...place, size: Number(size.value) }));
    find("[data-do=reset]").addEventListener("click", () => save({ ...BOW_PLACE }));
    const remove = () => layer.remove();
    find("[data-do=done]").addEventListener("click", () => {
        remove();
        onDone();
    });

    return { element: layer, remove };
}
