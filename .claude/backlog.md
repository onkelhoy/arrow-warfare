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
| D8 | **App layout** | `packages/game` is the app: it pulls the pages together, `npm run pages` builds it into `docs/`. It can't sit at the root: papit's build and `@papit/static` only find packages inside `packages/`. Every page package also has its own `views/` to look at alone in the dev server. |
| D9 | **Languages** | English and Swedish through `@papit/translator`, like cowboy. |

---

## Package layout (atomic design)

```
packages/
  game/                        the app: routes between pages, builds to docs/
  foundations/
    core/                      settings (saved name, volumes, mute, touch layout), config, ids, colours
    net/                       lobby (chord), room (mesh), clock, message types
    sound/                     Web Audio: sfx, playlists from songs.json, music dip
    render/                    WebGL2 renderer on game-engine: mesh, material, light, fog, instancing
  atoms/
    qr-code/  share-link/      copied from cowboy
    joystick/                  touch joystick element
  molecules/
    invite-dialog/             QR + link + copy
    corner/                    fullscreen, music, volume, mute
    chat/                      lobby chat and dead chat
    touch-layout/              place your controls
  pages/
    menu/                      name, host or join
    lobby/                     players, host panel, teams, ready, chat
    play/                      the 3D game (world, players, arrows, HUD, spectate, kill cam)
    results/                   end screen and stats
asset/audio/songs/             your songs
asset/audio/songs.json         { "lobby": [...], "game": [...] }
```

---

## Features

### F1. Project setup
- [x] `CLAUDE.md`, README, GitHub repo + remote, correct repo URLs in `package.json`
- [x] Folder layout above, `game/` app package
- [x] `npm start` shows every package's views, `npm run pages` builds `docs/`
- [x] `pages.yml`: push to `main` deploys to GitHub Pages
- [x] Root `asset/` copied into the app (songs, logo), page icons and manifest

### F2. Sound
- [x] Web Audio core: master, music, sounds gains, unlock on first tap
- [x] `asset/audio/songs.json` with `lobby` and `game` arrays, plays them as playlists (shuffle, next on end, crossfade on switch)
- [ ] Music dip in slow motion and kill cam
- [ ] Sound effects (stand-ins made in code: creak, twang, thunk in wood and ground, body hit, kill thunk, panting, pickup, empty): string stretch (rising with draw), release twang, whoosh (3D panned by distance), thunk in wood, thunk in ground, hit body, grunt, pickup, footsteps in grass, hop, heartbeat when low on energy, panting
- [ ] Sources and licences in `CREDITS.md`

### F3. Settings and corner controls
- [x] Saved on the device: name, volumes, mute, look sensitivity, bow button place
- [x] Corner buttons like cowboy: fullscreen, music on/off, volume
- [x] Ask for landscape during play

### F4. Networking
- [x] Lobby: port cowboy's chord lobby (oldest wins, race guard, merge, retry, waking server)
- [x] Room: host creates a mesh room inside the lobby, invite link `?game=…&host=…&by=…`
- [x] Invite dialog: QR code, link, copy/share button
- [x] Join by link, wait for a sleeping host, clear errors
- [ ] Shared clock (pings) (done), host migration (not yet: when the host leaves, the game ends for everyone)
- [ ] Message types: hello/profile, colour assignment, game info, lock, teams, team name idea/vote, rules, ready, force ready, chat, team chat, start, pose, shoot, hit, pickup, death, end
- [x] Password, max players, the lock and kicks: app level, the host answers each guest's hello with `state` or `denied {reason}` (see notes)
- [x] Ping per player from the clock pings
- [x] Binary pose packing to keep 10 phones light (9 links each): 33 bytes on a lossy `pose` channel
- [ ] Late joiner while a round runs waits in the lobby or spectates

### F5. Menu and lobby
The lobby has phases, and the host panel (tabs) is open the whole time.

**Phases**
1. **Open**: the host creates a game and invites. Players join with their name. Nobody picks a colour: the host's game quietly gives everyone a random unused colour and a random skin colour. The list reads "henry (red)".
2. **Locked**: the host presses continue. Nobody new can join and the player list is final, so teams can be made.
3. **Ready**: everyone presses ready. After a short delay the host can force a player, or a whole team, to ready.
4. **Countdown**: the host starts, the shared clock gives 3, 2, 1, and play begins.

**Host panel, tabs**
- [x] **Invite**: QR code, link, copy/share (hidden once locked)
- [x] **Game**: game name, optional password, max players. More than 10 is allowed, for computers
- [x] **Players**: the list, ping per player with a weak connection warning, kick
- [x] **Teams** (only once locked): create a team, add players from the list, delete the team. Each team gets a random unused colour and every member wears it, replacing their own. No teams means free for all. One vs all is just a team of one against the rest
- [ ] **Rules**: see F6
- [x] Players see every tab read-only, so everyone knows the rules

**Team names**
- [x] Team members write name ideas. The first one becomes the name straight away
- [x] Once there's more than one idea, members vote on them, shown like a little wooden sign or banner board. Most votes wins, and on a tie the earliest idea wins

