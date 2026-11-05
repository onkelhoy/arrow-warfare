export const APP = "arrow-warfare";
export const LOBBY_NAME = "arrow-warfare";
export const DEFAULT_SIGNAL = "wss://render-webrtc-signal-server.onrender.com";

/** STUN only, so a strict mobile or company network may not connect without TURN. */
export const RTC: RTCConfiguration = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

/** One player keeps a socket so newcomers can find the lobby, everyone else closes theirs after joining. */
export const ANCHORS = 1;
/** Milliseconds between the anchor's beacons. A part that misses three re-anchors and merges back. */
export const BEACON = 10_000;
/** Milliseconds before a WebRTC handshake gives up, short so a join that can't connect fails fast. */
export const HANDSHAKE_TIMEOUT = 6000;
/** Milliseconds between an anchor's looks at `/networks` for a lobby to merge into. */
export const RESCAN = 20_000;
/** Milliseconds between a waiting host's checks that their lobby is still listed. */
export const HOST_CHECK = 5000;
export const RETRY_MIN = 3000;
export const RETRY_MAX = 30_000;

/** `?signal=ws://localhost:3001` points a game at a local `npm run signal`. Invite links keep it. */
export function signalUrl(search: string = location.search) {
    return new URLSearchParams(search).get("signal") || DEFAULT_SIGNAL;
}

/** The signal server's HTTP side, for `/health` and `/networks`. */
export function httpUrl(signal: string = signalUrl()) {
    const url = new URL(signal);
    url.protocol = url.protocol === "wss:" ? "https:" : "http:";
    url.pathname = url.pathname.replace(/\/$/, "");
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
}
/** ms a guest keeps trying a link whose host doesn't answer. A host sending the link is often in another app, with their tab frozen. */
export const HOST_WAIT = 120_000;
/** ms between a guest's tries. */
export const JOIN_GAP = 3000;
/** ms a dropped player keeps their place (name, colour, team) to come back to, and a guest keeps trying. */
export const RECONNECT = 25_000;
