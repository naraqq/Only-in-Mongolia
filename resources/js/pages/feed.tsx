import CreatorCard, { mnt, type CreatorCardData } from '@/components/creator-card';
import PostCard, { type PostItem } from '@/components/post-card';
import { Button } from '@/components/ui/button';
import AppLayout from '@/layouts/app-layout';
import { useT } from '@/lib/i18n';
import { Head, Link } from '@inertiajs/react';
import { Rss } from 'lucide-react';

type FeedPost = PostItem & { author: { name: string; handle: string; price: number } };

/** Newest posts from everyone the user follows, plus suggestions while the feed is still small. */
export default function Feed({ posts, followingCount, suggestions }: { posts: FeedPost[]; followingCount: number; suggestions: CreatorCardData[] }) {
    const { t } = useT();

    return (
        <AppLayout breadcrumbs={[{ title: t('nav.feed'), href: route('feed') }]}>
            <Head title={t('nav.feed')} />
            <div className="mx-auto w-full max-w-2xl p-4 md:py-8">
                <h1 className="text-2xl font-semibold tracking-tight">{t('nav.feed')}</h1>
                <p className="text-muted-foreground mt-1">{t('fan.feedSub', { n: followingCount })}</p>

                {posts.length === 0 ? (
                    <div className="mt-8 flex flex-col items-center gap-3 rounded-xl border border-dashed p-10 text-center">
                        <Rss className="text-muted-foreground size-8" aria-hidden />
                        <p className="font-medium">{followingCount === 0 ? t('fan.feedEmpty') : t('fan.feedQuiet')}</p>
                        <Button asChild>
                            <Link href={route('creators')}>{t('fan.findCreators')}</Link>
                        </Button>
                    </div>
                ) : (
                    <div className="mt-6 flex flex-col gap-4">
                        {posts.map((p) => (
                            <PostCard key={p.id} post={p} author={p.author} price={mnt(p.author.price)} linkAuthor />
                        ))}
                    </div>
                )}

                {suggestions.length > 0 && (
                    <section className="mt-10">
                        <h2 className="mb-3 font-medium">{t('fan.suggested')}</h2>
                        <div className="grid gap-4 sm:grid-cols-2">
                            {suggestions.map((c) => (
                                <CreatorCard key={c.handle} c={c} />
                            ))}
                        </div>
                    </section>
                )}
            </div>
        </AppLayout>
    );
}
