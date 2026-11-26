import InputError from '@/components/input-error';
import StudioLayout from '@/layouts/studio-layout';
import { mnt } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { toast } from '@/lib/toast';
import { router, useForm, usePage } from '@inertiajs/react';
import { Copy, Gift, LoaderCircle, Plus, Ticket } from 'lucide-react';
import { useEffect, type FormEvent } from 'react';

type Code = {
    id: number;
    code: string;
    percent_off: number;
    max_uses: number | null;
    uses: number;
    active: boolean;
    expires_at: string | null;
    expired: boolean;
};

/** Studio → Promotions: a free trial for new subscribers, and discount codes to share. */
export default function Promotions({
    trialDays,
    trialChoices,
    trialsStarted,
    price,
    codes,
}: {
    trialDays: number | null;
    trialChoices: number[];
    trialsStarted: number;
    price: number;
    codes: Code[];
}) {
    const { t } = useT();
    const flash = usePage<{ flash?: { status?: string } }>().props.flash;
    useEffect(() => {
        if (flash?.status === 'saved') toast(t('pe.saved'), { tone: 'success' });
    }, [flash?.status, t]);

    return (
        <StudioLayout title={t('pro.title')} subtitle={t('pro.sub')}>
            <div className="mx-auto flex max-w-3xl flex-col gap-5">
                {/* Free trial */}
                <section className="bg-card rounded-2xl p-5 shadow-xs">
                    <div className="flex items-start gap-3">
                        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                            <Gift className="size-5" />
                        </span>
                        <div className="min-w-0 flex-1">
                            <h2 className="font-bold">{t('pro.trialTitle')}</h2>
                            <p className="text-muted-foreground text-sm">{t('pro.trialSub')}</p>
                        </div>
                        {trialsStarted > 0 && (
                            <span className="bg-muted shrink-0 rounded-full px-3 py-1 text-xs font-bold">
                                {t('pro.trialsStarted', { n: trialsStarted })}
                            </span>
                        )}
                    </div>
                    <div className="bg-muted mt-4 grid grid-cols-4 gap-1 rounded-2xl p-1">
                        {[null, ...trialChoices].map((d) => (
                            <button
                                key={d ?? 0}
                                type="button"
                                onClick={() => router.put(route('studio.trial'), { days: d }, { preserveScroll: true })}
                                className={`h-10 rounded-xl text-sm font-bold transition ${trialDays === d ? 'bg-card shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                            >
                                {d ? t('pro.days', { n: d }) : t('pro.off')}
                            </button>
                        ))}
                    </div>
                </section>

                {/* Codes */}
                <section className="bg-card rounded-2xl p-5 shadow-xs">
                    <div className="flex items-start gap-3">
                        <span className="bg-primary/10 text-primary grid size-11 shrink-0 place-items-center rounded-2xl">
                            <Ticket className="size-5" />
                        </span>
                        <div>
                            <h2 className="font-bold">{t('pro.codesTitle')}</h2>
                            <p className="text-muted-foreground text-sm">{t('pro.codesSub')}</p>
                        </div>
                    </div>
                    <NewCode price={price} />
                    {codes.length > 0 && (
                        <ul className="mt-5 flex flex-col gap-2">
                            {codes.map((c) => (
                                <CodeRow key={c.id} c={c} />
                            ))}
                        </ul>
                    )}
                </section>
            </div>
        </StudioLayout>
    );
}

function NewCode({ price }: { price: number }) {
    const { t } = useT();
    const form = useForm({ code: '', percent_off: 20, max_uses: '' as string | number, expires_at: '' });
    const field = 'bg-muted focus:ring-primary/30 h-11 w-full rounded-xl px-3.5 text-sm outline-none focus:ring-2';

    function submit(e: FormEvent) {
        e.preventDefault();
        form.transform((d) => ({ ...d, max_uses: d.max_uses || null, expires_at: d.expires_at || null }));
        form.post(route('studio.codes.store'), { preserveScroll: true, onSuccess: () => form.reset() });
    }

    return (
        <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-[1.3fr_0.8fr_0.8fr_1fr_auto] sm:items-end">
            <label className="block">
                <span className="mb-1 block text-xs font-semibold">{t('pro.code')}</span>
                <input
                    className={`${field} font-bold tracking-wider uppercase`}
                    value={form.data.code}
                    onChange={(e) =>
                        form.setData(
                            'code',
                            e.target.value
                                .replace(/[^A-Za-z0-9]/g, '')
                                .toUpperCase()
                                .slice(0, 24),
                        )
                    }
                    placeholder="SUMMER20"
                />
            </label>
            <label className="block">
                <span className="mb-1 block text-xs font-semibold">{t('pro.percent')}</span>
                <input
                    className={field}
                    inputMode="numeric"
                    value={form.data.percent_off || ''}
                    onChange={(e) => form.setData('percent_off', Math.min(90, Number(e.target.value.replace(/\D/g, '').slice(0, 2)) || 0))}
                />
            </label>
            <label className="block">
                <span className="mb-1 block text-xs font-semibold">{t('pro.maxUses')}</span>
                <input
                    className={field}
                    inputMode="numeric"
                    value={form.data.max_uses}
                    placeholder="∞"
                    onChange={(e) => form.setData('max_uses', e.target.value.replace(/\D/g, '').slice(0, 6))}
                />
            </label>
            <label className="block">
                <span className="mb-1 block text-xs font-semibold">{t('pro.until')}</span>
                <input type="date" className={field} value={form.data.expires_at} onChange={(e) => form.setData('expires_at', e.target.value)} />
            </label>
            <button
                type="submit"
                disabled={form.data.code.length < 3 || form.data.percent_off < 5 || form.processing}
                className="bg-primary text-primary-foreground inline-flex h-11 items-center justify-center gap-1.5 rounded-xl px-4 text-sm font-bold transition hover:brightness-110 disabled:opacity-40"
            >
                {form.processing ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />} {t('pro.create')}
            </button>
            <p className="text-muted-foreground text-xs sm:col-span-5">
                {form.data.percent_off >= 5 &&
                    t('pro.preview', { price: mnt(price), now: mnt(Math.floor((price * (100 - form.data.percent_off)) / 10000) * 100) })}
            </p>
            {Object.values(form.errors).map((e) => (
                <InputError key={e} message={e} className="sm:col-span-5" />
            ))}
        </form>
    );
}

function CodeRow({ c }: { c: Code }) {
    const { t } = useT();
    const live = c.active && !c.expired && (c.max_uses === null || c.uses < c.max_uses);

    return (
        <li className={`bg-muted/60 flex flex-wrap items-center gap-3 rounded-xl p-3 ${live ? '' : 'opacity-60'}`}>
            <button
                type="button"
                onClick={() => navigator.clipboard?.writeText(c.code).then(() => toast(t('stu.copied'), { tone: 'success' }))}
                className="bg-card inline-flex items-center gap-2 rounded-lg px-3 py-1.5 font-mono text-sm font-bold tracking-wider shadow-xs"
                title={t('stu.copy')}
            >
                {c.code} <Copy className="text-muted-foreground size-3.5" />
            </button>
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                −{c.percent_off}%
            </span>
            <span className="text-muted-foreground min-w-0 flex-1 text-xs">
                {t('pro.used', { n: c.uses })}
                {c.max_uses !== null && ` / ${c.max_uses}`}
                {c.expires_at && ` · ${t(c.expired ? 'pro.ended' : 'pro.ends', { date: c.expires_at.slice(0, 10).replaceAll('-', '.') })}`}
            </span>
            <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold">
                {t(c.active ? 'pro.on' : 'pro.off')}
                <input
                    type="checkbox"
                    className="peer sr-only"
                    checked={c.active}
                    onChange={() => router.post(route('studio.codes.toggle', c.id), {}, { preserveScroll: true })}
                />
                <span className="bg-muted-foreground/30 peer-checked:bg-primary relative h-6 w-11 rounded-full transition after:absolute after:top-0.5 after:left-0.5 after:size-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-5" />
            </label>
        </li>
    );
}
