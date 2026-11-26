import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useT } from '@/lib/i18n';
import { Check, Images, LoaderCircle, Play, X } from 'lucide-react';
import { useEffect, useState } from 'react';

export type LibraryItem = { id: number; type: 'image' | 'video'; url: string; uses: number; created_at: string };

export type Picked = Pick<LibraryItem, 'id' | 'type' | 'url'>;

/**
 * "From library": a creator picks photos and videos they already uploaded. The composer sends the ids as `vault[]`;
 * the server reuses the stored files, so nothing is uploaded again.
 */
export function LibraryButton({
    picked,
    onChange,
    max,
    className = '',
    iconOnly = false,
}: {
    picked: Picked[];
    onChange: (p: Picked[]) => void;
    max: number;
    className?: string;
    iconOnly?: boolean;
}) {
    const { t } = useT();
    const [open, setOpen] = useState(false);

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                className={className}
                aria-label={iconOnly ? t('lib.from') : undefined}
                title={iconOnly ? t('lib.from') : undefined}
            >
                <Images className={iconOnly ? 'size-5' : 'size-[18px]'} /> {!iconOnly && t('lib.from')}
            </button>
            {open && <PickerDialog initial={picked} max={max} onClose={() => setOpen(false)} onDone={(p) => (onChange(p), setOpen(false))} />}
        </>
    );
}

function PickerDialog({ initial, max, onClose, onDone }: { initial: Picked[]; max: number; onClose: () => void; onDone: (p: Picked[]) => void }) {
    const { t } = useT();
    const [items, setItems] = useState<LibraryItem[] | null>(null);
    const [chosen, setChosen] = useState<Picked[]>(initial);

    useEffect(() => {
        const ctrl = new AbortController();
        fetch(route('studio.library.items'), { headers: { Accept: 'application/json' }, signal: ctrl.signal, credentials: 'same-origin' })
            .then((r) => r.json())
            .then((d: { items: LibraryItem[] }) => setItems(d.items))
            .catch(() => setItems((s) => s ?? []));
        return () => ctrl.abort();
    }, []);

    const toggle = (item: LibraryItem) =>
        setChosen((c) => (c.some((x) => x.id === item.id) ? c.filter((x) => x.id !== item.id) : c.length < max ? [...c, item] : c));

    return (
        <Dialog open onOpenChange={(o) => !o && onClose()}>
            <DialogContent
                aria-describedby={undefined}
                className="flex h-dvh max-h-dvh w-full max-w-none flex-col gap-0 rounded-none p-0 sm:h-[80dvh] sm:max-w-2xl sm:rounded-2xl [&>button:last-child]:hidden"
            >
                <div className="flex h-14 shrink-0 items-center gap-3 px-4">
                    <DialogTitle className="flex-1 text-[17px] font-bold">{t('lib.title')}</DialogTitle>
                    <button
                        type="button"
                        onClick={onClose}
                        className="bg-muted hover:bg-muted/70 grid size-9 place-items-center rounded-full"
                        aria-label={t('po.close')}
                    >
                        <X className="size-5" />
                    </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
                    {items === null ? (
                        <LoaderCircle className="text-muted-foreground mx-auto mt-10 size-6 animate-spin" />
                    ) : items.length === 0 ? (
                        <p className="text-muted-foreground mt-10 text-center text-sm">{t('lib.empty')}</p>
                    ) : (
                        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                            {items.map((item) => {
                                const n = chosen.findIndex((x) => x.id === item.id);
                                return (
                                    <li key={item.id}>
                                        <button
                                            type="button"
                                            onClick={() => toggle(item)}
                                            aria-pressed={n >= 0}
                                            className={`relative block w-full overflow-hidden rounded-xl transition ${n >= 0 ? 'ring-primary ring-4 ring-inset' : 'hover:opacity-90'}`}
                                        >
                                            <Thumb item={item} className="aspect-square" />
                                            {n >= 0 && (
                                                <span className="bg-primary text-primary-foreground absolute top-1.5 right-1.5 grid size-6 place-items-center rounded-full text-xs font-bold">
                                                    {n + 1}
                                                </span>
                                            )}
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
                <div className="flex shrink-0 items-center gap-3 px-4 py-3 shadow-[0_-1px_8px_rgb(0_0_0/0.06)]">
                    <span className="text-muted-foreground flex-1 text-sm">{t('lib.chosen', { n: chosen.length, max })}</span>
                    <button
                        type="button"
                        onClick={() => onDone(chosen)}
                        className="bg-primary text-primary-foreground inline-flex h-10 items-center gap-2 rounded-full px-5 text-sm font-bold transition hover:brightness-110"
                    >
                        <Check className="size-4" /> {t('lib.use')}
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    );
}

/** The chosen library items in a composer, each removable. */
export function PickedThumbs({ picked, onRemove, className = '' }: { picked: Picked[]; onRemove: (id: number) => void; className?: string }) {
    const { t } = useT();
    if (picked.length === 0) return null;
    return (
        <ul className={`flex flex-wrap gap-2 ${className}`}>
            {picked.map((p) => (
                <li key={p.id} className="relative size-24 overflow-hidden rounded-xl">
                    <Thumb item={p} className="size-full" />
                    <span className="absolute bottom-1 left-1 rounded-full bg-black/55 px-1.5 py-0.5 text-[10px] font-bold text-white">
                        <Images className="inline size-3" />
                    </span>
                    <button
                        type="button"
                        onClick={() => onRemove(p.id)}
                        className="absolute top-1 right-1 grid size-6 place-items-center rounded-full bg-black/60 text-white transition hover:bg-black/80"
                        aria-label={t('po.delete')}
                    >
                        <X className="size-3.5" />
                    </button>
                </li>
            ))}
        </ul>
    );
}

/** A library photo, or a video's first frame with a play mark. */
export function Thumb({ item, className = '' }: { item: Pick<LibraryItem, 'type' | 'url'>; className?: string }) {
    return (
        <div className={`relative bg-zinc-200 dark:bg-zinc-800 ${className}`}>
            {item.type === 'video' ? (
                <>
                    <video src={`${item.url}#t=0.1`} muted playsInline preload="metadata" className="size-full object-cover" />
                    <span className="absolute inset-0 grid place-items-center">
                        <span className="grid size-8 place-items-center rounded-full bg-black/55 text-white">
                            <Play className="size-4 fill-current" />
                        </span>
                    </span>
                </>
            ) : (
                <img src={item.url} alt="" loading="lazy" className="size-full object-cover" />
            )}
        </div>
    );
}
