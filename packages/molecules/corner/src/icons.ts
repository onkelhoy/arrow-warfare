import { Icon } from "@papit/icon";

const svg = (body: string) => `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${body}</svg>`;

/** Drawn here, so nothing has to be fetched from the site's root. */
export function registerIcons() {
    const speaker = `<path d="M3 9v6h4l5 4V5L7 9z"/>`;
    Icon.icons.set("sound-on", svg(`${speaker}<path d="M14 8.5a5 5 0 0 1 0 7v-7zM14 4.7v2a7.5 7.5 0 0 1 0 10.6v2a9.5 9.5 0 0 0 0-14.6z"/>`));
    Icon.icons.set("sound-off", svg(`${speaker}<path d="m15 9.4 1.4-1.4 2.1 2.1L20.6 8 22 9.4 19.9 11.5 22 13.6 20.6 15l-2.1-2.1L16.4 15 15 13.6l2.1-2.1z"/>`));
    Icon.icons.set("fullscreen", svg(`<path d="M4 4h6v2H6v4H4zM14 4h6v6h-2V6h-4zM4 14h2v4h4v2H4zM18 14h2v6h-6v-2h4z"/>`));
    Icon.icons.set("settings", svg(`<path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zm8.5 5.1 1.5 1.2-2 3.4-1.8-.7a7.7 7.7 0 0 1-1.9 1.1L16 21.5h-4l-.3-1.9a7.7 7.7 0 0 1-1.9-1.1l-1.8.7-2-3.4 1.5-1.2a7.7 7.7 0 0 1 0-2.2L6 10.6l2-3.4 1.8.7a7.7 7.7 0 0 1 1.9-1.1L12 4.9h4l.3 1.9a7.7 7.7 0 0 1 1.9 1.1l1.8-.7 2 3.4-1.5 1.2a7.7 7.7 0 0 1 0 2.2z" transform="translate(-2 -1.2)"/>`));
}
