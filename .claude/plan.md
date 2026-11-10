# Plan: what's left of F21 and F23

From the plan confirmed on 2026-11-10 (F18 to F23); the rest is done and ticked in the backlog.

## Where we are

`bots` done (22-25, notes in the backlog), PR open for the owner to test and merge. Left: 21k, and 21a-21g to confirm.

## Branches (owner's call, overrides "everything on main" for this plan)

- One branch per group below so each can be reverted alone: `guns` for 21k, `environment` for 21a-21g.
- Each branch starts from `main` after the previous one is merged, in this order. Commit locally as tasks finish.
- When a branch is done: report to the owner, who tests it. Merge it to `main` and push only once the owner OKs it (a push deploys).

## Branch `guns` (F21)

21k. [ ] **The arrow leaves above the nocked arrow:** the flying arrow (and trail) starts above where the nocked one points. Make the shot leave exactly from the nocked arrow along its line.

## Branch `environment` (F23), unconfirmed

21a. [ ] **Name tags rule (unconfirmed, owner asked 2026-11-10):** a lobby option to hide other players' name tags, harder game ("hardcore" or "name tags: on / off"). Synced like the other rules. Owner to confirm and pick the branch.
21b. [ ] **Shoot through tower railings (unconfirmed, owner 2026-11-10):** the watch tower's fence/railing boxes stop arrows; let shots pass between the rails (thinner blocks, or the railing walk-only).
21c. [ ] **Walk into ponds (unconfirmed):** ponds are shallow, they shouldn't block walking. Maybe slower and lower in the water.
21d. [ ] **Bushes block walking (unconfirmed):** today you can stand inside a bush and hide. Bushes block walking (arrows still go through, `soft`).
21e. [ ] **More Plant_1 and Plant_4 (unconfirmed, owner 2026-11-10):** Plant_4 barely shows up today, more of both.
21f. [ ] **Lily pads above the water (unconfirmed):** the water covers the leaves (owner's screenshot on the Desktop). Raise them to the water's surface.
21g. [ ] **Lamps and lit windows (unconfirmed, owner 2026-11-10):** more lamp posts and lamps. Cheap glow first: lamp glass, lanterns, some windows emissive. Then a few nearest point lights (~8) in the toon shader that light the ground and walls around them, with a setting to turn them off (or tied to quality).
