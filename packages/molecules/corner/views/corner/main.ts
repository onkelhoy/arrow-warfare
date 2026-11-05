import { loadText, saveSettings } from "@arrow-warfare/core";
import { mountCorner } from "@arrow-warfare/corner";
import { Sound } from "@arrow-warfare/sound";

await loadText();
saveSettings();
const sound = new Sound();
sound.unlockOnFirstTap();
sound.playlist("lobby");
mountCorner(sound);
