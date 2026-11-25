import CreatorCard, { type CreatorCardData } from '@/components/creator-card';
import { Button } from '@/components/ui/button';
import AppLayout from '@/layouts/app-layout';
import { useT } from '@/lib/i18n';
import { Head, Link } from '@inertiajs/react';
import { Rss, Sparkles } from 'lucide-react';

/** A fan's home: the people they follow, a way into the feed, and (if they want) becoming a creator. */
export default function Dashboard({
    creatorStatus,
    following,
}: {
    creatorStatus: 'pending' | 'approved' | 'rejected' | null;
    following: CreatorCardData[];
}) {
    const { t } = useT();
    const statusLabel = { pending: t('cr.pendingT'), approved: t('cr.approvedT'), rejected: t('cr.rejectedT') };

    return (
        <AppLayout breadcrumbs={[{ title: t('nav.dashboard'), href: '/dashboard' }]}>
            <Head title={t('nav.dashboard')} />
            <div className="mx-auto w-full max-w-3xl p-4 md:py-8">
                <section className="flex flex-col gap-4 rounded-xl border p-6 sm:flex-row sm:items-center">
                    <div className="grid size-12 shrink-0 place-items-center rounded-full bg-sky-50 text-sky-600 dark:bg-sky-950">
                        <Rss className="size-6" aria-hidden />
                    </div>
                    <div className="flex-1">
                        <h2 className="font-semibold">{t('nav.feed')}</h2>
                        <p className="text-muted-foreground mt-1 text-sm">{t('fan.feedSub', { n: following.length })}</p>
                    </div>
                    <Button asChild>
                        <Link href={route('feed')}>{t('fan.openFeed')}</Link>
                    </Button>
                </section>

                <div className="mt-8 mb-3 flex items-end justify-between gap-3">
                    <h2 className="font-medium">
                        {t('fan.followingTitle')} <span className="text-muted-foreground">({following.length})</span>
                    </h2>
                    <Link href={route('creators')} className="text-sm font-medium hover:underline">
                        {t('fan.findCreators')}
                    </Link>
                </div>
                {following.length === 0 ? (
                    <p className="text-muted-foreground rounded-xl border border-dashed p-8 text-center text-sm">{t('fan.feedEmpty')}</p>
                ) : (
                    <div className="grid gap-4 sm:grid-cols-2">
                        {following.map((c) => (
                            <CreatorCard key={c.handle} c={c} />
                        ))}
                    </div>
                )}

                {creatorStatus !== 'approved' && (
                    <section className="mt-8 flex flex-col gap-4 rounded-xl border p-6 sm:flex-row sm:items-center">
                        <div className="grid size-12 shrink-0 place-items-center rounded-full bg-rose-50 text-rose-600 dark:bg-rose-950">
                            <Sparkles className="size-6" aria-hidden />
                        </div>
                        <div className="flex-1">
                            <h2 className="font-semibold">{creatorStatus ? statusLabel[creatorStatus] : t('dash.creatorT')}</h2>
                            <p className="text-muted-foreground mt-1 text-sm">{creatorStatus ? t('cr.pendingD') : t('dash.creatorD')}</p>
                        </div>
                        <Button asChild variant="outline">
                            <Link href={route('creator.apply')}>{t('nav.becomeCreator')}</Link>
                        </Button>
                    </section>
                )}
            </div>
        </AppLayout>
    );
}
