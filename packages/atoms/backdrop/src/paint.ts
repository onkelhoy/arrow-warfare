/**
 * The painted backdrop as one SVG string, 1600 x 900, the ground at the bottom. Made in code from a seed so
 * the ridges look hand cut but stay the same. Every colour is a CSS variable, the time of day sets them.
 */

const W = 1600;

function seeded(seed: number) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const r = (n: number) => Math.round(n * 10) / 10;

type Peak = { x: number; y: number; left: number; right: number };

/** A jagged mountain ridge with its peaks, from y `base` up to about `top`. */
function ridge(random: () => number, base: number, top: number, count: number) {
    const peaks: Peak[] = [];
    const step = W / count;
    for (let i = -1; i <= count; i++)
    {
        const x = i * step + step * (.3 + random() * .4);
        const y = top + random() * (base - top) * .55;
        peaks.push({ x, y, left: step * (.5 + random() * .3), right: step * (.5 + random() * .3) });
    }
    let d = `M-40 900 L-40 ${base}`;
    for (const peak of peaks)
    {
        // a shoulder on the way up, the peak, a shoulder down: cartoon crags, not smooth
        const upX = peak.x - peak.left * .45, upY = peak.y + (base - peak.y) * (.35 + random() * .2);
        const downX = peak.x + peak.right * .4, downY = peak.y + (base - peak.y) * (.3 + random() * .25);
        d += ` L${r(peak.x - peak.left)} ${base} L${r(upX)} ${r(upY)} L${r(peak.x - 8)} ${r(peak.y + 6)} Q${r(peak.x)} ${r(peak.y - 4)} ${r(peak.x + 8)} ${r(peak.y + 6)} L${r(downX)} ${r(downY)} L${r(peak.x + peak.right)} ${base}`;
    }
    d += ` L${W + 40} ${base} L${W + 40} 900 Z`;
    return { d, peaks, base };
}

/** A snow cap on each peak tall enough, with a zigzag hem. */
function snow(peaks: Peak[], base: number, random: () => number) {
    return peaks.filter(peak => peak.y < base - 120).map(peak => {
        const depth = (base - peak.y) * .28;
        const left = peak.x - peak.left * .45 * (depth / ((base - peak.y) * .4));
        const right = peak.x + peak.right * .4 * (depth / ((base - peak.y) * .4));
        const y = peak.y + depth;
        let d = `M${r(peak.x - 8)} ${r(peak.y + 6)} Q${r(peak.x)} ${r(peak.y - 4)} ${r(peak.x + 8)} ${r(peak.y + 6)} L${r(right)} ${r(y)}`;
        const teeth = 4;
        for (let i = teeth - 1; i >= 0; i--)
        {
            const x = left + (right - left) * (i + .5) / teeth;
            d += ` L${r(x)} ${r(y - 10 - random() * 14)} L${r(left + (right - left) * i / teeth)} ${r(y + random() * 6)}`;
        }
        return d + " Z";
    }).join(" ");
}

/** Soft rolling hills along `base`, `waves` bumps of about `height`. */
function hills(random: () => number, base: number, height: number, waves: number) {
    const step = W / waves;
    let x = -60, y = base - random() * height;
    let d = `M-60 900 L${x} ${r(y)}`;
    while (x < W + 60)
    {
        const next = x + step * (.7 + random() * .6);
        const ny = base - random() * height;
        d += ` Q${r((x + next) / 2)} ${r(Math.min(y, ny) - height * (.4 + random() * .5))} ${r(next)} ${r(ny)}`;
        x = next;
        y = ny;
    }
    return d + ` L${W + 60} 900 Z`;
}

/** A line of round and pointed tree tops along `base`. */
function forest(random: () => number, base: number) {
    let d = `M-20 900 L-20 ${base}`;
    for (let x = -20; x < W + 20;)
    {
        const size = 16 + random() * 18;
        if (random() < .5) d += ` L${r(x)} ${base} L${r(x + size / 2)} ${r(base - size * 2.2)} L${r(x + size)} ${base}`;
        else d += ` L${r(x)} ${base} A${r(size / 2)} ${r(size * .7)} 0 0 1 ${r(x + size)} ${base}`;
        x += size * (.7 + random() * .3);
    }
    return d + ` L${W + 20} 900 Z`;
}

