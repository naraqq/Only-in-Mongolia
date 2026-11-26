import TopupDialog from '@/components/topup-dialog';
import UserAvatar from '@/components/user-avatar';
import SocialLayout from '@/layouts/social-layout';
import { mnt } from '@/lib/format';
import { useT, type TKey } from '@/lib/i18n';
import { toast } from '@/lib/toast';
import { ask } from '@/lib/confirm';
import { Link, router, usePage } from '@inertiajs/react';
import {
    ArrowDownLeft,
    ChevronRight,
    Compass,
    CreditCard,
    HandCoins,
    LoaderCircle,
    LockOpen,
    Plus,
    QrCode,
    ReceiptText,
    RefreshCw,
    RotateCcw,
    ShieldCheck,
    Star,
    Undo2,
    Wallet as WalletIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';

type Purpose = 'subscription' | 'tip' | 'ppv';
type Creator = { handle: string; display_name: string; avatar_url: string | null };
type Payment = {
    id: string;
    purpose: Purpose;
    amount: number;
    months: number;
    status: 'paid' | 'refunded';
    wallet: boolean;
    paid_at: string | null;
    refunded_at: string | null;
    creator: Creator | null;
};
type Entry = {
    id: number;
    type: 'topup' | 'spend' | 'refund' | 'reversal';
    amount: number;
    balance_after: number;
    created_at: string;
    payment_id: string | null;
    purpose: Purpose | 'topup' | null;
    creator: Creator | null;
};
type Sub = Creator & { price_monthly: number; expires_at: string; auto_renew: boolean };

const PURPOSE: Record<Purpose, [TKey, typeof Star, string]> = {
    subscription: ['ea.subscription', Star, 'bg-primary text-primary-foreground!'],
    tip: ['tip.for', HandCoins, 'bg-amber-500'],
    ppv: ['ppv.option', LockOpen, 'bg-violet-500'],
};
const FILTERS: ['all' | Purpose, TKey][] = [
    ['all', 'wal.all'],
    ['subscription', 'ea.subscription'],
    ['tip', 'tip.for'],
    ['ppv', 'ppv.option'],
];
const DAY = 86_400_000;
const day = (iso: string) => iso.slice(0, 10).replaceAll('-', '.');

/** The fan's wallet: balance and top-up, every change to it, subscriptions and when they run out, and every purchase. */
export default function Wallet({
    balance,
    limits,
    summary,
    entries,
    subscriptions,
    payments,
}: {
    balance: number;
    limits: { min: number; max: number };
    summary: { spentMonth: number; spentAll: number; refunded: number; count: number };
    entries: Entry[];
    subscriptions: Sub[];
    payments: Payment[];
}) {
    const { t } = useT();
    // ?topup=N (from a checkout that needed more) opens the top-up with what's missing.
    const asked = Number(new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search).get('topup') ?? '') || 0;
    const [topup, setTopup] = useState(asked > 0);
    const [filter, setFilter] = useState<'all' | Purpose>('all');
    const { flash, errors } = usePage<{ flash?: { status?: string }; errors: Record<string, string> }>().props;

    // Say what just happened (renewed, auto-renew switched) or what went wrong.
    useEffect(() => {
        const done: Record<string, Parameters<typeof t>[0]> = {
            renewed: 'wal.renewed',
            'auto-renew-on': 'wal.autoOn',
            'auto-renew-off': 'wal.autoOff',
        };
        if (flash?.status && done[flash.status]) toast(t(done[flash.status]), { tone: 'success' });
        if (errors.payment) toast(errors.payment, { tone: 'error', action: { label: t('wal.topup'), onClick: () => setTopup(true) } });
    }, [flash?.status, errors.payment, t]);
    const shown = payments.filter((p) => filter === 'all' || p.purpose === filter);
    const months = shown.reduce<[string, Payment[]][]>((acc, p) => {
        const key = (p.paid_at ?? '').slice(0, 7).replace('-', '.');
        const last = acc[acc.length - 1];
        if (last && last[0] === key) last[1].push(p);
        else acc.push([key, [p]]);
        return acc;
    }, []);

    return (
        <SocialLayout title={t('wal.title')} header={<h1 className="text-lg font-bold">{t('wal.title')}</h1>}>
            <div className="flex flex-col gap-6 p-4">
                {/* Balance */}
                <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-zinc-900 to-zinc-800 p-6 text-white shadow-xl">
                    <div
                        className="from-primary/50 absolute -top-16 -right-16 size-52 rounded-full bg-gradient-to-br to-amber-400/40 blur-3xl"
                        aria-hidden
                    />
                    <div className="relative flex items-start justify-between gap-3">
                        <div>
                            <p className="text-sm text-white/70">{t('wal.balance')}</p>
                            <p className="mt-1 text-4xl font-extrabold tracking-tight tabular-nums">{mnt(balance)}</p>
                        </div>
                        <span className="grid size-12 place-items-center rounded-2xl bg-white/10">
                            <WalletIcon className="size-6" />
                        </span>
                    </div>
                    <button
                        type="button"
                        onClick={() => setTopup(true)}
                        disabled={limits.max < limits.min}
                        className="relative mt-5 inline-flex h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-bold text-zinc-900 transition hover:bg-white/90 disabled:opacity-50"
                    >
                        <Plus className="size-4" strokeWidth={3} /> {t('wal.topup')}
                    </button>
                    <div className="relative mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm">
                        <Fact label={t('wal.spentMonth')} value={mnt(summary.spentMonth)} />
                        <Fact label={t('wal.total')} value={mnt(summary.spentAll)} />
                        <Fact label={t('wal.activeSubs')} value={String(subscriptions.length)} />
                        {summary.refunded > 0 && <Fact label={t('wal.refunded')} value={mnt(summary.refunded)} good />}
                    </div>
                </section>

                {/* Wallet activity */}
                {entries.length > 0 && (
                    <section>
                        <h2 className="mb-3 text-lg font-bold">{t('wal.activity')}</h2>
                        <ul className="bg-card overflow-hidden rounded-2xl shadow-xs">
                            {entries.slice(0, 8).map((e) => (
                                <EntryRow key={e.id} e={e} />
                            ))}
                        </ul>
                    </section>
                )}

                {/* Subscriptions */}
                <section>
                    <h2 className="mb-3 text-lg font-bold">
                        {t('wal.subs')} <span className="text-muted-foreground font-semibold">{subscriptions.length}</span>
                    </h2>
                    {subscriptions.length === 0 ? (
                        <Empty icon={CreditCard} text={t('wal.noSubs')}>
                            <Link
                                href={route('creators')}
                                className="bg-primary text-primary-foreground inline-flex h-10 items-center gap-2 rounded-full px-5 text-sm font-bold"
                            >
                                <Compass className="size-4" /> {t('wal.discover')}
                            </Link>
                        </Empty>
                    ) : (
                        <ul className="flex flex-col gap-2">
                            {subscriptions.map((s) => (
                                <SubRow key={s.handle} s={s} balance={balance} />
                            ))}
                        </ul>
                    )}
                </section>

                {/* Purchases */}
                <section>
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <h2 className="text-lg font-bold">{t('wal.history')}</h2>
                        <div className="bg-muted inline-flex max-w-full overflow-x-auto rounded-full p-1 [scrollbar-width:none]">
                            {FILTERS.map(([f, label]) => (
                                <button
                                    key={f}
                                    type="button"
                                    onClick={() => setFilter(f)}
                                    className={`h-8 shrink-0 rounded-full px-3 text-sm font-semibold whitespace-nowrap transition ${
                                        filter === f ? 'bg-card shadow-sm' : 'text-muted-foreground hover:text-foreground'
                                    }`}
                                >
                                    {t(label)}
                                </button>
                            ))}
                        </div>
                    </div>

                    {months.length === 0 ? (
                        <Empty icon={ReceiptText} text={t('wal.noPayments')} />
                    ) : (
                        <div className="flex flex-col gap-4">
                            {months.map(([month, list]) => (
                                <div key={month}>
                                    <p className="text-muted-foreground mb-1.5 px-1 text-xs font-bold tracking-wider">{month}</p>
                                    <ul className="bg-card overflow-hidden rounded-2xl shadow-xs">
                                        {list.map((p) => (
                                            <PaymentRow key={p.id} p={p} />
                                        ))}
                                    </ul>
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                <p className="text-muted-foreground flex items-start gap-2 px-1 text-xs">
                    <ShieldCheck className="mt-px size-4 shrink-0" /> {t('wal.note')}
                </p>
            </div>

            <TopupDialog open={topup} onOpenChange={setTopup} balance={balance} limits={limits} suggested={asked || undefined} />
        </SocialLayout>
    );
}

function Fact({ label, value, good = false }: { label: string; value: string; good?: boolean }) {
    return (
        <span>
            <span className="block text-xs text-white/60">{label}</span>
            <span className={`font-bold tabular-nums ${good ? 'text-emerald-300' : ''}`}>{value}</span>
        </span>
    );
}

/** One change to the balance: a top-up, something paid from the wallet, or money coming back. */
function EntryRow({ e }: { e: Entry }) {
    const { t } = useT();
    const plus = e.amount > 0;
    const [label, Icon, tone]: [string, typeof Star, string] =
        e.type === 'topup'
            ? [t('wal.eTopup'), ArrowDownLeft, 'bg-emerald-500']
            : e.type === 'refund'
              ? [t('wal.eRefund'), RotateCcw, 'bg-emerald-500']
              : e.type === 'reversal'
                ? [t('wal.eReversal'), Undo2, 'bg-zinc-500']
                : [
                      e.purpose && e.purpose !== 'topup' ? t(PURPOSE[e.purpose][0]) : t('wal.eSpend'),
                      PURPOSE[(e.purpose as Purpose) ?? 'tip']?.[1] ?? Star,
                      'bg-primary text-primary-foreground!',
                  ];
    const body = (
        <>
            <span className={`grid size-10 shrink-0 place-items-center rounded-full text-white ${tone}`}>
                <Icon className="size-[18px]" />
            </span>
            <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold">
                    {label}
                    {e.creator && <span className="text-muted-foreground font-normal"> · {e.creator.display_name}</span>}
                </span>
                <span className="text-muted-foreground block text-xs tabular-nums">
                    {day(e.created_at)} · {t('wal.left', { amount: mnt(e.balance_after) })}
                </span>
            </span>
            <span className={`shrink-0 font-bold tabular-nums ${plus ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>
                {plus ? '+' : '−'}
                {mnt(Math.abs(e.amount))}
            </span>
        </>
    );

    return (
        <li>
            {e.payment_id ? (
                <Link href={route('payments.show', e.payment_id)} className="hover:bg-muted/50 flex items-center gap-3 px-4 py-3 transition">
                    {body}
                </Link>
            ) : (
                <div className="flex items-center gap-3 px-4 py-3">{body}</div>
            )}
        </li>
    );
}

/** A subscription: how much of the month is left, renew (one tap from the wallet when it covers it), and auto-renew. */
function SubRow({ s, balance }: { s: Sub; balance: number }) {
    const { t } = useT();
    const [busy, setBusy] = useState(false);
    const left = Math.max(0, Math.ceil((new Date(s.expires_at).getTime() - Date.now()) / DAY));
    const soon = left <= 3;
    const canTap = balance >= s.price_monthly;
    const opts = { preserveScroll: true, onStart: () => setBusy(true), onFinish: () => setBusy(false) };

    async function renew() {
        if (!canTap) return router.visit(route('creator.checkout', s.handle));
        if (await ask({ message: t('wal.renewConfirm', { amount: mnt(s.price_monthly), name: s.display_name }), confirm: t('wal.renew'), cancel: t('dlg.cancel') }))
            router.post(route('wallet.renew', s.handle), {}, opts);
    }

    return (
        <li className="bg-card rounded-2xl p-3 shadow-xs">
            <div className="flex items-center gap-3">
                <Link href={route('creator.show', s.handle)} className="shrink-0">
                    <UserAvatar name={s.display_name} src={s.avatar_url} seed={s.handle} className="size-12" />
                </Link>
                <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                        <Link href={route('creator.show', s.handle)} className="truncate font-bold hover:underline">
                            {s.display_name}
                        </Link>
                        <span className="text-muted-foreground shrink-0 text-sm tabular-nums">
                            {mnt(s.price_monthly)}
                            {t('cr.perMonth')}
                        </span>
                    </div>
                    <div className="bg-muted mt-2 h-1.5 overflow-hidden rounded-full">
                        <div
                            className={`h-full rounded-full ${soon ? 'bg-amber-500' : 'bg-primary text-primary-foreground!'}`}
                            style={{ width: `${Math.min(100, (left / 30) * 100)}%` }}
                        />
                    </div>
                    <p
                        className={`mt-1 text-xs font-semibold ${soon && !s.auto_renew ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`}
                    >
                        {s.auto_renew
                            ? t('wal.renewsOn', { date: day(s.expires_at) })
                            : `${left <= 1 ? t('wal.lastDay') : t('wal.daysLeft', { n: left })} · ${day(s.expires_at)}`}
                    </p>
                </div>
                <button
                    type="button"
                    onClick={renew}
                    disabled={busy}
                    className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-bold transition disabled:opacity-50 ${
                        soon && !s.auto_renew ? 'bg-primary text-primary-foreground hover:brightness-110' : 'bg-muted hover:bg-muted/70'
                    }`}
                    title={canTap ? t('wal.renewFromWallet') : undefined}
                >
                    {busy ? <LoaderCircle className="size-4 animate-spin" /> : canTap && <WalletIcon className="size-4" />}
                    {t('wal.renew')}
                </button>
            </div>
            <label className="bg-muted/60 mt-3 flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5">
                <RefreshCw className="text-muted-foreground size-4 shrink-0" />
                <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{t('wal.autoRenew')}</span>
                    <span className="text-muted-foreground block text-xs">
                        {s.auto_renew && balance < s.price_monthly ? (
                            <span className="font-semibold text-amber-600 dark:text-amber-400">
                                {t('wal.autoRenewShort', { amount: mnt(s.price_monthly) })}
                            </span>
                        ) : (
                            t('wal.autoRenewHint')
                        )}
                    </span>
                </span>
                <input
                    type="checkbox"
                    className="peer sr-only"
                    checked={s.auto_renew}
                    disabled={busy}
                    onChange={(e) => router.post(route('wallet.auto-renew', s.handle), { on: e.target.checked }, opts)}
                />
                <span className="bg-muted-foreground/30 peer-checked:bg-primary peer-focus-visible:ring-primary/30 relative h-6 w-11 shrink-0 rounded-full transition peer-focus-visible:ring-2 after:absolute after:top-0.5 after:left-0.5 after:size-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-5" />
            </label>
        </li>
    );
}

/** One purchase: who it went to and what for, how it was paid, when, and how much. Opens its receipt. */
function PaymentRow({ p }: { p: Payment }) {
    const { t } = useT();
    const [label, Icon, tone] = PURPOSE[p.purpose];
    const refunded = p.status === 'refunded';

    return (
        <li>
            <Link href={route('payments.show', p.id)} className="hover:bg-muted/50 flex items-center gap-3 px-4 py-3 transition">
                <span className="relative shrink-0">
                    {p.creator ? (
                        <UserAvatar name={p.creator.display_name} src={p.creator.avatar_url} seed={p.creator.handle} className="size-10" />
                    ) : (
                        <span className="bg-muted grid size-10 place-items-center rounded-full">
                            <Icon className="size-4" />
                        </span>
                    )}
                    <span className={`ring-card absolute -right-1 -bottom-1 grid size-5 place-items-center rounded-full text-white ring-2 ${tone}`}>
                        <Icon className="size-3" />
                    </span>
                </span>
                <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold">{p.creator?.display_name ?? '—'}</span>
                    <span className="text-muted-foreground flex items-center gap-1 truncate text-xs">
                        {t(label)}
                        {p.purpose === 'subscription' && p.months > 1 && ` · ${t('cp.months', { n: p.months })}`} ·{' '}
                        {p.wallet ? <WalletIcon className="size-3" /> : <QrCode className="size-3" />}
                        {p.wallet ? t('wal.title') : 'QPay'} · {p.paid_at ? day(p.paid_at) : ''}
                    </span>
                </span>
                <span className="shrink-0 text-right">
                    <span className={`block font-bold tabular-nums ${refunded ? 'text-muted-foreground line-through' : ''}`}>−{mnt(p.amount)}</span>
                    {refunded && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                            <RotateCcw className="size-3" /> {t('wal.refundedTag')}
                        </span>
                    )}
                </span>
                <ChevronRight className="text-muted-foreground size-4 shrink-0" />
            </Link>
        </li>
    );
}

function Empty({ icon: Icon, text, children }: { icon: typeof Star; text: string; children?: React.ReactNode }) {
    return (
        <div className="bg-card flex flex-col items-center gap-3 rounded-2xl px-6 py-10 text-center shadow-xs">
            <span className="bg-muted text-muted-foreground grid size-12 place-items-center rounded-2xl">
                <Icon className="size-6" />
            </span>
            <p className="text-muted-foreground text-sm">{text}</p>
            {children}
        </div>
    );
}
