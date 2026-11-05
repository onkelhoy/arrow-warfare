# Plan: Milestone 1, together in a lobby

Proposed, waiting for confirmation. Delete this file when every task is done.

1. **Setup**: `CLAUDE.md`, README, package layout folders, repo URLs, `.gitignore` for `docs/`
2. **App package `game/`**: a workspace package with a hello page, `npm start` shows it with every package's views
3. **Deploy**: `npm run pages` builds `docs/` with `@papit/static`, `pages.yml` deploys on push to `main`. Needs the GitHub repo. *Push.*
4. **Assets into the app**: copy root `asset/` (songs, logo) like cowboy's `sync-assets`, page icons and manifest
5. **Sound core + playlists**: `foundations/sound`, `asset/audio/songs.json` with `lobby` and `game`, shuffle, next on end, crossfade
6. **Settings + corner**: `foundations/core` settings (name, volumes, mute), `molecules/corner` with fullscreen, music and volume. *Push.*
7. **QR and share link**: copy `qr-code` and `share-link` from cowboy into `atoms/`
8. **Lobby network**: `foundations/net`, port cowboy's chord lobby and config, lobby name `arrow-warfare`
9. **Room + invite**: host creates a mesh room, invite link, `molecules/invite-dialog`, join by link with host wait
10. **Menu page**: name (saved), host a game, arriving by link joins. *Push.*
11. **Lobby page**: player list "name (colour)", colour picking with taken colours, host settles clashes, skin colour
12. **Lobby chat**: `molecules/chat`
13. **Ready and start**: ready toggles, host starts when all ready, shared clock countdown, goes to a placeholder play page. *Push.*

## Where we are
Nothing built yet. Next: task 1 once confirmed.
