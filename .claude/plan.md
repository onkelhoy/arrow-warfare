# Plan: milestone 3, shoot each other

## Where we are
Confirmed by the owner, nothing started. Next: task 1.

## How it works (agreed)
**Touch.** The joystick stays as it is (left thumb, appears under the thumb). The **bow button** sits near the top, a bit right of center.
- Thumb on the button, **pull down to draw**. Pull distance is the power, full at about a third of the screen height.
- While drawn, the same thumb aims, and the look is **heavier** (slower, damped): fine control, and an archer who isn't paying attention is an easier target.
- **Let go to shoot.** Thumb back on or near the button lets the draw down with no shot, then it's safe to let go.

**Keyboard and mouse.** Mouse looks (pointer lock), WASD and arrows walk, **hold space** to draw (power by time), let go to shoot. Same heavier look while drawn. Clicking picks up arrows.

**Fatigue.** Holding a strong draw too long:
1. light sway that grows (never wild),
2. tunnel vision (darker, blurred edges) and more sway,
3. **the arrow slips**: it flies where you point at that moment plus the sway offset, so a bit random within a radius,
4. panting: a few seconds of no drawing, a heaving view, slower walking, audible breathing, then recovery.

**Feel.** No crosshair. A small marker only on a hit. Shooting: tiny kick. Hit: shake + short vibration. Kill: red marker, the biggest shake, strong vibration, deep thunk. Vibration is Android only (iPhone Safari has none).

**Rules for now.** Any hit kills (zones are detected and named, what each zone does comes with injuries in milestone 4). Friendly fire always on. Arrows flying out stick in the forest wall at the edge.

## Tasks
1. [ ] **Draw state and fatigue** (play): one draw model fed by the bow button or space. Pull or time as power, heavier look while drawn, slower walking, sway → tunnel vision → slip → panting, cancel.
2. [ ] **Bow button** (new atom `atoms/bow-button`, with a view): top center right, pull down to draw, aim with the same thumb, back to the button to cancel. Look drag and joystick keep working.
3. [ ] **Place your controls** (new molecule `molecules/touch-layout`, with a view): edit mode from settings to drag and resize the bow button, saved on the device.
4. [ ] **First person bow animation** (world models + play): low poly bow and arms in view, the string pulls back and the limbs bend with the draw, it follows the sway, shakes with fatigue, bobs while running, sits low when not aiming, kicks and snaps on release, lowers smoothly on cancel.
5. [ ] **Other players' bow and stance** (net pose + play): draw amount and fatigue stage in the pose packet. On the stand-in bodies the bow is held low while running and raised while aiming, bent by the draw, the aim pitch shows, panting shows as a heave. Full arms and walk come with the rig (milestone 4).
6. [ ] **Arrow flight** (new `foundations/archery`): gravity and a little drag, nose first, sticks into trunks, the forest wall and the ground, the same on every phone.
7. [ ] **Shooting over the net**: reliable `shoot {id, from, direction, speed, time}` on the shared clock. Every phone flies the same arrow and catches up for lag.
8. [ ] **Hits and zones**: capsules for head, torso, arms, legs. The one hit decides and sends `hit {arrow, zone}`. The arrow sticks in the body and moves with it.
9. [ ] **Deaths and the round** (host): any hit kills, friendly fire on. The host confirms deaths and calls the end: last player or team standing, or a draw. Dead players tip over and can look around from where they fell.
10. [ ] **Pickup by tapping** (play, host): tap or click a stuck arrow within about 3 m (ground, tree, body), only when not drawing. Desktop shows a tiny hand in the middle when aiming at one in reach, touch shows nothing. A tap without a drag counts, looking never picks up. The host settles who got it first. Quiver size from the rules.
11. [ ] **Hit feel** (play + sound): hit marker, red kill marker, shakes, vibration. Sounds made in code for now: string stretch, twang, thunk in wood or ground, body hit, kill thunk, panting.
12. [ ] **HUD**: arrow count, players or teams left, kill feed with the zone, win or lose banner.
13. [ ] **Results page** (new `pages/results`, with a view): winner or draw, per player shots, hits, hit rate, kills, longest shot. Back to the lobby or rematch.
14. [ ] **Test and ship**: 3 tabs shooting each other on desktop and phone sized touch, notes for review, backlog ticked, push to `main`.
