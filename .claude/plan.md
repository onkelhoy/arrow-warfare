# Plan

## Where we are
On `main`. Lives, bot take-over, killcam rework: confirmed, in progress.

## Decisions
- Lives: 1 (default, as before), 2, 3, 5, unlimited. Respawn ~3 s after a death while lives are left, random clear spot by the team.
- Take over teammate bots: lobby option, team modes only. After my lives run out I take a living teammate bot (its place, arrows, wounds). Dying as it puts me back in the queue.
- Queue: always on. Simultaneous deaths are ordered randomly. Spectating shows the place in line.
- Killcam: 1) shooter's first person ~5 s real time, 2) cinematic at the release, slowing, 3) camera above and behind the arrow/bullet (bullets much slower than arrows), skipped under ~8 m, 4) very slow hit, cinematic death. Tap skips.

## Tasks
1. [x] Lives option and respawning.
2. [x] Take over teammate bots, with the queue.
3. [x] HUD: lives left, "took over" in the feed, queue place.
4. [ ] Killcam phase 1: shooter's view (aim in the pose, KEEP 10 s).
5. [ ] Killcam phases 2-4.
6. [ ] Killcam tuning constants together.
