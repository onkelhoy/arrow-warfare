import { Message, NetworkType } from "@papit/peer-message";
import type { Bootstrap, Network } from "@papit/webrtc";

type Info = Awaited<ReturnType<Bootstrap["create"]>>;
type Draft = Parameters<Bootstrap["create"]>[0];
type Request = Parameters<Bootstrap["join"]>[1];

/** ms one entry gets to answer a join before the next is tried. */
const ENTRY_TIMEOUT = 5000;

type Pending = { entries: string[]; index: number; request: Request; timer: ReturnType<typeof setTimeout> | undefined };

/**
 * First contact for a game, through the lobby: joins and the first handshake travel as `network.room`
 * messages over whichever lobby carries it now. Our own instead of papit's `ParentBootstrap` for one
 * reason: a game outlives its lobby. Its links are direct, so when the lobby closes it plays on, it just
 * can't take newcomers until `carry` hands it a lobby again.
 */
export class Carried extends EventTarget implements Bootstrap {
    readonly me: string;
    private parent: Network | null = null;
    private release: (() => void) | null = null;
    private pending: Pending | null = null;
    private closed = false;

    constructor(parent: Network, readonly id: string) {
        super();
        this.me = parent.me;
        this.carry(parent);
    }

    /** True while a lobby carries it, so newcomers can come in. */
    get carried() {
        return !!this.parent && !this.parent.closed;
    }

    /** A lobby to carry it from now on. False when it can't: closed, or I'm someone else in it. */
    carry(parent: Network) {
        if (this.closed || parent.closed) return false;
        if (parent.me !== this.me)
        {
            console.warn("game: the lobby knows me as someone else, newcomers can't reach this game", parent.me, this.me);
            return false;
        }
        if (parent === this.parent) return true;
        this.release?.();
        this.parent = parent;
        this.release = parent.inbox(this.id, (message, from) => this.take(message, from));
        return true;
    }

    async create(draft: Draft): Promise<Info> {
        if (this.closed) throw new Error("closed");
        const { password, ...rest } = draft;
        return { ...rest, id: this.id, private: draft.private ?? true, size: 1, entries: [this.me] };
    }

    /** `network.join` to the invite's first entry, a reject or silence moves on to the next. */
    async join(network: string | Info, request: Request) {
        if (this.closed) throw new Error("closed");
        if (typeof network === "string" || !network.entries?.length) throw new Error("a game is joined by its invite");
        if (network.id !== this.id) throw new Error(`the invite is for ${network.id}, not ${this.id}`);
        const entries = network.entries.filter(entry => entry !== this.me);
        if (!entries.length) throw new Error("no entry but me");
        this.cancel();
        this.pending = { entries, index: -1, request, timer: undefined };
        this.next(null);
    }

    signal(peer: string, bytes: Uint8Array) {
        return !this.closed && this.carried && this.parent!.carry(this.id, peer, bytes);
    }

    close() {
        if (this.closed) return;
        this.closed = true;
        this.cancel();
        this.release?.();
        this.release = null;
        this.parent = null;
    }

    private cancel() {
        clearTimeout(this.pending?.timer);
        this.pending = null;
    }

    private next(reason: string | null) {
        const pending = this.pending;
        if (!pending) return;
        clearTimeout(pending.timer);
        pending.index++;
        const entry = pending.entries[pending.index];
        if (!entry)
        {
            this.pending = null;
            const reject = Message.Create({ type: NetworkType.Reject, sender: this.me, receiver: this.me, network: this.id }, { reason: reason ?? "no entry answered" });
            this.dispatch(reject, () => false);
            return;
        }
        const join = Message.Create({ type: NetworkType.Join, sender: this.me, receiver: entry, network: this.id }, pending.request);
        const sent = this.signal(entry, join.toBinary(true));
        pending.timer = setTimeout(() => this.next("join timed out"), sent ? ENTRY_TIMEOUT : 0);
    }

    private take(message: Message, from: string) {
        if (this.closed) return;
        const pending = this.pending;
        if (pending && message.meta.receiver === this.me)
        {
            if (message.meta.type === NetworkType.Reject) return void this.next((message.parse() as { reason: string }).reason);
            if (message.meta.type === NetworkType.Admit) this.cancel();
        }
        // replies go back the way this came: through the lobby, to the peer that sent it
        this.dispatch(message, bytes => this.signal(from, bytes));
    }

    private dispatch(message: Message, send: (bytes: Uint8Array) => boolean) {
        this.dispatchEvent(new CustomEvent("message", { detail: { message, carrier: { send } } }));
    }
}
