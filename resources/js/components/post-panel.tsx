import { type PostItem } from '@/components/post-card';
import PostComments from '@/components/post-comments';
import RichText from '@/components/rich-text';
import TipButton from '@/components/tip-button';
import UserAvatar from '@/components/user-avatar';
import { timeAgo } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { type PostState } from '@/lib/use-post-state';
import { type SharedData } from '@/types';
import { Link, usePage } from '@inertiajs/react';
import { BadgeCheck, Bookmark, Heart, MessageCircle } from 'lucide-react';

/** The side of the full-screen viewer: who posted it, the text, like / save / tip, and the comments. */
export default function PostPanel({
    post,
    author,
    state,
}: {
    post: PostItem;
    author: { name: string; handle: string; avatar_url?: string | null };
    state: PostState;
}) {
    const { t } = useT();
    const { auth } = usePage<SharedData>().props;
    const mine = auth.creator?.handle === author.handle;
    const btn = 'inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold transition';

    return (
        <div className="bg-card text-foreground flex min-h-0 flex-1 flex-col">
            <header className="flex items-center gap-3 px-4 py-3">
                <Link href={route('creator.show', author.handle)}>
                    <UserAvatar name={author.name} src={author.avatar_url} seed={author.handle} className="size-10" />
                </Link>
                <div className="min-w-0">
                    <div className="flex items-center gap-1">
                        <Link href={route('creator.show', author.handle)} className="truncate font-bold hover:underline">
                            {author.name}
                        </Link>
                        <BadgeCheck className="size-4 shrink-0 text-primary" aria-label={t('po.verified')} />
                    </div>
                    <p className="text-muted-foreground text-[13px]">
                        @{author.handle} · {timeAgo(post.created_at, t)}
                    </p>
                </div>
            </header>

            <PostComments
                postId={post.id}
                onCount={state.setComments}
                top={
                    <>
                        {post.body && <RichText text={post.body} className="px-4 pt-3 pb-1" />}
                        <div className="flex items-center gap-0.5 px-2 py-1.5">
                            <button
                                type="button"
                                onClick={state.toggleLike}
                                className={`${btn} hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 ${state.liked ? 'text-rose-600' : 'text-muted-foreground'}`}
                                aria-pressed={state.liked}
                                aria-label={t('po.like')}
                            >
                                <Heart className={`size-5 ${state.liked ? 'fill-current' : ''}`} />
                                {state.likes > 0 && <span className="tabular-nums">{state.likes}</span>}
                            </button>
                            <span className={`${btn} text-muted-foreground`}>
                                <MessageCircle className="size-5" />
                                {state.comments > 0 && <span className="tabular-nums">{state.comments}</span>}
                            </span>
                            {!mine && (
                                <TipButton
                                    handle={author.handle}
                                    name={author.name}
                                    postId={post.id}
                                    className={`${btn} bg-primary/12 text-primary hover:bg-primary/20 hover:text-primary px-3.5`}
                                />
                            )}
                            <button
                                type="button"
                                onClick={state.toggleSave}
                                className={`${btn} ml-auto hover:bg-violet-50 hover:text-violet-600 dark:hover:bg-violet-950/40 ${state.saved ? 'text-violet-600' : 'text-muted-foreground'}`}
                                aria-pressed={state.saved}
                                aria-label={t('po.save')}
                            >
                                <Bookmark className={`size-5 ${state.saved ? 'fill-current' : ''}`} />
                            </button>
                        </div>
                    </>
                }
            />
        </div>
    );
}
