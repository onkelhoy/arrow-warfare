import "@papit/codeblock";
import { useTheme } from "@arrow-warfare/core";
import "@arrow-warfare/qr-scanner";

useTheme();
const scanner = document.querySelector("aw-qr-scanner")!;
const out = document.querySelector("output")!;
document.querySelector("button")!.addEventListener("click", () => { scanner.active = !scanner.active; });
scanner.addEventListener("scan", event => { out.textContent = (event as CustomEvent).detail.text; scanner.active = false; });
scanner.addEventListener("camera-error", event => { out.textContent = "error: " + (event as CustomEvent).detail.reason; });
