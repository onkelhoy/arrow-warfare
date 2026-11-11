import "@papit/button";
import "@arrow-warfare/bow-button";
import { adopt, BOW_PLACE, BOW_SIZE, GUN_PLACE, settings, t, updateSettings, type BowPlace, type GunPlace, type Offset } from "@arrow-warfare/core";

import sheet from "./style.css" with { type: "css" };

/**
 * Place your touch controls: a full screen layer with the bow button on it. Drag it where the thumb likes
 * it, change its size, and it's saved on the device as it moves. The joystick stays where you put your
 * thumb, so only the bow button is placed. `kind` "gun" places a gun's trigger instead (its own place), with
 * its aim and reload buttons: dragging the trigger moves all three, dragging one of those moves only it.
 */
export function mountTouchLayout(root: HTMLElement = document.body, onDone: () => void = () => undefined, kind: "bow" | "gun" = "bow") {
    adopt(sheet);
    const layer = document.createElement("div");
    layer.className = "aw-layout";
    layer.innerHTML = `
        <p class="aw-layout-title">${t(kind === "gun" ? "layout.gunTitle" : "layout.title")}</p>
        <div class="aw-layout-bow"><aw-bow-button></aw-bow-button></div>
        ${kind === "gun" ? `
        <div class="aw-layout-small" data-button="aim"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4"/></svg></div>
        <div class="aw-layout-small" data-button="reload"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5"/></svg></div>` : ""}
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

    if (kind === "gun") (find("aw-bow-button") as HTMLElement & { gun: boolean }).gun = true;
    const fresh = () => kind === "gun" ? structuredClone(GUN_PLACE) : { ...BOW_PLACE };
    let place: BowPlace | GunPlace = structuredClone(settings()[kind]);
    const smalls = [...layer.querySelectorAll<HTMLElement>(".aw-layout-small")];
    const show = () => {
        holder.style.setProperty("--size", `${place.size}px`);
        holder.style.left = `${place.x * 100}%`;
        holder.style.top = `${place.y * 100}%`;
        size.value = String(place.size);
        for (const small of smalls)
        {
            const offset = (place as GunPlace)[small.dataset.button as "aim" | "reload"];
            small.style.setProperty("--size", `${Math.round(place.size * .6)}px`);
            small.style.left = `calc(${place.x * 100}% + ${offset.dx}px)`;
            small.style.top = `calc(${place.y * 100}% + ${offset.dy}px)`;
        }
    };
    const save = (next: BowPlace | GunPlace) => {
        place = next;
        updateSettings({ [kind]: structuredClone(place) });
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

    // aim and reload, each on its own: kept as where they are from the trigger
    for (const small of smalls)
    {
        const name = small.dataset.button as "aim" | "reload";
        let held: number | null = null, grabX = 0, grabY = 0;
        small.addEventListener("pointerdown", event => {
            event.preventDefault();
            event.stopPropagation();
            held = event.pointerId;
            small.setPointerCapture(event.pointerId);
            const box = small.getBoundingClientRect();
            grabX = event.clientX - (box.left + box.width / 2);
            grabY = event.clientY - (box.top + box.height / 2);
        });
        small.addEventListener("pointermove", event => {
            if (event.pointerId !== held) return;
            const box = layer.getBoundingClientRect();
            const x = Math.max(box.left + 10, Math.min(box.right - 10, event.clientX - grabX));
            const y = Math.max(box.top + 10, Math.min(box.bottom - 10, event.clientY - grabY));
            const offset: Offset = { dx: Math.round(x - (box.left + place.x * box.width)), dy: Math.round(y - (box.top + place.y * box.height)) };
            save({ ...place, [name]: offset } as GunPlace);
        });
        const let_go = (event: PointerEvent) => {
            if (event.pointerId === held) held = null;
        };
        small.addEventListener("pointerup", let_go);
        small.addEventListener("pointercancel", let_go);
    }

    size.addEventListener("input", () => save({ ...place, size: Number(size.value) }));
    find("[data-do=reset]").addEventListener("click", () => save(fresh()));
    const remove = () => layer.remove();
    find("[data-do=done]").addEventListener("click", () => {
        remove();
        onDone();
    });

    return { element: layer, remove };
}
