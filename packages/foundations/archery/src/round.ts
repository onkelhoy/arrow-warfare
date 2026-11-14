import type { PlayerStats, Results } from "@arrow-warfare/core";

type Who = { id: string; team: string | null };

/** The sides still standing: a team id, or a player id for those without a team. */
export function standing(players: Who[], dead: string[]) {
    const sides = new Set<string>();
    for (const player of players) if (!dead.includes(player.id)) sides.add(player.team ?? `player:${player.id}`);
    return [...sides];
}

/**
 * What everyone did this round, kept by every phone from the messages. The host's is the one that counts,
 * it goes out with the results.
 */
export class Tally {
    private stats = new Map<string, PlayerStats>();
    private died = new Map<string, number>();
    /** ms lived in lives already over, and when the current one began. */
    private lived = new Map<string, number>();
    private since = new Map<string, number>();

    constructor(private start: number) { }

    private of(id: string) {
        let stats = this.stats.get(id);
        if (!stats)
        {
            stats = { id, shots: 0, hits: 0, kills: 0, longest: 0, picked: 0, taken: 0, alive: 0, won: false };
            this.stats.set(id, stats);
        }
        return stats;
    }

    shot(by: string) {
        this.of(by).shots++;
    }

    hit(by: string, distance: number, kill: boolean) {
        const stats = this.of(by);
        stats.hits++;
        if (kill) stats.kills++;
        stats.longest = Math.max(stats.longest, Math.round(distance * 10) / 10);
    }

    /** An arrow went into `id`. */
    taken(id: string) {
        this.of(id).taken++;
    }

    picked(by: string) {
        this.of(by).picked++;
    }

    death(id: string, at: number) {
        if (this.died.has(id)) return;
        this.died.set(id, at);
        this.lived.set(id, (this.lived.get(id) ?? 0) + at - (this.since.get(id) ?? this.start));
    }

    /** Back in the round (a respawn, a bot taken over). */
    revive(id: string, at: number) {
        if (!this.died.delete(id)) return;
        this.since.set(id, at);
    }

    /** `out`: who's out for good, by default everyone dead now. */
    results(players: Who[], end: number, out?: string[]): Results {
        const dead = out ?? [...this.died.keys()];
        const sides = standing(players, dead);
        const side = sides.length === 1 ? sides[0] : null;
        const winner: Results["winner"] = !side ? null : side.startsWith("player:") ? { kind: "player", id: side.slice(7) } : { kind: "team", id: side };
        return {
            winner,
            duration: Math.round(end - this.start),
            players: players.map(player => {
                const stats = { ...this.of(player.id) };
                stats.alive = Math.round((this.lived.get(player.id) ?? 0) + (this.died.has(player.id) ? 0 : end - (this.since.get(player.id) ?? this.start)));
                stats.won = !!side && (player.team ?? `player:${player.id}`) === side;
                return stats;
            }),
        };
    }
}
