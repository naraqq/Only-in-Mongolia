import CheckoutSummary, { type CheckoutCreator } from '@/components/checkout-summary';
import InputError from '@/components/input-error';
import PayMethod, { defaultMethod, useWalletBalance, type Method } from '@/components/pay-method';
import CheckoutLayout from '@/layouts/checkout-layout';
import { mnt } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { router, usePage } from '@inertiajs/react';
import { ArrowRight, CalendarClock, Check, Gift, Images, LoaderCircle, MessageCircle, RefreshCcw, Ticket, X } from 'lucide-react';
import { useEffect, useState } from 'react';

type Option = { months: number; discount: number; price: number };

/** Checkout step 1 (subscriptions): pick a month or a bundle, see what's included, continue to payment. */
export default function Checkout({
    creator,
    options,
    selected,
    days,
    until,
    trialDays,
    hasCodes,
}: {
    creator: CheckoutCreator;
    options: Option[];
    selected: number;
    days: number;
    until: string | null;
    trialDays: number | null;
    hasCodes: boolean;
}) {
    const { t } = useT();
    const { errors } = usePage<{ errors: Record<string, string> }>().props;
    const [months, setMonths] = useState(selected);
    const [busy, setBusy] = useState(false);
    const choice = options.find((o) => o.months === months) ?? options[0];
    const [promo, setPromo] = useState<{ code: string; percent_off: number } | null>(null);
    const total = promo ? Math.floor((choice.price * (100 - promo.percent_off)) / 10000) * 100 : choice.price;
    const balance = useWalletBalance();
    const [method, setMethod] = useState<Method>(defaultMethod(balance, total));

    // A bigger bundle may no longer fit in the wallet.
    useEffect(() => {
        if (method === 'wallet' && balance < total) setMethod('qpay');
    }, [method, balance, total]);
    const monthly = options.find((o) => o.months === 1)?.price ?? choice.price;
    const full = monthly * choice.months;
    const best = Math.max(...options.map((o) => o.discount));
    const monthsLabel = (n: number) => (n === 1 ? t('co.month') : t('cp.months', { n }));

    const lines = [
        { label: t('co.subFor', { months: monthsLabel(choice.months) }), value: mnt(full) },
        ...(full > choice.price
            ? [{ label: t('co.discount', { n: choice.discount }), value: `−${mnt(full - choice.price)}`, tone: 'good' as const }]
            : []),
        ...(promo
            ? [
                  {
                      label: t('pro.codeLine', { code: promo.code, n: promo.percent_off }),
                      value: `−${mnt(choice.price - total)}`,
                      tone: 'good' as const,
                  },
              ]
            : []),
        { label: t('co.access'), value: t('co.days', { n: days * choice.months }), tone: 'muted' as const },
    ];

    const pay = () =>
        router.post(
            route('creator.subscribe', creator.handle),
            { months, wallet: method === 'wallet', code: promo?.code ?? null },
            { onStart: () => setBusy(true), onFinish: () => setBusy(false) },
        );

    return (
        <CheckoutLayout
            title={t('pay.title')}
            steps={[t('co.stepPlan'), t('co.stepPay'), t('co.stepDone')]}
            current={0}
            backHref={route('creator.show', creator.handle)}
            summary={<CheckoutSummary creator={creator} lines={lines} total={total} />}
        >
            <h1 className="text-2xl font-extrabold tracking-tight">{t('co.choose')}</h1>
            <p className="text-muted-foreground mt-1">{t('co.chooseSub', { handle: creator.handle })}</p>

            {until && (
                <p className="mt-4 flex items-start gap-2 rounded-2xl bg-sky-50 p-3 text-sm text-sky-900 dark:bg-sky-950/40 dark:text-sky-200">
                    <CalendarClock className="mt-0.5 size-4 shrink-0" />
                    {t('co.current', { date: until.slice(0, 10).replaceAll('-', '.') })}
                </p>
            )}

            {trialDays && (
                <div className="mt-5 flex flex-wrap items-center gap-3 rounded-2xl bg-emerald-50 p-4 dark:bg-emerald-950/40">
                    <Gift className="size-6 shrink-0 text-emerald-600" />
                    <span className="min-w-0 flex-1">
                        <span className="block font-bold text-emerald-800 dark:text-emerald-200">{t('pro.tryFree', { n: trialDays })}</span>
                        <span className="block text-sm text-emerald-700/80 dark:text-emerald-300/80">{t('pro.tryFreeSub')}</span>
                    </span>
                    <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                            router.post(route('creator.trial', creator.handle), {}, { onStart: () => setBusy(true), onFinish: () => setBusy(false) })
                        }
                        className="h-10 rounded-full bg-emerald-600 px-5 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                    >
                        {t('pro.startTrial')}
                    </button>
                </div>
            )}

            <div className="mt-6 flex flex-col gap-3" role="radiogroup">
                {options.map((o) => {
                    const on = o.months === months;
                    return (
                        <button
                            key={o.months}
                            type="button"
                            role="radio"
                            aria-checked={on}
                            onClick={() => setMonths(o.months)}
                            className={`relative flex items-center gap-4 rounded-2xl p-4 text-left transition ${
                                on ? 'bg-primary/10 shadow-sm' : 'bg-card shadow-xs hover:shadow-sm'
                            }`}
                        >
                            <span className={`grid size-5 shrink-0 place-items-center rounded-full ${on ? 'bg-primary' : 'bg-muted'}`}>
                                {on && <Check className="size-3 text-white" strokeWidth={4} />}
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="flex flex-wrap items-center gap-2 font-bold">
                                    {monthsLabel(o.months)}
                                    {o.discount > 0 && o.discount === best && (
                                        <span className="bg-primary text-primary-foreground rounded-full px-2 py-0.5 text-[11px] font-bold">
                                            {t('co.best')}
                                        </span>
                                    )}
                                </span>
                                <span className="text-muted-foreground block text-sm">
                                    {t('cp.perMonth', { price: mnt(Math.round(o.price / o.months)) })}
                                </span>
                            </span>
                            <span className="text-right">
                                <span className="block text-lg font-extrabold tabular-nums">{mnt(o.price)}</span>
                                {o.discount > 0 && (
                                    <span className="text-xs font-bold text-emerald-600">
                                        {t('co.save', { price: mnt(monthly * o.months - o.price) })}
                                    </span>
                                )}
                            </span>
                        </button>
                    );
                })}
            </div>

            <ul className="mt-6 flex flex-col gap-2.5 text-sm">
                {[
                    [Images, t('co.perk1')],
                    [MessageCircle, t('co.perk2', { name: creator.display_name })],
                    [RefreshCcw, t('co.perk3')],
                ].map(([Icon, text], i) => {
                    const I = Icon as typeof Images;
                    return (
                        <li key={i} className="flex items-center gap-3">
                            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50">
                                <I className="size-4" />
                            </span>
                            {text as string}
                        </li>
                    );
                })}
            </ul>

            {hasCodes && <PromoBox handle={creator.handle} value={promo} onChange={setPromo} />}

            <h2 className="mt-8 mb-3 font-bold">{t('wal.method')}</h2>
            <PayMethod amount={total} value={method} onChange={setMethod} />

            <button
                type="button"
                onClick={pay}
                disabled={busy}
                className="bg-primary text-primary-foreground mt-8 flex h-14 w-full items-center justify-center gap-2 rounded-xl text-base font-bold transition hover:brightness-110 disabled:opacity-60"
            >
                {busy ? <LoaderCircle className="size-5 animate-spin" /> : null}
                {method === 'wallet' ? t('wal.payNow', { amount: mnt(total) }) : t('co.continue', { price: mnt(total) })}
                {!busy && <ArrowRight className="size-5" />}
            </button>
            <InputError message={errors.payment ?? errors.code ?? errors.trial} className="mt-2 text-center" />
        </CheckoutLayout>
    );
}

