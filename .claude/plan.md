# Plan: milestone 9, a connection that holds

Goal: host, wife and dad (another network) get into one game every time, by QR, link or SMS, and stay in it.

## Where we are
Nothing started. Next: task 1.

## The model
- **Lobby** = the one chord network of the app. Only for meeting and finding games. Its anchor keeps the socket to the signal server, nobody else needs one.
- **Game** = a mesh network made by its host and carried by the lobby while people join. Its links are direct; once everyone is in it doesn't need the lobby.
- **Game code** = short id (6 chars, like `K7QF2M`). The link is `…/?g=K7QF2M&by=Henry`. No invite blob, no peer ids in the link.
- **Game record** in the lobby: `{code, host, invite, time}`, kept at whoever owns `game:CODE` in the chord (`sendKey`). The host writes it again every few seconds, so a new owner after churn has it soon.
- **Ownership**: the host's rejoin token proves they're the same host after a reload or a new peer id. A record is only replaced by the same token.
- Leaving the lobby says goodbye to the lobby only. The game lives on.

## Tasks
1. **Own bootstrap (`net/carried.ts`)**: our version of papit's `ParentBootstrap`, on papit's public `Bootstrap` interface. When the lobby closes, the game is not closed: it just can't take newcomers until a lobby carries it again (`carry(lobby)` swaps the parent). `Lobby.create/join` use it.
2. **Game code and memory**: `net/link.ts` makes and reads `?g=CODE&by=NAME`. sessionStorage `arrow-warfare.game = {code, role: host|guest, token, time}`, replaced on any host or join, dropped after ~2 h. A reload goes back to that game. Old long links still work for a while (read only).
3. **Game registry in the lobby (`net/registry.ts`)**: generic, knows nothing of arrows. `publish(code, record, token)` repeats every 5 s, `find(code)` asks the owner, `forget(code)`. The owner keeps records with a 20 s expiry; a record goes stale when its host stops writing. An answer `unknown` is a real answer, different from no answer.
4. **Guest join by code**: lobby → `find(code)` → join the invite in the record → hello with token. `unknown` three times in a row (a few s apart, the host may be re-registering) → "game not found", back to the menu. No answer → keep trying.
5. **Retry screen**: "Trying to reach Henry…", the try count, "can take up to 2 min" (the host may be in another app or getting the lobby back), and a Stop button that goes to the menu. Used for the first join and for reconnects.
6. **Host keeps the game across a lost lobby**: the game no longer closes with the lobby (task 1). On `visibilitychange` to visible and on lobby `close`: lobby back (new or the same), the game carried by it again, `publish` again. Being anchor is not needed: if another peer anchors and answers, it stays anchor.
7. **Leave the lobby on lock**: when the host locks, every player in the game whose lobby node isn't an anchor leaves the lobby (goodbye sent). The host stays, so a dropped player can rejoin by code. On unlock, players who left don't need to come back; only the host has to be findable. After the match (results → back to lobby) the host is in the lobby already.
8. **Guest reconnect by code**: a lost link to the host → retry screen → lobby (join again if left) → `find(code)` → join → hello with the same token, the host gives the old place back (exists). `RECONNECT` raised from 25 s to 120 s on both sides.
9. **Mesh gaps shown**: a guest that has no direct link to another player says so to the host; the lobby list shows that player's ping as "no link" for them. Reliable game messages a guest can't send directly go through the host (`relay`), so a missing guest-to-guest link doesn't lose shots or hits; poses go through it too, at a lower rate.
10. **TURN fallback**: Open Relay (free, metered.ca) added to `RTC` after STUN. Only used when direct fails.
11. **Debug log**: `?debug` shows an overlay with lobby status, anchor yes/no, game code, record found/published, links per peer, retries. To read on the phones during testing.
12. **Local test**: a three-tab run against a local signal server: host sends a link and switches tabs for 30 s, a guest reloads mid-game, the lobby is killed after lock, a stale code. Then bugs.md and backlog updated, push, owner tests on the phones.

## Not in this plan
- Host migration (host leaves, game ends), still F4 later.
