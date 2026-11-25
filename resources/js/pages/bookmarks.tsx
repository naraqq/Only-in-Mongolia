import PostCard, { type PostItem } from '@/components/post-card';
import SocialLayout from '@/layouts/social-layout';
import { mnt } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { Bookmark } from 'lucide-react';

type SavedPost = PostItem & { author: { name: string; handle: string; price: number; avatar_url: string | null } };

/** Posts you saved with the bookmark button, newest save first. */
export default function Saved({ posts }: { posts: SavedPost[] }) {
    const { t } = useT();

    return (
        <SocialLayout title={t('nav.saved')} header={<h1 className="text-lg font-bold tracking-wide uppercase">{t('nav.saved')}</h1>}>
            {posts.length === 0 ? (
                <div className="text-muted-foreground flex flex-col items-center gap-3 p-12 text-center text-sm">
                    <span className="bg-muted grid size-16 place-items-center rounded-full">
                        <Bookmark className="size-7" />
                    </span>
                    {t('sv.empty')}
                </div>
            ) : (
                <div className="flex flex-col gap-4 p-4">
                    {posts.map((p) => (
                        <PostCard key={p.id} post={p} author={p.author} price={mnt(p.author.price)} linkAuthor />
                    ))}
                </div>
            )}
        </SocialLayout>
    );
}
