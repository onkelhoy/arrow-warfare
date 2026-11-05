import { Sound, type PlaylistName } from "@arrow-warfare/sound";

const sound = new Sound();
let dipped = false;

for (const button of document.querySelectorAll<HTMLButtonElement>("[data-list]"))
{
    button.addEventListener("click", () => {
        sound.unlock();
        sound.playlist((button.dataset.list || null) as PlaylistName | null);
    });
}
document.querySelector("#next")!.addEventListener("click", () => sound.next());
document.querySelector("#dip")!.addEventListener("click", () => sound.dip(dipped = !dipped));
document.querySelector<HTMLInputElement>("#music")!.addEventListener("input", event => sound.setVolume("music", Number((event.target as HTMLInputElement).value)));
