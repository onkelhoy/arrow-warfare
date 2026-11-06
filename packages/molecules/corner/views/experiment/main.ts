import "@papit/codeblock";
import { loadText, saveSettings, useTheme } from "@arrow-warfare/core";
import { mountCorner } from "@arrow-warfare/corner";
import { Sound } from "@arrow-warfare/sound";

await loadText();
useTheme();

saveSettings();
const sound = new Sound();
sound.unlockOnFirstTap();
sound.playlist("lobby");
mountCorner(sound, document.querySelector<HTMLElement>("#corner")!);
