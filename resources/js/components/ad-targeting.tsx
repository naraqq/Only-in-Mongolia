import { useT, type TKey } from '@/lib/i18n';

export type Placement = 'all' | 'feed' | 'creators';

const PLACES: [Placement, TKey, TKey][] = [
    ['all', 'tg.all', 'tg.allSub'],
    ['feed', 'tg.feed', 'tg.feedSub'],
    ['creators', 'tg.creators', 'tg.creatorsSub'],
];
const CAPS: (number | null)[] = [null, 1, 2, 3, 5];

/** Where a banner shows, how often one person sees it a day, and whether it may appear on 18+ creators' pages. */
export default function AdTargeting({
    placement,
    frequencyCap,
    allowAdult,
    onChange,
}: {
    placement: Placement;
    frequencyCap: number | null;
    allowAdult: boolean;
    onChange: (change: { placement?: Placement; frequency_cap?: number | null; allow_adult?: boolean }) => void;
}) {
    const { t } = useT();
    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
                <span className="text-sm font-semibold">{t('tg.where')}</span>
                <div className="grid gap-2 sm:grid-cols-3">
                    {PLACES.map(([value, label, sub]) => (
                        <button
                            key={value}
                            type="button"
                            onClick={() => onChange({ placement: value })}
                            aria-pressed={placement === value}
                            className={`rounded-xl border-2 p-2.5 text-left transition ${placement === value ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'}`}
                        >
                            <span className="block text-sm font-bold">{t(label)}</span>
                            <span className="text-muted-foreground block text-xs">{t(sub)}</span>
                        </button>
                    ))}
                </div>
            </div>
            <div className="flex flex-col gap-1.5">
                <span className="text-sm font-semibold">{t('tg.often')}</span>
                <div className="bg-muted inline-flex flex-wrap gap-1 self-start rounded-xl p-1">
                    {CAPS.map((cap) => (
                        <button
                            key={cap ?? 'none'}
                            type="button"
                            onClick={() => onChange({ frequency_cap: cap })}
                            aria-pressed={frequencyCap === cap}
                            className={`h-8 rounded-lg px-3 text-sm font-semibold ${frequencyCap === cap ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}
                        >
                            {cap === null ? t('tg.noLimit') : t('tg.perDay', { n: cap })}
                        </button>
                    ))}
                </div>
                <span className="text-muted-foreground text-xs">{t('tg.oftenHint')}</span>
            </div>
            <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1" checked={allowAdult} onChange={(e) => onChange({ allow_adult: e.target.checked })} />
                <span>
                    <span className="font-semibold">{t('ads.allowAdult')}</span>
                    <span className="text-muted-foreground block text-xs">{t('ads.allowAdultHint')}</span>
                </span>
            </label>
        </div>
    );
}

/** A short line: "Feed pages · up to 3 a day · 18+ too". */
export function targetingSummary(
    t: ReturnType<typeof useT>['t'],
    ad: { placement?: Placement | null; frequency_cap?: number | null; allow_adult?: boolean },
): string {
    const where = t(ad.placement === 'feed' ? 'tg.feed' : ad.placement === 'creators' ? 'tg.creators' : 'tg.all');
    return [where, ad.frequency_cap ? t('tg.upTo', { n: ad.frequency_cap }) : null, ad.allow_adult ? '18+' : null].filter(Boolean).join(' · ');
}
