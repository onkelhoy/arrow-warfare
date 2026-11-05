# Arrow Warfare: backlog

A first person multiplayer archer game for phones. A fairytale meadow with trees, up to ~10 players, few arrows, last one standing wins. Minimal, cartoonish, silly: short players with big torsos and tiny legs.

This is the big picture, split into features. When we pick up work, the tasks for it go into `.claude/plan.md`. When that plan is done, `plan.md` is deleted and finished items here get ticked.

---

## Decisions (proposed, confirm or change)

| # | Topic | Proposal |
|---|-------|----------|
| D1 | **3D rendering** | `@papit/game-engine` only gives a raw WebGL2 layer, cameras and transforms. No meshes, lights or model loading. We build a small renderer here (`packages/foundations/render`): mesh, flat/toon material, one sun + ambient + fog, instancing, later shadows. If it turns out well it's a papit candidate (like qr-code was). |
| D2 | **Assets** | Low poly made **in code** first (trees, mushrooms, flowers, bow, arrow, players). Instant to tweak, tiny to download, colours driven by code. A `.glb` loader comes later if you want to model in Blender. |
| D3 | **Characters** | Rigid parts on bones (head, torso, arms, tiny legs as separate meshes on a `@papit/armature` rig), not a skinned mesh. Fits the style, cheap on phones, and IK still plants the feet. Skinning can come later if needed. |
| D4 | **Physics** | Our own, simple: arrows are a ballistic point with gravity and drag, hit test is the arrow segment against capsules per body part. Players are circles against tree trunks and the forest edge. Flat or gently rolling ground (heightmap). |
| D5 | **Who decides what** | Like cowboy: **the player who is hit decides the hit** (their pose is exact on their screen). **The host decides shared state**: arrow pickups, deaths, round start, end, win. If the host leaves, the oldest player takes over. |
| D6 | **Kill cam** | Every phone already receives everyone's poses and arrows, so each keeps a ring buffer of the last ~6 s. When you die it replays from there: slow motion of the shooter, then ride along the arrow, then the hit. No prediction needed. |
| D7 | **Networking** | Copy cowboy: one shared chord lobby `arrow-warfare` on the same signal server, a game is a `mesh` room carried by it. Poses at ~20 Hz unreliable, events reliable, shared clock for start. |
| D8 | **App layout** | `game/` at the root is the app: a workspace package (own `package.json`, `src/`, `tsconfig`) that pulls the pages together. `@papit/static` needs a package with a `src/`, so the root `package.json` can't be it directly. `npm run pages` builds it into `docs/`. Every page package also has its own `views/` to look at alone in the dev server. |
| D9 | **Languages** | English and Swedish through `@papit/translator`, like cowboy. |

---

## Package layout (atomic design)

```
game/                          the app: routes between pages, builds to docs/
packages/
  foundations/
    core/                      settings (saved name, volumes, mute, touch layout), config, ids, colours
    net/                       lobby (chord), room (mesh), clock, message types
    sound/                     Web Audio: sfx, playlists from songs.json, music dip
    render/                    WebGL2 renderer on game-engine: mesh, material, light, fog, instancing
  atoms/
    qr-code/  share-link/      copied from cowboy
    joystick/                  touch joystick element
    color-swatch/              a colour you can pick, shows taken
  molecules/
    invite-dialog/             QR + link + copy
    corner/                    fullscreen, music, volume, mute
    chat/                      lobby chat and dead chat
    touch-layout/              place your controls
  pages/
    menu/                      name, host or join
    lobby/                     players, colours, settings, ready, chat
    play/                      the 3D game (world, players, arrows, HUD, spectate, kill cam)
    results/                   end screen and stats
asset/audio/songs/             your songs
asset/audio/songs.json         { "lobby": [...], "game": [...] }
```

---

## Features

### F1. Project setup
- [ ] `CLAUDE.md`, README, GitHub repo + remote, correct repo URLs in `package.json`
- [ ] Folder layout above, `game/` app package
- [ ] `npm start` shows every package's views, `npm run pages` builds `docs/`
- [ ] `pages.yml`: push to `main` deploys to GitHub Pages
- [ ] Root `asset/` copied into the app (songs, logo), page icons and manifest

