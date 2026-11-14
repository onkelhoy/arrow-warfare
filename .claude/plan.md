# Plan

## Where we are
On `main`, not pushed. Done since: no crosshair, rifle sights visible, QR scanner audio session fix (suspected, bugs.md), lives + bot take over, kill cam rework. Owner tests on phones. Next: task 1 once tested, 2-3 need the owner's input.

## Tasks
1. [ ] Networking on `@papit/game-network`: today `net` uses `@papit/webrtc` directly, with its own admission, rejoin and relay in `game/src/session.ts`. Swap once on a branch, test with 2+ phones before merging.
2. [ ] Castle mode per team, capture the flag. Needs input: map layout, rules, win condition, respawns.
3. [ ] New weapons (sniper, ...). Needs input: which ones, scope zoom, per-gun `GUNS` numbers, models (FPS Guns pack?).

## Tuning (live test)
- `GUNS` in `packages/foundations/archery/src/guns.ts`: zero, hip, aimed, moving, bloom, kick, climb, side.
- `BALLISTICS` in `flight.ts`: bullets are slower than real so drop shows on these maps (rifle ~35 cm under at 100 m).
- `GUN_FILES[].sight/rear` in `world/src/guns.ts`: the sight line, read off the models.
- `GUN_PLACE` in `core/src/settings.ts`: default trigger, aim and reload places.
- `KILLCAM` in `packages/pages/play/src/cinema.ts`: lead up, release, ride along speeds (arrow vs bullet), close shot, strike.
- `BOT_RESPAWN`, `READY_LATEST` in `play.ts`: when the dead come back.
