// core
import "@papit/codeblock";

// component
import "@arrow-warfare/bow-button";
import type { DrawEvent } from "@arrow-warfare/bow-button";

const value = document.querySelector("#value")!;
let aimX = 0, aimY = 0;
const show = (event: Event) => {
    const { dx, dy, shoot } = (event as CustomEvent<DrawEvent>).detail;
    aimX += dx;
    aimY += dy;
    value.textContent = `${event.type}${shoot ? " · in the strip" : ""} · aimed ${aimX.toFixed(0)}, ${aimY.toFixed(0)} px`;
    if (event.type === "drawend") value.textContent += (event as CustomEvent<DrawEvent>).detail.shoot ? " · shot!" : " · let down";
};
for (const type of ["drawstart", "drawmove", "drawend"]) document.addEventListener(type, show, true);
