# Plan: milestone 4, silly bodies

F11, F10, F14 energy and damage, F14b play demo, F6 damage and time of day, F15 damage taken.

## Where we are
Confirmed by the owner, all tasks running. Next: task 1.

## Tasks
1. **Rules: damage and time of day.** `damage: arcade | injuries` (default injuries), `time: clock | night | dawn | noon | sunset` (default clock). Core state, session, the Rules tab, translations. Play lights the meadow by the rule.
2. **`foundations/rig`**: the silly body as rigid parts on an `@papit/armature` rig. Big torso, round head, short arms, tiny legs, feet. Leg IK (thigh and shin to the foot, knees forward), arm IK to the bow and the string. Hit capsules come from the bones, each part gives its frame so stuck arrows ride along. Its own view.
3. **Motion**: a procedural walk (feet planted, a foot steps when it's too far behind, on the ground's height), hopping on one leg, sitting, crawling, the draw pose with the upper body following the pitch, falling over when dead.
4. **Others on the rig**: the stand-ins go. Hits test the rig's capsules, stuck arrows move with the bone. The pose carries wounds and sitting (one more byte).
5. **Injuries** (`archery/wounds.ts`, when the rule is on): head or torso kills. An arm shakes the aim and draws slower. A leg makes you hop, which costs energy. Out of energy you sit down to rest. Both legs: sit and crawl. The host turns lethal hits into deaths, the kill feed says who hit whom where.
6. **Pull an arrow out of yourself**: a button (E on the keyboard) when one is stuck in you. It goes into your quiver, the wound stays.
7. **HUD**: an energy bar, injury marks on a little body, and the damage vignette that gets darker and a little redder with each hit taken.
8. **Results**: hits taken per player.
9. **Play demo view**: the game inside a `pap-codeblock` preview, with controls for time of day, seed, rules (arrows, trees, size, damage), bots, and injure me (arms, legs, heal).
10. **Wrap up**: a headless run, backlog ticked with notes for review, commit, push.
