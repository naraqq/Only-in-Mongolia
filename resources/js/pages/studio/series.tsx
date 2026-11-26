import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import StudioLayout from '@/layouts/studio-layout';
import { useT } from '@/lib/i18n';
import { Link, router, useForm } from '@inertiajs/react';
import { ArrowDown, ArrowUp, ExternalLink, ListOrdered, Plus, X } from 'lucide-react';
import { useState } from 'react';

type Series = { id: number; title: string; description: string | null; featured: boolean; post_ids: number[] };
type Post = { id: number; body: string; visibility: string; price: number | null };

export default function StudioSeries({ series, available, handle }: { series: Series[]; available: Post[]; handle: string }) {
    const { t } = useT();
    const [editing, setEditing] = useState<number | 'new' | null>(null);
    const selected = series.find((item) => item.id === editing);

    return (
        <StudioLayout title={t('series.title')}>
            <div className="space-y-5">
                <Button onClick={() => setEditing('new')} disabled={!available.length}>
                    <Plus aria-hidden /> {t('series.new')}
                </Button>
                {!available.length && <p className="text-muted-foreground text-sm">{t('series.noPosts')}</p>}
                {editing !== null && <SeriesEditor key={editing} item={selected} available={available} close={() => setEditing(null)} />}
                {series.length ? (
                    <ul className="divide-border divide-y border-y">
                        {series.map((item) => (
                            <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                                <div className="min-w-0 break-words">
                                    <p className="font-bold">{item.title}</p>
                                    <p className="text-muted-foreground text-sm">
                                        {t('series.episodes')} · {item.post_ids.length}
                                        {item.featured && ` · ${t('series.featured')}`}
                                    </p>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <Button variant="outline" size="sm" onClick={() => setEditing(item.id)}>
                                        {t('series.edit')}
                                    </Button>
                                    {!!item.post_ids.length && (
                                        <Button variant="ghost" size="sm" asChild>
                                            <Link href={route('creator.series', { handle, series: item.id })}>
                                                {t('series.open')} <ExternalLink aria-hidden />
                                            </Link>
                                        </Button>
                                    )}
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => {
                                            if (window.confirm(t('series.confirm'))) {
                                                router.delete(route('studio.series.destroy', item.id), {
                                                    preserveScroll: true,
                                                    onSuccess: () => setEditing((current) => (current === item.id ? null : current)),
                                                });
                                            }
                                        }}
                                    >
                                        {t('series.delete')}
                                    </Button>
                                </div>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="text-muted-foreground text-sm">{t('series.empty')}</p>
                )}
            </div>
        </StudioLayout>
    );
}

function SeriesEditor({ item, available, close }: { item?: Series; available: Post[]; close: () => void }) {
    const { t } = useT();
    const form = useForm({
        title: item?.title ?? '',
        description: item?.description ?? '',
        featured: item?.featured ?? false,
        post_ids: item?.post_ids ?? [],
    });
    const { post_ids: ids } = form.data;
    const byId = new Map(available.map((post) => [post.id, post]));
    const options = available.filter((post) => !ids.includes(post.id));
    const postName = (id: number) => byId.get(id)?.body.trim() || t('series.post', { n: id });
    const field = 'border-input bg-background text-foreground w-full rounded-lg border px-3 py-2';

    function move(index: number, destination: number) {
        const ordered = [...ids];
        [ordered[index], ordered[destination]] = [ordered[destination], ordered[index]];
        form.setData('post_ids', ordered);
    }

    return (
        <form
            className="border-border space-y-4 rounded-xl border p-4 sm:p-5"
            onSubmit={(event) => {
                event.preventDefault();
                const options = { preserveScroll: true, onSuccess: close };
                if (item) form.patch(route('studio.series.update', item.id), options);
                else form.post(route('studio.series.store'), options);
            }}
        >
            <div className="flex items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 font-bold">
                    <ListOrdered className="size-5" aria-hidden /> {item ? t('series.edit') : t('series.new')}
                </h2>
                <Button type="button" variant="ghost" size="icon" onClick={close} aria-label={t('po.close')}>
                    <X aria-hidden />
                </Button>
            </div>
            <label className="block space-y-1 text-sm font-medium">
                <span>{t('series.name')}</span>
                <input
                    className={field}
                    required
                    maxLength={100}
                    value={form.data.title}
                    onChange={(event) => form.setData('title', event.target.value)}
                />
                <InputError message={form.errors.title} />
            </label>
            <label className="block space-y-1 text-sm font-medium">
                <span>{t('series.description')}</span>
                <textarea
                    className={field}
                    rows={3}
                    maxLength={500}
                    value={form.data.description}
                    onChange={(event) => form.setData('description', event.target.value)}
                />
                <InputError message={form.errors.description} />
            </label>
            <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" checked={form.data.featured} onChange={(event) => form.setData('featured', event.target.checked)} />
                {t('series.featureLabel')}
            </label>
            <h3 className="font-semibold">{t('series.episodes')}</h3>
            <ol className="divide-border divide-y">
                {ids.map((id, index) => (
                    <li key={id} className="flex items-center gap-2 py-2">
                        <div className="min-w-0 flex-1">
                            <p className="text-muted-foreground text-xs">{index === 0 ? t('series.start') : t('series.episode', { n: index + 1 })}</p>
                            <p className="truncate text-sm font-medium">{postName(id)}</p>
                        </div>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            disabled={index === 0}
                            onClick={() => move(index, index - 1)}
                            aria-label={t('series.up')}
                        >
                            <ArrowUp aria-hidden />
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            disabled={index === ids.length - 1}
                            onClick={() => move(index, index + 1)}
                            aria-label={t('series.down')}
                        >
                            <ArrowDown aria-hidden />
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                                form.setData(
                                    'post_ids',
                                    ids.filter((value) => value !== id),
                                )
                            }
                            aria-label={t('series.remove')}
                        >
                            <X aria-hidden />
                        </Button>
                    </li>
                ))}
            </ol>
            <select
                className={field}
                aria-label={t('series.pick')}
                value=""
                disabled={!options.length || ids.length >= 25}
                onChange={(event) => form.setData('post_ids', [...ids, Number(event.target.value)])}
            >
                <option value="" disabled>
                    {t('series.pick')}
                </option>
                {options.map((post) => (
                    <option key={post.id} value={post.id}>
                        {postName(post.id)} · {t(post.visibility === 'public' && !post.price ? 'po.public' : 'series.locked')}
                    </option>
                ))}
            </select>
            <InputError message={form.errors.post_ids} />
            <Button disabled={form.processing || !ids.length}>{t('series.save')}</Button>
        </form>
    );
}
