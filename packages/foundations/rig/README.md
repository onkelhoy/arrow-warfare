# @arrow-warfare/rig

The silly body: a big torso, a round head, short arms and tiny legs as rigid parts on an `@papit/armature` rig.

| Part | What it does |
| --- | --- |
| `Rig` | One body. `update(dt, input)` with where it is, the aim, the draw, wounds, resting and dead. Legs are IK'd to feet planted in the world that step when the body gets ahead, hop on one leg, stretch out front sitting. Arms reach for the bow and its string. Gives `capsules` for hit tests and `frame(part)`, `toPart`, `fromPart` for arrows stuck in a part |
| `Bodies` | Draws any number of rigs, each part kind in one instanced batch, with bows and nocked arrows |
| `MEASURE` | The body's measures |

The view shows one walking a circle with the settings in the panel, and the postures around it.
