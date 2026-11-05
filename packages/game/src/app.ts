/** The app: one screen at a time, the pages come in as they are built. */
export async function startApp(root: HTMLElement = document.body) {
    const hello = document.createElement("main");
    hello.className = "hello";
    hello.innerHTML = `<h1>Arrow Warfare</h1><p>Coming soon to a meadow near you.</p>`;
    root.append(hello);
    return { root };
}
