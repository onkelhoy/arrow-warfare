# Plan: what's left of F21 and F23

From the plan confirmed on 2026-11-10 (F18 to F23); the rest is done and ticked in the backlog.

## Where we are

`bots` merged. `environment` 21a-21g done, owner looked: OK. 23a-23k (sound, buttons, weather) done on `environment`, for the owner to test. Then 21k on `guns`.

## Branches (owner's call, overrides "everything on main" for this plan)

- One branch per group below so each can be reverted alone: `guns` for 21k, `environment` for 21a-21g.
- Each branch starts from `main` after the previous one is merged, in this order. Commit locally as tasks finish.
- When a branch is done: report to the owner, who tests it. Merge it to `main` and push only once the owner OKs it (a push deploys).

## Branch `guns` (F21)

21k. [ ] **The arrow leaves above the nocked arrow:** the flying arrow (and trail) starts above where the nocked one points. Make the shot leave exactly from the nocked arrow along its line.

## Branch `environment` (F23), confirmed 2026-11-10, done

21a. [x] **Name tags rule:** a lobby option to hide other players' name tags, harder game ("hardcore" or "name tags: on / off"). Synced like the other rules.
21b. [x] **Shoot through tower railings:** the watch tower's fence/railing boxes stop arrows; let shots pass between the rails (thinner blocks, or the railing walk-only).
21c. [x] **Walk into ponds:** ponds are shallow, they shouldn't block walking. Maybe slower and lower in the water.
21d. [x] **Bushes block walking:** today you can stand inside a bush and hide. Bushes block walking (arrows still go through, `soft`).
21e. [x] **More Plant_1 and Plant_4:** Plant_4 barely shows up today, more of both.
21f. [x] **Lily pads above the water:** the water covers the leaves (owner's screenshot on the Desktop). Raise them to the water's surface.
21g. [x] **Lamps and lit windows:** more lamp posts and lamps. Cheap glow first: lamp glass, lanterns, some windows emissive. Then a few nearest point lights (~8) in the toon shader that light the ground and walls around them, with a setting to turn them off (or tied to quality).

## Branch `environment`, round 2 (confirmed 2026-11-10)

23a. [x] **No wind:** the wind loop goes, it sounds like waves.
23b. [x] **Rain sound:** the owner's recording (rain.mp3) as a seamless 24 s loop (`bin/loop.mjs`), the generated one sounded like ice.
23c. [x] **Crickets:** in bursts with quiet gaps, about half as loud.
23d. [x] **Gun buttons:** their own default place, low near the bottom right corner.
23e. [x] **Bow button:** default a bit further right (0.6 to about 0.7), for long phones.
23f. [x] **Tavern music:** `Fill the Cup` and `Let the Fiddler Leap` (owner's) as a tavern list, played in 3D from each tavern; close up the game music dips so it takes over, blends back walking away.
23g. [x] **Thunder and lightning:** the thunder is silent, find why. A jagged bolt to the horizon, the sky flashing, a big low rolling thunder 1-4 s later, a bit scary.
23h. [x] **Gun hit dust:** after the fast chips, the dust keeps spinning and drifting about. Dust rises slowly and fades, no spin.
23i. [x] **Crow and owl:** the owner's recordings (Downloads) split into calls, cleaned, levelled; owl replaced, crows a new day call.
23j. [x] **Rain starts in sheets (owner, 2026-11-10):** the drops were made round the camera before it got to the player; the column fills again wherever the eye jumps.
23k. [x] **Bluer rain at night:** bluer drops, less glow.
