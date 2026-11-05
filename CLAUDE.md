# Arrow Warfare

First person multiplayer archer game for phones, built on papit. WebRTC: a chord lobby to meet, a mesh room per game, like `~/Developer/games/cowboy`.

## Start here
- `.claude/backlog.md`: the whole game, features, decisions, milestones.
- `.claude/plan.md`: the current confirmed tasks. Its "Where we are" says what's next. Delete it when all its tasks are done, and tick the backlog.

## How we work
- Present the tasks before working on them, the owner confirms. "do next task", "do the next 4 tasks" or "do all tasks" runs that many, then stops with a short status.
- Everything on `main`, no branches. No tests for now.
- Commit locally as tasks finish. Push to `main` only when a milestone is done (it auto deploys to GitHub Pages), then the owner tests live.
- Atomic design: `packages/foundations`, `atoms`, `molecules`, `pages`. The app in `packages/game` pulls the pages together and builds `docs/`.
- Every package with UI has `views/` so it can be seen alone in the dev server.
- Reuse `@papit/*` before building. No runtime dependencies outside papit without asking.
- Cowboy solved networking, sound, settings, fullscreen, invites and atmosphere already. Copy from it before writing new.

## Papit
The repo is at `~/Developer/projects/papit`. Start with `.claude/CATALOG.md`, then the package READMEs. Trust the code over the docs. A bug or missing piece in papit gets reported to the owner, not patched from here.
