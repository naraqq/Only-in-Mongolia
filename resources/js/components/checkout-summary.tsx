import UserAvatar from '@/components/user-avatar';
import { coverBg, mnt } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { BadgeCheck } from 'lucide-react';

export type CheckoutCreator = { handle: string; display_name: string; avatar_url: string | null; cover_url: string | null };
type Line = { label: string; value: string; tone?: 'muted' | 'good' };

/** The order summary card on checkout pages: who you're paying, the line items and the total. */
export default function CheckoutSummary({ creator, lines, total }: { creator: CheckoutCreator; lines: Line[]; total: number }) {
    const { t } = useT();

    return (
        <div className="border-border bg-card overflow-hidden rounded-xl border">
            <div className={`relative h-20 ${coverBg(creator.handle, !!creator.cover_url)}`}>
                {creator.cover_url && <img src={creator.cover_url} alt="" className="size-full object-cover" />}
            </div>
            <div className="px-5 pb-5">
                <div className="relative flex items-center gap-3 pt-3">
                    <UserAvatar name={creator.display_name} src={creator.avatar_url} seed={creator.handle} className="size-11 text-lg" />
                    <div className="min-w-0 pb-1">
                        <p className="flex items-center gap-1 font-bold">
                            <span className="truncate">{creator.display_name}</span>
                            <BadgeCheck className="text-primary size-4 shrink-0" />
                        </p>
                        <p className="text-muted-foreground truncate text-sm">@{creator.handle}</p>
                    </div>
                </div>

                <h2 className="text-muted-foreground mt-5 text-xs font-semibold tracking-wider uppercase">{t('co.summary')}</h2>
                <dl className="mt-2 flex flex-col gap-2 text-sm">
                    {lines.map((l) => (
                        <div key={l.label} className="flex items-baseline justify-between gap-3">
                            <dt className={l.tone === 'muted' ? 'text-muted-foreground' : ''}>{l.label}</dt>
                            <dd
                                className={`font-semibold tabular-nums ${l.tone === 'good' ? 'text-emerald-600' : l.tone === 'muted' ? 'text-muted-foreground' : ''}`}
                            >
                                {l.value}
                            </dd>
                        </div>
                    ))}
                </dl>
                <div className="border-border mt-4 flex items-baseline justify-between border-t pt-4">
                    <span className="font-bold">{t('co.total')}</span>
                    <span className="text-2xl font-extrabold tracking-tight tabular-nums">{mnt(total)}</span>
                </div>
            </div>
        </div>
    );
}
