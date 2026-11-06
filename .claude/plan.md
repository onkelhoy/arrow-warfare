# Plan: ragdoll deaths

## Where we are
Task 1 done. Next: task 2.

## Tasks
1. **Eyes.** Two eyes on the head (`rig` + `bodies`), crossed "x" eyes when dead. Also in the kill cam.
2. **Ragdoll package.** `foundations/ragdoll`: cowboy's verlet points and sticks in 3D, dt-safe (slow motion), the ground from the field's height, sinking in a little. `views/` drops a body on hills.
3. **Body on the ragdoll.** On death the rig's pose becomes ~12 points (pelvis, chest, head, shoulders, elbows, hands, hips, knees, feet). The arrow pushes the hit part along its direction, by its power. Parts are drawn from the points. The tip over and the T pose go. Bodies rest after a while (no more physics, no twitch).
4. **Same fall everywhere.** Seeded from what every phone has (pose, hit part, direction, power), fixed steps, so others' corpses fall the same as on the victim's phone. Arrows stuck in the body follow its parts. Hit tests on corpses use the parts.
5. **Kill cam on the ragdoll.** The victim stays alive in the film until the arrow is in, then the ragdoll throws them in slow motion. The hit and the visible arrival line up in time.
6. **Who sees a kill cam.** Only the dead (their own death, and the one they watch) and, at the end, the last victim and the winner. Everyone else goes straight to the end. Nothing from a film shows in anyone's live view.

Milestone: push after 6, then you test live.
