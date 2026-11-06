# @arrow-warfare/ragdoll

Cowboy's verlet ragdoll in 3D: named points, sticks between them, gravity, and any ground `height(x, z)` to land on (sinking in a little). No bones in it, whoever draws reads the points.

Steps are fixed (`STEP`, 1/120 s), so the same start gives the same fall on every phone, and a slow motion feeding smaller `dt`s plays the same fall slower. It sleeps (`resting`) once still.

| Part | What it does |
| --- | --- |
| `Ragdoll` | `new Ragdoll(start, sticks, height, { radius, sink, gravity })`, `moving(v)` for the body's own speed, `push(name, v)` for a hit, `update(dt)`, `runTo(time)` |

The view throws a stick body onto hills, click for harder, with a slow motion slider.
