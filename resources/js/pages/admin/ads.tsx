import AdTargeting, { targetingSummary, type Placement } from '@/components/ad-targeting';
import DateTimePicker from '@/components/date-time-picker';
import InputError from '@/components/input-error';
import { Banner } from '@/components/sponsored';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import AdminLayout from '@/layouts/admin-layout';
import { ask } from '@/lib/confirm';
import { mnt } from '@/lib/format';
import { useT, type TKey } from '@/lib/i18n';
import { router, useForm, usePage } from '@inertiajs/react';
import {
    Building2,
    Check,
    Download,
    ExternalLink,
    Eye,
    Film,
    ImagePlus,
    Megaphone,
    MousePointerClick,
    Pause,
    Pencil,
    Play,
    Plus,
    ReceiptText,
    Trash2,
    X,
} from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';

type Status = 'running' | 'scheduled' | 'ended' | 'paused' | 'rejected';
type Ad = {
    id: number;
    advertiser: string;
    title: string;
    body: string | null;
    url: string;
    active: boolean;
    weight: number;
    allow_adult: boolean;
    placement: Placement;
    frequency_cap: number | null;
    starts_on: string;
    ends_on: string | null;
    image: string | null;
    video: string | null;
    poster: string | null;
    company: string | null;
    price: number | null;
    reject_reason: string | null;
    receipt: { id: number; number: string; ebarimt: 'none' | 'pending' | 'issued' | 'failed' | 'returned' } | null;
    status: Status;
    impressions: number;
    clicks: number;
    total_impressions: number;
    total_clicks: number;
};

