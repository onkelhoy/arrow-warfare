## Where we are
Town, sound and buildings round (owner's feedback 2026-11-10, screenshots of the city). Tasks 1-7 done (2026-11-10), not pushed. Task 8 waits for the owner.

### town, sound, buildings
1. [x] Lamps quiet: no crackle from street lamps, double lamps, stone lanterns.
2. [x] Fire pits crackle: a real crackling sound (pops and a soft hiss) instead of the current one.
3. [x] Tavern music on the game clock: one tavern song at a time for the whole game, the same song and place in it on every phone; walking away and back picks it up where the time has got to. Every tavern in reach plays it in sync, so between two it's the same song. The game's music stays: at the edge of a tavern's reach it drops fast to about half while the tavern comes in a little louder than it, then blends slowly, only right at the tavern is it the tavern alone.
4. [x] Building collision files: each building gets `<name>.collision.json` next to its model, a box (8 corners) around its walls at waist height (no posts, awnings, stairs), made once by a script, editable by hand. The field blocks walking and arrows with it instead of the model's bounds.
5. [x] Outside stairs: walkable up to their landing (a ramp in the collision file), the house itself still solid.
6. [x] My own footsteps: a better sound (soft, varied, not repetitive), stone on streets and squares, grass elsewhere.
7. [x] Town centres: the round paved disc lies over the streets, no flicker where they overlap.
8. [ ] (skipped for now) Town: the owner likes the large city and its wide streets. More dynamic streets instead, using the irregular patterns more; no right angles needed.

### birds

- [x] Birds (owner's idea 2026-11-10, a plan): crows circling high and landing on roofs and treetops now and then, small birds on the ground flying up when someone comes near or shoots close by and landing on branches and roofs, an owl in a tree at night. Their calls in 3D from the bird. A hit drops it and silences it (the owl too). 10-20 a phone in one batch, flapping by a simple sway; each phone its own birds (not synced, no traffic) to begin with.
- [ ] Bots played by the nearest player instead of the host, to spread the work: an owner per bot that moves (handing over wounds, quiver, goal, target), the owner judging hits on it, phones taking bot messages from the current owner. Only if a phone host struggles: 100 bots' thinking is 0.8 ms a frame on a laptop, drawing their bodies likely costs more.
