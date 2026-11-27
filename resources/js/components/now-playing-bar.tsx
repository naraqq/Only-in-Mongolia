import { useT } from '@/lib/i18n';
import { clock, close, RATES, seek, setRate, setVolume, skip, toggle, usePlayer } from '@/lib/player';
import { Link } from '@inertiajs/react';
import { AudioLines, LoaderCircle, Pause, Play, RotateCcw, RotateCw, Volume1, Volume2, VolumeX, X } from 'lucide-react';
import { useEffect, useRef, type PointerEvent } from 'react';

/**
 * The player docked at the bottom of the screen while something plays: cover, title and creator, skip ±15 s,
 * play/pause, a seek bar, speed, volume, close. It keeps playing as you move around the app.
 * `aboveTabs` lifts it over the phone's bottom tab bar (social layout).
 */
export default function NowPlayingBar({ aboveTabs = false }: { aboveTabs?: boolean }) {
    const { t } = useT();
    const p = usePlayer();
    const track = p.track;

    // Leave room at the bottom of pages (and sidebars) for the bar while it's showing.
    useEffect(() => {
        document.documentElement.style.setProperty('--player-h', track ? '72px' : '0px');
    }, [track]);

    if (!track) return null;
    const progress = p.duration ? (p.time / p.duration) * 100 : 0;

    return (
        <div
            role="region"
            aria-label={t('au.nowPlaying')}
            className={`bg-card/95 border-border animate-toast-in fixed inset-x-0 z-40 border-t shadow-[0_-8px_30px_rgba(0,0,0,0.25)] backdrop-blur-md ${
                aboveTabs ? 'bottom-[calc(4rem+env(safe-area-inset-bottom))] md:bottom-0' : 'bottom-0'
            }`}
        >
            {/* Phones: a thin progress line along the top edge. */}
            <div className="bg-foreground/10 absolute inset-x-0 top-0 h-0.5 md:hidden">
                <div className="bg-primary h-full" style={{ width: `${progress}%` }} />
            </div>

            <div className="mx-auto grid h-[72px] max-w-[1500px] grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)] md:gap-6 md:px-6">
                {/* What's playing */}
                <div className="flex min-w-0 items-center gap-3">
                    <Cover src={track.artwork} playing={p.playing} />
                    <div className="min-w-0">
                        {track.href ? (
                            <Link href={track.href} className="block truncate text-sm font-bold hover:underline">
                                {track.title}
                            </Link>
                        ) : (
                            <p className="truncate text-sm font-bold">{track.title}</p>
                        )}
                        <p className="text-muted-foreground truncate text-xs">
                            {track.artist}
                            {track.stamp && <span className="opacity-60"> · {track.stamp}</span>}
                        </p>
                    </div>
                </div>

                {/* Controls */}
                <div className="flex items-center gap-1 md:flex-col md:gap-1">
                    <div className="flex items-center gap-1 md:gap-3">
                        <IconButton label={t('au.back15')} onClick={() => skip(-15)} className="hidden md:grid">
                            <RotateCcw className="size-5" />
                            <span className="absolute text-[8px] font-bold">15</span>
                        </IconButton>
                        <button
                            type="button"
                            onClick={() => toggle()}
                            aria-label={t(p.playing ? 'au.pause' : 'au.play')}
                            className="bg-foreground text-background grid size-10 place-items-center rounded-full transition hover:scale-105"
                        >
                            {p.loading && p.playing ? (
                                <LoaderCircle className="size-5 animate-spin" />
                            ) : p.playing ? (
                                <Pause className="size-5 fill-current" />
                            ) : (
                                <Play className="ml-0.5 size-5 fill-current" />
                            )}
                        </button>
                        <IconButton label={t('au.forward15')} onClick={() => skip(15)} className="hidden md:grid">
                            <RotateCw className="size-5" />
                            <span className="absolute text-[8px] font-bold">15</span>
                        </IconButton>
                        <IconButton label={t('au.close')} onClick={close} className="md:hidden">
                            <X className="size-5" />
                        </IconButton>
                    </div>
                    <div className="hidden w-full max-w-xl items-center gap-2 md:flex">
                        <span className="text-muted-foreground w-12 text-right text-[11px] tabular-nums">{clock(p.time)}</span>
                        <SeekBar value={p.time} max={p.duration} onSeek={seek} label={t('au.seek')} />
                        <span className="text-muted-foreground w-12 text-[11px] tabular-nums">{clock(p.duration)}</span>
                    </div>
                </div>

                {/* Speed, volume, close */}
                <div className="hidden items-center justify-end gap-2 md:flex">
                    <button
                        type="button"
                        onClick={() => setRate(RATES[(RATES.indexOf(p.rate) + 1) % RATES.length])}
                        aria-label={t('au.speed')}
                        title={t('au.speed')}
                        className={`h-8 rounded-full px-2.5 text-xs font-bold tabular-nums transition ${p.rate !== 1 ? 'bg-primary/15 text-primary' : 'hover:bg-muted'}`}
                    >
                        {p.rate}×
                    </button>
                    <IconButton label={t('au.mute')} onClick={() => setVolume(p.volume > 0 ? 0 : 1)}>
                        {p.volume === 0 ? (
                            <VolumeX className="size-5" />
                        ) : p.volume < 0.5 ? (
                            <Volume1 className="size-5" />
                        ) : (
                            <Volume2 className="size-5" />
                        )}
                    </IconButton>
                    <div className="hidden w-24 lg:block">
                        <SeekBar value={p.volume} max={1} onSeek={setVolume} label={t('au.volume')} />
                    </div>
                    <IconButton label={t('au.close')} onClick={close}>
                        <X className="size-5" />
                    </IconButton>
                </div>
            </div>
        </div>
    );
}

