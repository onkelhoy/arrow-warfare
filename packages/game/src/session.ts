import { CHAT_LENGTH, cleanName, COLOURS, COUNTDOWN, FORCE_AFTER, DAMAGES, MAX_DEFAULT, MAP_SIZES, matchResults, MAX_LIMIT, ROUNDS, roundWins, NAME_IDEA_LENGTH, pickUnused, RULES_DEFAULT, SKINS, TIMES, TREE_AMOUNTS, wears, type ChatLine, type GameState, type Player, type Results, type Rules } from "@arrow-warfare/core";
import { HOST_CHECK, HOST_WAIT, inviteLink, JOIN_GAP, RECONNECT, Room, ROOM_MEDIA, type Invite, type Lobby } from "@arrow-warfare/net";
import type { Network } from "@papit/webrtc";

/** Why a game ended for us. */
export type End = "left" | "hostLeft" | "kicked" | "locked" | "gone" | "full";

export type SessionEvents = {
    state(state: GameState): void;
    chat(line: ChatLine): void;
    /** The invite link changed (host only). */
    link(link: string): void;
    /** Words while joining, empty when there's nothing to say. */
    status(words: "joining" | "waitingHost" | ""): void;
    /** A guest lost the host and is trying to get back, or is back. */
    reconnecting(trying: boolean): void;
    /** The host wants a password, `wrong` when the last one didn't work. Resolves with the next try. */
    password(wrong: boolean): Promise<string>;
    end(reason: End): void;
};

/** ms between the host's looks at the pings, a changed one goes out with the state. */
const PING_PUBLISH = 3000;
/** How many name ideas a team can have. */
const IDEAS = 8;

/** One per game and tab, so a reload or a new connection is known as me. */
function rejoinToken(host: string) {
    const key = `arrow-warfare.rejoin.${host}`;
    try
    {
        const saved = sessionStorage.getItem(key);
        if (saved) return saved;
        const token = crypto.randomUUID();
        sessionStorage.setItem(key, token);
        return token;
    }
    catch
    {
        return crypto.randomUUID();
    }
}

const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
const text = (value: unknown, length: number) => typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, length) : "";

/**
 * One game: the mesh room, and the lobby state in it. The host decides everything and sends the whole
 * state to every player when it changes. Everything a player does goes to the host as a message, the
 * host's own too (`Room.send` to ourselves), so there's one way for each action.
 */
export class Session {
    room: Room | null = null;
    state: GameState | null = null;
    // the host's side
    private password = "";
    private kicked = new Set<string>();
    private timers: ReturnType<typeof setInterval>[] = [];
    private goTimer: ReturnType<typeof setTimeout> | undefined;
    private shownLink = "";
    private ended = false;
    /** The host's: who each rejoin token belongs to, and the places of the dropped, kept for `RECONNECT`. */
    private tokens = new Map<string, string>();
    private dropped = new Map<string, { player: Player; timer: ReturnType<typeof setTimeout> }>();
    private kickedTokens = new Set<string>();
    /** A guest's: proves to the host it's me again after a drop or a reload. */
    private token = "";

    constructor(private lobby: Lobby, private name: () => string, private events: SessionEvents) { }

    get me() {
        return this.room?.me ?? "";
    }

    get isHost() {
        return !!this.room?.isHost;
    }

    // ------------------------------------------------------------------ hosting

    async host() {
        await this.lobby.start();
        const id = crypto.randomUUID();
        // everyone gets in, the hello is answered with a reason when they can't play (locked, full,
        // kicked, password): a join refused in `accept` timed out on the guest instead of failing
        const network = await this.lobby.create({ name: "game", topology: "mesh", media: ROOM_MEDIA }, {}, id);
        const room = this.room = new Room(network, network.me);
        this.state = {
            host: room.me,
            name: "",
            password: false,
            max: MAX_DEFAULT,
            phase: "open",
            lockedAt: 0,
            go: 0,
            seed: 0,
            rules: { ...RULES_DEFAULT },
            players: [],
            teams: [],
            results: null,
            played: [],
        };
        this.hostHandlers(room);
        this.common(room);
        room.send(room.me, "hello", { name: this.name() });
        this.link();
        this.timers.push(setInterval(() => this.watch(), HOST_CHECK));
        this.timers.push(setInterval(() => this.publishPings(), PING_PUBLISH));
    }

