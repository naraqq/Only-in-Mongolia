import AdTargeting, { type Placement } from '@/components/ad-targeting';
import DateTimePicker from '@/components/date-time-picker';
import InputError from '@/components/input-error';
import { Banner } from '@/components/sponsored';
import BusinessLayout from '@/layouts/business-layout';
import { mnt } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { useForm } from '@inertiajs/react';
import { Film, ImagePlus, LoaderCircle, QrCode, ShieldCheck, Wallet } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';

const field = 'bg-muted focus:ring-primary/30 h-11 w-full rounded-xl px-3 text-sm outline-none focus:ring-2';
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Days from $start to $end, both counted (as the server counts them). */
function daysBetween(start: string, end: string): number {
    if (!start || !end) return 0;
    const ms = new Date(`${end}T00:00:00`).getTime() - new Date(`${start}T00:00:00`).getTime();
    return ms < 0 ? 0 : Math.round(ms / 86_400_000) + 1;
}

/**
 * Business → New campaign: the banner (a picture, or a short video that plays muted in the column), its link and
 * dates, a live preview, and the price (days × the daily price). It's paid now and runs once an admin approves it.
 */
export default function NewCampaign({
    company,
    dailyPrice,
    maxDays,
    videoMaxSeconds,
    videoMaxMb,
    balance,
}: {
    company: { name: string; logo: string | null };
    dailyPrice: number;
    maxDays: number;
    videoMaxSeconds: number;
    videoMaxMb: number;
    balance: number;
}) {
    const { t } = useT();
    const today = new Date();
    const week = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 6);
    const form = useForm({
        title: '',
        body: '',
        url: 'https://',
        starts_on: iso(today),
        ends_on: iso(week),
        media: null as File | null,
        placement: 'all' as Placement,
        frequency_cap: null as number | null,
        allow_adult: false as boolean,
        pay: (balance > 0 ? 'wallet' : 'qpay') as 'wallet' | 'qpay',
    });
    const [mediaError, setMediaError] = useState<string | null>(null);
    const isVideo = !!form.data.media?.type.startsWith('video/');
    const mediaUrl = useMemo(() => (form.data.media ? URL.createObjectURL(form.data.media) : null), [form.data.media]);
    useEffect(() => () => void (mediaUrl && URL.revokeObjectURL(mediaUrl)), [mediaUrl]);

    const days = daysBetween(form.data.starts_on, form.data.ends_on);
    const price = days * dailyPrice;
    const tooLong = days > maxDays;
    const walletShort = form.data.pay === 'wallet' && balance < price;

    function pick(file: File | null) {
        setMediaError(null);
        if (!file) return form.setData('media', null);
        if (file.type.startsWith('video/')) {
            if (file.size > videoMaxMb * 1024 * 1024) return setMediaError(t('biz.videoTooBig', { mb: videoMaxMb }));
            // Check the length in the browser first; the server checks again.
            const probe = document.createElement('video');
            probe.preload = 'metadata';
            probe.onloadedmetadata = () => {
                URL.revokeObjectURL(probe.src);
                if (Number.isFinite(probe.duration) && probe.duration > videoMaxSeconds + 0.5)
                    setMediaError(t('biz.videoTooLong', { s: videoMaxSeconds }));
                else form.setData('media', file);
            };
            probe.onerror = () => form.setData('media', file);
            probe.src = URL.createObjectURL(file);
            return;
        }
        if (file.size > 5 * 1024 * 1024) return setMediaError(t('biz.imageTooBig'));
        form.setData('media', file);
    }

    function submit(e: FormEvent) {
        e.preventDefault();
        form.post(route('business.campaigns.store'), { forceFormData: true });
    }

    const domain = (() => {
        try {
            return new URL(form.data.url).hostname.replace(/^www\./, '');
        } catch {
            return '';
        }
    })();

    return (
        <BusinessLayout title={t('biz.newCampaign')} subtitle={t('biz.newSub')}>
            <form onSubmit={submit} className="mx-auto grid max-w-5xl gap-5 lg:grid-cols-[1fr_300px]">
                <div className="flex flex-col gap-5">
                    <section className="bg-card flex flex-col gap-4 rounded-2xl p-5 shadow-xs">
                        <h2 className="font-bold">{t('biz.banner')}</h2>
                        <label className="group bg-muted border-border hover:border-primary/50 relative flex aspect-[6/5] max-w-sm cursor-pointer items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed">
                            {mediaUrl ? (
                                isVideo ? (
                                    <video src={mediaUrl} muted loop autoPlay playsInline className="size-full object-cover" />
                                ) : (
                                    <img src={mediaUrl} alt="" className="size-full object-cover" />
                                )
                            ) : (
                                <span className="text-muted-foreground flex flex-col items-center gap-2 p-4 text-center text-sm">
                                    <span className="flex gap-2">
                                        <ImagePlus className="size-6" />
                                        <Film className="size-6" />
                                    </span>
                                    <span className="font-semibold">{t('biz.pickMedia')}</span>
                                </span>
                            )}
                            <input
                                type="file"
                                accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
                                className="hidden"
                                onChange={(e) => pick(e.target.files?.[0] ?? null)}
                            />
                        </label>
                        <p className="text-muted-foreground text-xs">{t('biz.mediaHint', { s: videoMaxSeconds, mb: videoMaxMb })}</p>
                        <InputError message={mediaError ?? form.errors.media} />

                        <Field label={t('ads.headline')} error={form.errors.title}>
                            <input
                                className={field}
                                value={form.data.title}
                                maxLength={90}
                                required
                                onChange={(e) => form.setData('title', e.target.value)}
                            />
                        </Field>
                        <Field label={t('ads.text')} error={form.errors.body}>
                            <input className={field} value={form.data.body} maxLength={160} onChange={(e) => form.setData('body', e.target.value)} />
                        </Field>
                        <Field label={t('biz.linkLabel')} hint={t('biz.linkHint')} error={form.errors.url}>
                            <input
                                className={field}
                                type="url"
                                required
                                value={form.data.url}
                                onChange={(e) => form.setData('url', e.target.value)}
                            />
                        </Field>
                    </section>

                    <section className="bg-card flex flex-col gap-4 rounded-2xl p-5 shadow-xs">
                        <h2 className="font-bold">{t('biz.when')}</h2>
                        <div className="grid grid-cols-2 gap-3">
                            <Field label={t('ads.starts')} error={form.errors.starts_on}>
                                <DateTimePicker
                                    mode="date"
                                    value={form.data.starts_on}
                                    onChange={(v) => form.setData('starts_on', v)}
                                    className="block"
                                />
                            </Field>
                            <Field label={t('ads.ends')} error={form.errors.ends_on}>
                                <DateTimePicker
                                    mode="date"
                                    value={form.data.ends_on}
                                    onChange={(v) => form.setData('ends_on', v)}
                                    className="block"
                                />
                            </Field>
                        </div>
                        {tooLong && <p className="text-sm text-red-600">{t('biz.maxDays', { n: maxDays })}</p>}
                    </section>

                    <section className="bg-card flex flex-col gap-4 rounded-2xl p-5 shadow-xs">
                        <h2 className="font-bold">{t('tg.title')}</h2>
                        <AdTargeting
                            placement={form.data.placement}
                            frequencyCap={form.data.frequency_cap}
                            allowAdult={form.data.allow_adult}
                            onChange={(c) => form.setData((d) => ({ ...d, ...c }))}
                        />
                        <InputError message={form.errors.placement ?? form.errors.frequency_cap} />
                    </section>

                    <section className="bg-card flex flex-col gap-3 rounded-2xl p-5 shadow-xs">
                        <h2 className="font-bold">{t('biz.payWith')}</h2>
                        <div className="grid gap-2 sm:grid-cols-2">
                            <PayOption
                                active={form.data.pay === 'qpay'}
                                onClick={() => form.setData('pay', 'qpay')}
                                icon={<QrCode className="size-5" />}
                                title="QPay"
                                sub={t('biz.payQpay')}
                            />
                            <PayOption
                                active={form.data.pay === 'wallet'}
                                onClick={() => form.setData('pay', 'wallet')}
                                icon={<Wallet className="size-5" />}
                                title={t('wal.title')}
                                sub={t('biz.payWallet', { amount: mnt(balance) })}
                            />
                        </div>
                        {walletShort && <p className="text-sm text-amber-700 dark:text-amber-300">{t('biz.walletShort')}</p>}
                        <InputError message={form.errors.pay} />
                    </section>
                </div>

                <aside className="flex flex-col gap-4 lg:sticky lg:top-24 lg:self-start">
                    <div>
                        <p className="text-muted-foreground mb-2 text-xs font-semibold">{t('ads.preview')}</p>
                        <Banner
                            preview
                            ad={{
                                id: 0,
                                advertiser: company.name,
                                title: form.data.title || t('ads.headline'),
                                body: form.data.body || null,
                                image: isVideo ? null : mediaUrl,
                                video: isVideo ? mediaUrl : null,
                                href: form.data.url,
                                domain,
                            }}
                        />
                    </div>
                    <div className="bg-card flex flex-col gap-2 rounded-2xl p-4 text-sm shadow-xs">
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">{t('biz.perDay')}</span>
                            <span className="font-semibold tabular-nums">{mnt(dailyPrice)}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">{t('biz.days')}</span>
                            <span className="font-semibold tabular-nums">{days}</span>
                        </div>
                        <div className="border-border mt-1 flex items-baseline justify-between border-t pt-2">
                            <span className="font-bold">{t('biz.total')}</span>
                            <span className="text-xl font-extrabold tabular-nums">{mnt(price)}</span>
                        </div>
                        <button
                            type="submit"
                            disabled={form.processing || !form.data.media || !!mediaError || tooLong || days === 0 || walletShort}
                            className="bg-primary text-primary-foreground disabled:bg-muted disabled:text-muted-foreground mt-2 inline-flex h-12 items-center justify-center gap-2 rounded-xl font-bold transition hover:brightness-110"
                        >
                            {form.processing && <LoaderCircle className="size-4 animate-spin" />}
                            {t('biz.payAndSubmit', { amount: mnt(price) })}
                        </button>
                        <p className="text-muted-foreground flex items-start gap-1.5 text-xs">
                            <ShieldCheck className="mt-0.5 size-3.5 shrink-0" /> {t('biz.reviewNote')}
                        </p>
                    </div>
                </aside>
            </form>
        </BusinessLayout>
    );
}

function PayOption({ active, onClick, icon, title, sub }: { active: boolean; onClick: () => void; icon: ReactNode; title: string; sub: string }) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            className={`flex items-center gap-3 rounded-xl border-2 p-3 text-left transition ${active ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'}`}
        >
            <span className={`grid size-10 place-items-center rounded-lg ${active ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>{icon}</span>
            <span className="min-w-0">
                <span className="block text-sm font-bold">{title}</span>
                <span className="text-muted-foreground block truncate text-xs">{sub}</span>
            </span>
        </button>
    );
}

function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
    return (
        <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold">{label}</span>
            {children}
            {hint && <span className="text-muted-foreground text-xs">{hint}</span>}
            <InputError message={error} />
        </label>
    );
}
