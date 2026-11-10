# Bugs

Known and suspected bugs, with the workaround in use. Papit ones get reported to the owner, not patched here.

## Papit

### bundle-ts writes no types for lib types in public signatures
- **What:** a public signature using `Iterable` or `Map` makes api-extractor throw "Unable to follow symbol". `@papit/build` says nothing, exits 0, and `lib/bundle.d.ts` is missing. Packages that depend on it then fail with "has no exported member".
- **Seen in:** `core` (`pickUnused(used: Iterable<number>)`), `net` (`Room.pings: Map`), `play` (a `Set` and a `Map` in the `debug` object, so its `bundle.d.ts` was stale since milestone 3).
- **Workaround:** arrays instead of `Iterable`, a private `Map` behind `pingOf(peer)`, a loose `PlayDebug` type for play's debug object.
- **To check:** whether the build is missing `lib/bundle.d.ts`. To see the real error: `node -e 'import("@papit/bundle-ts").then(async m => console.log(await m.tsBundle(new Map([["force",true]]), process.cwd())))'` in the package.

### A join refused by `accept` times out instead of rejecting (suspected)
- **What:** a guest joining a `ParentBootstrap` room whose host's `accept` returns false seemed to get "join timed out", not `rejected`. So the guest kept retrying for `HOST_WAIT` (2 min).
- **Workaround:** `accept` isn't used. Everyone gets in, and the host answers the guest's `hello` with `denied {reason}` (locked, full, kicked, password).
- **Not confirmed:** I didn't dig into papit to find the cause.

### An inline `@import "@papit/theme"` 500s in the dev server
- **What:** the server rewrites bare `@import`s only in served `.css` files. In an inline `<style>` the browser asks for `<view>/@papit/theme`, gets a 500, and the theme never loads (our views showed the hardcoded sky blue).
- **Workaround:** views have a real `style.css`, as the create templates do.

### Game engine layers have no pixel ratio setting
- **What:** a layer always sizes its canvas to the element in device pixels. On a phone at 3x that's a lot of pixels for a 3D scene, and there's no way to ask for fewer.
- **Workaround:** the play page sets the layer's `setting.width`/`height` by hand (at most 1.5 device pixels per CSS pixel) and calls `resize()` on window resize. Shrinking the canvas in CSS with a scale transform didn't work: the size the observer reported came out far too small.

### The npm `@papit/create` (0.0.20) game template is older than the repo's
- **What:** its view `style.css` has no `width`/`height` on `body` and `canvas`, so the canvas stays 300×150. The template in the papit repo has them.
- **Workaround:** the render view uses the repo template's CSS.

