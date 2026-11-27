import StampOverlay from '@/components/stamp-overlay';
import { block as blockFeed, unblock as unblockFeed } from '@/lib/feed-video';
import { useT } from '@/lib/i18n';
import { toggle as toggleAudio } from '@/lib/player';
import { qualityLabel, useStream } from '@/lib/stream';
import { formatDuration } from '@/lib/use-uploads';
import { tileAt, type Thumbs } from '@/lib/video-preview';
import { useWatchReport } from '@/lib/watch';
import {
    AlertTriangle,
    Check,
    FastForward,
    Gauge,
    LoaderCircle,
    Maximize,
    Minimize,
    Pause,
    PictureInPicture2,
    Play,
    Rewind,
    RotateCcw,
    Settings2,
    Volume1,
    Volume2,
    VolumeX,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const SKIP = 10;
const HIDE_AFTER = 2600;

/** Only one video plays at a time across the app. */
let playingNow: HTMLVideoElement | null = null;

function stored(key: string): string | null {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}
function store(key: string, value: string | null) {
    try {
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
    } catch {
        /* private mode: nothing remembered */
    }
}

type Flash = { icon: ReactNode; label?: string; key: number; side?: -1 | 0 | 1 };

/**
 * The app's video player. Own controls (the same on every browser), with:
 *  - a still frame before it plays (when the uploader's browser made one), so nothing loads until it's played;
 *  - a seek bar showing what's loaded, the time and a frame under the pointer, and drag-to-scrub;
 *  - volume (remembered), speed, picture-in-picture, and full screen of the whole player, so the viewer-ID
 *    stamp on paid videos stays on screen in full screen too (PiP and downloads are off for those);
 *  - phones: tap shows the controls, double-tap the sides skips 10 s, double-tap the middle likes;
 *  - keyboard: Space/K play, ←/→ or J/L skip, ↑/↓ volume, M mute, F full screen, 0–9 jump, </> speed;
 *  - long videos continue where you left off; scrolling a video off screen pauses it; one plays at a time.
 */
export default function VideoPlayer({
    src,
    id,
    stamp,
    poster,
    thumbs,
    hls,
    watchId,
    duration: knownDuration,
    autoPlay = false,
    startAt,
    className = '',
    videoClassName = 'max-h-[640px] w-full',
    onDoubleTap,
}: {
    src: string;
    /** Used to remember where a long video was left off. */
    id?: string | number;
    /** The viewer's ID shown over a paid video. */
    stamp?: string | null;
    /** A still frame shown before it plays (App\Media\Previews). */
    poster?: string | null;
    /** Adaptive streaming (App\Media\Hls): used instead of `src` where it can be, `src` stays the fallback. */
    hls?: string | null;
    /** A post's video: report how much is watched, for the creator's insights. */
    watchId?: number;
    /** Frames shown above the seek bar while scrubbing. */
    thumbs?: Thumbs | null;
    /** Its length, when known before loading (shown on the still). */
    duration?: number | null;
    autoPlay?: boolean;
    /** Start here (seconds), e.g. where the feed preview was when it was opened. */
    startAt?: number;
    className?: string;
    videoClassName?: string;
    /** Double-tap / double-click in the middle (e.g. like the post). */
    onDoubleTap?: () => void;
}) {
    const { t } = useT();
    const root = useRef<HTMLDivElement>(null);
    const video = useRef<HTMLVideoElement>(null);
    const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
    const tapTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
    const lastTap = useRef(0);
    const flashKey = useRef(0);

    const [playing, setPlaying] = useState(false);
    const [started, setStarted] = useState(autoPlay);
    const [ended, setEnded] = useState(false);
    const [waiting, setWaiting] = useState(false);
    const [time, setTime] = useState(0);
    const [duration, setDuration] = useState(knownDuration ?? 0);
    const [buffered, setBuffered] = useState(0);
    const [volume, setVolumeState] = useState(() => Number(stored('vp.volume') ?? 1));
    const [muted, setMuted] = useState(() => stored('vp.muted') === '1');
    const [rate, setRate] = useState(1);
    const [controls, setControls] = useState(true);
    const [menu, setMenu] = useState(false);
    const stream = useStream(video, src, hls);
    useWatchReport(video, watchId);
    const [full, setFull] = useState(false);
    const [error, setError] = useState(false);
    const [flash, setFlash] = useState<Flash | null>(null);
    const [resumed, setResumed] = useState<number | null>(null);

    const posKey = id !== undefined ? `vp.pos.${id}` : null;
    const canPip = !stamp && typeof document !== 'undefined' && 'pictureInPictureEnabled' in document && document.pictureInPictureEnabled;

    const show = useCallback(() => {
        setControls(true);
        clearTimeout(hideTimer.current);
        hideTimer.current = setTimeout(() => {
            if (!video.current?.paused) setControls(false);
        }, HIDE_AFTER);
    }, []);

    const pop = (icon: ReactNode, label?: string, side: Flash['side'] = 0) => setFlash({ icon, label, side, key: ++flashKey.current });

    const togglePlay = useCallback(() => {
        const v = video.current;
        if (!v) return;
        if (v.paused || v.ended) {
            setError(false);
            void v.play().catch(() => {});
        } else v.pause();
    }, []);

    const seekTo = useCallback((s: number) => {
        const v = video.current;
        if (!v || !Number.isFinite(v.duration)) return;
        v.currentTime = Math.min(Math.max(0, s), v.duration);
        setTime(v.currentTime);
        setEnded(false);
    }, []);

    const skip = (by: number) => {
        const v = video.current;
        if (!v) return;
        seekTo(v.currentTime + by);
        pop(
            by < 0 ? <Rewind className="size-7 fill-current" /> : <FastForward className="size-7 fill-current" />,
            `${by > 0 ? '+' : ''}${by}s`,
            by < 0 ? -1 : 1,
        );
        show();
    };

    const applyVolume = (next: number, mute = next === 0) => {
        const v = video.current;
        const vol = Math.min(1, Math.max(0, next));
        if (v) {
            v.volume = vol;
            v.muted = mute;
        }
        setVolumeState(vol);
        setMuted(mute);
        store('vp.volume', String(vol));
        store('vp.muted', mute ? '1' : '0');
    };

    const toggleMute = () => applyVolume(muted && volume === 0 ? 0.6 : volume, !muted);

    const changeRate = (r: number) => {
        if (video.current) video.current.playbackRate = r;
        setRate(r);
    };

    const toggleFull = async () => {
        const el = root.current;
        const v = video.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
        if (!el) return;
        try {
            if (document.fullscreenElement) await document.exitFullscreen();
            else if (el.requestFullscreen) await el.requestFullscreen();
            // iPhone: only the bare video can go full screen, which would hide the stamp, so not for paid videos.
            else if (!stamp) v?.webkitEnterFullscreen?.();
        } catch {
            /* refused (e.g. not from a click) */
        }
    };
    const fullSupported = typeof document !== 'undefined' && (document.fullscreenEnabled || !stamp);

    const togglePip = async () => {
        const v = video.current;
        if (!v) return;
        try {
            if (document.pictureInPictureElement) await document.exitPictureInPicture();
            else await v.requestPictureInPicture();
        } catch {
            /* not allowed */
        }
    };

    // Wire the <video> element's events.
    useEffect(() => {
        const v = video.current;
        if (!v) return;
        v.volume = volume;
        v.muted = muted;
        let lastSave = 0;

        const onPlay = () => {
            if (playingNow && playingNow !== v) playingNow.pause();
            playingNow = v;
            blockFeed(v); // feed videos wait while this one plays
            if (!v.muted) toggleAudio(false); // the music player stops for a video with sound
            setPlaying(true);
            setStarted(true);
            setEnded(false);
            show();
        };
        const onPause = () => {
            setPlaying(false);
            setControls(true);
            if (playingNow === v) playingNow = null;
            unblockFeed(v);
            if (posKey && v.currentTime > 5 && !v.ended) store(posKey, String(Math.floor(v.currentTime)));
        };
        const onTime = () => {
            setTime(v.currentTime);
            const now = Date.now();
            if (posKey && v.duration > 60 && now - lastSave > 5000) {
                lastSave = now;
                store(posKey, v.currentTime > 5 && v.currentTime < v.duration - 10 ? String(Math.floor(v.currentTime)) : null);
            }
        };
        const onMeta = () => {
            setDuration(v.duration);
            if (startAt && startAt > 0 && Number.isFinite(v.duration) && startAt < v.duration - 0.5) {
                v.currentTime = startAt;
                setTime(startAt);
                return;
            }
            // Long videos pick up where they were left.
            const at = posKey ? Number(stored(posKey)) : 0;
            if (at > 5 && Number.isFinite(v.duration) && at < v.duration - 10) {
                v.currentTime = at;
                setTime(at);
                setResumed(at);
            }
        };
        const onProgress = () => {
            const b = v.buffered;
            for (let i = 0; i < b.length; i++) {
                if (b.start(i) <= v.currentTime + 0.5 && b.end(i) >= v.currentTime) return setBuffered(b.end(i));
            }
        };
        const onEnded = () => {
            setEnded(true);
            setControls(true);
            if (posKey) store(posKey, null);
        };
        const onWaiting = () => setWaiting(true);
        const onPlaying = () => setWaiting(false);
        const onError = () => {
            setError(true);
            setWaiting(false);
        };
        const onVolume = () => {
            setMuted(v.muted);
            setVolumeState(v.volume);
        };

        const events: [string, () => void][] = [
            ['play', onPlay],
            ['pause', onPause],
            ['timeupdate', onTime],
            ['loadedmetadata', onMeta],
            ['durationchange', () => setDuration(v.duration)],
            ['progress', onProgress],
            ['ended', onEnded],
            ['waiting', onWaiting],
            ['playing', onPlaying],
            ['canplay', onPlaying],
            ['error', onError],
            ['volumechange', onVolume],
        ];
        events.forEach(([e, f]) => v.addEventListener(e, f));
        return () => {
            events.forEach(([e, f]) => v.removeEventListener(e, f));
            if (playingNow === v) playingNow = null;
            unblockFeed(v);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [src]);

    // Full screen state, and pausing when scrolled out of view.
    useEffect(() => {
        const onFull = () => setFull(document.fullscreenElement === root.current);
        document.addEventListener('fullscreenchange', onFull);
        const el = root.current;
        const io =
            el && 'IntersectionObserver' in window
                ? new IntersectionObserver(
                      ([entry]) => {
                          const v = video.current;
                          if (!entry.isIntersecting && v && !v.paused && !document.fullscreenElement && document.pictureInPictureElement !== v)
                              v.pause();
                      },
                      { threshold: 0.2 },
                  )
                : null;
        if (el) io?.observe(el);
        return () => {
            document.removeEventListener('fullscreenchange', onFull);
            io?.disconnect();
            clearTimeout(hideTimer.current);
            clearTimeout(tapTimer.current);
        };
    }, []);

    useEffect(() => {
        if (resumed === null) return;
        const id = setTimeout(() => setResumed(null), 6000);
        return () => clearTimeout(id);
    }, [resumed]);

    // Taps and clicks on the picture.
    function onSurface(e: PointerEvent<HTMLDivElement>) {
        if (e.button > 0) return; // right or middle click
        const rect = e.currentTarget.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width;
        const zone: -1 | 0 | 1 = x < 0.33 ? -1 : x > 0.67 ? 1 : 0;
        const now = Date.now();
        const double = now - lastTap.current < 300;
        lastTap.current = double ? 0 : now;

        if (e.pointerType === 'mouse') {
            // Click plays/pauses at once; a double-click goes full screen (undoing the second play/pause).
            if (double) {
                togglePlay();
                void toggleFull();
            } else {
                togglePlay();
                pop(video.current?.paused ? <Pause className="size-8 fill-current" /> : <Play className="size-8 fill-current" />);
            }
            return;
        }

        // Touch: the first tap of a not-yet-started video plays it.
        if (!started) return togglePlay();
        clearTimeout(tapTimer.current);
        if (double) {
            if (zone === 0) {
                if (onDoubleTap) onDoubleTap();
                else togglePlay();
            } else skip(zone * SKIP);
            return;
        }
        tapTimer.current = setTimeout(() => {
            if (controls && playing) setControls(false);
            else show();
        }, 300);
    }

    function onKey(e: KeyboardEvent<HTMLDivElement>) {
        if (e.altKey || e.ctrlKey || e.metaKey || (e.target as HTMLElement).closest('input')) return;
        const v = video.current;
        if (!v) return;
        const k = e.key;
        let handled = true;
        if (k === ' ' || k === 'k' || k === 'K') {
            togglePlay();
            pop(v.paused ? <Pause className="size-8 fill-current" /> : <Play className="size-8 fill-current" />);
        } else if (k === 'ArrowLeft') skip(-5);
        else if (k === 'ArrowRight') skip(5);
        else if (k === 'j' || k === 'J') skip(-SKIP);
        else if (k === 'l' || k === 'L') skip(SKIP);
        else if (k === 'ArrowUp' || k === 'ArrowDown') {
            const next = Math.round((volume + (k === 'ArrowUp' ? 0.1 : -0.1)) * 10) / 10;
            applyVolume(next, next <= 0);
            pop(<Volume2 className="size-7" />, `${Math.round(Math.max(0, Math.min(1, next)) * 100)}%`);
        } else if (k === 'm' || k === 'M') toggleMute();
        else if (k === 'f' || k === 'F') void toggleFull();
        else if (/^[0-9]$/.test(k)) seekTo((Number(k) / 10) * (v.duration || 0));
        else if (k === '<' || k === '>') {
            const i = SPEEDS.indexOf(rate);
            const r = SPEEDS[Math.min(SPEEDS.length - 1, Math.max(0, i + (k === '>' ? 1 : -1)))];
            changeRate(r);
            pop(<Gauge className="size-7" />, `${r}×`);
        } else handled = false;
        if (handled) {
            e.preventDefault();
            e.stopPropagation(); // the lightbox's own arrow keys don't fire while the player has focus
            show();
        }
    }

    const shown = controls || !playing || menu;
    const VolumeIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;
    const btn =
        'grid size-9 shrink-0 place-items-center rounded-full text-white transition hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-white/70 outline-none';

    return (
        <div
            ref={root}
            tabIndex={0}
            onKeyDown={onKey}
            onPointerMove={(e) => e.pointerType === 'mouse' && show()}
            onPointerLeave={() => playing && !menu && setControls(false)}
            onContextMenu={stamp ? (e) => e.preventDefault() : undefined}
            aria-label={t('vp.player')}
            className={`group/vp relative isolate overflow-hidden bg-black outline-none select-none focus-visible:ring-2 focus-visible:ring-white/60 ${
                full ? 'grid size-full place-items-center' : ''
            } ${shown ? '' : 'cursor-none'} ${className}`}
        >
            <video
                ref={video}
                // With a still, nothing loads until play; without one, the fragment makes browsers show the first frame.
                src={stream.mode !== 'file' ? stream.src : autoPlay || poster ? src : `${src}#t=0.1`}
                poster={poster ?? undefined}
                autoPlay={autoPlay}
                playsInline
                preload={poster && !autoPlay ? 'none' : 'metadata'}
                disablePictureInPicture={!!stamp}
                disableRemotePlayback={!!stamp}
                controlsList={stamp ? 'nodownload noremoteplayback' : undefined}
                className={`block bg-black object-contain ${full ? 'size-full max-h-none' : videoClassName}`}
            />
            <StampOverlay text={stamp} />

            {/* The picture itself: taps and clicks. */}
            <div className="absolute inset-0 z-[2] touch-manipulation" onPointerUp={onSurface} />

            {/* Feedback for a skip, volume or play/pause, in the middle or on the side that was tapped. */}
            {flash && (
                <span
                    key={flash.key}
                    onAnimationEnd={() => setFlash(null)}
                    className={`animate-vp-flash pointer-events-none absolute top-1/2 z-[3] flex -translate-y-1/2 flex-col items-center gap-1 text-white ${
                        flash.side === -1 ? 'left-[16%]' : flash.side === 1 ? 'right-[16%]' : 'left-1/2 -translate-x-1/2'
                    }`}
                >
                    <span className="grid size-16 place-items-center rounded-full bg-black/45 backdrop-blur-sm">{flash.icon}</span>
                    {flash.label && <span className="rounded-full bg-black/45 px-2 py-0.5 text-xs font-bold tabular-nums">{flash.label}</span>}
                </span>
            )}

            {/* Before the first play: a big play button and the length. */}
            {!started && !error && (
                <>
                    <button
                        type="button"
                        onClick={togglePlay}
                        className="absolute top-1/2 left-1/2 z-[3] grid size-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-black/55 text-white shadow-lg ring-1 ring-white/20 backdrop-blur-md transition hover:scale-105 hover:bg-black/70 sm:size-[4.5rem]"
                        aria-label={t('vp.play')}
                    >
                        <Play className="size-7 translate-x-0.5 fill-current sm:size-8" />
                    </button>
                    {duration > 0 && (
                        <span className="pointer-events-none absolute right-2.5 bottom-2.5 z-[3] rounded-md bg-black/65 px-1.5 py-0.5 text-xs font-bold text-white tabular-nums">
                            {formatDuration(duration)}
                        </span>
                    )}
                </>
            )}

            {waiting && playing && (
                <LoaderCircle className="pointer-events-none absolute top-1/2 left-1/2 z-[3] size-12 -translate-x-1/2 -translate-y-1/2 animate-spin text-white/90 drop-shadow" />
            )}

            {ended && (
                <button
                    type="button"
                    onClick={togglePlay}
                    className="absolute top-1/2 left-1/2 z-[3] flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5 text-sm font-bold text-white"
                >
                    <span className="grid size-16 place-items-center rounded-full bg-black/55 ring-1 ring-white/20 backdrop-blur-md transition hover:bg-black/70">
                        <RotateCcw className="size-7" />
                    </span>
                    {t('vp.replay')}
                </button>
            )}

            {error && (
                <div className="absolute inset-0 z-[4] flex flex-col items-center justify-center gap-2 bg-black/80 p-4 text-center text-white">
                    <AlertTriangle className="size-8 text-amber-300" />
                    <p className="max-w-64 text-sm font-semibold">{t('vp.error')}</p>
                    <button
                        type="button"
                        onClick={() => {
                            setError(false);
                            video.current?.load();
                        }}
                        className="mt-1 h-8 rounded-full bg-white px-4 text-xs font-bold text-zinc-900 hover:bg-zinc-100"
                    >
                        {t('vp.retry')}
                    </button>
                </div>
            )}

            {resumed !== null && started && (
                <div className="animate-toast-in absolute top-3 left-1/2 z-[4] flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/70 py-1 pr-1 pl-3 text-xs font-semibold whitespace-nowrap text-white backdrop-blur-md">
                    {t('vp.resumed', { time: formatDuration(resumed) })}
                    <button
                        type="button"
                        onClick={() => {
                            seekTo(0);
                            setResumed(null);
                        }}
                        className="rounded-full bg-white/15 px-2.5 py-1 font-bold transition hover:bg-white/25"
                    >
                        {t('vp.startOver')}
                    </button>
                </div>
            )}

            {/* Controls. */}
            {started && !error && (
                <div
                    className={`@container absolute inset-x-0 bottom-0 z-[4] bg-gradient-to-t from-black/80 via-black/40 to-transparent px-2.5 pt-10 pb-1.5 transition-opacity duration-300 ${
                        shown ? 'opacity-100' : 'pointer-events-none opacity-0'
                    }`}
                    onPointerUp={(e) => e.stopPropagation()}
                >
                    <SeekBar
                        time={time}
                        duration={duration}
                        buffered={buffered}
                        thumbs={thumbs}
                        onSeek={seekTo}
                        onScrub={show}
                        label={t('vp.seek')}
                    />

                    <div className="mt-0.5 flex items-center gap-0.5">
                        <button
                            type="button"
                            onClick={togglePlay}
                            className={btn}
                            aria-label={t(playing ? 'vp.pause' : 'vp.play')}
                            title={t(playing ? 'vp.pause' : 'vp.play')}
                        >
                            {playing ? (
                                <Pause className="size-5 fill-current" />
                            ) : ended ? (
                                <RotateCcw className="size-5" />
                            ) : (
                                <Play className="size-5 translate-x-px fill-current" />
                            )}
                        </button>
                        <button
                            type="button"
                            onClick={() => skip(-SKIP)}
                            className={`${btn} hidden @sm:grid`}
                            aria-label={t('vp.back')}
                            title={t('vp.back')}
                        >
                            <SkipIcon dir={-1} />
                        </button>
                        <button
                            type="button"
                            onClick={() => skip(SKIP)}
                            className={`${btn} hidden @sm:grid`}
                            aria-label={t('vp.forward')}
                            title={t('vp.forward')}
                        >
                            <SkipIcon dir={1} />
                        </button>

                        <div className="group/vol flex items-center">
                            <button
                                type="button"
                                onClick={toggleMute}
                                className={btn}
                                aria-label={t(muted ? 'vp.unmute' : 'vp.mute')}
                                title={t(muted ? 'vp.unmute' : 'vp.mute')}
                            >
                                <VolumeIcon className="size-5" />
                            </button>
                            <input
                                type="range"
                                min={0}
                                max={1}
                                step={0.05}
                                value={muted ? 0 : volume}
                                onChange={(e) => applyVolume(Number(e.target.value))}
                                aria-label={t('vp.volume')}
                                className="hidden h-1 w-0 cursor-pointer accent-white opacity-0 transition-all duration-200 group-focus-within/vol:w-20 group-focus-within/vol:opacity-100 group-hover/vol:w-20 group-hover/vol:opacity-100 @md:block"
                            />
                        </div>

                        <span className="ml-1.5 text-xs font-semibold whitespace-nowrap text-white tabular-nums @xs:text-[13px]">
                            {formatDuration(time)}
                            <span className="text-white/60"> / {formatDuration(duration || 0)}</span>
                        </span>

                        <span className="flex-1" />

                        <div className="relative">
                            <button
                                type="button"
                                onClick={() => setMenu((m) => !m)}
                                className={`${btn} w-auto min-w-9 px-2 text-xs font-bold`}
                                aria-label={t(stream.qualities.length > 1 ? 'vp.settings' : 'vp.speed')}
                                aria-expanded={menu}
                                title={t(stream.qualities.length > 1 ? 'vp.settings' : 'vp.speed')}
                            >
                                {rate !== 1 ? (
                                    `${rate}×`
                                ) : stream.qualities.length > 1 ? (
                                    <Settings2 className="size-5" />
                                ) : (
                                    <Gauge className="size-5" />
                                )}
                            </button>
                            {menu && (
                                <>
                                    <div className="fixed inset-0 z-0" onClick={() => setMenu(false)} />
                                    <ul
                                        role="menu"
                                        className="animate-toast-in absolute right-0 bottom-11 z-10 w-36 overflow-hidden rounded-xl bg-zinc-900/95 py-1 text-sm text-white shadow-xl ring-1 ring-white/10 backdrop-blur-md"
                                    >
                                        <li className="px-3 pt-1 pb-1.5 text-[11px] font-semibold tracking-wide text-white/50 uppercase">
                                            {t('vp.speed')}
                                        </li>
                                        {SPEEDS.map((r) => (
                                            <li key={r}>
                                                <button
                                                    type="button"
                                                    role="menuitemradio"
                                                    aria-checked={rate === r}
                                                    onClick={() => {
                                                        changeRate(r);
                                                        setMenu(false);
                                                    }}
                                                    className="flex w-full items-center justify-between px-3 py-1.5 text-left font-medium tabular-nums hover:bg-white/10"
                                                >
                                                    {r === 1 ? t('vp.normal') : `${r}×`}
                                                    {rate === r && <Check className="size-4" />}
                                                </button>
                                            </li>
                                        ))}
                                        {stream.qualities.length > 1 && (
                                            <>
                                                <li className="mt-1 border-t border-white/10 px-3 pt-2 pb-1.5 text-[11px] font-semibold tracking-wide text-white/50 uppercase">
                                                    {t('vp.quality')}
                                                </li>
                                                {[
                                                    -1,
                                                    ...[...stream.qualities]
                                                        .sort((a, b) => b.height * b.width - a.height * a.width)
                                                        .map((q) => q.index),
                                                ].map((i) => {
                                                    const q = stream.qualities.find((x) => x.index === i);
                                                    const playing = stream.qualities.find((x) => x.index === stream.current);
                                                    return (
                                                        <li key={i}>
                                                            <button
                                                                type="button"
                                                                role="menuitemradio"
                                                                aria-checked={stream.level === i}
                                                                onClick={() => {
                                                                    stream.setLevel(i);
                                                                    setMenu(false);
                                                                }}
                                                                className="flex w-full items-center justify-between px-3 py-1.5 text-left font-medium tabular-nums hover:bg-white/10"
                                                            >
                                                                <span>
                                                                    {q ? qualityLabel(q) : t('vp.auto')}
                                                                    {!q && playing && (
                                                                        <span className="text-white/50"> · {qualityLabel(playing)}</span>
                                                                    )}
                                                                </span>
                                                                {stream.level === i && <Check className="size-4" />}
                                                            </button>
                                                        </li>
                                                    );
                                                })}
                                            </>
                                        )}
                                    </ul>
                                </>
                            )}
                        </div>
                        {canPip && (
                            <button
                                type="button"
                                onClick={togglePip}
                                className={`${btn} hidden @sm:grid`}
                                aria-label={t('vp.pip')}
                                title={t('vp.pip')}
                            >
                                <PictureInPicture2 className="size-5" />
                            </button>
                        )}
                        {fullSupported && (
                            <button
                                type="button"
                                onClick={() => void toggleFull()}
                                className={btn}
                                aria-label={t(full ? 'vp.exitFullscreen' : 'vp.fullscreen')}
                                title={t(full ? 'vp.exitFullscreen' : 'vp.fullscreen')}
                            >
                                {full ? <Minimize className="size-5" /> : <Maximize className="size-5" />}
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

/** A circular arrow with "10" inside, like most players. */
function SkipIcon({ dir }: { dir: -1 | 1 }) {
    return (
        <span className="relative grid size-6 place-items-center">
            <RotateCcw className={`absolute size-6 ${dir === 1 ? '-scale-x-100' : ''}`} strokeWidth={1.75} />
            <span className="pt-px text-[8px] font-extrabold">{SKIP}</span>
        </span>
    );
}

/**
 * Played (brand colour), loaded (lighter) and the rest; drag to scrub, with the time (and, when the video has
 * them, a frame from that moment) shown above the pointer.
 */
function SeekBar({
    time,
    duration,
    buffered,
    thumbs,
    onSeek,
    onScrub,
    label,
}: {
    time: number;
    duration: number;
    buffered: number;
    thumbs?: Thumbs | null;
    onSeek: (s: number) => void;
    onScrub: () => void;
    label: string;
}) {
    const bar = useRef<HTMLDivElement>(null);
    const [hover, setHover] = useState<number | null>(null);
    const [drag, setDrag] = useState<number | null>(null);
    const at = (clientX: number) => {
        const r = bar.current!.getBoundingClientRect();
        return Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    };
    const pct = (s: number) => (duration ? (s / duration) * 100 : 0);
    const shownTime = drag !== null ? drag * duration : time;
    const tip = drag ?? hover;

    // Fetch the frames once the controls are up, so the first hover already has them.
    const [thumbsReady, setThumbsReady] = useState(false);
    useEffect(() => {
        if (!thumbs) return;
        let live = true;
        const img = new Image();
        img.onload = () => live && setThumbsReady(true);
        img.src = thumbs.url;
        return () => {
            live = false;
        };
    }, [thumbs]);
    // Shown smaller on narrow players (phones), so the frame never covers most of the picture.
    const scale = thumbs && bar.current && bar.current.clientWidth < 360 ? 0.75 : 1;
    const frame =
        tip !== null && duration > 0 && thumbs && thumbsReady
            ? { ...tileAt(thumbs, tip * duration), w: thumbs.w * scale, h: thumbs.h * scale }
            : null;

    return (
        <div
            ref={bar}
            role="slider"
            tabIndex={-1}
            aria-label={label}
            aria-valuemin={0}
            aria-valuemax={Math.round(duration)}
            aria-valuenow={Math.round(time)}
            aria-valuetext={`${formatDuration(time)} / ${formatDuration(duration)}`}
            className="group/seek relative flex h-4 cursor-pointer touch-none items-center"
            onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                setDrag(at(e.clientX));
                onScrub();
            }}
            onPointerMove={(e) => {
                const x = at(e.clientX);
                if (e.pointerType === 'mouse') setHover(x);
                if (drag !== null) {
                    setDrag(x);
                    onScrub();
                }
            }}
            onPointerUp={(e) => {
                if (drag !== null) onSeek(at(e.clientX) * duration);
                setDrag(null);
            }}
            onPointerCancel={() => setDrag(null)}
            onPointerLeave={() => setHover(null)}
        >
            <div
                className={`relative w-full overflow-hidden rounded-full bg-white/25 transition-[height] duration-150 ${drag !== null ? 'h-1.5' : 'h-1 group-hover/seek:h-1.5'}`}
            >
                <div className="absolute inset-y-0 left-0 bg-white/40" style={{ width: `${pct(buffered)}%` }} />
                {hover !== null && drag === null && <div className="absolute inset-y-0 left-0 bg-white/30" style={{ width: `${hover * 100}%` }} />}
                <div className="bg-primary absolute inset-y-0 left-0" style={{ width: `${pct(shownTime)}%` }} />
            </div>
            <span
                className={`bg-primary pointer-events-none absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full shadow ring-2 ring-white transition-transform duration-150 ${
                    drag !== null ? 'scale-110' : 'scale-0 group-hover/seek:scale-100'
                }`}
                style={{ left: `${pct(shownTime)}%` }}
            />
            {tip !== null && duration > 0 && frame && thumbs && (
                <span
                    className="pointer-events-none absolute bottom-5 flex -translate-x-1/2 flex-col items-center gap-1"
                    style={{ left: `clamp(${frame.w / 2 + 4}px, ${tip * 100}%, calc(100% - ${frame.w / 2 + 4}px))` }}
                >
                    <span
                        className="block overflow-hidden rounded-md bg-black bg-no-repeat shadow-lg ring-2 ring-white/90"
                        style={{
                            width: frame.w,
                            height: frame.h,
                            backgroundImage: `url("${thumbs.url}")`,
                            backgroundPosition: `-${frame.x * scale}px -${frame.y * scale}px`,
                            backgroundSize: `${thumbs.cols * frame.w}px auto`,
                        }}
                    />
                    <span className="rounded-md bg-black/85 px-1.5 py-0.5 text-[11px] font-bold text-white tabular-nums">
                        {formatDuration(tip * duration)}
                    </span>
                </span>
            )}
            {tip !== null && duration > 0 && !frame && (
                <span
                    className="pointer-events-none absolute bottom-5 -translate-x-1/2 rounded-md bg-black/85 px-1.5 py-0.5 text-[11px] font-bold text-white tabular-nums"
                    style={{ left: `clamp(1.5rem, ${tip * 100}%, calc(100% - 1.5rem))` }}
                >
                    {formatDuration(tip * duration)}
                </span>
            )}
        </div>
    );
}
