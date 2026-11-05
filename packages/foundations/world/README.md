# @arrow-warfare/world

The meadow. A `Field` is built from a seed, so every phone that gets the same seed and rules has the same field. A `Meadow` puts a field on screen through `@arrow-warfare/render`.

## Usage

```ts
import { Camera, GameEngine, orbit } from "@papit/game-engine";
import { Renderer } from "@arrow-warfare/render";
import { currentPalette, Field, Meadow } from "@arrow-warfare/world";

const engine = new GameEngine({ name: "main", query: "canvas", type: "webgl2" });
const renderer = engine.add(new Renderer(engine.layers.main));
const field = new Field({ seed: 1234, size: "medium", trees: "few" });
engine.add(new Meadow(renderer, field, { palette: currentPalette() }));
```

## Parts

| Part | What it does |
| --- | --- |
| `Field` | Circular meadow of `RADIUS[size]` metres, forest wall around it. `height(x, z)`, `collide(x, z, radius)` pushes a circle out of trunks, logs and stumps and back inside the edge, `spawns(players)` gives each player a start spread on a ring, teams together, facing in. Lists of `trees`, `wall`, `grass`, `flowers`, `mushrooms`, `stones`, `logs`, `stumps`, `obstacles` |
| `Meadow` | A game object: the ground and every model as batches, the light of a palette, fireflies at night. `destroy` (or `engine.remove`) takes it all off the renderer |
| `PALETTES`, `paletteAt(hour)`, `currentPalette()` | Night, dawn, noon and sunset, picked by the player's own clock like cowboy. `?palette=sunset` picks one |
| Models | `roundTree`, `pineTree`, `birchTree`, `grassTuft`, `flower` (petals take the tint), `mushroom`, `stone`, `log`, `stump`, and the stand-in player: `body()` in the clothes tint and `head()` in the skin tint, with `NECK` and `BODY` measures |

Units are metres, y is up, the middle of the meadow is 0, 0. A yaw of 0 faces -z.
