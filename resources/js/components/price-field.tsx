import { mnt, priceOk } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { usePage } from '@inertiajs/react';
import { Lock } from 'lucide-react';

/** Compact "🔒 ₮ [5,000]" input for a pay-per-view price, with the allowed range as a hint. */
export default function PriceField({ value, onChange }: { value: number; onChange: (v: number) => void }) {
    const { t } = useT();
    const { ppvLimits } = usePage<{ ppvLimits: { min: number; max: number } }>().props;
    const ok = priceOk(value, ppvLimits);

    return (
        <span className="inline-flex items-center gap-2">
            <label
                className={`inline-flex h-8 items-center gap-1 rounded-full border px-3 text-sm font-semibold ${ok ? 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300' : 'border-red-300 text-red-600'}`}
                title={t('ppv.range', { min: mnt(ppvLimits.min), max: mnt(ppvLimits.max) })}
            >
                <Lock className="size-3.5" /> ₮
                <input
                    inputMode="numeric"
                    autoFocus
                    value={value ? value.toLocaleString('en-US') : ''}
                    onChange={(e) => onChange(Number(e.target.value.replace(/\D/g, '').slice(0, 7)))}
                    className="w-20 bg-transparent tabular-nums outline-none"
                    aria-label={t('ppv.price')}
                />
            </label>
            {!ok && <span className="text-xs text-red-600">{t('ppv.range', { min: mnt(ppvLimits.min), max: mnt(ppvLimits.max) })}</span>}
        </span>
    );
}
