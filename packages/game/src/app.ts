import { effect } from "@papit/signals";
import { loadText, saveSettings, settings, t, type GameState } from "@arrow-warfare/core";
import { mountCorner } from "@arrow-warfare/corner";
import { mountLobby } from "@arrow-warfare/lobby";
import { mountMenu } from "@arrow-warfare/menu";
import { ANCHORS, APP, BEACON, HANDSHAKE_TIMEOUT, httpUrl, Lobby, LOBBY_NAME, parseInvite, RESCAN, RTC, signalUrl, withoutInvite } from "@arrow-warfare/net";
import { mountPlay } from "@arrow-warfare/play";
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
    mountCorner(sound, root);

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

    const play = (invite: ReturnType<typeof parseInvite>) => {
        const entry = current as ReturnType<typeof mountMenu>;
        let page: ReturnType<typeof mountLobby> | null = null;
        let playing: Playing | null = null;
        let phase = "";

        const session: Session = new Session(lobby, () => settings().name, {
            state(state) {
                if (!page)
                {
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
                if (state.phase === "countdown" && phase !== "countdown") page.countdown(session.local(state.go));
                if (state.phase === "play" && !playing)
                {
                    playing = mountPlay(screen, { state, me: session.me, host: session.isHost, net: session.net(), onBack: () => session.back() });
                    page.element.hidden = true;
                    sound.playlist("game");
                }
                else if (state.phase === "play") playing?.update(state);
                if (state.phase !== "play" && playing)
                {
                    playing.remove();
                    playing = null;
                    page.element.hidden = false;
                    sound.playlist("lobby");
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
            end(reason: End) {
                stopName();
                playing?.remove();
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
