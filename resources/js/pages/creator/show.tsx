import FollowButton from '@/components/follow-button';
import InputError from '@/components/input-error';
import PostCard, { type PostItem } from '@/components/post-card';
import { Button } from '@/components/ui/button';
import UserAvatar from '@/components/user-avatar';
import SocialLayout from '@/layouts/social-layout';
import { avatarGradient, mnt } from '@/lib/format';
import { useT, type TKey } from '@/lib/i18n';
import { type SharedData } from '@/types';
import { Link, router, usePage } from '@inertiajs/react';
import { BadgeCheck, CalendarCheck, Image as ImageIcon, LoaderCircle, Lock, MessageCircle, PenSquare, Users } from 'lucide-react';
import { useState } from 'react';

type Creator = {
    avatar_url: string | null;
    cover_url: string | null;
    handle: string;
    display_name: string;
    bio: string | null;
    price_monthly: number;
    adult_content: boolean;
    joined: string;
    posts_count: number;
    followers_count: number;
};

const day = (iso: string) => iso.slice(0, 10).replaceAll('-', '.');

/** /@handle: cover, who the creator is, the subscribe card, and their posts. */
export default function CreatorPage({
    creator,
    posts,
    gated,
    isOwner,
    subscribed,
    subscribedUntil,
    following,
    messageBlock,
}: {
    creator: Creator;
    posts: PostItem[];
    gated: boolean;
    isOwner: boolean;
    subscribed: boolean;
    subscribedUntil: string | null;
    messageBlock: string | null;
    following: boolean;
}) {
    const { t } = useT();
    const price = mnt(creator.price_monthly);
    const author = { name: creator.display_name, handle: creator.handle, avatar_url: creator.avatar_url };
    const g = avatarGradient(creator.handle);

    return (
        <SocialLayout title={`${creator.display_name} (@${creator.handle})`}>
            {/* Cover + avatar */}
            <div className={`relative h-36 overflow-hidden bg-gradient-to-br sm:h-44 ${g}`}>
                {creator.cover_url ? (
                    <img src={creator.cover_url} alt="" className="size-full object-cover" />
                ) : (
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,.35),transparent_45%)]" />
                )}
            </div>
            <div className="px-4">
                <div className="relative z-10 -mt-12 flex items-end justify-between gap-3">
                    <UserAvatar
                        name={creator.display_name}
                        src={creator.avatar_url}
                        seed={creator.handle}
                        className="size-24 text-4xl shadow-lg ring-4 ring-white dark:ring-zinc-950"
                    />
                    <div className="pb-1">
                        {isOwner ? (
                            <div className="flex gap-2">
                                <Button asChild variant="outline" className="rounded-full">
                                    <Link href={route('me.edit')}>{t('nav.editProfile')}</Link>
                                </Button>
                                <Button asChild variant="outline" className="rounded-full">
                                    <Link href={route('studio')}>
                                        <PenSquare className="size-4" /> {t('nav.studio')}
                                    </Link>
                                </Button>
                            </div>
                        ) : (
                            <div className="flex gap-2">
                                <MessageButton handle={creator.handle} block={messageBlock} />
                                <FollowButton handle={creator.handle} initial={following} />
                            </div>
                        )}
                    </div>
                </div>

                <h1 className="mt-3 flex flex-wrap items-center gap-2 text-2xl font-extrabold tracking-tight">
                    {creator.display_name}
                    <BadgeCheck className="size-5 text-sky-500" aria-label={t('cp.verified')} />
                    {creator.adult_content && <span className="rounded bg-rose-100 px-1.5 py-0.5 text-xs font-bold text-rose-700">18+</span>}
                </h1>
                <p className="text-muted-foreground text-sm">@{creator.handle}</p>
                {creator.bio && <p className="mt-3 text-[15px] leading-relaxed whitespace-pre-line">{creator.bio}</p>}

                <div className="text-muted-foreground mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
                    <span className="inline-flex items-center gap-1.5">
                        <ImageIcon className="size-4" /> <b className="text-foreground">{creator.posts_count}</b> {t('cp.postsLabel')}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                        <Users className="size-4" /> <b className="text-foreground">{creator.followers_count}</b> {t('cp.followers')}
                    </span>
                </div>

                {!isOwner && <SubscribeCard handle={creator.handle} price={price} subscribed={subscribed} until={subscribedUntil} />}
            </div>

            <div className="mt-6 border-t">
                {gated ? (
                    <div className="flex flex-col items-center gap-3 p-10 text-center">
                        <Lock className="text-muted-foreground size-8" aria-hidden />
                        <p className="font-medium">{t('cp.adultLogin')}</p>
                        <Button asChild className="rounded-full">
                            <Link href={route('login')}>{t('nav.login')}</Link>
                        </Button>
                    </div>
                ) : posts.length === 0 ? (
                    <p className="text-muted-foreground p-10 text-center text-sm">{t('cp.noPosts')}</p>
                ) : (
                    <div className="flex flex-col gap-4 p-4">
                        {posts.map((p) => (
                            <PostCard key={p.id} post={p} author={author} price={price} />
                        ))}
                    </div>
                )}
            </div>
        </SocialLayout>
    );
}

