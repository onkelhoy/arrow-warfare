# @arrow-warfare/joystick

`<aw-joystick>`, a touch joystick. Its box is where a thumb can start, the base appears under the thumb and the knob follows it. Past the edge the base follows the thumb, so turning back answers at once.

```html
<aw-joystick style="position: fixed; inset: 0 55% 0 0"></aw-joystick>
```

| Member | Description |
| --- | --- |
| `x`, `y` | -1..1, `x` right and `y` forward (up on screen) |
| `strength` | 0..1 |
| `radius` | How far the knob goes, CSS pixels, default 56 |
| `active` | A thumb is on it (reflected) |
| `move`, `end` events | `{ x, y }`, bubbling and composed |

One pointer at a time. Other touches pass by, so the rest of the screen can look around.
