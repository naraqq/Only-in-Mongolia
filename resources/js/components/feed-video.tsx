import StampOverlay from '@/components/stamp-overlay';
import { SeekBar } from '@/components/video-player';
import { canAutoplay, finished, hold, playNow, register, report, setEnabled, setFeedSound, useFeedSound } from '@/lib/feed-video';
import { useT } from '@/lib/i18n';
import { useStream } from '@/lib/stream';
import { formatDuration } from '@/lib/use-uploads';
import { type Thumbs } from '@/lib/video-preview';
import { useWatchReport } from '@/lib/watch';
import { AlertTriangle, LoaderCircle, Maximize, Minimize, Pause, Play, Volume2, VolumeX } from 'lucide-react';
import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';

/** Videos up to this long loop in the feed, like reels; longer ones stop at the end. */
const LOOP_UP_TO = 60;

/**
 * A video in the feed, played where it is, the way social apps do: it starts by itself (muted) when it's the one
 * on screen; a tap or click pauses and resumes it (a double tap likes); a progress bar to scrub (with frames from
 * the video when it has them), sound, and full screen of this same video, carrying on from the same moment.
 * Which feed video plays, and whether the feed has sound, is decided in lib/feed-video.
 */
export default function FeedVideo({
    src,
    stamp,
    poster,
    hls,
    thumbs,
    watchId,
    duration: knownDuration,
    onDoubleTap,
    active = true,
    className = '',
    videoClassName = 'max-h-[640px] w-full',
}: {
    src: string;
    /** The viewer's ID shown over a paid video. */
    stamp?: string | null;
    /** A still frame shown until it plays (nothing loads before then). */
    poster?: string | null;
    /** Adaptive streaming (App\Media\Hls), when the video has it. */
    hls?: string | null;
    /** A post's video: report how much is watched, for the creator's insights. */
    watchId?: number;
    /** Its length, when known before loading. */
    duration?: number | null;
    /** Frames shown above the progress bar while scrubbing. */
    thumbs?: Thumbs | null;
    onDoubleTap?: () => void;
    /** False while the post's photos are open full screen: this one stays still meanwhile. */
    active?: boolean;
    className?: string;
    videoClassName?: string;
}) {
    const { t } = useT();
    const root = useRef<HTMLDivElement>(null);
    const video = useRef<HTMLVideoElement>(null);
    const streaming = useRef(false);
    const tapTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
    const lastTap = useRef(0);
    const sound = useFeedSound();
    const [auto] = useState(canAutoplay);
    const [playing, setPlaying] = useState(false);
    const [waiting, setWaiting] = useState(false);
    const [time, setTime] = useState(0);
    const [duration, setDuration] = useState(knownDuration ?? 0);
    const [error, setError] = useState(false);
    const [buffered, setBuffered] = useState(0);
    const [full, setFull] = useState(false);
    const [flash, setFlash] = useState<{ icon: ReactNode; key: number } | null>(null);

    useEffect(() => {
        const v = video.current;
        const el = root.current;
        if (!v || !el) return;
        const off = register(v);
        const io =
            'IntersectionObserver' in window
                ? new IntersectionObserver(([entry]) => report(v, entry.isIntersecting ? entry.intersectionRatio : 0), {
                      threshold: [0, 0.25, 0.5, 0.6, 0.75, 0.9, 1],
                  })
                : null;
        io?.observe(el);

        const events: [string, () => void][] = [
            ['play', () => setPlaying(true)],
            ['pause', () => setPlaying(false)],
            ['timeupdate', () => setTime(v.currentTime)],
            [
                'progress',
                () => {
                    const b = v.buffered;
                    for (let i = 0; i < b.length; i++) if (b.start(i) <= v.currentTime + 0.5 && b.end(i) >= v.currentTime) setBuffered(b.end(i));
                },
            ],
            ['loadedmetadata', () => setDuration(v.duration)],
            ['durationchange', () => setDuration(v.duration)],
            ['waiting', () => setWaiting(true)],
            ['playing', () => (setWaiting(false), setError(false))],
            ['canplay', () => (setWaiting(false), setError(false))],
            ['ended', () => finished(v)],
            [
                'error',
                () => {
                    // Streaming handles its own failures (falling back to the file); and no source isn't an error.
                    if (streaming.current || !v.getAttribute('src')) return;
                    setError(true);
                    setWaiting(false);
                },
            ],
        ];
        events.forEach(([e, f]) => v.addEventListener(e, f));
        return () => {
            off();
            io?.disconnect();
            events.forEach(([e, f]) => v.removeEventListener(e, f));
            clearTimeout(tapTimer.current);
        };
    }, [src]);

    // While the post is open in the full player, this one lets go of its download entirely (not just pauses):
    // a half-read stream keeps the connection busy, and the full player's copy of the same video would wait behind
    // it (on `php artisan serve` for up to a minute). It picks up again at the same moment when the player closes.
    const [released, setReleased] = useState(false);
    const stream = useStream(video, src, hls, !released);
    streaming.current = stream.mode !== 'file';
    useWatchReport(video, watchId);
    const resumeAt = useRef(0);
    useEffect(() => {
        const v = video.current;
        if (!v) return;
        setEnabled(v, active);
        if (!active) {
            resumeAt.current = v.currentTime;
            v.pause();
            setReleased(true);
        } else {
            setReleased(false);
        }
    }, [active]);
    useEffect(() => {
        const v = video.current;
        if (!v) return;
        if (released) {
            v.removeAttribute('src');
            v.load(); // aborts the download
            return;
        }
        const at = resumeAt.current;
        if (at > 0) {
            const restore = () => {
                if (Number.isFinite(v.duration) && at < v.duration) v.currentTime = at;
            };
            v.addEventListener('loadedmetadata', restore, { once: true });
            return () => v.removeEventListener('loadedmetadata', restore);
        }
    }, [released]);

    // Full screen of this player (the viewer's ID on paid videos stays on it), and back.
    useEffect(() => {
        const onFull = () => setFull(document.fullscreenElement === root.current);
        document.addEventListener('fullscreenchange', onFull);
        return () => document.removeEventListener('fullscreenchange', onFull);
    }, []);

    function togglePlay() {
        const v = video.current;
        if (!v) return;
        if (v.paused || v.ended) {
            playNow(v);
            setFlash({ icon: <Play className="size-7 translate-x-0.5 fill-current" />, key: Date.now() });
        } else {
            hold(v);
            setFlash({ icon: <Pause className="size-7 fill-current" />, key: Date.now() });
        }
    }

    async function toggleFull() {
        const el = root.current;
        const v = video.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
        if (!el || !v) return;
        try {
            if (document.fullscreenElement) return await document.exitFullscreen();
            setFeedSound(true); // full screen is for watching properly
            if (v.paused) playNow(v);
            if (el.requestFullscreen) await el.requestFullscreen();
            else if (!stamp) v.webkitEnterFullscreen?.(); // iPhone: only the bare video can (not for paid ones: the ID would hide)
        } catch {
            /* refused */
        }
    }

    function seekTo(s: number) {
        const v = video.current;
        if (!v || !Number.isFinite(v.duration)) return;
        v.currentTime = Math.min(Math.max(0, s), v.duration);
        setTime(v.currentTime);
    }

    // A tap or click pauses or plays it here; a second one right after it likes instead.
    function onSurface(e: PointerEvent<HTMLDivElement>) {
        if (e.button > 0) return; // right or middle click
        const now = Date.now();
        const double = now - lastTap.current < 300;
        lastTap.current = double ? 0 : now;
        clearTimeout(tapTimer.current);
        if (double && onDoubleTap) return onDoubleTap();
        if (double && !onDoubleTap) return void toggleFull();
        tapTimer.current = setTimeout(togglePlay, onDoubleTap ? 260 : 0);
    }

    const left = duration > 0 ? duration - time : 0;
    const loop = duration > 0 && duration <= LOOP_UP_TO;

    return (
        <div
            ref={root}
            onContextMenu={stamp ? (e) => e.preventDefault() : undefined}
            className={`group/fv relative isolate overflow-hidden bg-black select-none ${full ? 'grid size-full place-items-center' : ''} ${className}`}
        >
            <video
                ref={video}
                // With a still, nothing loads until it plays; without one, the fragment shows the first frame.
                src={
                    released
                        ? undefined
                        : stream.mode !== 'file'
                          ? stream.src
                          : poster
                            ? src
                            : `${src}#t=${resumeAt.current > 0 ? resumeAt.current : 0.1}`
                }
                poster={poster ?? undefined}
                muted
                playsInline
                loop={loop}
                preload={poster ? 'none' : 'metadata'}
                disablePictureInPicture
                disableRemotePlayback={!!stamp}
                controlsList="nodownload noremoteplayback"
                className={`block bg-black object-contain ${full ? 'size-full max-h-none' : videoClassName}`}
            />
            <StampOverlay text={stamp} />

            <div
                className="absolute inset-0 z-[2] cursor-pointer touch-manipulation"
                onPointerUp={onSurface}
                role="button"
                tabIndex={0}
                aria-label={t(playing ? 'vp.pause' : 'vp.play')}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ' || e.key === 'k' || e.key === 'K') {
                        e.preventDefault();
                        togglePlay();
                    } else if (e.key === 'm' || e.key === 'M') setFeedSound(!sound);
                    else if (e.key === 'f' || e.key === 'F') void toggleFull();
                    else if (e.key === 'ArrowLeft') seekTo((video.current?.currentTime ?? 0) - 5);
                    else if (e.key === 'ArrowRight') seekTo((video.current?.currentTime ?? 0) + 5);
                }}
            />

            {/* Feedback for a tap: play or pause, in the middle. */}
            {flash && (
                <span
                    key={flash.key}
                    onAnimationEnd={() => setFlash(null)}
                    className="animate-vp-flash pointer-events-none absolute top-1/2 left-1/2 z-[3] grid size-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-black/45 text-white backdrop-blur-sm"
                >
                    {flash.icon}
                </span>
            )}

            {/* Not playing (no autoplay for less motion / data saver, paused by the viewer, or an error): a play button. */}
            {(!auto || error || time > 0.5) && !playing && !flash && (
                <span className="pointer-events-none absolute top-1/2 left-1/2 z-[3] grid size-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-black/55 text-white shadow-lg ring-1 ring-white/20 backdrop-blur-md">
                    {error ? <AlertTriangle className="size-7 text-amber-300" /> : <Play className="size-7 translate-x-0.5 fill-current" />}
                </span>
            )}
            {waiting && playing && (
                <LoaderCircle className="pointer-events-none absolute top-1/2 left-1/2 z-[3] size-10 -translate-x-1/2 -translate-y-1/2 animate-spin text-white/90 drop-shadow" />
            )}

            {/* Time left, sound (for the whole feed) and full screen; under them, the progress to scrub. */}
            <div
                className="absolute inset-x-0 bottom-0 z-[3] bg-gradient-to-t from-black/60 to-transparent px-3 pt-8 pb-1.5"
                onPointerUp={(e) => e.stopPropagation()}
            >
                <div className="flex items-center gap-2">
                    {duration > 0 && (
                        <span className="pointer-events-none rounded-md bg-black/60 px-1.5 py-0.5 text-xs font-bold text-white tabular-nums backdrop-blur-sm">
                            {formatDuration(playing || time > 0.5 ? left : duration)}
                        </span>
                    )}
                    <span className="flex-1" />
                    {!error && (
                        <>
                            <BarButton label={t(sound ? 'vp.mute' : 'vp.unmute')} pressed={sound} onClick={() => setFeedSound(!sound)}>
                                {sound ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
                            </BarButton>
                            <BarButton label={t(full ? 'vp.exitFullscreen' : 'vp.fullscreen')} onClick={() => void toggleFull()}>
                                {full ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
                            </BarButton>
                        </>
                    )}
                </div>
                {duration > 0 && (playing || time > 0.5) && (
                    <SeekBar
                        time={time}
                        duration={duration}
                        buffered={buffered}
                        thumbs={thumbs}
                        onSeek={seekTo}
                        onScrub={() => {}}
                        label={t('vp.seek')}
                    />
                )}
            </div>
        </div>
    );
}

function BarButton({ label, pressed, onClick, children }: { label: string; pressed?: boolean; onClick: () => void; children: ReactNode }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="grid size-8 place-items-center rounded-full bg-black/60 text-white backdrop-blur-sm transition hover:scale-105 hover:bg-black/80"
            aria-label={label}
            aria-pressed={pressed}
            title={label}
        >
            {children}
        </button>
    );
}
