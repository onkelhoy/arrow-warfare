/** The lobby as the host decides it, sent whole to everyone when it changes. */

export type Phase = "open" | "locked" | "countdown" | "play" | "results";

export type Player = {
    id: string;
    name: string;
    /** Index in `COLOURS`, their own. A team's colour replaces it. */
    colour: number;
    /** Index in `SKINS`. */
    skin: number;
    ready: boolean;
    team: string | null;
    /** ms there and back to the host, -1 before it's known. */
    ping: number;
    /** Players they have no direct link to: what goes between them goes through the host. */
    gaps?: string[];
};

export type Idea = { id: string; by: string; text: string; votes: string[] };

export type Team = { id: string; colour: number; ideas: Idea[] };

export type TreeAmount = "none" | "few" | "many";
export type MapSize = "small" | "medium" | "large";
/** The kind of place: the meadow, a farm with fields and barns, or a town of streets. */
export type MapKind = "field" | "farm" | "city";

/** Arcade: any hit kills. Injuries: the head and torso kill, arms and legs wound. */
export type Damage = "arcade" | "injuries";
/** The light: each player's own clock, or the same hour for everyone. */
export type TimeOfDay = "clock" | "night" | "dawn" | "noon" | "sunset";

export type Rules = {
    /** Arrows per player, 0 is unlimited. */
    arrows: number;
    /** Trees in the meadow, the forest wall is always there. */
    trees: TreeAmount;
    size: MapSize;
    map: MapKind;
    /** Rocks, bushes, carts, barrels: cover to hide behind. */
    props: TreeAmount;
    /** Houses and barns, on top of what the map has of its own. */
    buildings: TreeAmount;
    /** Climbable watch towers to shoot down from. */
    towers: TreeAmount;
    damage: Damage;
    time: TimeOfDay;
    /** Rounds in a match: 1, or best of 3 or 5. */
    rounds: number;
    /** Off: a teammate's arrow flies through you. */
    friendly: boolean;
};

export const TREE_AMOUNTS: TreeAmount[] = ["none", "few", "many"];
export const MAP_SIZES: MapSize[] = ["small", "medium", "large"];
export const MAP_KINDS: MapKind[] = ["field", "farm", "city"];

export const DAMAGES: Damage[] = ["arcade", "injuries"];
export const ROUNDS = [1, 3, 5];
export const TIMES: TimeOfDay[] = ["clock", "night", "dawn", "noon", "sunset"];

export const RULES_DEFAULT: Rules = { arrows: 0, trees: "few", size: "medium", map: "field", props: "few", buildings: "few", towers: "none", damage: "injuries", time: "clock", rounds: 1, friendly: true };

export type GameState = {
    host: string;
    name: string;
    /** Whether a password is needed, never the password. */
    password: boolean;
    max: number;
    phase: Phase;
    /** Shared ms when the room was locked, the host can force ready `FORCE_AFTER` later. */
    lockedAt: number;
    /** Shared ms the game starts at, during the countdown. */
    go: number;
    /** The meadow of this round, picked by the host at the countdown. */
    seed: number;
    rules: Rules;
    players: Player[];
    /** Back after a drop while a round runs: they join the players when it ends. */
    waiting?: Player[];
    teams: Team[];
    /** The last round's end, while the phase is `results`. */
    results: Results | null;
    /** The rounds played so far in this match. */
    played: Results[];
};

/** One player's round. */
export type PlayerStats = {
    id: string;
    shots: number;
    hits: number;
    kills: number;
    /** Metres, the longest shot that hit. */
    longest: number;
    picked: number;
    /** Arrows that hit them, wounds and the last one. */
    taken: number;
    /** ms they lived, the whole round for the ones standing at the end. */
    alive: number;
    won: boolean;
};

/** Who won (a team or a player), `null` for a draw. */
export type Results = {
    winner: { kind: "team" | "player"; id: string } | null;
    players: PlayerStats[];
    /** ms the round lasted. */
    duration: number;
    /** Rounds won, by winner id, over a match of more than one. */
    wins?: Record<string, number>;
};

export type ChatLine = { from: string; name: string; colour: number; text: string; team: boolean };

export const MAX_DEFAULT = 10;
export const MAX_LIMIT = 32;
export const ARROWS_DEFAULT = RULES_DEFAULT.arrows;
export const NAME_IDEA_LENGTH = 24;
export const CHAT_LENGTH = 200;
/** ms after locking before the host can force someone ready. */
export const FORCE_AFTER = 15_000;
/** ms from all ready to go. */
export const COUNTDOWN = 3500;
/** A ping above this is shown as a weak connection. */
export const WEAK_PING = 250;

/** A team's name: the idea with most votes, the earliest on a tie. */
export function teamName(team: Team) {
    let best: Idea | null = null;
    for (const idea of team.ideas) if (!best || idea.votes.length > best.votes.length) best = idea;
    return best?.text ?? "";
}

/** The colour a player wears: their team's, else their own. */
export function wears(state: GameState, player: Player) {
    return state.teams.find(team => team.id === player.team)?.colour ?? player.colour;
}

/** Rounds won by each winner id. */
export function roundWins(played: Results[]) {
    const wins: Record<string, number> = {};
    for (const round of played) if (round.winner) wins[round.winner.id] = (wins[round.winner.id] ?? 0) + 1;
    return wins;
}

/** A match's rounds as one: the stats added up, the winner the one with most rounds. */
export function matchResults(played: Results[], teamOf: (id: string) => string | null): Results {
    const wins = roundWins(played);
    const players = new Map<string, PlayerStats>();
    for (const round of played) for (const stats of round.players)
    {
        const sum = players.get(stats.id);
        if (!sum) { players.set(stats.id, { ...stats }); continue; }
        sum.shots += stats.shots; sum.hits += stats.hits; sum.kills += stats.kills; sum.picked += stats.picked;
        sum.taken += stats.taken; sum.alive += stats.alive; sum.longest = Math.max(sum.longest, stats.longest);
    }
    const best = Math.max(0, ...Object.values(wins));
    const top = Object.keys(wins).filter(id => wins[id] === best);
    const winner = best > 0 && top.length === 1 ? played.find(round => round.winner?.id === top[0])!.winner : null;
    for (const stats of players.values()) stats.won = !!winner && (winner.kind === "player" ? stats.id === winner.id : teamOf(stats.id) === winner.id);
    return { winner, players: [...players.values()], duration: played.reduce((sum, round) => sum + round.duration, 0), wins };
}
