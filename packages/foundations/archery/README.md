# @arrow-warfare/archery

Arrows and bows, with no screen or network in it, so every phone works it out the same.

| Part | What it does |
| --- | --- |
| `Draw` | The bow in my hands: pull (touch) or hold (space), fatigue: sway → tunnel vision → the arrow slips → panting. Gives the sway, how heavy the look is, the walking speed |
| `launch`, `fly` | A `Shot` (origin, direction, speed, shared time) flown in fixed steps with gravity and drag. Sticks in the ground, trunks, logs, stumps and the forest wall |
| `hitBody`, `CAPSULES` | Hit zones on the stand-in body: head, torso, arms, legs. `toWorld`/`toLocal` move points between a body and the world, tipped over or not |
| `Tally`, `standing` | Stats per player, and who's still standing, for the end of a round |

The view plots arcs per power and shows the draw and fatigue while holding space.