**Chat** (plain text only)
- [x] Everyone's chat in the lobby, all the time
- [x] Team chat once you're in a team (a tab next to everyone's chat)
- [ ] During play: the dead chat (see F13)

**Other**
- [x] Menu: name (saved), host a game, or arrive by link (asks for the password if there is one)
- [x] The host can go back from locked to open (to let someone in late)

### F6. Rules (host, Rules tab)
- [x] Arrows per player: 1–10 or unlimited (default 4)
- [x] Trees in the field: none, few, many; map size: small, medium, large
- [x] Friendly fire: always on for now, maybe a setting later
- [ ] Damage: arcade (any body hit kills) or injuries (see F10)
- [ ] Time of day: by clock (default) or fixed
- [ ] Rounds: one, or best of N

### F7. Renderer (`render`)
- [x] Mesh from arrays, flat shaded toon material with vertex colours
- [x] Sun + ambient + hemisphere light, distance fog
- [x] Instanced draws for grass, flowers, mushrooms, trees
- [x] Sky dome with gradient, sun/moon, stars at night
- [ ] Shadows (one cascade, low res, can be turned off on weak phones)
- [x] Grass sway in the vertex shader
- [ ] Quality setting (resolution scale, shadow on/off, grass density)
- [ ] Later: `.glb` loader

### F8. World
- [x] Meadow ground (gentle heightmap), forest wall at the edge, scattered trees by setting
- [x] Grass, flowers, mushrooms, stones, maybe a stump or a log for cover
- [x] Seeded generation: the host sends a seed, every phone builds the same field
- [x] Spawn points spread apart, by team
- [x] Time of day atmosphere: night, dawn gold, noon, sunset (like cowboy), fireflies at night
- [x] Collisions: trunks and the edge

### F9. Player and archery
- [x] First person camera, see your own bow and arms (the body comes with the rig)
- [x] Move fast when not aiming, slow while drawing
- [x] Draw, hold, release: power by pull (touch) or time (space), heavier look while drawn. Held too long: growing sway, tunnel vision, the arrow slips (where you point + sway), then panting
- [x] Arrows: ballistic flight, stick into trees, ground and players
- [x] Limited quiver (setting), pick up arrows by tapping near them on screen, standing close (about 1.5 m, not while drawing) from the ground, trees, bodies
- [ ] Out of yourself (with injuries)
- [x] Arrows flying out stick in the forest wall at the edge (gnomes moved to `finesse.md`)
- [x] Hit zones: head, torso, left/right arm, left/right leg
- [x] Other players: interpolated poses, aim direction, draw state, bow held low or up, panting

### F10. Injuries (when the setting is on)
- [ ] Head or torso: dead
- [ ] Arm: can still shoot, but the aim shakes and drawing is slower
- [ ] Leg: hop on the other leg, hopping costs energy, out of energy you sit down to rest
- [ ] Both legs: sit/crawl
- [ ] Pull an arrow out of yourself (and it goes in your quiver)

### F11. Characters and animation
- [ ] Silly body: big torso, short tiny legs, round head, colour = clothes (team colour in a team), random skin colour
- [ ] Armature rig with rigid parts
- [ ] Procedural walk: feet plant with IK, step when the foot is too far behind
- [ ] Hop, sit, draw pose, aim with the upper body following pitch
- [ ] Death: fall over (a tipping stand-in is in, the real one with the rig)
- [ ] Arrows stuck in bodies show and move with the bone

### F12. Touch controls
- [x] Joystick element for moving
- [x] Look by dragging anywhere else
- [x] Drawing vs looking: a bow button near the top, right of center. Pull down to draw (distance is power), the same thumb aims, back to the button cancels, let go shoots. The joystick stays as it is (ideas in `finesse.md`)
- [x] Place your own controls: drag and resize the bow button (settings), saved
- [x] Desktop: mouse look with pointer lock, WASD, hold space to draw, click to pick up

### F13. Spectate and kill cam
- [ ] Ring buffer of the last seconds of the match
- [ ] On death: slow motion of the shooter drawing, ride the arrow, see the hit
- [ ] Then spectate: follow a living player in third person, tap to switch
- [ ] Dead chat (only dead players and the lobby see it)

### F14. HUD
- [x] Arrow count. No crosshair: a marker only on a hit (red on a kill), with shake and vibration
- [x] Kill feed ("henry (red) shot anna (blue) in the leg")
- [x] Players left / team status
- [x] Countdown and banners (you died, you win, a draw)
- [ ] Energy, injury marks (milestone 4)

### F15. Results
- [x] Winner, or draw
- [x] Per player: arrows shot, hits, hit rate, kills, longest shot, picked up, time alive
- [ ] Damage taken (with injuries)
- [x] Back to lobby, rematch

### F16. Phone polish
- [ ] Test on real phones, find the player limit
- [ ] Performance budget, quality presets
- [ ] Wake lock, reconnect on a short drop, rotate prompt
- [ ] PWA manifest and icons

