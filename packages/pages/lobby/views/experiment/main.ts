import "@papit/codeblock";
import "@arrow-warfare/backdrop";
import { loadText, RULES_DEFAULT, useTheme } from "@arrow-warfare/core";
import { mountLobby } from "@arrow-warfare/lobby";
import type { GameState } from "@arrow-warfare/core";


await loadText();
useTheme();
// the lobby alone, as the host (`?guest` to see it read-only), the actions just change the example
const state = example();
const me = new URLSearchParams(location.search).has("guest") ? "b" : "a";
const lobby = mountLobby(document.querySelector<HTMLElement>("#stage")!, me, {
    ready: ready => { state.players.find(player => player.id === me)!.ready = ready; lobby.update(state); },
    chat: (text, team) => lobby.chat({ from: me, name: "henry", colour: 0, text, team }),
    idea: (team, text) => { state.teams.find(other => other.id === team)!.ideas.push({ id: String(Math.random()), by: me, text, votes: [] }); lobby.update(state); },
    vote: (team, idea) => { const found = state.teams.find(other => other.id === team)!.ideas.find(other => other.id === idea)!; found.votes = found.votes.includes(me) ? [] : [me]; lobby.update(state); },
    leave: () => alert("leave"),
    game: change => { Object.assign(state, change); lobby.update(state); },
    rules: change => { Object.assign(state.rules, change); lobby.update(state); },
    lock: locked => { state.phase = locked ? "locked" : "open"; state.lockedAt = performance.now() - 20_000; lobby.update(state); },
    kick: id => { state.players = state.players.filter(player => player.id !== id); lobby.update(state); },
    createTeam: () => { state.teams.push({ id: String(Math.random()), colour: state.teams.length + 3, ideas: [] }); lobby.update(state); },
    deleteTeam: id => { state.teams = state.teams.filter(team => team.id !== id); lobby.update(state); },
    assign: (id, team) => { state.players.find(player => player.id === id)!.team = team; lobby.update(state); },
    force: ids => { for (const player of state.players) if (ids.includes(player.id)) player.ready = true; lobby.update(state); },
});
lobby.invite.link("https://onkelhoy.github.io/arrow-warfare/?by=henry#example");
lobby.update(state);

/** A made up lobby for the views. */
function example(): GameState {
    return {
        host: "a", name: "Friday arrows", password: false, max: 10, phase: "locked", lockedAt: -20_000, go: 0, seed: 1,
        rules: { ...RULES_DEFAULT, arrows: 4 },
        players: [
            { id: "a", name: "henry", colour: 0, skin: 1, ready: false, team: "t1", ping: 0 },
            { id: "b", name: "anna", colour: 1, skin: 3, ready: true, team: "t1", ping: 42 },
            { id: "c", name: "bob", colour: 2, skin: 0, ready: false, team: null, ping: 310 },
        ],
        results: null,
        played: [],
        teams: [{ id: "t1", colour: 5, ideas: [{ id: "i1", by: "a", text: "The Pointy Ones", votes: ["b"] }, { id: "i2", by: "b", text: "Tiny Legs", votes: [] }] }],
    };
}
