import type { GameState } from "@arrow-warfare/core";

/** A made up lobby for the views. */
export function example(): GameState {
    return {
        host: "a", name: "Friday arrows", password: false, max: 10, phase: "locked", lockedAt: -20_000, go: 0,
        rules: { arrows: 4 },
        players: [
            { id: "a", name: "henry", colour: 0, skin: 1, ready: false, team: "t1", ping: 0 },
            { id: "b", name: "anna", colour: 1, skin: 3, ready: true, team: "t1", ping: 42 },
            { id: "c", name: "bob", colour: 2, skin: 0, ready: false, team: null, ping: 310 },
        ],
        teams: [{ id: "t1", colour: 5, ideas: [{ id: "i1", by: "a", text: "The Pointy Ones", votes: ["b"] }, { id: "i2", by: "b", text: "Tiny Legs", votes: [] }] }],
    };
}
