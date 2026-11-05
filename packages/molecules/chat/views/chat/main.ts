import { loadText } from "@arrow-warfare/core";
import { mountChat } from "@arrow-warfare/chat";

await loadText();
const root = document.createElement("div");
root.style.cssText = "padding: 24px; max-width: 30rem";
document.body.append(root);
const chat = mountChat(root, (text, team) => chat.add({ from: "me", name: "henry", colour: 0, text, team }));
chat.team(true);
chat.add({ from: "a", name: "anna", colour: 1, text: "hej!", team: false });
chat.add({ from: "b", name: "bob", colour: 2, text: "only my team sees this", team: true });
