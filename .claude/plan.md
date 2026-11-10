# Plan: what's left of F21 and F23

From the plan confirmed on 2026-11-10 (F18 to F23); the rest is done and ticked in the backlog.

## Where we are

`bots` merged. `environment` (21a-21g) done on its branch, for the owner to test (notes in the backlog). Left: 21k on `guns`.

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
