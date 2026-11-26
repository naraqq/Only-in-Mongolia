import FollowButton from '@/components/follow-button';
import InputError from '@/components/input-error';
import MediaLightbox from '@/components/media-lightbox';
import MoreMenu from '@/components/more-menu';
import PostCard, { type PostItem } from '@/components/post-card';
import PostPanel from '@/components/post-panel';
import TipButton from '@/components/tip-button';
import { Button } from '@/components/ui/button';
import UserAvatar from '@/components/user-avatar';
import SocialLayout from '@/layouts/social-layout';
import { coverBg, mnt } from '@/lib/format';
import { useT, type TKey } from '@/lib/i18n';
import { toast } from '@/lib/toast';
import { usePostState } from '@/lib/use-post-state';
import { type SharedData } from '@/types';
import { Link, router, usePage } from '@inertiajs/react';
import {
    BadgeCheck,
    CalendarCheck,
    Copy,
    Gift,
    HandCoins,
    Image as ImageIcon,
    LoaderCircle,
    Lock,
    MessageCircle,
    PenSquare,
    Play,
    Users,
} from 'lucide-react';
import { useEffect, useState } from 'react';

type Option = { months: number; discount: number; price: number };

type Creator = {
    avatar_url: string | null;
    cover_url: string | null;
    handle: string;
    display_name: string;
    bio: string | null;
    price_monthly: number;
    adult_content: boolean;
    options: Option[];
    trial_days: number | null;
    joined: string;
    posts_count: number;
    media_count: number;
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
    sort,
    tab,
    creatorId,
    creatorUserId,
    blocked,
}: {
    creator: Creator;
    posts: PostItem[];
    gated: boolean;
    isOwner: boolean;
    subscribed: boolean;
    subscribedUntil: string | null;
    messageBlock: string | null;
    sort: 'new' | 'popular';
    tab: 'posts' | 'media';
    creatorId: number;
    creatorUserId: number;
    blocked: boolean;
    following: boolean;
}) {
    const { t } = useT();
    const price = mnt(creator.price_monthly);
    const author = { name: creator.display_name, handle: creator.handle, avatar_url: creator.avatar_url };
    const flash = usePage<{ flash?: { status?: string } }>().props.flash;
    useEffect(() => {
        if (flash?.status === 'trial-started') toast(t('pro.trialStarted'), { tone: 'success' });
    }, [flash?.status, t]);

    return (
        <SocialLayout title={`${creator.display_name} (@${creator.handle})`}>
            {/* Cover + avatar */}
            <div className={`relative h-36 overflow-hidden sm:h-44 ${coverBg(creator.handle, !!creator.cover_url)}`}>
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
                        className="ring-background size-24 text-4xl shadow-lg ring-4"
                    />
                    <div className="pb-1">
                        {isOwner ? (
                            <div className="flex gap-2">
                                <Button asChild variant="outline" className="rounded-full">
                                    <Link href={route('me.edit', { edit: 1 })}>{t('nav.editProfile')}</Link>
                                </Button>
                                <Button asChild variant="outline" className="rounded-full">
                                    <Link href={route('studio')}>
                                        <PenSquare className="size-4" /> {t('nav.studio')}
                                    </Link>
                                </Button>
                            </div>
                        ) : (
                            <div className="flex gap-2">
                                <TipButton
                                    handle={creator.handle}
                                    name={creator.display_name}
                                    className="hover:bg-muted bg-muted grid size-9 place-items-center rounded-full text-amber-600 transition"
                                >
                                    <HandCoins className="size-4" />
                                </TipButton>
                                <MessageButton handle={creator.handle} block={messageBlock} />
                                <MoreMenu
                                    report={{ type: 'creator', id: creatorId }}
                                    blockUserId={creatorUserId}
                                    blocked={blocked}
                                    className="bg-muted size-9"
                                />
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

                {!isOwner && (
                    <SubscribeCard
                        handle={creator.handle}
                        price={price}
                        options={creator.options}
                        subscribed={subscribed}
                        until={subscribedUntil}
                        trialDays={creator.trial_days}
                    />
                )}
            </div>

            <div className="mt-6">
                {!gated && (
                    <div className="flex" role="tablist">
                        {(['posts', 'media'] as const).map((k) => (
                            <Link
                                key={k}
                                href={route('creator.show', { handle: creator.handle, ...(k === 'media' ? { tab: k } : {}) })}
                                preserveScroll
                                className={`-mb-px flex-1 py-3 text-center text-sm font-bold transition ${tab === k ? 'text-foreground shadow-[inset_0_-3px_0_var(--primary)]' : 'text-muted-foreground hover:text-foreground'}`}
                                role="tab"
                                aria-selected={tab === k}
                            >
                                {t(k === 'posts' ? 'cp.tabPosts' : 'cp.tabMedia', { n: k === 'posts' ? creator.posts_count : creator.media_count })}
                            </Link>
                        ))}
                    </div>
                )}
                {!gated && tab === 'posts' && posts.length > 1 && (
                    <div className="flex gap-1 px-4 pt-3" role="group">
                        {(['new', 'popular'] as const).map((s) => (
                            <Link
                                key={s}
                                href={route('creator.show', { handle: creator.handle, ...(s === 'popular' ? { sort: s } : {}) })}
                                preserveScroll
                                preserveState
                                className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${sort === s ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted'}`}
                            >
                                {t(s === 'new' ? 'fan.sortNew' : 'cp.mostLiked')}
                            </Link>
                        ))}
                    </div>
                )}
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
                ) : tab === 'media' ? (
                    <MediaGrid posts={posts} handle={creator.handle} author={author} />
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

/** Photos and videos as a square grid. Locked ones show a lock (and the price for pay-per-view). */
type Author = { name: string; handle: string; avatar_url: string | null };

/** A media-tab post opened full screen, with its likes and comments beside it. */
function GridViewer({ post, author, onClose }: { post: PostItem; author: Author; onClose: () => void }) {
    const state = usePostState(post);
    return <MediaLightbox media={post.media} start={0} onClose={onClose} aside={<PostPanel post={post} author={author} state={state} />} />;
}

function MediaGrid({ posts, handle, author }: { posts: PostItem[]; handle: string; author: Author }) {
    const [open, setOpen] = useState<PostItem | null>(null);

    return (
        <div className="grid grid-cols-3 gap-0.5 p-0.5">
            {posts.map((p) => {
                const first = p.media[0];
                const many = p.counts.image + p.counts.video > 1;
                const inner = (
                    <>
                        {first ? (
                            first.type === 'video' ? (
                                <video src={first.url} muted preload="metadata" className="size-full object-cover" />
                            ) : (
                                <img src={first.url} alt="" loading="lazy" className="size-full object-cover transition group-hover:scale-105" />
                            )
                        ) : (
                            <span className="absolute inset-0 grid place-items-center bg-gradient-to-br from-zinc-800 to-black text-white">
                                <span className="flex flex-col items-center gap-1 text-xs font-bold">
                                    <Lock className="size-5" />
                                    {p.price ? mnt(p.price) : null}
                                </span>
                            </span>
                        )}
                        {many && <Copy className="absolute top-1.5 right-1.5 size-4 text-white drop-shadow" />}
                        {(first?.type === 'video' || (!first && p.counts.video > 0)) && (
                            <Play className="absolute bottom-1.5 left-1.5 size-4 fill-white text-white drop-shadow" />
                        )}
                    </>
                );
                const tile = 'group relative aspect-square overflow-hidden bg-zinc-900';
                // Visible media opens in the full-screen viewer; locked tiles go to the post to unlock it.
                return first ? (
                    <button key={p.id} type="button" onClick={() => setOpen(p)} className={`${tile} cursor-pointer`}>
                        {inner}
                    </button>
                ) : (
                    <Link key={p.id} href={`${route('creator.show', handle)}#post-${p.id}`} className={tile}>
                        {inner}
                    </Link>
                );
            })}
            {open && <GridViewer key={open.id} post={open} author={author} onClose={() => setOpen(null)} />}
        </div>
    );
}

/**
 * Opens the conversation. When the creator's settings don't allow it yet, a tap says why (instead of doing nothing)
 * and offers the fix: follow, or subscribe.
 */
function MessageButton({ handle, block }: { handle: string; block: string | null }) {
    const { t } = useT();
    const why: Record<string, TKey> = {
        follow: 'dm.needFollow',
        subscribe: 'dm.needSubscribe',
        closed: 'dm.closed',
        self: 'dm.closed',
        blocked: 'bl.chatBlocked',
    };
    const cls = 'bg-muted hover:bg-muted/70 relative grid size-9 place-items-center rounded-full transition';

    if (block === 'login') {
        return (
            <Link href={route('login')} className={cls} aria-label={t('dm.message')} title={t('dm.message')}>
                <MessageCircle className="size-4" />
            </Link>
        );
    }

    function explain(reason: string) {
        const action =
            reason === 'follow'
                ? { label: t('fan.follow'), onClick: () => router.post(route('creator.follow', handle), {}, { preserveScroll: true }) }
                : reason === 'subscribe'
                  ? { label: t('dm.subscribeCta'), onClick: () => router.visit(route('creator.checkout', handle)) }
                  : undefined;
        toast(t(why[reason] ?? 'dm.closed'), { icon: 'lock', action });
    }

    function open() {
        if (block) return explain(block);
        router.post(
            route('creator.message', handle),
            {},
            { preserveScroll: true, onError: (e) => e.message && explain(String(e.message).replace('cannot.', '')) },
        );
    }

    return (
        <button type="button" onClick={open} className={cls} aria-label={block ? t(why[block] ?? 'dm.closed') : t('dm.message')}>
            <MessageCircle className={`size-4 ${block ? 'opacity-60' : ''}`} />
            {block && (
                <span className="bg-card absolute -right-0.5 -bottom-0.5 grid size-4 place-items-center rounded-full shadow-sm">
                    <Lock className="size-2.5" />
                </span>
            )}
        </button>
    );
}

/** Subscribe (or renew) for one period; signed-out visitors are sent to log in first. */
export function SubscribeCard({
    handle,
    price,
    options,
    subscribed,
    until,
    trialDays = null,
}: {
    handle: string;
    price: string;
    options: Option[];
    subscribed: boolean;
    until: string | null;
    trialDays?: number | null;
}) {
    const { t } = useT();
    const { auth, errors } = usePage<SharedData & { errors: Record<string, string> }>().props;
    const [busy, setBusy] = useState<number | null>(null);
    const bundles = options.filter((o) => o.months > 1);

    const subscribe = (months = 1) => {
        if (!auth.user) return router.visit(route('login'));
        router.visit(route('creator.checkout', { handle, ...(months > 1 ? { months } : {}) }), {
            onStart: () => setBusy(months),
            onFinish: () => setBusy(null),
        });
    };

    // Several months at once, cheaper per month. Shown under the main button (and for renewing).
    const bundleRow = bundles.length > 0 && (
        <div className="mt-3">
            <p className="text-muted-foreground mb-2 text-xs font-semibold tracking-wider uppercase">{t('cp.bundles')}</p>
            <div className="grid gap-2 sm:grid-cols-3">
                {bundles.map((b) => (
                    <button
                        key={b.months}
                        type="button"
                        onClick={() => subscribe(b.months)}
                        disabled={busy !== null}
                        className="hover:bg-primary/5 bg-muted relative flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left transition disabled:opacity-60 sm:flex-col sm:items-start"
                    >
                        <span>
                            <span className="block text-sm font-bold">{t('cp.months', { n: b.months })}</span>
                            <span className="text-muted-foreground block text-xs">
                                {t('cp.perMonth', { price: mnt(Math.round(b.price / b.months)) })}
                            </span>
                        </span>
                        <span className="flex items-center gap-2 sm:w-full sm:justify-between">
                            <span className="font-extrabold tabular-nums">
                                {busy === b.months ? <LoaderCircle className="size-4 animate-spin" /> : mnt(b.price)}
                            </span>
                            <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[11px] font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                                −{b.discount}%
                            </span>
                        </span>
                    </button>
                ))}
            </div>
        </div>
    );

    if (subscribed && until) {
        return (
            <div className="mt-5 flex items-center gap-3 rounded-2xl bg-emerald-50 p-4 dark:bg-emerald-950/40">
                <CalendarCheck className="size-6 shrink-0 text-emerald-600" />
                <div className="min-w-0 flex-1">
                    <p className="font-bold text-emerald-800 dark:text-emerald-300">{t('cp.subscribed')}</p>
                    <p className="text-sm text-emerald-700/80 dark:text-emerald-400/80">{t('cp.until', { date: day(until) })}</p>
                </div>
                <Button variant="outline" size="sm" className="rounded-full" onClick={() => subscribe()} disabled={busy !== null}>
                    {t('cp.renew')}
                </Button>
            </div>
        );
    }

    return (
        <div className="mt-5">
            <button
                type="button"
                onClick={() => subscribe()}
                disabled={busy !== null}
                className="bg-primary text-primary-foreground flex w-full items-center justify-between gap-3 rounded-xl px-5 py-4 text-left transition hover:brightness-110 disabled:opacity-60"
            >
                <span>
                    <span className="block text-xs font-semibold tracking-wider text-white/80 uppercase">{t('cp.subscribeT')}</span>
                    <span className="block text-sm text-white/90">{t('cp.unlock')}</span>
                </span>
                <span className="flex items-center gap-2 text-lg font-extrabold whitespace-nowrap">
                    {busy === 1 && <LoaderCircle className="size-5 animate-spin" />}
                    {t('cp.perMonth', { price })}
                </span>
            </button>
            {trialDays && (
                <button
                    type="button"
                    onClick={() => router.post(route('creator.trial', handle), {}, { preserveScroll: true })}
                    className="mt-2 flex w-full items-center gap-3 rounded-2xl bg-emerald-50 px-4 py-3 text-left transition hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-950/60"
                >
                    <Gift className="size-5 shrink-0 text-emerald-600" />
                    <span className="min-w-0 flex-1 text-sm font-bold text-emerald-800 dark:text-emerald-200">
                        {t('pro.tryFree', { n: trialDays })}
                    </span>
                    <span className="shrink-0 rounded-full bg-emerald-600 px-3 py-1 text-xs font-bold text-white">{t('pro.startTrial')}</span>
                </button>
            )}
            {bundleRow}
            <InputError message={errors.payment ?? errors.trial} className="mt-2" />
        </div>
    );
}
