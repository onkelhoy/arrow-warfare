import { effect, signal } from "@papit/signals";

const KEY = "arrow-warfare.settings";
export const NAME_LENGTH = 16;

export type Volumes = { everything: number; music: number; sounds: number };

export type Settings = {
    name: string;
    mute: boolean;
    volumes: Volumes;
};

export const DEFAULTS: Settings = { name: "", mute: false, volumes: { everything: 1, music: .6, sounds: 1 } };

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
    };
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