/** Opens the conversation; if the creator's settings don't allow it yet, says what's needed. */
function MessageButton({ handle, block }: { handle: string; block: string | null }) {
    const { t } = useT();
    const { errors } = usePage<{ errors: Record<string, string> }>().props;
    const why: Record<string, TKey> = { follow: 'dm.needFollow', subscribe: 'dm.needSubscribe', closed: 'dm.closed', self: 'dm.closed' };
    const cls = 'grid size-9 place-items-center rounded-full border transition hover:bg-muted';

    if (block === 'login') {
        return (
            <Link href={route('login')} className={cls} aria-label={t('dm.message')} title={t('dm.message')}>
                <MessageCircle className="size-4" />
            </Link>
        );
    }
    const reason = block ? t(why[block] ?? 'dm.closed') : errors.message ? t(why[errors.message.replace('cannot.', '')] ?? 'dm.closed') : null;

    return (
        <Link
            href={route('creator.message', handle)}
            method="post"
            as="button"
            preserveScroll
            className={`${cls} ${block ? 'opacity-50' : ''}`}
            aria-label={reason ?? t('dm.message')}
            title={reason ?? t('dm.message')}
        >
            <MessageCircle className="size-4" />
        </Link>
    );
}

/** Subscribe (or renew) for one period; signed-out visitors are sent to log in first. */
export function SubscribeCard({ handle, price, subscribed, until }: { handle: string; price: string; subscribed: boolean; until: string | null }) {
    const { t } = useT();
    const { auth, errors } = usePage<SharedData & { errors: Record<string, string> }>().props;
    const [busy, setBusy] = useState(false);

    const subscribe = () => {
        if (!auth.user) return router.visit(route('login'));
        router.post(route('creator.subscribe', handle), {}, { onStart: () => setBusy(true), onFinish: () => setBusy(false) });
    };

    if (subscribed && until) {
        return (
            <div className="mt-5 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/40">
                <CalendarCheck className="size-6 shrink-0 text-emerald-600" />
                <div className="min-w-0 flex-1">
                    <p className="font-bold text-emerald-800 dark:text-emerald-300">{t('cp.subscribed')}</p>
                    <p className="text-sm text-emerald-700/80 dark:text-emerald-400/80">{t('cp.until', { date: day(until) })}</p>
                </div>
                <Button variant="outline" size="sm" className="rounded-full" onClick={subscribe} disabled={busy}>
                    {t('cp.renew')}
                </Button>
            </div>
        );
    }

    return (
        <div className="mt-5">
            <button
                type="button"
                onClick={subscribe}
                disabled={busy}
                className="from-primary shadow-primary/25 flex w-full items-center justify-between gap-3 rounded-2xl bg-gradient-to-r to-rose-500 px-5 py-4 text-left text-white shadow-lg transition hover:brightness-110 disabled:opacity-60"
            >
                <span>
                    <span className="block text-xs font-semibold tracking-wider text-white/80 uppercase">{t('cp.subscribeT')}</span>
                    <span className="block text-sm text-white/90">{t('cp.unlock')}</span>
                </span>
                <span className="flex items-center gap-2 text-lg font-extrabold whitespace-nowrap">
                    {busy && <LoaderCircle className="size-5 animate-spin" />}
                    {t('cp.perMonth', { price })}
                </span>
            </button>
            <InputError message={errors.payment} className="mt-2" />
        </div>
    );
}
