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

## Ours

### A late guest's first join attempt logged "join timed out"
- **What:** in the playwright run, the late guest (game locked) logged one "could not join: join timed out" and then got in on the next try and was turned away correctly. It may be a slow first join through the lobby, or related to the papit issue above.
- **Workaround:** none needed yet, the retry handles it. Watch for it on real phones.

### Host leaving ends the game
- **What:** there's no host migration yet. When the host leaves, every guest goes back to the menu ("The host left").
- **Workaround:** none, planned in F4.

### Not yet tested
- Real phones, the public signal server (only a local one was used), and networks that need TURN (only STUN is set up).
