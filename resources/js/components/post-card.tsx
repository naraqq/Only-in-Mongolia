import { avatarGradient } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { type SharedData } from '@/types';
import { Link, usePage } from '@inertiajs/react';
import { Globe, Image as ImageIcon, Lock, Trash2, Video } from 'lucide-react';

export type PostItem = {
    id: number;
    visibility: 'public' | 'subscribers';
    is_adult: boolean;
    created_at: string;
    locked: 'login' | 'subscribe' | null;
    body: string | null;
    media: { id: number; type: 'image' | 'video'; url: string }[];
    counts: { image: number; video: number };
};

const day = (iso: string) => iso.slice(0, 10).replaceAll('-', '.');

/** One post: text and media if the viewer may see it, otherwise a locked tile that reveals only what's inside. */
export default function PostCard({
    post,
    author,
    price,
    onDelete,
    linkAuthor = false,
}: {
    post: PostItem;
    author: { name: string; handle: string };
    price?: string;
    onDelete?: () => void;
    linkAuthor?: boolean;
}) {
    const { t } = useT();

    return (
        <article className="bg-card overflow-hidden rounded-2xl border shadow-xs">
            <header className="flex items-center gap-3 px-4 pt-4">
                <span
                    className={`grid size-10 shrink-0 place-items-center rounded-full bg-gradient-to-br font-bold text-white ${avatarGradient(author.handle)}`}
                >
                    {author.name.charAt(0)}
                </span>
                <div className="min-w-0 flex-1">
                    {linkAuthor ? (
                        <Link href={route('creator.show', author.handle)} className="block truncate text-[15px] font-bold hover:underline">
                            {author.name}
                        </Link>
                    ) : (
                        <div className="truncate text-[15px] font-bold">{author.name}</div>
                    )}
                    <div className="text-muted-foreground text-xs">
                        @{author.handle} · {day(post.created_at)}
                    </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                    {post.is_adult && <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[11px] font-semibold text-rose-700">18+</span>}
                    <span
                        className="text-muted-foreground inline-flex items-center gap-1 text-xs"
                        title={t(post.visibility === 'public' ? 'po.public' : 'po.subscribers')}
                    >
                        {post.visibility === 'public' ? <Globe className="size-3.5" /> : <Lock className="size-3.5" />}
                        {t(post.visibility === 'public' ? 'po.public' : 'po.subscribers')}
                    </span>
                    {onDelete && (
                        <button
                            type="button"
                            onClick={onDelete}
                            className="text-muted-foreground ml-1 hover:text-rose-600"
                            aria-label={t('po.delete')}
                            title={t('po.delete')}
                        >
                            <Trash2 className="size-4" />
                        </button>
                    )}
                </div>
            </header>

            {post.locked ? (
                <Locked post={post} price={price} handle={author.handle} />
            ) : (
                <>
                    {post.body && <p className="px-4 pt-3 text-[15px] leading-relaxed break-words whitespace-pre-line">{post.body}</p>}
                    {post.media.length > 0 && (
                        <div className={`mt-3 grid gap-0.5 overflow-hidden ${post.media.length > 1 ? 'grid-cols-2' : ''}`}>
                            {post.media.map((m) =>
                                m.type === 'video' ? (
                                    <video
                                        key={m.id}
                                        src={m.url}
                                        controls
                                        preload="metadata"
                                        className="aspect-square w-full bg-black object-contain"
                                    />
                                ) : (
                                    <img key={m.id} src={m.url} alt="" loading="lazy" className="aspect-square w-full object-cover" />
                                ),
                            )}
                        </div>
                    )}
                    {post.media.length === 0 && <div className="h-4" />}
                </>
            )}
        </article>
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
            {post.locked === 'login' || !signedIn ? (
                <Link href={route('login')} className="bg-primary relative rounded-full px-5 py-2 text-sm font-bold">
                    {post.locked === 'login' ? t('po.loginToView') : price ? t('po.subscribeToView', { price }) : t('po.subscribersOnly')}
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
