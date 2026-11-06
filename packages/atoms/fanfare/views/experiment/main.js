// core
import "@papit/codeblock";
import "@papit/button";
import "@arrow-warfare/backdrop";
import { useTheme } from "@arrow-warfare/core";

// component
import "@arrow-warfare/fanfare";

useTheme();
for (const button of document.querySelectorAll("[data-play]"))
    button.addEventListener("click", () => document.getElementById(button.dataset.play).play());
for (const button of document.querySelectorAll("[data-lower]"))
    button.addEventListener("click", () => document.getElementById(button.dataset.lower).lower());
