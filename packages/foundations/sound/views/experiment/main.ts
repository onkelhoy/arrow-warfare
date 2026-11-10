import "@papit/codeblock";
import { useTheme } from "@arrow-warfare/core";
import "@papit/button";
import { Ambience, Sound, type AmbienceTime, type PlaylistName } from "@arrow-warfare/sound";

const sound = new Sound();
let dipped = false;

for (const button of document.querySelectorAll<HTMLElement>("[data-list]"))
{
    button.addEventListener("click", () => {
        sound.unlock();
        sound.playlist((button.dataset.list || null) as PlaylistName | null);
    });
}
document.querySelector("#next")!.addEventListener("click", () => sound.next());
document.querySelector("#dip")!.addEventListener("click", () => sound.dip(dipped = !dipped));
document.querySelector<HTMLInputElement>("#music")!.addEventListener("input", event => sound.setVolume("music", Number((event.target as HTMLInputElement).value)));

let ambience: Ambience | null = null;
const walk = document.querySelector<HTMLInputElement>("#walk")!;
let last = performance.now();
const loop = (now: number) => {
    const ears = [Number(walk.value), 1.7, 6];
    sound.listen(ears, [1, 0, 0]);
    ambience?.update(Math.min(.1, (now - last) / 1000), ears);
    last = now;
    document.querySelector("#where")!.textContent = `ears at x ${walk.value}`;
    requestAnimationFrame(loop);
};
requestAnimationFrame(loop);
for (const button of document.querySelectorAll<HTMLElement>("[data-time]"))
{
    button.addEventListener("click", () => {
        sound.unlock();
        if (!ambience)
        {
            ambience = new Ambience(sound);
            ambience.emitters([
                { name: "frogs", at: [0, 0, 0], half: 4, reach: 35, volume: .9 },
                { name: "crackle", at: [20, .4, 0], half: 2.5, reach: 25 },
            ]);
        }
        ambience.time(button.dataset.time as AmbienceTime);
    });
}
document.querySelector("#hush")!.addEventListener("click", () => {
    ambience?.stop();
    ambience = null;
});
document.querySelector<HTMLInputElement>("#ambience")!.addEventListener("input", event => sound.setVolume("ambience", Number((event.target as HTMLInputElement).value)));

useTheme();