/** Battlements along the top of a wall from `x` to `x + width` at `y`. */
const merlons = (x: number, y: number, width: number, size = 12) => {
    let d = "";
    for (let at = x; at + size <= x + width + .1; at += size * 2) d += `M${r(at)} ${y} h${size} v${-size} h${-size} Z `;
    return d;
};

/** A round tower: body, battlement ring, a pointed roof and a pennant on top. */
function tower(x: number, ground: number, width: number, height: number, roof: number, flip = false) {
    const top = ground - height;
    const flag = `<g class="flag${flip ? " flip" : ""}" style="transform-origin: ${x}px ${top - roof - 28}px">
        <path class="pennant" d="M${x} ${top - roof - 28} q22 -4 44 6 q-22 10 -44 6 Z"/>
    </g>`;
    return `
        <rect class="stone" x="${x - width / 2}" y="${top}" width="${width}" height="${height}"/>
        <path class="stone-dark" d="M${x + width * .18} ${top} h${width * .32} v${height} h${-width * .32} Z"/>
        <rect class="stone" x="${x - width / 2 - 5}" y="${top - 6}" width="${width + 10}" height="14"/>
        <path class="roof" d="M${x - width / 2 - 9} ${top - 4} L${x} ${top - roof} L${x + width / 2 + 9} ${top - 4} Z"/>
        <path class="roof-dark" d="M${x} ${top - roof} L${x + width / 2 + 9} ${top - 4} L${x + 4} ${top - 4} Z"/>
        <line class="pole" x1="${x}" y1="${top - roof}" x2="${x}" y2="${top - roof - 30}"/>
        ${flag}
        <rect class="window" x="${x - 5}" y="${top + height * .3}" width="10" height="18" rx="5"/>
    `;
}

/** The castle on its hill, centred on `x`, standing on `ground`. */
function castle(x: number, ground: number) {
    const wall = 300, wallHeight = 70;
    const keepW = 110, keepH = 150;
    const left = x - wall / 2;
    return `<g class="castle">
        <path class="castle-hill" d="M${x - 380} 900 L${x - 380} ${ground + 110} Q${x - 220} ${ground - 10} ${x} ${ground - 6} Q${x + 220} ${ground - 10} ${x + 390} ${ground + 110} L${x + 390} 900 Z"/>
        <path class="road" d="M${x - 14} ${ground} Q${x - 30} ${ground + 50} ${x + 30} ${ground + 90} Q${x + 80} ${ground + 120} ${x + 40} 900 L${x + 90} 900 Q${x + 120} ${ground + 120} ${x + 60} ${ground + 86} Q${x + 10} ${ground + 50} ${x + 14} ${ground} Z"/>
        <!-- the keep behind the wall -->
        <rect class="stone" x="${x - keepW / 2}" y="${ground - keepH}" width="${keepW}" height="${keepH}"/>
        <path class="stone-dark" d="M${x + keepW * .15} ${ground - keepH} h${keepW * .35} v${keepH} h${-keepW * .35} Z"/>
        <path class="stone" d="${merlons(x - keepW / 2, ground - keepH, keepW, 13)}"/>
        <rect class="window" x="${x - 26}" y="${ground - keepH + 34}" width="12" height="22" rx="6"/>
        <rect class="window" x="${x + 14}" y="${ground - keepH + 34}" width="12" height="22" rx="6"/>
        <line class="pole" x1="${x}" y1="${ground - keepH - 12}" x2="${x}" y2="${ground - keepH - 70}"/>
        <g class="flag big" style="transform-origin: ${x}px ${ground - keepH - 70}px">
            <path class="banner" d="M${x} ${ground - keepH - 70} q34 -8 68 4 q-10 14 0 28 q-34 -10 -68 -4 Z"/>
            <circle class="crest" cx="${x + 32}" cy="${ground - keepH - 52}" r="7"/>
        </g>
        <!-- the curtain wall and its gate -->
        <rect class="stone" x="${left}" y="${ground - wallHeight}" width="${wall}" height="${wallHeight}"/>
        <path class="stone" d="${merlons(left, ground - wallHeight, wall, 12)}"/>
        <path class="bricks" d="M${left + 20} ${ground - 46} h26 M${left + 70} ${ground - 30} h30 M${left + 210} ${ground - 50} h24 M${left + 250} ${ground - 26} h28 M${left + 40} ${ground - 14} h22"/>
        <path class="gate" d="M${x - 26} ${ground} v-34 a26 26 0 0 1 52 0 v34 Z"/>
        <path class="portcullis" d="M${x - 18} ${ground - 40} v40 M${x - 6} ${ground - 52} v52 M${x + 6} ${ground - 52} v52 M${x + 18} ${ground - 40} v40 M${x - 24} ${ground - 30} h48 M${x - 24} ${ground - 14} h48"/>
        ${tower(left - 6, ground, 58, 130, 70)}
        ${tower(left + wall + 6, ground, 58, 130, 70, true)}
        ${tower(x - 62, ground - wallHeight + 4, 34, 60, 46)}
        ${tower(x + 62, ground - wallHeight + 4, 34, 60, 46, true)}
    </g>`;
}