    /** The link names the lobby by id, and that changes when the lobby merges, so it's made again then. */
    private link() {
        const room = this.room;
        const invite = room?.network.invite();
        const lobby = this.lobby.id;
        if (!room || !invite || !lobby) return;
        const link = inviteLink(location.href, { lobby, invite, host: room.me, by: this.name() });
        if (link === this.shownLink) return;
        this.shownLink = link;
        this.events.link(link);
    }

    private watch() {
        if (this.room?.closed) return;
        void this.lobby.keepListed();
        this.link();
    }

    private hostHandlers(room: Room) {
        const player = (id: string) => this.state?.players.find(player => player.id === id);

        room.on("hello", ({ name, password, token }, sender) => {
            const state = this.state!;
            const clean = cleanName(String(name ?? "")) || "?";
            const known = player(sender) ?? state.waiting?.find(other => other.id === sender);
            if (known) return this.publish();
            const key = typeof token === "string" ? token.slice(0, 64) : "";
            if (this.kicked.has(sender) || this.kickedTokens.has(key)) return room.send(sender, "denied", { reason: "kicked" });
            if (key && this.rejoin(key, sender)) return;
            if (state.phase !== "open") return room.send(sender, "denied", { reason: "locked" });
            if (state.players.length >= state.max) return room.send(sender, "denied", { reason: "full" });
            if (sender !== room.me && this.password && password !== this.password)
                return room.send(sender, "denied", { reason: "password", wrong: typeof password === "string" });

            state.players.push({
                id: sender,
                name: clean,
                colour: pickUnused(COLOURS.length, state.players.map(player => player.colour)),
                skin: Math.floor(Math.random() * SKINS.length),
                ready: false,
                team: null,
                ping: sender === room.me ? 0 : -1,
            });
            if (key) this.tokens.set(key, sender);
            this.publish();
        });

        room.on("name", ({ name }, sender) => {
            const found = player(sender);
            const clean = cleanName(String(name ?? ""));
            if (!found || !clean || clean === found.name) return;
            found.name = clean;
            this.publish();
        });

        room.on("ready", ({ ready }, sender) => {
            const found = player(sender);
            if (!found || this.state!.phase !== "locked") return;
            found.ready = ready === true;
            this.publish();
            this.maybeStart();
        });

        room.on("chat", ({ text: said, team }, sender) => {
            const found = player(sender);
            const clean = text(said, CHAT_LENGTH);
            if (!found || !clean) return;
            const toTeam = team === true && !!found.team;
            const line: ChatLine = { from: sender, name: found.name, colour: wears(this.state!, found), text: clean, team: toTeam };
            const to = this.state!.players.filter(other => !toTeam || other.team === found.team).map(other => other.id);
            room.sendAll(to, "said", line);
        });

        room.on("idea", ({ team: teamId, text: idea }, sender) => {
            const found = player(sender);
            const team = this.state!.teams.find(team => team.id === teamId);
            const clean = text(idea, NAME_IDEA_LENGTH);
            if (!found || !team || found.team !== team.id || !clean || team.ideas.length >= IDEAS) return;
            if (team.ideas.some(other => other.text.toLowerCase() === clean.toLowerCase())) return;
            team.ideas.push({ id: crypto.randomUUID().slice(0, 8), by: sender, text: clean, votes: [] });
            this.publish();
        });

        room.on("vote", ({ team: teamId, idea }, sender) => {
            const found = player(sender);
            const team = this.state!.teams.find(team => team.id === teamId);
            const chosen = team?.ideas.find(other => other.id === idea);
            if (!found || !team || !chosen || found.team !== team.id) return;
            const again = chosen.votes.includes(sender);
            for (const other of team.ideas) other.votes = other.votes.filter(voter => voter !== sender);
            if (!again) chosen.votes.push(sender);
            this.publish();
        });

        room.onLink((peer, open) => {
            if (open || peer === room.me) return;
            const state = this.state!;
            const found = player(peer) ?? state.waiting?.find(other => other.id === peer);
            if (!found) return;
            // their place is kept a while, a short drop comes back to it
            const key = [...this.tokens].find(([, id]) => id === peer)?.[0];
            if (key)
            {
                this.tokens.delete(key);
                const timer = setTimeout(() => this.dropped.delete(key), RECONNECT);
                this.dropped.set(key, { player: structuredClone(found), timer });
            }
            if (state.waiting) state.waiting = state.waiting.filter(other => other.id !== peer);
            this.removePlayer(peer);
        });
    }

