import { mix, rgb, type Light } from "@arrow-warfare/render";

/** The light of the meadow at four times of day. The sky colours are cowboy's palettes. */
export const PALETTES = {
    night: palette({
        zenith: "#0b1030", horizon: "#33407a", fog: "#28336a",
        sunDirection: [-.3, .7, .45], sunColour: [.2, .24, .42], sky: [.2, .24, .42], ground: [.07, .08, .14],
        fogDensity: 1 / 55, sunDisc: [0, 0, 0], moon: 1, stars: 1,
    }),
    dawn: palette({
        zenith: "#f6ab5c", horizon: "#fdeabf", fog: "#f3d6a6",
        sunDirection: [.85, .25, .3], sunColour: [.95, .72, .45], sky: [.62, .55, .52], ground: [.3, .26, .16],
        fogDensity: 1 / 75, sunDisc: [1, .9, .7], moon: 0, stars: 0,
    }),
    noon: palette({
        zenith: "#2f9fc7", horizon: "#b6e3d4", fog: "#a9d8d0",
        sunDirection: [.35, .85, .25], sunColour: [.75, .7, .58], sky: [.55, .63, .7], ground: [.3, .34, .2],
        fogDensity: 1 / 95, sunDisc: [1, .97, .85], moon: 0, stars: 0,
    }),
    sunset: palette({
        zenith: "#352a70", horizon: "#fdb45c", fog: "#e28a5e",
        sunDirection: [-.85, .2, -.3], sunColour: [1, .55, .35], sky: [.45, .36, .5], ground: [.24, .16, .14],
        fogDensity: 1 / 70, sunDisc: [1, .75, .45], moon: 0, stars: 0,
    }),
} satisfies Record<string, Light>;

export type PaletteName = keyof typeof PALETTES;

/** The light at this hour of the player's own day, like cowboy. */
export function paletteAt(hour: number): PaletteName {
    if (hour < 6 || hour >= 20) return "night";
    if (hour < 10) return "dawn";
    return hour < 17 ? "noon" : "sunset";
}

/** The light follows the clock, `?palette=sunset` picks one by hand. */
export function currentPalette(search: string = location.search, hour = new Date().getHours()): PaletteName {
    const name = new URLSearchParams(search).get("palette");
    return name && name in PALETTES ? name as PaletteName : paletteAt(hour);
}

type Setting = Omit<Light, "zenith" | "horizon" | "fogColour" | "moonDirection" | "sunSize"> & { zenith: string; horizon: string; fog: string };

function palette({ zenith, horizon, fog, ...rest }: Setting): Light {
    const fogColour = rgb(fog);
    return {
        ...rest,
        zenith: rgb(zenith),
        horizon: mix(rgb(horizon), fogColour, .3),
        fogColour,
        moonDirection: rest.moon ? rest.sunDirection : [0, -1, 0],
        sunSize: .0012,
    };
}