/** A puffy cartoon cloud, about 220 wide, its bottom flat. */
export const CLOUD = `<svg viewBox="0 0 240 110" aria-hidden="true"><path d="M20 92 a30 30 0 0 1 22 -44 a42 42 0 0 1 72 -22 a38 38 0 0 1 66 14 a30 30 0 0 1 42 40 q4 12 -10 12 H28 q-14 0 -8 -0 Z"/></svg>`;

/** The whole painting. */
export function paint(seed = 7) {
    const random = seeded(seed);
    const far = ridge(random, 640, 260, 5);
    const near = ridge(random, 700, 400, 7);
    const stars = Array.from({ length: 70 }, () => `<circle cx="${r(random() * W)}" cy="${r(random() * 460)}" r="${r(1 + random() * 2.2)}" style="animation-delay: -${r(random() * 4)}s"/>`).join("");
    return `<svg class="paint" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
        <defs>
            <linearGradient id="haze" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stop-color="var(--horizon)" stop-opacity="0"/>
                <stop offset="1" stop-color="var(--horizon)" stop-opacity=".75"/>
            </linearGradient>
            <radialGradient id="glow">
                <stop offset="0" stop-color="var(--ring)" stop-opacity=".9"/>
                <stop offset="1" stop-color="var(--ring)" stop-opacity="0"/>
            </radialGradient>
        </defs>
        <g class="stars">${stars}</g>
        <g class="sun">
            <circle cx="1230" cy="210" r="170" fill="url(#glow)"/>
            <mask id="crescent">
                <rect x="1100" y="80" width="260" height="260" fill="white"/>
                <circle class="bite" cx="1258" cy="192" r="52"/>
            </mask>
            <circle class="disc" cx="1230" cy="210" r="62" mask="url(#crescent)"/>
        </g>
        <path class="far" d="${far.d}"/>
        <path class="snow" d="${snow(far.peaks, far.base, random)}"/>
        <rect x="0" y="380" width="1600" height="300" fill="url(#haze)"/>
        <path class="near" d="${near.d}"/>
        <path class="snow near-snow" d="${snow(near.peaks, near.base, random)}"/>
        <rect x="0" y="520" width="1600" height="220" fill="url(#haze)" opacity=".7"/>
        <path class="hill-back" d="${hills(random, 720, 60, 5)}"/>
        ${castle(800, 640)}
        <path class="forest" d="${forest(random, 790)}"/>
        <path class="hill" d="${hills(random, 860, 50, 4)}"/>
    </svg>`;
}
