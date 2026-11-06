#!/usr/bin/env node
// Writes the version page: one <details> per release, newest first, built from the v0.0.N git tags,
// a version.json next to it, and a live check of whether this browser can reach the signal server and
// find a path to a friend. A commit with no tag yet is the next release; the pages workflow tags it
// once it's deployed.
//
//   node bin/version-log.mjs <output folder>   (writes version.html and version/index.html)

import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const output = process.argv[2];
if (!output)
{
    console.error("usage: version-log.mjs <output folder>");
    process.exit(1);
}

const DEFAULT_SIGNAL = "wss://render-webrtc-signal-server.onrender.com";
const STUN = "stun:stun.l.google.com:19302";

const git = (...args) => execFileSync("git", args, { encoding: "utf-8" }).trim();
const escape = text => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const lines = text => text.split("\n").filter(Boolean);

const tags = lines(git("tag", "--list", "v0.0.*"))
    .sort((a, b) => Number(a.split(".")[2]) - Number(b.split(".")[2]));

// `--points-at` so a re-run of the same commit doesn't count as a new release
const current = lines(git("tag", "--points-at", "HEAD", "--list", "v0.0.*"))[0];
const last = tags[tags.length - 1];
const version = current ?? `v0.0.${last ? Number(last.split(".")[2]) + 1 : 1}`;

const refs = tags.map(tag => ({ version: tag, ref: tag }));
if (!current) refs.push({ version, ref: "HEAD" });

const releases = refs.map(({ version, ref }, index) => {
    const previous = refs[index - 1]?.ref;
    return {
        version,
        date: git("log", "-1", "--format=%cs", ref),
        changes: lines(git("log", "--format=%s", previous ? `${previous}..${ref}` : ref)),
    };
}).reverse();

const entry = (release, index) => `        <details id="${release.version}"${index === 0 ? " open" : ""}>
            <summary>${release.version} (${release.date}): ${release.changes.length} ${release.changes.length === 1 ? "change" : "changes"}</summary>
            <ul>
${release.changes.map(change => `                <li>${escape(change)}</li>`).join("\n")}
            </ul>
        </details>`;

const page = base => `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="robots" content="noindex">
    <title>Arrow Warfare versions</title>
    <style>
        body { font: 16px/1.5 system-ui, sans-serif; max-width: 40rem; margin: 0 auto; padding: 1rem; background: #2b1d14; color: #f3e3bd; }
        a { color: #f7cf8e; }
        ul#checks { list-style: none; padding: 0; }
        #checks li { padding: .25rem 0; }
        .ok::before { content: "✓ "; color: #8fd18f; }
        .bad::before { content: "✗ "; color: #ff8a7a; }
        .wait::before { content: "… "; }
        details { margin: .5rem 0; }
    </style>
</head>
<body>
    <main>
        <h1>Arrow Warfare versions</h1>
        <p>Current version: <b id="version">${version}</b>. <a href="${base}">Open the game</a></p>

        <h2>Can this device play?</h2>
        <ul id="checks"><li class="wait">Checking...</li></ul>
        <p><small>The signal server sleeps when nobody has used it for a while, the first check can take up to a minute.</small></p>

        <h2>Releases</h2>
${releases.map(entry).join("\n")}
    </main>
    <script>
        const SIGNAL = new URLSearchParams(location.search).get("signal") || "${DEFAULT_SIGNAL}";
        const list = document.getElementById("checks");

        function line(text) {
            const item = document.createElement("li");
            item.className = "wait";
            item.textContent = text;
            list.append(item);
            return (ok, result) => { item.className = ok ? "ok" : "bad"; item.textContent = result; };
        }

        // a link to a version opens it
        document.getElementById(location.hash.slice(1))?.setAttribute("open", "");

        (async () => {
            list.replaceChildren();

            const rtc = line("WebRTC");
            rtc(!!window.RTCPeerConnection, window.RTCPeerConnection ? "WebRTC is supported" : "WebRTC is missing, this browser can't play");

            const signal = line("Signal server " + SIGNAL);
            const started = performance.now();
            await new Promise(resolve => {
                let socket;
                const timer = setTimeout(() => { socket?.close(); signal(false, "Signal server didn't answer in 60 s: " + SIGNAL); resolve(); }, 60000);
                try {
                    socket = new WebSocket(SIGNAL);
                    socket.onopen = () => { clearTimeout(timer); signal(true, "Signal server answered in " + Math.round(performance.now() - started) + " ms"); socket.close(); resolve(); };
                    socket.onerror = () => { clearTimeout(timer); signal(false, "Signal server refused the connection: " + SIGNAL); resolve(); };
                } catch (error) { clearTimeout(timer); signal(false, "Can't open " + SIGNAL + ": " + error.message); resolve(); }
            });

            if (!window.RTCPeerConnection) return;
            const stun = line("STUN ${STUN}");
            await new Promise(resolve => {
                const connection = new RTCPeerConnection({ iceServers: [{ urls: "${STUN}" }] });
                const types = new Set();
                const done = () => {
                    clearTimeout(timer);
                    connection.close();
                    stun(types.has("srflx"), types.has("srflx")
                        ? "STUN found a public address, a direct connection is possible"
                        : "STUN found no public address (" + ([...types].join(", ") || "no candidates") + "), a friend on another network may not connect. Try the same wifi");
                    resolve();
                };
                const timer = setTimeout(done, 8000);
                connection.createDataChannel("check");
                connection.onicecandidate = event => {
                    if (!event.candidate) return done();
                    const type = / typ (\\w+)/.exec(event.candidate.candidate)?.[1];
                    if (type) types.add(type);
                    if (type === "srflx") done();
                };
                connection.createOffer().then(offer => connection.setLocalDescription(offer));
            });
        })();
    </script>
</body>
</html>
`;

mkdirSync(join(output, "version"), { recursive: true });
writeFileSync(join(output, "version.html"), page("./"));
// `/version` without the extension
writeFileSync(join(output, "version", "index.html"), page("../"));
writeFileSync(join(output, "version.json"), JSON.stringify({ version }) + "\n");

console.log(`${output}: ${releases.length} releases, current ${version}`);

// the workflow tags a new release after it's deployed
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `tag=${current ? "" : version}\n`);
