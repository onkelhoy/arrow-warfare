# Bugs

## Stretched view on phones (people look fat)
The canvas was sized on `window.resize`, which phones fire before the layout settles (turning, fullscreen, address bar). The canvas kept a stale size and got stretched. Workaround: a `ResizeObserver` on the play element (`packages/pages/play/src/play.ts`).

## No audio on phones (papit)
`@papit/audio` `AudioMixer` unlocks on the first `pointerdown`, sets `unlocked` and drops its listeners even when the resume fails. iOS refuses a resume from `pointerdown`, so it never retries. It also never recovers from `interrupted` (call, app switch). Reported to the owner. Workaround: `Sound` retries `unlock()` on every `touchend`/`click`/`keydown` while the context isn't running (`packages/foundations/sound/src/sound.ts`).
