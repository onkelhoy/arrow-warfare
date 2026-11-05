import { APP, httpUrl, Lobby, LOBBY_NAME, signalUrl } from "@arrow-warfare/net";
import { effect } from "@papit/signals";

const lobby = new Lobby({ url: signalUrl(), http: httpUrl(), name: LOBBY_NAME, meta: { app: APP, kind: "lobby", v: 1 } });
const out = document.querySelector("#status")!;
effect(() => { out.textContent = `signal: ${signalUrl()}\nlobby: ${lobby.status()} ${lobby.id ?? ""}`; });
void lobby.start().then(() => { out.textContent += `\nin lobby ${lobby.id}`; });
