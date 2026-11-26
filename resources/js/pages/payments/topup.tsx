import { Button } from '@/components/ui/button';
import CheckoutLayout from '@/layouts/checkout-layout';
import { mnt } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { Link, router } from '@inertiajs/react';
import { ArrowRight, CircleCheck, FlaskConical, LoaderCircle, QrCode, Smartphone, Wallet } from 'lucide-react';
import { useEffect, useState } from 'react';

type BankLink = { name: string; description: string; logo: string; link: string };
type Payment = {
    id: string;
    amount: number;
    status: 'pending' | 'paid' | 'refunded';
    qr_image: string | null;
    bank_links: BankLink[];
    fake: boolean;
};

const POLL_MS = 3000;

/** Topping up the wallet: pay the QPay invoice (QR on a computer, bank app on a phone), then see the new balance. */
export default function Topup({ payment, paidAt, balance }: { payment: Payment; paidAt: string | null; balance: number }) {
    const { t } = useT();
    const [status, setStatus] = useState(payment.status);
    const paid = status !== 'pending';

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
                        router.reload({ only: ['payment', 'paidAt', 'balance', 'auth'] });
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

    const summary = (
        <div className="bg-card overflow-hidden rounded-3xl shadow-sm">
            <div className="bg-primary text-primary-foreground flex items-center gap-3 p-5">
                <span className="bg-primary-foreground/15 grid size-11 place-items-center rounded-2xl">
                    <Wallet className="size-6" />
                </span>
                <span>
                    <span className="text-primary-foreground/75 block text-sm">{t('wal.title')}</span>
                    <span className="block text-lg font-extrabold">{t('wal.topupTitle')}</span>
                </span>
            </div>
            <dl className="flex flex-col gap-2 p-5 text-sm">
                <div className="flex justify-between">
                    <dt className="text-muted-foreground">{t('wal.topupAmount')}</dt>
                    <dd className="font-bold tabular-nums">{mnt(payment.amount)}</dd>
                </div>
                <div className="flex justify-between">
                    <dt className="text-muted-foreground">{paid ? t('wal.balance') : t('wal.balanceAfter')}</dt>
                    <dd className="font-bold tabular-nums">{mnt(paid ? balance : balance + payment.amount)}</dd>
                </div>
            </dl>
        </div>
    );

    return (
        <CheckoutLayout
            title={t('wal.topupTitle')}
            steps={[t('wal.topupAmount'), t('co.stepPay'), t('co.stepDone')]}
            current={paid ? 3 : 1}
            backHref={route('wallet')}
            summary={summary}
        >
            {paid ? (
                <div className="flex flex-col items-center text-center">
                    <span className="grid size-20 place-items-center rounded-full bg-emerald-50 ring-8 ring-emerald-50/50 dark:bg-emerald-950/50 dark:ring-emerald-950/30">
                        <CircleCheck className="size-11 text-emerald-600" />
                    </span>
                    <h1 className="mt-5 text-2xl font-extrabold tracking-tight">{t('wal.toppedUp', { amount: mnt(payment.amount) })}</h1>
                    <p className="text-muted-foreground mt-1">{t('wal.balanceIs', { amount: mnt(balance) })}</p>
                    {paidAt && (
                        <p className="text-muted-foreground mt-1 text-xs">
                            {new Date(paidAt).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' }).replaceAll('-', '.')} ·{' '}
                            {payment.id.slice(-10).toUpperCase()}
                        </p>
                    )}
                    <Link
                        href={route('wallet')}
                        className="bg-primary shadow-primary/25 text-primary-foreground mt-7 flex h-12 w-full max-w-sm items-center justify-center gap-2 rounded-2xl font-bold shadow-lg transition hover:brightness-110"
                    >
                        {t('wal.toWallet')} <ArrowRight className="size-5" />
                    </Link>
                </div>
            ) : (
                <>
                    <h1 className="text-2xl font-extrabold tracking-tight">{t('co.payTitle')}</h1>
                    <p className="text-muted-foreground mt-1">{t('co.paySub')}</p>

                    <div className="bg-muted mt-6 flex items-center justify-between rounded-2xl px-5 py-4">
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
                            href={route('wallet')}
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