    /**
     * A dropped player is back with a new id: their old place again (name, colour, team, ready). While a
     * round runs they wait for it to end, the round has counted them out.
     */
    private rejoin(key: string, id: string) {
        const state = this.state!;
        let kept = this.dropped.get(key)?.player;
        clearTimeout(this.dropped.get(key)?.timer);
        this.dropped.delete(key);
        // back before I noticed they were gone: the old link is dead to them
        const old = this.tokens.get(key);
        const stale = old && old !== id ? state.players.find(other => other.id === old) ?? state.waiting?.find(other => other.id === old) : undefined;
        if (stale)
        {
            kept = structuredClone(stale);
            if (state.waiting) state.waiting = state.waiting.filter(other => other.id !== old);
            this.tokens.delete(key);
            this.removePlayer(old!);
        }
        if (!kept) return false;
        this.tokens.set(key, id);
        const back: Player = { ...kept, id, ping: -1 };
        if (back.team && !state.teams.some(team => team.id === back.team)) back.team = null;
        if (state.phase === "play") state.waiting = [...(state.waiting ?? []), back];
        else state.players.push(back);
        this.publish();
        return true;
    }

    /** The round is over: who came back during it plays again. */
    private admitWaiting() {
        const state = this.state!;
        if (!state.waiting?.length) return;
        for (const back of state.waiting) state.players.push({ ...back, ready: true });
        state.waiting = [];
    }

    private removePlayer(id: string) {
        const state = this.state!;
        state.players = state.players.filter(player => player.id !== id);
        for (const team of state.teams) for (const idea of team.ideas) idea.votes = idea.votes.filter(voter => voter !== id);
        this.publish();
        this.maybeStart();
    }

    /** The whole state to every player, and to ourselves. */
    private publish() {
        const { room, state } = this;
        if (!room || !state || !this.isHost) return;
        room.sendAll([...state.players, ...(state.waiting ?? [])].map(player => player.id).filter(id => id !== room.me), "state", state);
        this.events.state(structuredClone(state));
    }

    private publishPings() {
        const { room, state } = this;
        if (!room || !state) return;
        let changed = false;
        for (const player of state.players)
        {
            const ping = room.pingOf(player.id);
            if (ping === undefined || player.id === room.me || (player.ping >= 0 && Math.abs(ping - player.ping) < 15)) continue;
            player.ping = ping;
            changed = true;
        }
        if (changed) this.publish();
    }

    /** Everyone ready: 3, 2, 1 on the shared clock, then play. */
    private maybeStart() {
        const { room, state } = this;
        if (!room || !state || state.phase !== "locked" || !state.players.length || state.players.some(player => !player.ready)) return;
        state.phase = "countdown";
        state.go = room.shared + COUNTDOWN;
        // a new meadow every round, the same on every phone
        state.seed = Math.floor(Math.random() * 2 ** 31);
        this.publish();
        clearTimeout(this.goTimer);
        this.goTimer = setTimeout(() => {
            if (state.phase !== "countdown") return;
            state.phase = "play";
            this.publish();
        }, COUNTDOWN);
    }

    // the host's own controls, from the lobby page

    setGame({ name, password, max }: { name?: string; password?: string; max?: number }) {
        const state = this.state;
        if (!state || !this.isHost) return;
        if (name !== undefined) state.name = text(name, 24);
        if (password !== undefined)
        {
            this.password = password;
            state.password = !!password;
        }
        if (max !== undefined && Number.isFinite(max)) state.max = Math.max(2, Math.min(MAX_LIMIT, Math.round(max)));
        this.publish();
    }

