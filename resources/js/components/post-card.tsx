import MoreMenu from '@/components/more-menu';
import PostComments from '@/components/post-comments';
import PostMedia from '@/components/post-media';
import PostPanel from '@/components/post-panel';
import RichText from '@/components/rich-text';
import TipButton from '@/components/tip-button';
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import UnlockButton from '@/components/unlock-button';
import UserAvatar from '@/components/user-avatar';
import { mnt, timeAgo } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { usePostState, type PostState } from '@/lib/use-post-state';
import { useSeen } from '@/lib/views';
import { type SharedData } from '@/types';
import { Link, usePage } from '@inertiajs/react';
import {
    BadgeCheck,
    Bookmark,
    CalendarClock,
    Globe,
    HandCoins,
    Heart,
    Image as ImageIcon,
    Lock,
    MessageCircle,
    MoreHorizontal,
    Pencil,
    Pin,
    Trash2,
    Video,
    X,
} from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';

export type PostItem = {
    id: number;
    visibility: 'public' | 'subscribers';
    is_adult: boolean;
    created_at: string;
    locked: 'login' | 'subscribe' | 'buy' | null;
    price: number | null;
    body: string | null;
    media: { id: number; type: 'image' | 'video'; url: string; stamp?: string | null }[];
    counts: { image: number; video: number };
    likes_count: number;
    comments_count: number;
    liked: boolean;
    bookmarked: boolean;
    publish_at: string | null; // set while scheduled
    pinned?: boolean;
};

const when = (iso: string) => new Date(iso).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' }).replaceAll('-', '.');

type Author = { name: string; handle: string; avatar_url?: string | null };
type Menu = { onDelete?: () => void; onEdit?: () => void; onPin?: () => void };

/** One post: text and media if the viewer may see it, otherwise a locked tile that reveals only what's inside. */
export default function PostCard({
    post,
    author,
    price,
    onDelete,
    onEdit,
    onPin,
    linkAuthor = false,
    authorAction,
    compactMedia = false,
}: {
    post: PostItem;
    author: Author;
    price?: string;
    linkAuthor?: boolean;
    authorAction?: ReactNode;
    compactMedia?: boolean;
} & Menu) {
    const { auth } = usePage<SharedData>().props;
    const mine = auth.creator?.handle === author.handle;
    const state = usePostState(post);
    // Counts toward the creator's insights (not for the creator's own posts, nor scheduled or locked ones).
    const box = useRef<HTMLElement>(null);
    useSeen(box, post.id, !mine && !post.locked && !post.publish_at);
    // 0 = closed; each click on "comment" bumps it so the write box gets the cursor again.
    const [talk, setTalk] = useState(0);
    const menu = { onDelete, onEdit, onPin };
    const comment = () => setTalk((n) => n + 1);

    return (
        <article
            ref={box}
            id={`post-${post.id}`}
            className={`scroll-mt-20 overflow-hidden rounded-2xl shadow-xs ${post.publish_at ? 'bg-sky-50 dark:bg-sky-950/40' : 'bg-card'}`}
        >
            <Header post={post} author={author} mine={mine} linkAuthor={linkAuthor} menu={menu} action={authorAction} />
            {post.locked ? (
                <Locked post={post} price={price} handle={author.handle} />
            ) : (
                <Body post={post} author={author} state={state} lightbox compact={compactMedia} />
            )}
            <Actions post={post} author={author} mine={mine} state={state} onComment={comment} />
            {talk > 0 && (
                <CommentsModal
                    post={post}
                    author={author}
                    mine={mine}
                    state={state}
                    menu={menu}
                    focus={talk}
                    onComment={comment}
                    onClose={() => setTalk(0)}
                />
            )}
        </article>
    );
}

