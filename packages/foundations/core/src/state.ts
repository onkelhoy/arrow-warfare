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
    /** Played by the host's phone, not a peer: nothing is sent to them. */
    bot?: boolean;
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

/** One weapon for everyone in a game. */
export type Weapon = "bow" | "revolver" | "rifle";

/** How well the bots aim, how quickly they react and draw. */
export type Difficulty = "easy" | "normal" | "hard";

export type Rules = {
    weapon: Weapon;
    /** Arrows per player, 0 is unlimited. */
    arrows: number;
    /** With a gun: spare rounds per player on top of a full gun, 0 is unlimited. */
    ammo: number;
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
    /** Rain all round. */
    rain: boolean;
    /** Bots the host plays, on top of the players. */
    bots: number;
    difficulty: Difficulty;
};

export const TREE_AMOUNTS: TreeAmount[] = ["none", "few", "many"];
export const MAP_SIZES: MapSize[] = ["small", "medium", "large"];
export const WEAPONS: Weapon[] = ["bow", "revolver", "rifle"];
/** Spare rounds to choose from, 0 is unlimited. */
export const AMMO = [0, 6, 12, 24, 48];
export const MAP_KINDS: MapKind[] = ["field", "farm", "city"];

export const DAMAGES: Damage[] = ["arcade", "injuries"];
export const ROUNDS = [1, 3, 5];
export const DIFFICULTIES: Difficulty[] = ["easy", "normal", "hard"];
/** Bot counts to choose from, up to `BOT_LIMIT`. */
export const BOT_COUNTS = [0, 1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50, 75, 100];
export const BOT_LIMIT = 100;
export const TIMES: TimeOfDay[] = ["clock", "night", "dawn", "noon", "sunset"];

export const RULES_DEFAULT: Rules = { weapon: "bow", arrows: 0, ammo: 0, trees: "few", size: "medium", map: "field", props: "few", buildings: "few", towers: "none", damage: "injuries", time: "clock", rounds: 1, friendly: true, rain: false, bots: 0, difficulty: "normal" };

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

/** The real players, the ones on the network: everyone but the bots. */
export function people<T extends { bot?: boolean }>(players: T[]) {
    return players.filter(player => !player.bot);
}

/** Bots' names, given in turn (a number after them once they run out). */
export const BOT_NAMES = ["Ada", "Bram", "Cora", "Dag", "Edda", "Finn", "Greta", "Hugo", "Ilse", "Jens", "Kaja", "Lars", "Maja", "Nils", "Olga", "Per", "Rut", "Sven", "Tova", "Ulf", "Vera", "Wim", "Yrsa", "Zeke"];

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
