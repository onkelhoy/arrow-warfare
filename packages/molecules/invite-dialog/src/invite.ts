import "@papit/dialog";
import "@arrow-warfare/qr-code";
import "@arrow-warfare/share-link";
import { adopt, useTheme, t } from "@arrow-warfare/core";

import sheet from "./style.css" with { type: "css" };

type Dialog = HTMLElement & { showModal(): void; close(): void; open: boolean };

/** The QR code, the link and a share button. `mountInvite` puts it in a dialog, `inviteBlock` in a panel. */
export function inviteBlock() {
    useTheme();
    adopt(sheet);
    const block = document.createElement("div");
    block.className = "aw-invite";
    block.innerHTML = `
        <aw-qr-code></aw-qr-code>
        <div>
            <p class="aw-invite-text">${t("invite.connecting")}</p>
            <aw-share-link hidden></aw-share-link>
            <p class="aw-invite-link"></p>
        </div>
    `;
    const qr = block.querySelector<HTMLElement & { value: string }>("aw-qr-code")!;
    const share = block.querySelector<HTMLElement & { link: string }>("aw-share-link")!;
    const text = block.querySelector<HTMLElement>(".aw-invite-text")!;
    const shown = block.querySelector<HTMLElement>(".aw-invite-link")!;

    return {
        element: block,
        link(link: string) {
            qr.value = link;
            share.link = link;
            share.hidden = !link;
            shown.textContent = link;
            if (link) text.textContent = t("invite.send");
        },
        text(words: string) {
            text.textContent = words;
        },
    };
}

export function mountInvite(root: HTMLElement = document.body) {
    const block = inviteBlock();
    const dialog = document.createElement("pap-dialog") as Dialog;
    dialog.setAttribute("header", t("invite.header"));
    dialog.setAttribute("close-outside-click", "");
    dialog.append(block.element);
    root.append(dialog);

    return {
        ...block,
        element: dialog,
        open: () => dialog.showModal(),
        close: () => dialog.close(),
    };
}
