import { useT } from '@/lib/i18n';
import { Link } from '@inertiajs/react';
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
}: {
    post: PostItem;
    author: { name: string; handle: string };
    price?: string;
    onDelete?: () => void;
}) {
    const { t } = useT();

    return (
        <article className="rounded-xl border">
            <header className="flex items-center gap-3 px-4 pt-4">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-rose-100 font-semibold text-rose-700 dark:bg-rose-950 dark:text-rose-300">
                    {author.name.charAt(0)}
                </span>
                <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{author.name}</div>
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
                <Locked post={post} price={price} />
            ) : (
                <>
                    {post.body && <p className="px-4 pt-3 leading-relaxed break-words whitespace-pre-line">{post.body}</p>}
                    {post.media.length > 0 && (
                        <div className={`mt-3 grid gap-0.5 overflow-hidden rounded-b-xl ${post.media.length > 1 ? 'grid-cols-2' : ''}`}>
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

function Locked({ post, price }: { post: PostItem; price?: string }) {
    const { t } = useT();
    return (
        <div className="m-4 flex flex-col items-center gap-3 rounded-lg bg-gradient-to-br from-zinc-100 to-zinc-200 px-6 py-10 text-center dark:from-zinc-900 dark:to-zinc-800">
            <Lock className="text-muted-foreground size-7" aria-hidden />
            <div className="text-muted-foreground flex items-center gap-3 text-sm">
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
            {post.locked === 'login' ? (
                <Link href={route('login')} className="text-sm font-medium underline">
                    {t('po.loginToView')}
                </Link>
            ) : (
                <p className="text-sm font-medium">{price ? t('po.subscribeToView', { price }) : t('po.subscribersOnly')}</p>
            )}
        </div>
    );
}
