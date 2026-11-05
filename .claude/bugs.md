# Bugs

Known and suspected bugs, with the workaround in use. Papit ones get reported to the owner, not patched here.

## Papit

### bundle-ts writes no types for lib types in public signatures
- **What:** a public signature using `Iterable` or `Map` makes api-extractor throw "Unable to follow symbol". `@papit/build` says nothing, exits 0, and `lib/bundle.d.ts` is missing. Packages that depend on it then fail with "has no exported member".
- **Seen in:** `core` (`pickUnused(used: Iterable<number>)`), `net` (`Room.pings: Map`).
- **Workaround:** arrays instead of `Iterable`, a private `Map` behind `pingOf(peer)`.
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

### A CSS-only change is skipped by the build (suspected)
- **What:** after editing only `src/style.css` in `play`, `npx @papit/build` said "skipped" and the bundle kept the old CSS. `--force` built it.
- **Workaround:** `npx @papit/build --force` after a CSS-only change.

### `declare global` tag names are dropped from `bundle.d.ts`
- **What:** `HTMLElementTagNameMap` from a component's `declare global` isn't in its bundled types (none of ours have it), so `document.createElement("aw-joystick")` is a plain `HTMLElement` in other packages.
- **Workaround:** a cast, `as Joystick`.

## Ours

### A late guest's first join attempt logged "join timed out"
- **What:** in the playwright run, the late guest (game locked) logged one "could not join: join timed out" and then got in on the next try and was turned away correctly. It may be a slow first join through the lobby, or related to the papit issue above.
- **Workaround:** none needed yet, the retry handles it. Watch for it on real phones.

### Host leaving ends the game
- **What:** there's no host migration yet. When the host leaves, every guest goes back to the menu ("The host left").
- **Workaround:** none, planned in F4.

### Not yet tested
- Real phones, the public signal server (only a local one was used), and networks that need TURN (only STUN is set up).
