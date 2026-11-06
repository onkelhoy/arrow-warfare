import "@papit/codeblock";
import "@papit/button";
import { loadText, saveSettings, settings, useTheme } from "@arrow-warfare/core";
import { mountTouchLayout } from "@arrow-warfare/touch-layout";

await loadText();
useTheme();
saveSettings();
const saved = document.querySelector("#saved")!;
const show = () => { saved.textContent = JSON.stringify(settings().bow); };
show();
document.querySelector("#open")!.addEventListener("click", () => mountTouchLayout(document.body, show));
