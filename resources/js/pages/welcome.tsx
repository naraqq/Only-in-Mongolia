import CreatorCard, { type CreatorCardData } from '@/components/creator-card';
import { Button } from '@/components/ui/button';
import SiteLayout from '@/layouts/site-layout';
import { useT } from '@/lib/i18n';
import { type SharedData } from '@/types';
import { Link, router, usePage } from '@inertiajs/react';
import { ArrowRight, Lock, Search, ShieldCheck, Sparkles } from 'lucide-react';
import { useState, type FormEvent } from 'react';

/** Home: what the site is, a search box, and the newest creators. */
export default function Welcome({ creators, stats }: { creators: CreatorCardData[]; stats: { creators: number; posts: number } }) {
    const { t } = useT();
    const { auth } = usePage<SharedData>().props;
    const [q, setQ] = useState('');

    function search(e: FormEvent) {
        e.preventDefault();
        router.get(route('creators'), q.trim() ? { q: q.trim() } : {});
    }

    return (
        <SiteLayout title={t('home.title')} wide>
            {/* Hero */}
            <section className="py-8 text-center sm:py-14">
                <h1 className="mx-auto max-w-2xl text-3xl font-bold tracking-tight sm:text-5xl">{t('home.h1')}</h1>
                <p className="text-muted-foreground mx-auto mt-4 max-w-xl sm:text-lg">{t('home.lead')}</p>

                <form onSubmit={search} className="mx-auto mt-8 flex max-w-md gap-2">
                    <label className="border-input focus-within:border-ring focus-within:ring-ring/50 flex flex-1 items-center gap-2 rounded-md border px-3 shadow-xs focus-within:ring-[3px]">
                        <Search className="text-muted-foreground size-4" aria-hidden />
                        <input
                            value={q}
                            onChange={(e) => setQ(e.target.value)}
                            placeholder={t('fan.search')}
                            className="placeholder:text-muted-foreground h-10 w-full bg-transparent text-sm outline-none"
                        />
                    </label>
                    <Button type="submit" className="h-10">
                        {t('fan.searchBtn')}
                    </Button>
                </form>

                <div className="text-muted-foreground mt-8 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm">
                    <span className="inline-flex items-center gap-1.5">
                        <ShieldCheck className="size-4" aria-hidden /> {t('home.pt1')}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                        <Lock className="size-4" aria-hidden /> {t('home.pt2')}
                    </span>
                </div>
            </section>

            {/* Newest creators */}
            <section>
                <div className="mb-4 flex items-end justify-between gap-4">
                    <div>
                        <h2 className="text-xl font-semibold tracking-tight">{t('home.newCreators')}</h2>
                        <p className="text-muted-foreground text-sm">{t('home.stats', { creators: stats.creators, posts: stats.posts })}</p>
                    </div>
                    <Link href={route('creators')} className="inline-flex shrink-0 items-center gap-1 text-sm font-medium hover:underline">
                        {t('home.seeAll')} <ArrowRight className="size-4" aria-hidden />
                    </Link>
                </div>
                {creators.length === 0 ? (
                    <p className="text-muted-foreground rounded-xl border border-dashed p-10 text-center">{t('home.noCreators')}</p>
                ) : (
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {creators.map((c) => (
                            <CreatorCard key={c.handle} c={c} />
                        ))}
                    </div>
                )}
            </section>

            {/* Creator invitation */}
            <section className="mt-12 flex flex-col items-start gap-4 rounded-xl border p-6 sm:flex-row sm:items-center">
                <div className="grid size-12 shrink-0 place-items-center rounded-full bg-rose-50 text-rose-600 dark:bg-rose-950">
                    <Sparkles className="size-6" aria-hidden />
                </div>
                <div className="flex-1">
                    <h2 className="font-semibold">{t('dash.creatorT')}</h2>
                    <p className="text-muted-foreground mt-1 text-sm">{t('dash.creatorD')}</p>
                </div>
                <Button asChild>
                    <Link href={auth.user ? route('creator.apply') : route('login')}>{t('nav.becomeCreator')}</Link>
                </Button>
            </section>
        </SiteLayout>
    );
}
