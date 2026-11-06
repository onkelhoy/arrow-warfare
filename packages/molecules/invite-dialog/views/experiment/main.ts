import "@papit/codeblock";
import "@papit/button";
import { loadText, useTheme } from "@arrow-warfare/core";
import { inviteBlock, mountInvite } from "@arrow-warfare/invite-dialog";

await loadText();
useTheme();

const dialog = mountInvite();
dialog.link("https://onkelhoy.github.io/arrow-warfare/?by=henry#example");
const block = inviteBlock();
block.link("https://onkelhoy.github.io/arrow-warfare/?by=henry#example");
document.querySelector("#block")!.append(block.element);
document.querySelector("#open")!.addEventListener("click", () => dialog.open());
