/** Clothes colours, a player's own or their team's. `name` is a key under `aw.colour`. */
export const COLOURS = [
    { name: "red", hex: "#e2553d" },
    { name: "blue", hex: "#3d7be2" },
    { name: "green", hex: "#4caf50" },
    { name: "yellow", hex: "#f2c94c" },
    { name: "orange", hex: "#f2994a" },
    { name: "purple", hex: "#9b51e0" },
    { name: "pink", hex: "#f78fb3" },
    { name: "cyan", hex: "#2ec4d6" },
    { name: "brown", hex: "#8d5a3b" },
    { name: "white", hex: "#f4f1e8" },
    { name: "black", hex: "#33302c" },
    { name: "lime", hex: "#a8d83a" },
] as const;

export const SKINS = ["#ffdbb8", "#f1c27d", "#e0ac69", "#c68642", "#8d5524", "#5c3a21"] as const;

/** A random index of `count` that isn't in `used`, or any when all are taken. */
export function pickUnused(count: number, used: number[]) {
    const taken = new Set(used);
    const free = Array.from({ length: count }, (_, i) => i).filter(i => !taken.has(i));
    const from = free.length ? free : Array.from({ length: count }, (_, i) => i);
    return from[Math.floor(Math.random() * from.length)];
}
