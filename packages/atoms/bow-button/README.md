# @arrow-warfare/bow-button

`<aw-bow-button>`, the bow on a touch screen. Thumb on it, pull down: the distance is the draw, full at `range` pixels. Sideways the thumb turns. At full draw it anchors and the thumb aims both ways. Back on the button (within `cancel` pixels) lets the bow down, then letting go doesn't shoot.

| Member | Description |
| --- | --- |
| `range` | Pixels of pull for a full draw, default 120 |
| `cancel` | Pixels around the start that let the bow down, default 26 |
| `pull`, `anchored` | 0..1, and whether full draw was reached |
| `active`, `disabled` | Reflected, `disabled` only dims it |
| `drawstart`, `drawmove`, `drawend` | `{ pull, dx, dy, anchored }`, `dx`/`dy` are pixels to aim by |

Its size is the `--size` custom property.
