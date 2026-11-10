# Plan: bugs, then F18 to F22

Confirmed by the owner on 2026-11-10. Backlog: F18 engine, F19 maps, F20 models, F21 guns, F22 bots.

## Where we are

Branch `environment` done with 26 (papit/audio, ambience), 27a-27c (rain, splashes, lightning) and 28 (bullet hits). PR open, the owner tests and merges. Left: 21k and 21a-21g (to confirm). Crickets now a cleaned recording (`bin/crickets.mjs`). `bots`: 22-25 done, for the owner to test. 25b to confirm.

## Branches (owner's call, overrides "everything on main" for this plan)

- One branch per group below so each can be reverted alone: `bugs`, `engine`, `maps`, `models`, `guns`, `bots`.
- Each branch starts from `main` after the previous one is merged, in this order. Commit locally as tasks finish.
- When a branch is done: report to the owner, who tests it. Merge it to `main` and push only once the owner OKs it (a push deploys).

## Branch `guns` (F21)

21j. [x] **Kill cam: slow motion sounds and the buggy feel:** sounds in the kill cam slowed with the film (lower and stretched, a slow heartbeat/whoosh under it). Find what feels buggy (jumps between shots, camera snaps, bullets far too fast to follow) and fix it.
21k. [ ] **The arrow leaves above the nocked arrow:** the flying arrow (and trail) starts above where the nocked one points. Make the shot leave exactly from the nocked arrow along its line.

## Branch `bots` (F22)

Reviewed 2026-11-10. Missing from the first plan: guests *do* need changes (they drop shots, hits and poses not sent by their owner), bots must not be treated as peers, bots need a body the host simulates, the host judges hits on them.

22. [x] **Roster and rules:** lobby "Bots" 0–100 and difficulty easy / normal / hard, synced like the other rules. `Player.bot` set; the host adds them at the countdown (names, colours, skins, spread over the teams) and drops them after the round. Bots don't count toward `max`. Everything that treats players as peers skips them (state publish, poses, pings, ready, kick). Spawns spread for 100+. Results mark bots. Alone with bots starts and ends a round.
22b. [x] **Guests take bot messages from the host:** `shoot`, `hit`, `drop`, `stash` with a bot's id accepted when the host sent them. Bot poses in one batched fast packet (ids and poses).
22c. [x] **A bot's body on the host:** position, yaw, pitch, draw, wounds (`Wounds`, so hop, sit and crawl work), quiver or gun with ammo. Walks with `field.collide`/`height`. The host judges hits on bots, sends their deaths, drops and stashes, records them in the replay (kill cam works for bot kills). The play view uses real bots (count and difficulty) in place of its stand-ins.
23. [x] **Bot movement:** wander, take cover behind trees and buildings, pick a target in sight (a ray past trees and walls), pick up arrows when low. No ladders for now.
24. [x] **Bot aim:** lead the target and allow for drop, for the bow and both guns. Aim error, reaction time and draw time come from difficulty.
25. [x] **Performance:** cheaper bodies far away, staggered AI updates, fewer poses sent for distant bots. Find what a phone host manages. Warn above that in the lobby, the hard cap stays 100.

25b. [ ] **Bots played by the nearest player (nice to have, owner 2026-11-10):** each bot run by whoever is closest instead of the host, to spread the work. Needs an owner per bot that moves (handing over wounds, quiver, goal, target), the owner judging hits on it, and phones taking bot messages from the current owner. Measured first: 100 bots' thinking takes 0.8 ms a frame on a laptop (about 4 ms on a phone, a guess); drawing 100 bodies is likely the bigger cost.

Done notes: bots tested in the play view (`?bots=8&skill=hard&weapon=rifle`), not yet between two phones. Hit rates in a small meadow: easy ~13%, normal ~15%, hard ~18% with the bow, normal rifle ~30%. Tuning is in `SKILL` (play/src/bots.ts). The lobby warns above 30 bots (`BOTS_WARN`), a guess until a phone host is tried.

Open (my defaults unless the owner says otherwise): bots stay the same through a match's rounds; the host leaving ends the game anyway, bots go with it.

## Branch `environment` (F23)

21a. [ ] **Name tags rule (unconfirmed, owner asked 2026-11-10):** a lobby option to hide other players' name tags, harder game ("hardcore" or "name tags: on / off"). Synced like the other rules. Owner to confirm and pick the branch.
21b. [ ] **Shoot through tower railings (unconfirmed, owner 2026-11-10):** the watch tower's fence/railing boxes stop arrows; let shots pass between the rails (thinner blocks, or the railing walk-only).
21c. [ ] **Walk into ponds (unconfirmed):** ponds are shallow, they shouldn't block walking. Maybe slower and lower in the water.
21d. [ ] **Bushes block walking (unconfirmed):** today you can stand inside a bush and hide. Bushes block walking (arrows still go through, `soft`).
21e. [ ] **More Plant_1 and Plant_4 (unconfirmed, owner 2026-11-10):** Plant_4 barely shows up today, more of both.
21f. [ ] **Lily pads above the water (unconfirmed):** the water covers the leaves (owner's screenshot on the Desktop). Raise them to the water's surface.
21g. [ ] **Lamps and lit windows (unconfirmed, owner 2026-11-10):** more lamp posts and lamps. Cheap glow first: lamp glass, lanterns, some windows emissive. Then a few nearest point lights (~8) in the toon shader that light the ground and walls around them, with a setting to turn them off (or tied to quality). 

26. [x] **Sound on papit/audio and ambience:** 26a sound on `@papit/audio` (buses, 3D effects, ears on the camera, "Nature" volume); 26b ambience rendered by `bin/ambience.mjs` (crickets, wind, frogs, crackle loops, bird and owl calls); 26c `Ambience` in the game (beds by time of day, calls around you, nearest 4 emitters: ponds, firepits, lamps); 26d kill cam dips the ambience (papit `Voice` can't change rate while playing, so it isn't slowed).
27a. [x] **Rain (owner 2026-11-10):** a lobby checkbox "Rain". Streaks round the camera (`Rain` in world), a grey wet light and clouds (`wet`), no fireflies, rain loop, fewer crickets and birds, wet footsteps. Lightning lights the sky every 14-40 s, thunder comes after by distance. A view: `world/views/rain`.
27b. [x] **Rain splashes:** tiny sparks where drops land near me, on the ground and roofs (`field.roof`).
27c. [x] **Rain settings:** drops by quality (700 / 1300 / 2200), "Rain splashes" its own setting.
28. [x] **Bullet hits (owner 2026-11-10):** a puff of tiny particles where a bullet hits (dirt, wood chips, stone dust by what it hit) and a small hit mark left on the surface, fading after a while.
