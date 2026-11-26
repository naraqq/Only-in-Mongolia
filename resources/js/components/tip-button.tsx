import InputError from '@/components/input-error';
import PayMethod, { useWalletBalance, type Method } from '@/components/pay-method';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { mnt } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { type SharedData } from '@/types';
import { Link, useForm, usePage } from '@inertiajs/react';
import { HandCoins, LoaderCircle } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';

const PRESETS = [2000, 5000, 10000, 20000];

/**
 * "Tip" for a creator: preset or custom amount and an optional note, then the QPay checkout.
 * `children` is the trigger's content; without it a small "₮ Tip" pill is shown.
 */
export default function TipButton({
    handle,
    name,
    postId,
    className = '',
    children,
}: {
    handle: string;
    name: string;
    postId?: number;
    className?: string;
    children?: ReactNode;
}) {
    const { t } = useT();
    const { auth, tipLimits } = usePage<SharedData & { tipLimits: { min: number; max: number } }>().props;
    const [open, setOpen] = useState(false);
    const balance = useWalletBalance();
    const form = useForm({ amount: 5000, note: '', post_id: postId ?? null, wallet: (balance >= 5000) as boolean });
    const method: Method = form.data.wallet && balance >= form.data.amount ? 'wallet' : 'qpay';
    const trigger = children ?? (
        <>
            <HandCoins className="size-4" /> {t('tip.tip')}
        </>
    );

    if (!auth.user) {
        return (
            <Link href={route('login')} className={className}>
                {trigger}
            </Link>
        );
    }

    const valid = form.data.amount >= tipLimits.min && form.data.amount <= tipLimits.max;

    function submit(e: FormEvent) {
        e.preventDefault();
        form.post(route('creator.tip', handle), { preserveScroll: true });
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <button type="button" className={className}>
                    {trigger}
                </button>
            </DialogTrigger>
            <DialogContent className="gap-0 rounded-3xl p-0 sm:max-w-sm">
                <form onSubmit={submit} className="flex flex-col gap-4 p-6">
                    <div className="text-center">
                        <span className="mx-auto grid size-14 place-items-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-950">
                            <HandCoins className="size-7" />
                        </span>
                        <DialogTitle className="mt-3 text-xl font-extrabold">{t('tip.title', { name })}</DialogTitle>
                        <DialogDescription className="mt-1 text-sm">{t('tip.sub')}</DialogDescription>
                    </div>

                    <div className="grid grid-cols-4 gap-2">
                        {PRESETS.map((a) => (
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
                            value={form.data.amount ? form.data.amount.toLocaleString('en-US') : ''}
                            onChange={(e) => form.setData('amount', Number(e.target.value.replace(/\D/g, '').slice(0, 7)))}
                            className="w-full bg-transparent px-2 text-2xl font-extrabold tabular-nums outline-none"
                            aria-label={t('tip.amount')}
                        />
                    </label>
                    {!valid && form.data.amount > 0 && (
                        <p className="-mt-2 text-xs text-amber-600">{t('tip.limits', { min: mnt(tipLimits.min), max: mnt(tipLimits.max) })}</p>
                    )}
                    <InputError message={form.errors.amount} className="-mt-2" />

                    <textarea
                        value={form.data.note}
                        onChange={(e) => form.setData('note', e.target.value)}
                        maxLength={200}
                        rows={2}
                        placeholder={t('tip.notePh')}
                        className="bg-muted resize-none rounded-2xl px-4 py-3 text-sm outline-none"
                    />
                    <InputError message={(form.errors as Record<string, string>).payment ?? form.errors.note} />

                    <PayMethod amount={form.data.amount} value={method} onChange={(m) => form.setData('wallet', m === 'wallet')} />

                    <button
                        type="submit"
                        disabled={!valid || form.processing}
                        className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 font-bold text-white shadow-lg shadow-amber-500/25 transition hover:brightness-110 disabled:opacity-40 disabled:shadow-none"
                    >
                        {form.processing && <LoaderCircle className="size-5 animate-spin" />}
                        {t('tip.send', { amount: mnt(form.data.amount || 0) })}
                    </button>
                </form>
            </DialogContent>
        </Dialog>
    );
}
