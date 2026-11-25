import CreatorCard, { type CreatorCardData } from '@/components/creator-card';
import { Button } from '@/components/ui/button';
import SocialLayout from '@/layouts/social-layout';
import { avatarGradient } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { Link } from '@inertiajs/react';
import { Sparkles } from 'lucide-react';

/** A fan's home: the people they follow, a way into the feed, and (if they want) becoming a creator. */
export default function Dashboard({
    creatorStatus,
    following,
    subscriptions,
}: {
    creatorStatus: 'pending' | 'approved' | 'rejected' | null;
    following: CreatorCardData[];
    subscriptions: { handle: string; display_name: string; price_monthly: number; expires_at: string }[];
}) {
    const { t } = useT();
    const statusLabel = { pending: t('cr.pendingT'), approved: t('cr.approvedT'), rejected: t('cr.rejectedT') };

    return (
        <SocialLayout
            title={t('fan.followingTitle')}
            header={<h1 className="text-lg font-bold tracking-wide uppercase">{t('fan.followingTitle')}</h1>}
        >
            <div className="p-4">
                {subscriptions.length > 0 && (
                    <section className="mb-8">
                        <h2 className="mb-3 font-medium">
                            {t('fan.subscriptions')} <span className="text-muted-foreground">({subscriptions.length})</span>
                        </h2>
                        <div className="flex flex-col divide-y rounded-2xl border">
                            {subscriptions.map((s) => (
                                <Link
                                    key={s.handle}
                                    href={route('creator.show', s.handle)}
                                    className="hover:bg-muted/50 flex items-center gap-3 p-3 transition"
                                >
                                    <span
                                        className={`grid size-11 shrink-0 place-items-center rounded-full bg-gradient-to-br font-bold text-white ${avatarGradient(s.handle)}`}
                                    >
                                        {s.display_name.charAt(0)}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate font-semibold">{s.display_name}</span>
                                        <span className="text-muted-foreground block text-xs">
                                            {t('cp.until', { date: s.expires_at.slice(0, 10).replaceAll('-', '.') })}
                                        </span>
                                    </span>
                                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                                        {t('cp.subscribed')}
                                    </span>
                                </Link>
                            ))}
                        </div>
                    </section>
                )}

                <div className="mb-3 flex items-end justify-between gap-3">
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
        </SocialLayout>
    );
}
