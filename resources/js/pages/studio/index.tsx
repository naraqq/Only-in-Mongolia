import InputError from '@/components/input-error';
import PostCard, { type PostItem } from '@/components/post-card';
import { Button } from '@/components/ui/button';
import AppLayout from '@/layouts/app-layout';
import { useT } from '@/lib/i18n';
import { Head, Link, router, useForm } from '@inertiajs/react';
import { ExternalLink, ImagePlus, LoaderCircle, X } from 'lucide-react';
import { type FormEvent } from 'react';

type StudioCreator = { handle: string; display_name: string; price_monthly: number; adult_content: boolean };

/** Write posts (text + photos/videos), pick who sees them, and manage what's already up. */
export default function Studio({ creator, posts }: { creator: StudioCreator; posts: PostItem[] }) {
    const { t } = useT();
    const form = useForm({ body: '', visibility: 'subscribers' as 'public' | 'subscribers', is_adult: false as boolean, media: [] as File[] });
    const mediaErrors = Object.entries(form.errors).filter(([k]) => k.startsWith('media'));

    function submit(e: FormEvent) {
        e.preventDefault();
        form.post(route('studio.posts.store'), { forceFormData: true, preserveScroll: true, onSuccess: () => form.reset() });
    }

    const author = { name: creator.display_name, handle: creator.handle };

    return (
        <AppLayout breadcrumbs={[{ title: t('nav.studio'), href: route('studio') }]}>
            <Head title={t('nav.studio')} />
            <div className="mx-auto w-full max-w-2xl p-4 md:py-8">
                <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                        <h1 className="text-2xl font-semibold tracking-tight">{t('nav.studio')}</h1>
                        <p className="text-muted-foreground mt-1">{t('st.sub')}</p>
                    </div>
                    <Button asChild variant="outline" size="sm">
                        <Link href={route('creator.show', creator.handle)}>
                            <ExternalLink className="size-4" /> @{creator.handle}
                        </Link>
                    </Button>
                </div>

                {/* Composer */}
                <form onSubmit={submit} className="mt-6 rounded-xl border p-4">
                    <textarea
                        value={form.data.body}
                        onChange={(e) => form.setData('body', e.target.value)}
                        placeholder={t('st.placeholder')}
                        maxLength={5000}
                        rows={3}
                        className="placeholder:text-muted-foreground w-full resize-y bg-transparent text-[15px] outline-none"
                    />
                    <InputError message={form.errors.body} />

                    {form.data.media.length > 0 && (
                        <ul className="mt-3 flex flex-wrap gap-2">
                            {form.data.media.map((f, i) => (
                                <li key={i} className="bg-muted flex items-center gap-2 rounded-md px-2 py-1 text-xs">
                                    <span className="max-w-40 truncate">{f.name}</span>
                                    <button
                                        type="button"
                                        aria-label={t('po.delete')}
                                        onClick={() =>
                                            form.setData(
                                                'media',
                                                form.data.media.filter((_, j) => j !== i),
                                            )
                                        }
                                    >
                                        <X className="size-3.5" />
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                    {mediaErrors.map(([k, v]) => (
                        <InputError key={k} message={v} />
                    ))}

                    <div className="mt-4 flex flex-wrap items-center gap-3 border-t pt-3">
                        <label className="hover:bg-muted inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 text-sm">
                            <ImagePlus className="size-4" /> {t('st.addMedia')}
                            <input
                                type="file"
                                multiple
                                accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
                                className="hidden"
                                onChange={(e) => form.setData('media', [...form.data.media, ...Array.from(e.target.files ?? [])].slice(0, 10))}
                            />
                        </label>
                        <select
                            value={form.data.visibility}
                            onChange={(e) => form.setData('visibility', e.target.value as 'public' | 'subscribers')}
                            className="border-input h-8 rounded-md border bg-transparent px-2 text-sm"
                        >
                            <option value="subscribers">{t('po.subscribers')}</option>
                            <option value="public">{t('po.public')}</option>
                        </select>
                        {creator.adult_content && (
                            <label className="inline-flex items-center gap-1.5 text-sm">
                                <input type="checkbox" checked={form.data.is_adult} onChange={(e) => form.setData('is_adult', e.target.checked)} />{' '}
                                18+
                            </label>
                        )}
                        <Button
                            type="submit"
                            size="sm"
                            className="ml-auto"
                            disabled={form.processing || (!form.data.body.trim() && form.data.media.length === 0)}
                        >
                            {form.processing && <LoaderCircle className="size-4 animate-spin" />}
                            {t('st.publish')}
                        </Button>
                    </div>
                    {form.progress && <progress value={form.progress.percentage} max="100" className="mt-2 h-1 w-full" />}
                    <p className="text-muted-foreground mt-3 text-xs">{t('st.rules')}</p>
                </form>

                {/* Their posts */}
                <h2 className="mt-8 mb-3 font-medium">
                    {t('st.yourPosts')} <span className="text-muted-foreground">({posts.length})</span>
                </h2>
                {posts.length === 0 ? (
                    <p className="text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">{t('st.empty')}</p>
                ) : (
                    <div className="flex flex-col gap-4">
                        {posts.map((p) => (
                            <PostCard
                                key={p.id}
                                post={p}
                                author={author}
                                onDelete={() =>
                                    confirm(t('st.confirmDelete')) && router.delete(route('studio.posts.destroy', p.id), { preserveScroll: true })
                                }
                            />
                        ))}
                    </div>
                )}
            </div>
        </AppLayout>
    );
}
