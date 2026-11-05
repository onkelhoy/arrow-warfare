# @arrow-warfare/render

A small WebGL2 renderer on `@papit/game-engine`: low poly meshes made in code, flat toon light, fog, a sky and instancing. The engine gives the layer, loop and camera, this draws.

## Usage

```ts
import { Camera, GameEngine, orbit } from "@papit/game-engine";
import { MeshBuilder, Renderer } from "@arrow-warfare/render";

const engine = new GameEngine({ name: "main", query: "canvas", type: "webgl2" });
const renderer = engine.add(new Renderer(engine.layers.main));

const tree = new MeshBuilder()
    .cylinder("#7b5a3a", { scale: [.3, 2, .3] }, 6)
    .ball("#4f8f3a", { at: [0, 2.4, 0] }, 1, .25)
    .build();
const trees = renderer.batch(tree, { capacity: 200 });
trees.add(4, 0, -2, Math.PI / 3, 1.2);

engine.layers.main.camera = new Camera({ controllers: [orbit()] });
engine.start();
```

## Parts

| Part | What it does |
| --- | --- |
| `MeshBuilder` | Triangles with flat normals and vertex colours: `box`, `cylinder` (cones too), `ball`, `blade`, `triangle`, `quad`, `add` another. Each takes a `Place` (`at`, `yaw`, `pitch`, `roll`, `scale`, `tint`) |
| `Renderer` | A game object. Draws the sky, then every batch, through the layer's camera. `light` holds sun, hemisphere, fog, sky colours, moon and stars |
| `Batch` | One mesh drawn many times in one call. `add`, `place`, `matrix`, `tint`, `clear`, `count`, `visible`. `sway` bends the top in the wind, `emissive` is unlit, `dynamic` for things that move every frame |
| `seeded(seed)` | The same random numbers for the same seed |
| `compose`, `multiply`, `invert`, `rgb`, `mix` | The matrix and colour steps it needs, allocation free |

A vertex colour's `tint` (0..1) is how much the instance's tint replaces it, so clothes take the player's colour while the face keeps its skin.

## Notes
- The canvas renders at full device pixels (the engine has no pixel ratio setting yet). The play page shrinks the canvas in CSS and scales it up for a resolution scale.
- No shadows yet.
