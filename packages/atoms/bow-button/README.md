# @arrow-warfare/bow-button

`<aw-bow-button>`, the bow on a touch screen. Hold a thumb on it to draw (the game draws by time and sets `--pull` for the ring). The same thumb aims every way. Let go within `edge` pixels of the window's right edge to shoot, anywhere else lets the bow down.

| Member | Description |
| --- | --- |
| `edge` | Width of the shoot strip at the right edge, default 90 |
| `shoot` | The thumb is in the strip (also the `shooting` attribute) |
| `active`, `disabled` | Reflected, `disabled` only dims it |
| `drawstart`, `drawmove`, `drawend` | `{ dx, dy, shoot }`, `dx`/`dy` are pixels to aim by |

Its size is the `--size` custom property.
