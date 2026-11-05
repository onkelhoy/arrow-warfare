# Arrow Warfare

A first person multiplayer archer game for phones, built on [papit](https://github.com/onkelhoy/papit). A fairytale meadow with trees, a handful of short silly archers with big torsos and tiny legs, very few arrows. Pick your arrows back up, hop on one leg when you're hit, and be the last one standing.

Play it at <https://onkelhoy.github.io/arrow-warfare/>.

## How a game goes

1. Give yourself a name and host a game. Share the QR code or link.
2. Friends open the link and give a name. Everyone gets a random colour.
3. The host locks the game, makes teams if they want (no teams is free for all) and sets the rules, such as how many arrows everyone gets.
4. Everyone presses ready, then 3, 2, 1.
5. Shoot, pick arrows up, survive. The dead watch the shot that got them in slow motion, then spectate and chat.
6. The end screen shows who won and everyone's stats.

## Run it

Needs Node 20 or newer.

```bash
npm install
npm start          # dev server with every package's views
```

To play across browsers on your own machine, run a local signal server too:

```bash
npm run signal     # ws://localhost:3001
```

Then add `?signal=ws://localhost:3001` to the page address. Invite links keep it.

## Commands

| Command | What it does |
| --- | --- |
| `npm start` | Dev server with live rebuild, shows every package's views |
| `npm run signal` | Local signal server on port 3001 |
| `npm run build` | Builds every package |
| `npm run pages` | Builds the site into `docs/`, the same build GitHub Pages runs |

## How it works

- **Networking** works like [CowboyGame](https://github.com/onkelhoy/CowboyGame): every player joins one shared chord network on the signal server, a lobby nobody sees. A game is a mesh room carried inside it, so the signal server never sees the game itself.
- **3D** runs on WebGL2 through `@papit/game-engine`, with low poly models made in code.
- **Songs** live in `asset/audio/songs/`. `asset/audio/songs.json` says which play in the lobby and which in the game.

## Layout

See [packages/README.md](packages/README.md). `packages/game` is the app that brings the pages together.

## Put it online

Every push to `main` builds the site with `@papit/static` and publishes it to GitHub Pages.
