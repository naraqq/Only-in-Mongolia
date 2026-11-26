import MoreMenu from '@/components/more-menu';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import UserAvatar from '@/components/user-avatar';
import { timeAgo } from '@/lib/format';
import { sendJson } from '@/lib/http';
import { useT } from '@/lib/i18n';
import { type SharedData } from '@/types';
import { Link, router, usePage } from '@inertiajs/react';
import { CornerDownRight, Heart, LoaderCircle, SendHorizontal, Smile, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';

type Comment = {
    id: number;
    parent_id: number | null;
    body: string;
    created_at: string;
    likes_count: number;
    liked: boolean;
    user: { name: string; handle: string | null; avatar_url: string | null };
    can_delete: boolean;
};

/**
 * A post's comments, loaded when shown. Like a comment, reply to it (one level of replies, like Facebook),
 * and delete your own (creators can delete any on their posts).
 * Fills its parent: `top` (usually the post itself) and the comments scroll, and the write box stays pinned at the bottom.
 */
export default function PostComments({
    postId,
    onCount,
    top,
    focus = 0,
}: {
    postId: number;
    onCount: (n: number) => void;
    top?: ReactNode;
    /** Bump this to put the cursor in the write box (0 leaves it alone). */
    focus?: number;
}) {
    const { t } = useT();
    const { auth } = usePage<SharedData>().props;
    const [comments, setComments] = useState<Comment[] | null>(null);
    const [body, setBody] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(false);
    const [replyTo, setReplyTo] = useState<{ id: number; name: string } | null>(null);
    const [open, setOpen] = useState<Set<number>>(new Set());
    const box = useRef<HTMLTextAreaElement>(null);
    const scroller = useRef<HTMLDivElement>(null);

    // The box grows with the text, up to about six lines, then scrolls.
    useEffect(() => {
        const el = box.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
    }, [body]);

    useEffect(() => {
        sendJson<{ comments: Comment[] }>('GET', route('posts.comments', postId))
            .then((r) => setComments(r.comments))
            .catch(() => setComments([]));
    }, [postId]);

    useEffect(() => {
        if (focus) box.current?.focus({ preventScroll: true });
    }, [focus]);

    function update(next: Comment[]) {
        setComments(next);
        onCount(next.length);
    }

    const show = (id: number) =>
        requestAnimationFrame(() => scroller.current?.querySelector(`#comment-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));

    async function submit(e: FormEvent) {
        e.preventDefault();
        if (!body.trim() || busy) return;
        setBusy(true);
        setError(false);
        try {
            const r = await sendJson<{ comment: Comment }>('POST', route('posts.comment', postId), { body, parent_id: replyTo?.id ?? null });
            update([...(comments ?? []), r.comment]);
            if (r.comment.parent_id) setOpen((s) => new Set(s).add(r.comment.parent_id!));
            setBody('');
            setReplyTo(null);
            show(r.comment.id);
        } catch {
            setError(true);
        } finally {
            setBusy(false);
        }
    }

    function reply(c: Comment) {
        if (!auth.user) return router.visit(route('login'));
        setReplyTo({ id: c.parent_id ?? c.id, name: c.user.name });
        box.current?.focus();
    }

    // Likes change at once and roll back if the server says no.
    async function like(c: Comment) {
        if (!auth.user) return router.visit(route('login'));
        const flip = (liked: boolean, likes: number) =>
            setComments((list) => list?.map((x) => (x.id === c.id ? { ...x, liked, likes_count: likes } : x)) ?? null);
        flip(!c.liked, c.likes_count + (c.liked ? -1 : 1));
        try {
            const r = await sendJson<{ liked: boolean; likes_count: number }>('POST', route('comments.like', c.id));
            flip(r.liked, r.likes_count);
        } catch {
            flip(c.liked, c.likes_count);
        }
    }

    // Put an emoji where the cursor is, then keep typing after it.
    function insert(emoji: string) {
        const el = box.current;
        const at = el?.selectionStart ?? body.length;
        const end = el?.selectionEnd ?? at;
        setBody(body.slice(0, at) + emoji + body.slice(end));
        requestAnimationFrame(() => {
            el?.focus();
            el?.setSelectionRange(at + emoji.length, at + emoji.length);
        });
    }

    async function remove(id: number) {
        if (!confirm(t('cm.confirmDelete'))) return;
        await sendJson('DELETE', route('comments.destroy', id));
        // Its replies go with it.
        update((comments ?? []).filter((c) => c.id !== id && c.parent_id !== id));
        if (replyTo?.id === id) setReplyTo(null);
    }

    const threads = (comments ?? []).filter((c) => !c.parent_id);
    const repliesTo = (id: number) => (comments ?? []).filter((c) => c.parent_id === id);
    const row = (c: Comment, small = false) => (
        <CommentRow key={c.id} c={c} small={small} onLike={() => like(c)} onReply={() => reply(c)} onRemove={() => remove(c.id)} />
    );

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                {top}
                <div className="px-4 py-3">
                    {comments === null ? (
                        <CommentsSkeleton />
                    ) : (
                        <ul className="flex flex-col gap-3">
                            {threads.map((c) => {
                                const replies = repliesTo(c.id);
                                const expanded = open.has(c.id) || replies.length === 1;
                                return (
                                    <li key={c.id}>
                                        {row(c)}
                                        {replies.length > 0 && (
                                            <div className="mt-2 ml-[46px] flex flex-col gap-2.5">
                                                {expanded ? (
                                                    <>
                                                        {replies.map((r) => row(r, true))}
                                                        {replies.length > 1 && (
                                                            <ThreadToggle onClick={() => setOpen((s) => (s.delete(c.id), new Set(s)))}>
                                                                {t('cm.hideReplies')}
                                                            </ThreadToggle>
                                                        )}
                                                    </>
                                                ) : (
                                                    <ThreadToggle onClick={() => setOpen((s) => new Set(s).add(c.id))}>
                                                        <CornerDownRight className="size-4" /> {t('cm.viewReplies', { n: replies.length })}
                                                    </ThreadToggle>
                                                )}
                                            </div>
                                        )}
                                    </li>
                                );
                            })}
                            {comments.length === 0 &&
                                (auth.user ? (
                                    <li className="text-muted-foreground py-4 text-center text-sm">{t('cm.first')}</li>
                                ) : (
                                    <li className="py-4 text-center text-sm">
                                        <Link href={route('login')} className="text-primary font-semibold hover:underline">
                                            {t('cm.login')}
                                        </Link>
                                    </li>
                                ))}
                        </ul>
                    )}
                </div>
            </div>

            {auth.user && (
                <form onSubmit={submit} className="bg-card px-4 pt-2 pb-3 shadow-[0_-1px_6px_rgb(0_0_0/0.08)]">
                    {replyTo && (
                        <p className="text-muted-foreground mb-1.5 ml-10 flex items-center gap-1.5 text-[13px]">
                            <CornerDownRight className="size-3.5" />
                            <span className="truncate">{t('cm.replyingTo', { name: replyTo.name })}</span>
                            <button
                                type="button"
                                onClick={() => setReplyTo(null)}
                                className="hover:bg-muted hover:text-foreground grid size-5 shrink-0 place-items-center rounded-full transition"
                                aria-label={t('pe.cancel')}
                            >
                                <X className="size-3.5" />
                            </button>
                        </p>
                    )}
                    <div className="flex items-start gap-2">
                        <UserAvatar name={auth.user.name} src={auth.user.avatar_url} className="mt-1 size-8 text-xs" />
                        <div className="bg-muted min-w-0 flex-1 rounded-2xl">
                            <textarea
                                ref={box}
                                value={body}
                                onChange={(e) => setBody(e.target.value)}
                                onKeyDown={(e) => {
                                    // Enter sends; Shift+Enter starts a new line; Escape stops replying.
                                    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                                        e.preventDefault();
                                        e.currentTarget.form?.requestSubmit();
                                    }
                                    if (e.key === 'Escape' && replyTo) {
                                        e.stopPropagation();
                                        setReplyTo(null);
                                    }
                                }}
                                rows={1}
                                maxLength={1000}
                                placeholder={t(replyTo ? 'cm.replyAs' : 'cm.as', { name: auth.user.name })}
                                className="placeholder:text-muted-foreground block w-full resize-none bg-transparent px-3.5 pt-2.5 pb-1 text-[15px] leading-5 outline-none"
                            />
                            <div className="flex items-center justify-between px-1.5 pb-1.5">
                                <EmojiPicker onPick={insert} />
                                <button
                                    type="submit"
                                    disabled={!body.trim() || busy}
                                    className="text-primary hover:bg-background/40 disabled:text-muted-foreground grid size-8 place-items-center rounded-full transition disabled:opacity-50"
                                    aria-label={t('dm.send')}
                                >
                                    {busy ? <LoaderCircle className="size-[18px] animate-spin" /> : <SendHorizontal className="size-[18px]" />}
                                </button>
                            </div>
                        </div>
                    </div>
                </form>
            )}
            {error && <p className="px-4 pb-2 text-xs text-red-600">{t('cm.error')}</p>}
        </div>
    );
}

/** One comment or reply: who and when, the text, then like (with its count) and reply. */
function CommentRow({
    c,
    small,
    onLike,
    onReply,
    onRemove,
}: {
    c: Comment;
    small: boolean;
    onLike: () => void;
    onReply: () => void;
    onRemove: () => void;
}) {
    const { t } = useT();
    const act = 'text-muted-foreground hover:text-foreground inline-flex h-7 items-center gap-1 rounded-full text-[13px] font-semibold transition';

    return (
        <div id={`comment-${c.id}`} className="group flex scroll-mb-4 gap-2.5">
            <UserAvatar
                name={c.user.name}
                src={c.user.avatar_url}
                seed={c.user.handle ?? c.user.name}
                className={small ? 'size-7 text-[11px]' : 'size-9 text-sm'}
            />
            <div className="min-w-0 flex-1">
                <div className="flex h-5 min-w-0 items-center gap-1.5 text-[13px]">
                    {c.user.handle ? (
                        <Link href={route('creator.show', c.user.handle)} className="truncate font-bold hover:underline">
                            {c.user.name}
                        </Link>
                    ) : (
                        <span className="truncate font-bold">{c.user.name}</span>
                    )}
                    <span className="text-muted-foreground shrink-0">· {timeAgo(c.created_at, t)}</span>
                    <span className="text-muted-foreground -my-1.5 ml-auto flex shrink-0 items-center opacity-0 transition group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100">
                        {!c.can_delete && <MoreMenu report={{ type: 'comment', id: c.id }} className="size-6" />}
                        {c.can_delete && (
                            <button type="button" onClick={onRemove} className="hover:text-red-600" aria-label={t('po.delete')}>
                                <Trash2 className="size-4" />
                            </button>
                        )}
                    </span>
                </div>
                <p className="mt-0.5 text-[15px] leading-snug break-words whitespace-pre-line">{c.body}</p>
                <div className="-mb-1 flex items-center gap-4">
                    <button
                        type="button"
                        onClick={onLike}
                        className={`${act} ${c.liked ? 'text-rose-600 hover:text-rose-600' : ''}`}
                        aria-pressed={c.liked}
                        aria-label={t('po.like')}
                    >
                        <Heart className={`size-4 transition ${c.liked ? 'scale-110 fill-current' : ''}`} />
                        {c.likes_count > 0 && <span className="tabular-nums">{c.likes_count}</span>}
                    </button>
                    <button type="button" onClick={onReply} className={act}>
                        {t('cm.reply')}
                    </button>
                </div>
            </div>
        </div>
    );
}

/** Placeholder rows shaped like real comments (avatar, name, text, actions), with one reply, while they load. */
function CommentsSkeleton() {
    const { t } = useT();
    const rows: { small?: boolean; lines: string[] }[] = [
        { lines: ['w-11/12', 'w-2/3'] },
        { small: true, lines: ['w-3/4'] },
        { lines: ['w-4/5'] },
        { lines: ['w-full', 'w-1/2'] },
    ];

    return (
        <ul className="flex flex-col gap-3 motion-reduce:[&_*]:animate-none" aria-busy="true" aria-label={t('cm.loading')}>
            {rows.map((r, i) => (
                <li key={i} className={`flex gap-2.5 ${r.small ? 'ml-[46px]' : ''}`}>
                    <Skeleton className={`shrink-0 rounded-full ${r.small ? 'size-7' : 'size-9'}`} />
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5 pt-0.5">
                        <Skeleton className="h-3.5 w-28 rounded-full" />
                        {r.lines.map((w, j) => (
                            <Skeleton key={j} className={`h-3.5 rounded-full ${w}`} />
                        ))}
                        <div className="mt-1 flex gap-4">
                            <Skeleton className="h-3 w-8 rounded-full" />
                            <Skeleton className="h-3 w-10 rounded-full" />
                        </div>
                    </div>
                </li>
            ))}
        </ul>
    );
}

function ThreadToggle({ onClick, children }: { onClick: () => void; children: ReactNode }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1.5 text-[13px] font-bold transition"
        >
            {children}
        </button>
    );
}

const EMOJI = ['😂', '😍', '🥰', '😮', '😢', '😡', '👍', '👏', '🙏', '🔥', '❤️', '💯', '🎉', '😎', '🤩', '😅'];

/** A small emoji grid; the picked emoji goes in where the cursor is. */
function EmojiPicker({ onPick }: { onPick: (e: string) => void }) {
    const { t } = useT();
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground hover:bg-background/40 grid size-8 place-items-center rounded-full transition"
                    aria-label={t('cm.emoji')}
                    title={t('cm.emoji')}
                >
                    <Smile className="size-[18px]" />
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top" className="grid w-auto grid-cols-8 gap-0.5 p-1.5">
                {EMOJI.map((e) => (
                    <DropdownMenuItem key={e} onSelect={() => onPick(e)} className="grid size-9 place-items-center p-0 text-xl">
                        {e}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
