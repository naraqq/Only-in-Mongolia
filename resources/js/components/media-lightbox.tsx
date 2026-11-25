import { useT } from '@/lib/i18n';
import * as Dialog from '@radix-ui/react-dialog';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useEffect, useState } from 'react';

type Media = { id: number; type: 'image' | 'video'; url: string };

/** Full-screen viewer for a post's photos and videos. Arrow keys and buttons move between them; Esc closes. */
export default function MediaLightbox({ media, start, onClose }: { media: Media[]; start: number | null; onClose: () => void }) {
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
                <Dialog.Overlay className="fixed inset-0 z-50 bg-black/95" />
                <Dialog.Content
                    className="fixed inset-0 z-50 grid place-items-center outline-none"
                    onKeyDown={(e) => {
                        if (e.key === 'ArrowLeft') prev();
                        if (e.key === 'ArrowRight') next();
                    }}
                    onClick={(e) => e.target === e.currentTarget && onClose()}
                    aria-describedby={undefined}
                >
                    <Dialog.Title className="sr-only">{`${i + 1} / ${media.length}`}</Dialog.Title>
                    {m &&
                        (m.type === 'video' ? (
                            <video key={m.id} src={m.url} controls autoPlay playsInline className="max-h-[92vh] max-w-[94vw]" />
                        ) : (
                            <img key={m.id} src={m.url} alt="" className="max-h-[92vh] max-w-[94vw] object-contain" />
                        ))}
                    <Dialog.Close
                        className="absolute top-4 right-4 grid size-11 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"
                        aria-label={t('lb.close')}
                    >
                        <X className="size-6" />
                    </Dialog.Close>
                    {media.length > 1 && (
                        <>
                            <span className="absolute top-6 left-1/2 -translate-x-1/2 text-sm font-semibold text-white/80 tabular-nums">
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
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
