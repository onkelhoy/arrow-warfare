# Plan: Milestone 1, together in a lobby

Proposed, waiting for confirmation. Delete this file when every task is done.

1. ~~**Setup**: `CLAUDE.md`, README, package layout folders, repo URLs, `.gitignore` for `docs/`~~ done
2. ~~**App package `packages/game`**: a workspace package with a hello page, `npm start` shows it with every package's views~~ done
3. **Deploy**: `npm run pages` builds `docs/` with `@papit/static`, `pages.yml` deploys on push to `main`. Needs the GitHub repo. *Push.*
4. **Assets into the app**: copy root `asset/` (songs, logo) like cowboy's `sync-assets`, page icons and manifest
5. **Sound core + playlists**: `foundations/sound`, `asset/audio/songs.json` with `lobby` and `game`, shuffle, next on end, crossfade
6. **Settings + corner**: `foundations/core` settings (name, volumes, mute), `molecules/corner` with fullscreen, music and volume. *Push.*
7. **QR and share link**: copy `qr-code` and `share-link` from cowboy into `atoms/`
8. **Lobby network**: `foundations/net`, port cowboy's chord lobby and config, lobby name `arrow-warfare`
9. **Room + invite**: host creates a mesh room, invite link, `molecules/invite-dialog`, join by link with host wait
10. **Menu page**: name (saved), host a game, arriving by link joins (password prompt if needed). *Push.*
11. **Lobby page, open phase**: player list "name (colour)". The host gives each player a random unused colour and skin colour automatically
12. **Chat**: `molecules/chat`, everyone's chat, plain text
13. **Host panel**: tabs Invite, Game (name, password, max players), Players (ping, weak connection warning, kick), Rules (arrow count for now). Players see it read-only
14. **Lock**: the host locks and unlocks the room, nobody joins while locked
15. **Teams**: Teams tab when locked: create, add players from the list, delete. A team gets a random colour and all its members wear it. No teams = free for all
16. **Team names and team chat**: ideas, the first becomes the name, then voting on a little sign board. Team chat tab
17. **Ready and start**: ready toggles, the host can force a player or team after a delay, shared clock 3 2 1, then a placeholder play page. *Push.*

## Where we are
Task 1 done. Next: task 2, the `game/` app package.
