import { mnt } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { type SharedData } from '@/types';
import { Link, usePage } from '@inertiajs/react';
import { Check, QrCode, Wallet } from 'lucide-react';

export type Method = 'wallet' | 'qpay';

/** The signed-in fan's wallet balance (0 when signed out). */
export function useWalletBalance(): number {
    return usePage<SharedData>().props.auth.user?.wallet_balance ?? 0;
}

/** The method to start with: the wallet when it covers the amount, otherwise QPay. */
export function defaultMethod(balance: number, amount: number): Method {
    return balance >= amount && amount > 0 ? 'wallet' : 'qpay';
}

/** Pay from the wallet balance or with QPay. The wallet can't be picked when it holds too little. */
export default function PayMethod({ amount, value, onChange }: { amount: number; value: Method; onChange: (m: Method) => void }) {
    const { t } = useT();
    const balance = useWalletBalance();
    const enough = balance >= amount;
    const card = (on: boolean) =>
        `relative flex w-full items-center gap-3 rounded-2xl p-3 text-left transition ${on ? 'bg-primary/10 shadow-sm' : 'bg-muted hover:bg-muted/70'}`;
    const dot = (on: boolean) => (
        <span className={`grid size-5 shrink-0 place-items-center rounded-full ${on ? 'bg-primary' : 'bg-card'}`}>
            {on && <Check className="text-primary-foreground size-3" strokeWidth={4} />}
        </span>
    );

    return (
        <div className="flex flex-col gap-2" role="radiogroup" aria-label={t('wal.method')}>
            <button
                type="button"
                role="radio"
                aria-checked={value === 'wallet'}
                disabled={!enough}
                onClick={() => onChange('wallet')}
                className={`${card(value === 'wallet')} disabled:cursor-not-allowed`}
            >
                {dot(value === 'wallet')}
                <span className="bg-primary/15 text-primary grid size-9 shrink-0 place-items-center rounded-xl">
                    <Wallet className="size-[18px]" />
                </span>
                <span className="min-w-0 flex-1">
                    <span className={`block font-bold ${enough ? '' : 'text-muted-foreground'}`}>{t('wal.title')}</span>
                    <span className={`block text-xs ${enough ? 'text-muted-foreground' : 'font-semibold text-amber-600 dark:text-amber-400'}`}>
                        {enough ? t('wal.balanceIs', { amount: mnt(balance) }) : t('wal.notEnough', { amount: mnt(balance) })}
                    </span>
                </span>
                {!enough && (
                    <Link
                        href={route('wallet', { topup: Math.max(amount - balance, 0) })}
                        onClick={(e) => e.stopPropagation()}
                        className="bg-card hover:bg-card/80 shrink-0 rounded-full px-3 py-1.5 text-xs font-bold shadow-sm"
                    >
                        {t('wal.topup')}
                    </Link>
                )}
            </button>
            <button type="button" role="radio" aria-checked={value === 'qpay'} onClick={() => onChange('qpay')} className={card(value === 'qpay')}>
                {dot(value === 'qpay')}
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-sky-500/15 text-sky-600 dark:text-sky-400">
                    <QrCode className="size-[18px]" />
                </span>
                <span className="min-w-0 flex-1">
                    <span className="block font-bold">QPay</span>
                    <span className="text-muted-foreground block text-xs">{t('wal.qpayHint')}</span>
                </span>
            </button>
        </div>
    );
}
