import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import UserAvatar from '@/components/user-avatar';
import StudioLayout from '@/layouts/studio-layout';
import { ask } from '@/lib/confirm';
import { mnt } from '@/lib/format';
import { sendJson } from '@/lib/http';
import { useT, type TKey } from '@/lib/i18n';
import { toast } from '@/lib/toast';
import { Link, router } from '@inertiajs/react';
import { Ban, Check, ListPlus, MessageCircle, MoreHorizontal, Pencil, Plus, Search, Trash2, UserMinus, Users, X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';

type Fan = {
    id: number;
    name: string;
    handle: string | null;
    avatar_url: string | null;
    spent: number;
    subscribed_at: string | null;
    expires_at: string | null;
    active: boolean;
    following: boolean;
    followed_at: string | null;
    referrer: string | null;
    blocked: boolean;
    lists: number[];
};
type List = { id: number; name: string };

const GROUPS: { key: string; label: TKey }[] = [
    { key: 'all', label: 'fp.all' },
    { key: 'subscribers', label: 'fp.subscribers' },
    { key: 'followers', label: 'fp.followers' },
    { key: 'new', label: 'fp.new' },
    { key: 'expired', label: 'fp.expired' },
    { key: 'top', label: 'fp.top' },
];

const day = (s: string | null) => (s ? s.slice(0, 10).replaceAll('-', '.') : '');

/** Studio → Fans: everyone who follows or subscribes, what they've spent, and the creator's own lists. */
export default function StudioFans({
    fans,
    total,
    show,
    q,
    sort,
    hasMore,
    lists,
    counts,
}: {
    fans: Fan[];
    total: number;
    show: string;
    q: string;
    sort: 'recent' | 'spent';
    hasMore: boolean;
    lists: List[];
    counts: Record<string, number>;
}) {
    const { t } = useT();
    const [search, setSearch] = useState(q);
    const [page, setPage] = useState(1);
    const first = useRef(true);

    const visit = (params: Record<string, string | number>, keep = false) =>
        router.get(route('studio.fans'), { show, q: search, sort, ...params }, { preserveScroll: keep, preserveState: true, replace: true });

    // Search as you type (after a short pause).
    useEffect(() => {
        if (first.current) {
            first.current = false;
            return;
        }
        const timer = setTimeout(() => {
            setPage(1);
            visit({ q: search });
        }, 300);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    const current = show.startsWith('list:') ? lists.find((l) => `list:${l.id}` === show) : null;

    return (
        <StudioLayout title={t('fp.title')} subtitle={t('fp.sub')}>
            <div className="grid items-start gap-5 lg:grid-cols-[1fr_280px]">
                <section className="bg-card min-w-0 overflow-hidden rounded-2xl shadow-xs">
                    {/* Groups */}
                    <div className="border-border flex gap-1 overflow-x-auto border-b p-2">
                        {GROUPS.map((g) => (
                            <button
                                key={g.key}
                                type="button"
                                onClick={() => {
                                    setPage(1);
                                    visit({ show: g.key, page: 1 });
                                }}
                                className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold transition ${
                                    show === g.key
                                        ? 'bg-primary text-primary-foreground'
                                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                                }`}
                            >
                                {t(g.label)}
                                <span className={`text-xs tabular-nums ${show === g.key ? 'opacity-80' : 'opacity-60'}`}>
                                    {g.key === 'all' ? (show === 'all' ? total : '') : (counts[g.key] ?? 0)}
                                </span>
                            </button>
                        ))}
                        {current && (
                            <span className="bg-primary text-primary-foreground inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold">
                                {current.name} <span className="text-xs opacity-80">{counts[show] ?? 0}</span>
                            </span>
                        )}
                    </div>

                    {/* Search and sort */}
                    <div className="flex flex-wrap items-center gap-2 p-3">
                        <label className="bg-muted flex h-10 min-w-0 flex-1 items-center gap-2 rounded-xl px-3">
                            <Search className="text-muted-foreground size-4 shrink-0" />
                            <input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder={t('fp.search')}
                                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                            />
                            {search && (
                                <button type="button" onClick={() => setSearch('')} aria-label={t('dtp.clear')}>
                                    <X className="text-muted-foreground size-4" />
                                </button>
                            )}
                        </label>
                        <div className="bg-muted inline-flex rounded-full p-1">
                            {(['recent', 'spent'] as const).map((s) => (
                                <button
                                    key={s}
                                    type="button"
                                    onClick={() => visit({ sort: s, page }, true)}
                                    className={`h-8 rounded-full px-3 text-sm font-semibold transition ${sort === s ? 'bg-card shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                                >
                                    {t(s === 'recent' ? 'fp.sortRecent' : 'fp.sortSpent')}
                                </button>
                            ))}
                        </div>
                    </div>

                    {fans.length === 0 ? (
                        <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
                            <span className="bg-muted grid size-14 place-items-center rounded-2xl">
                                <Users className="text-muted-foreground size-6" />
                            </span>
                            <p className="font-bold">{t(q ? 'fp.noMatch' : 'fp.empty')}</p>
                            {!q && <p className="text-muted-foreground max-w-sm text-sm">{t('fp.emptyHint')}</p>}
                        </div>
                    ) : (
                        <ul className="divide-border divide-y">
                            {fans.map((f) => (
                                <FanRow key={f.id} fan={f} lists={lists} />
                            ))}
                        </ul>
                    )}

                    {hasMore && (
                        <div className="border-border border-t p-3 text-center">
                            <button
                                type="button"
                                onClick={() => {
                                    setPage(page + 1);
                                    visit({ page: page + 1 }, true);
                                }}
                                className="hover:bg-muted h-9 rounded-full px-4 text-sm font-semibold"
                            >
                                {t('fp.more', { shown: fans.length, total })}
                            </button>
                        </div>
                    )}
                </section>

                <Lists lists={lists} counts={counts} show={show} onOpen={(key) => visit({ show: key, page: 1 })} />
            </div>
        </StudioLayout>
    );
}

function FanRow({ fan, lists }: { fan: Fan; lists: List[] }) {
    const { t } = useT();
    const status = fan.active
        ? { label: t('fp.statusActive'), tone: 'bg-primary/15 text-primary' }
        : fan.subscribed_at
          ? { label: t('fp.statusExpired'), tone: 'bg-muted text-muted-foreground' }
          : { label: t('fp.statusFollower'), tone: 'bg-sky-500/15 text-sky-600 dark:text-sky-400' };
    const ref = fan.referrer;
    const from = !ref || ref === 'direct' ? null : ref.startsWith('app:') ? t('fp.fromApp') : ref.startsWith('ref:') ? `#${ref.slice(4)}` : ref;

    async function removeFollower() {
        if (await ask({ message: t('fp.removeConfirm', { name: fan.name }), confirm: t('fp.remove'), cancel: t('pe.cancel'), danger: true })) {
            router.delete(route('studio.fans.unfollow', fan.id), { preserveScroll: true, onSuccess: () => toast(t('fp.removed')) });
        }
    }

    async function block() {
        if (
            !fan.blocked &&
            !(await ask({ message: t('fp.blockConfirm', { name: fan.name }), confirm: t('fp.block'), cancel: t('pe.cancel'), danger: true }))
        )
            return;
        try {
            await sendJson('POST', route('users.block', fan.id));
            router.reload({ only: ['fans', 'counts', 'total'] });
            toast(t(fan.blocked ? 'fp.unblocked' : 'fp.blocked'));
        } catch {
            toast(t('qa.error'));
        }
    }

    return (
        <li className={`flex items-center gap-3 px-4 py-3 ${fan.blocked ? 'opacity-50' : ''}`}>
            <UserAvatar name={fan.name} src={fan.avatar_url} seed={fan.handle ?? String(fan.id)} className="size-11 shrink-0" />
            <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                    {fan.handle ? (
                        <Link href={route('creator.show', fan.handle)} className="truncate font-bold hover:underline">
                            {fan.name}
                        </Link>
                    ) : (
                        <span className="truncate font-bold">{fan.name}</span>
                    )}
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${status.tone}`}>{status.label}</span>
                    {fan.blocked && (
                        <span className="bg-destructive/15 text-destructive shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold">
                            {t('fp.blockedTag')}
                        </span>
                    )}
                </div>
                <p className="text-muted-foreground truncate text-xs">
                    {fan.active && fan.expires_at
                        ? t('fp.until', { date: day(fan.expires_at) })
                        : fan.followed_at
                          ? t('fp.followedOn', { date: day(fan.followed_at) })
                          : fan.subscribed_at
                            ? t('fp.since', { date: day(fan.subscribed_at) })
                            : ''}
                    {from && ` · ${t('fp.via', { from })}`}
                    {fan.lists.length > 0 &&
                        ` · ${fan.lists
                            .map((id) => lists.find((l) => l.id === id)?.name)
                            .filter(Boolean)
                            .join(', ')}`}
                </p>
            </div>
            <div className="hidden text-right sm:block">
                <p className={`text-sm font-bold tabular-nums ${fan.spent ? '' : 'text-muted-foreground'}`}>{fan.spent ? mnt(fan.spent) : '—'}</p>
                <p className="text-muted-foreground text-[11px]">{t('fp.spent')}</p>
            </div>
            <button
                type="button"
                disabled={fan.blocked}
                onClick={() => router.post(route('studio.fans.message', fan.id), {}, { onError: () => toast(t('fp.cantMessage')) })}
                className="hover:bg-muted grid size-9 shrink-0 place-items-center rounded-full disabled:opacity-40"
                aria-label={t('fp.message')}
                title={t('fp.message')}
            >
                <MessageCircle className="size-[18px]" />
            </button>
            <DropdownMenu>
                <DropdownMenuTrigger className="hover:bg-muted grid size-9 shrink-0 place-items-center rounded-full" aria-label={t('fp.actions')}>
                    <MoreHorizontal className="size-[18px]" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel className="text-muted-foreground text-xs">{t('fp.addToList')}</DropdownMenuLabel>
                    {lists.length === 0 && <p className="text-muted-foreground px-2 py-1.5 text-xs">{t('fp.noLists')}</p>}
                    {lists.map((l) => {
                        const on = fan.lists.includes(l.id);
                        return (
                            <DropdownMenuItem
                                key={l.id}
                                onSelect={(e) => {
                                    e.preventDefault();
                                    router.post(
                                        route('studio.lists.toggle', { list: l.id, user: fan.id }),
                                        {},
                                        { preserveScroll: true, preserveState: true },
                                    );
                                }}
                            >
                                {on ? <Check className="text-primary size-4" /> : <ListPlus className="size-4" />} {l.name}
                            </DropdownMenuItem>
                        );
                    })}
                    <DropdownMenuSeparator />
                    {fan.following && (
                        <DropdownMenuItem onSelect={() => void removeFollower()}>
                            <UserMinus className="size-4" /> {t('fp.remove')}
                        </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onSelect={() => void block()} className="text-destructive focus:text-destructive">
                        <Ban className="size-4" /> {t(fan.blocked ? 'fp.unblock' : 'fp.block')}
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </li>
    );
}

/** The creator's own lists: open one, add, rename, delete. */
function Lists({ lists, counts, show, onOpen }: { lists: List[]; counts: Record<string, number>; show: string; onOpen: (key: string) => void }) {
    const { t } = useT();
    const [adding, setAdding] = useState(false);
    const [editing, setEditing] = useState<number | null>(null);
    const [name, setName] = useState('');

    function save(e: FormEvent) {
        e.preventDefault();
        const value = name.trim();
        if (!value) return;
        const done = { preserveScroll: true, onSuccess: () => (setAdding(false), setEditing(null), setName('')) };
        if (editing) router.patch(route('studio.lists.update', editing), { name: value }, done);
        else router.post(route('studio.lists.store'), { name: value }, done);
    }

    async function remove(list: List) {
        if (
            await ask({ message: t('fp.deleteListConfirm', { name: list.name }), confirm: t('fp.deleteList'), cancel: t('pe.cancel'), danger: true })
        ) {
            router.delete(route('studio.lists.destroy', list.id), { preserveScroll: true });
        }
    }

    const form = (
        <form onSubmit={save} className="flex items-center gap-2 px-2 py-1">
            <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={40}
                placeholder={t('fp.listName')}
                className="bg-muted h-9 min-w-0 flex-1 rounded-lg px-3 text-sm outline-none"
            />
            <button
                type="submit"
                disabled={!name.trim()}
                className="bg-primary text-primary-foreground grid size-9 place-items-center rounded-lg disabled:opacity-40"
            >
                <Check className="size-4" />
            </button>
            <button
                type="button"
                onClick={() => (setAdding(false), setEditing(null), setName(''))}
                className="hover:bg-muted grid size-9 place-items-center rounded-lg"
                aria-label={t('pe.cancel')}
            >
                <X className="size-4" />
            </button>
        </form>
    );

    return (
        <aside className="bg-card rounded-2xl p-3 shadow-xs">
            <div className="mb-1 flex items-center justify-between px-2">
                <h2 className="font-bold">{t('fp.lists')}</h2>
                {!adding && (
                    <button
                        type="button"
                        onClick={() => (setAdding(true), setEditing(null), setName(''))}
                        className="text-primary inline-flex h-8 items-center gap-1 rounded-full px-2 text-sm font-semibold hover:underline"
                    >
                        <Plus className="size-4" /> {t('fp.newList')}
                    </button>
                )}
            </div>
            <p className="text-muted-foreground mb-2 px-2 text-xs">{t('fp.listsHint')}</p>
            {adding && form}
            <ul className="flex flex-col">
                {lists.map((l) =>
                    editing === l.id ? (
                        <li key={l.id}>{form}</li>
                    ) : (
                        <li
                            key={l.id}
                            className={`group flex items-center gap-1 rounded-lg ${show === `list:${l.id}` ? 'bg-muted' : 'hover:bg-muted/60'}`}
                        >
                            <button
                                type="button"
                                onClick={() => onOpen(`list:${l.id}`)}
                                className="flex min-w-0 flex-1 items-center justify-between gap-2 px-2 py-2 text-left text-sm"
                            >
                                <span className="truncate font-medium">{l.name}</span>
                                <span className="text-muted-foreground text-xs tabular-nums">{counts[`list:${l.id}`] ?? 0}</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => (setEditing(l.id), setAdding(false), setName(l.name))}
                                className="text-muted-foreground hover:text-foreground grid size-8 place-items-center rounded-md opacity-0 group-hover:opacity-100 focus:opacity-100"
                                aria-label={t('fp.rename')}
                            >
                                <Pencil className="size-3.5" />
                            </button>
                            <button
                                type="button"
                                onClick={() => void remove(l)}
                                className="text-muted-foreground hover:text-destructive grid size-8 place-items-center rounded-md opacity-0 group-hover:opacity-100 focus:opacity-100"
                                aria-label={t('fp.deleteList')}
                            >
                                <Trash2 className="size-3.5" />
                            </button>
                        </li>
                    ),
                )}
            </ul>
            {lists.length === 0 && !adding && <p className="text-muted-foreground px-2 py-3 text-sm">{t('fp.noLists')}</p>}
        </aside>
    );
}