    setRules(change: Partial<Rules>) {
        const state = this.state;
        if (!state || !this.isHost) return;
        if (change.arrows !== undefined) state.rules.arrows = Math.max(0, Math.min(10, Math.round(change.arrows)));
        if (change.trees && TREE_AMOUNTS.includes(change.trees)) state.rules.trees = change.trees;
        if (change.size && MAP_SIZES.includes(change.size)) state.rules.size = change.size;
        if (change.damage && DAMAGES.includes(change.damage)) state.rules.damage = change.damage;
        if (change.time && TIMES.includes(change.time)) state.rules.time = change.time;
        if (change.rounds !== undefined && ROUNDS.includes(change.rounds)) state.rules.rounds = change.rounds;
        if (change.friendly !== undefined) state.rules.friendly = !!change.friendly;
        this.publish();
    }

    lock(locked: boolean) {
        const { room, state } = this;
        if (!room || !state || !this.isHost || state.phase === "countdown" || state.phase === "play" || state.phase === "results") return;
        state.phase = locked ? "locked" : "open";
        state.lockedAt = room.shared;
        for (const player of state.players) player.ready = false;
        this.publish();
    }

    kick(id: string) {
        const room = this.room;
        if (!room || !this.isHost || id === room.me) return;
        this.kicked.add(id);
        for (const [key, owner] of this.tokens) if (owner === id) this.kickedTokens.add(key);
        room.send(id, "kicked");
        this.removePlayer(id);
    }

    createTeam() {
        const state = this.state;
        if (!state || !this.isHost) return;
        state.teams.push({ id: crypto.randomUUID().slice(0, 8), colour: pickUnused(COLOURS.length, state.teams.map(team => team.colour)), ideas: [] });
        this.publish();
    }

    deleteTeam(id: string) {
        const state = this.state;
        if (!state || !this.isHost) return;
        state.teams = state.teams.filter(team => team.id !== id);
        for (const player of state.players) if (player.team === id) player.team = null;
        this.publish();
    }

    assign(id: string, team: string | null) {
        const state = this.state;
        const found = state?.players.find(player => player.id === id);
        if (!state || !found || !this.isHost) return;
        if (team && !state.teams.some(other => other.id === team)) return;
        for (const other of state.teams) for (const idea of other.ideas) idea.votes = idea.votes.filter(voter => voter !== id);
        found.team = team;
        this.publish();
    }

    /** Ready for them, once they've had `FORCE_AFTER` since the lock. */
    force(ids: string[]) {
        const { room, state } = this;
        if (!room || !state || !this.isHost || state.phase !== "locked" || room.shared < state.lockedAt + FORCE_AFTER) return;
        for (const player of state.players) if (ids.includes(player.id)) player.ready = true;
        this.publish();
        this.maybeStart();
    }

    /** The round is over: everyone sees the results. */
    finish(results: Results) {
        const state = this.state;
        if (!state || !this.isHost || state.phase !== "play") return;
        // a match of rounds: on to the next meadow until someone has more than half
        state.played = [...(state.played ?? []), results];
        this.admitWaiting();
        const rounds = state.rules.rounds ?? 1;
        const wins = roundWins(state.played);
        const decided = Object.values(wins).some(count => count > rounds / 2) || state.played.length >= rounds;
        if (!decided)
        {
            state.phase = "locked";
            state.lockedAt = this.room!.shared;
            for (const player of state.players) player.ready = true;
            this.maybeStart();
            return;
        }
        state.phase = "results";
        state.results = rounds > 1 ? matchResults(state.played, id => state.players.find(player => player.id === id)?.team ?? null) : results;
        state.played = [];
        this.publish();
    }

    /** From the results straight into a new round, the same players and teams. */
    rematch() {
        const state = this.state;
        if (!state || !this.isHost || state.phase !== "results") return;
        state.phase = "locked";
        state.lockedAt = this.room!.shared;
        for (const player of state.players) player.ready = true;
        this.maybeStart();
    }

    /** From play or the results back to the lobby, locked, with nobody ready. */
    back() {
        const state = this.state;
        if (!state || !this.isHost || (state.phase !== "play" && state.phase !== "results")) return;
        state.phase = "locked";
        state.lockedAt = this.room!.shared;
        state.played = [];
        this.admitWaiting();
        for (const player of state.players) player.ready = false;
        this.publish();
    }

    // ------------------------------------------------------------------ joining