/** Facebook-style comments: the whole post at the top, comments under it, the write box pinned to the bottom. */
function CommentsModal({
    post,
    author,
    mine,
    state,
    menu,
    focus,
    onComment,
    onClose,
}: {
    post: PostItem;
    author: Author;
    mine: boolean;
    state: PostState;
    menu: Menu;
    focus: number;
    onComment: () => void;
    onClose: () => void;
}) {
    const { t } = useT();

    return (
        <Dialog open onOpenChange={(o) => !o && onClose()}>
            <DialogContent
                aria-describedby={undefined}
                className="bg-card flex h-dvh max-h-dvh w-full max-w-none flex-col gap-0 overflow-hidden rounded-none p-0 shadow-xs sm:h-auto sm:max-h-[90dvh] sm:max-w-[620px] sm:rounded-2xl [&>button:last-child]:hidden"
            >
                <div className="relative flex h-14 shrink-0 items-center justify-center px-14">
                    <DialogTitle className="truncate text-[17px] font-bold">{t('po.postBy', { name: author.name })}</DialogTitle>
                    <DialogClose
                        className="bg-muted hover:bg-muted/70 absolute right-3 grid size-9 place-items-center rounded-full transition"
                        aria-label={t('po.close')}
                    >
                        <X className="size-5" />
                    </DialogClose>
                </div>
                <PostComments
                    postId={post.id}
                    onCount={state.setComments}
                    focus={focus}
                    top={
                        <div className="pb-1">
                            <Header post={post} author={author} mine={mine} linkAuthor menu={menu} />
                            <Body post={post} author={author} state={state} short />
                            <Actions post={post} author={author} mine={mine} state={state} onComment={onComment} />
                        </div>
                    }
                />
            </DialogContent>
        </Dialog>
    );
}

