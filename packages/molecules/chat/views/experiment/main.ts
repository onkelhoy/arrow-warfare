import "@papit/codeblock";
import { loadText, useTheme } from "@arrow-warfare/core";
import { mountChat } from "@arrow-warfare/chat";

await loadText();
useTheme();

const chat = mountChat(document.querySelector<HTMLElement>("#chat")!, (text, team) => chat.add({ from: "me", name: "henry", colour: 0, text, team }));
chat.team(true);
chat.add({ from: "a", name: "anna", colour: 1, text: "hej!", team: false });
chat.add({ from: "b", name: "bob", colour: 2, text: "only my team sees this", team: true });
