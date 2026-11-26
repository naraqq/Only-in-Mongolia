import InputError from '@/components/input-error';
import StudioLayout from '@/layouts/studio-layout';
import { mnt } from '@/lib/format';
import { useT, type TKey } from '@/lib/i18n';
import { useForm } from '@inertiajs/react';
import { Banknote, Clock, Download, HandCoins, Landmark, LoaderCircle, LockOpen, Star } from 'lucide-react';
import { type FormEvent } from 'react';

type Balance = { available: number; onHold: number; nextRelease: string | null; requested: number; paidOut: number; earned: number };
type Payout = {
    id: number;
    amount: number;
    status: 'requested' | 'paid' | 'rejected';
    reference: string | null;
    requested_at: string;
    processed_at: string | null;
};
type Earning = { id: string; purpose: 'subscription' | 'tip' | 'ppv'; fan: string | null; amount: number; net: number; paid_at: string };

const day = (iso: string) => iso.slice(0, 10).replaceAll('-', '.');
const PURPOSE: Record<Earning['purpose'], [TKey, typeof Star]> = {
    subscription: ['ea.subscription', Star],
    tip: ['tip.for', HandCoins],
    ppv: ['ppv.option', LockOpen],
};
const STATUS: Record<Payout['status'], [TKey, string]> = {
    requested: ['ea.statusRequested', 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'],
    paid: ['ea.statusPaid', 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'],
    rejected: ['ea.statusRejected', 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'],
};

/** Studio → Earnings: what's available, on hold and paid out; request a payout; history; CSV statement. */
export default function Earnings({
    balance,
    rules,
    bank,
    payouts,
    recent,
}: {
    balance: Balance;
    rules: { minPayout: number; holdDays: number; feePercent: number };
    bank: { name: string; account: string; holder: string };
    payouts: Payout[];
    recent: Earning[];
}) {
    const { t } = useT();
    const open = payouts.some((p) => p.status === 'requested');
    const form = useForm({ amount: balance.available });
    const canRequest = !open && balance.available >= rules.minPayout;

    function submit(e: FormEvent) {
        e.preventDefault();
        form.post(route('studio.payout'), { preserveScroll: true });
    }

    return (
        <StudioLayout
            title={t('ea.title')}
            actions={
                <a
                    href={route('studio.statement')}
                    className="bg-card hover:bg-muted inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-bold shadow-xs transition"
                >
                    <Download className="size-4" /> CSV
                </a>
            }
        >
            <div className="mx-auto flex max-w-3xl flex-col gap-6">
                {/* Balance */}
                <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-zinc-900 to-zinc-800 p-6 text-white shadow-xl">
                    <div
                        className="from-primary/50 absolute -top-16 -right-16 size-52 rounded-full bg-gradient-to-br to-amber-400/40 blur-3xl"
                        aria-hidden
                    />
                    <p className="relative text-xs font-semibold tracking-wider text-white/60 uppercase">{t('ea.available')}</p>
                    <p className="relative mt-1 text-4xl font-extrabold tracking-tight tabular-nums">{mnt(balance.available)}</p>
                    <div className="relative mt-5 grid grid-cols-3 gap-3 text-sm">
                        <Stat label={t('ea.onHold')} value={mnt(balance.onHold)} />
                        <Stat label={t('ea.paidOut')} value={mnt(balance.paidOut)} />
                        <Stat label={t('ea.earned')} value={mnt(balance.earned)} />
                    </div>
                    {balance.onHold > 0 && balance.nextRelease && (
                        <p className="relative mt-4 flex items-center gap-1.5 text-xs text-white/60">
                            <Clock className="size-3.5" /> {t('ea.release', { date: day(balance.nextRelease), days: rules.holdDays })}
                        </p>
                    )}
                </section>

                {/* Request a payout */}
                <section className="bg-card rounded-2xl p-4 shadow-xs">
                    <h2 className="flex items-center gap-2 font-bold">
                        <Banknote className="text-primary size-5" /> {t('ea.request')}
                    </h2>
                    <p className="text-muted-foreground mt-1 flex items-center gap-1.5 text-sm">
                        <Landmark className="size-4" /> {bank.name} · {bank.account} · {bank.holder}
                    </p>
                    {open ? (
                        <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                            {t('ea.inProgress')}
                        </p>
                    ) : (
                        <form onSubmit={submit} className="mt-3 flex flex-col gap-2 sm:flex-row">
                            <label className="bg-muted flex h-12 flex-1 items-center rounded-xl px-4">
                                <span className="text-muted-foreground font-semibold">₮</span>
                                <input
                                    inputMode="numeric"
                                    value={form.data.amount ? form.data.amount.toLocaleString('en-US') : ''}
                                    onChange={(e) => form.setData('amount', Number(e.target.value.replace(/\D/g, '').slice(0, 9)))}
                                    className="w-full bg-transparent px-2 text-lg font-bold tabular-nums outline-none"
                                    aria-label={t('ea.amount')}
                                    disabled={!canRequest}
                                />
                                <button
                                    type="button"
                                    onClick={() => form.setData('amount', balance.available)}
                                    className="text-primary text-xs font-bold"
                                    disabled={!canRequest}
                                >
                                    MAX
                                </button>
                            </label>
                            <button
                                type="submit"
                                disabled={
                                    !canRequest || form.processing || form.data.amount < rules.minPayout || form.data.amount > balance.available
                                }
                                className="from-primary inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-r to-rose-500 px-6 font-bold text-white shadow-md transition hover:brightness-110 disabled:opacity-40 disabled:shadow-none"
                            >
                                {form.processing && <LoaderCircle className="size-4 animate-spin" />}
                                {t('ea.requestBtn')}
                            </button>
                        </form>
                    )}
                    <InputError message={form.errors.amount} className="mt-2" />
                    <p className="text-muted-foreground mt-2 text-xs">
                        {t('ea.rules', { min: mnt(rules.minPayout), days: rules.holdDays, fee: rules.feePercent })}
                    </p>
                </section>

                {/* Payout history */}
                {payouts.length > 0 && (
                    <section>
                        <h2 className="text-muted-foreground mb-2 px-1 text-xs font-semibold tracking-wider uppercase">{t('ea.payouts')}</h2>
                        <ul className="bg-card rounded-2xl shadow-xs">
                            {payouts.map((p) => (
                                <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                                    <span className="min-w-0 flex-1">
                                        <span className="block font-bold tabular-nums">{mnt(p.amount)}</span>
                                        <span className="text-muted-foreground block truncate text-xs">
                                            {day(p.requested_at)}
                                            {p.reference && ` · ${p.reference}`}
                                        </span>
                                    </span>
                                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${STATUS[p.status][1]}`}>
                                        {t(STATUS[p.status][0])}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </section>
                )}

                {/* Recent earnings */}
                <section>
                    <h2 className="text-muted-foreground mb-2 px-1 text-xs font-semibold tracking-wider uppercase">{t('ea.recent')}</h2>
                    {recent.length === 0 ? (
                        <p className="text-muted-foreground bg-card rounded-2xl p-8 text-center text-sm shadow-xs">{t('ea.none')}</p>
                    ) : (
                        <ul className="bg-card rounded-2xl shadow-xs">
                            {recent.map((r) => {
                                const [label, Icon] = PURPOSE[r.purpose] ?? PURPOSE.subscription;
                                return (
                                    <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                                        <span className="bg-muted grid size-9 shrink-0 place-items-center rounded-full">
                                            <Icon className="size-4" />
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-sm font-semibold">
                                                {t(label)}
                                                {r.fan && <span className="text-muted-foreground font-normal"> · {r.fan}</span>}
                                            </span>
                                            <span className="text-muted-foreground block text-xs">{day(r.paid_at)}</span>
                                        </span>
                                        <span className="text-right">
                                            <span className="block font-bold text-emerald-600 tabular-nums">+{mnt(r.net)}</span>
                                            <span className="text-muted-foreground block text-[11px] tabular-nums">{mnt(r.amount)}</span>
                                        </span>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </section>
            </div>
        </StudioLayout>
    );
}

function Stat({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <p className="text-[11px] text-white/60">{label}</p>
            <p className="font-bold tabular-nums">{value}</p>
        </div>
    );
}
