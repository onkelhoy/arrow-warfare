import "@papit/codeblock";
import "@arrow-warfare/backdrop";
import { loadText, useTheme } from "@arrow-warfare/core";
import { mountMenu } from "@arrow-warfare/menu";

await loadText();
useTheme();
// `?by=anna` shows the menu as it is for a link
const by = new URLSearchParams(location.search).get("by");
const menu = mountMenu(document.querySelector<HTMLElement>("#stage")!, {
    by,
    onHost: () => menu.status("Hosting... (only in the app)"),
    onJoin: async () => {
        const password = await menu.askPassword(false);
        menu.status(`Would join with "${password}"`);
    },
});
