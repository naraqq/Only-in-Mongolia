import StampOverlay from '@/components/stamp-overlay';
import { useT } from '@/lib/i18n';
import * as Dialog from '@radix-ui/react-dialog';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';

type Media = { id: number; type: 'image' | 'video'; url: string; stamp?: string | null };

/**
 * Full-screen viewer for a post's photos and videos. Arrow keys and buttons move between them; Esc closes.
 * With `aside` (the post's details, likes and comments) it sits beside the photo on wide screens and under it on phones.
 */
export default function MediaLightbox({
    media,
    start,
    onClose,
    aside,
}: {
    media: Media[];
    start: number | null;
    onClose: () => void;
    aside?: ReactNode;
}) {
    const { t } = useT();
    const [i, setI] = useState(start ?? 0);

    useEffect(() => {
        if (start !== null) setI(start);
    }, [start]);

    const prev = () => setI((n) => Math.max(0, n - 1));
    const next = () => setI((n) => Math.min(media.length - 1, n + 1));
    const m = media[i];
    const nav = 'absolute top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20';

    return (
        <Dialog.Root open={start !== null} onOpenChange={(o) => !o && onClose()}>
            <Dialog.Portal>
                <Dialog.Overlay className="lb-overlay fixed inset-0 z-50 bg-black/95" />
                <Dialog.Content
                    className={`lb-content fixed inset-0 z-50 flex outline-none ${aside ? 'flex-col lg:flex-row' : ''}`}
                    onKeyDown={(e) => {
                        // Arrow keys move between photos, unless someone is typing a comment.
                        if ((e.target as HTMLElement).closest('input, textarea')) return;
                        if (e.key === 'ArrowLeft') prev();
                        if (e.key === 'ArrowRight') next();
                    }}
                    aria-describedby={undefined}
                >
                    <Dialog.Title className="sr-only">{`${i + 1} / ${media.length}`}</Dialog.Title>
                    <div
                        className={`relative grid min-h-0 min-w-0 flex-1 place-items-center [&:hover:not(:has(>*:hover))]:cursor-pointer ${aside ? 'max-lg:max-h-[55vh] max-lg:shrink-0' : ''}`}
                        onClick={(e) => e.target === e.currentTarget && onClose()}
                    >
                        {m &&
                            (m.type === 'video' ? (
                                <span key={m.id} className="relative inline-grid max-h-full max-w-full">
                                    <video
                                        src={m.url}
                                        controls
                                        autoPlay
                                        playsInline
                                        controlsList={m.stamp ? 'nodownload' : undefined}
                                        onContextMenu={m.stamp ? (e) => e.preventDefault() : undefined}
                                        className="lb-media max-h-full max-w-full lg:max-h-[94vh]"
                                    />
                                    <StampOverlay text={m.stamp} />
                                </span>
                            ) : (
                                <Photo key={m.id} src={m.url} />
                            ))}
                        {media.length > 1 && (
                            <>
                                <span className="absolute top-5 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-2.5 py-0.5 text-sm font-semibold text-white/90 tabular-nums">
                                    {i + 1} / {media.length}
                                </span>
                                {i > 0 && (
                                    <button type="button" onClick={prev} className={`${nav} left-4`} aria-label={t('lb.prev')}>
                                        <ChevronLeft className="size-6" />
                                    </button>
                                )}
                                {i < media.length - 1 && (
                                    <button type="button" onClick={next} className={`${nav} right-4`} aria-label={t('lb.next')}>
                                        <ChevronRight className="size-6" />
                                    </button>
                                )}
                            </>
                        )}
                    </div>
                    {aside && <aside className="lb-panel flex min-h-0 flex-1 flex-col lg:w-[380px] lg:flex-none">{aside}</aside>}
                    <Dialog.Close
                        className="absolute top-3 left-3 grid size-10 place-items-center rounded-full bg-black/60 text-white hover:bg-black/80 lg:top-4 lg:right-auto lg:left-4"
                        aria-label={t('lb.close')}
                    >
                        <X className="size-6" />
                    </Dialog.Close>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}

/** The photo grows into place, and if it isn't loaded yet it fades in when it is (instead of popping in late). */
function Photo({ src }: { src: string }) {
    const [ready, setReady] = useState(false);
    return (
        <img
            src={src}
            alt=""
            ref={(el) => {
                if (el?.complete && el.naturalWidth) setReady(true); // already in the browser cache
            }}
            onLoad={() => setReady(true)}
            className={`lb-media max-h-full max-w-full object-contain transition-opacity duration-300 lg:max-h-[94vh] ${ready ? 'opacity-100' : 'opacity-0'}`}
        />
    );
}
