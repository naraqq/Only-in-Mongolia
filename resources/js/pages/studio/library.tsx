import AudioPlayer from '@/components/audio-player';
import InputError from '@/components/input-error';
import { Thumb, type LibraryItem } from '@/components/library-picker';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import StudioLayout from '@/layouts/studio-layout';
import { ask } from '@/lib/confirm';
import { mnt } from '@/lib/format';
import { sendJson } from '@/lib/http';
import { useT, type TKey } from '@/lib/i18n';
import { toast } from '@/lib/toast';
import { Link, router, useForm, usePage } from '@inertiajs/react';
import {
    ArrowDownUp,
    Check,
    ChevronDown,
    Eye,
    Heart,
    Images,
    Layers,
    LoaderCircle,
    MessageCircle,
    PenSquare,
    Send,
    Sparkles,
    Trash2,
    Upload,
    Wallet,
    X,
} from 'lucide-react';
import { useEffect, useRef, useState, type DragEvent } from 'react';

type Item = LibraryItem & { views: number; earned: number };
type Sort = 'new' | 'used' | 'earned';
type Usage = {
    posts: {
        id: number;
        body: string | null;
        created_at: string;
        visibility: string;
        price: number | null;
        scheduled: boolean;
        views: number;
        likes: number;
        earned: number;
    }[];
    messages: number;
    mass: number;
};

/** A post or a message can carry at most this many files. */
const MAX_ATTACH = 10;
const ACCEPT = 'image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm,audio/*,.mp3,.m4a,.aac,.wav,.ogg,.opus,.flac';
const SORTS: [Sort, TKey][] = [
    ['new', 'lib.sortNew'],
    ['used', 'lib.sortUsed'],
    ['earned', 'lib.sortEarned'],
];
const day = (iso: string) => iso.slice(0, 10).replaceAll('-', '.');

const toStudio = (ids: number[], to?: 'fans') => router.visit(route('studio', { use: ids.join(','), ...(to ? { to } : {}) }));

/**
 * Studio → Library: everything the creator uploaded, and what to do with it: post it, send it to fans, see how it
 * did and where it's used, or clear it out. Unposted files stand out, since they're content waiting to earn.
 */
