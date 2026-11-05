# Packages

Atomic design. A package only depends on layers below or beside it.

| Folder | What goes there |
| --- | --- |
| `foundations/` | No UI of its own: `core` (settings, config, colours), `net` (lobby, room, clock), `sound`, `render` (WebGL2 renderer) |
| `atoms/` | Small elements: `qr-code`, `share-link`, `joystick` |
| `molecules/` | Elements made of atoms: `invite-dialog`, `corner`, `chat`, `touch-layout` |
| `pages/` | One per screen: `menu`, `lobby`, `play`, `results` |

Every package with UI has a `views/` folder, so `npm start` shows it on its own.

`game/` at the root is the app. It pulls the pages together, and `npm run pages` builds it into `docs/` for GitHub Pages.

Add a package with `npm run create`, then move it into its layer folder.