### F2. Sound
- [ ] Web Audio core: master, music, sounds gains, unlock on first tap
- [ ] `asset/audio/songs.json` with `lobby` and `game` arrays, plays them as playlists (shuffle, next on end, crossfade on switch)
- [ ] Music dip in slow motion and kill cam
- [ ] Sound effects: string stretch (rising with draw), release twang, whoosh (3D panned by distance), thunk in wood, thunk in ground, hit body, grunt, pickup, footsteps in grass, hop, heartbeat when low on energy, gnome throw-back
- [ ] Sources and licences in `CREDITS.md`

### F3. Settings and corner controls
- [ ] Saved on the device: name, volumes, mute, touch layout, sensitivity
- [ ] Corner buttons like cowboy: fullscreen, music on/off, volume
- [ ] Ask for landscape during play

### F4. Networking
- [ ] Lobby: port cowboy's chord lobby (oldest wins, race guard, merge, retry, waking server)
- [ ] Room: host creates a mesh room inside the lobby, invite link `?game=…&host=…&by=…`
- [ ] Invite dialog: QR code, link, copy/share button
- [ ] Join by link, wait for a sleeping host, clear errors
- [ ] Shared clock (pings), host migration
- [ ] Message types: hello/profile, colour claim, game info, lock, teams, team name idea/vote, rules, ready, force ready, chat, team chat, start, pose, shoot, hit, pickup, death, end
- [ ] Password through the webrtc network password, max players and the lock through the room's `accept`
- [ ] Ping per player from the clock pings
- [ ] Binary pose packing to keep 10 phones light (9 links each)
- [ ] Late joiner while a round runs waits in the lobby or spectates

### F5. Menu and lobby
The lobby has phases, and the host panel (tabs) is open the whole time.

**Phases**
1. **Open**: the host creates a game and invites. Players join with their name and pick a colour (taken colours are greyed out, the host settles clashes) and a skin colour. The list reads "henry (red)".
2. **Locked**: the host presses continue. Nobody new can join and the player list is final, so teams can be made.
3. **Ready**: everyone presses ready. After a short delay the host can force a player, or a whole team, to ready.
4. **Countdown**: the host starts, the shared clock gives 3, 2, 1, and play begins.

**Host panel, tabs**
- [ ] **Invite**: QR code, link, copy/share (hidden once locked)
- [ ] **Game**: game name, optional password, max players. More than 10 is allowed, for computers
- [ ] **Players**: the list, ping per player with a weak connection warning, kick
- [ ] **Teams** (only once locked): create a team, add players from the list, set the team colour, delete the team. No teams means free for all. One vs all is just a team of one against the rest
- [ ] **Rules**: see F6
- [ ] Players see every tab read-only, so everyone knows the rules

**Team names**
- [ ] Team members write name ideas. The first one becomes the name straight away
- [ ] Once there's more than one idea, members vote on them, shown like a little wooden sign or banner board. Most votes wins, and on a tie the earliest idea wins

**Chat** (plain text only)
- [ ] Everyone's chat in the lobby, all the time
- [ ] Team chat once you're in a team (a tab next to everyone's chat)
- [ ] During play: the dead chat (see F13)

**Other**
- [ ] Menu: name (saved), host a game, or arrive by link (asks for the password if there is one)
- [ ] The host can go back from locked to open (to let someone in late)

### F6. Rules (host, Rules tab)
- [ ] Arrows per player: 1–10 or unlimited (default 4)
- [ ] Trees in the field: none, few, many; map size: small, medium, large
- [ ] Friendly fire on or off (when there are teams)
- [ ] Damage: arcade (any body hit kills) or injuries (see F10)
- [ ] Gnomes on or off (arrows out of bounds come back)
- [ ] Time of day: by clock (default) or fixed
- [ ] Rounds: one, or best of N

### F7. Renderer (`render`)
- [ ] Mesh from arrays, flat shaded toon material with vertex colours
- [ ] Sun + ambient + hemisphere light, distance fog
- [ ] Instanced draws for grass, flowers, mushrooms, trees
- [ ] Sky dome with gradient, sun/moon, stars at night
- [ ] Shadows (one cascade, low res, can be turned off on weak phones)
- [ ] Grass sway in the vertex shader
- [ ] Quality setting (resolution scale, shadow on/off, grass density)
- [ ] Later: `.glb` loader

