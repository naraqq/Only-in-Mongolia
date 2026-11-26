import UserAvatar from '@/components/user-avatar';
import AdminLayout from '@/layouts/admin-layout';
import { mnt } from '@/lib/format';
import { useT, type TKey } from '@/lib/i18n';
import { Link, router } from '@inertiajs/react';
import { ChevronRight, Search, ShieldCheck } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

type Row = {
    id: number;
    name: string;
    phone: string | null;
    avatar_url: string | null;
    is_admin: boolean;
    banned: boolean;
    creator: { handle: string; display_name: string; status: string } | null;
    spent: number;
    joined: string;
};
type Page = { data: Row[]; links: { url: string | null; label: string; active: boolean }[]; total: number; from: number | null; to: number | null };
type Filter = 'all' | 'creators' | 'admins' | 'banned';

const FILTERS: [Filter, TKey][] = [
    ['all', 'au.all'],
    ['creators', 'au.creators'],
    ['admins', 'au.admins'],
    ['banned', 'au.banned'],
];

/** Admins: every account, searchable by name, phone, @handle or id. */
export default function AdminUsers({ users, q, filter }: { users: Page; q: string; filter: Filter }) {
    const { t } = useT();
    const [query, setQuery] = useState(q);
    const first = useRef(true);

    // Search as you type (after a short pause).
    useEffect(() => {
        if (first.current) {
            first.current = false;
            return;
        }
        const id = setTimeout(() => {
            router.get(
                route('admin.users'),
                { ...(query ? { q: query } : {}), ...(filter !== 'all' ? { filter } : {}) },
                { preserveState: true, replace: true },
            );
        }, 300);
        return () => clearTimeout(id);
    }, [query]); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <AdminLayout title={t('au.title')}>
            <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <label className="bg-muted flex h-11 flex-1 items-center gap-2 rounded-xl px-3">
                        <Search className="text-muted-foreground size-4" />
                        <input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder={t('au.search')}
                            className="h-full flex-1 bg-transparent text-sm outline-none"
                            type="search"
                        />
                    </label>
                    <div className="flex gap-1" role="group">
                        {FILTERS.map(([k, label]) => (
                            <Link
                                key={k}
                                href={route('admin.users', { ...(q ? { q } : {}), ...(k !== 'all' ? { filter: k } : {}) })}
                                preserveState
                                className={`rounded-full px-3 py-1.5 text-sm font-semibold ${filter === k ? 'bg-foreground text-background' : 'bg-muted hover:bg-muted/70'}`}
                            >
                                {t(label)}
                            </Link>
                        ))}
                    </div>
                </div>

                <p className="text-muted-foreground text-xs">{t('au.count', { n: users.total })}</p>

                {users.data.length === 0 ? (
                    <p className="text-muted-foreground bg-card rounded-2xl p-10 text-center text-sm shadow-xs">{t('au.none')}</p>
                ) : (
                    <ul className="bg-card rounded-2xl shadow-xs">
                        {users.data.map((u) => (
                            <li key={u.id}>
                                <Link href={route('admin.users.show', u.id)} className="hover:bg-muted/50 flex items-center gap-3 px-4 py-3">
                                    <UserAvatar name={u.name} src={u.avatar_url} seed={u.creator?.handle ?? u.name} className="size-10" />
                                    <div className="min-w-0 flex-1">
                                        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm font-semibold">
                                            <span className="truncate">{u.name}</span>
                                            {u.creator && <span className="text-muted-foreground font-normal">@{u.creator.handle}</span>}
                                            {u.is_admin && (
                                                <span className="bg-primary/10 text-primary inline-flex items-center gap-1 rounded-full px-2 text-[11px] font-bold">
                                                    <ShieldCheck className="size-3" /> {t('au.admin')}
                                                </span>
                                            )}
                                            {u.banned && (
                                                <span className="rounded-full bg-red-100 px-2 text-[11px] font-bold text-red-700">
                                                    {t('au.bannedTag')}
                                                </span>
                                            )}
                                            {u.creator && u.creator.status !== 'approved' && (
                                                <span className="bg-muted rounded-full px-2 text-[11px] font-bold">
                                                    {t(`au.status.${u.creator.status}` as TKey)}
                                                </span>
                                            )}
                                        </p>
                                        <p className="text-muted-foreground text-xs">
                                            #{u.id} · {u.phone ?? '—'} · {u.joined.slice(0, 10).replaceAll('-', '.')}
                                        </p>
                                    </div>
                                    {u.spent > 0 && <span className="hidden text-sm font-semibold tabular-nums sm:block">{mnt(u.spent)}</span>}
                                    <ChevronRight className="text-muted-foreground size-4" />
                                </Link>
                            </li>
                        ))}
                    </ul>
                )}

                {users.links.length > 3 && (
                    <nav className="flex flex-wrap justify-center gap-1">
                        {users.links.map((l, i) => (
                            <Link
                                key={i}
                                href={l.url ?? '#'}
                                preserveState
                                className={`min-w-9 rounded-lg px-3 py-1.5 text-center text-sm ${l.active ? 'bg-foreground text-background font-bold' : 'hover:bg-muted'} ${l.url ? '' : 'pointer-events-none opacity-40'}`}
                            >
                                {i === 0 ? '‹' : i === users.links.length - 1 ? '›' : l.label}
                            </Link>
                        ))}
                    </nav>
                )}
            </div>
        </AdminLayout>
    );
}
