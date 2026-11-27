import { mnt } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { formatDuration } from '@/lib/use-uploads';
import { CalendarClock, Film, RefreshCw, TrendingDown, TrendingUp, Users, Wallet } from 'lucide-react';

/** "+18%" / "−5%" against the period before (nothing when there's nothing to compare with). */
export function Delta({ now, before }: { now: number; before: number }) {
    const { t } = useT();
    if (before <= 0 && now <= 0) return null;
    if (before <= 0) return <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">{t('ins.new')}</span>;
    const change = Math.round(((now - before) / before) * 100);
    if (change === 0) return <span className="text-muted-foreground text-xs font-semibold">±0%</span>;
    const up = change > 0;
    const Icon = up ? TrendingUp : TrendingDown;
    return (
        <span
            className={`inline-flex items-center gap-0.5 text-xs font-semibold ${up ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}
            title={t('ins.vsBefore')}
        >
            <Icon className="size-3.5" /> {up ? '+' : '−'}
            {Math.abs(change)}%
        </span>
    );
}

export type Health = { active: number; monthly: number; autoRenew: number; renewed: number; lapsed: number; endingSoon: number };

/** The subscriber base: what it brings in a month, who stays, who leaves, who's about to. */
export function SubscriberHealth({ h }: { h: Health }) {
    const { t } = useT();
    const kept = h.renewed + h.lapsed ? Math.round((h.renewed / (h.renewed + h.lapsed)) * 100) : null;
    const rows: [typeof Users, string, string, string?][] = [
        [Wallet, t('ins.monthly'), mnt(h.monthly), t('ins.monthlyHint')],
        [
            Users,
            t('ins.activeSubs'),
            h.active.toLocaleString('en-US'),
            h.active ? t('ins.autoRenewShare', { n: Math.round((h.autoRenew / h.active) * 100) }) : undefined,
        ],
        [RefreshCw, t('ins.kept'), kept === null ? '—' : `${kept}%`, t('ins.keptHint', { renewed: h.renewed, lapsed: h.lapsed })],
        [CalendarClock, t('ins.endingSoon'), h.endingSoon.toLocaleString('en-US'), t('ins.endingSoonHint')],
    ];
    return (
        <div className="bg-card rounded-2xl p-4 shadow-xs">
            <h2 className="mb-3 font-bold">{t('ins.health')}</h2>
            <ul className="grid gap-3 sm:grid-cols-2">
                {rows.map(([Icon, label, value, hint]) => (
                    <li key={label} className="bg-muted/50 rounded-xl p-3">
                        <p className="text-muted-foreground flex items-center gap-1.5 text-xs font-semibold">
                            <Icon className="size-3.5" /> {label}
                        </p>
                        <p className="mt-1 text-xl font-extrabold tabular-nums">{value}</p>
                        {hint && <p className="text-muted-foreground mt-0.5 text-xs">{hint}</p>}
                    </li>
                ))}
            </ul>
        </div>
    );
}

const DAYS: Parameters<ReturnType<typeof useT>['t']>[0][] = ['ins.mon', 'ins.tue', 'ins.wed', 'ins.thu', 'ins.fri', 'ins.sat', 'ins.sun'];

/** When fans respond (likes and comments), weekday × hour in Mongolian time, and the best hour to post. */
export function ActivityHeatmap({ grid }: { grid: number[][] }) {
    const { t } = useT();
    const max = Math.max(0, ...grid.flat());
    let best: [number, number] | null = null;
    grid.forEach((row, d) => row.forEach((v, h) => (best === null || v > grid[best[0]][best[1]] ? (best = [d, h]) : null)));
    const top = best as [number, number] | null;

    return (
        <div className="bg-card rounded-2xl p-4 shadow-xs">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-bold">{t('ins.activity')}</h2>
                {max > 0 && top && (
                    <p className="text-sm">
                        {t('ins.bestTime')}{' '}
                        <span className="text-primary font-bold">
                            {t(DAYS[top[0]])} {String(top[1]).padStart(2, '0')}:00–{String((top[1] + 1) % 24).padStart(2, '0')}:00
                        </span>
                    </p>
                )}
            </div>
            {max === 0 ? (
                <p className="text-muted-foreground text-sm">{t('ins.activityEmpty')}</p>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[520px] border-separate border-spacing-[3px] text-[10px]">
                        <thead>
                            <tr>
                                <th />
                                {Array.from({ length: 24 }, (_, h) => (
                                    <th key={h} className="text-muted-foreground font-medium">
                                        {h % 3 === 0 ? h : ''}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {grid.map((row, d) => (
                                <tr key={d}>
                                    <th className="text-muted-foreground pr-1 text-right font-medium">{t(DAYS[d])}</th>
                                    {row.map((v, h) => (
                                        <td
                                            key={h}
                                            title={`${t(DAYS[d])} ${h}:00 · ${v}`}
                                            className="bg-primary h-5 rounded-[3px]"
                                            style={{ opacity: v ? 0.15 + 0.85 * (v / max) : 0.06 }}
                                        />
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            <p className="text-muted-foreground mt-2 text-xs">{t('ins.activityHint')}</p>
        </div>
    );
}

export type VideoRow = {
    id: number;
    post_id: number | null;
    body: string | null;
    poster: string | null;
    duration: number | null;
    plays: number;
    avgPercent: number;
    finished: number;
    seconds: number;
};

/** Per video: plays, how much people watch on average, how many watch to the end, total time watched. */
export function VideoTable({ videos }: { videos: VideoRow[] }) {
    const { t } = useT();
    return (
        <div className="bg-card rounded-2xl p-4 shadow-xs">
            <h2 className="mb-1 font-bold">{t('ins.videos')}</h2>
            <p className="text-muted-foreground mb-3 text-xs">{t('ins.videosHint')}</p>
            {videos.length === 0 ? (
                <p className="text-muted-foreground text-sm">{t('ins.videosEmpty')}</p>
            ) : (
                <ul className="flex flex-col divide-y">
                    {videos.map((v) => (
                        <li key={v.id} className="flex items-center gap-3 py-2.5">
                            <span className="bg-muted relative grid aspect-video w-20 shrink-0 place-items-center overflow-hidden rounded-lg">
                                {v.poster ? (
                                    <img src={v.poster} alt="" className="size-full object-cover" loading="lazy" />
                                ) : (
                                    <Film className="text-muted-foreground size-5" />
                                )}
                                {v.duration ? (
                                    <span className="absolute right-1 bottom-1 rounded bg-black/65 px-1 text-[10px] font-bold text-white tabular-nums">
                                        {formatDuration(v.duration)}
                                    </span>
                                ) : null}
                            </span>
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold">{v.body ?? t('ins.untitled')}</p>
                                {/* How far people get, on average. */}
                                <div className="bg-muted mt-1.5 h-1.5 overflow-hidden rounded-full">
                                    <div className="bg-primary h-full" style={{ width: `${v.avgPercent}%` }} />
                                </div>
                            </div>
                            <dl className="grid shrink-0 grid-cols-2 gap-x-4 text-right text-xs sm:grid-cols-4">
                                <Stat label={t('ins.plays')} value={v.plays.toLocaleString('en-US')} />
                                <Stat label={t('ins.avgWatched')} value={`${v.avgPercent}%`} />
                                <Stat label={t('ins.finished')} value={v.plays ? `${Math.round((v.finished / v.plays) * 100)}%` : '—'} />
                                <Stat label={t('ins.watchTime')} value={formatDuration(v.seconds)} />
                            </dl>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

function Stat({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-bold tabular-nums">{value}</dd>
        </div>
    );
}
