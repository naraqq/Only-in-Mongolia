import type Hls from 'hls.js';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

/**
 * Adaptive streaming (HLS) for longer videos (App\Media\Hls), with the single MP4 as the fallback:
 *  - Safari and iPhones play HLS themselves;
 *  - other browsers get hls.js, loaded only when a page has such a video;
 *  - anything else, or any streaming failure (network, the bucket not allowing it), plays the MP4 from where it was.
 * Nothing is downloaded until the video plays (or is set to load), so a feed full of videos stays light.
 */

export type Quality = { index: number; height: number; width: number; bitrate: number };

type Mode = 'native' | 'hlsjs' | 'file';

/** Streaming failed earlier in this visit (e.g. the bucket doesn't allow it yet): play files straight away. */
const OFF_KEY = 'stream.off';
function streamingOff(): boolean {
    try {
        return sessionStorage.getItem(OFF_KEY) === '1';
    } catch {
        return false;
    }
}
function turnStreamingOff() {
    try {
        sessionStorage.setItem(OFF_KEY, '1');
    } catch {
        /* private mode: each video finds out by itself */
    }
}

function pickMode(hls: string | null | undefined): Mode {
    if (!hls || typeof document === 'undefined' || streamingOff()) return 'file';
    // hls.js wherever it can run (it knows our fallback); the browser's own player only where it can't (older iPhones).
    // Newer Chrome also claims to play HLS itself, but not with pieces on another site, so it gets hls.js too.
    if (typeof window !== 'undefined' && ('MediaSource' in window || 'ManagedMediaSource' in window)) return 'hlsjs';
    return document.createElement('video').canPlayType('application/vnd.apple.mpegurl') ? 'native' : 'file';
}

/** "720p" for a quality, by its shorter side (phone videos are taller than wide). */
export const qualityLabel = (q: Pick<Quality, 'width' | 'height'>) => `${Math.min(q.width || q.height, q.height || q.width)}p`;

/**
 * $file: the MP4; $hls: the master playlist (or none). $active: false lets go of everything (e.g. a feed video while
 * the same video is open in the full player). Returns what to put in <video src> (undefined while hls.js drives it),
 * and the qualities to choose from (hls.js only).
 */
export function useStream(video: RefObject<HTMLVideoElement | null>, file: string, hls: string | null | undefined, active = true) {
    const [mode] = useState<Mode>(() => pickMode(hls));
    const [failed, setFailed] = useState(false);
    const [qualities, setQualities] = useState<Quality[]>([]);
    const [level, setLevelState] = useState(-1); // -1: automatic
    const [current, setCurrent] = useState(-1); // the quality playing now
    const instance = useRef<Hls | null>(null);
    const resumeAt = useRef(0);

    useEffect(() => {
        const v = video.current;
        if (mode !== 'hlsjs' || failed || !active || !hls || !v) return;
        let cancelled = false;
        let h: Hls | null = null;
        let started = false;
        const start = () => {
            if (!started && h) {
                started = true;
                h.startLoad(-1);
            }
        };

        void import('hls.js').then(({ default: HlsJs }) => {
            if (cancelled) return;
            if (!HlsJs.isSupported()) return setFailed(true);
            // A piece that won't load is tried once more, then it's the file: no long wait on a broken stream.
            const quick = { maxNumRetry: 1, retryDelayMs: 500, maxRetryDelayMs: 1000 };
            const policy = { default: { maxTimeToFirstByteMs: 8000, maxLoadTimeMs: 20000, timeoutRetry: quick, errorRetry: quick } };
            const player = new HlsJs({
                autoStartLoad: false,
                capLevelToPlayerSize: true,
                maxBufferLength: 30,
                startLevel: -1,
                fragLoadPolicy: policy,
                playlistLoadPolicy: policy,
                manifestLoadPolicy: policy,
            });
            h = player;
            instance.current = player;
            player.on(HlsJs.Events.MANIFEST_PARSED, (_e, data) =>
                setQualities(data.levels.map((l, index) => ({ index, height: l.height, width: l.width, bitrate: l.bitrate }))),
            );
            player.on(HlsJs.Events.LEVEL_SWITCHED, (_e, data) => setCurrent(data.level));
            let recovered = false;
            player.on(HlsJs.Events.ERROR, (_e, data) => {
                if (!data.fatal) return;
                if (data.type === HlsJs.ErrorTypes.MEDIA_ERROR && !recovered) {
                    recovered = true;
                    player.recoverMediaError();
                    return;
                }
                // Streaming isn't working here: the single file, from the same moment (and for the rest of the visit).
                turnStreamingOff();
                resumeAt.current = v.currentTime;
                player.destroy();
                instance.current = null;
                setFailed(true);
            });
            player.loadSource(hls);
            player.attachMedia(v);
            v.addEventListener('play', start);
            if (v.autoplay || !v.paused || v.preload === 'auto') start();
        });

        return () => {
            cancelled = true;
            v.removeEventListener('play', start);
            h?.destroy();
            instance.current = null;
            setQualities([]);
            setCurrent(-1);
        };
    }, [mode, failed, active, hls, video]);

    // The browser's own player failing (it can't tell us why): the file instead.
    useEffect(() => {
        const v = video.current;
        if (mode !== 'native' || failed || !v) return;
        const onError = () => {
            resumeAt.current = v.currentTime;
            turnStreamingOff();
            setFailed(true);
        };
        v.addEventListener('error', onError);
        return () => v.removeEventListener('error', onError);
    }, [mode, failed, video]);

    // After falling back to the file: carry on where streaming stopped, and keep playing if it was.
    useEffect(() => {
        const v = video.current;
        if (!failed || !v || resumeAt.current <= 0) return;
        const at = resumeAt.current;
        const resume = () => {
            if (Number.isFinite(v.duration) && at < v.duration) v.currentTime = at;
            void v.play().catch(() => {});
        };
        v.addEventListener('loadedmetadata', resume, { once: true });
        return () => v.removeEventListener('loadedmetadata', resume);
    }, [failed, video]);

    const setLevel = useCallback((index: number) => {
        setLevelState(index);
        if (instance.current) instance.current.currentLevel = index; // -1: back to automatic
    }, []);

    const effective: Mode = failed ? 'file' : mode;
    return {
        mode: effective,
        /** For <video src>: the playlist (Safari), nothing (hls.js attaches itself), or the file. */
        src: effective === 'native' ? (hls ?? undefined) : effective === 'hlsjs' ? undefined : file,
        qualities,
        level,
        current,
        setLevel,
    };
}
