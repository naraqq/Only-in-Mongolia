/**
 * A video's still frame and seek-bar frames, made in the browser from the file the creator picked (so the server
 * never needs a video decoder). The still is shown before the video plays (no need to load the video to find a
 * first frame); the frames are one image, a grid of small tiles, shown above the pointer while scrubbing.
 * The server re-checks and stores both next to the video (App\Media\Previews).
 */

/** How the seek-bar frames are laid out: `count` tiles of w×h, `cols` per row, one every `interval` seconds. */
export type ThumbGrid = { cols: number; count: number; interval: number; w: number; h: number };

/** What the player gets from the server. */
export type Thumbs = ThumbGrid & { url: string };

export type MadePreview = {
    poster: Blob;
    thumbs?: Blob;
    grid?: ThumbGrid;
    width: number;
    height: number;
    duration: number;
};

const POSTER_SIDE = 1280;
const TILE_SIDE = 160;
const MAX_TILES = 100;
const MAX_COLS = 10;
/** Give up on the seek-bar frames after this long (the still is kept). */
const BUDGET_MS = 45_000;

function wait<T>(el: HTMLVideoElement, event: string, ms: number): Promise<T | void> {
    return new Promise((resolve, reject) => {
        const done = () => {
            clearTimeout(timer);
            el.removeEventListener(event, done);
            el.removeEventListener('error', fail);
            resolve();
        };
        const fail = () => {
            clearTimeout(timer);
            el.removeEventListener(event, done);
            reject(new Error('video error'));
        };
        const timer = setTimeout(() => {
            el.removeEventListener(event, done);
            el.removeEventListener('error', fail);
            reject(new Error(`timed out waiting for ${event}`));
        }, ms);
        el.addEventListener(event, done, { once: true });
        el.addEventListener('error', fail, { once: true });
    });
}

async function seek(el: HTMLVideoElement, t: number, ms = 4000) {
    const p = wait(el, 'seeked', ms);
    el.currentTime = t;
    await p;
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
    return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('no image'))), 'image/jpeg', quality));
}

/** Fit (w, h) so its longer side is at most `side`. */
function fit(w: number, h: number, side: number): [number, number] {
    const s = Math.min(1, side / Math.max(w, h));
    return [Math.max(16, Math.round(w * s)), Math.max(16, Math.round(h * s))];
}

/** How many seek-bar frames: about one every 2 s for short videos, at most 100 for long ones. */
export function gridFor(duration: number, vw: number, vh: number): ThumbGrid {
    const count = Math.max(1, Math.min(MAX_TILES, Math.round(duration / 2)));
    const [w, h] = fit(vw, vh, TILE_SIDE);
    return { count, cols: Math.min(MAX_COLS, count), interval: duration / count, w, h };
}

/** Which tile shows second `t`, and where it sits in the grid image. */
export function tileAt(grid: ThumbGrid, t: number): { x: number; y: number } {
    return tilePos(grid, Math.floor(t / grid.interval));
}

function tilePos(grid: ThumbGrid, index: number): { x: number; y: number } {
    const i = Math.min(grid.count - 1, Math.max(0, index));
    return { x: (i % grid.cols) * grid.w, y: Math.floor(i / grid.cols) * grid.h };
}

/** Null when the browser can't play the file (the post still works, just without these). */
export async function makePreview(file: File): Promise<MadePreview | null> {
    const url = URL.createObjectURL(file);
    const el = document.createElement('video');
    el.muted = true;
    el.playsInline = true;
    el.preload = 'auto';
    try {
        const meta = wait(el, 'loadeddata', 15_000);
        el.src = url;
        await meta;
        // Videos recorded in a browser (WebM) often don't say how long they are until asked for the very end.
        if (el.duration === Infinity) {
            await seek(el, 1e7, 8000).catch(() => {});
        }
        const duration = el.duration;
        const vw = el.videoWidth;
        const vh = el.videoHeight;
        if (!Number.isFinite(duration) || duration <= 0 || !vw || !vh) return null;

        // The still: a moment in (the very first frame is often black).
        await seek(el, Math.min(1.5, duration * 0.1));
        const [pw, ph] = fit(vw, vh, POSTER_SIDE);
        const pc = document.createElement('canvas');
        pc.width = pw;
        pc.height = ph;
        pc.getContext('2d')!.drawImage(el, 0, 0, pw, ph);
        const poster = await toBlob(pc, 0.82);
        const out: MadePreview = { poster, width: vw, height: vh, duration };

        // The seek-bar frames: the middle of each stretch, drawn into one grid.
        if (duration >= 4) {
            const grid = gridFor(duration, vw, vh);
            const tc = document.createElement('canvas');
            tc.width = grid.cols * grid.w;
            tc.height = Math.ceil(grid.count / grid.cols) * grid.h;
            const ctx = tc.getContext('2d')!;
            const started = performance.now();
            let ok = true;
            for (let i = 0; i < grid.count; i++) {
                if (performance.now() - started > BUDGET_MS) {
                    ok = false;
                    break;
                }
                await seek(el, Math.min(duration - 0.05, (i + 0.5) * grid.interval));
                const { x, y } = tilePos(grid, i);
                ctx.drawImage(el, x, y, grid.w, grid.h);
            }
            if (ok) {
                out.thumbs = await toBlob(tc, 0.7);
                out.grid = grid;
            }
        }
        return out;
    } catch {
        return null;
    } finally {
        el.removeAttribute('src');
        el.load();
        URL.revokeObjectURL(url);
    }
}

/** One preview at a time: decoding several videos at once makes a phone crawl. */
let queue: Promise<unknown> = Promise.resolve();
export function makePreviewQueued(file: File): Promise<MadePreview | null> {
    const run = queue.then(() => makePreview(file));
    queue = run.catch(() => null);
    return run;
}
