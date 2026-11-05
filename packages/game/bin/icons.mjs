// Makes the page icons: `manifest.logo.svg` from the root `asset/` folder, else `logo.svg`, else a drawn
// arrow in a target, so the manifest never points at nothing. The PNGs are for iPhones (180) and for
// installing on Android (192, 512). They're committed, so the deploy needs no browser. A new logo redraws
// them on a build where playwright can be found: commit the result.
import fs from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname);
const assets = path.resolve(here, "../../../asset");
const out = path.resolve(here, "../views/game");
const SIZES = [180, 192, 512];

const FALLBACK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<rect width="100" height="100" rx="22" fill="#5f9e3a"/>
<circle cx="46" cy="54" r="34" fill="#fff6e0" stroke="#2f4a1f" stroke-width="4"/>
<circle cx="46" cy="54" r="23" fill="#e2553d" stroke="#2f4a1f" stroke-width="3"/>
<circle cx="46" cy="54" r="12" fill="#fff6e0" stroke="#2f4a1f" stroke-width="3"/>
<circle cx="46" cy="54" r="4" fill="#e2553d"/>
<path d="M47 53 84 16" stroke="#7a4a24" stroke-width="5" stroke-linecap="round"/>
<path d="M74 26 70 12 78 16 84 26z" fill="#f2c94c" stroke="#2f4a1f" stroke-width="2.5" stroke-linejoin="round"/>
<path d="M74 26 88 30 84 22 74 20z" fill="#f2c94c" stroke="#2f4a1f" stroke-width="2.5" stroke-linejoin="round"/>
<path d="M47 53 40 60" stroke="#2f4a1f" stroke-width="4" stroke-linecap="round"/>
</svg>`;

const source = ["manifest.logo.svg", "logo.svg"].map(name => path.join(assets, name)).find(file => fs.existsSync(file));
const svg = source ? fs.readFileSync(source, "utf8") : FALLBACK;

fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "manifest.logo.svg"), svg);
fs.writeFileSync(path.join(out, "favicon.svg"), svg);

const svgTime = source ? fs.statSync(source).mtimeMs : fs.statSync(new URL(import.meta.url)).mtimeMs;
const stale = SIZES.some(size => {
    const png = path.join(out, `manifest.logo-${size}.png`);
    return !fs.existsSync(png) || fs.statSync(png).mtimeMs < svgTime;
});

if (stale && !process.env.CI)
{
    try
    {
        const { chromium } = await import(process.env.PLAYWRIGHT ?? "playwright");
        const browser = await chromium.launch();
        const url = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
        for (const size of SIZES)
        {
            const page = await browser.newPage({ viewport: { width: size, height: size } });
            await page.setContent(`<body style="margin:0"><img src="${url}" width="${size}" height="${size}" style="display:block"></body>`);
            await page.locator("img").evaluate(img => img.decode());
            await page.screenshot({ path: path.join(out, `manifest.logo-${size}.png`), omitBackground: true });
            await page.close();
        }
        await browser.close();
        console.log("icons: PNGs drawn");
    }
    catch (error)
    {
        console.warn("icons: the PNG icons were not made:", error.message);
    }
}
