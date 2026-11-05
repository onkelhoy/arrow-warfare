# Plan: Milestone 1, together in a lobby

Proposed, waiting for confirmation. Delete this file when every task is done. Push once, when the whole milestone is done.

1. ~~**Setup**: `CLAUDE.md`, README, package layout folders, repo URLs, `.gitignore` for `docs/`~~ done
2. ~~**App package `packages/game`**: a workspace package with a hello page, `npm start` shows it with every package's views~~ done
~~3. **Deploy**: `npm run pages` builds `docs/` with `@papit/static`, `pages.yml` deploys on push to `main`. Needs the GitHub repo.~~ done
~~4. **Assets into the app**: copy root `asset/` (songs, logo) like cowboy's `sync-assets`, page icons and manifest~~ done
~~5. **Sound core + playlists**: `foundations/sound`, `asset/audio/songs.json` with `lobby` and `game`, shuffle, next on end, crossfade~~ done
6. **Settings + corner**: `foundations/core` settings (name, volumes, mute), `molecules/corner` with fullscreen, music and volume.
7. **QR and share link**: copy `qr-code` and `share-link` from cowboy into `atoms/`
8. **Lobby network**: `foundations/net`, port cowboy's chord lobby and config, lobby name `arrow-warfare`
9. **Room + invite**: host creates a mesh room, invite link, `molecules/invite-dialog`, join by link with host wait
10. **Menu page**: name (saved), host a game, arriving by link joins (password prompt if needed).
11. **Lobby page, open phase**: player list "name (colour)". The host gives each player a random unused colour and skin colour automatically
12. **Chat**: `molecules/chat`, everyone's chat, plain text
13. **Host panel**: tabs Invite, Game (name, password, max players), Players (ping, weak connection warning, kick), Rules (arrow count for now). Players see it read-only
14. **Lock**: the host locks and unlocks the room, nobody joins while locked
15. **Teams**: Teams tab when locked: create, add players from the list, delete. A team gets a random colour and all its members wear it. No teams = free for all
16. **Team names and team chat**: ideas, the first becomes the name, then voting on a little sign board. Team chat tab
17. **Ready and start**: ready toggles, the host can force a player or team after a delay, shared clock 3 2 1, then a placeholder play page.

## Where we are
Tasks 1–5 done. Next: task 6, settings + corner.

Notes for the next session:
- The app is `packages/game`, not a root `game/`: papit's Information only scans `packages/` for workspace packages.
- New packages: `python3 /tmp/aw-tools/scaffold.py <layer> <name> <library|web-component> "<description>" [dep=version ...]` (may be gone after a reboot, it copies cowboy's share-link tsconfig). Element prefix `aw-`, scope `@arrow-warfare/`.
- Sound: `Sound` in `foundations/sound`, `playlist("lobby" | "game" | null)`, songs stream from `/audio/songs/<name>.mp3` via fetch → blob → `<audio>`, lists in root `asset/audio/songs.json`.
- Not checked yet: the dev server answering `/audio/songs.json` (a server already running didn't see `packages/game/asset/owner/`, it needs a restart after `node packages/game/bin/sync-assets.mjs`). Check with `packages/foundations/sound/views/sound/`.
- Pushed once already (after task 3, hello page). From now on push only at the end of a milestone.
- Owner: set repo Settings → Pages → Source to "GitHub Actions".
- Cowboy sources to port: `packages/game/src/{settings,fullscreen,text}.ts`, `ui/corner.ts`, `ui/icons.ts`, `net/{config,lobby,match}.ts`, `link.ts`, `online.ts` (host/join/watch flow). Join denial (locked/full/password) planned as app-level: host accepts the link, then sends `denied {reason}` after checking the guest's hello.
