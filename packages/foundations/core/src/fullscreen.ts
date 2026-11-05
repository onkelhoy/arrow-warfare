type Orientation = ScreenOrientation & { lock?(orientation: string): Promise<void> };

type FullscreenDocument = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?(): void };
type FullscreenElement = HTMLElement & { webkitRequestFullscreen?(): void };

/** iPhone Safari has no fullscreen for pages, so there the button hides and Play just plays. */
export const canFullscreen = () => !!(document.documentElement.requestFullscreen || (document.documentElement as FullscreenElement).webkitRequestFullscreen);

export const isFullscreen = () => !!(document.fullscreenElement || (document as FullscreenDocument).webkitFullscreenElement);

/** Needs a tap to start. Never throws, a refusal just means the game stays in the window. */
export async function enterFullscreen() {
    if (isFullscreen() || !canFullscreen()) return;
    const element = document.documentElement as FullscreenElement;
    try
    {
        if (element.requestFullscreen) await element.requestFullscreen({ navigationUI: "hide" });
        else element.webkitRequestFullscreen?.();
        // fullscreen is what lets a phone lock to landscape, so the turn screen goes away by itself
        await (screen.orientation as Orientation).lock?.("landscape");
    }
    catch { /* not allowed, or not supported */ }
}

export async function exitFullscreen() {
    try
    {
        (screen.orientation as Orientation).unlock?.();
        if (document.exitFullscreen) await document.exitFullscreen();
        else (document as FullscreenDocument).webkitExitFullscreen?.();
    }
    catch { /* already out */ }
}

export const toggleFullscreen = () => isFullscreen() ? exitFullscreen() : enterFullscreen();
