# @arrow-warfare/touch-layout

Place your touch controls. A full screen layer with the bow button on it: drag it where your thumb likes it, change its size, reset. Saved in the settings (`bow`) as it moves. The joystick isn't placed, it appears under the thumb.

```ts
const layout = mountTouchLayout(document.body, () => console.log("done"));
```
