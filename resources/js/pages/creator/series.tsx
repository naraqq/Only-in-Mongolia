import PostCard, { type PostItem } from '@/components/post-card';
import SocialLayout from '@/layouts/social-layout';
import { useCreatorVisit } from '@/lib/attribution';
import { mnt } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { Link } from '@inertiajs/react';
import { ArrowLeft } from 'lucide-react';

export default function CreatorSeries({
    series,
    creator,
    posts,
}: {
    series: { id: number; title: string; description: string | null; featured: boolean };
    creator: { handle: string; name: string; avatar_url: string | null; price_monthly: number };
    posts: PostItem[];
}) {
    const { t } = useT();
    useCreatorVisit(creator.handle, 'series', series.id);
    return (
        <SocialLayout title={series.title}>
            <section className="border-border space-y-3 border-b px-4 py-6 sm:px-6">
                <Link
                    className="text-muted-foreground hover:text-foreground inline-flex items-center gap-2 text-sm font-medium"
                    href={route('creator.show', { handle: creator.handle, tab: 'series' })}
                >
                    <ArrowLeft className="size-4" aria-hidden /> {creator.name}
                </Link>
                <h1 className="text-3xl font-black tracking-tight break-words sm:text-4xl">{series.title}</h1>
                {series.description && <p className="text-muted-foreground break-words whitespace-pre-wrap">{series.description}</p>}
            </section>
            <ol className="space-y-6 p-4 sm:p-6">
                {posts.map((post, index) => (
                    <li key={post.id} className="space-y-2">
                        <h2 className="text-muted-foreground text-sm font-semibold">
                            {t('series.episode', { n: index + 1 })}
                            {index === 0 && ` · ${t('series.start')}`}
                        </h2>
                        <PostCard post={post} author={creator} price={mnt(creator.price_monthly)} />
                    </li>
                ))}
            </ol>
        </SocialLayout>
    );
}
