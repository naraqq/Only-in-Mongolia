import BusinessLayout from '@/layouts/business-layout';
import { ask } from '@/lib/confirm';
import { mnt } from '@/lib/format';
import { useT, type TKey } from '@/lib/i18n';
import { Link, router, usePage } from '@inertiajs/react';
import { CreditCard, Download, ExternalLink, Eye, Film, Megaphone, MousePointerClick, Pause, Play, Plus, ReceiptText, Trash2 } from 'lucide-react';

type Status = 'unpaid' | 'review' | 'rejected' | 'running' | 'scheduled' | 'ended' | 'paused';
type Campaign = {
    id: number;
    title: string;
    body: string | null;
    url: string;
    price: number | null;
    active: boolean;
    reject_reason: string | null;
    status: Status;
    starts_on: string;
    ends_on: string | null;
    days: number | null;
    poster: string | null;
    video: string | null;
    domain: string;
    impressions: number;
    clicks: number;
    receipt: { id: number; number: string; ebarimt: 'none' | 'pending' | 'issued' | 'failed' | 'returned' } | null;
};

const STATUS: Record<Status, [TKey, string]> = {
    unpaid: ['biz.stUnpaid', 'bg-amber-500/15 text-amber-700 dark:text-amber-300'],
    review: ['biz.stReview', 'bg-violet-500/15 text-violet-600 dark:text-violet-300'],
    rejected: ['ads.rejected', 'bg-red-500/15 text-red-600 dark:text-red-400'],
    running: ['ads.running', 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'],
    scheduled: ['ads.scheduled', 'bg-sky-500/15 text-sky-600 dark:text-sky-400'],
    ended: ['ads.ended', 'bg-muted text-muted-foreground'],
    paused: ['ads.paused', 'bg-amber-500/15 text-amber-600 dark:text-amber-400'],
};

const num = (n: number) => n.toLocaleString('en-US');
const rate = (clicks: number, views: number) => (views ? `${((clicks / views) * 100).toFixed(2)}%` : '—');
const day = (d: string | null) => (d ? d.replaceAll('-', '.') : '');

/** Business → Campaigns: every banner the company bought, where it stands (paid, in review, running…) and how it did. */
export default function BusinessIndex({ campaigns }: { company: { name: string; logo: string | null }; campaigns: Campaign[]; dailyPrice: number }) {
    const { t } = useT();
    const { errors, flash } = usePage<{ errors: Record<string, string>; flash?: { status?: string } }>().props;
    const views = campaigns.reduce((s, c) => s + c.impressions, 0);
    const clicks = campaigns.reduce((s, c) => s + c.clicks, 0);
    const spent = campaigns.filter((c) => !['unpaid', 'rejected'].includes(c.status)).reduce((s, c) => s + (c.price ?? 0), 0);

    async function remove(c: Campaign) {
        if (await ask({ message: t('biz.deleteConfirm'), confirm: t('po.delete'), cancel: t('dlg.cancel'), danger: true })) {
            router.delete(route('business.campaigns.destroy', c.id), { preserveScroll: true });
        }
    }

    const newButton = (
        <Link
            href={route('business.campaigns.new')}
            className="bg-primary text-primary-foreground inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-bold transition hover:brightness-110"
        >
            <Plus className="size-4" /> {t('biz.newCampaign')}
        </Link>
    );

    return (
        <BusinessLayout title={t('biz.campaigns')} subtitle={t('biz.campaignsSub')} actions={newButton}>
            <div className="flex flex-col gap-5">
                {errors.payment && <p className="rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">{errors.payment}</p>}
                {flash?.status === 'ad-paid' && (
                    <p className="rounded-xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">{t('biz.paidNote')}</p>
                )}

                <div className="grid grid-cols-3 gap-3">
                    <Tile icon={Eye} label={t('ads.views')} value={num(views)} />
                    <Tile icon={MousePointerClick} label={t('ads.clicks')} value={num(clicks)} sub={`${t('ads.ctr')} ${rate(clicks, views)}`} />
                    <Tile icon={CreditCard} label={t('biz.spent')} value={mnt(spent)} />
                </div>

                {campaigns.length === 0 ? (
                    <Link
                        href={route('business.campaigns.new')}
                        className="bg-card border-border hover:border-primary/50 flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed p-12 text-center transition"
                    >
                        <span className="grid size-14 place-items-center rounded-2xl bg-violet-600 text-white">
                            <Megaphone className="size-6" />
                        </span>
                        <span className="font-bold">{t('biz.empty')}</span>
                        <span className="text-muted-foreground max-w-md text-sm">{t('biz.emptyHint')}</span>
                    </Link>
                ) : (
                    <ul className="grid gap-3 xl:grid-cols-2">
                        {campaigns.map((c) => (
                            <li key={c.id} className="bg-card flex gap-4 overflow-hidden rounded-2xl p-3 shadow-xs">
                                <div className="relative aspect-[6/5] w-28 shrink-0 overflow-hidden rounded-xl bg-zinc-200 sm:w-36 dark:bg-zinc-800">
                                    {c.poster ? (
                                        <img src={c.poster} alt="" className="size-full object-cover" />
                                    ) : (
                                        c.video && <video src={c.video} muted playsInline preload="metadata" className="size-full object-cover" />
                                    )}
                                    {c.video && (
                                        <span className="absolute bottom-1.5 left-1.5 inline-flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-white">
                                            <Film className="size-3" /> {t('biz.video')}
                                        </span>
                                    )}
                                </div>
                                <div className="flex min-w-0 flex-1 flex-col">
                                    <div className="flex items-start gap-2">
                                        <p className="min-w-0 flex-1 truncate font-bold">{c.title}</p>
                                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS[c.status][1]}`}>
                                            {t(STATUS[c.status][0])}
                                        </span>
                                    </div>
                                    <p className="text-muted-foreground mt-0.5 text-xs">
                                        {day(c.starts_on)} – {day(c.ends_on)}
                                        {c.days ? ` · ${t('biz.nDays', { n: c.days })}` : ''}
                                        {c.price ? ` · ${mnt(c.price)}` : ''}
                                    </p>
                                    {c.status === 'review' && <p className="text-muted-foreground mt-1 text-xs">{t('biz.reviewWait')}</p>}
                                    {c.status === 'rejected' && c.reject_reason && (
                                        <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                                            {t('biz.rejectedBecause', { reason: c.reject_reason })}
                                        </p>
                                    )}
                                    {!['unpaid', 'review', 'rejected'].includes(c.status) && (
                                        <div className="mt-auto grid grid-cols-3 gap-2 pt-2 text-sm">
                                            <Stat label={t('ads.views')} value={num(c.impressions)} />
                                            <Stat label={t('ads.clicks')} value={num(c.clicks)} />
                                            <Stat label={t('ads.ctr')} value={rate(c.clicks, c.impressions)} />
                                        </div>
                                    )}
                                    <div className="mt-2 flex flex-wrap items-center gap-1">
                                        {c.status === 'unpaid' && (
                                            <>
                                                <button
                                                    type="button"
                                                    onClick={() => router.post(route('business.campaigns.pay', c.id), { pay: 'qpay' })}
                                                    className="bg-primary text-primary-foreground inline-flex h-8 items-center gap-1 rounded-full px-3 text-xs font-bold"
                                                >
                                                    <CreditCard className="size-3.5" /> {t('biz.payNow')}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => void remove(c)}
                                                    className="text-muted-foreground ml-auto grid size-8 place-items-center rounded-full hover:bg-red-500/10 hover:text-red-600"
                                                    aria-label={t('po.delete')}
                                                >
                                                    <Trash2 className="size-3.5" />
                                                </button>
                                            </>
                                        )}
                                        {['running', 'scheduled', 'paused'].includes(c.status) && (
                                            <SmallButton
                                                icon={c.active ? Pause : Play}
                                                label={t(c.active ? 'ads.pause' : 'ads.resume')}
                                                onClick={() => router.post(route('business.campaigns.toggle', c.id), {}, { preserveScroll: true })}
                                            />
                                        )}
                                        {!['unpaid', 'review', 'rejected'].includes(c.status) && (
                                            <a
                                                href={route('business.campaigns.report', c.id)}
                                                className="text-muted-foreground hover:bg-muted hover:text-foreground inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-xs font-semibold"
                                            >
                                                <Download className="size-3.5" /> {t('ads.report')}
                                            </a>
                                        )}
                                        {c.receipt && (
                                            <a
                                                href={route('business.receipts.show', c.receipt.id)}
                                                className="text-muted-foreground hover:bg-muted hover:text-foreground inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-xs font-semibold"
                                                title={c.receipt.number}
                                            >
                                                <ReceiptText className="size-3.5" /> {t('biz.receipt')}
                                                {c.receipt.ebarimt === 'issued' && (
                                                    <span className="rounded bg-emerald-500/15 px-1 text-[10px] font-bold text-emerald-600">
                                                        {t('biz.ebarimt')}
                                                    </span>
                                                )}
                                            </a>
                                        )}
                                        <a
                                            href={c.url}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="text-muted-foreground hover:bg-muted hover:text-foreground grid size-8 place-items-center rounded-full"
                                            title={c.url}
                                        >
                                            <ExternalLink className="size-3.5" />
                                        </a>
                                    </div>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </BusinessLayout>
    );
}

function Tile({ icon: Icon, label, value, sub }: { icon: typeof Eye; label: string; value: string; sub?: string }) {
    return (
        <div className="bg-card rounded-2xl p-4 shadow-xs">
            <p className="text-muted-foreground flex items-center gap-1.5 text-xs font-semibold">
                <Icon className="size-3.5" /> {label}
            </p>
            <p className="mt-1 text-2xl font-extrabold tracking-tight tabular-nums">{value}</p>
            {sub && <p className="text-muted-foreground text-xs">{sub}</p>}
        </div>
    );
}

function Stat({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <p className="text-muted-foreground text-[11px]">{label}</p>
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
