import CreatorCard, { type CreatorCardData } from '@/components/creator-card';
import SocialLayout from '@/layouts/social-layout';
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
        <SocialLayout title={t('nav.discover')} wide>
            <div className="px-4 pt-10 pb-8 sm:px-8 sm:pt-16">
                <h1 className="text-foreground text-4xl font-extrabold tracking-[-0.055em] sm:text-6xl">{t('nav.discover')}</h1>
                <p className="text-muted-foreground mt-3 max-w-lg">{t('fan.discoverSub')}</p>

                <div className="border-border mt-8 flex flex-col gap-3 border-y py-3 sm:flex-row">
                    <label className="focus-within:ring-ring/50 bg-background flex flex-1 items-center gap-2 rounded-md px-3 focus-within:ring-[3px]">
                        <Search className="text-muted-foreground size-4" aria-hidden />
                        <input
                            type="search"
                            aria-label={t('fan.search')}
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
                                aria-pressed={filters.sort === s}
                                onClick={() => go({ sort: s })}
                                className={`rounded-md px-3 py-1.5 font-medium transition ${filters.sort === s ? 'bg-card shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                            >
                                {t(s === 'new' ? 'fan.sortNew' : 'fan.sortPopular')}
                            </button>
                        ))}
                    </div>
                </div>

                {creators.length === 0 ? (
                    <p className="text-muted-foreground mt-12 text-center">{t('fan.noneFound')}</p>
                ) : (
                    <div className="mt-7 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                        {creators.map((c) => (
                            <CreatorCard key={c.handle} c={c} />
                        ))}
                    </div>
                )}
            </div>
        </SocialLayout>
    );
}
