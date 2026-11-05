# Plan: views upgrade + milestone 2, "A field to walk in"

Host starts, everyone walks the same meadow and sees each other. Covers F7 basics, F8, F12 basic, F9 movement, plus the views and theme fix.

## Where we are
Confirmed, running all tasks. Next: task 9.

## Views and theme (first, small)
Found: every view except `game` puts `@import "@papit/theme"` in an inline `<style>`. The dev server only rewrites bare `@import`s in served `.css` files, so the browser asks for `views/x/@papit/theme`, gets a 500, and the hardcoded `#9fd6f0` sky blue shows instead of the theme.

- [x] **1. Views to the papit templates, one package at a time, nothing removed.** Each view becomes `views/experiment/` as `@papit/create`'s component templates make it. UI packages follow the **web-component** template: `index.html` with an `h1` and `section`s, a real `style.css` that imports `@papit/theme` with the template's background, and `main.ts` setting up the translator. Elements with a tag (`aw-qr-code`, `aw-share-link`, …) get a `pap-codeblock` live preview. Mount-function packages (chat, corner, invite-dialog, menu, lobby) keep their live demo inside a section. 3D packages (render, world, play) follow the **game** template: a full canvas with the dotted theme background and a `GameEngine({ query: "canvas", theme: true })`. devDependencies `@papit/theme`, `@papit/translator`, `@papit/codeblock` where used. `papit.type` is set to the template type (`web-component`, `browser`, `game`) instead of `library`. Every new package from here on is made with `npm run create`. No showcase.
- [x] **2. Note in bugs.md (papit section).** An inline `<style>@import "@papit/theme"</style>` isn't rewritten by the dev server, only `.css` files are, so it 500s quietly.

## Milestone 2
- [x] **3. `render` foundation** (`npm run create`, game template, `foundations/render`). WebGL2 on a game-engine `Layer3D` and its `Camera`: a mesh from position/normal/colour arrays, a flat-shaded toon material with vertex colours, sun + ambient + hemisphere light, distance fog, instanced draws. View: a few shapes in light and fog with the orbit camera.
- [x] **4. Sky and grass sway.** A gradient sky dome with a sun disc. A grass shader that sways in the vertex shader. No shadows or stars yet.
- [x] **5. Low-poly models in code** (in `render` or a `models` part of `world`): tree (a few kinds), grass tuft, flower, mushroom, stone, log, and a placeholder player (round head, big torso, in their colour). Silly bodies proper come in milestone 4. View: all models side by side.
- [x] **6. `world` foundation** (`foundations/world`). Seeded: the same seed builds the same field on every phone. Gentle heightmap ground, forest wall at the edge, trees by setting, grass, flowers, mushrooms, stones, a log or stump. Spawn points spread apart, by team. Collision data: trunk circles and the edge. View: a meadow from a seed you type in, orbit camera.
- [x] **7. Time of day.** Palettes for night, dawn gold, noon and sunset (copied from cowboy's atmosphere) driving sky, sun, fog and light colours, from the clock by default. Fireflies at night.
- [x] **8. Rules: trees and map size.** Rules tab gets trees (none, few, many) and map size (small, medium, large). They go into `Rules` and into the world.
- [ ] **9. `joystick` atom** (`aw-joystick`, made with `npm run create`). Touch joystick that appears where you put your thumb on its side, gives a direction and strength. View with a codeblock preview.
- [ ] **10. Controls.** Touch: joystick on the left, look by dragging anywhere else. Desktop: pointer lock mouse look and WASD. Sensitivity saved in settings. Drawing the bow is milestone 3 and stays open (F12 question).
- [ ] **11. First person movement.** Camera at eye height, follows the ground, a little head bob. Fast walk (slow-while-drawing comes with the bow). Circle collision against trunks and the forest edge.
- [ ] **12. Net: seed, spawns and poses.** On start the host sends the seed and each player's spawn. Poses (position, yaw, pitch) go 20 times a second on an unreliable data channel (`maxRetransmits: 0`), packed binary. Other players are drawn as their placeholder in their colour, interpolated, with their name above them.
- [ ] **13. Play page.** The placeholder is replaced by the 3D scene, HUD free for now. Corner buttons stay, game playlist plays. Ask for landscape on phones. The host can still go back to the lobby, and everyone follows.
- [ ] **14. Milestone wrap.** Build `docs/`, a local playwright run with several tabs walking together, check the frame rate in a phone-sized window. Tick the backlog, notes for the owner, bugs.md updated, push to `main` (deploys), the owner tests live.

## Decided along the way
- Grass sway is taken into M2 (cheap, makes the field feel alive). Shadows and stars wait.
- Poses go on a raw `@papit/webrtc` media channel, events stay on the reliable room messages.
- The sky has a moon and stars already (cheap in the sky shader), the time of day turns them on.
- Models live in `world` (`models.ts`), next to the field that places them.
- `Field.spawns` returns a record, not a `Map` (the bundle-ts bug in bugs.md).
