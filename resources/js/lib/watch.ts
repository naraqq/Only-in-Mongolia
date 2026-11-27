import { useEffect, type RefObject } from 'react';

/**
 * Reports how much of a post's video is watched, for the creator's insights (InsightsController::watch): seconds
 * actually played (jumps and skipped-over parts don't count) and the furthest point reached. Sent every 15 seconds
 * while playing, on pause and at the end, and when the page is left. The server counts a play from 3 seconds.
 */

const EVERY_MS = 15_000;

function xsrf(): string {
    return decodeURIComponent(document.cookie.match(/(?:^|; )XSRF-TOKEN=([^;]*)/)?.[1] ?? '');
}

function send(mediaId: number, seconds: number, percent: number) {
    void fetch(route('posts.watch'), {
        method: 'POST',
        credentials: 'same-origin',
        keepalive: true, // still arrives when the page is being closed
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-XSRF-TOKEN': xsrf(), 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ media_id: mediaId, seconds, percent }),
    }).catch(() => {});
}

/** $mediaId: the post's video (none for message and library videos, which aren't counted). */
export function useWatchReport(video: RefObject<HTMLVideoElement | null>, mediaId: number | undefined) {
    useEffect(() => {
        const v = video.current;
        if (!v || !mediaId) return;
        let last: number | null = null; // where it was at the previous tick, while playing
        let played = 0; // seconds since the last report
        let furthest = 0;
        let reported = 0;

        const flush = () => {
            const seconds = Math.floor(played);
            if (seconds <= 0 && furthest <= reported) return;
            played -= seconds;
            reported = furthest;
            send(mediaId, seconds, furthest);
        };
        const onTime = () => {
            const now = v.currentTime;
            if (!v.paused && last !== null) {
                const step = now - last;
                if (step > 0 && step < 1.5 * Math.max(1, v.playbackRate)) played += step; // a normal tick, not a jump
            }
            last = now;
            if (Number.isFinite(v.duration) && v.duration > 0) furthest = Math.max(furthest, Math.min(100, Math.round((now / v.duration) * 100)));
        };
        const onSeeking = () => (last = null);
        const onEnded = () => {
            furthest = 100;
            flush();
        };
        const onHidden = () => document.visibilityState === 'hidden' && flush();
        const timer = setInterval(() => !v.paused && flush(), EVERY_MS);

        v.addEventListener('timeupdate', onTime);
        v.addEventListener('seeking', onSeeking);
        v.addEventListener('pause', flush);
        v.addEventListener('ended', onEnded);
        document.addEventListener('visibilitychange', onHidden);
        window.addEventListener('pagehide', flush);
        return () => {
            flush();
            clearInterval(timer);
            v.removeEventListener('timeupdate', onTime);
            v.removeEventListener('seeking', onSeeking);
            v.removeEventListener('pause', flush);
            v.removeEventListener('ended', onEnded);
            document.removeEventListener('visibilitychange', onHidden);
            window.removeEventListener('pagehide', flush);
        };
    }, [video, mediaId]);
}
