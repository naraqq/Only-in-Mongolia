import BarChart from '@/components/bar-chart';
import StudioLayout from '@/layouts/studio-layout';
import { mnt } from '@/lib/format';
import { useT, type TKey } from '@/lib/i18n';
import { Link, router } from '@inertiajs/react';
import { Eye, FileText, Gift, HandCoins, Heart, LockOpen, MessageCircle, Star, UserPlus, Users, Wallet, type LucideIcon } from 'lucide-react';

type Point = { date: string; value: number };
type Purpose = 'subscription' | 'tip' | 'ppv';
type PostRow = {
    id: number;
    body: string | null;
    thumb: string | null;
    media: number;
    price: number | null;
    visibility: string;
    created_at: string;
    views: number;
    likes: number;
    comments: number;
    earned: number;
};

const SOURCES: [Purpose, TKey, LucideIcon][] = [
    ['subscription', 'ea.subscription', Star],
    ['tip', 'tip.for', HandCoins],
    ['ppv', 'ppv.option', LockOpen],
];

/** Studio → Insights: how many people see the posts, how the page grows, where the money comes from, which posts work. */
export default function Insights({
    days,
    ranges,
    totals,
    series,
    bySource,
    posts,
}: {
    days: number;
    ranges: number[];
    totals: { views: number; earnings: number; newSubscriptions: number; newFollowers: number; activeSubscribers: number; trials: number };
    series: { views: Point[]; earnings: Point[]; subs: Point[]; followers: Point[] };
    bySource: Partial<Record<Purpose, { total: number; count: number }>>;
    posts: PostRow[];
}) {
    const { t } = useT();
    const num = (n: number) => n.toLocaleString('en-US');
    const sourceMax = Math.max(1, ...SOURCES.map(([k]) => bySource[k]?.total ?? 0));
    const sourceTotal = SOURCES.reduce((s, [k]) => s + (bySource[k]?.total ?? 0), 0);

    return (
        <StudioLayout
            title={t('ins.title')}
            subtitle={t('ins.sub')}
            actions={
                <div className="bg-muted inline-flex rounded-full p-1">
                    {ranges.map((r) => (
                        <button
                            key={r}
                            type="button"
                            onClick={() => router.get(route('studio.insights'), { days: r }, { preserveScroll: true, preserveState: true })}
                            className={`h-8 rounded-full px-3 text-sm font-semibold transition ${days === r ? 'bg-card shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                            {t('ins.days', { n: r })}
                        </button>
                    ))}
                </div>
            }
        >
            <div className="flex flex-col gap-5">
                <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                    <Tile icon={Eye} label={t('ins.views')} value={num(totals.views)} />
                    <Tile icon={Wallet} label={t('ins.earned')} value={mnt(totals.earnings)} />
                    <Tile
                        icon={Users}
                        label={t('ins.newSubs')}
                        value={num(totals.newSubscriptions)}
                        sub={
                            t('ins.activeNow', { n: totals.activeSubscribers }) + (totals.trials ? ` · ${t('ins.trials', { n: totals.trials })}` : '')
                        }
                    />
                    <Tile icon={UserPlus} label={t('ins.newFollowers')} value={num(totals.newFollowers)} />
                </section>

                <section className="grid items-start gap-5 lg:grid-cols-2">
                    <BarChart title={t('ins.viewsDaily')} data={series.views} format={num} />
                    <BarChart title={t('ins.earnedDaily')} data={series.earnings} format={mnt} />
                    <BarChart title={t('ins.subsDaily')} data={series.subs} format={num} />
                    <BarChart title={t('ins.followersDaily')} data={series.followers} format={num} />
                </section>

                <section className="grid items-start gap-5 lg:grid-cols-3">
                    <div className="bg-card rounded-2xl p-4 shadow-xs">
                        <h2 className="mb-3 font-bold">{t('ins.bySource')}</h2>
                        <ul className="flex flex-col gap-4">
                            {SOURCES.map(([key, label, Icon]) => {
                                const v = bySource[key]?.total ?? 0;
                                return (
                                    <li key={key}>
                                        <div className="flex items-baseline justify-between gap-2 text-sm">
                                            <span className="flex items-center gap-1.5 font-semibold">
                                                <Icon className="text-muted-foreground size-4" /> {t(label)}
                                            </span>
                                            <span className="font-bold tabular-nums">{mnt(v)}</span>
                                        </div>
                                        <div className="bg-muted mt-1.5 h-2 overflow-hidden rounded-full">
                                            <div className="bg-primary h-full rounded-full" style={{ width: `${(v / sourceMax) * 100}%` }} />
                                        </div>
                                        <p className="text-muted-foreground mt-1 text-xs tabular-nums">
                                            {t('ad.payments', { n: bySource[key]?.count ?? 0 })} ·{' '}
                                            {sourceTotal ? Math.round((v / sourceTotal) * 100) : 0}%
                                        </p>
                                    </li>
                                );
                            })}
                        </ul>
                        <p className="text-muted-foreground mt-4 text-xs">{t('ins.netNote')}</p>
                    </div>

                    <div className="bg-card overflow-hidden rounded-2xl shadow-xs lg:col-span-2">
                        <h2 className="px-4 pt-4 pb-3 font-bold">{t('ins.topPosts')}</h2>
                        {posts.length === 0 ? (
                            <p className="text-muted-foreground px-4 pb-6 text-sm">{t('st.empty')}</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[560px] text-sm">
                                    <thead>
                                        <tr className="text-muted-foreground text-left text-xs">
                                            <th className="px-4 pb-2 font-semibold">{t('ins.post')}</th>
                                            <th className="px-3 pb-2 text-right font-semibold">
                                                <Eye className="ml-auto size-4" aria-label={t('ins.views')} />
                                            </th>
                                            <th className="px-3 pb-2 text-right font-semibold">
                                                <Heart className="ml-auto size-4" aria-label={t('po.like')} />
                                            </th>
                                            <th className="px-3 pb-2 text-right font-semibold">
                                                <MessageCircle className="ml-auto size-4" aria-label={t('po.comments')} />
                                            </th>
                                            <th className="px-4 pb-2 text-right font-semibold">{t('ins.earnedCol')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {posts.map((p) => (
                                            <tr key={p.id} className="hover:bg-muted/40 transition">
                                                <td className="max-w-0 px-4 py-2.5">
                                                    <Link href={`${route('studio')}#post-${p.id}`} className="flex items-center gap-3">
                                                        <span className="bg-muted grid size-11 shrink-0 place-items-center overflow-hidden rounded-lg">
                                                            {p.thumb ? (
                                                                <img src={p.thumb} alt="" className="size-full object-cover" loading="lazy" />
                                                            ) : (
                                                                <FileText className="text-muted-foreground size-5" />
                                                            )}
                                                        </span>
                                                        <span className="min-w-0">
                                                            <span className="block truncate font-medium">
                                                                {p.body ?? t('ins.mediaOnly', { n: p.media })}
                                                            </span>
                                                            <span className="text-muted-foreground flex items-center gap-1 text-xs">
                                                                {p.created_at.slice(0, 10).replaceAll('-', '.')}
                                                                {p.price ? (
                                                                    <span className="text-amber-600">· {mnt(p.price)}</span>
                                                                ) : p.visibility === 'public' ? (
                                                                    <span>· {t('po.public')}</span>
                                                                ) : null}
                                                            </span>
                                                        </span>
                                                    </Link>
                                                </td>
                                                <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{num(p.views)}</td>
                                                <td className="text-muted-foreground px-3 py-2.5 text-right tabular-nums">{num(p.likes)}</td>
                                                <td className="text-muted-foreground px-3 py-2.5 text-right tabular-nums">{num(p.comments)}</td>
                                                <td className="px-4 py-2.5 text-right font-bold tabular-nums">{p.earned ? mnt(p.earned) : '—'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </section>
                {totals.trials > 0 && (
                    <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
                        <Gift className="size-3.5" /> {t('ins.trialsNote', { n: totals.trials })}
                    </p>
                )}
            </div>
        </StudioLayout>
    );
}

function Tile({ icon: Icon, label, value, sub }: { icon: LucideIcon; label: string; value: string; sub?: string }) {
    return (
        <div className="bg-card rounded-2xl p-4 shadow-xs">
            <div className="flex items-center justify-between gap-2">
                <p className="text-muted-foreground text-sm font-medium">{label}</p>
                <span className="bg-primary/10 text-primary grid size-9 shrink-0 place-items-center rounded-xl">
                    <Icon className="size-[18px]" />
                </span>
            </div>
            <p className="mt-2 text-2xl font-extrabold tracking-tight tabular-nums sm:text-[28px]">{value}</p>
            {sub && <p className="text-muted-foreground mt-0.5 text-xs">{sub}</p>}
        </div>
    );
}