---

## Milestones

1. **Together in a lobby** (F1, F2 playlists, F3, F4 lobby/room/invite, F5, F6 tab with what exists): open a link, give a name, get a colour, chat, the host locks, makes teams, everyone readies, 3 2 1. Deployed.
2. **A field to walk in** (F7 basics, F8, F12 basic, F9 movement): host starts, everyone walks the same meadow and sees each other.
3. **Shoot each other** (F9 archery, F14, F15 basic): arrows, hits, deaths, last one wins, results.
4. **Silly bodies** (F11, F10): rig, walk, hop, injuries.
5. **Drama** (F13, F2 sfx, F6 all settings): kill cam, spectating, all sounds, teams and modes.
6. **Polish** (F16, quality, glb if wanted).

---

## Notes from milestone 1 (for the owner to review)
- Bugs, suspected bugs and their workarounds: `.claude/bugs.md`.
- The password lives only on the host, it's never sent out. A wrong one keeps the guest connected and asks again.
- Ready only works once locked. Everyone ready starts the 3 2 1 by itself (one player alone too, handy for testing). The host can force ready 15 s after locking.
- Selects in the Game and Rules tabs are native `<select>`: papit has no select yet.

## Notes from milestone 2 (for the owner to review)
- New packages, all made with `npm run create`: `foundations/render` (WebGL2 toon renderer), `foundations/world` (the seeded meadow, models, time of day), `atoms/joystick`.
- Every view now follows the papit create templates (`views/experiment/`), the theme loads from a real `style.css`. Web components get codeblock previews, the 3D packages a full canvas.
- The host picks a new seed at every countdown. Spawns aren't sent: every phone works them out from the seed and the host's player list.
- Each player's light follows their own clock, like cowboy. `?palette=night|dawn|noon|sunset` picks one.
- The canvas draws at most 1.5 device pixels per CSS pixel, phones at 3x draw at half resolution. Grass is cut to 70% on touch screens.
- Tested in headless Chrome: three tabs through lobby, 3 2 1, walking (poses all on the lossy channel), back to the lobby. A phone sized touch run: joystick, drag to look, the turn-sideways prompt. 60 fps on an M3 at 3x. Not yet on a real phone.
- Look speed is in the settings dialog (corner).
- The models are stand-ins (a body and a head), the rig comes in milestone 4.

## Notes from milestone 3 (for the owner to review)
- New packages: `foundations/archery` (draw, fatigue, flight, hit zones, stats), `atoms/bow-button`, `molecules/touch-layout`, `pages/results`. Sound effects are made in code (`sound/src/sfx.ts`) until real ones come.
- **Bow button:** pull down sets the power, sideways turns. At full pull it anchors and the thumb aims both ways (so pulling down doesn't tip the view). Back on the button lets the bow down. Placed in settings → "Place the bow button" (touch only).
- **Fatigue:** steady for 2 s at a strong draw, then sway grows, tunnel vision from 4.5 s, the arrow slips at 7.5 s, then 3.2 s of panting. Rest gets it back twice as fast. Numbers are in `archery/src/draw.ts`.
- **Shots:** full draw 52 m/s, weakest 14 m/s, a flat full shot from standing lands about 25 m out. Every phone flies every arrow from the shared clock.
- **Hits:** the one hit decides and tells everyone, the host turns it into a death. Every hit kills for now. The host waits 2.2 s after a death before calling the end, so a last trade is a draw. A round started with one side (testing alone) doesn't end by itself.
- **Pickup:** within 1.6 m sideways, a tap within about 14% of the screen height of the arrow (nearest wins), the host settles who got it.
- **Vibration** is Android only. iPhone gets the shakes and sounds.
- My own right hand isn't drawn, at a full draw it's right at the eye. Feathers take the shooter's colour.
- Tested headless: shooting, hits on the stand-ins (the play view judges them), pickup, slip and panting, the bow button with real touches, and two browsers through the real app: shot, hit decided by the guest, death, results, rematch. Not on a real phone yet.

## After milestone 3
- Drawing hand in settings (right by default, saved): left handed mirrors the bow, others see it.
- The bow leans over when up and stands nearly upright at full draw.
- White trails behind flying arrows, mine longer and brighter, widening with distance so they stay visible.
- Unlimited arrows on localhost, for developing.
- The bow leans right by default (left handed: left). A shot leaves from the nocked arrow, which points at the middle of the view 30 m out.
- My trail stays whole for the flight (up to 1.8 s) and fades out together once the arrow lands.
- Hits feel like one thump that springs back (a punch) instead of a rattle. The tunnel vision has no blur (it would cost every frame).

## Open questions
- Torso hit: dead at once, or two torso hits? (milestone 3: any hit kills)
- Can the dead drop their quiver?
- ~~Repo~~: github.com/onkelhoy/arrow-warfare, live at https://onkelhoy.github.io/arrow-warfare/ (static `--base /arrow-warfare/`).
