import { toggle as toggleAudio } from '@/lib/player';
import { useSyncExternalStore } from 'react';

/**
 * Videos in the feed: nothing plays by itself while scrolling. A video plays when the viewer taps it, one at a
 * time, and stops when it's scrolled off screen (or the tab is hidden, or a "real" player such as a chat video
 * starts). Sound is one switch for the whole feed: turn it on for one video and the next ones play with sound
 * too (until the page is reloaded).
 */

/**
 * held: paused by the viewer (autoplay leaves it alone until it has left the screen);
 * pinned: started by the viewer (it wins over the automatic choice while it's on screen).
 */
type Entry = { ratio: number; enabled: boolean; done: boolean; held: boolean; pinned: boolean };

const entries = new Map<HTMLVideoElement, Entry>();
const blockers = new Set<unknown>();
let soundOn = false;
const soundListeners = new Set<() => void>();
let scheduled = false;

/** Share of a video that must be on screen before it plays. */
const MIN_VISIBLE = 0.6;

function pick() {
    scheduled = false;
    let best: HTMLVideoElement | null = null;
    // Only the one the viewer started may play, while it's (mostly) on screen.
    if (!document.hidden && blockers.size === 0) {
        for (const [el, e] of entries) {
            if (e.pinned && e.enabled && !e.done && e.ratio >= MIN_VISIBLE) {
                best = el;
                break;
            }
        }
    }
    for (const [el, e] of entries) {
        if (el === best) {
            if (el.paused && !e.held) start(el);
        } else if (!el.paused) el.pause();
    }
}

function start(el: HTMLVideoElement) {
    el.muted = !soundOn;
    el.play().catch(() => {
        // Sound not allowed yet (no tap on the page so far): play muted instead.
        if (!el.muted) {
            setFeedSound(false);
            el.play().catch(() => {});
        }
    });
}

/** Choose again on the next frame (after scrolling, a video appearing, the tab coming back…). */
export function reconsider() {
    if (scheduled || typeof window === 'undefined') return;
    scheduled = true;
    requestAnimationFrame(pick);
}

export function register(el: HTMLVideoElement): () => void {
    entries.set(el, { ratio: 0, enabled: true, done: false, held: false, pinned: false });
    if (entries.size === 1) {
        window.addEventListener('scroll', reconsider, { passive: true });
        document.addEventListener('visibilitychange', reconsider);
    }
    return () => {
        entries.delete(el);
        if (entries.size === 0) {
            window.removeEventListener('scroll', reconsider);
            document.removeEventListener('visibilitychange', reconsider);
        }
        reconsider();
    };
}

/** How much of the video is on screen (0–1). Leaving the screen makes a finished video eligible again. */
export function report(el: HTMLVideoElement, ratio: number) {
    const e = entries.get(el);
    if (!e) return;
    e.ratio = ratio;
    if (ratio === 0) {
        // Scrolled away: next time it's on screen, it's an ordinary feed video again.
        e.done = false;
        e.held = false;
        e.pinned = false;
    } else if (ratio < MIN_VISIBLE) {
        e.pinned = false;
    }
    reconsider();
}

/** The viewer paused it: it stays paused (until it has left the screen). */
export function hold(el: HTMLVideoElement) {
    const e = entries.get(el);
    if (!e) return;
    e.held = true;
    e.pinned = false;
    el.pause();
    reconsider();
}

/** The viewer started it: it plays (and the others stop) while it's on screen. */
export function playNow(el: HTMLVideoElement) {
    const e = entries.get(el);
    if (!e) {
        void el.play().catch(() => {});
        return;
    }
    e.held = false;
    e.done = false;
    e.pinned = true;
    for (const other of entries.keys()) if (other !== el && !other.paused) other.pause();
    start(el);
}

/** Take a video out of the running (e.g. while its post is open full screen). */
export function setEnabled(el: HTMLVideoElement, enabled: boolean) {
    const e = entries.get(el);
    if (!e || e.enabled === enabled) return;
    e.enabled = enabled;
    reconsider();
}

/** A long video played to the end: don't start it over while it's still on screen. */
export function finished(el: HTMLVideoElement) {
    const e = entries.get(el);
    if (e) {
        e.done = true;
        e.pinned = false;
    }
    reconsider();
}

/** A full player started: feed videos stop until it stops. */
export function block(key: unknown) {
    blockers.add(key);
    reconsider();
}
export function unblock(key: unknown) {
    if (blockers.delete(key)) reconsider();
}

export function setFeedSound(on: boolean) {
    soundOn = on;
    for (const el of entries.keys()) el.muted = !on;
    if (on) toggleAudio(false); // the music player makes way
    soundListeners.forEach((l) => l());
}

export function useFeedSound(): boolean {
    return useSyncExternalStore(
        (l) => {
            soundListeners.add(l);
            return () => soundListeners.delete(l);
        },
        () => soundOn,
        () => false,
    );
}

/** For tests. */
export function resetFeed() {
    entries.clear();
    blockers.clear();
    soundOn = false;
    scheduled = false;
}
