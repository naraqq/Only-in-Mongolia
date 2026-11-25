import { Button } from '@/components/ui/button';
import UserAvatar from '@/components/user-avatar';
import SocialLayout from '@/layouts/social-layout';
import { mnt } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { Link, router } from '@inertiajs/react';
import { ArrowLeft, BadgeCheck, CircleCheck, FlaskConical, LoaderCircle, ShieldCheck, Smartphone } from 'lucide-react';
import { useEffect, useState } from 'react';

type BankLink = { name: string; description: string; logo: string; link: string };
type Payment = {
    id: string;
    amount: number;
    status: 'pending' | 'paid';
    qr_image: string | null;
    bank_links: BankLink[];
    fake: boolean;
    purpose: 'subscription' | 'tip' | 'ppv';
    note: string | null;
    months: number;
};
type Creator = { handle: string; display_name: string; bio: string | null; price_monthly: number; avatar_url: string | null };

const POLL_MS = 3000;

/** Checkout for a subscription: scan the QPay QR (computer) or open a bank app (phone). Paid status is polled. */
export default function PaymentShow({ payment, creator, days, returnUrl }: { payment: Payment; creator: Creator; days: number; returnUrl: string }) {
    const { t } = useT();
    const [status, setStatus] = useState(payment.status);

    // Poll until paid, then go back to the creator's page.
    useEffect(() => {
        if (status === 'paid') {
            const id = setTimeout(() => router.visit(returnUrl), 1500);
            return () => clearTimeout(id);
        }
        let timer: ReturnType<typeof setTimeout>;
        let cancelled = false;
        async function tick() {
            try {
                const res = await fetch(route('payments.status', payment.id), { headers: { Accept: 'application/json' } });
                if (res.ok && (await res.json()).status === 'paid') return !cancelled && setStatus('paid');
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
    }, [status, payment.id, returnUrl]);

    return (
        <SocialLayout
            title={t('pay.title')}
            header={
                <>
                    <Link
                        href={route('creator.show', creator.handle)}
                        className="hover:bg-muted -ml-2 grid size-9 place-items-center rounded-full"
                        aria-label="Back"
                    >
                        <ArrowLeft className="size-5" />
                    </Link>
                    <h1 className="text-lg font-bold">{t('pay.title')}</h1>
                </>
            }
        >
            <div className="flex flex-col gap-5 p-4 md:p-6">
                {/* What you're buying */}
                <div className="flex items-center gap-4 rounded-2xl border p-4">
                    <UserAvatar name={creator.display_name} src={creator.avatar_url} seed={creator.handle} className="size-14 text-xl" />
                    <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1 font-bold">
                            <span className="truncate">{creator.display_name}</span>
                            <BadgeCheck className="size-4 shrink-0 text-sky-500" />
                        </p>
                        <p className="text-muted-foreground text-sm">
                            {payment.purpose === 'tip'
                                ? t('tip.for')
                                : payment.purpose === 'ppv'
                                  ? t('ppv.what')
                                  : (payment.months > 1 ? `${t('pay.months', { n: payment.months })} · ` : '') + t('pay.what', { days })}
                        </p>
                        {payment.note && <p className="text-muted-foreground mt-0.5 truncate text-xs italic">“{payment.note}”</p>}
                    </div>
                    <p className="text-2xl font-extrabold tracking-tight">{mnt(payment.amount)}</p>
                </div>

                {status === 'paid' ? (
                    <div className="flex flex-col items-center gap-3 rounded-2xl bg-emerald-50 p-10 text-center dark:bg-emerald-950/40">
                        <CircleCheck className="size-14 text-emerald-600" />
                        <p className="text-xl font-bold text-emerald-800 dark:text-emerald-300">
                            {payment.purpose === 'tip' ? t('tip.done') : payment.purpose === 'ppv' ? t('ppv.done') : t('pay.done')}
                        </p>
                        <p className="text-sm text-emerald-700/80">{t('pay.redirect')}</p>
                    </div>
                ) : (
                    <>
                        {payment.qr_image && (
                            <div className="hidden flex-col items-center gap-3 rounded-3xl border p-6 md:flex">
                                <img src={`data:image/png;base64,${payment.qr_image}`} alt="QPay QR" className="size-56 rounded-xl" />
                                <p className="text-muted-foreground text-sm">{t('pay.scan')}</p>
                            </div>
                        )}

                        {payment.bank_links.length > 0 && (
                            <section>
                                <h2 className="text-muted-foreground mb-3 flex items-center gap-1.5 text-xs font-semibold tracking-wider uppercase">
                                    <Smartphone className="size-4" /> {t('pay.banks')}
                                </h2>
                                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                                    {payment.bank_links.map((b) => (
                                        <a
                                            key={b.name + b.link}
                                            href={b.link}
                                            className="hover:border-primary/40 hover:bg-muted/50 flex flex-col items-center gap-2 rounded-2xl border p-3 text-center transition"
                                        >
                                            <img src={b.logo} alt="" className="size-10 rounded-xl" loading="lazy" />
                                            <span className="line-clamp-1 text-xs font-medium">{b.description || b.name}</span>
                                        </a>
                                    ))}
                                </div>
                            </section>
                        )}

                        {payment.fake && (
                            <div className="rounded-2xl border border-dashed border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
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

                        <div className="bg-muted/60 flex items-center gap-3 rounded-2xl p-4 text-sm">
                            <LoaderCircle className="text-primary size-5 shrink-0 animate-spin" />
                            <span className="font-medium">{t('pay.waiting')}</span>
                        </div>
                    </>
                )}

                <p className="text-muted-foreground flex items-center justify-center gap-1.5 text-xs">
                    <ShieldCheck className="size-4" /> {t('pay.secure')}
                </p>
            </div>
        </SocialLayout>
    );
}
