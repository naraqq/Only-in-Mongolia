import FollowButton from '@/components/follow-button';
import PostCard, { type PostItem } from '@/components/post-card';
import { Button } from '@/components/ui/button';
import SiteLayout from '@/layouts/site-layout';
import { useT } from '@/lib/i18n';
import { Link } from '@inertiajs/react';
import { BadgeCheck, Lock, PenSquare } from 'lucide-react';

type Creator = {
    handle: string;
    display_name: string;
    bio: string | null;
    price_monthly: number;
    adult_content: boolean;
    joined: string;
    posts_count: number;
    followers_count: number;
};

const mnt = (n: number) => '₮' + n.toLocaleString('en-US');

/** /@handle: who the creator is, what a subscription costs, and their posts. */
export default function CreatorPage({
    creator,
    posts,
    gated,
    isOwner,
    subscribed,
    following,
}: {
    creator: Creator;
    posts: PostItem[];
    gated: boolean;
    isOwner: boolean;
    subscribed: boolean;
    following: boolean;
}) {
    const { t } = useT();
    const price = mnt(creator.price_monthly);
    const author = { name: creator.display_name, handle: creator.handle };

    return (
        <SiteLayout title={`${creator.display_name} (@${creator.handle})`}>
            <section className="flex flex-col gap-5 sm:flex-row sm:items-start">
                <span className="grid size-20 shrink-0 place-items-center rounded-full bg-gradient-to-br from-rose-400 to-fuchsia-600 text-3xl font-semibold text-white">
                    {creator.display_name.charAt(0)}
                </span>
                <div className="min-w-0 flex-1">
                    <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
                        {creator.display_name}
                        <BadgeCheck className="size-5 text-sky-500" aria-label={t('cp.verified')} />
                        {creator.adult_content && <span className="rounded bg-rose-100 px-1.5 py-0.5 text-xs font-semibold text-rose-700">18+</span>}
                    </h1>
                    <p className="text-muted-foreground text-sm">
                        @{creator.handle} · {t('fan.counts', { posts: creator.posts_count, followers: creator.followers_count })}
                    </p>
                    {creator.bio && <p className="mt-3 leading-relaxed whitespace-pre-line">{creator.bio}</p>}
                </div>
                {!isOwner && <FollowButton handle={creator.handle} initial={following} />}
            </section>

            {/* Subscribe / owner actions */}
            <div className="mt-6 flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center">
                <div className="flex-1">
                    <div className="font-semibold">{t('cp.monthly', { price })}</div>
                    <div className="text-muted-foreground text-sm">{t('cp.unlock')}</div>
                </div>
                {isOwner ? (
                    <Button asChild variant="outline">
                        <Link href={route('studio')}>
                            <PenSquare className="size-4" /> {t('nav.studio')}
                        </Link>
                    </Button>
                ) : subscribed ? (
                    <Button disabled variant="outline">
                        {t('cp.subscribed')}
                    </Button>
                ) : (
                    <Button disabled title={t('cp.soon')}>
                        {t('cp.subscribe', { price })} · {t('cp.soon')}
                    </Button>
                )}
            </div>

            {gated ? (
                <div className="mt-8 flex flex-col items-center gap-3 rounded-xl border p-10 text-center">
                    <Lock className="text-muted-foreground size-8" aria-hidden />
                    <p className="font-medium">{t('cp.adultLogin')}</p>
                    <Button asChild>
                        <Link href={route('login')}>{t('nav.login')}</Link>
                    </Button>
                </div>
            ) : posts.length === 0 ? (
                <p className="text-muted-foreground mt-10 text-center text-sm">{t('cp.noPosts')}</p>
            ) : (
                <div className="mt-6 flex flex-col gap-4">
                    {posts.map((p) => (
                        <PostCard key={p.id} post={p} author={author} price={price} />
                    ))}
                </div>
            )}
        </SiteLayout>
    );
}
