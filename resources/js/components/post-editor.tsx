import InputError from '@/components/input-error';
import { type PostItem } from '@/components/post-card';
import PriceField from '@/components/price-field';
import { priceOk, toLocalInput } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { useForm, usePage } from '@inertiajs/react';
import { CalendarClock, LoaderCircle } from 'lucide-react';
import { useState, type FormEvent } from 'react';

/** Edit an existing post's text, audience (incl. pay-per-view price) and, if not out yet, its scheduled time. */
export default function PostEditor({ post, onDone }: { post: PostItem; onDone: () => void }) {
    const { t } = useT();
    const { ppvLimits } = usePage<{ ppvLimits: { min: number; max: number } }>().props;
    const [ppv, setPpv] = useState(!!post.price);
    const [schedule, setSchedule] = useState(!!post.publish_at);
    const form = useForm({
        body: post.body ?? '',
        visibility: post.visibility,
        price: post.price ?? 5000,
        publish_at: toLocalInput(post.publish_at),
    });

    function submit(e: FormEvent) {
        e.preventDefault();
        form.transform((d) => ({
            ...d,
            price: ppv ? d.price : null,
            publish_at: schedule && d.publish_at ? new Date(d.publish_at).toISOString() : null,
        }));
        form.patch(route('studio.posts.update', post.id), { preserveScroll: true, onSuccess: onDone });
    }

    return (
        <form onSubmit={submit} className="border-primary/40 rounded-2xl border-2 p-4">
            <textarea
                value={form.data.body}
                onChange={(e) => form.setData('body', e.target.value)}
                rows={4}
                maxLength={5000}
                autoFocus
                className="w-full resize-y bg-transparent text-[15px] outline-none"
            />
            <InputError message={form.errors.body} />
            <div className="mt-3 flex flex-wrap items-center gap-3 border-t pt-3">
                <select
                    value={ppv ? 'ppv' : form.data.visibility}
                    onChange={(e) => {
                        setPpv(e.target.value === 'ppv');
                        if (e.target.value !== 'ppv') form.setData('visibility', e.target.value as 'public' | 'subscribers');
                    }}
                    className="border-input h-8 rounded-md border bg-transparent px-2 text-sm"
                >
                    <option value="subscribers">{t('po.subscribers')}</option>
                    <option value="public">{t('po.public')}</option>
                    <option value="ppv">{t('ppv.option')}</option>
                </select>
                {ppv && <PriceField value={form.data.price} onChange={(v) => form.setData('price', v)} />}
                {post.publish_at !== null && (
                    <label className="inline-flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={schedule} onChange={(e) => setSchedule(e.target.checked)} />
                        <CalendarClock className="size-4" />
                        {schedule ? (
                            <input
                                type="datetime-local"
                                value={form.data.publish_at}
                                onChange={(e) => form.setData('publish_at', e.target.value)}
                                className="border-input h-8 rounded-md border bg-transparent px-2"
                            />
                        ) : (
                            t('sch.now')
                        )}
                    </label>
                )}
            </div>
            <InputError message={form.errors.price ?? form.errors.publish_at} className="mt-2" />
            <div className="mt-3 flex justify-end gap-2">
                <button type="button" onClick={onDone} className="hover:bg-muted rounded-full px-4 py-2 text-sm font-semibold">
                    {t('pe.cancel')}
                </button>
                <button
                    type="submit"
                    disabled={form.processing || (ppv && !priceOk(form.data.price, ppvLimits))}
                    className="bg-primary inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-bold text-white disabled:opacity-40"
                >
                    {form.processing && <LoaderCircle className="size-4 animate-spin" />}
                    {t('pe.save')}
                </button>
            </div>
        </form>
    );
}
