import { loadText, type GameState } from "@arrow-warfare/core";
import { mountResults } from "@arrow-warfare/results";

await loadText();
const state = example();
mountResults(document.querySelector<HTMLElement>("#team")!, { state, me: "a", host: true, onBack: () => alert("back"), onRematch: () => alert("rematch") });
const draw = example();
draw.results!.winner = null;
for (const stats of draw.results!.players) stats.won = false;
mountResults(document.querySelector<HTMLElement>("#draw")!, { state: draw, me: "c", host: false, onBack: () => undefined, onRematch: () => undefined });

/** A made up round for the views. */
function example(): GameState {
    return {
        host: "a", name: "Friday arrows", password: false, max: 10, phase: "results", lockedAt: 0, go: 0, seed: 1,
        rules: { arrows: 4, trees: "few", size: "medium" },
        players: [
            { id: "a", name: "henry", colour: 0, skin: 1, ready: false, team: "t1", ping: 0 },
            { id: "b", name: "anna", colour: 1, skin: 3, ready: false, team: "t1", ping: 42 },
            { id: "c", name: "bob", colour: 2, skin: 0, ready: false, team: null, ping: 310 },
            { id: "d", name: "cleo", colour: 3, skin: 4, ready: false, team: null, ping: 80 },
        ],
        teams: [{ id: "t1", colour: 5, ideas: [{ id: "i1", by: "a", text: "The Pointy Ones", votes: ["b"] }] }],
        results: {
            winner: { kind: "team", id: "t1" },
            duration: 94_000,
            players: [
                { id: "a", shots: 6, hits: 2, kills: 2, longest: 31.4, picked: 3, alive: 94_000, won: true },
                { id: "b", shots: 3, hits: 0, kills: 0, longest: 0, picked: 1, alive: 61_000, won: true },
                { id: "c", shots: 5, hits: 1, kills: 1, longest: 12.2, picked: 2, alive: 72_500, won: false },
                { id: "d", shots: 2, hits: 0, kills: 0, longest: 0, picked: 0, alive: 40_100, won: false },
            ],
        },
    };
}
