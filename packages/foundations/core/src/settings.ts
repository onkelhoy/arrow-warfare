import { effect, signal } from "@papit/signals";

const KEY = "arrow-warfare.settings";
export const NAME_LENGTH = 16;

export type Volumes = { everything: number; music: number; sounds: number };

export type Settings = {
    name: string;
    mute: boolean;
    volumes: Volumes;
    /** How fast dragging or the mouse turns the view, 1 is normal. */
    sensitivity: number;
    /** Where the bow button sits on a touch screen. */
    bow: BowPlace;
    /** The hand that pulls the string. Right handed holds the bow in the left hand. */
    hand: Hand;
};

export type Hand = "right" | "left";

/** The bow button's middle as fractions of the screen (0..1), and its size in CSS pixels. */
export type BowPlace = { x: number; y: number; size: number };

/** Near the top, a bit right of the middle. */
export const BOW_PLACE: BowPlace = { x: .62, y: .17, size: 76 };
export const BOW_SIZE = { min: 48, max: 140 };

export const SENSITIVITY = { min: .3, max: 3 };

export const DEFAULTS: Settings = { name: "", mute: false, volumes: { everything: 1, music: .6, sounds: 1 }, sensitivity: 1, bow: { ...BOW_PLACE }, hand: "right" };

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

    const { everything, music, sounds } = DEFAULTS.volumes;
    return {
        name: typeof raw?.name === "string" ? cleanName(raw.name) : "",
        mute: raw?.mute === true,
        volumes: {
            everything: volume(raw?.volumes?.everything, everything),
            music: volume(raw?.volumes?.music, music),
            sounds: volume(raw?.volumes?.sounds, sounds),
        },
        sensitivity: typeof raw?.sensitivity === "number" && raw.sensitivity >= SENSITIVITY.min && raw.sensitivity <= SENSITIVITY.max ? raw.sensitivity : 1,
        bow: parseBow(raw?.bow),
        hand: raw?.hand === "left" ? "left" : "right",
    };
}

function parseBow(raw: Partial<BowPlace> | undefined): BowPlace {
    const fraction = (value: unknown, fallback: number) => typeof value === "number" && value >= 0 && value <= 1 ? value : fallback;
    const size = typeof raw?.size === "number" && raw.size >= BOW_SIZE.min && raw.size <= BOW_SIZE.max ? raw.size : BOW_PLACE.size;
    return { x: fraction(raw?.x, BOW_PLACE.x), y: fraction(raw?.y, BOW_PLACE.y), size };
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
