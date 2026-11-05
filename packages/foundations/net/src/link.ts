import type { Info } from "./lobby";

/** What a link carries: the lobby to find, the game's invite inside it, the host's peer id, and who sent it. */
export type Invite = { lobby: string; invite: Info; host: string; by: string };

function encode(value: unknown) {
    const bytes = new TextEncoder().encode(JSON.stringify(value));
    let text = "";
    for (const byte of bytes) text += String.fromCharCode(byte);
    return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decode(text: string): unknown {
    const base = text.replace(/-/g, "+").replace(/_/g, "/");
    const bytes = Uint8Array.from(atob(base), char => char.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
}

/** The invite in a page's address, null when this isn't one. `by` is in the query, the rest in the hash. */
export function parseInvite(search: string, hash: string = location.hash): Invite | null {
    const raw = hash.replace(/^#/, "");
    if (!raw) return null;
    try
    {
        const data = decode(raw) as Partial<Invite>;
        const invite = data?.invite;
        if (typeof data?.lobby !== "string" || typeof data?.host !== "string" || !invite || typeof invite.id !== "string" || !Array.isArray(invite.entries)) return null;
        return { lobby: data.lobby, invite, host: data.host, by: (new URLSearchParams(search).get("by") ?? "").slice(0, 32) };
    }
    catch
    {
        return null;
    }
}

/** The link a host hands out. Whatever else is in the address, like `?signal=`, stays in it. */
export function inviteLink(page: string, { lobby, invite, host, by }: Invite) {
    const url = new URL(page);
    url.searchParams.set("by", by);
    url.hash = encode({ lobby, invite, host });
    return url.toString();
}

/** The page without an invite in it. */
export function withoutInvite(page: string) {
    const url = new URL(page);
    for (const key of ["game", "host", "by"]) url.searchParams.delete(key);
    url.hash = "";
    return url.toString();
}
