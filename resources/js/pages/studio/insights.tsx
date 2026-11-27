import BarChart from '@/components/bar-chart';
import { ActivityHeatmap, Delta, SubscriberHealth, VideoTable, type Health, type VideoRow } from '@/components/insights-extra';
import StudioLayout from '@/layouts/studio-layout';
import { mnt } from '@/lib/format';
import { useT, type TKey } from '@/lib/i18n';
import { Link, router } from '@inertiajs/react';
import {
    Check,
    Compass,
    Copy,
    Eye,
    FileText,
    Gift,
    HandCoins,
    Heart,
    LockOpen,
    MessageCircle,
    MessageCircleQuestion,
    MousePointerClick,
    Star,
    UserPlus,
    Users,
    Wallet,
    type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';

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
    conversions,
    shareLink,
    qas,
    previous,
    health,
    activity,
    videos,
}: {
    previous: { views: number; earnings: number; newSubscriptions: number; newFollowers: number };
    health: Health;
    activity: number[][];
    videos: VideoRow[];
    qas: QaRow[];
    days: number;
    ranges: number[];
    totals: { views: number; earnings: number; newSubscriptions: number; newFollowers: number; activeSubscribers: number; trials: number };
    series: { views: Point[]; earnings: Point[]; subs: Point[]; followers: Point[] };
    bySource: Partial<Record<Purpose, { total: number; count: number }>>;
    posts: PostRow[];
    conversions: ConversionData;
    shareLink: string;
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
                    <Tile icon={Eye} label={t('ins.views')} value={num(totals.views)} delta={<Delta now={totals.views} before={previous.views} />} />
                    <Tile
                        icon={Wallet}
                        label={t('ins.earned')}
                        value={mnt(totals.earnings)}
                        delta={<Delta now={totals.earnings} before={previous.earnings} />}
                    />
                    <Tile
                        icon={Users}
                        label={t('ins.newSubs')}
                        value={num(totals.newSubscriptions)}
                        delta={<Delta now={totals.newSubscriptions} before={previous.newSubscriptions} />}
                        sub={
                            t('ins.activeNow', { n: totals.activeSubscribers }) + (totals.trials ? ` · ${t('ins.trials', { n: totals.trials })}` : '')
                        }
                    />
                    <Tile
                        icon={UserPlus}
                        label={t('ins.newFollowers')}
                        value={num(totals.newFollowers)}
                        delta={<Delta now={totals.newFollowers} before={previous.newFollowers} />}
                    />
                </section>

                <section className="grid items-start gap-5 lg:grid-cols-2">
                    <SubscriberHealth h={health} />
                    <ActivityHeatmap grid={activity} />
                </section>

                <VideoTable videos={videos} />

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
                <Conversions data={conversions} shareLink={shareLink} />

                {qas.length > 0 && <QaDemand qas={qas} />}

                {totals.trials > 0 && (
                    <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
                        <Gift className="size-3.5" /> {t('ins.trialsNote', { n: totals.trials })}
                    </p>
                )}
            </div>
        </StudioLayout>
    );
}

type ConversionData = {
    freePosts: {
        id: number;
        body: string | null;
        thumb: string | null;
        media: number;
        created_at: string;
        views: number;
        follows: number;
        subscribed: number;
    }[];
    places: {
        source: string;
        id: number | null;
        label: string | null;
        visitors: number | null;
        follows: number;
        subscriptions: number;
        revenue: number;
    }[];
    referrers: { referrer: string; visitors: number; follows: number; subscriptions: number }[];
};

const PLACES: Record<string, TKey> = {
    profile: 'conv.place.profile',
    series: 'conv.place.series',
    post: 'conv.place.post',
    home: 'conv.place.home',
    feed: 'conv.place.feed',
    discover: 'conv.place.discover',
    search: 'conv.place.search',
    messages: 'conv.place.messages',
    saved: 'conv.place.saved',
    notifications: 'conv.place.notifications',
    creator: 'conv.place.creator',
    other: 'conv.place.other',
};

const pct = (part: number, whole: number | null) => (whole ? `${Math.round((part / whole) * 1000) / 10}%` : '—');