type Promo = { code: string; percent_off: number };
const REASONS: Record<string, Parameters<ReturnType<typeof useT>['t']>[0]> = {
    not_found: 'pro.rNotFound',
    inactive: 'pro.rInactive',
    expired: 'pro.rExpired',
    used_up: 'pro.rUsedUp',
    already_used: 'pro.rAlready',
};

/** "Have a code?": checks it with the server as you finish typing and shows what it takes off. */
function PromoBox({ handle, value, onChange }: { handle: string; value: Promo | null; onChange: (p: Promo | null) => void }) {
    const { t } = useT();
    const [open, setOpen] = useState(false);
    const [code, setCode] = useState('');
    const [state, setState] = useState<'idle' | 'checking' | string>('idle');

    async function check() {
        if (code.length < 3) return;
        setState('checking');
        try {
            const res = await fetch(route('creator.promo', { handle, code }), { headers: { Accept: 'application/json' } });
            const r = await res.json();
            if (r.ok) {
                onChange({ code: r.code, percent_off: r.percent_off });
                setState('idle');
            } else setState(r.reason);
        } catch {
            setState('not_found');
        }
    }

    if (value) {
        return (
            <div className="mt-6 flex items-center gap-3 rounded-2xl bg-emerald-50 p-3 dark:bg-emerald-950/40">
                <Ticket className="size-5 shrink-0 text-emerald-600" />
                <span className="min-w-0 flex-1 text-sm font-bold text-emerald-800 dark:text-emerald-200">
                    {t('pro.applied', { code: value.code, n: value.percent_off })}
                </span>
                <button
                    type="button"
                    onClick={() => onChange(null)}
                    className="grid size-8 place-items-center rounded-full hover:bg-black/5"
                    aria-label={t('pe.cancel')}
                >
                    <X className="size-4" />
                </button>
            </div>
        );
    }
    if (!open) {
        return (
            <button
                type="button"
                onClick={() => setOpen(true)}
                className="text-primary mt-6 inline-flex items-center gap-1.5 text-sm font-bold hover:underline"
            >
                <Ticket className="size-4" /> {t('pro.haveCode')}
            </button>
        );
    }
    return (
        <div className="mt-6">
            <div className="flex gap-2">
                <input
                    autoFocus
                    value={code}
                    onChange={(e) => {
                        setCode(
                            e.target.value
                                .replace(/[^A-Za-z0-9]/g, '')
                                .toUpperCase()
                                .slice(0, 24),
                        );
                        setState('idle');
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), check())}
                    placeholder="SUMMER20"
                    className="bg-muted focus:ring-primary/30 h-11 min-w-0 flex-1 rounded-xl px-3.5 font-bold tracking-wider uppercase outline-none focus:ring-2"
                />
                <button
                    type="button"
                    onClick={check}
                    disabled={code.length < 3 || state === 'checking'}
                    className="bg-muted hover:bg-muted/70 h-11 rounded-xl px-4 text-sm font-bold transition disabled:opacity-50"
                >
                    {state === 'checking' ? <LoaderCircle className="size-4 animate-spin" /> : t('pro.apply')}
                </button>
            </div>
            {REASONS[state] && <p className="mt-1.5 text-sm text-red-600">{t(REASONS[state])}</p>}
        </div>
    );
}
