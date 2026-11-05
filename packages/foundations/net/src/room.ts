import type { Channel, Network } from "@papit/webrtc";

type Handler = (payload: any, sender: string) => void;
type Fast = (data: ArrayBuffer, sender: string) => void;

/** The media plan a game's network is made with: a lossy channel for what's sent many times a second. */
export const ROOM_MEDIA = { channels: { pose: { ordered: false, maxRetransmits: 0 } } };

/** ms between a guest's pings to the host, for the clock and the ping shown in the lobby. */
const PING_EVERY = 2000;
/** How many recent pings the clock picks its best from, so a changed route is followed. */
const WINDOW = 8;

/**
 * One game, a mesh network carried by the lobby. Reliable messages by name, and a clock everyone shares:
 * the host's `performance.now()`, found with pings that also measure each guest's ping.
 */
export class Room {
    /** ms to the host and back, -1 before the first pong. The host's is 0. */
    rtt = -1;
    private offset = 0;
    private handlers = new Map<string, Handler[]>();
    private links: ((peer: string, open: boolean) => void)[] = [];
    private samples: { rtt: number; offset: number }[] = [];
    private timer: ReturnType<typeof setInterval> | undefined;
    /** On the host: each guest's ping as they last measured it. */
    private pings = new Map<string, number>();
    private fast: Fast[] = [];
    private channel: Channel;

    constructor(readonly network: Network, readonly hostId: string) {
        network.addEventListener("message", event => {
            const message = (event as CustomEvent).detail;
            const { type, sender } = message.meta;
            let payload: unknown;
            try { payload = message.parse(); } catch { return; }
            for (const handler of this.handlers.get(type) ?? []) handler(payload ?? {}, sender);
        });
        network.addEventListener("link", event => {
            const { peer, open } = (event as CustomEvent).detail as { peer: string; open: boolean };
            for (const handler of this.links) handler(peer, open);
        });
        network.addEventListener("close", () => {
            clearInterval(this.timer);
            for (const handler of this.links) handler(this.hostId, false);
        });

        // made at once, a channel drops what arrives before it's asked for
        this.channel = network.media.channel("pose");
        this.channel.addEventListener("message", event => {
            const { peer, data } = (event as CustomEvent<{ peer: string; data: unknown }>).detail;
            if (data instanceof ArrayBuffer) for (const handler of this.fast) handler(data, peer);
        });
        this.on("fast", ({ bytes }, sender) => {
            if (typeof bytes !== "string") return;
            const raw = Uint8Array.from(atob(bytes), char => char.charCodeAt(0));
            for (const handler of this.fast) handler(raw.buffer, sender);
        });

        this.on("ping", (payload, sender) => {
            if (typeof payload.rtt === "number") this.pings.set(sender, Math.round(payload.rtt));
            this.send(sender, "pong", { t0: payload.t0, th: performance.now() });
        });
        this.on("pong", ({ t0, th }, sender) => {
            if (sender !== this.hostId || typeof t0 !== "number" || typeof th !== "number") return;
            const now = performance.now();
            const rtt = now - t0;
            this.samples.push({ rtt, offset: th + rtt / 2 - now });
            if (this.samples.length > WINDOW) this.samples.shift();
            const best = this.samples.reduce((a, b) => b.rtt < a.rtt ? b : a);
            this.offset = best.offset;
            this.rtt = Math.round(rtt);
        });

        if (this.isHost) this.rtt = 0;
        else
        {
            const ping = () => this.send(this.hostId, "ping", { t0: performance.now(), rtt: this.rtt });
            this.timer = setInterval(ping, PING_EVERY);
            ping();
        }
    }

    /** On the host: a guest's ping as they last measured it. */
    pingOf(peer: string) {
        return this.pings.get(peer);
    }

    get me() {
        return this.network.me;
    }

    get isHost() {
        return this.network.me === this.hostId;
    }

    get closed() {
        return this.network.closed;
    }

    /** The host's clock. */
    get shared() {
        return performance.now() + this.offset;
    }

    /** When a shared time is on our own clock. */
    local(shared: number) {
        return shared - this.offset;
    }

    on(type: string, handler: Handler) {
        this.handlers.set(type, [...(this.handlers.get(type) ?? []), handler]);
    }

    onLink(handler: (peer: string, open: boolean) => void) {
        this.links.push(handler);
    }

    /** Reliable, to one peer. A message to ourselves goes straight to the handlers. */
    send(to: string, type: string, payload: unknown = {}) {
        if (to === this.me)
        {
            for (const handler of this.handlers.get(type) ?? []) handler(structuredClone(payload ?? {}), to);
            return true;
        }
        if (this.network.closed) return false;
        try
        {
            this.network.send(to, type, payload);
            return true;
        }
        catch (error)
        {
            console.warn("room: send failed", type, error);
            return false;
        }
    }

    /** Reliable, to each of `peers`: a pending guest in the mesh isn't a player yet, so nothing is broadcast. */
    sendAll(peers: string[], type: string, payload: unknown = {}) {
        for (const peer of peers) this.send(peer, type, payload);
    }

    /**
     * Lossy and fast, to each of `peers`: on the `pose` channel, and through the reliable messages to a
     * peer whose channel isn't open (yet).
     */
    sendFast(peers: string[], data: ArrayBuffer) {
        if (this.network.closed) return;
        const open = this.channel.peers;
        let fallback: string | null = null;
        for (const peer of peers)
        {
            if (peer === this.me) continue;
            if (open.includes(peer) && this.channel.send(peer, data)) continue;
            fallback ??= btoa(String.fromCharCode(...new Uint8Array(data)));
            this.send(peer, "fast", { bytes: fallback });
        }
    }

    /** Returns a function that stops listening. */
    onFast(handler: Fast) {
        this.fast.push(handler);
        return () => { this.fast = this.fast.filter(other => other !== handler); };
    }

    leave() {
        clearInterval(this.timer);
        if (!this.network.closed) this.network.leave();
    }
}