### The build sometimes skips a changed package
- **What:** after editing only `src/style.css` in `play`, `npx @papit/build` said "skipped" and kept the old bundle. In milestone 3 it happened after a `.ts` edit made with `sed -i` too (maybe the change check looks at something sed doesn't touch, like the mtime it keeps). `--force` built it.
- **Workaround:** `npx @papit/build --force` in the package.

### `declare global` tag names are dropped from `bundle.d.ts`
- **What:** `HTMLElementTagNameMap` from a component's `declare global` isn't in its bundled types (none of ours have it), so `document.createElement("aw-joystick")` is a plain `HTMLElement` in other packages.
- **Workaround:** a cast, `as Joystick`.

### `@papit/create` 0.0.20 templates need trimming
- **What:** a new package comes with `tests/`, playwright dev dependencies, `private: false`, `publish: true`, React peer deps and a `views/.../main.js`. Ours have none of that.
- **Workaround:** trimmed by hand after creating (see the four new packages of milestone 3).

### Chord merge can leave a node outside the ring (reported to the owner)
- **What:** after `network.merge`, `handleUnify` (`chord/index.ts`) looks up its place through the bridge once. If that lookup fails or answers itself, the node stays its own successor while linked to the others, and nobody retries. Keys sent from it are delivered to itself, so the registry said "unknown" for good. Seen when the host reloaded and two guests each made a lobby at once.
- **Workaround:** a lobby alone in its ring joins the lower one by a plain join instead of merging. After a merge, a node still its own successor while linked leaves and joins again (`Lobby.move`).

## Ours

### Synthetic pointer events break `setPointerCapture`
- **What:** in a headless run a made up `PointerEvent` makes `setPointerCapture` throw. Real touches are fine.
- **Workaround:** the look surface wraps it in a try.

### A late guest's first join attempt logged "join timed out"
- **What:** in the playwright run, the late guest (game locked) logged one "could not join: join timed out" and then got in on the next try and was turned away correctly. It may be a slow first join through the lobby, or related to the papit issue above.
- **Workaround:** none needed yet, the retry handles it. Watch for it on real phones.

### Host leaving ends the game
- **What:** there's no host migration yet. When the host leaves, every guest goes back to the menu ("The host left").
- **Workaround:** none, planned in F4.

### Not yet tested
- Real phones, the public signal server (only a local one was used), and networks that need TURN (`TURN` in `net/config.ts` is empty until Open Relay credentials are added).

## To check on phones (milestone 5)
- Sounds are synthesised stand-ins: footsteps and grunt may sound thin. Replace the wavs. (The win fanfare is now real kazoo audio in `aw-fanfare`.)
- Rounds: between rounds the phase goes play → locked → countdown; check nobody is left behind on the lobby.
- Friendly fire off is judged on each victim's phone; a teammate's arrow still sticks in the ground behind you.
- Twitches use `Math.random`, so a corpse twitches differently on each phone (only looks).

### Guest has to click ready twice
- **What:** as a guest in the menu/lobby, ready needs two clicks to register. Not investigated yet (menu logic comes after the redesign).
- **Workaround:** click twice.

## pap-tabs: tall panel squeezes the tab list away (papit, reported)
`pap-tabs` is a flex column and its `tablist` has `overflow-x: auto`, so its min height is 0. In a short box (lobby on a phone) a tall panel like Rules shrinks the tabs to nothing and there's no way back. Workaround: `.aw-lobby-tabs::part(tablist) { flex: none; }` in the lobby style. Fix belongs in papit (`flex: none` on the tablist).

### Picking up loses to looking around
- **What:** a touch is only a tap under 12px and 350ms, and the arrow has to be within 60px of it on screen, so trying to pick up often turns into a look.
- **Fixed (bugs branch, confirmed by the owner):** tap slack 28px / 500ms; a tap below the horizon with no arrow near it on screen picks the nearest arrow in reach.

### Stuck running sideways (suspected cause)
- **What:** after pressing a lot (shooting), the player keeps strafing. The joystick ignores new touches while it still thinks a pointer is down, so one missed finger lift locks it.
- **Fixed (bugs branch, confirmed by the owner):** a new touch takes the joystick over; it lets go on hide, death, blur and a hidden tab; keys clear when an input gets focus.

### Shot cancels when the thumb doesn't move
- **What:** hold the bow button and let go without moving: the shot cancels, though the X is far away. Cause not found by reading. Suspect the release arrives as pointercancel/lostpointercapture.
- **Fixed (bugs branch, confirmed by the owner):** likely iOS taking a still thumb for a long press and cancelling the pointer. Now `touchstart` is prevented on the button, and a cancelled touch waits for the real lift, then only where it lifts decides. Also: a release under `MIN_SHOT` (about 135ms of hold) still lets the bow down without a shot, by design.

### The gltf view never started its engine (fixed on maps)
- **What:** `render/views/gltf` from the engine branch had no `engine.start()`, so it showed an empty canvas. Fixed, and the new `world/views/models` gallery starts it.

### The rig view's camera looked from under the ground (fixed on maps)
- **What:** it aimed at y 0.6 while the hills there are higher. It now aims at the ground's height.

### Name tags show through buildings
- **What:** labels are placed on screen with no test for what's in between, so in the town you can see where someone hides. Not fixed, ask the owner if it should be (a ray against `field.blocks`).

### `preloadModels(Iterable)` broke the world build (the papit bundle-ts bug above)
- **Workaround:** it takes an array.
