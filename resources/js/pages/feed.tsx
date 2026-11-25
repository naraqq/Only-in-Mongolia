import CreatorCard, { type CreatorCardData } from '@/components/creator-card';
import PostCard, { type PostItem } from '@/components/post-card';
import PostComposer from '@/components/post-composer';
import { Button } from '@/components/ui/button';
import SocialLayout from '@/layouts/social-layout';
import { mnt } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { type SharedData } from '@/types';
import { Link, usePage } from '@inertiajs/react';
import { Rss } from 'lucide-react';

type FeedPost = PostItem & { author: { name: string; handle: string; price: number } };

/** Home for signed-in users: a composer (creators), then the newest posts from everyone they follow. */
export default function Feed({ posts, followingCount }: { posts: FeedPost[]; followingCount: number }) {
    const { t } = useT();
    const { auth, suggestions } = usePage<SharedData & { suggestions: CreatorCardData[] }>().props;
    const creator = auth.creator?.status === 'approved' ? auth.creator : null;

    return (
        <SocialLayout title={t('nav.home')} header={<h1 className="text-lg font-bold tracking-wide uppercase">{t('nav.home')}</h1>}>
            {creator && <PostComposer adultAllowed={!!creator.adult_content} className="border-b p-4" />}

            {posts.length === 0 ? (
                <div className="flex flex-col items-center gap-3 p-10 text-center">
                    <Rss className="text-muted-foreground size-8" aria-hidden />
                    <p className="font-medium">{followingCount === 0 ? t('fan.feedEmpty') : t('fan.feedQuiet')}</p>
                    <Button asChild className="rounded-full">
                        <Link href={route('creators')}>{t('fan.findCreators')}</Link>
                    </Button>
                </div>
            ) : (
                <div className="flex flex-col gap-4 p-4">
                    {posts.map((p) => (
                        <PostCard key={p.id} post={p} author={p.author} price={mnt(p.author.price)} linkAuthor />
                    ))}
                </div>
            )}

            {/* On narrow screens the right-hand suggestions column is hidden, so show them here while the feed is small. */}
            {followingCount < 3 && suggestions.length > 0 && (
                <section className="border-t p-4 lg:hidden">
                    <h2 className="mb-3 font-medium">{t('fan.suggested')}</h2>
                    <div className="grid gap-4 sm:grid-cols-2">
                        {suggestions.map((c) => (
                            <CreatorCard key={c.handle} c={c} />
                        ))}
                    </div>
                </section>
            )}
        </SocialLayout>
    );
}