/** Which free posts win followers, where Follow/Subscribe gets clicked, and how people find the page. */
function Conversions({ data, shareLink }: { data: ConversionData; shareLink: string }) {
    const { t } = useT();
    const num = (n: number) => n.toLocaleString('en-US');
    const [copied, setCopied] = useState(false);
    const tagged = `${shareLink}?ref=instagram`;
    const place = (source: string) => t(PLACES[source] ?? 'conv.place.other');
    const referrer = (r: string) =>
        r === 'direct'
            ? t('conv.ref.direct')
            : r.startsWith('app:')
              ? t('conv.ref.app', { place: place(r.slice(4)) })
              : r.startsWith('ref:')
                ? `#${r.slice(4)}`
                : r;
    const th = 'px-3 pb-2 text-right font-semibold';

    return (
        <section className="flex flex-col gap-5">
            <div>
                <h2 className="text-lg font-bold">{t('conv.title')}</h2>
                <p className="text-muted-foreground text-sm">{t('conv.sub')}</p>
            </div>

            <div className="bg-card overflow-hidden rounded-2xl shadow-xs">
                <h3 className="flex items-center gap-2 px-4 pt-4 font-bold">
                    <UserPlus className="text-primary size-4" /> {t('conv.freePosts')}
                </h3>
                <p className="text-muted-foreground px-4 pb-3 text-xs">{t('conv.freePostsNote')}</p>
                {data.freePosts.length === 0 ? (
                    <p className="text-muted-foreground px-4 pb-6 text-sm">{t('conv.freePostsEmpty')}</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[560px] text-sm">
                            <thead>
                                <tr className="text-muted-foreground text-left text-xs">
                                    <th className="px-4 pb-2 font-semibold">{t('ins.post')}</th>
                                    <th className={th}>{t('ins.views')}</th>
                                    <th className={th}>{t('conv.follows')}</th>
                                    <th className={th}>{t('conv.followRate')}</th>
                                    <th className="px-4 pb-2 text-right font-semibold">{t('conv.thenSubscribed')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.freePosts.map((p) => (
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
                                                    <span className="block truncate font-medium">{p.body ?? t('ins.mediaOnly', { n: p.media })}</span>
                                                    <span className="text-muted-foreground text-xs">
                                                        {p.created_at.slice(0, 10).replaceAll('-', '.')}
                                                    </span>
                                                </span>
                                            </Link>
                                        </td>
                                        <td className="text-muted-foreground px-3 py-2.5 text-right tabular-nums">{num(p.views)}</td>
                                        <td className="px-3 py-2.5 text-right font-bold tabular-nums">{num(p.follows)}</td>
                                        <td className="text-muted-foreground px-3 py-2.5 text-right tabular-nums">{pct(p.follows, p.views)}</td>
                                        <td className="px-4 py-2.5 text-right font-semibold tabular-nums">
                                            {p.subscribed ? num(p.subscribed) : '—'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <div className="grid items-start gap-5 lg:grid-cols-2">
                <div className="bg-card overflow-hidden rounded-2xl shadow-xs">
                    <h3 className="flex items-center gap-2 px-4 pt-4 font-bold">
                        <MousePointerClick className="text-primary size-4" /> {t('conv.places')}
                    </h3>
                    <p className="text-muted-foreground px-4 pb-3 text-xs">{t('conv.placesNote')}</p>
                    {data.places.length === 0 ? (
                        <p className="text-muted-foreground px-4 pb-6 text-sm">{t('conv.empty')}</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[440px] text-sm">
                                <thead>
                                    <tr className="text-muted-foreground text-left text-xs">
                                        <th className="px-4 pb-2 font-semibold">{t('conv.place')}</th>
                                        <th className={th}>{t('conv.visitors')}</th>
                                        <th className={th}>{t('conv.follows')}</th>
                                        <th className={th}>{t('conv.subs')}</th>
                                        <th className="px-4 pb-2 text-right font-semibold">{t('conv.subRate')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.places.map((r) => (
                                        <tr key={`${r.source}:${r.id ?? 0}`}>
                                            <td className="max-w-0 px-4 py-2.5">
                                                <span className="block truncate font-medium">{place(r.source)}</span>
                                                {r.label && <span className="text-muted-foreground block truncate text-xs">{r.label}</span>}
                                            </td>
                                            <td className="text-muted-foreground px-3 py-2.5 text-right tabular-nums">
                                                {r.visitors === null ? '—' : num(r.visitors)}
                                            </td>
                                            <td className="px-3 py-2.5 text-right tabular-nums">{num(r.follows)}</td>
                                            <td className="px-3 py-2.5 text-right font-bold tabular-nums">
                                                {num(r.subscriptions)}
                                                {r.revenue > 0 && (
                                                    <span className="text-muted-foreground block text-xs font-normal">{mnt(r.revenue)}</span>
                                                )}
                                            </td>
                                            <td className="text-muted-foreground px-4 py-2.5 text-right tabular-nums">
                                                {pct(r.subscriptions, r.visitors)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                <div className="bg-card overflow-hidden rounded-2xl shadow-xs">
                    <h3 className="flex items-center gap-2 px-4 pt-4 font-bold">
                        <Compass className="text-primary size-4" /> {t('conv.referrers')}
                    </h3>
                    <p className="text-muted-foreground px-4 pb-3 text-xs">{t('conv.referrersNote')}</p>
                    {data.referrers.length === 0 ? (
                        <p className="text-muted-foreground px-4 pb-6 text-sm">{t('conv.empty')}</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[400px] text-sm">
                                <thead>
                                    <tr className="text-muted-foreground text-left text-xs">
                                        <th className="px-4 pb-2 font-semibold">{t('conv.source')}</th>
                                        <th className={th}>{t('conv.visitors')}</th>
                                        <th className={th}>{t('conv.follows')}</th>
                                        <th className="px-4 pb-2 text-right font-semibold">{t('conv.subs')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.referrers.map((r) => (
                                        <tr key={r.referrer}>
                                            <td className="max-w-0 truncate px-4 py-2.5 font-medium">{referrer(r.referrer)}</td>
                                            <td className="text-muted-foreground px-3 py-2.5 text-right tabular-nums">{num(r.visitors)}</td>
                                            <td className="px-3 py-2.5 text-right tabular-nums">{num(r.follows)}</td>
                                            <td className="px-4 py-2.5 text-right font-bold tabular-nums">{num(r.subscriptions)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                    <div className="border-border mx-4 mt-2 mb-4 rounded-xl border border-dashed p-3 text-xs">
                        <p className="text-muted-foreground mb-2">{t('conv.tagTip')}</p>
                        <div className="flex items-center gap-2">
                            <code className="bg-muted min-w-0 flex-1 truncate rounded-md px-2 py-1.5">{tagged}</code>
                            <button
                                type="button"
                                onClick={() => {
                                    navigator.clipboard?.writeText(tagged).then(() => {
                                        setCopied(true);
                                        setTimeout(() => setCopied(false), 1500);
                                    });
                                }}
                                className="hover:bg-muted inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-2 font-semibold"
                            >
                                {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} {t(copied ? 'conv.copied' : 'conv.copy')}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}

type QaRow = {
    id: number;
    body: string | null;
    starts_at: string;
    state: 'upcoming' | 'live' | 'ended';
    rsvps: number;
    questions: number;
    askers: number;
    answered: number;
    views: number;
};

/** Live Q&As: how many fans wanted a reminder, asked, and got answers. */
function QaDemand({ qas }: { qas: QaRow[] }) {
    const { t } = useT();
    const th = 'px-3 pb-2 text-right font-semibold';
    return (
        <div className="bg-card overflow-hidden rounded-2xl shadow-xs">
            <h3 className="flex items-center gap-2 px-4 pt-4 font-bold">
                <MessageCircleQuestion className="size-4 text-red-500" /> {t('qa.insightsTitle')}
            </h3>
            <p className="text-muted-foreground px-4 pb-3 text-xs">{t('qa.insightsNote')}</p>
            <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                    <thead>
                        <tr className="text-muted-foreground text-left text-xs">
                            <th className="px-4 pb-2 font-semibold">{t('qa.title')}</th>
                            <th className={th}>{t('ins.views')}</th>
                            <th className={th}>{t('qa.colReminders')}</th>
                            <th className={th}>{t('qa.colQuestions')}</th>
                            <th className={th}>{t('qa.colAskers')}</th>
                            <th className="px-4 pb-2 text-right font-semibold">{t('qa.colAnswered')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {qas.map((q) => (
                            <tr key={q.id} className="hover:bg-muted/40 transition">
                                <td className="max-w-0 px-4 py-2.5">
                                    <Link href={`${route('studio')}#post-${q.id}`} className="block">
                                        <span className="block truncate font-medium">{q.body ?? '—'}</span>
                                        <span className="text-muted-foreground text-xs">
                                            {new Date(q.starts_at)
                                                .toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' })
                                                .replaceAll('-', '.')}{' '}
                                            · {t(q.state === 'live' ? 'qa.liveNow' : q.state === 'upcoming' ? 'qa.stateUpcoming' : 'qa.ended')}
                                        </span>
                                    </Link>
                                </td>
                                <td className="text-muted-foreground px-3 py-2.5 text-right tabular-nums">{q.views}</td>
                                <td className="px-3 py-2.5 text-right font-bold tabular-nums">{q.rsvps}</td>
                                <td className="px-3 py-2.5 text-right tabular-nums">{q.questions}</td>
                                <td className="px-3 py-2.5 text-right tabular-nums">{q.askers}</td>
                                <td className="px-4 py-2.5 text-right tabular-nums">
                                    {q.answered}/{q.questions}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function Tile({ icon: Icon, label, value, sub, delta }: { icon: LucideIcon; label: string; value: string; sub?: string; delta?: React.ReactNode }) {
    return (
        <div className="bg-card rounded-2xl p-4 shadow-xs">
            <div className="flex items-center justify-between gap-2">
                <p className="text-muted-foreground text-sm font-medium">{label}</p>
                <span className="bg-primary/10 text-primary grid size-9 shrink-0 place-items-center rounded-xl">
                    <Icon className="size-[18px]" />
                </span>
            </div>
            <p className="mt-2 flex items-baseline gap-2 text-2xl font-extrabold tracking-tight tabular-nums sm:text-[28px]">
                {value} {delta}
            </p>
            {sub && <p className="text-muted-foreground mt-0.5 text-xs">{sub}</p>}
        </div>
    );
}
