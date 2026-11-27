import DateTimePicker from '@/components/date-time-picker';
import InputError from '@/components/input-error';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import AdminLayout from '@/layouts/admin-layout';
import { ask } from '@/lib/confirm';
import { useT, type TKey } from '@/lib/i18n';
import { router, useForm } from '@inertiajs/react';
import { Download, ExternalLink, Eye, ImagePlus, Megaphone, MousePointerClick, Pause, Pencil, Play, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';

type Status = 'running' | 'scheduled' | 'ended' | 'paused';
type Ad = {
    id: number;
    advertiser: string;
    title: string;
    body: string | null;
    url: string;
    active: boolean;
    weight: number;
    allow_adult: boolean;
    starts_on: string;
    ends_on: string | null;
    image: string;
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
};

const num = (n: number) => n.toLocaleString('en-US');
const rate = (clicks: number, views: number) => (views ? `${((clicks / views) * 100).toFixed(2)}%` : '—');
const day = (d: string | null) => (d ? d.replaceAll('-', '.') : '');

/** Admin → Sponsored: other companies' banners in the right-hand column, and how each did. */
export default function AdminAds({ ads, days, contact }: { ads: Ad[]; days: number; contact: string | null }) {
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

                {!contact && <p className="rounded-xl bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">{t('ads.noContact')}</p>}

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
                                <img src={ad.image} alt="" className="aspect-[6/5] w-32 shrink-0 rounded-xl object-cover sm:w-40" />
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
                                        {ad.allow_adult && ' · 18+'}
                                    </p>
                                    <div className="mt-auto grid grid-cols-3 gap-2 pt-2 text-sm">
                                        <Stat label={t('ads.views')} value={num(ad.impressions)} />
                                        <Stat label={t('ads.clicks')} value={num(ad.clicks)} />
                                        <Stat label={t('ads.ctr')} value={rate(ad.clicks, ad.impressions)} />
                                    </div>
                                    <div className="mt-2 flex flex-wrap items-center gap-1">
                                        <SmallButton icon={Pencil} label={t('ads.edit')} onClick={() => setEditing(ad)} />
                                        <SmallButton
                                            icon={ad.active ? Pause : Play}
                                            label={t(ad.active ? 'ads.pause' : 'ads.resume')}
                                            onClick={() => router.post(route('admin.ads.toggle', ad.id), {}, { preserveScroll: true })}
                                        />
                                        <a
                                            href={route('admin.ads.report', ad.id)}
                                            className="text-muted-foreground hover:bg-muted hover:text-foreground inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-xs font-semibold"
                                        >
                                            <Download className="size-3.5" /> {t('ads.report')}
                                        </a>
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
        active: true as boolean,
        image: null as File | null,
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
            active: existing?.active ?? true,
            image: null,
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ad]);

    const preview = useMemo(() => (form.data.image ? URL.createObjectURL(form.data.image) : (existing?.image ?? null)), [form.data.image, existing]);

    function submit(e: FormEvent) {
        e.preventDefault();
        form.transform((d) => ({ ...d, ends_on: d.ends_on || null, ...(d.image ? {} : { image: undefined }) }));
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
                        <label className="flex items-start gap-2 text-sm">
                            <input
                                type="checkbox"
                                className="mt-1"
                                checked={form.data.allow_adult}
                                onChange={(e) => form.setData('allow_adult', e.target.checked)}
                            />
                            <span>
                                <span className="font-semibold">{t('ads.allowAdult')}</span>
                                <span className="text-muted-foreground block text-xs">{t('ads.allowAdultHint')}</span>
                            </span>
                        </label>
                    </div>

                    <div className="flex flex-col gap-2">
                        <p className="text-sm font-semibold">{t('ads.banner')}</p>
                        <label className="group bg-muted border-border hover:border-primary/50 relative block aspect-[6/5] cursor-pointer overflow-hidden rounded-xl border-2 border-dashed">
                            {preview ? (
                                <img src={preview} alt="" className="size-full object-cover" />
                            ) : (
                                <span className="text-muted-foreground absolute inset-0 flex flex-col items-center justify-center gap-1 text-xs">
                                    <ImagePlus className="size-6" /> {t('ads.pickImage')}
                                </span>
                            )}
                            <input
                                type="file"
                                accept="image/jpeg,image/png,image/webp"
                                className="hidden"
                                onChange={(e) => form.setData('image', e.target.files?.[0] ?? null)}
                            />
                        </label>
                        <p className="text-muted-foreground text-xs">{t('ads.imageHint')}</p>
                        <InputError message={form.errors.image} />
                        <p className="text-muted-foreground mt-2 text-xs font-semibold">{t('ads.preview')}</p>
                        <div className="bg-card border-border overflow-hidden rounded-2xl border">
                            <div className="bg-muted aspect-[6/5]">{preview && <img src={preview} alt="" className="size-full object-cover" />}</div>
                            <div className="p-2.5">
                                <p className="line-clamp-2 text-xs font-bold">{form.data.title || t('ads.headline')}</p>
                                <p className="text-muted-foreground truncate text-[10px]">{form.data.advertiser || t('ads.advertiser')}</p>
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end gap-2 md:col-span-2">
                        <button type="button" onClick={onClose} className="hover:bg-muted h-10 rounded-full px-4 text-sm font-semibold">
                            {t('dlg.cancel')}
                        </button>
                        <button
                            type="submit"
                            disabled={form.processing || (!existing && !form.data.image)}
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
