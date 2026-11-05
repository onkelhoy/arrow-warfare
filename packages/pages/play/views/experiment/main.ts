import { loadText } from "@arrow-warfare/core";
import { mountPlay } from "@arrow-warfare/play";
import type { GameState } from "@arrow-warfare/core";
import { Sound } from "@arrow-warfare/sound";

await loadText();
// alone, nobody sends poses: the others stand at their spawns. `?seed=7` for another meadow
const state = example();
state.seed = Number(new URLSearchParams(location.search).get("seed")) || 1;
// my phone judges the stand-ins too, so they can be shot. The round ends when one side is left
const sound = new Sound();
sound.unlockOnFirstTap();
(globalThis as any).play = mountPlay(document.querySelector<HTMLElement>("#stage")!, {
    state, me: "a", host: true, sound, bots: true,
    onBack: () => alert("back to the lobby"),
    onEnd: results => console.log("round over", results),
});

/** A made up lobby for the views. */
function example(): GameState {
    return {
        host: "a", name: "Friday arrows", password: false, max: 10, phase: "locked", lockedAt: -20_000, go: 0, seed: 1,
        rules: { arrows: 4, trees: "few", size: "medium" },
        players: [
            { id: "a", name: "henry", colour: 0, skin: 1, ready: false, team: "t1", ping: 0 },
            { id: "b", name: "anna", colour: 1, skin: 3, ready: true, team: "t1", ping: 42 },
            { id: "c", name: "bob", colour: 2, skin: 0, ready: false, team: null, ping: 310 },
            { id: "d", name: "cleo", colour: 3, skin: 4, ready: true, team: null, ping: 80 },
        ],
        results: null,
        teams: [{ id: "t1", colour: 5, ideas: [{ id: "i1", by: "a", text: "The Pointy Ones", votes: ["b"] }, { id: "i2", by: "b", text: "Tiny Legs", votes: [] }] }],
    };
}
