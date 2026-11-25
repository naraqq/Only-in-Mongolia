import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { useT } from '@/lib/i18n';
import { useForm } from '@inertiajs/react';
import { ImagePlus, LoaderCircle, X } from 'lucide-react';
import { type FormEvent } from 'react';

/** Write a post: text, photos/videos, who sees it, and (for 18+ pages) the 18+ flag. Used in the studio and on home. */
export default function PostComposer({ adultAllowed, className = '' }: { adultAllowed: boolean; className?: string }) {
    const { t } = useT();
    const form = useForm({ body: '', visibility: 'subscribers' as 'public' | 'subscribers', is_adult: false as boolean, media: [] as File[] });
    const mediaErrors = Object.entries(form.errors).filter(([k]) => k.startsWith('media'));

    function submit(e: FormEvent) {
        e.preventDefault();
        form.post(route('studio.posts.store'), { forceFormData: true, preserveScroll: true, onSuccess: () => form.reset() });
    }

    return (
        <form onSubmit={submit} className={className}>
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
            <InputError message={form.errors.is_adult} />

            <div className="mt-3 flex flex-wrap items-center gap-3 border-t pt-3">
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
                {adultAllowed && (
                    <label className="inline-flex items-center gap-1.5 text-sm">
                        <input type="checkbox" checked={form.data.is_adult} onChange={(e) => form.setData('is_adult', e.target.checked)} /> 18+
                    </label>
                )}
                <Button
                    type="submit"
                    size="sm"
                    className="ml-auto rounded-full px-5"
                    disabled={form.processing || (!form.data.body.trim() && form.data.media.length === 0)}
                >
                    {form.processing && <LoaderCircle className="size-4 animate-spin" />}
                    {t('st.publish')}
                </Button>
            </div>
            {form.progress && <progress value={form.progress.percentage} max="100" className="mt-2 h-1 w-full" />}
        </form>
    );
}
