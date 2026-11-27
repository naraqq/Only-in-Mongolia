import { toggle as toggleAudio } from '@/lib/player';
import { useSyncExternalStore } from 'react';

/**
 * Videos in the feed behave like on other social apps: the one that's most on screen plays by itself, muted,
 * and the rest wait. Sound is one switch for the whole feed: turn it on for one video and the next ones play
 * with sound too (until the page is reloaded; browsers don't allow sound before a tap anyway).
 *
 * No autoplay for people who asked for less motion or to save data; they get a play button instead.
 * Autoplay also stops while a "real" player (full screen viewer, chat) is playing, or the tab is hidden.
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

export function canAutoplay(): boolean {
    if (typeof window === 'undefined') return false;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false;
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    return !connection?.saveData;
}

function pick() {
    scheduled = false;
    let best: HTMLVideoElement | null = null;
    let bestScore = -Infinity;
    if (!document.hidden && blockers.size === 0 && canAutoplay()) {
        const middle = window.innerHeight / 2;
        for (const [el, e] of entries) {
            if (e.pinned && e.enabled && e.ratio >= MIN_VISIBLE) {
                best = el; // the one the viewer started
                break;
            }
        }
        for (const [el, e] of best ? [] : entries) {
            if (!e.enabled || e.done || e.held || e.ratio < MIN_VISIBLE) continue;
            // Most visible wins; between equally visible ones, the one nearest the middle of the screen.
            const r = el.getBoundingClientRect();
            const score = e.ratio * 10 - Math.abs(r.top + r.height / 2 - middle) / window.innerHeight;
            if (score > bestScore) {
                bestScore = score;
                best = el;
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
    if (e) e.done = true;
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
