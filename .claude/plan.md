# Plan

## Where we are
Branch `fixes-guns-spawn-audio`: tasks 1-6 done, not pushed. Owner reviews and tests on phones, then merges to `main` (deploys). Next: task 7 once tested, 8-9 need the owner's input.

## Tasks
1. [x] Tavern music on phones: one audio element for all music, a tavern takes it over (bugs.md).
2. [x] Spawns random over the whole map each round, spread out, teams together, clear of obstacles.
3. [x] Bots in teams: bots live in the lobby, the host adds them to teams like players.
4. [x] Guns aim: shots follow the sights (they went high), zeroed per gun with drop, spread from the hip and on the move, bloom on quick shots, recoil per gun.
5. [x] Gun buttons: trigger further from the edge, aim further off; layout moves the group or each button alone.
6. [x] Hip fire ring showing the spread.
7. [ ] Networking on `@papit/game-network`: today `net` uses `@papit/webrtc` directly, with its own admission, rejoin and relay in `game/src/session.ts`. Swap once on a branch, test with 2+ phones before merging.
8. [ ] Castle mode per team, capture the flag. Needs input: map layout, rules, win condition, respawns.
9. [ ] New weapons (sniper, ...). Needs input: which ones, scope zoom, per-gun `GUNS` numbers, models (FPS Guns pack?).

## Tuning (live test)
- `GUNS` in `packages/foundations/archery/src/guns.ts`: zero, hip, aimed, moving, bloom, kick, climb, side.
- `BALLISTICS` in `flight.ts`: bullets are slower than real so drop shows on these maps (rifle ~35 cm under at 100 m).
- `GUN_FILES[].sight/rear` in `world/src/guns.ts`: the sight line, read off the models.
- `GUN_PLACE` in `core/src/settings.ts`: default trigger, aim and reload places.
