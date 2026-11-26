import InputError from '@/components/input-error';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { mnt } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { useForm } from '@inertiajs/react';
import { LoaderCircle, Wallet } from 'lucide-react';
import { useEffect, type FormEvent } from 'react';

const PRESETS = [10000, 20000, 50000, 100000];

/** Add money to the wallet: pick or type an amount, then pay it with QPay. */
export default function TopupDialog({
    open,
    onOpenChange,
    balance,
    limits,
    suggested,
}: {
    open: boolean;
    onOpenChange: (o: boolean) => void;
    balance: number;
    limits: { min: number; max: number };
    /** Start with this amount (e.g. what's missing for a purchase). */
    suggested?: number;
}) {
    const { t } = useT();
    const form = useForm({ amount: 20000 });
    const valid = form.data.amount >= limits.min && form.data.amount <= limits.max;

    useEffect(() => {
        if (open && suggested) form.setData('amount', Math.min(limits.max, Math.max(limits.min, Math.ceil(suggested / 1000) * 1000)));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, suggested]);

    function submit(e: FormEvent) {
        e.preventDefault();
        form.post(route('wallet.topup'));
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="gap-0 rounded-3xl p-0 sm:max-w-sm">
                <form onSubmit={submit} className="flex flex-col gap-4 p-6">
                    <div className="text-center">
                        <span className="bg-primary/15 text-primary mx-auto grid size-14 place-items-center rounded-full">
                            <Wallet className="size-7" />
                        </span>
                        <DialogTitle className="mt-3 text-xl font-extrabold">{t('wal.topupTitle')}</DialogTitle>
                        <DialogDescription className="mt-1 text-sm">{t('wal.balanceIs', { amount: mnt(balance) })}</DialogDescription>
                    </div>

                    <div className="grid grid-cols-4 gap-2">
                        {PRESETS.filter((a) => a <= limits.max).map((a) => (
                            <button
                                key={a}
                                type="button"
                                onClick={() => form.setData('amount', a)}
                                className={`rounded-xl py-2.5 text-sm font-bold transition ${
                                    form.data.amount === a ? 'bg-primary/15 text-primary' : 'bg-muted hover:bg-muted/70'
                                }`}
                            >
                                {a / 1000}k
                            </button>
                        ))}
                    </div>

                    <label className="focus-within:ring-primary/15 bg-muted flex h-14 items-center rounded-2xl px-4 transition focus-within:ring-4">
                        <span className="text-muted-foreground text-lg font-semibold">₮</span>
                        <input
                            inputMode="numeric"
                            autoFocus
                            value={form.data.amount ? form.data.amount.toLocaleString('en-US') : ''}
                            onChange={(e) => form.setData('amount', Number(e.target.value.replace(/\D/g, '').slice(0, 7)))}
                            className="w-full bg-transparent px-2 text-2xl font-extrabold tabular-nums outline-none"
                            aria-label={t('tip.amount')}
                        />
                    </label>
                    <p className={`-mt-2 text-xs ${valid || !form.data.amount ? 'text-muted-foreground' : 'text-amber-600'}`}>
                        {t('tip.limits', { min: mnt(limits.min), max: mnt(limits.max) })} ·{' '}
                        {t('wal.after', { amount: mnt(balance + (form.data.amount || 0)) })}
                    </p>
                    <InputError message={form.errors.amount ?? (form.errors as Record<string, string>).payment} className="-mt-2" />

                    <button
                        type="submit"
                        disabled={!valid || form.processing}
                        className="from-primary shadow-primary/25 flex h-12 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r to-rose-500 font-bold text-white shadow-lg transition hover:brightness-110 disabled:opacity-40 disabled:shadow-none"
                    >
                        {form.processing && <LoaderCircle className="size-5 animate-spin" />}
                        {t('wal.topupPay', { amount: mnt(form.data.amount || 0) })}
                    </button>
                </form>
            </DialogContent>
        </Dialog>
    );
}
