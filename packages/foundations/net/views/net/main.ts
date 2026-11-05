import { APP, httpUrl, Lobby, LOBBY_NAME, signalUrl } from "@arrow-warfare/net";
import { effect } from "@papit/signals";

// joins the shared lobby and shows its status, `?signal=ws://localhost:3001` for a local server
const lobby = new Lobby({ url: signalUrl(), http: httpUrl(), name: LOBBY_NAME, meta: { app: APP, kind: "lobby", v: 1 } });
const out = document.createElement("pre");
out.style.padding = "24px";
document.body.append(out);
effect(() => { out.textContent = `signal: ${signalUrl()}\nlobby: ${lobby.status()} ${lobby.id ?? ""}`; });
void lobby.start().then(() => { out.textContent += `\nin lobby ${lobby.id}`; });
