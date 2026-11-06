import { effect } from "@papit/signals";
import "@arrow-warfare/backdrop";
import { loadText, roundWins, useTheme, saveSettings, settings, t, teamName, type GameState } from "@arrow-warfare/core";
import { mountCorner } from "@arrow-warfare/corner";
import { mountLobby } from "@arrow-warfare/lobby";
import { mountMenu } from "@arrow-warfare/menu";
import { ANCHORS, APP, BEACON, HANDSHAKE_TIMEOUT, httpUrl, Lobby, LOBBY_NAME, parseInvite, RESCAN, RTC, signalUrl, withoutInvite } from "@arrow-warfare/net";
import { mountPlay } from "@arrow-warfare/play";
import { mountResults } from "@arrow-warfare/results";
import { Sound } from "@arrow-warfare/sound";

import { Session, type End } from "./session";

type Screen = { remove(): void };
type Playing = Screen & { update(state: GameState): void };

/** The app: one screen at a time, menu → lobby → play, and back to the menu when a game ends. */
export async function startApp(root: HTMLElement = document.body) {
    await loadText();
    saveSettings();

    const sound = new Sound();
    sound.unlockOnFirstTap();
    sound.playlist("lobby");
    useTheme();
    mountCorner(sound, root);

    // the painted sky, castle and mountains behind every menu
    const backdrop = document.createElement("aw-backdrop");
    backdrop.className = "aw-app-backdrop";
    root.prepend(backdrop);

    const screen = document.createElement("div");
    screen.className = "screen";
    root.append(screen);

    // one lobby for the whole visit, a game ending doesn't leave it
    const lobby = new Lobby({
        url: signalUrl(),
        http: httpUrl(),
        name: LOBBY_NAME,
        meta: { app: APP, kind: "lobby", v: 1 },
        rtc: RTC,
        anchors: ANCHORS,
        beacon: BEACON,
        handshakeTimeout: HANDSHAKE_TIMEOUT,
        rescan: RESCAN,
    });

    let current: Screen | null = null;
    const show = <T extends Screen>(next: T) => {
        current?.remove();
        current = next;
        return next;
    };

    const menu = (note = "") => {
        const invite = parseInvite(location.search, location.hash);
        const page = show(mountMenu(screen, {
            by: invite ? invite.by : null,
            onHost: () => play(null),
            onJoin: () => invite && play(invite),
        }));
        page.status(note);
        sound.playlist("lobby");
        return page;
    };

    /** A match's score over the countdown: "Red 2 · Blue 1", empty before the second round. */
    const score = (state: GameState) => {
        if (!state.played?.length) return "";
        const wins = roundWins(state.played);
        const sides = state.teams.length ? state.teams.map(team => ({ id: team.id, name: teamName(team) || "?" })) : state.players.map(player => ({ id: player.id, name: player.name }));
        return `${t("rules.round", { number: String(state.played.length + 1) })} · ${sides.map(side => `${side.name} ${wins[side.id] ?? 0}`).join(" · ")}`;
    };

    const play = (invite: ReturnType<typeof parseInvite>) => {
        const entry = current as ReturnType<typeof mountMenu>;
        let page: ReturnType<typeof mountLobby> | null = null;
        let playing: Playing | null = null;
        let results: Screen | null = null;
        let phase = "";
        /** Whose lobby the page was made for, a reconnect is a new id. */
        let pageMe = "";
        const note = document.createElement("div");
        note.className = "aw-note";
        note.hidden = true;
        screen.append(note);
        const say = (words: string) => {
            note.textContent = words;
            note.hidden = !words;
        };
        let reconnecting = false;

        const session: Session = new Session(lobby, () => settings().name, {
            state(state) {
                if (page && pageMe !== session.me)
                {
                    // back after a drop with a new id: the pages are made again for it
                    playing?.remove();
                    playing = null;
                    results?.remove();
                    results = null;
                    page.remove();
                    page = null;
                }
                const inGame = state.players.some(player => player.id === session.me);
                say(reconnecting ? t("status.reconnecting") : state.phase === "play" && !inGame ? t("status.waitingRound") : "");
                if (!page)
                {
                    pageMe = session.me;
                    page = show(mountLobby(screen, session.me, {
                        ready: ready => session.act("ready", { ready }),
                        chat: (text, team) => session.act("chat", { text, team }),
                        idea: (team, text) => session.act("idea", { team, text }),
                        vote: (team, idea) => session.act("vote", { team, idea }),
                        leave: () => session.end("left"),
                        game: change => session.setGame(change),
                        rules: change => session.setRules(change),
                        lock: locked => session.lock(locked),
                        kick: id => session.kick(id),
                        createTeam: () => session.createTeam(),
                        deleteTeam: id => session.deleteTeam(id),
                        assign: (id, team) => session.assign(id, team),
                        force: ids => session.force(ids),
                    }));
                    if (shownLink) page.invite.link(shownLink);
                    else page.invite.text(t(session.isHost ? "invite.connecting" : "invite.onlyHost"));
                }
                page.update(state);
                if (state.phase === "countdown" && phase !== "countdown") page.countdown(session.local(state.go), score(state));
                if (state.phase === "play" && !playing && inGame)
                {
                    playing = mountPlay(screen, {
                        state, me: session.me, host: session.isHost, net: session.net(), sound,
                        onBack: () => session.back(),
                        onEnd: ended => session.finish(ended),
                    });
                    page.element.hidden = true;
                    sound.playlist("game");
                }
                else if (state.phase === "play") playing?.update(state);
                if ((state.phase !== "play" || !inGame) && playing)
                {
                    playing.remove();
                    playing = null;
                    page.element.hidden = false;
                    sound.playlist("lobby");
                }
                if (state.phase === "results" && !results && state.results)
                {
                    results = mountResults(screen, {
                        state, me: session.me, host: session.isHost,
                        onBack: () => session.back(),
                        onRematch: () => session.rematch(),
                    });
                    page.element.hidden = true;
                }
                else if (state.phase !== "results" && results)
                {
                    results.remove();
                    results = null;
                    page.element.hidden = state.phase === "play" && inGame;
                }
                phase = state.phase;
            },
            chat: line => page?.chat(line),
            link(link) {
                shownLink = link;
                page?.invite.link(link);
            },
            status: words => entry.status?.(words ? t(`status.${words}`, { name: invite?.by || t("status.friend") }) : ""),
            password: wrong => entry.askPassword(wrong),
            reconnecting(trying) {
                reconnecting = trying;
                say(trying ? t("status.reconnecting") : "");
            },
            end(reason: End) {
                stopName();
                note.remove();
                playing?.remove();
                results?.remove();
                history.replaceState(null, "", withoutInvite(location.href));
                menu(reason === "left" ? "" : t(`end.${reason}`));
            },
        });
        let shownLink = "";

        // a new name in the settings reaches the host
        let first = true;
        const stopName = effect(() => {
            const name = settings().name;
            if (first) return void (first = false);
            session.act("name", { name });
        });

        const lobbyStatus = effect(() => {
            const status = lobby.status();
            if (page) return;
            if (status === "waking") entry.status(t("status.waking"));
            else if (status === "failed") entry.status(t("status.failed"));
            else if (status === "connecting") entry.status(t("status.connecting"));
        });

        const started = invite ? session.join(invite) : session.host();
        started.catch(error => {
            console.error(error);
            session.end("gone");
        }).finally(() => lobbyStatus());
    };

    menu();
    return { root, lobby, sound };
}
