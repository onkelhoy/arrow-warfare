// The server and the static build only collect asset folders of packages, not the root `asset/`
// the owner drops songs and logos in, so they get copied in here.
import fs from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname);
const from = path.resolve(here, "../../../asset");
const to = path.resolve(here, "../asset/owner");

fs.rmSync(to, { recursive: true, force: true });
if (fs.existsSync(from) && fs.readdirSync(from).length) fs.cpSync(from, to, { recursive: true, filter: file => !file.endsWith(".DS_Store") });
