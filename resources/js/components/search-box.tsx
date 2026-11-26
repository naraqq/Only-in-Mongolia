import UserAvatar from '@/components/user-avatar';
import { useT } from '@/lib/i18n';
import { type SharedData } from '@/types';
import { router, usePage } from '@inertiajs/react';
import { BadgeCheck, Clock3, LoaderCircle, Search, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';

type Creator = { handle: string; display_name: string; avatar_url: string | null; followers: number };
type Item = { kind: 'recent'; query: string } | { kind: 'creator'; creator: Creator } | { kind: 'search'; query: string };

const DEBOUNCE_MS = 180;

async function request(method: 'GET' | 'DELETE', url: string, signal?: AbortSignal) {
    const xsrf = decodeURIComponent(document.cookie.match(/(?:^|; )XSRF-TOKEN=([^;]*)/)?.[1] ?? '');
    const res = await fetch(url, {
        method,
        signal,
        credentials: 'same-origin',
        headers: { Accept: 'application/json', 'X-XSRF-TOKEN': xsrf, 'X-Requested-With': 'XMLHttpRequest' },
    });
    if (!res.ok) throw new Error(String(res.status));
    return res.status === 204 ? null : res.json();
}

/**
 * Search with a dropdown, like Facebook's: recent searches when empty, matching creators as you type,
 * and "search for …" at the bottom. Arrow keys move, Enter opens, Escape closes.
 */
export default function SearchBox() {
    const { t } = useT();
    const { auth } = usePage<SharedData>().props;
    const listId = useId();
    const box = useRef<HTMLDivElement>(null);
    const input = useRef<HTMLInputElement>(null);
    const [q, setQ] = useState('');
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [recent, setRecent] = useState<string[]>([]);
    const [creators, setCreators] = useState<Creator[]>([]);
    const [active, setActive] = useState(-1);
    const term = q.trim();

    // Fetch suggestions for what's typed (or recent searches when empty), shortly after typing stops.
    useEffect(() => {
        if (!open) return;
        const controller = new AbortController();
        const timer = setTimeout(
            async () => {
                setLoading(true);
                try {
                    const r = await request('GET', route('search.suggest', term ? { q: term } : {}), controller.signal);
                    setRecent(r.recent);
                    setCreators(r.creators);
                    setActive(-1);
                } catch {
                    /* aborted (newer typing) or offline: keep what's shown */
                } finally {
                    if (!controller.signal.aborted) setLoading(false);
                }
            },
            term ? DEBOUNCE_MS : 0,
        );
        return () => {
            clearTimeout(timer);
            controller.abort();
        };
    }, [term, open]);

    // Close when clicking anywhere else.
    useEffect(() => {
        if (!open) return;
        const away = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
        document.addEventListener('pointerdown', away);
        return () => document.removeEventListener('pointerdown', away);
    }, [open]);

    const items: Item[] = [
        ...recent.map((query) => ({ kind: 'recent' as const, query })),
        ...creators.map((creator) => ({ kind: 'creator' as const, creator })),
        ...(term ? [{ kind: 'search' as const, query: term }] : []),
    ];

    function go(item: Item | undefined) {
        const target =
            item?.kind === 'creator'
                ? route('creator.show', item.creator.handle)
                : route('search', item ? { q: item.query } : term ? { q: term } : {});
        setOpen(false);
        input.current?.blur();
        router.visit(target);
    }

    function onKey(e: KeyboardEvent<HTMLInputElement>) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            setOpen(true);
            if (!items.length) return;
            setActive((i) => (e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            go(active >= 0 ? items[active] : term ? { kind: 'search', query: term } : undefined);
        } else if (e.key === 'Escape') {
            setOpen(false);
            input.current?.blur();
        }
    }

    async function forget(query: string) {
        setRecent((r) => r.filter((x) => x !== query));
        await request('DELETE', route('search.recent.forget', { q: query })).catch(() => {});
    }

    async function clearAll() {
        setRecent([]);
        await request('DELETE', route('search.recent.clear')).catch(() => {});
    }

    const option = (i: number) =>
        `flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition ${active === i ? 'bg-muted' : 'hover:bg-muted/70'}`;

    return (
        <div ref={box} className="relative">
            <div className={`bg-muted flex items-center gap-2 px-4 transition ${open ? 'rounded-t-2xl rounded-b-none' : 'rounded-full'}`}>
                <Search className="text-muted-foreground size-4 shrink-0" aria-hidden />
                <input
                    ref={input}
                    type="search"
                    role="combobox"
                    aria-expanded={open}
                    aria-controls={listId}
                    aria-autocomplete="list"
                    aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
                    aria-label={t('nav.search')}
                    placeholder={t('search.placeholder')}
                    maxLength={100}
                    value={q}
                    onFocus={() => setOpen(true)}
                    onChange={(e) => {
                        setQ(e.target.value);
                        setOpen(true);
                    }}
                    onKeyDown={onKey}
                    className="placeholder:text-muted-foreground h-11 w-full bg-transparent text-sm outline-none [&::-webkit-search-cancel-button]:hidden"
                />
                {loading ? (
                    <LoaderCircle className="text-muted-foreground size-4 shrink-0 animate-spin" aria-hidden />
                ) : (
                    q && (
                        <button
                            type="button"
                            onClick={() => {
                                setQ('');
                                input.current?.focus();
                            }}
                            className="text-muted-foreground hover:text-foreground grid size-6 shrink-0 place-items-center rounded-full"
                            aria-label={t('search.clearQuery')}
                        >
                            <X className="size-4" />
                        </button>
                    )
                )}
            </div>

            {open && (
                <div
                    id={listId}
                    role="listbox"
                    className="bg-popover text-popover-foreground animate-toast-in absolute inset-x-0 top-full z-40 max-h-[70vh] overflow-y-auto rounded-b-2xl p-2 shadow-xl"
                >
                    {!term && recent.length > 0 && (
                        <div className="flex items-center justify-between px-2 pt-1 pb-2">
                            <span className="text-sm font-bold">{t('search.recent')}</span>
                            <button type="button" onClick={clearAll} className="text-primary text-xs font-semibold hover:underline">
                                {t('search.clear')}
                            </button>
                        </div>
                    )}
                    {!term && recent.length === 0 && !loading && (
                        <p className="text-muted-foreground px-2 py-3 text-sm">{auth.user ? t('search.noRecent') : t('search.hint')}</p>
                    )}

                    {items.map((item, i) => {
                        const id = `${listId}-${i}`;
                        if (item.kind === 'recent') {
                            return (
                                <div key={id} id={id} role="option" aria-selected={active === i} className="group flex items-center gap-1">
                                    <button type="button" className={option(i)} onMouseEnter={() => setActive(i)} onClick={() => go(item)}>
                                        <span className="bg-muted grid size-9 shrink-0 place-items-center rounded-full">
                                            <Clock3 className="text-muted-foreground size-4" />
                                        </span>
                                        <span className="truncate text-sm font-medium">{item.query}</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => forget(item.query)}
                                        className="text-muted-foreground hover:bg-muted hover:text-foreground grid size-8 shrink-0 place-items-center rounded-full opacity-60 group-hover:opacity-100"
                                        aria-label={t('search.forget', { query: item.query })}
                                    >
                                        <X className="size-4" />
                                    </button>
                                </div>
                            );
                        }
                        if (item.kind === 'creator') {
                            const c = item.creator;
                            return (
                                <button
                                    key={id}
                                    id={id}
                                    role="option"
                                    aria-selected={active === i}
                                    type="button"
                                    className={option(i)}
                                    onMouseEnter={() => setActive(i)}
                                    onClick={() => go(item)}
                                >
                                    <UserAvatar name={c.display_name} src={c.avatar_url} seed={c.handle} className="size-9 shrink-0" />
                                    <span className="min-w-0">
                                        <span className="flex items-center gap-1 text-sm font-semibold">
                                            <span className="truncate">{c.display_name}</span>
                                            <BadgeCheck className="text-primary size-3.5 shrink-0" />
                                        </span>
                                        <span className="text-muted-foreground block truncate text-xs">
                                            @{c.handle} · {t('search.followers', { n: c.followers })}
                                        </span>
                                    </span>
                                </button>
                            );
                        }
                        return (
                            <button
                                key={id}
                                id={id}
                                role="option"
                                aria-selected={active === i}
                                type="button"
                                className={option(i)}
                                onMouseEnter={() => setActive(i)}
                                onClick={() => go(item)}
                            >
                                <span className="bg-primary text-primary-foreground grid size-9 shrink-0 place-items-center rounded-full">
                                    <Search className="size-4" />
                                </span>
                                <span className="truncate text-sm">
                                    {t('search.searchFor')} <b>{item.query}</b>
                                </span>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
