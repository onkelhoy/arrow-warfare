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
- Real phones, the public signal server (only a local one was used), and networks that need TURN (only STUN is set up).

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
