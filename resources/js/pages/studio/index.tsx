import MassMessage from '@/components/mass-message';
import PostCard, { type PostItem } from '@/components/post-card';
import PostComposer from '@/components/post-composer';
import { Button } from '@/components/ui/button';
import SocialLayout from '@/layouts/social-layout';
import { mnt } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { Link, router } from '@inertiajs/react';
import { ExternalLink } from 'lucide-react';

type StudioCreator = { handle: string; display_name: string; price_monthly: number; adult_content: boolean; avatar_url: string | null };

/** Write posts (text + photos/videos), pick who sees them, and manage what's already up. */
type Stats = { subscribers: number; followers: number; earnedThisMonth: number; feePercent: number };

export default function Studio({ creator, posts, stats }: { creator: StudioCreator; posts: PostItem[]; stats: Stats }) {
    const { t } = useT();
    const author = { name: creator.display_name, handle: creator.handle, avatar_url: creator.avatar_url };

    return (
        <SocialLayout title={t('nav.studio')}>
            <div className="p-4 md:py-6">
                <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                        <h1 className="text-2xl font-semibold tracking-tight">{t('nav.studio')}</h1>
                        <p className="text-muted-foreground mt-1">{t('st.sub')}</p>
                    </div>
                    <Button asChild variant="outline" size="sm">
                        <Link href={route('creator.show', creator.handle)}>
                            <ExternalLink className="size-4" /> @{creator.handle}
                        </Link>
                    </Button>
                </div>

                <div className="mt-6 grid grid-cols-3 gap-3">
                    {(
                        [
                            [t('st.subscribers'), String(stats.subscribers)],
                            [t('cp.followers'), String(stats.followers)],
                            [t('st.earned'), mnt(stats.earnedThisMonth)],
                        ] as const
                    ).map(([label, value]) => (
                        <div key={label} className="rounded-2xl border p-4">
                            <p className="text-muted-foreground text-xs font-medium">{label}</p>
                            <p className="mt-1 text-xl font-extrabold tracking-tight">{value}</p>
                        </div>
                    ))}
                </div>
                <div className="mt-2 flex items-center justify-between gap-3">
                    <p className="text-muted-foreground text-xs">{t('st.feeNote', { fee: stats.feePercent })}</p>
                    <Link href={route('studio.earnings')} className="text-primary shrink-0 text-sm font-bold hover:underline">
                        {t('ea.open')} →
                    </Link>
                </div>

                <PostComposer adultAllowed={creator.adult_content} className="mt-6 rounded-xl border p-4" />
                <p className="text-muted-foreground mt-2 text-xs">{t('st.rules')}</p>

                <MassMessage subscribers={stats.subscribers} followers={stats.followers} />

                {/* Their posts */}
                <h2 className="mt-8 mb-3 font-medium">
                    {t('st.yourPosts')} <span className="text-muted-foreground">({posts.length})</span>
                </h2>
                {posts.length === 0 ? (
                    <p className="text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">{t('st.empty')}</p>
                ) : (
                    <div className="flex flex-col gap-4">
                        {posts.map((p) => (
                            <PostCard
                                key={p.id}
                                post={p}
                                author={author}
                                onDelete={() =>
                                    confirm(t('st.confirmDelete')) && router.delete(route('studio.posts.destroy', p.id), { preserveScroll: true })
                                }
                            />
                        ))}
                    </div>
                )}
            </div>
        </SocialLayout>
    );
}
