# Plan: bugs, then F18 to F22

Confirmed by the owner on 2026-11-10. Backlog: F18 engine, F19 maps, F20 models, F21 guns, F22 bots.

## Where we are
Branch `bugs` confirmed by the owner and merged to `main`. Now on `engine`, task 5.

## Branches (owner's call, overrides "everything on main" for this plan)
- One branch per group below so each can be reverted alone: `bugs`, `engine`, `maps`, `models`, `guns`, `bots`.
- Each branch starts from `main` after the previous one is merged, in this order. Commit locally as tasks finish.
- When a branch is done: report to the owner, who tests it. Merge it to `main` and push only once the owner OKs it (a push deploys).

## Branch `bugs`
1. [x] **Pickup loses to looking.** A tap only counts if it moves less than 12px and lets go within 350ms (`controls.ts:10`), and the arrow has to be within 60px of the tap on screen (`play.ts:842`). Allow more slack before a tap becomes a look. A tap on the ground below the horizon picks up the nearest arrow within reach (`REACH` in `arrows.ts:12` stays as it is). Otherwise fall back to the nearest one on screen.
2. [x] **Stuck strafing.** Likely cause: the joystick ignores new touches while `pointer !== null` (`joystick/component.ts:58`). If one finger lift is missed, it keeps its last x/y for good. That can happen when it's hidden while held (`play.ts:866`, on death) or when iOS gets many touches at once. Fix: a new pointerdown takes the joystick over. Reset on hide, on death, on `visibilitychange` and on blur. Desktop: keys stick if the keyup lands while an input has focus (`controls.ts` `handlekey` returns early), so clear the key when focus goes to an input.
3. [x] **The shot cancels when the thumb doesn't move.** The owner can see the X away from the thumb, so the X position isn't the cause. Reading the code, a release with no movement should shoot. Most likely suspect: the release arrives as `pointercancel`/`lostpointercapture` (`handlecancel` forces `shoot = false`, `bow-button/component.ts:102`). Possibly related: `moveAside` translates the captured element. First add a temporary on-screen log of the bow button's events and test on the owner's phone. Fix: decide only by the last thumb position: on the X it cancels, anywhere else it shoots, whatever event ends the press. Also check that a short hold isn't just under `MIN_SHOT` (.15, about 135ms of `KEY_DRAW`).
4. [x] **Unlimited arrows by default:** `RULES_DEFAULT.arrows` 4 → 0 (`core/src/state.ts:53`).

## Branch `engine` (F18)
5. [ ] **Papit audit.** Compare papit with our own code and write a short report in the backlog notes: `@papit/game-mesh` (glTF loader, skins, animation sampling) against `render/mesh.ts`; `@papit/vector`/`matrix` (float64 now) against `render/math.ts`; `@papit/gjk`/`rigidbody` against `field.collide` and arrow hits; what `@papit/game-engine` offers now that we don't use. Report papit gaps to the owner, don't patch them.
6. [ ] **Do the swaps worth doing.** The first one is loading `.glb` (vertex colours, no textures) into our renderer, since F19 to F21 need it.

## Branch `maps` (F19)
7. [ ] **Asset pipeline:** a script that runs Blender headless (`/Applications/Blender.app`) to turn FBX/OBJ into glb with vertex colours only, no textures. Sources:
   - `~/Developer/3d/store/nature`: low poly, untextured. Skip every `_Snow` model and the winter/dead trees for now. It has Corn, Wheat, Lilypad, Rock_Moss, Willow, Birch, Bush and more.
   - `~/Developer/games/pap-adventure/packages/game/assets/asset/models/generated`: buildings (watchtower, farmhouse, cabin, towers, town houses), props, foliage, town.
   - Not the textured packs (Farm/Medieval/Nature MegaKit). Owner wants everything in the same low poly look.
   - Check sizes and triangle counts for phones.
8. [ ] **Lobby options (Rules):** map field / farm / city; more props; buildings; watch towers. Synced like the other rules.
9. [ ] **Collision:** buildings, towers, rocks and props block walking (`field.collide`) and arrows (`wall` landings), using boxes or convex shapes (gjk if F18 says so).
10. [ ] **Field map:** today's meadow plus nature trees, rocks, bushes, and small ponds with lily pads.
11. [ ] **Farm map:** farmhouse, barn-like buildings, fences, corn and wheat rows. Animals later (owner's call, Farm Animals by Quaternius is in store).
12. [ ] **City map:** pap-adventure town buildings along streets and squares.
13. [ ] **Watch towers** placed by the option: climbable, a high point to shoot from.

## Branch `models` (F20)
14. [ ] **Softer shading:** neighbouring faces step too dark. Raise the ambient/hemisphere floor and soften the sun bands (`render/src/shaders.ts:55`). Keep it subtle.
15. [ ] **New players** in place of floating arms: nicer, same short silly style. First person arms plus the body others see, still rigid parts on the `@papit/armature` rig (D3), working with ragdoll, wounds and the kill cam.

## Branch `guns` (F21)
16. [ ] **Weapon rule** in game setup: bow / revolver / rifle, one weapon for everyone per game.
17. [ ] **Gun models:** convert Revolver and Rifle from `~/Developer/3d/store/Animated FPS Guns - Jun 2018` (FBX) to glb, with their shooting and reload animations (`game-mesh` animation sampling).
18. [ ] **Ballistics:** bullets with real muzzle speeds and gravity drop. The rifle stays flat for longer than the revolver. Hits reuse `hitBody`, and the victim decides (D5).
19. [ ] **Ammo and reload:** magazine size and reload time per gun, with a HUD count. Decide how pickups work with guns (probably no pickups, unlimited magazines).
20. [ ] **Sounds:** copy `shot1`, `shot2`, `reload` and `fly1-5` (bullets passing close) from `~/Developer/games/cowboy/packages/game/asset/audio`.
21. [ ] **Touch controls:** the bow button becomes a fire button (tap to fire, no draw), plus a reload button. Desktop: click or space to fire, R to reload.

## Branch `bots` (F22)
22. [ ] **Rules:** bot count 0–100 and difficulty easy / normal / hard. The host runs the bots as fake players (own ids, colours, names), sending poses and events like a real player, so guests need no changes. Playing alone with bots must work.
23. [ ] **Bot movement:** wander, take cover behind trees and buildings, pick a target, pick up arrows when low.
24. [ ] **Bot aim:** lead the target and allow for drop, for the bow and both guns. Aim error, reaction time and draw time come from difficulty.
25. [ ] **Performance:** cheaper bodies far away, staggered AI updates, fewer poses sent for distant bots. Find what a phone host manages. Warn above that in the lobby, the hard cap stays 100.

## Suggested models (owner picks per session)
- Opus 5.5: 5, 6, 9, 18, 22–24
- Fable 5.2: 14, 15 (the visual taste work), and backup for 23–24
- Sonnet 5.5: 1–3, 7, 8, 10–13, 16, 17, 19–21, 25
- Haiku 5.5: 4, 20
