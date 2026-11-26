import MediaLightbox from '@/components/media-lightbox';
import StampOverlay from '@/components/stamp-overlay';
import { useT } from '@/lib/i18n';
import { ChevronLeft, ChevronRight, Heart } from 'lucide-react';
import { useRef, useState, type MouseEvent, type ReactNode } from 'react';

type Media = { id: number; type: 'image' | 'video'; url: string; stamp?: string | null };

/**
 * A post's photos and videos. One item keeps its own shape; several become a swipeable carousel with dots.
 * Click a photo to see it full screen; double-click (or double-tap) to like.
 */
export default function PostMedia({
    media,
    onDoubleLike,
    aside,
    className = 'mx-4 mt-3 rounded-2xl',
}: {
    media: Media[];
    onDoubleLike?: () => void;
    aside?: ReactNode;
    className?: string;
}) {
    const { t } = useT();
    const track = useRef<HTMLDivElement>(null);
    const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
    const [index, setIndex] = useState(0);
    const [open, setOpen] = useState<number | null>(null);
    const [burst, setBurst] = useState(0);
    const many = media.length > 1;

    // One click opens the viewer; a second click right after it likes instead.
    function click(e: MouseEvent, i: number) {
        if (media[i].type === 'video') return;
        clearTimeout(timer.current);
        if (e.detail >= 2) {
            if (onDoubleLike) {
                onDoubleLike();
                setBurst((b) => b + 1);
            }
            return;
        }
        timer.current = setTimeout(() => setOpen(i), 230);
    }

    const go = (i: number) => {
        const el = track.current;
        if (el) el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });
    };

    return (
        <div className={`relative overflow-hidden bg-zinc-200 select-none dark:bg-zinc-800 ${className}`}>
            <div
                ref={track}
                onScroll={(e) => setIndex(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
                className={many ? 'flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden' : ''}
            >
                {media.map((m, i) => (
                    <div key={m.id} className={`relative ${many ? 'aspect-square w-full shrink-0 snap-center' : ''}`} onClick={(e) => click(e, i)}>
                        {m.type === 'video' ? (
                            <>
                                <video
                                    src={m.url}
                                    controls
                                    playsInline
                                    preload="metadata"
                                    controlsList={m.stamp ? 'nodownload' : undefined}
                                    onContextMenu={m.stamp ? (e) => e.preventDefault() : undefined}
                                    className={many ? 'size-full bg-black object-contain' : 'max-h-[640px] w-full bg-black'}
                                />
                                <StampOverlay text={m.stamp} />
                            </>
                        ) : (
                            <img
                                src={m.url}
                                alt=""
                                loading="lazy"
                                draggable={false}
                                className={`w-full cursor-pointer object-cover ${many ? 'h-full' : 'max-h-[640px] min-h-48'}`}
                            />
                        )}
                    </div>
                ))}
            </div>

            {burst > 0 && (
                <Heart
                    key={burst}
                    className="animate-heart-pop pointer-events-none absolute top-1/2 left-1/2 -mt-12 -ml-12 size-24 fill-white text-white drop-shadow-lg"
                    aria-hidden
                />
            )}

            {many && (
                <>
                    <span className="absolute top-3 right-3 rounded-full bg-black/55 px-2 py-0.5 text-xs font-semibold text-white tabular-nums backdrop-blur">
                        {index + 1}/{media.length}
                    </span>
                    {index > 0 && (
                        <button
                            type="button"
                            onClick={() => go(index - 1)}
                            className="absolute top-1/2 left-2 grid size-8 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-zinc-900 shadow transition hover:bg-white"
                            aria-label={t('lb.prev')}
                        >
                            <ChevronLeft className="size-5" />
                        </button>
                    )}
                    {index < media.length - 1 && (
                        <button
                            type="button"
                            onClick={() => go(index + 1)}
                            className="absolute top-1/2 right-2 grid size-8 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-zinc-900 shadow transition hover:bg-white"
                            aria-label={t('lb.next')}
                        >
                            <ChevronRight className="size-5" />
                        </button>
                    )}
                    <div className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
                        {media.map((m, i) => (
                            <span key={m.id} className={`size-1.5 rounded-full transition ${i === index ? 'scale-125 bg-white' : 'bg-white/50'}`} />
                        ))}
                    </div>
                </>
            )}

            <MediaLightbox media={media} start={open} onClose={() => setOpen(null)} aside={aside} />
        </div>
    );
}
