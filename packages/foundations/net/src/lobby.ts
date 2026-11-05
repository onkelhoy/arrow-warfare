import { signal } from "@papit/signals";
import { Client, ParentBootstrap, type Network } from "@papit/webrtc";

/** A network as `GET /networks` and `network.invite()` give it. */
export type Info = NonNullable<ReturnType<Network["invite"]>>;

/** `waking` is a free server that's booting, `failed` is a try that didn't work and will be made again. */
export type LobbyStatus = "connecting" | "waking" | "ready" | "failed";

export type LobbyOptions = {
    /** The signal server, `ws://` or `wss://`. */
    url: string;
    /** Its HTTP side, for `/health` and `/networks`. */
    http: string;
    /** Every lobby of this app has this name, that's how they find each other. */
    name: string;
    meta?: Record<string, unknown>;
    rtc?: RTCConfiguration;
    anchors?: number;
    beacon?: number;
    handshakeTimeout?: number;
    /** ms before we give up on joining a listed lobby and make our own. */
    joinTimeout?: number;
    /** ms between an anchor's looks for a lobby to merge into. */
    rescan?: number;
    retryMin?: number;
    retryMax?: number;
};

const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
const byId = (a: Info, b: Info) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
/** Every field of `want` is the same in `info.meta`, so an older version's lobby is left alone. */
const metaMatches = (info: Info, want: Record<string, unknown> = {}) =>
    Object.entries(want).every(([key, value]) => (info.meta as Record<string, unknown> | undefined)?.[key] === value);

/**
 * The one public chord network of an app, plumbing nobody sees. It knows nothing about the game, so other
 * games can use it as it is.
 *
 * - Found with `GET /networks`, the lowest id wins. None, or a join that fails: create one at once. It
 *   never waits for a part that drifted off to come back.
 * - A drifted part re-anchors on its own after missing three beacons, then two lobbies are listed. The
 *   anchor of each looks now and then and merges into the lower id, so everyone can meet again.
 * - A game is a network carried by this one (`carry`), which the server never sees.
 */
export class Lobby {
    readonly status: () => LobbyStatus;
    readonly client: Client;
    network: Network | null = null;
    private setStatus: (status: LobbyStatus) => void;
    private closed = false;
    private merging = false;
    private timer: ReturnType<typeof setInterval> | undefined;

    constructor(private options: LobbyOptions) {
        [this.status, this.setStatus] = signal<LobbyStatus>("connecting");
        this.client = new Client({ url: options.url, rtc: options.rtc, handshakeTimeout: options.handshakeTimeout });
    }

    /** The lobby's id now. It changes when this lobby merges into another. */
    get id() {
        return this.network?.info?.id ?? null;
    }

    /** Resolves once we're in a lobby. `prefer` is the one an invite names, tried first when it's listed. */
    async start(prefer?: string) {
        let delay = this.options.retryMin ?? 3000;
        while (!this.closed)
        {
            try
            {
                const network = await this.enter(prefer);
                this.network = network;
                this.setStatus("ready");
                network.addEventListener("close", () => this.lost(network));
                clearInterval(this.timer);
                this.timer = setInterval(() => void this.mergeCheck(), this.options.rescan ?? 20_000);
                return network;
            }
            catch (error)
            {
                if (this.closed) break;
                console.warn("lobby: trying again", error);
                this.setStatus("failed");
                await wait(delay);
                delay = Math.min(delay * 2, this.options.retryMax ?? 30_000);
            }
        }
        throw new Error("closed");
    }

    /** A network carried by the lobby, made here. The same `id` again makes an invite to it work again. */
    create(draft: Parameters<Client["create"]>[0], setup: Omit<NonNullable<Parameters<Client["create"]>[1]>, "bootstrap"> = {}, id: string = crypto.randomUUID()) {
        return this.client.create(draft, { ...setup, bootstrap: new ParentBootstrap(this.need(), id) });
    }

    /** A network carried by the lobby, joined by its invite. */
    join(invite: Info, request: Parameters<Client["join"]>[1] = {}, setup: Omit<NonNullable<Parameters<Client["join"]>[2]>, "bootstrap"> = {}) {
        return this.client.join(invite, request, { ...setup, bootstrap: new ParentBootstrap(this.need(), invite.id) });
    }