    /**
     * The guest's way in: the link they were sent. A host who just sent it is often still in their messages
     * app with the tab frozen, so a link nobody answers is tried again for `HOST_WAIT` before it's given up.
     */
    async join({ lobby, invite, host }: Invite) {
        this.events.status("joining");
        this.token = rejoinToken(host);
        await this.lobby.start(lobby);
        const network = await this.connect(invite, HOST_WAIT, () => this.events.status("waitingHost"));
        if (network === "rejected") return this.end("locked");
        if (!network) return this.end("gone");
        this.enter(network, invite, host);
    }

    /** Tries the invite until it works or `patience` ms have gone. */
    private async connect(invite: Invite["invite"], patience: number, waiting: () => void): Promise<Network | "rejected" | null> {
        const until = Date.now() + patience;
        while (!this.ended)
        {
            try
            {
                const network = await this.lobby.join(invite, { profile: { name: this.name() } });
                if (this.ended) network.leave();
                else return network;
            }
            catch (error)
            {
                console.warn("could not join", error);
                // the entry said no: locked, full or kicked
                if (/^rejected$/i.test(String((error as Error)?.message ?? error))) return "rejected";
                if (Date.now() >= until) return null;
                waiting();
                await wait(JOIN_GAP);
            }
        }
        return null;
    }

    private enter(network: Network, invite: Invite["invite"], host: string) {
        const room = this.room = new Room(network, host);
        this.common(room);

        room.on("state", (state: GameState, sender) => {
            if (sender !== host) return;
            this.state = state;
            this.events.status("");
            this.events.state(structuredClone(state));
        });
        room.on("denied", async ({ reason, wrong }, sender) => {
            if (sender !== host) return;
            if (reason === "password")
            {
                const password = await this.events.password(wrong === true);
                room.send(host, "hello", { name: this.name(), password, token: this.token });
                return;
            }
            this.end(reason === "full" ? "full" : reason === "kicked" ? "kicked" : "locked");
        });
        room.on("kicked", (_, sender) => sender === host && this.end("kicked"));
        room.onLink((peer, open) => {
            if (!open && peer === host && this.room === room) void this.reconnect(invite, host);
        });

        room.send(host, "hello", { name: this.name(), token: this.token });
    }

    /** The host is gone from here: maybe a short drop on either side, so try to get back for a while. */
    private async reconnect(invite: Invite["invite"], host: string) {
        if (this.ended) return;
        const old = this.room;
        this.room = null;
        old?.leave();
        window.removeEventListener("pagehide", this.bye);
        this.events.reconnecting(true);
        const network = await this.connect(invite, RECONNECT, () => undefined);
        if (this.ended) return;
        if (!network || network === "rejected") return this.end("hostLeft");
        this.events.reconnecting(false);
        this.enter(network, invite, host);
    }

    // ------------------------------------------------------------------ everyone

    private common(room: Room) {
        room.on("said", (line: ChatLine, sender) => {
            if (sender !== room.hostId) return;
            this.events.chat(line);
        });
        window.addEventListener("pagehide", this.bye);
    }

    private bye = () => this.room?.leave();

    /** Something I do, through the host. */
    act(type: "ready" | "chat" | "idea" | "vote" | "name", payload: Record<string, unknown>) {
        const room = this.room;
        if (room && !room.closed) room.send(room.hostId, type, payload);
    }

    /** What play needs: the shared clock, the lossy pose channel, and reliable messages for shots and hits. */
    net() {
        const room = this.room!;
        return {
            shared: () => room.shared,
            sendFast: (peers: string[], data: ArrayBuffer) => room.sendFast(peers, data),
            onFast: (handler: (data: ArrayBuffer, sender: string) => void) => room.onFast(handler),
            send: (to: string[], type: string, payload: unknown) => room.sendAll(to, type, payload),
            on: (type: string, handler: (payload: any, sender: string) => void) => room.on(type, handler),
        };
    }

    /** The shared clock's time on ours. */
    local(shared: number) {
        return this.room?.local(shared) ?? shared;
    }

    end(reason: End) {
        if (this.ended) return;
        this.ended = true;
        for (const timer of this.timers) clearInterval(timer);
        clearTimeout(this.goTimer);
        window.removeEventListener("pagehide", this.bye);
        this.room?.leave();
        this.events.end(reason);
    }
}
