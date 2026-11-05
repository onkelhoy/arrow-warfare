import "@papit/button";
import { loadText } from "@arrow-warfare/core";
import { inviteBlock, mountInvite } from "@arrow-warfare/invite-dialog";

await loadText();
const dialog = mountInvite();
dialog.link("https://onkelhoy.github.io/arrow-warfare/?by=henry#example");
const block = inviteBlock();
block.element.style.padding = "24px";
const open = document.createElement("pap-button");
open.textContent = "Open the dialog";
open.addEventListener("click", () => dialog.open());
document.body.append(open, block.element);
