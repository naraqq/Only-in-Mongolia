import MoreMenu from '@/components/more-menu';
import UserAvatar from '@/components/user-avatar';
import { sendJson } from '@/lib/http';
import { useT } from '@/lib/i18n';
import { type SharedData } from '@/types';
import { Link, usePage } from '@inertiajs/react';
import { LoaderCircle, SendHorizontal, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';

type Comment = {
    id: number;
    body: string;
    created_at: string;
    user: { name: string; handle: string | null; avatar_url: string | null };
    can_delete: boolean;
};

/** Comments under a post: loaded when opened; write, and delete your own (creators can delete any on their posts). */
export default function PostComments({ postId, onCount }: { postId: number; onCount: (n: number) => void }) {
    const { t } = useT();
    const { auth } = usePage<SharedData>().props;
    const [comments, setComments] = useState<Comment[] | null>(null);
    const [body, setBody] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(false);
    const box = useRef<HTMLTextAreaElement>(null);

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

    async function submit(e: FormEvent) {
        e.preventDefault();
        if (!body.trim() || busy) return;
        setBusy(true);
        setError(false);
        try {
            const r = await sendJson<{ comment: Comment }>('POST', route('posts.comment', postId), { body });
            const next = [...(comments ?? []), r.comment];
            setComments(next);
            onCount(next.length);
            setBody('');
        } catch {
            setError(true);
        } finally {
            setBusy(false);
        }
    }

    async function remove(id: number) {
        if (!confirm(t('cm.confirmDelete'))) return;
        await sendJson('DELETE', route('comments.destroy', id));
        const next = (comments ?? []).filter((c) => c.id !== id);
        setComments(next);
        onCount(next.length);
    }

    return (
        <div className="border-t px-4 py-3">
            {comments === null ? (
                <LoaderCircle className="text-muted-foreground mx-auto size-5 animate-spin" />
            ) : (
                <ul className="flex flex-col gap-3">
                    {comments.map((c) => (
                        <li key={c.id} className="group flex gap-2.5">
                            <UserAvatar name={c.user.name} src={c.user.avatar_url} seed={c.user.handle ?? c.user.name} className="size-8 text-xs" />
                            <div className="min-w-0 flex-1">
                                <div className="bg-muted rounded-2xl rounded-tl-md px-3 py-2">
                                    {c.user.handle ? (
                                        <Link href={route('creator.show', c.user.handle)} className="text-sm font-bold hover:underline">
                                            {c.user.name}
                                        </Link>
                                    ) : (
                                        <p className="text-sm font-bold">{c.user.name}</p>
                                    )}
                                    <p className="text-[15px] leading-snug break-words whitespace-pre-line">{c.body}</p>
                                </div>
                                <div className="text-muted-foreground mt-0.5 flex items-center gap-3 px-2 text-xs">
                                    <span>{c.created_at.slice(0, 10).replaceAll('-', '.')}</span>
                                    {!c.can_delete && <MoreMenu report={{ type: 'comment', id: c.id }} className="size-6" />}
                                    {c.can_delete && (
                                        <button type="button" onClick={() => remove(c.id)} className="hover:text-red-600" aria-label={t('po.delete')}>
                                            <Trash2 className="size-3.5" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        </li>
                    ))}
                    {comments.length === 0 && <li className="text-muted-foreground text-center text-sm">{t('cm.first')}</li>}
                </ul>
            )}

            {auth.user && (
                <form onSubmit={submit} className="mt-3 flex items-end gap-2">
                    <UserAvatar name={auth.user.name} src={auth.user.avatar_url} className="mb-1 size-8 text-xs" />
                    <textarea
                        ref={box}
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                        onKeyDown={(e) => {
                            // Enter sends; Shift+Enter starts a new line.
                            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                                e.preventDefault();
                                e.currentTarget.form?.requestSubmit();
                            }
                        }}
                        rows={1}
                        maxLength={1000}
                        placeholder={t('cm.placeholder')}
                        className="bg-muted focus:ring-primary/20 min-h-10 min-w-0 flex-1 resize-none rounded-2xl px-4 py-2.5 text-sm leading-5 outline-none focus:ring-2"
                    />
                    <button
                        type="submit"
                        disabled={!body.trim() || busy}
                        className="text-primary grid size-10 shrink-0 place-items-center rounded-full transition disabled:opacity-30"
                        aria-label={t('dm.send')}
                    >
                        {busy ? <LoaderCircle className="size-5 animate-spin" /> : <SendHorizontal className="size-5" />}
                    </button>
                </form>
            )}
            {error && <p className="mt-1 text-xs text-red-600">{t('cm.error')}</p>}
        </div>
    );
}
