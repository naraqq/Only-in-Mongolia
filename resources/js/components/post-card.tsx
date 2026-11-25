import MoreMenu from '@/components/more-menu';
import PostComments from '@/components/post-comments';
import PostMedia from '@/components/post-media';
import RichText from '@/components/rich-text';
import TipButton from '@/components/tip-button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import UserAvatar from '@/components/user-avatar';
import { mnt, timeAgo } from '@/lib/format';
import { sendJson } from '@/lib/http';
import { useT } from '@/lib/i18n';
import { type SharedData } from '@/types';
import { Link, router, usePage } from '@inertiajs/react';
import {
    BadgeCheck,
    Bookmark,
    CalendarClock,
    Globe,
    Heart,
    Image as ImageIcon,
    Lock,
    MessageCircle,
    MoreHorizontal,
    Pencil,
    Pin,
    Trash2,
    Video,
} from 'lucide-react';
import { useState } from 'react';

export type PostItem = {
    id: number;
    visibility: 'public' | 'subscribers';
    is_adult: boolean;
    created_at: string;
    locked: 'login' | 'subscribe' | 'buy' | null;
    price: number | null;
    body: string | null;
    media: { id: number; type: 'image' | 'video'; url: string }[];
    counts: { image: number; video: number };
    likes_count: number;
    comments_count: number;
    liked: boolean;
    bookmarked: boolean;
    publish_at: string | null; // set while scheduled
    pinned?: boolean;
};

const when = (iso: string) => new Date(iso).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' }).replaceAll('-', '.');

