import CreatorCard, { type CreatorCardData } from '@/components/creator-card';
import SiteLayout from '@/layouts/site-layout';
import { useT } from '@/lib/i18n';
import { router } from '@inertiajs/react';
import { Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

/** Discover creators: search by name, @handle or bio; newest or most followed. */
export default function Creators({ creators, filters }: { creators: CreatorCardData[]; filters: { q: string; sort: 'new' | 'popular' } }) {
    const { t } = useT();
    const [q, setQ] = useState(filters.q);
    const go = (next: Partial<typeof filters>) => {
        const f = { ...filters, q, ...next };
        router.get(
            route('creators'),
            { ...(f.q ? { q: f.q } : {}), ...(f.sort !== 'new' ? { sort: f.sort } : {}) },
            { preserveState: true, replace: true },
        );
    };

    // Search as you type, after a short pause.
    const first = useRef(true);
    useEffect(() => {
        if (first.current) {
            first.current = false;
            return;
        }
        const id = setTimeout(() => go({ q: q.trim() }), 350);
        return () => clearTimeout(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [q]);

    return (
        <SiteLayout title={t('nav.creators')} wide>
            <h1 className="text-2xl font-semibold tracking-tight">{t('nav.creators')}</h1>
            <p className="text-muted-foreground mt-1">{t('fan.discoverSub')}</p>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <label className="border-input focus-within:border-ring focus-within:ring-ring/50 flex flex-1 items-center gap-2 rounded-md border px-3 shadow-xs focus-within:ring-[3px]">
                    <Search className="text-muted-foreground size-4" aria-hidden />
                    <input
                        type="search"
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder={t('fan.search')}
                        className="placeholder:text-muted-foreground h-10 w-full bg-transparent text-sm outline-none"
                    />
                </label>
                <div className="bg-muted flex rounded-lg p-1 text-sm" role="group">
                    {(['new', 'popular'] as const).map((s) => (
                        <button
                            key={s}
                            type="button"
                            onClick={() => go({ sort: s })}
                            className={`rounded-md px-3 py-1.5 font-medium transition ${filters.sort === s ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                            {t(s === 'new' ? 'fan.sortNew' : 'fan.sortPopular')}
                        </button>
                    ))}
                </div>
            </div>

            {creators.length === 0 ? (
                <p className="text-muted-foreground mt-12 text-center">{t('fan.noneFound')}</p>
            ) : (
                <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {creators.map((c) => (
                        <CreatorCard key={c.handle} c={c} />
                    ))}
                </div>
            )}
        </SiteLayout>
    );
}