function Cover({ src, playing }: { src?: string | null; playing: boolean }) {
    return (
        <span className="relative grid size-12 shrink-0 place-items-center overflow-hidden rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white shadow">
            {src ? <img src={src} alt="" className="size-full object-cover" /> : <AudioLines className="size-6" />}
            {playing && (
                <span className="absolute inset-x-0 bottom-0 flex h-4 items-end justify-center gap-0.5 bg-gradient-to-t from-black/60 to-transparent pb-0.5">
                    {[0, 1, 2].map((i) => (
                        <span key={i} className="eq-bar w-0.5 rounded-full bg-white" style={{ animationDelay: `${i * 0.15}s` }} />
                    ))}
                </span>
            )}
        </span>
    );
}

function IconButton({
    label,
    onClick,
    className = '',
    children,
}: {
    label: string;
    onClick: () => void;
    className?: string;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={label}
            title={label}
            className={`text-muted-foreground hover:text-foreground hover:bg-muted relative grid size-9 place-items-center rounded-full transition ${className}`}
        >
            {children}
        </button>
    );
}

/** A draggable bar (seek or volume), with arrow keys. */
export function SeekBar({ value, max, onSeek, label }: { value: number; max: number; onSeek: (v: number) => void; label: string }) {
    const bar = useRef<HTMLDivElement>(null);
    const pct = max ? Math.min(100, (value / max) * 100) : 0;

    function at(e: PointerEvent<HTMLDivElement>) {
        const box = bar.current?.getBoundingClientRect();
        if (!box || !max) return;
        onSeek(Math.min(Math.max(0, (e.clientX - box.left) / box.width), 1) * max);
    }

    return (
        <div
            ref={bar}
            role="slider"
            tabIndex={0}
            aria-label={label}
            aria-valuemin={0}
            aria-valuemax={Math.round(max * 100) / 100}
            aria-valuenow={Math.round(value * 100) / 100}
            onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                at(e);
            }}
            onPointerMove={(e) => e.buttons === 1 && at(e)}
            onKeyDown={(e) => {
                const step = max > 10 ? 5 : max / 10;
                if (e.key === 'ArrowRight') onSeek(Math.min(max, value + step));
                if (e.key === 'ArrowLeft') onSeek(Math.max(0, value - step));
            }}
            className="group relative h-4 flex-1 cursor-pointer touch-none"
        >
            <div className="bg-foreground/15 absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full">
                <div className="bg-foreground group-hover:bg-primary h-full rounded-full transition-colors" style={{ width: `${pct}%` }} />
            </div>
            <div
                className="bg-foreground absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-0 shadow transition group-hover:opacity-100 group-focus-visible:opacity-100"
                style={{ left: `${pct}%` }}
            />
        </div>
    );
}