/** One post: text and media if the viewer may see it, otherwise a locked tile that reveals only what's inside. */
export default function PostCard({
    post,
    author,
    price,
    onDelete,
    onEdit,
    onPin,
    linkAuthor = false,
}: {
    post: PostItem;
    author: { name: string; handle: string; avatar_url?: string | null };
    price?: string;
    onDelete?: () => void;
    onEdit?: () => void;
    onPin?: () => void;
    linkAuthor?: boolean;
}) {
    const { t } = useT();
    const { auth } = usePage<SharedData>().props;
    const mine = auth.creator?.handle === author.handle;
    const like = useLike(post);
    const avatar = <UserAvatar name={author.name} src={author.avatar_url} seed={author.handle} className="size-11" />;

    return (
        <article
            id={`post-${post.id}`}
            className={`bg-card scroll-mt-20 overflow-hidden rounded-2xl border shadow-xs ${post.publish_at ? 'border-dashed border-sky-400' : ''}`}
        >
            {(post.pinned || post.publish_at) && (
                <div className="flex items-center gap-3 px-4 pt-3 text-xs font-semibold">
                    {post.pinned && (
                        <span className="text-primary inline-flex items-center gap-1">
                            <Pin className="size-3.5" /> {t('po.pinned')}
                        </span>
                    )}
                    {post.publish_at && (
                        <span className="inline-flex items-center gap-1 text-sky-600">
                            <CalendarClock className="size-3.5" /> {t('sch.at', { date: when(post.publish_at) })}
                        </span>
                    )}
                </div>
            )}
            <header className="flex items-center gap-3 px-4 pt-4">
                {linkAuthor ? (
                    <Link href={route('creator.show', author.handle)} className="shrink-0">
                        {avatar}
                    </Link>
                ) : (
                    avatar
                )}
                <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-1">
                        {linkAuthor ? (
                            <Link href={route('creator.show', author.handle)} className="truncate text-[15px] font-bold hover:underline">
                                {author.name}
                            </Link>
                        ) : (
                            <span className="truncate text-[15px] font-bold">{author.name}</span>
                        )}
                        <BadgeCheck className="size-4 shrink-0 text-sky-500" aria-label={t('po.verified')} />
                    </div>
                    <div className="text-muted-foreground truncate text-[13px]">
                        @{author.handle} ·{' '}
                        <time dateTime={post.created_at} title={new Date(post.created_at).toLocaleString('sv-SE').replaceAll('-', '.')}>
                            {timeAgo(post.created_at, t)}
                        </time>
                    </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                    {post.is_adult && <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[11px] font-semibold text-rose-700">18+</span>}
                    {post.price ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                            <Lock className="size-3" /> {mnt(post.price)}
                        </span>
                    ) : (
                        <span
                            className="text-muted-foreground inline-flex items-center gap-1 text-xs"
                            title={t(post.visibility === 'public' ? 'po.public' : 'po.subscribers')}
                        >
                            {post.visibility === 'public' ? <Globe className="size-3.5" /> : <Lock className="size-3.5" />}
                            {t(post.visibility === 'public' ? 'po.public' : 'po.subscribers')}
                        </span>
                    )}
                    {!mine && !post.locked && <MoreMenu report={{ type: 'post', id: post.id }} className="-mr-1" />}
                    {(onDelete || onEdit || onPin) && (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <button
                                    type="button"
                                    className="text-muted-foreground hover:bg-muted -mr-1 grid size-8 place-items-center rounded-full"
                                    aria-label={t('rp.more')}
                                >
                                    <MoreHorizontal className="size-5" />
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                                {onEdit && (
                                    <DropdownMenuItem onSelect={onEdit}>
                                        <Pencil className="mr-2 size-4" /> {t('po.edit')}
                                    </DropdownMenuItem>
                                )}
                                {onPin && !post.publish_at && (
                                    <DropdownMenuItem onSelect={onPin}>
                                        <Pin className="mr-2 size-4" /> {t(post.pinned ? 'po.unpin' : 'po.pin')}
                                    </DropdownMenuItem>
                                )}
                                {onDelete && (
                                    <DropdownMenuItem onSelect={onDelete} className="text-red-600 focus:text-red-600">
                                        <Trash2 className="mr-2 size-4" /> {t('po.delete')}
                                    </DropdownMenuItem>
                                )}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}
                </div>
            </header>

            {post.locked ? (
                <Locked post={post} price={price} handle={author.handle} />
            ) : (
                <>
                    {post.body && <RichText text={post.body} className="px-4 pt-3" />}
                    {post.media.length > 0 && <PostMedia media={post.media} onDoubleLike={like.likeOnce} />}
                    <div className="h-1.5" />
                </>
            )}
            <Actions post={post} author={author} mine={mine} like={like} />
        </article>
    );
}

/** Like state for one post. Updates at once and rolls back if the server says no. */
function useLike(post: PostItem) {
    const { auth } = usePage<SharedData>().props;
    const [liked, setLiked] = useState(post.liked);
    const [likes, setLikes] = useState(post.likes_count);

    async function toggle(want?: boolean) {
        if (!auth.user) return router.visit(route('login'));
        const was = liked;
        if (want !== undefined && want === was) return;
        setLiked(!was);
        setLikes((n) => n + (was ? -1 : 1));
        try {
            const r = await sendJson<{ liked: boolean; likes_count: number }>('POST', route('posts.like', post.id));
            setLiked(r.liked);
            setLikes(r.likes_count);
        } catch {
            setLiked(was);
            setLikes((n) => n + (was ? 1 : -1));
        }
    }

    return { liked, likes, toggle: () => toggle(), likeOnce: () => toggle(true) };
}

/** Like, comment, save (on posts you can see) and tip (on other people's posts). Likes and saves update instantly. */
function Actions({
    post,
    author,
    mine,
    like,
}: {
    post: PostItem;
    author: { name: string; handle: string };
    mine: boolean;
    like: ReturnType<typeof useLike>;
}) {
    const { t } = useT();
    const { auth } = usePage<SharedData>().props;
    const { liked, likes } = like;
    const [saved, setSaved] = useState(post.bookmarked);
    const [comments, setComments] = useState(post.comments_count);
    const [open, setOpen] = useState(false);
    const canEngage = !post.locked;
    const btn = 'text-muted-foreground inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold transition';

    async function toggleSave() {
        if (!auth.user) return router.visit(route('login'));
        const was = saved;
        setSaved(!was);
        try {
            setSaved((await sendJson<{ bookmarked: boolean }>('POST', route('posts.bookmark', post.id))).bookmarked);
        } catch {
            setSaved(was);
        }
    }

    if (!canEngage && mine) return null;

    return (
        <>
            <footer className="flex items-center gap-0.5 px-2 pt-1 pb-1.5">
                {canEngage && (
                    <>
                        <button
                            type="button"
                            onClick={like.toggle}
                            className={`${btn} hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 ${liked ? 'text-rose-600' : ''}`}
                            aria-pressed={liked}
                            aria-label={t('po.like')}
                        >
                            <Heart className={`size-[18px] transition ${liked ? 'scale-110 fill-current' : ''}`} />
                            {likes > 0 && <span className="tabular-nums">{likes}</span>}
                        </button>
                        <button
                            type="button"
                            onClick={() => setOpen(!open)}
                            className={`${btn} hover:bg-sky-50 hover:text-sky-600 dark:hover:bg-sky-950/40 ${open ? 'text-sky-600' : ''}`}
                            aria-expanded={open}
                            aria-label={t('po.comments')}
                        >
                            <MessageCircle className="size-[18px]" />
                            {comments > 0 && <span className="tabular-nums">{comments}</span>}
                        </button>
                    </>
                )}
                {!mine && (
                    <TipButton
                        handle={author.handle}
                        name={author.name}
                        postId={post.id}
                        className={`${btn} hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-amber-950/40`}
                    />
                )}
                {canEngage && (
                    <button
                        type="button"
                        onClick={toggleSave}
                        className={`${btn} ml-auto hover:bg-violet-50 hover:text-violet-600 dark:hover:bg-violet-950/40 ${saved ? 'text-violet-600' : ''}`}
                        aria-pressed={saved}
                        aria-label={t('po.save')}
                        title={t('po.save')}
                    >
                        <Bookmark className={`size-[18px] ${saved ? 'fill-current' : ''}`} />
                    </button>
                )}
            </footer>
            {open && <PostComments postId={post.id} onCount={setComments} />}
        </>
    );
}

function Locked({ post, price, handle }: { post: PostItem; price?: string; handle: string }) {
    const { t } = useT();
    const signedIn = !!usePage<SharedData>().props.auth.user;
    return (
        <div className="relative m-4 mt-3 flex flex-col items-center gap-3 overflow-hidden rounded-xl bg-gradient-to-br from-zinc-800 via-zinc-900 to-black px-6 py-14 text-center text-white">
            <div className="from-primary/40 absolute -top-16 -right-16 size-48 rounded-full bg-gradient-to-br to-amber-400/30 blur-2xl" aria-hidden />
            <span className="relative grid size-14 place-items-center rounded-full bg-white/10 ring-1 ring-white/20">
                <Lock className="size-6" aria-hidden />
            </span>
            <div className="relative flex items-center gap-3 text-sm text-white/70">
                {post.counts.image > 0 && (
                    <span className="inline-flex items-center gap-1">
                        <ImageIcon className="size-4" /> {post.counts.image}
                    </span>
                )}
                {post.counts.video > 0 && (
                    <span className="inline-flex items-center gap-1">
                        <Video className="size-4" /> {post.counts.video}
                    </span>
                )}
            </div>
            {post.locked === 'buy' && signedIn ? (
                <Link
                    href={route('posts.buy', post.id)}
                    method="post"
                    as="button"
                    className="relative rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-5 py-2 text-sm font-bold transition hover:brightness-110"
                >
                    {t('ppv.unlock', { price: mnt(post.price ?? 0) })}
                </Link>
            ) : post.locked === 'login' || !signedIn ? (
                <Link href={route('login')} className="bg-primary relative rounded-full px-5 py-2 text-sm font-bold">
                    {post.locked === 'buy'
                        ? t('ppv.unlock', { price: mnt(post.price ?? 0) })
                        : post.locked === 'login'
                          ? t('po.loginToView')
                          : price
                            ? t('po.subscribeToView', { price })
                            : t('po.subscribersOnly')}
                </Link>
            ) : (
                <Link
                    href={route('creator.subscribe', handle)}
                    method="post"
                    as="button"
                    className="bg-primary relative rounded-full px-5 py-2 text-sm font-bold transition hover:brightness-110"
                >
                    {price ? t('po.subscribeToView', { price }) : t('po.subscribersOnly')}
                </Link>
            )}
        </div>
    );
}