### F8. World
- [ ] Meadow ground (gentle heightmap), forest wall at the edge, scattered trees by setting
- [ ] Grass, flowers, mushrooms, stones, maybe a stump or a log for cover
- [ ] Seeded generation: the host sends a seed, every phone builds the same field
- [ ] Spawn points spread apart, by team
- [ ] Time of day atmosphere: night, dawn gold, noon, sunset (like cowboy), fireflies at night
- [ ] Collisions: trunks and the edge

### F9. Player and archery
- [ ] First person camera, see your own body, bow and arms
- [ ] Move fast when not aiming, slow while drawing
- [ ] Draw, hold, release: power by draw time, slight sway when held long
- [ ] Arrows: ballistic flight, stick into trees, ground and players
- [ ] Limited quiver (setting), pick up arrows from the ground, trees, bodies, and out of yourself
- [ ] Gnome return: an arrow out of bounds lands back near the edge a few seconds later, pointing in
- [ ] Hit zones: head, torso, left/right arm, left/right leg
- [ ] Other players: interpolated poses, aim direction, draw state

### F10. Injuries (when the setting is on)
- [ ] Head or torso: dead
- [ ] Arm: can still shoot, but the aim shakes and drawing is slower
- [ ] Leg: hop on the other leg, hopping costs energy, out of energy you sit down to rest
- [ ] Both legs: sit/crawl
- [ ] Pull an arrow out of yourself (and it goes in your quiver)

### F11. Characters and animation
- [ ] Silly body: big torso, short tiny legs, round head, colour = clothes, skin colour picked
- [ ] Armature rig with rigid parts
- [ ] Procedural walk: feet plant with IK, step when the foot is too far behind
- [ ] Hop, sit, draw pose, aim with the upper body following pitch
- [ ] Death: fall over (simple ragdoll or a tipping animation)
- [ ] Arrows stuck in bodies show and move with the bone

### F12. Touch controls
- [ ] Joystick element for moving
- [ ] Look by dragging anywhere else
- [ ] Drawing vs looking: **open, you're thinking about it.** Options: a draw button you place (hold to draw, drag on it to aim), or hold still on the look side to start drawing
- [ ] Place your own controls: an edit mode on the 2D layer to drag and resize them, saved
- [ ] Desktop: mouse look with pointer lock, WASD, hold mouse to draw

### F13. Spectate and kill cam
- [ ] Ring buffer of the last seconds of the match
- [ ] On death: slow motion of the shooter drawing, ride the arrow, see the hit
- [ ] Then spectate: follow a living player in third person, tap to switch
- [ ] Dead chat (only dead players and the lobby see it)

### F14. HUD
- [ ] Arrow count, energy, crosshair while drawing, injury marks
- [ ] Kill feed ("henry (red) shot anna (blue) in the leg")
- [ ] Players left / team status
- [ ] Countdown and banners

### F15. Results
- [ ] Winner, or draw
- [ ] Per player: arrows shot, hits, hit rate, kills, longest shot, picked up, damage taken, time alive
- [ ] Back to lobby, rematch

### F16. Phone polish
- [ ] Test on real phones, find the player limit
- [ ] Performance budget, quality presets
- [ ] Wake lock, reconnect on a short drop, rotate prompt
- [ ] PWA manifest and icons

---

## Milestones

1. **Together in a lobby** (F1, F2 playlists, F3, F4 lobby/room/invite, F5, F6 tab with what exists): open a link, pick names and colours, chat, the host locks, makes teams, everyone readies, 3 2 1. Deployed.
2. **A field to walk in** (F7 basics, F8, F12 basic, F9 movement): host starts, everyone walks the same meadow and sees each other.
3. **Shoot each other** (F9 archery, F14, F15 basic): arrows, hits, deaths, last one wins, results.
4. **Silly bodies** (F11, F10): rig, walk, hop, injuries.
5. **Drama** (F13, F2 sfx, F6 all settings): kill cam, spectating, all sounds, teams and modes.
6. **Polish** (F16, quality, glb if wanted).

---

## Open questions
- Draw vs look on touch (F12).
- Torso hit: dead at once, or two torso hits?
- Can you pick up arrows while drawing? Can the dead drop their quiver?
- Friendly fire: default on or off?
- With teams, do clothes take the team colour (and the player colour becomes a trim), or does the player keep their own colour?
- ~~Repo~~: github.com/onkelhoy/arrow-warfare, live at https://onkelhoy.github.io/arrow-warfare/ (static `--base /arrow-warfare/`).
