import { loadText } from "@arrow-warfare/core";
import { mountPlay } from "@arrow-warfare/play";
import { example } from "./example";

await loadText();
mountPlay(document.body, example(), true, () => alert("back to the lobby"));
