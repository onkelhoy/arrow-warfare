# Plan: milestone 5, Drama

Intent: a death plays like a short film. You leave your body, see the shot that got you from cinematic angles, then you (and whoever watched you) follow your killer. The winning shot is slow motion for everyone, ending on the winners with horns. Sounds become real files you can swap. Matches can be best of N.

## Where we are
All tasks confirmed by the owner. Tasks 1–7 done (sounds in the film and circle call names like `whoosh`, `grunt`, `fanfare` that don't exist yet: silent until tasks 9–10). Next: task 8. Sound files: put them in `packages/foundations/sound/asset/sfx/` (served at `/sfx/...`), not the root `asset/`: the views only see package assets. `Sound.register` already picks a random file per name. Restart the dev server after changing translations (it caches them). The play view has "A bot shoots me" (`debug.shootMe(by, at)`) for testing the kill cam.

## Tasks
1. [x] **Replay buffer**: every phone keeps the last ~8 s of poses (mine too), shots and hits (with the hit's time). No new traffic, except the hit gets its time.
2. [x] **Pierce**: a strong arrow goes deeper, through the body and out the other side (on the bone, and in the kill cam). Weak ones stay shallow.
3. [x] **Blood**: a small splatter of red particles on every hit, live and in the replay. Slow motion makes it hang and drift.
4. [x] **Death sequence**: spirit leaves (the camera drifts up and out of my head, I see my body, pale) → release (cinematic angle on the shooter, slow) → flyby (low side angle, whoosh) → follow (behind the arrow, closing in) → strike (cinematic angle on me, pierce and blood). About 6–7 s, tap to skip. Whoever spectates me sees the same. Music dips.
5. [x] **Spectate**: after the sequence I follow my killer in third person, and everyone who watched me does too. Tap (or click) to switch, teammates first. A watched player dying plays their sequence, then follow their killer.
6. [x] **Winning shot**: the last kill's sequence for everyone, winner included. Then a low angle looking up at the winner, circling. The surviving teammates walk up beside the shooter first. Horns rise from the sides, a trumpet plays, "RED WINS" (team name, or the player's name) rises over them. Then the results. A draw shows the sequence, then "Draw".
7. [x] **Kill count** on the HUD, next to the arrows.
8. [ ] **Dead chat**: a chat only the dead see, during play.
9. [ ] **Sound files**: a dev script (`bin/sfx.mjs`) renders every sound to `asset/audio/sfx/*.wav`, with versions (`whoosh-1..4` and so on). `sfx.json` lists them, a random version plays. Replace a file to change a sound. The body impact gets softer and less like a drum.
10. [ ] **New sounds**: string stretch rising with the draw, whoosh, footsteps in grass, hop, grunt, heartbeat on low energy, the fanfare (horns and trumpet).
11. [ ] **3D sound**: others' twangs, thunks, steps, grunts and passing whooshes panned by direction and quieter with distance.
12. [ ] **Rules: rounds and friendly fire**: one round, or best of 3 or 5. Between rounds a score line over the 3 2 1, then a new meadow. Results show round wins and stats added up. Friendly fire on (default) or off: off, a teammate's arrow flies through you.
13. [ ] **Twitches**: dead bodies twitch now and then, less and less.
14. [ ] **Close out**: `CREDITS.md`, tick the backlog, notes for review, push.
