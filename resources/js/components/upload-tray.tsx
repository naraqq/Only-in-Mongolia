import { AudioTile } from '@/components/library-picker';
import { useT } from '@/lib/i18n';
import { formatBytes, formatDuration, type UploadItem } from '@/lib/use-uploads';
import { AlertTriangle, Check, Clock3, Film, GripVertical, Pause, Play, Plus, RotateCw, WifiOff, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';

type Props = {
    items: UploadItem[];
    onRemove: (key: string) => void;
    onPause: (key: string) => void;
    onResume: (key: string) => void;
    onMove: (from: number, to: number) => void;
    /** Shown as a "+" tile while there's room for more. */
    onAddMore?: () => void;
    className?: string;
};

/**
 * The files being added to a post, each uploading on its own: a preview (a video's frame and length), a progress
 * ring with what's sent, speed and time left, and pause / resume / retry / remove. Drag tiles to change the order.
 * A single photo or video gets one big preview instead of a grid.
 */
export default function UploadTray({ items, onRemove, onPause, onResume, onMove, onAddMore, className = '' }: Props) {
    const { t } = useT();
    const [dragFrom, setDragFrom] = useState<number | null>(null);
    const [dragOver, setDragOver] = useState<number | null>(null);

    if (items.length === 0) return null;
    const single = items.length === 1 && items[0].kind !== 'audio';

    return (
        <ul className={`${single ? 'grid grid-cols-1' : 'grid grid-cols-2 gap-2 sm:grid-cols-3'} ${className}`}>
            {items.map((item, i) => (
                <li
                    key={item.key}
                    draggable={items.length > 1}
                    onDragStart={(e) => {
                        setDragFrom(i);
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/x-upload', String(i)); // not "Files": the composer's drop zone ignores it
                    }}
                    onDragOver={(e) => {
                        if (dragFrom === null) return;
                        e.preventDefault();
                        setDragOver(i);
                    }}
                    onDragLeave={() => setDragOver((o) => (o === i ? null : o))}
                    onDrop={(e) => {
                        if (dragFrom === null) return;
                        e.preventDefault();
                        e.stopPropagation();
                        onMove(dragFrom, i);
                        setDragFrom(null);
                        setDragOver(null);
                    }}
                    onDragEnd={() => {
                        setDragFrom(null);
                        setDragOver(null);
                    }}
                    className={`group relative overflow-hidden rounded-xl bg-zinc-900 transition ${
                        single ? 'aspect-video max-h-80 w-full' : 'aspect-square'
                    } ${dragFrom === i ? 'scale-95 opacity-40' : ''} ${dragOver === i && dragFrom !== i ? 'ring-primary ring-2 ring-offset-2 ring-offset-transparent' : ''} ${
                        items.length > 1 ? 'cursor-grab active:cursor-grabbing' : ''
                    }`}
                >
                    <Preview item={item} contain={single} />
                    <Overlay item={item} onPause={() => onPause(item.key)} onResume={() => onResume(item.key)} big={single} />

                    {/* Top: order and remove. */}
                    <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-1.5">
                        {items.length > 1 ? (
                            <span
                                className="inline-flex h-6 items-center gap-0.5 rounded-full bg-black/55 pr-2 pl-1 text-[11px] font-bold text-white tabular-nums backdrop-blur-sm"
                                title={t('up.drag')}
                            >
                                <GripVertical className="size-3.5 opacity-70" />
                                {i + 1}
                            </span>
                        ) : (
                            <span />
                        )}
                        <button
                            type="button"
                            onClick={() => onRemove(item.key)}
                            className="pointer-events-auto grid size-7 place-items-center rounded-full bg-black/60 text-white backdrop-blur-sm transition hover:bg-black/80"
                            aria-label={t('po.delete')}
                            title={t('po.delete')}
                        >
                            <X className="size-4" />
                        </button>
                    </div>

                    {/* Bottom: ready mark, size and length. */}
                    {item.status === 'done' && (
                        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between bg-gradient-to-t from-black/60 to-transparent p-1.5 pt-6">
                            <span className="animate-toast-in inline-flex h-6 items-center gap-1 rounded-full bg-emerald-500 pr-2 pl-1.5 text-[11px] font-bold text-white shadow-sm">
                                <Check className="size-3.5" strokeWidth={3} /> {t('up.ready')}
                            </span>
                            <span className="flex items-center gap-1">
                                {item.duration !== undefined && <Badge>{formatDuration(item.duration)}</Badge>}
                                <Badge>{formatBytes(item.file.size)}</Badge>
                            </span>
                        </div>
                    )}
                </li>
            ))}

            {onAddMore && !single && (
                <li className="aspect-square">
                    <button
                        type="button"
                        onClick={onAddMore}
                        className="border-border text-muted-foreground hover:border-primary hover:text-primary hover:bg-primary/5 flex size-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed text-xs font-semibold transition"
                    >
                        <Plus className="size-6" />
                        {t('up.add')}
                    </button>
                </li>
            )}
        </ul>
    );
}

function Badge({ children }: { children: ReactNode }) {
    return <span className="rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-white tabular-nums backdrop-blur-sm">{children}</span>;
}

function Preview({ item, contain }: { item: UploadItem; contain: boolean }) {
    const fit = contain ? 'object-contain' : 'object-cover';
    if (item.kind === 'audio') return <AudioTile name={item.file.name} />;
    if (item.kind === 'image') return <img src={item.url} alt="" draggable={false} className={`size-full ${fit}`} />;
    if (item.poster) return <img src={item.poster} alt="" draggable={false} className={`size-full ${fit}`} />;
    // No frame (yet, or a format this browser can't show, like some iPhone videos): a calm placeholder.
    return (
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-gradient-to-br from-zinc-800 to-zinc-900 p-3 text-center text-zinc-300">
            <Film className="size-8 opacity-80" />
            <span className="line-clamp-2 text-[11px] leading-tight font-semibold break-all">{item.file.name}</span>
        </span>
    );
}

/** Progress ring (determinate), or spinning while the server finishes the file. */
function Ring({ value, size, spinning = false, children }: { value: number; size: number; spinning?: boolean; children?: ReactNode }) {
    const stroke = size > 60 ? 5 : 4;
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    return (
        <span className="relative grid place-items-center" style={{ width: size, height: size }}>
            <svg width={size} height={size} className={`absolute inset-0 -rotate-90 ${spinning ? 'animate-spin [animation-duration:1.1s]' : ''}`}>
                <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeOpacity={0.25} strokeWidth={stroke} />
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={r}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={stroke}
                    strokeLinecap="round"
                    strokeDasharray={c}
                    strokeDashoffset={spinning ? c * 0.72 : c * (1 - value / 100)}
                    className="transition-[stroke-dashoffset] duration-300 ease-out"
                />
            </svg>
            {children}
        </span>
    );
}

function Overlay({ item, onPause, onResume, big }: { item: UploadItem; onPause: () => void; onResume: () => void; big: boolean }) {
    const { t } = useT();
    if (item.status === 'done') return null;

    const percent = item.file.size ? Math.floor((item.sent / item.file.size) * 100) : 0;
    const left = item.speed > 0 ? (item.file.size - item.sent) / item.speed : null;
    const ring = big ? 76 : 56;
    const scrim = 'absolute inset-0 flex flex-col items-center justify-center gap-1.5 p-2 text-center text-white';

    if (item.status === 'error') {
        return (
            <div className={`${scrim} bg-red-950/75 backdrop-blur-[2px]`}>
                {item.canRetry ? <WifiOff className="size-6 text-red-200" /> : <AlertTriangle className="size-6 text-red-200" />}
                <p className="line-clamp-3 max-w-56 text-[11px] leading-snug font-semibold">{item.error ?? t('up.offline')}</p>
                {item.canRetry && (
                    <button
                        type="button"
                        onClick={onResume}
                        className="mt-0.5 inline-flex h-7 items-center gap-1 rounded-full bg-white px-3 text-xs font-bold text-red-700 transition hover:bg-red-50"
                    >
                        <RotateCw className="size-3.5" /> {t('up.retry')}
                    </button>
                )}
            </div>
        );
    }

    if (item.status === 'paused') {
        return (
            <button
                type="button"
                onClick={onResume}
                className={`${scrim} bg-black/55 backdrop-blur-[2px] transition hover:bg-black/45`}
                title={t('up.resume')}
            >
                <Ring value={percent} size={ring}>
                    <Play className={`${big ? 'size-7' : 'size-5'} translate-x-px fill-current`} />
                </Ring>
                <span className="text-[11px] font-bold">
                    {t('up.paused')} · {percent}%
                </span>
            </button>
        );
    }

    if (item.status === 'queued') {
        return (
            <div className={`${scrim} bg-black/50`}>
                <Ring value={0} size={ring}>
                    <Clock3 className="size-5 opacity-90" />
                </Ring>
                <span className="text-[11px] font-semibold opacity-90">{t('up.waiting')}</span>
            </div>
        );
    }

    if (item.status === 'finishing') {
        return (
            <div className={`${scrim} bg-black/50`}>
                <Ring value={100} size={ring} spinning />
                <span className="text-[11px] font-semibold">{t('up.processing')}</span>
            </div>
        );
    }

    // Uploading.
    return (
        <div className={`${scrim} bg-black/45`}>
            <button type="button" onClick={onPause} className="group/ring rounded-full" title={t('up.pause')} aria-label={t('up.pause')}>
                <Ring value={percent} size={ring}>
                    <span className={`font-extrabold tabular-nums group-hover/ring:hidden ${big ? 'text-lg' : 'text-sm'}`}>{percent}%</span>
                    <Pause className={`hidden fill-current group-hover/ring:block ${big ? 'size-7' : 'size-5'}`} />
                </Ring>
            </button>
            <span className="text-[11px] leading-tight font-semibold tabular-nums">
                {formatBytes(item.sent)} / {formatBytes(item.file.size)}
            </span>
            {(big || item.speed > 0) && (
                <span className="text-[10px] leading-tight text-white/75 tabular-nums">
                    {item.speed > 0 ? `${formatBytes(item.speed)}/s` : '…'}
                    {left !== null && ` · ${t('up.left', { time: formatDuration(left) })}`}
                </span>
            )}
            {/* Thin bar along the bottom edge too, readable at a glance. */}
            <span className="absolute inset-x-0 bottom-0 h-1 bg-white/15">
                <span className="bg-primary block h-full transition-[width] duration-300" style={{ width: `${percent}%` }} />
            </span>
        </div>
    );
}
