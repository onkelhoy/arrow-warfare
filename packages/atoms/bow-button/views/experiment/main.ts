// core
import "@papit/codeblock";

// component
import "@arrow-warfare/bow-button";
import type { DrawEvent } from "@arrow-warfare/bow-button";

const value = document.querySelector("#value")!;
let aimX = 0, aimY = 0;
const show = (event: Event) => {
    const { pull, dx, dy, anchored } = (event as CustomEvent<DrawEvent>).detail;
    aimX += dx;
    aimY += dy;
    value.textContent = `${event.type} · pull ${pull.toFixed(2)}${anchored ? " · anchored" : ""} · aimed ${aimX.toFixed(0)}, ${aimY.toFixed(0)} px`;
    if (event.type === "drawend") value.textContent += pull >= .15 ? " · shot!" : " · let down";
};
for (const type of ["drawstart", "drawmove", "drawend"]) document.addEventListener(type, show, true);
