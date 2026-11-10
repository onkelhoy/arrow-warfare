import { effect, signal } from "@papit/signals";

const KEY = "arrow-warfare.settings";
export const NAME_LENGTH = 16;

export type Volumes = { everything: number; music: number; sounds: number; ambience: number };

export type Settings = {
    name: string;
    mute: boolean;
    volumes: Volumes;
    /** How fast dragging or the mouse turns the view, 1 is normal. */
    sensitivity: number;
    /** Where the bow button sits on a touch screen. */
    bow: BowPlace;
    /** Where a gun's trigger sits on a touch screen, aim and reload beside it. */
    gun: BowPlace;
    /** The hand that pulls the string. Right handed holds the bow in the left hand. */
    hand: Hand;
    /** How much the phone draws: resolution, grass, rain, lamp light. */
    quality: Quality;
    /** Little splashes where the rain lands, off spares a slow phone. */
    splashes: boolean;
};

export type Quality = "low" | "medium" | "high";
export const QUALITIES: Quality[] = ["low", "medium", "high"];
/** Device pixels per CSS pixel at most, the share of grass, the rain drops around me, and lamps lighting at once (0: they only glow). */
export const QUALITY: Record<Quality, { pixels: number; grass: number; drops: number; lights: number }> = {
    low: { pixels: 1, grass: .35, drops: 700, lights: 0 },
    medium: { pixels: 1.25, grass: .7, drops: 1300, lights: 4 },
    high: { pixels: 1.5, grass: 1, drops: 2200, lights: 8 },
};
/** Phones start at medium, computers at high. */
const coarse = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
export const QUALITY_DEFAULT: Quality = coarse ? "medium" : "high";

export type Hand = "right" | "left";

/** The bow button's middle as fractions of the screen (0..1), and its size in CSS pixels. */
export type BowPlace = { x: number; y: number; size: number };

/** Near the top, right of the middle (not too far in on a long phone). */
export const BOW_PLACE: BowPlace = { x: .7, y: .2, size: 76 };
/** A gun's trigger: low, near the bottom right corner, aim and reload beside it. */
export const GUN_PLACE: BowPlace = { x: .88, y: .8, size: 76 };
/** The bow's old default: saved as is, it moves to the new one. */
const OLD_BOW = { x: .6, y: .2 };
export const BOW_SIZE = { min: 48, max: 140 };

export const SENSITIVITY = { min: .3, max: 3 };

export const DEFAULTS: Settings = { name: "", mute: false, volumes: { everything: 1, music: .6, sounds: 1, ambience: .8 }, sensitivity: 1, bow: { ...BOW_PLACE }, gun: { ...GUN_PLACE }, hand: "right", quality: QUALITY_DEFAULT, splashes: true };

const volume = (value: unknown, fallback: number) =>
    typeof value === "number" && value >= 0 && value <= 1 ? value : fallback;

export const cleanName = (name: string) => name.replace(/\s+/g, " ").trim().slice(0, NAME_LENGTH);

/** What's saved can be old or edited by hand, so nothing in it is trusted. */
export function parseSettings(saved: string | null): Settings {
    let raw: Partial<Settings> | null = null;
    try
    {
        raw = JSON.parse(saved ?? "null");
    }
    catch { /* start over */ }

    const { everything, music, sounds, ambience } = DEFAULTS.volumes;
    return {
        name: typeof raw?.name === "string" ? cleanName(raw.name) : "",
        mute: raw?.mute === true,
        volumes: {
            everything: volume(raw?.volumes?.everything, everything),
            music: volume(raw?.volumes?.music, music),
            sounds: volume(raw?.volumes?.sounds, sounds),
            ambience: volume(raw?.volumes?.ambience, ambience),
        },
        sensitivity: typeof raw?.sensitivity === "number" && raw.sensitivity >= SENSITIVITY.min && raw.sensitivity <= SENSITIVITY.max ? raw.sensitivity : 1,
        bow: raw?.bow?.x === OLD_BOW.x && raw?.bow?.y === OLD_BOW.y ? { ...BOW_PLACE, size: parseBow(raw.bow).size } : parseBow(raw?.bow),
        gun: parseBow(raw?.gun, GUN_PLACE),
        hand: raw?.hand === "left" ? "left" : "right",
        quality: QUALITIES.includes(raw?.quality as Quality) ? raw!.quality as Quality : QUALITY_DEFAULT,
        splashes: raw?.splashes !== false,
    };
}

function parseBow(raw: Partial<BowPlace> | undefined, fallback = BOW_PLACE): BowPlace {
    const fraction = (value: unknown, otherwise: number) => typeof value === "number" && value >= 0 && value <= 1 ? value : otherwise;
    const size = typeof raw?.size === "number" && raw.size >= BOW_SIZE.min && raw.size <= BOW_SIZE.max ? raw.size : fallback.size;
    return { x: fraction(raw?.x, fallback.x), y: fraction(raw?.y, fallback.y), size };
}

function read() {
    try
    {
        return localStorage.getItem(KEY);
    }
    catch
    {
        return null;
    }
}

export const [settings, setSettings] = signal<Settings>(parseSettings(read()));

export const updateSettings = (change: Partial<Settings>) => setSettings(current => ({ ...current, ...change }));

/** Storage can be off in a private window, then settings just last for the visit. */
export function saveSettings() {
    return effect(() => {
        const value = JSON.stringify(settings());
        try
        {
            localStorage.setItem(KEY, value);
        }
        catch { /* not saved */ }
    });
}
