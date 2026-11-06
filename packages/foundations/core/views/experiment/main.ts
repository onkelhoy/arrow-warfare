import "@papit/codeblock";
import "@papit/button";
import "@papit/input";
import { COLOURS, loadText, useTheme, SKINS, settings, t } from "@arrow-warfare/core";

await loadText();
const chip = "display:inline-block;padding:4px 10px;margin:2px;border-radius:99px;color:#1d1d1d";
document.querySelector("#title")!.textContent = `${t("menu.title")} (${document.documentElement.lang})`;
document.querySelector("#colours")!.innerHTML = COLOURS.map(colour => `<span style="${chip};background:${colour.hex}">${t(`colour.${colour.name}`)}</span>`).join("");
document.querySelector("#skins")!.innerHTML = SKINS.map(skin => `<span style="display:inline-block;width:24px;height:24px;margin:2px;border-radius:50%;background:${skin}"></span>`).join("");
document.querySelector("#settings")!.textContent = JSON.stringify(settings(), null, 2);
useTheme();
