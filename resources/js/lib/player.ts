import { useSyncExternalStore } from 'react';

/**
 * The app's one audio player (music, podcasts). It lives outside the pages, so a track keeps playing while you
 * move around the app; the bar at the bottom (components/now-playing-bar.tsx) shows it, and every audio card in
 * posts, chats and the library drives it. Phones' lock screens and headphone buttons control it too.
 */

export type Track = {
    /** Stable id, e.g. "media-12", so a card knows it's the one playing. */
    key: string;
    src: string;
    title: string;
    artist?: string | null;
    artwork?: string | null;
    /** Where tapping the title goes (the post or chat). */
    href?: string | null;
    /** Viewer ID shown on paid audio. */
    stamp?: string | null;
};

type State = {
    track: Track | null;
    playing: boolean;
    loading: boolean;
    time: number;
    duration: number;
    rate: number;
    volume: number;
};

export const RATES = [1, 1.25, 1.5, 2];

let state: State = { track: null, playing: false, loading: false, time: 0, duration: 0, rate: 1, volume: 1 };
const listeners = new Set<() => void>();
const set = (patch: Partial<State>) => {
    state = { ...state, ...patch };
    listeners.forEach((l) => l());
};

let el: HTMLAudioElement | null = null;
let retried = '';

function audio(): HTMLAudioElement {
    if (el) return el;
    el = new Audio();
    el.preload = 'metadata';
    el.addEventListener('play', () => set({ playing: true }));
    el.addEventListener('pause', () => set({ playing: false }));
    el.addEventListener('ended', () => set({ playing: false, time: 0 }));
    el.addEventListener('waiting', () => set({ loading: true }));
    el.addEventListener('playing', () => set({ loading: false }));
    el.addEventListener('canplay', () => set({ loading: false }));
    el.addEventListener('timeupdate', () => set({ time: el!.currentTime }));
    el.addEventListener('durationchange', () => set({ duration: Number.isFinite(el!.duration) ? el!.duration : 0 }));
    // A signed storage link can expire during a long episode: fetch a fresh one once and carry on from the same spot.
    el.addEventListener('error', () => {
        const t = state.track;
        if (!t || retried === t.key) return set({ playing: false, loading: false });
        retried = t.key;
        const at = state.time;
        el!.src = `${t.src}${t.src.includes('?') ? '&' : '?'}r=${Date.now()}`;
        el!.currentTime = at;
        void el!.play().catch(() => set({ playing: false }));
    });
    return el;
}

function mediaSession(t: Track) {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
        title: t.title,
        artist: t.artist ?? '',
        artwork: t.artwork ? [{ src: t.artwork, sizes: '512x512' }] : [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
    });
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
        ['play', () => toggle(true)],
        ['pause', () => toggle(false)],
        ['seekbackward', () => skip(-15)],
        ['seekforward', () => skip(15)],
        ['seekto', (d) => d.seekTime !== undefined && seek(d.seekTime)],
        ['stop', () => close()],
    ];
    handlers.forEach(([action, handler]) => {
        try {
            navigator.mediaSession.setActionHandler(action, handler);
        } catch {
            /* not supported on this browser */
        }
    });
}

/** Play a track (or resume it if it's the current one). */
export function play(t: Track) {
    const a = audio();
    if (state.track?.key !== t.key) {
        retried = '';
        a.src = t.src;
        a.playbackRate = state.rate;
        set({ track: t, time: 0, duration: 0, loading: true });
        mediaSession(t);
    }
    void a.play().catch(() => set({ playing: false, loading: false }));
}

/** Play/pause the current track (or force one way). */
export function toggle(on?: boolean) {
    const a = audio();
    if (!state.track) return;
    const want = on ?? a.paused;
    if (want) void a.play().catch(() => set({ playing: false }));
    else a.pause();
}

export function seek(seconds: number) {
    const a = audio();
    a.currentTime = Math.min(Math.max(0, seconds), state.duration || seconds);
    set({ time: a.currentTime });
}

export const skip = (by: number) => seek(state.time + by);

export function setRate(rate: number) {
    audio().playbackRate = rate;
    set({ rate });
}

export function setVolume(volume: number) {
    audio().volume = volume;
    set({ volume });
}

/** Stop and hide the player. */
export function close() {
    const a = audio();
    a.pause();
    a.removeAttribute('src');
    a.load();
    set({ track: null, playing: false, loading: false, time: 0, duration: 0 });
}

export function usePlayer(): State {
    return useSyncExternalStore(
        (l) => {
            listeners.add(l);
            return () => listeners.delete(l);
        },
        () => state,
        () => state,
    );
}

/** "1:05:09" / "4:07". */
export function clock(s: number): string {
    if (!Number.isFinite(s) || s < 0) return '0:00';
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60)
        .toString()
        .padStart(2, '0');
    return h ? `${h}:${m.toString().padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}
