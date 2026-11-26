import InputError from '@/components/input-error';
import PayMethod, { useWalletBalance, type Method } from '@/components/pay-method';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { mnt } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { router, usePage } from '@inertiajs/react';
import { LoaderCircle, LockOpen } from 'lucide-react';
import { useState, type ReactNode } from 'react';

/**
 * Buy a pay-per-view post or message. When the wallet covers the price, ask wallet or QPay first;
 * otherwise go straight to the QPay checkout.
 */
export default function UnlockButton({ href, price, className, children }: { href: string; price: number; className: string; children: ReactNode }) {
    const { t } = useT();
    const balance = useWalletBalance();
    const { errors } = usePage<{ errors: Record<string, string> }>().props;
    const [open, setOpen] = useState(false);
    const [method, setMethod] = useState<Method>('wallet');
    const [busy, setBusy] = useState(false);

    const buy = (wallet: boolean) =>
        router.post(href, { wallet }, { preserveScroll: true, onStart: () => setBusy(true), onFinish: () => setBusy(false) });

    return (
        <>
            <button type="button" className={className} onClick={() => (balance >= price ? setOpen(true) : buy(false))} disabled={busy}>
                {children}
            </button>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="gap-0 rounded-3xl p-0 sm:max-w-sm">
                    <div className="flex flex-col gap-4 p-6">
                        <div className="text-center">
                            <span className="mx-auto grid size-14 place-items-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-950">
                                <LockOpen className="size-7" />
                            </span>
                            <DialogTitle className="mt-3 text-xl font-extrabold">{t('ppv.unlock', { price: mnt(price) })}</DialogTitle>
                            <DialogDescription className="mt-1 text-sm">{t('wal.unlockSub')}</DialogDescription>
                        </div>
                        <PayMethod amount={price} value={method} onChange={setMethod} />
                        <InputError message={errors.payment} />
                        <button
                            type="button"
                            disabled={busy}
                            onClick={() => buy(method === 'wallet')}
                            className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 font-bold text-white shadow-lg shadow-amber-500/25 transition hover:brightness-110 disabled:opacity-40"
                        >
                            {busy && <LoaderCircle className="size-5 animate-spin" />}
                            {method === 'wallet' ? t('wal.payNow', { amount: mnt(price) }) : t('co.continue', { price: mnt(price) })}
                        </button>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
