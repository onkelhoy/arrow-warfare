import { mix, rgb, type Light, type Vec3 } from "@arrow-warfare/render";

/** The light of the meadow at four times of day. The sky colours are cowboy's palettes. */
export const PALETTES = {
    night: palette({
        zenith: "#0b1030", horizon: "#33407a", fog: "#2a3468",
        sunDirection: [-.3, .7, .45], sunColour: [.26, .3, .5], sky: [.3, .36, .62], ground: [.12, .14, .26],
        fogDensity: 1 / 60, disc: [.95, .94, .86], ring: [.15, .19, .42], discSize: .11, moon: 1, stars: 1,
    }),
    dawn: palette({
        zenith: "#6cc0ec", horizon: "#fde9c4", fog: "#f2e6cc",
        sunDirection: [.85, .25, .3], sunColour: [.62, .52, .38], sky: [.62, .64, .66], ground: [.32, .32, .22],
        fogDensity: 1 / 90, disc: [1, .98, .86], ring: [1, .89, .65], discSize: .055, moon: 0, stars: 0,
    }),
    noon: palette({
        zenith: "#2f8fe0", horizon: "#c4e8f6", fog: "#b8e0f2",
        sunDirection: [.35, .85, .25], sunColour: [.55, .52, .42], sky: [.62, .68, .76], ground: [.32, .36, .24],
        fogDensity: 1 / 110, disc: [1, .97, .82], ring: [.72, .87, .96], discSize: .05, moon: 0, stars: 0,
    }),
    sunset: palette({
        zenith: "#352a70", horizon: "#fdb45c", fog: "#ec9a6e",
        sunDirection: [-.85, .2, -.3], sunColour: [.75, .45, .3], sky: [.56, .46, .62], ground: [.3, .2, .24],
        fogDensity: 1 / 80, disc: [1, .91, .66], ring: [1, .6, .36], discSize: .06, moon: 0, stars: 0,
    }),
} satisfies Record<string, Light>;

export type PaletteName = keyof typeof PALETTES;

/** The clouds' colour at each time of day: white, warm in the morning, pink at sunset, navy at night. */
export const CLOUDS: Record<PaletteName, Vec3> = {
    night: [.2, .25, .5],
    dawn: [1, .95, .88],
    noon: [1, 1, 1],
    sunset: [1, .66, .68],
};

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

type Setting = Omit<Light, "zenith" | "horizon" | "fogColour"> & { zenith: string; horizon: string; fog: string };

function palette({ zenith, horizon, fog, ...rest }: Setting): Light {
    const fogColour = rgb(fog);
    return {
        ...rest,
        zenith: rgb(zenith),
        horizon: mix(rgb(horizon), fogColour, .3),
        fogColour,
    };
}

/** `light` on a rainy day: greyer and darker, the sun weak behind the clouds, thicker air, no stars. */
export function wet(light: Light): Light {
    const grey = (colour: Vec3, amount: number, dim: number): Vec3 => {
        const level = (colour[0] * .3 + colour[1] * .55 + colour[2] * .15) * dim;
        return mix(colour.map(c => c * dim) as Vec3, [level * .95, level, level * 1.08], amount);
    };
    return {
        ...light,
        zenith: grey(light.zenith, .7, .62),
        horizon: grey(light.horizon, .65, .7),
        fogColour: grey(light.fogColour, .65, .7),
        sky: grey(light.sky, .4, .85),
        ground: grey(light.ground, .3, .85),
        sunColour: light.sunColour.map(c => c * .45) as Vec3,
        fogDensity: light.fogDensity * 1.9,
        disc: light.disc.map(c => c * .35) as Vec3,
        ring: grey(light.ring, .8, .5),
        stars: 0,
    };
}

/** The clouds on a rainy day, heavy and grey. */
export function wetClouds(colour: Vec3): Vec3 {
    const level = (colour[0] + colour[1] + colour[2]) / 3 * .6;
    return [level, level, level * 1.05];
}