const STATUS: Record<Status, [TKey, string]> = {
    running: ['ads.running', 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'],
    scheduled: ['ads.scheduled', 'bg-sky-500/15 text-sky-600 dark:text-sky-400'],
    ended: ['ads.ended', 'bg-muted text-muted-foreground'],
    paused: ['ads.paused', 'bg-amber-500/15 text-amber-600 dark:text-amber-400'],
    rejected: ['ads.rejected', 'bg-red-500/15 text-red-600 dark:text-red-400'],
};

/** A company's paid campaign waiting for review. */
type Review = {
    id: number;
    title: string;
    body: string | null;
    url: string;
    advertiser: string;
    price: number | null;
    starts_on: string;
    ends_on: string | null;
    days: number | null;
    image: string | null;
    video: string | null;
    poster: string | null;
    domain: string;
    submitted_at: string | null;
    past_start: boolean;
    placement: Placement;
    frequency_cap: number | null;
    allow_adult: boolean;
    company: {
        name: string;
        register_number: string;
        email: string;
        website: string | null;
        logo: string | null;
        contact: string | null;
        phone: string | null;
    } | null;
};

const num = (n: number) => n.toLocaleString('en-US');
const rate = (clicks: number, views: number) => (views ? `${((clicks / views) * 100).toFixed(2)}%` : '—');
const day = (d: string | null) => (d ? d.replaceAll('-', '.') : '');

/** Admin → Sponsored: other companies' banners in the right-hand column, and how each did. */
export default function AdminAds({ ads, review, days }: { ads: Ad[]; review: Review[]; days: number }) {
    const { t } = useT();
    const [editing, setEditing] = useState<Ad | 'new' | null>(null);
    const running = ads.filter((a) => a.status === 'running');
    const views = ads.reduce((s, a) => s + a.impressions, 0);
    const clicks = ads.reduce((s, a) => s + a.clicks, 0);

    async function remove(ad: Ad) {
        if (await ask({ message: t('ads.deleteConfirm', { name: ad.advertiser }), confirm: t('po.delete'), cancel: t('dlg.cancel'), danger: true })) {
            router.delete(route('admin.ads.destroy', ad.id), { preserveScroll: true });
        }
    }

    return (
        <AdminLayout
            title={t('ads.title')}
            subtitle={t('ads.sub')}
            actions={
                <button
                    type="button"
                    onClick={() => setEditing('new')}
                    className="bg-primary text-primary-foreground inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-bold transition hover:brightness-110"
                >
                    <Plus className="size-4" /> {t('ads.new')}
                </button>
            }
        >
            <div className="flex flex-col gap-5">
                <div className="flex flex-wrap items-center gap-3">
                    <div className="grid flex-1 grid-cols-3 gap-3">
                        <Tile icon={Megaphone} label={t('ads.runningNow')} value={num(running.length)} />
                        <Tile icon={Eye} label={t('ads.views')} value={num(views)} sub={t('ins.days', { n: days })} />
                        <Tile icon={MousePointerClick} label={t('ads.clicks')} value={num(clicks)} sub={`${t('ads.ctr')} ${rate(clicks, views)}`} />
                    </div>
                    <div className="bg-muted inline-flex rounded-full p-1">
                        {[7, 30, 90].map((d) => (
                            <button
                                key={d}
                                type="button"
                                onClick={() => router.get(route('admin.ads'), { days: d }, { preserveScroll: true, preserveState: true })}
                                className={`h-8 rounded-full px-3 text-sm font-semibold transition ${days === d ? 'bg-card shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                            >
                                {t('ins.days', { n: d })}
                            </button>
                        ))}
                    </div>
                </div>

                {review.length > 0 && (
                    <section className="flex flex-col gap-3">
                        <h2 className="flex items-center gap-2 text-sm font-bold">
                            {t('ads.toReview')}
                            <span className="bg-primary text-primary-foreground rounded-full px-2 py-0.5 text-[11px]">{review.length}</span>
                        </h2>
                        <ul className="grid gap-3 xl:grid-cols-2">
                            {review.map((c) => (
                                <ReviewCard key={c.id} c={c} />
                            ))}
                        </ul>
                    </section>
                )}

                {ads.length === 0 ? (
                    <button
                        type="button"
                        onClick={() => setEditing('new')}
                        className="bg-card border-border hover:border-primary/50 flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed p-12 text-center transition"
                    >
                        <span className="bg-muted grid size-14 place-items-center rounded-2xl">
                            <Megaphone className="text-muted-foreground size-6" />
                        </span>
                        <span className="font-bold">{t('ads.empty')}</span>
                        <span className="text-muted-foreground max-w-md text-sm">{t('ads.emptyHint')}</span>
                    </button>
                ) : (
                    <ul className="grid gap-3 xl:grid-cols-2">
                        {ads.map((ad) => (
                            <li key={ad.id} className="bg-card flex gap-4 overflow-hidden rounded-2xl p-3 shadow-xs">
                                <div className="relative aspect-[6/5] w-32 shrink-0 overflow-hidden rounded-xl bg-zinc-200 sm:w-40 dark:bg-zinc-800">
                                    {ad.poster && <img src={ad.poster} alt="" className="size-full object-cover" />}
                                    {ad.video && (
                                        <span className="absolute bottom-1.5 left-1.5 inline-flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-white">
                                            <Film className="size-3" /> {t('biz.video')}
                                        </span>
                                    )}
                                </div>
                                <div className="flex min-w-0 flex-1 flex-col">
                                    <div className="flex items-start gap-2">
                                        <div className="min-w-0 flex-1">
                                            <p className="text-muted-foreground truncate text-xs font-semibold">{ad.advertiser}</p>
                                            <p className="truncate font-bold">{ad.title}</p>
                                        </div>
                                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS[ad.status][1]}`}>
                                            {t(STATUS[ad.status][0])}
                                        </span>
                                    </div>
                                    <p className="text-muted-foreground mt-0.5 text-xs">
                                        {day(ad.starts_on)} – {ad.ends_on ? day(ad.ends_on) : t('ads.noEnd')}
                                        {ad.weight > 1 && ` · ×${ad.weight}`}
                                        {ad.price ? ` · ${mnt(ad.price)}` : ''}
                                    </p>
                                    <p className="text-muted-foreground text-xs">{targetingSummary(t, ad)}</p>
                                    {ad.reject_reason && ad.status === 'rejected' && (
                                        <p className="mt-1 line-clamp-2 text-xs text-red-600 dark:text-red-400">{ad.reject_reason}</p>
                                    )}
                                    <div className="mt-auto grid grid-cols-3 gap-2 pt-2 text-sm">
                                        <Stat label={t('ads.views')} value={num(ad.impressions)} />
                                        <Stat label={t('ads.clicks')} value={num(ad.clicks)} />
                                        <Stat label={t('ads.ctr')} value={rate(ad.clicks, ad.impressions)} />
                                    </div>
                                    <div className="mt-2 flex flex-wrap items-center gap-1">
                                        {!ad.company && <SmallButton icon={Pencil} label={t('ads.edit')} onClick={() => setEditing(ad)} />}
                                        {ad.status !== 'rejected' && (
                                            <SmallButton
                                                icon={ad.active ? Pause : Play}
                                                label={t(ad.active ? 'ads.pause' : 'ads.resume')}
                                                onClick={() => router.post(route('admin.ads.toggle', ad.id), {}, { preserveScroll: true })}
                                            />
                                        )}
                                        <a
                                            href={route('admin.ads.report', ad.id)}
                                            className="text-muted-foreground hover:bg-muted hover:text-foreground inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-xs font-semibold"
                                        >
                                            <Download className="size-3.5" /> {t('ads.report')}
                                        </a>
                                        {ad.receipt && (
                                            <a
                                                href={route('admin.receipts.show', ad.receipt.id)}
                                                className="text-muted-foreground hover:bg-muted hover:text-foreground inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-xs font-semibold"
                                                title={ad.receipt.number}
                                            >
                                                <ReceiptText className="size-3.5" /> {ad.receipt.number}
                                                {ad.receipt.ebarimt === 'failed' && (
                                                    <span className="rounded bg-red-500/15 px-1 text-[10px] font-bold text-red-600">
                                                        {t('biz.ebarimtFailed')}
                                                    </span>
                                                )}
                                            </a>
                                        )}
                                        <a
                                            href={ad.url}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="text-muted-foreground hover:bg-muted hover:text-foreground grid size-8 place-items-center rounded-full"
                                            title={ad.url}
                                        >
                                            <ExternalLink className="size-3.5" />
                                        </a>
                                        <button
                                            type="button"
                                            onClick={() => void remove(ad)}
                                            className="text-muted-foreground ml-auto grid size-8 place-items-center rounded-full hover:bg-red-500/10 hover:text-red-600"
                                            aria-label={t('po.delete')}
                                        >
                                            <Trash2 className="size-3.5" />
                                        </button>
                                    </div>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            <AdForm ad={editing} onClose={() => setEditing(null)} />
        </AdminLayout>
    );
}

/** A paid campaign to approve (it runs on its dates) or reject (with a reason the company sees; it's refunded). */
function ReviewCard({ c }: { c: Review }) {
    const { t } = useT();
    const [rejecting, setRejecting] = useState(false);
    const form = useForm({ reason: '' });

    function reject(e: FormEvent) {
        e.preventDefault();
        form.post(route('admin.ads.reject', c.id), { preserveScroll: true });
    }

    return (
        <li className="bg-card ring-primary/30 flex flex-col gap-3 rounded-2xl p-3 shadow-xs ring-1 sm:flex-row">
            <div className="w-full shrink-0 sm:w-56">
                <Banner
                    preview
                    ad={{
                        id: c.id,
                        advertiser: c.advertiser,
                        title: c.title,
                        body: c.body,
                        image: c.poster,
                        video: c.video,
                        href: c.url,
                        domain: c.domain,
                    }}
                />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-2 text-sm">
                {c.company && (
                    <div className="flex items-center gap-2">
                        {c.company.logo ? (
                            <img src={c.company.logo} alt="" className="size-8 rounded-lg object-cover" />
                        ) : (
                            <span className="bg-muted grid size-8 place-items-center rounded-lg">
                                <Building2 className="text-muted-foreground size-4" />
                            </span>
                        )}
                        <div className="min-w-0">
                            <p className="truncate font-bold">{c.company.name}</p>
                            <p className="text-muted-foreground truncate text-xs">
                                {t('biz.registerShort')} {c.company.register_number} · {c.company.email}
                                {c.company.phone && ` · ${c.company.phone}`}
                            </p>
                        </div>
                    </div>
                )}
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                    <dt className="text-muted-foreground">{t('biz.dates')}</dt>
                    <dd className="font-semibold">
                        {day(c.starts_on)} – {day(c.ends_on)} ({t('biz.nDays', { n: c.days ?? 0 })})
                    </dd>
                    <dt className="text-muted-foreground">{t('tg.title')}</dt>
                    <dd className="font-semibold">{targetingSummary(t, c)}</dd>
                    <dt className="text-muted-foreground">{t('biz.paid')}</dt>
                    <dd className="font-semibold">{c.price ? mnt(c.price) : '—'}</dd>
                    <dt className="text-muted-foreground">{t('ads.link')}</dt>
                    <dd className="truncate">
                        <a href={c.url} target="_blank" rel="noreferrer" className="text-primary font-semibold hover:underline">
                            {c.domain}
                        </a>
                    </dd>
                </dl>
                {c.past_start && (
                    <p className="rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-700 dark:text-amber-300">{t('ads.lateNote')}</p>
                )}
                {rejecting ? (
                    <form onSubmit={reject} className="mt-auto flex flex-col gap-2">
                        <textarea
                            value={form.data.reason}
                            onChange={(e) => form.setData('reason', e.target.value)}
                            maxLength={300}
                            rows={2}
                            autoFocus
                            placeholder={t('ads.rejectReason')}
                            className="border-input bg-background w-full rounded-xl border px-3 py-2 text-sm"
                        />
                        <InputError message={form.errors.reason} />
                        <div className="flex gap-2">
                            <button
                                type="submit"
                                disabled={form.processing || !form.data.reason.trim()}
                                className="inline-flex h-9 items-center gap-1.5 rounded-full bg-red-600 px-4 text-xs font-bold text-white transition hover:bg-red-700 disabled:opacity-50"
                            >
                                <X className="size-4" /> {t('ads.rejectRefund')}
                            </button>
                            <button
                                type="button"
                                onClick={() => setRejecting(false)}
                                className="text-muted-foreground h-9 px-3 text-xs font-semibold"
                            >
                                {t('dlg.cancel')}
                            </button>
                        </div>
                    </form>
                ) : (
                    <div className="mt-auto flex gap-2">
                        <button
                            type="button"
                            onClick={() => router.post(route('admin.ads.approve', c.id), {}, { preserveScroll: true })}
                            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-emerald-600 px-4 text-xs font-bold text-white transition hover:bg-emerald-700"
                        >
                            <Check className="size-4" /> {t('ads.approve')}
                        </button>
                        <button
                            type="button"
                            onClick={() => setRejecting(true)}
                            className="text-muted-foreground hover:bg-muted inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-xs font-bold"
                        >
                            <X className="size-4" /> {t('ads.reject')}
                        </button>
                    </div>
                )}
            </div>
        </li>
    );
}

function Tile({ icon: Icon, label, value, sub }: { icon: typeof Eye; label: string; value: string; sub?: string }) {
    return (
        <div className="bg-card rounded-2xl p-4 shadow-xs">
            <p className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
                <Icon className="size-3.5" /> {label}
            </p>
            <p className="mt-1 text-2xl font-extrabold tabular-nums">{value}</p>
            {sub && <p className="text-muted-foreground text-xs">{sub}</p>}
        </div>
    );
}

function Stat({ label, value }: { label: string; value: string }) {
    return (
        <div className="bg-muted/60 rounded-lg px-2 py-1.5">
            <p className="text-muted-foreground text-[10px]">{label}</p>
            <p className="font-bold tabular-nums">{value}</p>
        </div>
    );
}

function SmallButton({ icon: Icon, label, onClick }: { icon: typeof Eye; label: string; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="text-muted-foreground hover:bg-muted hover:text-foreground inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-xs font-semibold"
        >
            <Icon className="size-3.5" /> {label}
        </button>
    );
}

/** Create or edit a banner, with a live preview of how it will look in the column. */
function AdForm({ ad, onClose }: { ad: Ad | 'new' | null; onClose: () => void }) {
    const { t } = useT();
    const limits = usePage<{ videoMaxSeconds: number; videoMaxMb: number }>().props;
    const existing = ad && ad !== 'new' ? ad : null;
    const today = new Date().toISOString().slice(0, 10);
    const form = useForm({
        advertiser: '',
        title: '',
        body: '',
        url: 'https://',
        starts_on: today,
        ends_on: '',
        weight: 1,
        allow_adult: false as boolean,
        placement: 'all' as Placement,
        frequency_cap: null as number | null,
        active: true as boolean,
        media: null as File | null,
    });

    useEffect(() => {
        if (!ad) return;
        form.clearErrors();
        form.setData({
            advertiser: existing?.advertiser ?? '',
            title: existing?.title ?? '',
            body: existing?.body ?? '',
            url: existing?.url ?? 'https://',
            starts_on: existing?.starts_on ?? today,
            ends_on: existing?.ends_on ?? '',
            weight: existing?.weight ?? 1,
            allow_adult: existing?.allow_adult ?? false,
            placement: existing?.placement ?? 'all',
            frequency_cap: existing?.frequency_cap ?? null,
            active: existing?.active ?? true,
            media: null,
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ad]);

    // What the banner shows: the newly chosen file, or what it has now (a video with its still, or a picture).
    const picked = useMemo(() => (form.data.media ? URL.createObjectURL(form.data.media) : null), [form.data.media]);
    useEffect(() => () => void (picked && URL.revokeObjectURL(picked)), [picked]);
    const pickedVideo = !!form.data.media?.type.startsWith('video/');
    const preview = picked ? (pickedVideo ? null : picked) : (existing?.poster ?? existing?.image ?? null);
    const previewVideo = picked ? (pickedVideo ? picked : null) : (existing?.video ?? null);

    function submit(e: FormEvent) {
        e.preventDefault();
        form.transform((d) => ({ ...d, ends_on: d.ends_on || null, ...(d.media ? {} : { media: undefined }) }));
        const options = { forceFormData: true, preserveScroll: true, onSuccess: onClose };
        if (existing) form.post(route('admin.ads.update', existing.id), options);
        else form.post(route('admin.ads.store'), options);
    }

    const field = 'bg-muted focus:ring-primary/30 h-10 w-full rounded-xl px-3 text-sm outline-none focus:ring-2';

    return (
        <Dialog open={!!ad} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-h-[92svh] max-w-3xl overflow-y-auto sm:max-w-3xl">
                <DialogTitle>{t(existing ? 'ads.editTitle' : 'ads.new')}</DialogTitle>
                <form onSubmit={submit} className="grid gap-5 md:grid-cols-[1fr_260px]">
                    <div className="flex flex-col gap-3">
                        <Field label={t('ads.advertiser')} error={form.errors.advertiser}>
                            <input
                                className={field}
                                value={form.data.advertiser}
                                maxLength={80}
                                onChange={(e) => form.setData('advertiser', e.target.value)}
                            />
                        </Field>
                        <Field label={t('ads.headline')} error={form.errors.title}>
                            <input className={field} value={form.data.title} maxLength={90} onChange={(e) => form.setData('title', e.target.value)} />
                        </Field>
                        <Field label={t('ads.text')} error={form.errors.body}>
                            <input className={field} value={form.data.body} maxLength={160} onChange={(e) => form.setData('body', e.target.value)} />
                        </Field>
                        <Field label={t('ads.link')} error={form.errors.url}>
                            <input className={field} type="url" value={form.data.url} onChange={(e) => form.setData('url', e.target.value)} />
                        </Field>
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
                                    clearable
                                    value={form.data.ends_on}
                                    onChange={(v) => form.setData('ends_on', v)}
                                    placeholder={t('ads.noEnd')}
                                    className="block"
                                />
                            </Field>
                        </div>
                        <Field label={t('ads.weight')} error={form.errors.weight} hint={t('ads.weightHint')}>
                            <div className="bg-muted inline-flex rounded-xl p-1">
                                {[1, 2, 3, 5].map((w) => (
                                    <button
                                        key={w}
                                        type="button"
                                        onClick={() => form.setData('weight', w)}
                                        className={`h-8 min-w-12 rounded-lg px-2 text-sm font-semibold ${form.data.weight === w ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}
                                    >
                                        ×{w}
                                    </button>
                                ))}
                            </div>
                        </Field>
                        <AdTargeting
                            placement={form.data.placement}
                            frequencyCap={form.data.frequency_cap}
                            allowAdult={form.data.allow_adult}
                            onChange={(c) => form.setData((d) => ({ ...d, ...c }))}
                        />
                    </div>

                    <div className="flex flex-col gap-2">
                        <p className="text-sm font-semibold">{t('biz.banner')}</p>
                        <label className="group bg-muted border-border hover:border-primary/50 relative block aspect-[6/5] cursor-pointer overflow-hidden rounded-xl border-2 border-dashed">
                            {previewVideo ? (
                                <video
                                    src={previewVideo}
                                    poster={preview ?? undefined}
                                    muted
                                    loop
                                    autoPlay
                                    playsInline
                                    className="size-full object-cover"
                                />
                            ) : preview ? (
                                <img src={preview} alt="" className="size-full object-cover" />
                            ) : (
                                <span className="text-muted-foreground absolute inset-0 flex flex-col items-center justify-center gap-1 text-xs">
                                    <span className="flex gap-1.5">
                                        <ImagePlus className="size-6" />
                                        <Film className="size-6" />
                                    </span>
                                    {t('biz.pickMedia')}
                                </span>
                            )}
                            <input
                                type="file"
                                accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
                                className="hidden"
                                onChange={(e) => form.setData('media', e.target.files?.[0] ?? null)}
                            />
                        </label>
                        <p className="text-muted-foreground text-xs">{t('biz.mediaHint', { s: limits.videoMaxSeconds, mb: limits.videoMaxMb })}</p>
                        <InputError message={form.errors.media} />
                        <p className="text-muted-foreground mt-2 text-xs font-semibold">{t('ads.preview')}</p>
                        <Banner
                            preview
                            ad={{
                                id: existing?.id ?? 0,
                                advertiser: form.data.advertiser || t('ads.advertiser'),
                                title: form.data.title || t('ads.headline'),
                                body: form.data.body || null,
                                image: preview,
                                video: previewVideo,
                                href: form.data.url,
                                domain: (() => {
                                    try {
                                        return new URL(form.data.url).hostname.replace(/^www\./, '');
                                    } catch {
                                        return '';
                                    }
                                })(),
                            }}
                        />
                    </div>

                    <div className="flex justify-end gap-2 md:col-span-2">
                        <button type="button" onClick={onClose} className="hover:bg-muted h-10 rounded-full px-4 text-sm font-semibold">
                            {t('dlg.cancel')}
                        </button>
                        <button
                            type="submit"
                            disabled={form.processing || (!existing && !form.data.media)}
                            className="bg-primary text-primary-foreground disabled:bg-muted disabled:text-muted-foreground h-10 rounded-full px-5 text-sm font-bold transition hover:brightness-110"
                        >
                            {t('pe.save')}
                        </button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}

function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: React.ReactNode }) {
    return (
        <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold">{label}</span>
            {children}
            {hint && <span className="text-muted-foreground text-xs">{hint}</span>}
            <InputError message={error} />
        </label>
    );
}
