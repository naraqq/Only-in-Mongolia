import InputError from '@/components/input-error';
import { LibraryButton, PickedThumbs, type Picked } from '@/components/library-picker';
import MediaThumbs from '@/components/media-thumbs';
import PriceField from '@/components/price-field';
import { ask } from '@/lib/confirm';
import { priceOk } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { useForm, usePage } from '@inertiajs/react';
import { ImagePlus, LoaderCircle, Lock, Megaphone } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';

/** Studio: one message to every subscriber (or follower), delivered into each fan's own conversation. */
export default function MassMessage({ subscribers, followers, className = '' }: { subscribers: number; followers: number; className?: string }) {
    const { t } = useT();
    const flash = usePage<{ flash?: { status?: string } }>().props.flash;
    const form = useForm({ body: '', audience: 'subscribers' as 'subscribers' | 'followers', media: [] as File[], price: 5000 });
    const [ppv, setPpv] = useState(false);
    const [picked, setPicked] = useState<Picked[]>([]);
    const hasMedia = form.data.media.length > 0 || picked.length > 0;
    const { ppvLimits } = usePage<{ ppvLimits: { min: number; max: number } }>().props;
    const priced = ppv && form.data.media.length + picked.length > 0;
    const files = useRef<HTMLInputElement>(null);
    const count = form.data.audience === 'subscribers' ? subscribers : followers;
    const sent = typeof flash?.status === 'string' && flash.status.startsWith('mass-sent:') ? Number(flash.status.split(':')[1]) : null;

    function submit(e: FormEvent) {
        e.preventDefault();
        form.transform((d) => ({ ...d, vault: picked.map((p) => p.id), price: priced ? d.price : null }));
        form.post(route('studio.mass'), {
            forceFormData: true,
            preserveScroll: true,
            onSuccess: () => {
                form.reset('body', 'media');
                setPicked([]);
                setPpv(false);
            },
        });
    }

    return (
        <form onSubmit={submit} className={`bg-card rounded-2xl p-4 shadow-xs ${className}`}>
            <div className="flex items-center gap-2.5 font-bold">
                <span className="bg-primary/10 text-primary grid size-9 place-items-center rounded-xl">
                    <Megaphone className="size-[18px]" />
                </span>
                {t('mm.title')}
            </div>
            <div className="bg-muted mt-3 grid grid-cols-2 gap-1 rounded-xl p-1 text-sm">
                {(['subscribers', 'followers'] as const).map((a) => (
                    <button
                        key={a}
                        type="button"
                        onClick={() => form.setData('audience', a)}
                        className={`rounded-lg py-2 font-semibold transition ${form.data.audience === a ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}
                    >
                        {t(a === 'subscribers' ? 'pe.dmSubscribers' : 'pe.dmFollowers')} ({a === 'subscribers' ? subscribers : followers})
                    </button>
                ))}
            </div>
            <textarea
                value={form.data.body}
                onChange={(e) => form.setData('body', e.target.value)}
                rows={3}
                maxLength={2000}
                placeholder={t('mm.placeholder')}
                className="placeholder:text-muted-foreground bg-muted focus:ring-primary/25 mt-3 w-full resize-none rounded-xl px-3.5 py-2.5 text-[15px] outline-none focus:ring-2"
            />
            <PickedThumbs picked={picked} onRemove={(id) => setPicked((p) => p.filter((x) => x.id !== id))} className="mt-2" />
            <MediaThumbs
                files={form.data.media}
                onRemove={(i) =>
                    form.setData(
                        'media',
                        form.data.media.filter((_, j) => j !== i),
                    )
                }
                className="mt-2"
            />
            <InputError message={form.errors.body} />
            {hasMedia && (
                <div className="mt-2 flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setPpv(!ppv)}
                        className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-sm font-semibold transition ${ppv ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300' : 'bg-muted text-muted-foreground hover:text-foreground'}`}
                    >
                        <Lock className="size-3.5" /> {t('ppv.lockMedia')}
                    </button>
                    {ppv && <PriceField value={form.data.price} onChange={(v) => form.setData('price', v)} />}
                </div>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                    type="button"
                    onClick={() => files.current?.click()}
                    className="hover:bg-muted inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-emerald-600 transition dark:text-emerald-400"
                >
                    <ImagePlus className="size-[18px]" /> {t('st.addMedia')}
                </button>
                <input
                    ref={files}
                    type="file"
                    multiple
                    accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
                    className="hidden"
                    onChange={(e) => {
                        form.setData('media', [...form.data.media, ...Array.from(e.target.files ?? [])].slice(0, 10 - picked.length));
                        e.target.value = '';
                    }}
                />
                <LibraryButton
                    picked={picked}
                    onChange={setPicked}
                    max={10 - form.data.media.length}
                    className="hover:bg-muted inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-violet-600 transition dark:text-violet-400"
                />
                {sent !== null && !form.isDirty && <span className="text-sm font-semibold text-emerald-600">{t('mm.sent', { n: sent })}</span>}
                <button
                    type="submit"
                    className="bg-primary text-primary-foreground ml-auto inline-flex h-9 items-center gap-2 rounded-full px-4 text-sm font-bold transition hover:brightness-110 disabled:opacity-40"
                    disabled={
                        form.processing || count === 0 || (!form.data.body.trim() && !hasMedia) || (priced && !priceOk(form.data.price, ppvLimits))
                    }
                    onClick={async (e) => {
                        e.preventDefault();
                        const form = e.currentTarget.form;
                        if (await ask({ message: t('mm.confirm', { n: count }), confirm: t('mm.send', { n: count }), cancel: t('dlg.cancel') }))
                            form?.requestSubmit();
                    }}
                >
                    {form.processing && <LoaderCircle className="size-4 animate-spin" />}
                    {t('mm.send', { n: count })}
                </button>
            </div>
        </form>
    );
}
