import { COLOURS, loadText, SKINS, settings, t } from "@arrow-warfare/core";

await loadText();
document.body.innerHTML = `<div style="padding: 24px">
    <h2>${t("menu.title")}</h2>
    <p>Saved settings: <code>${JSON.stringify(settings())}</code></p>
    <p>${COLOURS.map(colour => `<span style="display:inline-block;padding:4px 10px;margin:2px;border-radius:99px;background:${colour.hex}">${t(`colour.${colour.name}`)}</span>`).join("")}</p>
    <p>${SKINS.map(skin => `<span style="display:inline-block;width:24px;height:24px;margin:2px;border-radius:50%;background:${skin}"></span>`).join("")}</p>
</div>`;