export default function Library({
    items,
    type,
    sort,
    unused,
    unusedCount,
    counts,
}: {
    items: Item[];
    type: 'image' | 'video' | 'audio' | null;
    sort: Sort;
    unused: boolean;
    unusedCount: number;
    counts: { image: number; video: number; audio: number };
}) {
    const { t } = useT();
    const form = useForm({ media: [] as File[] });
    const input = useRef<HTMLInputElement>(null);
    const errors = Object.entries(form.errors);
    const [selected, setSelected] = useState<number[]>([]);
    const [open, setOpen] = useState<Item | null>(null);
    const [dragging, setDragging] = useState(false);
    const flash = usePage<{ flash?: { status?: string } }>().props.flash;
    useEffect(() => {
        if (flash?.status === 'library-added') toast(t('lib.added'), { tone: 'success' });
        if (flash?.status?.startsWith('library-removed:')) toast(t('lib.removedN', { n: Number(flash.status.split(':')[1]) }));
    }, [flash?.status, t]);

    // The library's address with one filter changed (and defaults left out).
    const query = (over: { type?: typeof type; sort?: Sort; unused?: boolean }) => {
        const next = { type, sort, unused, ...over };
        const q: Record<string, string | number> = {};
        if (next.type) q.type = next.type;
        if (next.sort !== 'new') q.sort = next.sort;
        if (next.unused) q.unused = 1;
        return q;
    };

    function upload(files: File[]) {
        const ok = files.filter((f) => f.type.startsWith('audio/') || ACCEPT.split(',').includes(f.type)).slice(0, 20);
        if (!ok.length) return;
        form.transform(() => ({ media: ok }));
        form.post(route('studio.library.store'), { forceFormData: true, preserveScroll: true });
    }

    const toggle = (id: number) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

    async function remove(list: Item[]) {
        const used = list.filter((i) => i.uses > 0).length;
        const message =
            list.length === 1
                ? list[0].uses > 0
                    ? t('lib.removeUsed', { n: list[0].uses })
                    : t('lib.removeConfirm')
                : t('lib.removeManyConfirm', { n: list.length, used });
        if (!(await ask({ message, confirm: t('po.delete'), cancel: t('dlg.cancel'), danger: true }))) return;
        const done = { preserveScroll: true, onSuccess: () => (setSelected([]), setOpen(null)) };
        if (list.length === 1) router.delete(route('studio.library.destroy', list[0].id), done);
        else router.delete(route('studio.library.destroy-many'), { ...done, data: { ids: list.map((i) => i.id) } });
    }

    const onDrag = (e: DragEvent, over: boolean) => {
        if (!e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        setDragging(over);
    };

    const tabs: [typeof type, string][] = [
        [null, t('lib.all', { n: counts.image + counts.video + counts.audio })],
        ['image', t('lib.photos', { n: counts.image })],
        ['video', t('lib.videos', { n: counts.video })],
        ['audio', t('lib.audio', { n: counts.audio })],
    ];
    const chosen = items.filter((i) => selected.includes(i.id));
    const tooMany = selected.length > MAX_ATTACH;

    return (
        <StudioLayout
            title={t('lib.title')}
            subtitle={t('lib.sub')}
            actions={
                <button
                    type="button"
                    onClick={() => input.current?.click()}
                    disabled={form.processing}
                    className="bg-primary text-primary-foreground inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-bold transition hover:brightness-110 disabled:opacity-60"
                >
                    {form.processing ? <LoaderCircle className="size-4 animate-spin" /> : <Upload className="size-4" />}
                    {t('lib.upload')}
                </button>
            }
        >
            <input
                ref={input}
                type="file"
                multiple
                accept={ACCEPT}
                className="hidden"
                onChange={(e) => {
                    upload(Array.from(e.target.files ?? []));
                    e.target.value = '';
                }}
            />
            <div
                className="relative mx-auto flex max-w-6xl flex-col gap-4 pb-24"
                onDragOver={(e) => onDrag(e, true)}
                onDragLeave={(e) => onDrag(e, false)}
                onDrop={(e) => {
                    onDrag(e, false);
                    upload(Array.from(e.dataTransfer.files));
                }}
            >
                {dragging && (
                    <div className="border-primary bg-primary/10 text-primary pointer-events-none absolute inset-0 z-20 grid place-items-center rounded-2xl border-2 border-dashed text-sm font-bold">
                        <span className="flex items-center gap-2">
                            <Upload className="size-5" /> {t('lib.drop')}
                        </span>
                    </div>
                )}

                {/* Filters */}
                <div className="flex flex-wrap items-center gap-2">
                    <div className="bg-muted inline-flex w-fit gap-1 rounded-full p-1">
                        {tabs.map(([value, label]) => (
                            <Link
                                key={value ?? 'all'}
                                href={route('studio.library', query({ type: value }))}
                                preserveScroll
                                className={`h-8 rounded-full px-3.5 text-sm leading-8 font-semibold transition ${type === value ? 'bg-card shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                            >
                                {label}
                            </Link>
                        ))}
                    </div>
                    {(unusedCount > 0 || unused) && (
                        <Link
                            href={route('studio.library', query({ unused: !unused }))}
                            preserveScroll
                            className={`inline-flex h-10 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold transition ${
                                unused ? 'bg-amber-400 text-amber-950' : 'bg-amber-400/15 text-amber-700 hover:bg-amber-400/25 dark:text-amber-300'
                            }`}
                        >
                            <Sparkles className="size-4" /> {t('lib.notPostedN', { n: unusedCount })}
                        </Link>
                    )}
                    <DropdownMenu>
                        <DropdownMenuTrigger className="hover:bg-muted ml-auto inline-flex h-10 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold">
                            <ArrowDownUp className="text-muted-foreground size-4" /> {t(SORTS.find(([s]) => s === sort)![1])}
                            <ChevronDown className="text-muted-foreground size-3.5" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            {SORTS.map(([s, label]) => (
                                <DropdownMenuItem
                                    key={s}
                                    onSelect={() => router.get(route('studio.library', query({ sort: s })), {}, { preserveScroll: true })}
                                >
                                    {sort === s ? <Check className="text-primary size-4" /> : <span className="size-4" />} {t(label)}
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>

                {form.progress && (
                    <div className="bg-muted h-1 overflow-hidden rounded-full">
                        <div className="bg-primary h-full transition-[width]" style={{ width: `${form.progress.percentage ?? 0}%` }} />
                    </div>
                )}
                {errors.map(([k, v]) => (
                    <InputError key={k} message={v} />
                ))}

                {items.length === 0 ? (
                    <button
                        type="button"
                        onClick={() => input.current?.click()}
                        className="bg-card border-border hover:border-primary/50 text-muted-foreground flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed p-12 text-center text-sm transition"
                    >
                        <span className="bg-muted grid size-14 place-items-center rounded-full">
                            <Images className="size-6" />
                        </span>
                        <span className="text-foreground font-bold">{t(unused ? 'lib.allPosted' : 'lib.empty')}</span>
                        {!unused && <span>{t('lib.emptyHint')}</span>}
                    </button>
                ) : (
                    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                        {items.map((item) => (
                            <Tile
                                key={item.id}
                                item={item}
                                selected={selected.includes(item.id)}
                                selecting={selected.length > 0}
                                onToggle={() => toggle(item.id)}
                                onOpen={() => setOpen(item)}
                            />
                        ))}
                    </ul>
                )}
            </div>

            {/* Several chosen: act on them together. */}
            {selected.length > 0 && (
                <div className="bg-card border-border animate-toast-in fixed inset-x-3 bottom-4 z-30 mx-auto flex max-w-xl flex-wrap items-center gap-2 rounded-2xl border p-2 pl-4 shadow-2xl">
                    <span className="text-sm font-bold">{t('lib.selected', { n: selected.length })}</span>
                    {tooMany && <span className="text-xs text-amber-600 dark:text-amber-400">{t('lib.maxTen', { n: MAX_ATTACH })}</span>}
                    <div className="ml-auto flex items-center gap-1">
                        <ActionButton icon={PenSquare} label={t('lib.post')} disabled={tooMany} onClick={() => toStudio(selected)} primary />
                        <ActionButton icon={MessageCircle} label={t('lib.message')} disabled={tooMany} onClick={() => toStudio(selected, 'fans')} />
                        <button
                            type="button"
                            onClick={() => void remove(chosen)}
                            className="text-muted-foreground grid size-9 place-items-center rounded-full transition hover:bg-red-500/10 hover:text-red-600"
                            aria-label={t('po.delete')}
                            title={t('po.delete')}
                        >
                            <Trash2 className="size-4" />
                        </button>
                        <button
                            type="button"
                            onClick={() => setSelected([])}
                            className="text-muted-foreground hover:bg-muted grid size-9 place-items-center rounded-full"
                            aria-label={t('lib.clearSel')}
                            title={t('lib.clearSel')}
                        >
                            <X className="size-4" />
                        </button>
                    </div>
                </div>
            )}

            <Details item={open} onClose={() => setOpen(null)} onRemove={(i) => void remove([i])} />
        </StudioLayout>
    );
}

function ActionButton({
    icon: Icon,
    label,
    onClick,
    disabled,
    primary,
}: {
    icon: typeof PenSquare;
    label: string;
    onClick: () => void;
    disabled?: boolean;
    primary?: boolean;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className={`inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-bold transition disabled:opacity-40 ${
                primary ? 'bg-primary text-primary-foreground hover:brightness-110' : 'hover:bg-muted'
            }`}
        >
            <Icon className="size-4" /> {label}
        </button>
    );
}

/** One file: tap to open, tick to select; on hover, post it or send it to fans straight away. */
function Tile({
    item,
    selected,
    selecting,
    onToggle,
    onOpen,
}: {
    item: Item;
    selected: boolean;
    selecting: boolean;
    onToggle: () => void;
    onOpen: () => void;
}) {
    const { t } = useT();
    return (
        <li
            className={`group bg-card relative overflow-hidden rounded-2xl shadow-xs ring-2 transition ${selected ? 'ring-primary' : 'hover:ring-border ring-transparent'}`}
        >
            <div className="relative">
                <button type="button" onClick={selecting ? onToggle : onOpen} className="block w-full text-left" aria-label={t('lib.details')}>
                    <Thumb item={item} className={`aspect-square transition ${selected ? 'opacity-80' : ''}`} />
                </button>

                {/* Select */}
                <button
                    type="button"
                    onClick={onToggle}
                    aria-pressed={selected}
                    aria-label={t('lib.select')}
                    className={`absolute top-2 left-2 grid size-7 place-items-center rounded-full border-2 shadow transition ${
                        selected
                            ? 'border-primary bg-primary text-primary-foreground'
                            : `border-white/90 bg-black/30 text-transparent hover:bg-black/50 ${selecting ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus:opacity-100'}`
                    }`}
                >
                    <Check className="size-4" strokeWidth={3} />
                </button>

                {item.uses === 0 && (
                    <span className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full bg-amber-400 px-2 py-0.5 text-[11px] font-bold text-amber-950 shadow">
                        <Sparkles className="size-3" /> {t('lib.notPosted')}
                    </span>
                )}

                {/* Quick actions: on a dark fade along the bottom of the picture. */}
                {!selecting && (
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex gap-1.5 bg-gradient-to-t from-black/75 via-black/40 to-transparent p-2 pt-8 opacity-0 transition group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100 max-sm:hidden">
                        <button
                            type="button"
                            onClick={() => toStudio([item.id])}
                            title={t('lib.post')}
                            className="bg-primary text-primary-foreground inline-flex h-8 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-bold whitespace-nowrap transition hover:brightness-110"
                        >
                            <PenSquare className="size-3.5 shrink-0" /> <span className="truncate">{t('lib.post')}</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => toStudio([item.id], 'fans')}
                            title={t('lib.message')}
                            className="inline-flex h-8 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg bg-white/15 px-2 text-xs font-bold whitespace-nowrap text-white backdrop-blur-sm transition hover:bg-white/25"
                        >
                            <Send className="size-3.5 shrink-0" /> <span className="truncate">{t('lib.send')}</span>
                        </button>
                    </div>
                )}
            </div>

            {/* How it did, in icons so nothing gets cut off in either language. */}
            <div className="text-muted-foreground flex h-9 items-center gap-3 px-3 text-xs tabular-nums">
                {item.uses === 0 ? (
                    <span className="truncate">{t('lib.uploaded', { date: day(item.created_at) })}</span>
                ) : (
                    <>
                        <span className="inline-flex items-center gap-1" title={t('lib.usedIn', { n: item.uses })}>
                            <Layers className="size-3.5" /> {item.uses}
                        </span>
                        <span className="inline-flex items-center gap-1" title={t('lib.views')}>
                            <Eye className="size-3.5" /> {item.views}
                        </span>
                        {item.earned > 0 && (
                            <span className="ml-auto truncate font-bold text-emerald-600 dark:text-emerald-400" title={t('lib.earned')}>
                                {mnt(item.earned)}
                            </span>
                        )}
                    </>
                )}
            </div>
        </li>
    );
}

/** A file up close: how it did, where it's used, and what to do next. */
function Details({ item, onClose, onRemove }: { item: Item | null; onClose: () => void; onRemove: (item: Item) => void }) {
    const { t } = useT();
    const [usage, setUsage] = useState<Usage | null>(null);

    useEffect(() => {
        setUsage(null);
        if (!item) return;
        let alive = true;
        sendJson<Usage>('GET', route('studio.library.usage', item.id))
            .then((u) => alive && setUsage(u))
            .catch(() => alive && setUsage({ posts: [], messages: 0, mass: 0 }));
        return () => {
            alive = false;
        };
    }, [item]);

    return (
        <Dialog open={!!item} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-h-[90svh] max-w-4xl gap-0 overflow-hidden p-0 sm:max-w-4xl">
                <DialogTitle className="sr-only">{t('lib.details')}</DialogTitle>
                {item && (
                    <div className="grid max-h-[90svh] md:grid-cols-[1.2fr_1fr]">
                        <div className="grid min-h-64 place-items-center bg-black">
                            {item.type === 'audio' ? (
                                <div className="grid size-full min-h-72 place-items-center bg-gradient-to-br from-violet-600 via-fuchsia-600 to-rose-500 p-6">
                                    <div className="bg-card w-full max-w-sm rounded-2xl p-1 shadow-2xl">
                                        <AudioPlayer src={item.url} title={t('lib.audioOne')} />
                                    </div>
                                </div>
                            ) : item.type === 'video' ? (
                                <video src={item.url} controls playsInline className="max-h-[90svh] w-full object-contain" />
                            ) : (
                                <img src={item.url} alt="" className="max-h-[90svh] w-full object-contain" />
                            )}
                        </div>
                        <div className="flex min-h-0 flex-col overflow-y-auto p-5">
                            <p className="text-muted-foreground text-xs">
                                {t(item.type === 'video' ? 'lib.video' : item.type === 'audio' ? 'lib.audioOne' : 'lib.photo')} ·{' '}
                                {t('lib.uploaded', { date: day(item.created_at) })}
                            </p>
                            <div className="mt-3 grid grid-cols-3 gap-2">
                                <Stat icon={PenSquare} label={t('lib.usedTimes')} value={String(item.uses)} />
                                <Stat icon={Eye} label={t('lib.views')} value={String(item.views)} />
                                <Stat icon={Wallet} label={t('lib.earned')} value={item.earned ? mnt(item.earned) : '—'} />
                            </div>

                            <div className="mt-4 flex flex-wrap gap-2">
                                <ActionButton icon={PenSquare} label={t('lib.post')} onClick={() => toStudio([item.id])} primary />
                                <ActionButton icon={MessageCircle} label={t('lib.message')} onClick={() => toStudio([item.id], 'fans')} />
                                <button
                                    type="button"
                                    onClick={() => onRemove(item)}
                                    className="text-muted-foreground ml-auto inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold transition hover:bg-red-500/10 hover:text-red-600"
                                >
                                    <Trash2 className="size-4" /> {t('po.delete')}
                                </button>
                            </div>

                            <h3 className="mt-6 mb-2 text-sm font-bold">{t('lib.whereUsed')}</h3>
                            {!usage ? (
                                <LoaderCircle className="text-muted-foreground size-5 animate-spin" />
                            ) : usage.posts.length === 0 && usage.messages + usage.mass === 0 ? (
                                <div className="rounded-xl bg-amber-400/10 p-3 text-sm">
                                    <p className="font-semibold text-amber-700 dark:text-amber-300">{t('lib.notPostedYet')}</p>
                                    <p className="text-muted-foreground mt-0.5 text-xs">{t('lib.notPostedHint')}</p>
                                </div>
                            ) : (
                                <ul className="flex flex-col gap-1.5">
                                    {usage.posts.map((p) => (
                                        <li key={p.id}>
                                            <Link
                                                href={`${route('studio')}#post-${p.id}`}
                                                className="hover:bg-muted flex items-center gap-3 rounded-xl px-2.5 py-2 transition"
                                            >
                                                <span className="min-w-0 flex-1">
                                                    <span className="block truncate text-sm font-medium">{p.body ?? t('lib.untitled')}</span>
                                                    <span className="text-muted-foreground text-xs">
                                                        {day(p.created_at)} ·{' '}
                                                        {p.scheduled
                                                            ? t('lib.scheduled')
                                                            : p.price
                                                              ? mnt(p.price)
                                                              : t(p.visibility === 'public' ? 'po.public' : 'st.subscribers')}
                                                    </span>
                                                </span>
                                                <span className="text-muted-foreground flex shrink-0 items-center gap-2 text-xs tabular-nums">
                                                    <span className="inline-flex items-center gap-0.5">
                                                        <Eye className="size-3.5" /> {p.views}
                                                    </span>
                                                    <span className="inline-flex items-center gap-0.5">
                                                        <Heart className="size-3.5" /> {p.likes}
                                                    </span>
                                                    {p.earned > 0 && (
                                                        <span className="font-bold text-emerald-600 dark:text-emerald-400">{mnt(p.earned)}</span>
                                                    )}
                                                </span>
                                            </Link>
                                        </li>
                                    ))}
                                    {usage.messages + usage.mass > 0 && (
                                        <li className="text-muted-foreground flex items-center gap-2 px-2.5 py-2 text-sm">
                                            <MessageCircle className="size-4" />
                                            {t('lib.inMessages', { n: usage.messages + usage.mass })}
                                        </li>
                                    )}
                                </ul>
                            )}
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Eye; label: string; value: string }) {
    return (
        <div className="bg-muted/60 rounded-xl p-2.5">
            <p className="text-muted-foreground flex items-center gap-1 text-[11px]">
                <Icon className="size-3" /> {label}
            </p>
            <p className="mt-0.5 truncate text-base font-extrabold tabular-nums">{value}</p>
        </div>
    );
}