    /** Is our lobby still listed? If not, become its anchor now, so an invite naming it still works. */
    async keepListed() {
        const network = this.network;
        if (!network || network.anchored || this.closed) return;
        const listed = await this.list().catch(() => null);
        if (!listed || listed.some(info => info.id === network.info?.id)) return;

        console.info("lobby: ours isn't listed, anchoring it again");
        // the Client opens a socket for it, and it resumes our peer id
        await network.anchor().catch(error => console.warn("lobby: couldn't anchor", error));
    }

    close() {
        this.closed = true;
        clearInterval(this.timer);
        this.network?.leave();
        this.client.close();
    }

    private need() {
        if (!this.network || this.network.closed) throw new Error("not in the lobby");
        return this.network;
    }

    private async enter(prefer?: string) {
        await this.wake();
        const { name, meta, anchors, beacon } = this.options;
        const acceptMerge = (info: Info) => info.name === name && metaMatches(info, meta);

        const listed = (await this.list()).filter(info => info.name === name && metaMatches(info, meta)).sort(byId);
        const first = listed.find(info => info.id === prefer) ?? listed[0];
        console.info("lobby: found", listed.map(info => info.id.slice(0, 8)));

        if (first)
        {
            try
            {
                const network = await this.joinQuick(first.id, acceptMerge);
                console.info("lobby: joined", first.id.slice(0, 8));
                return network;
            }
            catch (error)
            {
                // a lobby we can't get into is as good as none, we don't wait for it
                console.warn("lobby: could not join, making a new one", first.id, error);
            }
        }

        const network = await this.client.create({ name, topology: "chord", meta, anchors, beacon }, { acceptMerge });
        console.info("lobby: created", network.info?.id.slice(0, 8));
        return network;
    }

    /**
     * papit gives a join 15 s. A lobby that doesn't answer in `joinTimeout` is as good as gone, so we stop
     * waiting and close the join that's still under way.
     */
    private async joinQuick(id: string, acceptMerge: (info: Info) => boolean) {
        const before = new Set(this.client.networks);
        let timer: ReturnType<typeof setTimeout> | undefined;
        const timeout = new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error("join timed out")), this.options.joinTimeout ?? 6000);
        });
        try
        {
            return await Promise.race([this.client.join(id, {}, { acceptMerge }), timeout]);
        }
        catch (error)
        {
            for (const network of this.client.networks) if (!before.has(network)) network.close();
            throw error;
        }
        finally
        {
            clearTimeout(timer);
        }
    }

    /** A sleeping free server boots on any request, `/health` is the cheap one. */
    private async wake() {
        for (let i = 0; !this.closed; i++)
        {
            try
            {
                const response = await fetch(`${this.options.http}/health`, { signal: AbortSignal.timeout(10_000) });
                if (response.ok) return;
            }
            catch { /* asleep, or not there */ }
            this.setStatus("waking");
            await wait(Math.min(2000 * (i + 1), 10_000));
        }
    }

    private async list(): Promise<Info[]> {
        const response = await fetch(`${this.options.http}/networks`, { signal: AbortSignal.timeout(10_000) });
        if (!response.ok) throw new Error(`/networks answered ${response.status}`);
        const all = await response.json();
        return Array.isArray(all) ? all : [];
    }

    /** Only an anchor can merge. Two lobbies of this app: the higher id goes into the lower. */
    private async mergeCheck() {
        const network = this.network;
        if (this.merging || this.closed || !network?.anchored || !network.info) return;
        this.merging = true;

        try
        {
            const mine = network.info.id;
            const lower = (await this.list())
                .filter(info => info.name === this.options.name && metaMatches(info, this.options.meta) && info.id < mine)
                .sort(byId)[0];
            if (!lower) return;

            console.info("lobby: merging into", lower.id.slice(0, 8));
            await network.merge(lower.id);
        }
        catch (error)
        {
            console.warn("lobby: merge failed", error);
        }
        finally
        {
            this.merging = false;
        }
    }

    /** The lobby closed under us, so find or make one again. */
    private lost(network: Network) {
        if (this.closed || this.network !== network) return;
        this.network = null;
        this.setStatus("connecting");
        void this.start();
    }
}
