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
};

export type Idea = { id: string; by: string; text: string; votes: string[] };

export type Team = { id: string; colour: number; ideas: Idea[] };

export type TreeAmount = "none" | "few" | "many";
export type MapSize = "small" | "medium" | "large";

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
    damage: Damage;
    time: TimeOfDay;
};

export const TREE_AMOUNTS: TreeAmount[] = ["none", "few", "many"];
export const MAP_SIZES: MapSize[] = ["small", "medium", "large"];

export const DAMAGES: Damage[] = ["arcade", "injuries"];
export const TIMES: TimeOfDay[] = ["clock", "night", "dawn", "noon", "sunset"];

export const RULES_DEFAULT: Rules = { arrows: 4, trees: "few", size: "medium", damage: "injuries", time: "clock" };

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
    teams: Team[];
    /** The last round's end, while the phase is `results`. */
    results: Results | null;
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
