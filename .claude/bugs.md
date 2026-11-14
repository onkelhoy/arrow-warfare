# Bugs

## Stretched view on phones (people look fat)
The canvas was sized on `window.resize`, which phones fire before the layout settles (turning, fullscreen, address bar). The canvas kept a stale size and got stretched. Workaround: a `ResizeObserver` on the play element (`packages/pages/play/src/play.ts`).

## No audio on phones (papit)
`@papit/audio` `AudioMixer` unlocks on the first `pointerdown`, sets `unlocked` and drops its listeners even when the resume fails. iOS refuses a resume from `pointerdown`, so it never retries. It also never recovers from `interrupted` (call, app switch). Reported to the owner. Workaround: `Sound` retries `unlock()` on every `touchend`/`click`/`keydown` while the context isn't running (`packages/foundations/sound/src/sound.ts`).

## Tavern music sometimes silent on phones
iOS plays one media element at a time and starts one only from a tap. The tavern's song was a second `<audio>` (papit `mixer.load(..., { stream: true })`) started from the frame loop, next to the playlist's. Fix: all music goes through one element (`packages/foundations/sound/src/playlists.ts`): near a tavern its song takes the music over, the game's song pauses and goes on after. Every tap retries `play()` if the phone stopped it. No more blending both songs at the edge.

## QR scanner blank on iPhone (suspected)
Asks for camera permission, then nothing. Suspect: `@papit/audio` mixer sets `navigator.audioSession.type = "playback"`, which blocks camera capture on iOS. Workaround: `aw-qr-scanner` sets it to `"auto"` while the camera runs and restores it on stop. Not confirmed on a device yet. Report to papit if confirmed.
