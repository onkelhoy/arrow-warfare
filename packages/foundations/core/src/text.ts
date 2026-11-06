import themeSheet from "./theme.css" with { type: "css" };
import { translator, useTranslator } from "@papit/translator";

/** All the game's own words, from `asset/translations/` in core. */
export const t = useTranslator("aw");

/** Swedish when the browser asks for it, English otherwise. Resolves once the words are here. */
export async function loadText() {
    translator.add({ id: "en", url: "/translations/en.json" });
    translator.add({ id: "sv", url: "/translations/sv.json" });

    const wanted = navigator.language?.toLowerCase().startsWith("sv") ? "sv" : "en";
    if (!await translator.change(wanted) && wanted !== "en") await translator.change("en");

    document.documentElement.lang = translator.locale() ?? "en";
}

/** Text from players goes into HTML only through this. */
export const escape = (text: string) => text.replace(/[&<>"']/g, char => `&#${char.charCodeAt(0)};`);

/** A package's stylesheet onto the page, once. */
export function adopt(sheet: CSSStyleSheet) {
    if (!document.adoptedStyleSheets.includes(sheet)) document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
}

export { themeSheet };

/** The medieval look (tokens, `.aw-panel`, `.aw-title`, `.aw-ribbon`, buttons and inputs) onto the page, once. */
export function useTheme() {
    adopt(themeSheet);
}
