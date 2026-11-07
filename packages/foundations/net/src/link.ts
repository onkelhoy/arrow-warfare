/** What a link carries: the game's short code and who sent it. The lobby knows the rest. */
export type Invite = { code: string; by: string };

/** No 0/O, 1/I/L: a code is read out loud and typed too. */
const LETTERS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 6;

/** A new game code, like `K7QF2M`. */
export function newCode() {
    const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
    return [...bytes].map(byte => LETTERS[byte % LETTERS.length]).join("");
}

/** The code tidied up, or "" when it isn't one. */
export function cleanCode(text: string | null | undefined) {
    const code = String(text ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    return code.length === CODE_LENGTH && [...code].every(char => LETTERS.includes(char)) ? code : "";
}

/** The game network's id for a code: the same code, the same network, so a reopened game takes its old link. */
export const gameId = (code: string) => `arrow-warfare-game-${code}`;

/** The invite in a page's address, `?g=CODE&by=NAME`, null when this isn't one. */
export function parseInvite(search: string): Invite | null {
    const query = new URLSearchParams(search);
    const code = cleanCode(query.get("g"));
    if (!code) return null;
    return { code, by: (query.get("by") ?? "").slice(0, 32) };
}

/** The link a host hands out. Whatever else is in the address, like `?signal=`, stays in it. */
export function inviteLink(page: string, { code, by }: Invite) {
    const url = new URL(page);
    url.hash = "";
    url.searchParams.set("g", code);
    url.searchParams.set("by", by);
    return url.toString();
}

/** The page without an invite in it. */
export function withoutInvite(page: string) {
    const url = new URL(page);
    for (const key of ["g", "game", "host", "by"]) url.searchParams.delete(key);
    url.hash = "";
    return url.toString();
}

/** The last game of this tab: a reload goes back to it, hosting or joining another replaces it. */
export type Remembered = { code: string; role: "host" | "guest"; token: string; time: number };

const KEY = "arrow-warfare.game";
/** ms a remembered game is worth going back to. */
const REMEMBER = 2 * 60 * 60 * 1000;

export function remembered(): Remembered | null {
    try
    {
        const saved = JSON.parse(sessionStorage.getItem(KEY) ?? "null") as Remembered | null;
        if (!saved || !cleanCode(saved.code) || typeof saved.token !== "string" || Date.now() - saved.time > REMEMBER) return null;
        return saved;
    }
    catch
    {
        return null;
    }
}

/** Remembers this game: the same code and role keep their token, anything else gets a new one. */
export function remember(code: string, role: Remembered["role"]): Remembered {
    const old = remembered();
    const token = old && old.code === code && old.role === role ? old.token : crypto.randomUUID();
    const saved = { code, role, token, time: Date.now() };
    try { sessionStorage.setItem(KEY, JSON.stringify(saved)); }
    catch { /* private mode, the game still works, a reload just doesn't come back */ }
    return saved;
}

/** Still in it: the 2 h start again from now. */
export function touch() {
    const saved = remembered();
    if (saved) remember(saved.code, saved.role);
}

export function forget() {
    try { sessionStorage.removeItem(KEY); }
    catch { /* nothing to forget */ }
}
