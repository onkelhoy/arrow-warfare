// core
import "@papit/codeblock";

// component
import "@arrow-warfare/joystick";

const value = document.querySelector("#value")!;
document.addEventListener("move", event => {
    const { x, y } = (event as CustomEvent<{ x: number; y: number }>).detail;
    value.textContent = `x ${x.toFixed(2)} · y ${y.toFixed(2)}`;
}, true);
document.addEventListener("end", () => { value.textContent = "x 0 · y 0"; }, true);
