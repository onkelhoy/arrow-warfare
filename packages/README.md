# Packages

Atomic design. A package only depends on layers below or beside it.

| Folder | What goes there |
| --- | --- |
| `foundations/` | No UI of its own: `core` (settings, config, colours), `net` (lobby, room, clock), `sound`, `render` (WebGL2 renderer) |
| `atoms/` | Small elements: `qr-code`, `share-link`, `joystick`, `bow-button`, `backdrop` (the painted menu sky), `fanfare` (the winner trumpets) |
| `molecules/` | Elements made of atoms: `invite-dialog`, `corner`, `chat`, `touch-layout` |
| `pages/` | One per screen: `menu`, `lobby`, `play`, `results` |

Every package with UI has `views/experiment/`, made like `@papit/create`'s templates: web-component packages get an `h1`, `section`s, a `style.css` importing `@papit/theme` and `pap-codeblock` previews (with its light/dark toggle) for tags; `useTheme()` from core brings the medieval look. Game packages (3D) get a full canvas with a `GameEngine`. Parts drawn for the game's sky sit in a `.stage` box.

`game/` is the app. It pulls the pages together, and `npm run pages` builds it into `docs/` for GitHub Pages.

Add a package with `npm run create -- --destination=packages/<layer>`. Only `@papit/*` dependencies, ask before anything else.
