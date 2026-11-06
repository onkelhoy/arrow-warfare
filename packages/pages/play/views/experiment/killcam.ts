import { mountKillCam } from "@arrow-warfare/play";
import { Sound } from "@arrow-warfare/sound";

const stage = document.querySelector<HTMLElement>(".killcam-stage")!;
const form = document.querySelector<HTMLFormElement>(".killcam-controls")!;
const status = form.querySelector<HTMLOutputElement>(".killcam-state")!;
const input = (name: string) => form.elements.namedItem(name) as HTMLInputElement;

const sound = new Sound();
sound.unlockOnFirstTap();
const lab = mountKillCam(stage, sound);

const show = () => {
    form.querySelector<HTMLOutputElement>("[name=distance-value]")!.textContent = `${input("distance").value} m`;
    form.querySelector<HTMLOutputElement>("[name=power-value]")!.textContent = input("power").value;
};
form.addEventListener("input", show);
form.addEventListener("submit", event => {
    event.preventDefault();
    status.textContent = lab.shoot(Number(input("distance").value), Number(input("power").value), input("part").value as "head" | "torso");
});
stage.addEventListener("click", () => lab.skip());
show();