/** Avatar, name, handle, when, and who can see it; the post's menu on the right. */
function Header({
    post,
    author,
    mine,
    linkAuthor,
    menu,
    action,
}: {
    post: PostItem;
    author: Author;
    mine: boolean;
    linkAuthor: boolean;
    menu: Menu;
    action?: ReactNode;
}) {
    const { t } = useT();
    const avatar = <UserAvatar name={author.name} src={author.avatar_url} seed={author.handle} className="size-10" />;
    const audience = t(post.visibility === 'public' ? 'po.public' : 'po.subscribers');

    return (
        <>
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
            <header className="flex items-center gap-2.5 px-4 pt-3">
                {linkAuthor ? (
                    <Link href={route('creator.show', author.handle)} className="shrink-0">
                        {avatar}
                    </Link>
                ) : (
                    avatar
                )}
                <div className="min-w-0 flex-1 leading-tight">
                    <div className="flex min-w-0 items-center gap-1">
                        {linkAuthor ? (
                            <Link href={route('creator.show', author.handle)} className="truncate text-[15px] font-bold hover:underline">
                                {author.name}
                            </Link>
                        ) : (
                            <span className="truncate text-[15px] font-bold">{author.name}</span>
                        )}
                        <BadgeCheck className="text-primary size-4 shrink-0" aria-label={t('po.verified')} />
                    </div>
                    <div className="text-muted-foreground mt-0.5 flex min-w-0 items-center gap-1 text-[13px]">
                        <span className="truncate">@{author.handle}</span>
                        <span aria-hidden>·</span>
                        <time
                            dateTime={post.created_at}
                            title={new Date(post.created_at).toLocaleString('sv-SE').replaceAll('-', '.')}
                            className="shrink-0"
                        >
                            {timeAgo(post.created_at, t)}
                        </time>
                        {!post.price && (
                            <>
                                <span aria-hidden>·</span>
                                <span title={audience} className="shrink-0">
                                    {post.visibility === 'public' ? (
                                        <Globe className="size-3.5" aria-label={audience} />
                                    ) : (
                                        <Lock className="size-3.5" aria-label={audience} />
                                    )}
                                </span>
                            </>
                        )}
                    </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                    {action}
                    {post.is_adult && <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[11px] font-semibold text-rose-700">18+</span>}
                    {!!post.price && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                            <Lock className="size-3" /> {mnt(post.price)}
                        </span>
                    )}
                    {!mine && !post.locked && <MoreMenu report={{ type: 'post', id: post.id }} className="-mr-1" />}
                    {(menu.onDelete || menu.onEdit || menu.onPin) && (
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
                                {menu.onEdit && (
                                    <DropdownMenuItem onSelect={menu.onEdit}>
                                        <Pencil className="mr-2 size-4" /> {t('po.edit')}
                                    </DropdownMenuItem>
                                )}
                                {menu.onPin && !post.publish_at && (
                                    <DropdownMenuItem onSelect={menu.onPin}>
                                        <Pin className="mr-2 size-4" /> {t(post.pinned ? 'po.unpin' : 'po.pin')}
                                    </DropdownMenuItem>
                                )}
                                {menu.onDelete && (
                                    <DropdownMenuItem onSelect={menu.onDelete} className="text-red-600 focus:text-red-600">
                                        <Trash2 className="mr-2 size-4" /> {t('po.delete')}
                                    </DropdownMenuItem>
                                )}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}
                </div>
            </header>
        </>
    );
}

/** The text, then the photos edge to edge. `lightbox` lets a photo open full screen with the post beside it. */
function Body({
    post,
    author,
    state,
    lightbox = false,
    short = false,
    compact = false,
}: {
    post: PostItem;
    author: Author;
    state: PostState;
    lightbox?: boolean;
    /** Keep photos short (in the comments window) so the comments show under them. */
    short?: boolean;
    compact?: boolean;
}) {
    return (
        <>
            {post.body && <RichText text={post.body} className="px-4 pt-2.5 text-[15px] leading-relaxed" />}
            {post.media.length > 0 ? (
                <PostMedia
                    media={post.media}
                    onDoubleLike={state.likeOnce}
                    className={
                        compact
                            ? 'mt-3 rounded-xl [&_.aspect-square]:max-h-56 sm:[&_.aspect-square]:max-h-72 [&_img]:max-h-56 sm:[&_img]:max-h-72 [&_video]:max-h-56 sm:[&_video]:max-h-72'
                            : short
                              ? 'mt-3 [&_.aspect-square]:max-h-[55dvh] [&_img]:max-h-[55dvh]'
                              : 'mt-3'
                    }
                    aside={lightbox ? <PostPanel post={post} author={author} state={state} /> : undefined}
                />
            ) : (
                <div className="h-1" />
            )}
        </>
    );
}

/** One row, like Facebook: like and comment with their counts, tip, and save on the far right. Icons only, except "Tip". */
function Actions({
    post,
    author,
    mine,
    state,
    onComment,
}: {
    post: PostItem;
    author: Author;
    mine: boolean;
    state: PostState;
    onComment: () => void;
}) {
    const { t } = useT();
    const { liked, likes, saved, comments, toggleSave } = state;
    const canEngage = !post.locked;
    const btn =
        'text-muted-foreground hover:bg-muted inline-flex h-10 items-center gap-1.5 rounded-full px-2.5 text-[15px] font-semibold tabular-nums transition';
    const icon = 'size-6';

    if (!canEngage && mine) return null;

    return (
        <footer className="flex items-center gap-1 px-2 py-1.5">
            {canEngage && (
                <>
                    <button
                        type="button"
                        onClick={state.toggleLike}
                        className={`${btn} ${liked ? 'text-rose-600' : ''}`}
                        aria-pressed={liked}
                        aria-label={t('po.like')}
                    >
                        <Heart className={`${icon} transition ${liked ? 'scale-110 fill-current' : ''}`} />
                        {likes > 0 && likes}
                    </button>
                    <button type="button" onClick={onComment} className={btn} aria-label={t('po.comments')}>
                        <MessageCircle className={icon} />
                        {comments > 0 && comments}
                    </button>
                </>
            )}
            {!mine && (
                <TipButton
                    handle={author.handle}
                    name={author.name}
                    postId={post.id}
                    className={`${btn} bg-primary/12 text-primary hover:bg-primary/20 hover:text-primary px-3.5`}
                >
                    <HandCoins className={icon} /> {t('tip.tip')}
                </TipButton>
            )}
            {canEngage && (
                <button
                    type="button"
                    onClick={toggleSave}
                    className={`${btn} ml-auto ${saved ? 'text-violet-600' : ''}`}
                    aria-pressed={saved}
                    aria-label={t('po.save')}
                    title={t('po.save')}
                >
                    <Bookmark className={`${icon} ${saved ? 'fill-current' : ''}`} />
                </button>
            )}
        </footer>
    );
}

function Locked({ post, price, handle }: { post: PostItem; price?: string; handle: string }) {
    const { t } = useT();
    const signedIn = !!usePage<SharedData>().props.auth.user;
    return (
        <div className="relative m-4 mt-3 flex flex-col items-center gap-3 overflow-hidden rounded-xl bg-[#232a21] px-6 py-14 text-center text-white">
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
                <UnlockButton
                    href={route('posts.buy', post.id)}
                    price={post.price ?? 0}
                    className="bg-brand-2 relative rounded-lg px-5 py-2 text-sm font-bold text-[#20251e] transition hover:brightness-110"
                >
                    {t('ppv.unlock', { price: mnt(post.price ?? 0) })}
                </UnlockButton>
            ) : post.locked === 'login' || !signedIn ? (
                <Link href={route('login')} className="bg-primary text-primary-foreground relative rounded-full px-5 py-2 text-sm font-bold">
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
                    href={route('creator.checkout', handle)}
                    className="bg-primary text-primary-foreground relative rounded-full px-5 py-2 text-sm font-bold transition hover:brightness-110"
                >
                    {price ? t('po.subscribeToView', { price }) : t('po.subscribersOnly')}
                </Link>
            )}
        </div>
    );
}
