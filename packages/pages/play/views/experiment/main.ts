// core
import "@papit/codeblock";
import { loadText, type Damage, type GameState, type MapSize, type TimeOfDay, type TreeAmount } from "@arrow-warfare/core";
import { Sound } from "@arrow-warfare/sound";
import type { Zone } from "@arrow-warfare/archery";

// component
import { mountPlay } from "@arrow-warfare/play";

await loadText();
const stage = document.querySelector<HTMLElement>(".demo-stage")!;
const form = document.querySelector<HTMLFormElement>(".demo-controls")!;
// `?seed=7` for another meadow
const seed = new URLSearchParams(location.search).get("seed");
if (seed) (form.elements.namedItem("seed") as HTMLInputElement).value = seed;

const sound = new Sound();
sound.unlockOnFirstTap();
let play: ReturnType<typeof mountPlay> | null = null;

/** A new round with what the form says. Alone, nobody sends poses: the others stand at their spawns. */
function start() {
    play?.remove();
    const data = new FormData(form);
    const state = example();
    state.seed = Number(data.get("seed")) || 1;
    state.rules = {
        arrows: Number(data.get("arrows")),
        trees: data.get("trees") as TreeAmount,
        size: data.get("size") as MapSize,
        damage: data.get("damage") as Damage,
        time: data.get("time") as TimeOfDay,
    };
    play = mountPlay(stage, {
        state, me: "a", host: true, sound, bots: data.get("bots") === "on", contained: true, ruleArrows: true,
        onBack: () => alert("back to the lobby"),
        onEnd: results => console.log("round over", results),
    });
    (globalThis as any).play = play;
}

form.addEventListener("change", event => {
    // the time of day changes the light straight away, the rest is a new round
    const name = (event.target as HTMLInputElement).name;
    if (name === "time") play?.palette((event.target as HTMLSelectElement).value as TimeOfDay);
    else start();
});
form.addEventListener("click", event => {
    const button = (event.target as HTMLElement).closest("button");
    if (!button) return;
    if (button.dataset.do === "restart") start();
    if (button.dataset.injure !== undefined) play?.debug.injure((button.dataset.injure || null) as Zone | null);
});
// typing in the form doesn't walk
form.addEventListener("keydown", event => event.stopPropagation());

start();

/** A made up lobby for the views. */
function example(): GameState {
    return {
        host: "a", name: "Friday arrows", password: false, max: 10, phase: "locked", lockedAt: -20_000, go: 0, seed: 1,
        rules: { arrows: 4, trees: "few", size: "medium", damage: "injuries", time: "clock" },
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
