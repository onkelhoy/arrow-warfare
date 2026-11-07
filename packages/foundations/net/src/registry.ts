import type { Network } from "@papit/webrtc";

import type { Lobby } from "./lobby";

/** ms between a publisher's writes. The owner of a key changes as peers come and go, so it's written again and again. */
export const PUBLISH_EVERY = 5000;
/** ms a record lives at its owner without being written again. */
const EXPIRE = 60_000;
/** ms a `find` waits for the owner's answer. */
const ANSWER = 4000;

/** What a `find` learned: the record, `unknown` (the owner has none), or `silent` (no answer came). */
export type Found<T> = { record: T; time: number } | "unknown" | "silent";

type Stored = { record: unknown; token: string; until: number; time: number };
type Asked = { resolve: (found: Found<unknown>) => void; timer: ReturnType<typeof setTimeout> };

/**
 * A small lookup table kept in the lobby's chord ring: a record for each name, kept by whoever owns its
 * key. The publisher writes it every `PUBLISH_EVERY`, the owner forgets it `EXPIRE` after the last write.
 * Only the token that wrote a record can replace it while it's fresh. Knows nothing about games.
 */
export class Registry {
    private store = new Map<string, Stored>();
    private asked = new Map<string, Asked>();
    private published = new Map<string, { token: string; record: () => unknown; timer: ReturnType<typeof setInterval> }>();

    constructor(private lobby: Lobby, private prefix: string) {
        lobby.onNetwork(network => this.listen(network));
        // after a merge the keys have new owners: write again soon, once the ring has settled a little
        lobby.onMerged(() => {
            this.republish();
            setTimeout(() => this.republish(), 1500);
        });
    }

    /** Keeps `record()` findable under `name` until the returned stop. Null from `record` skips a write. */
    publish(name: string, token: string, record: () => unknown) {
        this.unpublish(name);
        const write = () => {
            const value = record();
            const network = this.lobby.network;
            if (value == null || !network || network.closed) return;
            try { network.sendKey(this.key(name), `${this.prefix}.put`, { name, token, record: value }); }
            catch (error) { console.warn("registry: put failed", error); }
        };
        this.published.set(name, { token, record, timer: setInterval(write, PUBLISH_EVERY) });
        write();
        return () => this.unpublish(name);
    }

    /** Writes it now, after a new lobby for example. */
    republish() {
        const network = this.lobby.network;
        if (!network || network.closed) return;
        for (const [name, { token, record }] of this.published)
        {
            const value = record();
            if (value == null) continue;
            try { network.sendKey(this.key(name), `${this.prefix}.put`, { name, token, record: value }); }
            catch (error) { console.warn("registry: put failed", error); }
        }
    }

    unpublish(name: string) {
        const published = this.published.get(name);
        if (!published) return;
        clearInterval(published.timer);
        this.published.delete(name);
        const network = this.lobby.network;
        if (network && !network.closed)
        {
            try { network.sendKey(this.key(name), `${this.prefix}.drop`, { name, token: published.token }); }
            catch { /* it expires anyway */ }
        }
    }

    /** Asks the owner of `name` for its record. Needs the lobby. */
    find<T>(name: string): Promise<Found<T>> {
        const network = this.lobby.network;
        if (!network || network.closed) return Promise.resolve("silent");
        const ask = crypto.randomUUID().slice(0, 12);
        return new Promise<Found<T>>(resolve => {
            const timer = setTimeout(() => {
                this.asked.delete(ask);
                resolve("silent");
            }, ANSWER);
            this.asked.set(ask, { resolve: resolve as Asked["resolve"], timer });
            try { network.sendKey(this.key(name), `${this.prefix}.find`, { name, ask }); }
            catch (error)
            {
                console.warn("registry: find failed", error);
                clearTimeout(timer);
                this.asked.delete(ask);
                resolve("silent");
            }
        });
    }

    private key(name: string) {
        return `${this.prefix}:${name}`;
    }

    private listen(network: Network) {
        // a new lobby: what I publish goes to its owners at once, not in 5 s
        queueMicrotask(() => this.republish());
        network.addEventListener("message", event => {
            const message = (event as CustomEvent).detail;
            const { type, sender } = message.meta as { type: string; sender: string };
            if (!type.startsWith(`${this.prefix}.`)) return;
            let payload: Record<string, unknown>;
            try { payload = (message.parse() ?? {}) as Record<string, unknown>; }
            catch { return; }
            this.take(network, type.slice(this.prefix.length + 1), payload, sender);
        });
    }

    private take(network: Network, type: string, payload: Record<string, unknown>, sender: string): void {
        const name = typeof payload.name === "string" ? payload.name.slice(0, 64) : "";
        const now = Date.now();
        for (const [key, stored] of this.store) if (stored.until < now) this.store.delete(key);

        switch (type)
        {
            case "put": {
                const token = typeof payload.token === "string" ? payload.token : "";
                const old = this.store.get(name);
                if (!name || !token || (old && old.token !== token)) return;
                this.store.set(name, { record: payload.record, token, until: now + EXPIRE, time: now });
                return;
            }
            case "drop": {
                if (this.store.get(name)?.token === payload.token) this.store.delete(name);
                return;
            }
            case "find": {
                if (!name || typeof payload.ask !== "string") return;
                const stored = this.store.get(name);
                const answer = { ask: payload.ask, record: stored?.record ?? null, time: stored?.time ?? 0 };
                if (sender === network.me) return this.take(network, "found", answer, sender);
                try { network.send(sender, `${this.prefix}.found`, answer); }
                catch (error) { console.warn("registry: answer failed", error); }
                return;
            }
            case "found": {
                const asked = typeof payload.ask === "string" ? this.asked.get(payload.ask) : undefined;
                if (!asked) return;
                clearTimeout(asked.timer);
                this.asked.delete(payload.ask as string);
                asked.resolve(payload.record == null ? "unknown" : { record: payload.record, time: Number(payload.time) || 0 });
                return;
            }
        }
    }
}
