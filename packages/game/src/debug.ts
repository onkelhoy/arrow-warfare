import type { Lobby } from "@arrow-warfare/net";

import type { Session } from "./session";

const short = (id: string | null | undefined) => id ? id.slice(0, 6) : "-";
/** Log lines worth seeing on a phone: ours from the lobby, registry, game and joins. */
const WORTH = /^(lobby|registry|game|room|could not join)/;
const LINES = 10;

/**
 * `?debug` on the address: a small overlay with what the connection is doing, to read on the phones
 * while testing. Lobby, anchor, game code, host, links, and the last lines of our logs.
 */
export function mountDebug(lobby: Lobby, session: () => Session | null) {
    if (!new URLSearchParams(location.search).has("debug")) return;

    const box = document.createElement("pre");
    box.style.cssText = "position:fixed;z-index:99;left:4px;bottom:4px;max-width:calc(100vw - 8px);margin:0;padding:6px 8px;border-radius:6px;background:rgb(0 0 0/70%);color:#cfc;font:10px/1.35 ui-monospace,monospace;white-space:pre-wrap;pointer-events:none";
    document.body.append(box);

    const log: string[] = [];
    for (const level of ["info", "warn", "error"] as const)
    {
        const original = console[level].bind(console);
        console[level] = (...args: unknown[]) => {
            original(...args);
            const text = args.map(arg => arg instanceof Error ? arg.message : typeof arg === "string" ? arg : JSON.stringify(arg)).join(" ");
            if (!WORTH.test(text)) return;
            const time = new Date().toTimeString().slice(0, 8);
            log.push(`${time} ${level === "info" ? "" : level + " "}${text.slice(0, 140)}`);
            if (log.length > LINES) log.shift();
        };
    }

    const draw = () => {
        const current = session();
        const room = current?.room;
        const network = room?.network;
        const linked = network ? [...network.linked].map(short).join(" ") : "";
        box.textContent = [
            `lobby ${lobby.status()} ${short(lobby.id)} me ${short(lobby.network?.me)}${lobby.anchored ? " anchor" : ""} links ${lobby.network?.linked.size ?? 0}`,
            current ? `game ${current.code || "-"} ${current.isHost ? "host" : "guest"} host ${short(room?.hostId)} ${network && lobby.carries(network) ? "findable" : "not findable"}` : "game -",
            room ? `links ${linked || "none"} ping ${room.rtt}` : "",
            ...log,
        ].filter(Boolean).join("\n");
    };
    setInterval(draw, 1000);
    draw();
}
