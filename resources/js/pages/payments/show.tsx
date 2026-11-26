import CheckoutSummary, { type CheckoutCreator } from '@/components/checkout-summary';
import { Button } from '@/components/ui/button';
import CheckoutLayout from '@/layouts/checkout-layout';
import { mnt } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { Link, router } from '@inertiajs/react';
import { ArrowRight, CircleCheck, FlaskConical, LoaderCircle, QrCode, Smartphone } from 'lucide-react';
import { useEffect, useState } from 'react';

type BankLink = { name: string; description: string; logo: string; link: string };
type Payment = {
    id: string;
    amount: number;
    status: 'pending' | 'paid' | 'refunded';
    qr_image: string | null;
    bank_links: BankLink[];
    fake: boolean;
    wallet: boolean;
    purpose: 'subscription' | 'tip' | 'ppv';
    note: string | null;
    months: number;
};

const POLL_MS = 3000;
const day = (iso: string) => iso.slice(0, 10).replaceAll('-', '.');

/**
 * Checkout steps 2 and 3. Pay: scan the QPay QR (computer) or open a bank app (phone); the status is polled.
 * Done: what you got, a receipt, and where to go next.
 */
export default function PaymentShow({
    payment,
    creator,
    days,
    fullPrice,
    paidAt,
    expiresAt,
    returnUrl,
}: {
    payment: Payment;
    creator: CheckoutCreator;
    days: number;
    fullPrice: number;
    paidAt: string | null;
    expiresAt: string | null;
    returnUrl: string;
}) {
    const { t } = useT();
    const [status, setStatus] = useState(payment.status);
    const paid = status !== 'pending';

    // Poll until paid, then reload the page's data (receipt date, new expiry) for the Done step.
    useEffect(() => {
        if (paid) return;
        let timer: ReturnType<typeof setTimeout>;
        let cancelled = false;
        async function tick() {
            try {
                const res = await fetch(route('payments.status', payment.id), { headers: { Accept: 'application/json' } });
                if (res.ok && (await res.json()).status === 'paid') {
                    if (!cancelled) {
                        setStatus('paid');
                        router.reload({ only: ['payment', 'paidAt', 'expiresAt'] });
                    }
                    return;
                }
            } catch {
                /* network blip: keep polling */
            }
            if (!cancelled) timer = setTimeout(tick, POLL_MS);
        }
        timer = setTimeout(tick, POLL_MS);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [paid, payment.id]);

    const first = payment.purpose === 'tip' ? t('co.stepTip') : payment.purpose === 'ppv' ? t('co.stepUnlock') : t('co.stepPlan');
    const monthsLabel = payment.months > 1 ? t('cp.months', { n: payment.months }) : t('co.month');
    const lines =
        payment.purpose === 'subscription'
            ? [
                  { label: t('co.subFor', { months: monthsLabel }), value: mnt(fullPrice) },
                  ...(fullPrice > payment.amount
                      ? [
                            {
                                label: t('co.discount', { n: Math.round((1 - payment.amount / fullPrice) * 100) }),
                                value: `−${mnt(fullPrice - payment.amount)}`,
                                tone: 'good' as const,
                            },
                        ]
                      : []),
                  { label: t('co.access'), value: t('co.days', { n: days }), tone: 'muted' as const },
              ]
            : [
                  {
                      label: payment.purpose === 'tip' ? t('co.tipFor', { name: creator.display_name }) : t('co.unlockItem'),
                      value: mnt(payment.amount),
                  },
                  ...(payment.note ? [{ label: `“${payment.note}”`, value: '', tone: 'muted' as const }] : []),
              ];

    return (
        <CheckoutLayout
            title={t('pay.title')}
            steps={[first, t('co.stepPay'), t('co.stepDone')]}
            current={paid ? 3 : 1}
            backHref={returnUrl}
            summary={<CheckoutSummary creator={creator} lines={lines} total={payment.amount} />}
        >
            {paid ? (
                <Done payment={payment} creator={creator} paidAt={paidAt} expiresAt={expiresAt} returnUrl={returnUrl} />
            ) : (
                <>
                    <h1 className="text-2xl font-extrabold tracking-tight">{t('co.payTitle')}</h1>
                    <p className="text-muted-foreground mt-1">{t('co.paySub')}</p>

                    <div className="mt-6 flex items-center justify-between rounded-2xl bg-zinc-50 px-5 py-4 dark:bg-zinc-900">
                        <span className="text-muted-foreground text-sm font-medium">{t('co.toPay')}</span>
                        <span className="text-3xl font-extrabold tracking-tight tabular-nums">{mnt(payment.amount)}</span>
                    </div>

                    {payment.qr_image && (
                        <div className="bg-card mt-6 hidden items-center gap-8 rounded-3xl p-6 shadow-xs md:flex">
                            <img src={`data:image/png;base64,${payment.qr_image}`} alt="QPay QR" className="size-48 shrink-0 rounded-xl" />
                            <ol className="flex flex-col gap-4 text-sm">
                                {[t('co.payStep1'), t('co.payStep2'), t('co.payStep3')].map((s, i) => (
                                    <li key={s} className="flex items-center gap-3">
                                        <span className="bg-primary/10 text-primary grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold">
                                            {i + 1}
                                        </span>
                                        {s}
                                    </li>
                                ))}
                            </ol>
                        </div>
                    )}
                    {!payment.qr_image && payment.fake && (
                        <div className="text-muted-foreground bg-card mt-6 hidden items-center gap-3 rounded-3xl p-6 text-sm shadow-xs md:flex">
                            <QrCode className="size-10 shrink-0" /> {t('co.noQr')}
                        </div>
                    )}

                    {payment.bank_links.length > 0 && (
                        <section className="mt-6">
                            <h2 className="text-muted-foreground mb-3 flex items-center gap-1.5 text-xs font-semibold tracking-wider uppercase">
                                <Smartphone className="size-4" /> {t('pay.banks')}
                            </h2>
                            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                                {payment.bank_links.map((b) => (
                                    <a
                                        key={b.name + b.link}
                                        href={b.link}
                                        className="hover:bg-muted/50 bg-card flex flex-col items-center gap-2 rounded-2xl p-3 text-center shadow-xs transition"
                                    >
                                        <img src={b.logo} alt="" className="size-10 rounded-xl" loading="lazy" />
                                        <span className="line-clamp-1 text-xs font-medium">{b.description || b.name}</span>
                                    </a>
                                ))}
                            </div>
                        </section>
                    )}

                    {payment.fake && (
                        <div className="mt-6 rounded-2xl bg-amber-50 p-4 dark:bg-amber-950/30">
                            <p className="flex items-center gap-2 text-sm font-semibold text-amber-800 dark:text-amber-300">
                                <FlaskConical className="size-4" /> {t('pay.devNote')}
                            </p>
                            <Button
                                className="mt-3 h-12 w-full rounded-xl bg-amber-500 font-bold text-white hover:bg-amber-600"
                                onClick={() => router.post(route('payments.fake-pay', payment.id))}
                            >
                                {t('pay.devPay', { price: mnt(payment.amount) })}
                            </Button>
                        </div>
                    )}

                    <div className="mt-6 flex items-center gap-3 rounded-2xl bg-sky-50 p-4 text-sm text-sky-900 dark:bg-sky-950/40 dark:text-sky-200">
                        <LoaderCircle className="size-5 shrink-0 animate-spin" />
                        <span>
                            <span className="block font-semibold">{t('pay.waiting')}</span>
                            <span className="opacity-80">{t('co.auto')}</span>
                        </span>
                    </div>

                    <div className="mt-6 text-center">
                        <Link
                            href={returnUrl}
                            className="text-muted-foreground hover:text-foreground text-sm font-medium underline-offset-4 hover:underline"
                        >
                            {t('co.cancel')}
                        </Link>
                    </div>
                </>
            )}
        </CheckoutLayout>
    );
}

function Done({
    payment,
    creator,
    paidAt,
    expiresAt,
    returnUrl,
}: {
    payment: Payment;
    creator: CheckoutCreator;
    paidAt: string | null;
    expiresAt: string | null;
    returnUrl: string;
}) {
    const { t } = useT();
    const title = payment.purpose === 'tip' ? t('tip.done') : payment.purpose === 'ppv' ? t('ppv.done') : t('pay.done');
    const sub =
        payment.purpose === 'tip'
            ? t('co.doneTip', { name: creator.display_name })
            : payment.purpose === 'ppv'
              ? t('co.doneUnlock')
              : t('co.doneSub', { handle: creator.handle, date: expiresAt ? day(expiresAt) : '—' });
    const rows = [
        [t('co.amount'), mnt(payment.amount)],
        [t('co.date'), paidAt ? new Date(paidAt).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' }).replaceAll('-', '.') : '—'],
        [t('co.method'), payment.wallet ? t('wal.title') : payment.fake ? 'QPay (test)' : 'QPay'],
        [t('co.ref'), payment.id.slice(-10).toUpperCase()],
    ];

    return (
        <div className="flex flex-col items-center text-center">
            <span className="grid size-20 place-items-center rounded-full bg-emerald-50 ring-8 ring-emerald-50/50 dark:bg-emerald-950/50 dark:ring-emerald-950/30">
                <CircleCheck className="size-11 text-emerald-600" />
            </span>
            <h1 className="mt-5 text-2xl font-extrabold tracking-tight">{title}</h1>
            <p className="text-muted-foreground mt-1 max-w-sm">{sub}</p>

            <dl className="bg-card mt-7 w-full max-w-sm rounded-2xl text-left text-sm shadow-xs">
                <div className="text-muted-foreground px-4 py-2.5 text-xs font-semibold tracking-wider uppercase">{t('co.receipt')}</div>
                {rows.map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-4 px-4 py-2.5">
                        <dt className="text-muted-foreground">{k}</dt>
                        <dd className="font-semibold tabular-nums">{v}</dd>
                    </div>
                ))}
            </dl>

            <div className="mt-7 flex w-full max-w-sm flex-col gap-2">
                <Link
                    href={returnUrl}
                    className="from-primary shadow-primary/25 flex h-12 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r to-rose-500 font-bold text-white shadow-lg transition hover:brightness-110"
                >
                    {t('co.continueTo')} <ArrowRight className="size-5" />
                </Link>
                <Link href={route('home')} className="hover:bg-muted flex h-12 items-center justify-center rounded-2xl font-semibold">
                    {t('co.home')}
                </Link>
            </div>
        </div>
    );
}
