import CreatorCard, { type CreatorCardData } from '@/components/creator-card';
import FollowButton from '@/components/follow-button';
import PostCard, { type PostItem } from '@/components/post-card';
import PostComposer from '@/components/post-composer';
import { Button } from '@/components/ui/button';
import SocialLayout, { RightRail } from '@/layouts/social-layout';
import { CATEGORY_LABELS } from '@/lib/categories';
import { mnt } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { type SharedData } from '@/types';
import { Link, usePage } from '@inertiajs/react';
import { Rss } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

type FeedPost = PostItem & { author: { name: string; handle: string; price: number; avatar_url: string | null } };
const topicLabels = CATEGORY_LABELS;
type Topic = string;
type StarterPost = FeedPost & { topic: Topic | null; following: boolean };

/** Home for signed-in users: a composer (creators), then the newest posts from everyone they follow. */
export default function Feed({
    posts,
    followingCount,
    starterPosts,
}: {
    posts: FeedPost[];
    followingCount: number;
    starterPosts: StarterPost[] | null;
}) {
    const { t } = useT();
    const { auth, suggestions } = usePage<SharedData & { suggestions: CreatorCardData[] }>().props;
    const creator = auth.creator?.status === 'approved' ? auth.creator : null;
    const starter = starterPosts !== null;

    return (
        <SocialLayout
            title={t('nav.home')}
            wide={Boolean(starterPosts?.length)}
            header={
                <>
                    <h1 className="text-lg font-bold tracking-tight">{t('nav.home')}</h1>
                    {!creator && followingCount > 0 && (
                        <Link
                            href={route('home', starter ? {} : { view: 'starter' })}
                            className="text-primary ml-auto inline-flex min-h-10 items-center text-sm font-semibold hover:underline"
                        >
                            {t(starter ? 'fan.followingTitle' : 'starter.explore')}
                        </Link>
                    )}
                </>
            }
        >
            {creator && <PostComposer adultAllowed={!!creator.adult_content} className="m-4" />}

            {starterPosts?.length ? (
                <StarterFeed posts={starterPosts} />
            ) : posts.length === 0 ? (
                <div className="flex flex-col items-center gap-3 p-10 text-center">
                    <Rss className="text-muted-foreground size-8" aria-hidden />
                    <p className="font-medium">{followingCount === 0 ? t('fan.feedEmpty') : t('fan.feedQuiet')}</p>
                    <Button asChild className="rounded-full">
                        <Link href={route('creators')}>{t('fan.findCreators')}</Link>
                    </Button>
                </div>
            ) : (
                <MoreFeed first={posts} />
            )}

            {/* On narrow screens the right-hand suggestions column is hidden, so show them here while the feed is small. */}
            {!starterPosts?.length && followingCount < 3 && suggestions.length > 0 && (
                <section className="p-4 lg:hidden">
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

function StarterFeed({ posts }: { posts: StarterPost[] }) {
    const { t } = useT();
    const [topic, setTopic] = useState<Topic | null>(null);
    const topics = [...new Set(posts.flatMap((post) => (post.topic ? [post.topic] : [])))];
    const selected = topic && topics.includes(topic) ? topic : null;
    const visible = selected ? posts.filter((post) => post.topic === selected) : posts;
    const featured = visible.find((post) => post.media.length > 0) ?? visible[0];
    const more = visible.filter((post) => post.id !== featured.id);
    const renderPost = (post: StarterPost) => (
        <PostCard
            key={post.id}
            post={post}
            author={post.author}
            linkAuthor
            authorAction={<FollowButton handle={post.author.handle} initial={post.following} size="sm" starter />}
        />
    );

    return (
        <>
            <section aria-labelledby="starter-title" className="border-border border-b px-4 pt-6 pb-5 sm:px-5 sm:pt-9">
                <h2 id="starter-title" className="text-3xl font-extrabold tracking-tight text-balance sm:text-4xl">
                    {t('starter.title')}
                </h2>
                <p className="text-muted-foreground mt-2 max-w-3xl text-sm leading-relaxed sm:text-base">{t('starter.description')}</p>
                {topics.length > 0 && (
                    <div role="group" aria-label={t('starter.interests')} className="mt-4 flex gap-2 overflow-x-auto p-1 lg:flex-wrap">
                        {[null, ...topics].map((value) => (
                            <Button
                                key={value ?? 'all'}
                                type="button"
                                size="sm"
                                variant={selected === value ? 'default' : 'outline'}
                                aria-pressed={selected === value}
                                className="min-h-10 shrink-0 rounded-full"
                                onClick={() => setTopic(value)}
                            >
                                {t(value ? topicLabels[value] : 'starter.all')}
                            </Button>
                        ))}
                    </div>
                )}
            </section>
            <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,680px)_minmax(220px,1fr)] lg:pt-5">
                <div className="min-w-0">
                    <section aria-labelledby="starter-featured" key={selected ?? 'all'} className="animate-page-in pb-2">
                        <h3 id="starter-featured" className="text-primary px-4 pt-2 text-xs font-bold tracking-wider uppercase sm:px-5">
                            {t('starter.featured')}
                        </h3>
                        <div className="px-4 pt-2">{renderPost(featured)}</div>
                        {more.length > 0 && (
                            <>
                                <h3 className="px-4 pt-5 text-lg font-bold tracking-tight sm:px-5">{t('starter.more')}</h3>
                                <div className="space-y-4 px-4 pt-2">{more.map(renderPost)}</div>
                            </>
                        )}
                    </section>
                    <div className="px-4 py-6 sm:px-5">
                        <Button asChild variant="outline">
                            <Link href={route('creators')}>{t('fan.findCreators')}</Link>
                        </Button>
                    </div>
                </div>
                <aside className="hidden min-w-0 px-3 lg:block xl:px-5">
                    <RightRail />
                </aside>
            </div>
        </>
    );
}

/**
 * The feed's posts, with more loading as the fan nears the end (feed.more); once there are no more, "You're all
 * caught up" and free posts from creators they might like.
 */
function MoreFeed({ first }: { first: FeedPost[] }) {
    const { t } = useT();
    const [posts, setPosts] = useState(first);
    const [suggested, setSuggested] = useState<FeedPost[] | null>(null);
    const [done, setDone] = useState(false);
    const [busy, setBusy] = useState(false);
    const end = useRef<HTMLDivElement>(null);

    useEffect(() => setPosts(first), [first]);

    useEffect(() => {
        const el = end.current;
        if (!el || done || !('IntersectionObserver' in window)) return;
        const io = new IntersectionObserver(
            ([entry]) => {
                if (!entry.isIntersecting || busy) return;
                const last = posts[posts.length - 1];
                setBusy(true);
                fetch(route('feed.more', { before: last?.id ?? 0 }), { headers: { Accept: 'application/json' }, credentials: 'same-origin' })
                    .then((r) => (r.ok ? r.json() : Promise.reject()))
                    .then((d: { posts: FeedPost[]; done: boolean; suggested: FeedPost[] }) => {
                        setPosts((p) => [...p, ...d.posts.filter((n) => !p.some((x) => x.id === n.id))]);
                        if (d.done) {
                            setDone(true);
                            setSuggested(d.suggested);
                        }
                    })
                    .catch(() => setDone(true))
                    .finally(() => setBusy(false));
            },
            { rootMargin: '800px 0px' },
        );
        io.observe(el);
        return () => io.disconnect();
    }, [posts, done, busy]);

    return (
        <div className="flex flex-col gap-4 p-4">
            {posts.map((p) => (
                <PostCard key={p.id} post={p} author={p.author} price={mnt(p.author.price)} linkAuthor />
            ))}
            {!done && <div ref={end} className="h-10" aria-hidden />}
            {busy && <p className="text-muted-foreground text-center text-sm">{t('fan.loadingMore')}</p>}
            {done && (
                <div className="flex flex-col gap-4">
                    <p className="text-muted-foreground border-border border-t pt-5 text-center text-sm font-semibold">{t('fan.caughtUp')}</p>
                    {suggested && suggested.length > 0 && (
                        <>
                            <h2 className="font-bold">{t('fan.youMightLike')}</h2>
                            {suggested.map((p) => (
                                <PostCard key={`s${p.id}`} post={p} author={p.author} price={mnt(p.author.price)} linkAuthor />
                            ))}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
