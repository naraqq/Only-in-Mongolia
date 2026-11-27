import StampOverlay from '@/components/stamp-overlay';
import { canAutoplay, finished, register, report, setEnabled, setFeedSound, useFeedSound } from '@/lib/feed-video';
import { useT } from '@/lib/i18n';
import { formatDuration } from '@/lib/use-uploads';
import { AlertTriangle, LoaderCircle, Play, Volume2, VolumeX } from 'lucide-react';
import { useEffect, useRef, useState, type PointerEvent } from 'react';

/** Videos up to this long loop in the feed, like reels; longer ones stop at the end. */
const LOOP_UP_TO = 60;

/**
 * A video in the feed, the way social apps show them: plays by itself (muted) when it's the one on screen,
 * with just a sound button, the time left and a thin progress line. Tap or click opens it in the full player
 * (with the post and comments beside it), continuing from the same moment; double-tap likes.
 * Which feed video plays, and whether the feed has sound, is decided in lib/feed-video.
 */
export default function FeedVideo({
    src,
    stamp,
    poster,
    duration: knownDuration,
    onOpen,
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
    /** Its length, when known before loading. */
    duration?: number | null;
    /** Open the full player at this many seconds. */
    onOpen: (seconds: number) => void;
    onDoubleTap?: () => void;
    /** False while the post is open in the full player: this one stays still meanwhile. */
    active?: boolean;
    className?: string;
    videoClassName?: string;
}) {
    const { t } = useT();
    const root = useRef<HTMLDivElement>(null);
    const video = useRef<HTMLVideoElement>(null);
    const tapTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
    const lastTap = useRef(0);
    const sound = useFeedSound();
    const [auto] = useState(canAutoplay);
    const [playing, setPlaying] = useState(false);
    const [waiting, setWaiting] = useState(false);
    const [time, setTime] = useState(0);
    const [duration, setDuration] = useState(knownDuration ?? 0);
    const [error, setError] = useState(false);

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
            ['loadedmetadata', () => setDuration(v.duration)],
            ['durationchange', () => setDuration(v.duration)],
            ['waiting', () => setWaiting(true)],
            ['playing', () => setWaiting(false)],
            ['canplay', () => setWaiting(false)],
            ['ended', () => finished(v)],
            [
                'error',
                () => {
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

    // One tap/click opens the full player; a second one right after it likes instead.
    function onSurface(e: PointerEvent<HTMLDivElement>) {
        if (e.button > 0) return; // right or middle click
        const now = Date.now();
        const double = now - lastTap.current < 300;
        lastTap.current = double ? 0 : now;
        clearTimeout(tapTimer.current);
        if (double && onDoubleTap) return onDoubleTap();
        tapTimer.current = setTimeout(() => onOpen(video.current?.currentTime ?? 0), onDoubleTap ? 260 : 0);
    }

    const left = duration > 0 ? duration - time : 0;
    const loop = duration > 0 && duration <= LOOP_UP_TO;

    return (
        <div
            ref={root}
            onContextMenu={stamp ? (e) => e.preventDefault() : undefined}
            className={`group/fv relative isolate overflow-hidden bg-black select-none ${className}`}
        >
            <video
                ref={video}
                // With a still, nothing loads until it plays; without one, the fragment shows the first frame.
                src={released ? undefined : poster ? src : `${src}#t=${resumeAt.current > 0 ? resumeAt.current : 0.1}`}
                poster={poster ?? undefined}
                muted
                playsInline
                loop={loop}
                preload={poster ? 'none' : 'metadata'}
                disablePictureInPicture
                disableRemotePlayback={!!stamp}
                controlsList="nodownload noremoteplayback"
                className={`block bg-black object-contain ${videoClassName}`}
            />
            <StampOverlay text={stamp} />

            <div
                className="absolute inset-0 z-[2] cursor-pointer touch-manipulation"
                onPointerUp={onSurface}
                role="button"
                tabIndex={0}
                aria-label={t('vp.play')}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onOpen(video.current?.currentTime ?? 0);
                    } else if (e.key === 'm' || e.key === 'M') setFeedSound(!sound);
                }}
            />

            {/* No autoplay (less motion / data saver), or not playing yet: a play button that opens the player. */}
            {(!auto || error) && !playing && (
                <span className="pointer-events-none absolute top-1/2 left-1/2 z-[3] grid size-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-black/55 text-white shadow-lg ring-1 ring-white/20 backdrop-blur-md">
                    {error ? <AlertTriangle className="size-7 text-amber-300" /> : <Play className="size-7 translate-x-0.5 fill-current" />}
                </span>
            )}
            {waiting && playing && (
                <LoaderCircle className="pointer-events-none absolute top-1/2 left-1/2 z-[3] size-10 -translate-x-1/2 -translate-y-1/2 animate-spin text-white/90 drop-shadow" />
            )}

            {/* Time left, and the sound switch (for the whole feed). */}
            {duration > 0 && (
                <span className="pointer-events-none absolute bottom-3 left-3 z-[3] rounded-md bg-black/60 px-1.5 py-0.5 text-xs font-bold text-white tabular-nums backdrop-blur-sm">
                    {formatDuration(playing || time > 0.5 ? left : duration)}
                </span>
            )}
            {!error && (
                <button
                    type="button"
                    onClick={() => setFeedSound(!sound)}
                    className="absolute right-3 bottom-3 z-[3] grid size-8 place-items-center rounded-full bg-black/60 text-white backdrop-blur-sm transition hover:scale-105 hover:bg-black/80"
                    aria-label={t(sound ? 'vp.mute' : 'vp.unmute')}
                    aria-pressed={sound}
                    title={t(sound ? 'vp.mute' : 'vp.unmute')}
                >
                    {sound ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
                </button>
            )}

            {/* A thin line showing how far along it is. */}
            {duration > 0 && (playing || time > 0.5) && (
                <span className="pointer-events-none absolute inset-x-0 bottom-0 z-[3] h-[3px] bg-white/20">
                    <span
                        className="bg-primary block h-full transition-[width] duration-200 ease-linear"
                        style={{ width: `${(time / duration) * 100}%` }}
                    />
                </span>
            )}
        </div>
    );
}
