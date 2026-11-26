import BarChart from '@/components/bar-chart';
import UserAvatar from '@/components/user-avatar';
import AdminLayout from '@/layouts/admin-layout';
import { mnt, timeAgo } from '@/lib/format';
import { useT, type TKey } from '@/lib/i18n';
import { type SharedData } from '@/types';
import { Link, usePage } from '@inertiajs/react';
import {
    AlertTriangle,
    Banknote,
    CheckCircle2,
    ChevronRight,
    CreditCard,
    Flag,
    HandCoins,
    Landmark,
    LockOpen,
    Sparkles,
    Star,
    TrendingUp,
    Users,
    type LucideIcon,
} from 'lucide-react';

type Purpose = 'subscription' | 'tip' | 'ppv';
type Point = { date: string; value: number };
type Props = {
    kpis: { users: number; usersNew7d: number; creators: number; subscriptions: number; gmvMonth: number; feeMonth: number; gmvAll: number };
    todo: { applications: number; payouts: number; payoutsAmount: number; reports: number; urgentReports: number };
    byPurpose: Partial<Record<Purpose, { total: number; count: number }>>;
    revenue: Point[];
    signups: Point[];
    topCreators: { handle: string; display_name: string; avatar_url: string | null; total: number; count: number }[];
    recentPayments: { id: string; purpose: Purpose; amount: number; fan: string | null; creator: string | null; paid_at: string }[];
};

const PURPOSES: [Purpose, TKey, LucideIcon][] = [
    ['subscription', 'ea.subscription', Star],
    ['tip', 'tip.for', HandCoins],
    ['ppv', 'ppv.option', LockOpen],
];
const LABEL = Object.fromEntries(PURPOSES.map(([k, l]) => [k, l])) as Record<Purpose, TKey>;

/** Admin home: headline numbers, what's waiting, 30-day trends, where the money came from, top creators, latest payments. */
export default function AdminDashboard({ kpis, todo, byPurpose, revenue, signups, topCreators, recentPayments }: Props) {
    const { t } = useT();
    const { auth } = usePage<SharedData>().props;
    const today = new Date().toLocaleDateString('sv-SE').replaceAll('-', '.');
    const waiting = todo.applications + todo.payouts + todo.reports;

    return (
        <AdminLayout title={t('ad.tabDashboard')} heading={t('adm.hello', { name: auth.user?.name ?? '' })} subtitle={today}>
            <div className="flex flex-col gap-5">
                {/* Headline numbers */}
                <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                    <Kpi icon={TrendingUp} label={t('ad.gmvMonth')} value={mnt(kpis.gmvMonth)} />
                    <Kpi icon={Landmark} label={t('ad.feeMonth')} value={mnt(kpis.feeMonth)} />
                    <Kpi icon={CreditCard} label={t('ad.subsActive')} value={kpis.subscriptions.toLocaleString('en-US')} />
                    <Kpi icon={Users} label={t('ad.users')} value={kpis.users.toLocaleString('en-US')} sub={t('ad.new7d', { n: kpis.usersNew7d })} />
                </section>

                <section className="grid items-start gap-5 lg:grid-cols-3">
                    <div className="lg:col-span-2">
                        <BarChart title={t('ad.revenue30')} data={revenue} format={mnt} />
                    </div>

                    {/* Waiting for you */}
                    <Panel title={t('adm.attention')}>
                        {waiting === 0 ? (
                            <p className="text-muted-foreground flex items-center gap-2 px-4 pb-4 text-sm">
                                <CheckCircle2 className="size-5 text-emerald-500" /> {t('adm.allClear')}
                            </p>
                        ) : (
                            <ul className="flex flex-col gap-1 px-2 pb-2">
                                <Todo href={route('admin.creators')} icon={Sparkles} label={t('ad.todoApps')} n={todo.applications} />
                                <Todo
                                    href={route('admin.payouts')}
                                    icon={Banknote}
                                    label={t('ad.todoPayouts')}
                                    n={todo.payouts}
                                    sub={todo.payouts ? mnt(todo.payoutsAmount) : undefined}
                                />
                                <Todo
                                    href={route('admin.reports')}
                                    icon={todo.urgentReports ? AlertTriangle : Flag}
                                    label={t('ad.todoReports')}
                                    n={todo.reports}
                                    sub={todo.urgentReports ? t('ad.urgentN', { n: todo.urgentReports }) : undefined}
                                    urgent={todo.urgentReports > 0}
                                />
                            </ul>
                        )}
                    </Panel>
                </section>

                <section className="grid items-start gap-5 lg:grid-cols-3">
                    <div className="lg:col-span-2">
                        <BarChart title={t('ad.signups30')} data={signups} format={(n) => n.toLocaleString('en-US')} />
                    </div>
                    <ByPurpose data={byPurpose} />
                </section>

                <section className="grid items-start gap-5 xl:grid-cols-2">
                    <Panel title={t('ad.topCreators')}>
                        {topCreators.length === 0 ? (
                            <Empty />
                        ) : (
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-muted-foreground text-left text-xs">
                                        <th className="px-4 pb-2 font-semibold">{t('adm.colCreator')}</th>
                                        <th className="px-4 pb-2 text-right font-semibold">{t('adm.colPayments')}</th>
                                        <th className="px-4 pb-2 text-right font-semibold">{t('adm.colAmount')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {topCreators.map((c, i) => (
                                        <tr key={c.handle} className="hover:bg-muted/50 transition">
                                            <td className="px-4 py-2.5">
                                                <Link href={route('creator.show', c.handle)} className="flex items-center gap-3">
                                                    <span className="text-muted-foreground w-3 text-xs font-bold">{i + 1}</span>
                                                    <UserAvatar name={c.display_name} src={c.avatar_url} seed={c.handle} className="size-8 text-xs" />
                                                    <span className="min-w-0">
                                                        <span className="block truncate font-semibold">{c.display_name}</span>
                                                        <span className="text-muted-foreground block truncate text-xs">@{c.handle}</span>
                                                    </span>
                                                </Link>
                                            </td>
                                            <td className="text-muted-foreground px-4 py-2.5 text-right tabular-nums">{c.count}</td>
                                            <td className="px-4 py-2.5 text-right font-bold tabular-nums">{mnt(c.total)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </Panel>

                    <Panel title={t('ad.recentPayments')}>
                        {recentPayments.length === 0 ? (
                            <Empty />
                        ) : (
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-muted-foreground text-left text-xs">
                                        <th className="px-4 pb-2 font-semibold">{t('adm.colWho')}</th>
                                        <th className="hidden px-4 pb-2 font-semibold sm:table-cell">{t('adm.colType')}</th>
                                        <th className="hidden px-4 pb-2 font-semibold sm:table-cell">{t('adm.colWhen')}</th>
                                        <th className="px-4 pb-2 text-right font-semibold">{t('adm.colAmount')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {recentPayments.map((p) => (
                                        <tr key={p.id} className="hover:bg-muted/50 transition">
                                            <td className="max-w-0 px-4 py-2.5">
                                                <span className="block truncate font-medium">
                                                    {p.fan ?? '—'} <span className="text-muted-foreground">→</span> @{p.creator}
                                                </span>
                                            </td>
                                            <td className="hidden px-4 py-2.5 sm:table-cell">
                                                <span className="bg-muted rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap">
                                                    {t(LABEL[p.purpose])}
                                                </span>
                                            </td>
                                            <td className="text-muted-foreground hidden px-4 py-2.5 whitespace-nowrap sm:table-cell">
                                                {timeAgo(p.paid_at, t)}
                                            </td>
                                            <td className="px-4 py-2.5 text-right font-bold whitespace-nowrap tabular-nums">{mnt(p.amount)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </Panel>
                </section>

                <p className="text-muted-foreground text-xs">{t('ad.allTime', { amount: mnt(kpis.gmvAll), creators: kpis.creators })}</p>
            </div>
        </AdminLayout>
    );
}

/** This month's sales split by type: one hue, bars sized by amount, each labelled (so no legend needed). */
function ByPurpose({ data }: { data: Props['byPurpose'] }) {
    const { t } = useT();
    const total = PURPOSES.reduce((s, [k]) => s + (data[k]?.total ?? 0), 0);
    const max = Math.max(1, ...PURPOSES.map(([k]) => data[k]?.total ?? 0));

    return (
        <Panel title={t('adm.revenueByType')}>
            <ul className="flex flex-col gap-4 px-4 pb-4">
                {PURPOSES.map(([key, label, Icon]) => {
                    const v = data[key]?.total ?? 0;
                    const pct = total ? Math.round((v / total) * 100) : 0;
                    return (
                        <li key={key}>
                            <div className="flex items-baseline justify-between gap-2 text-sm">
                                <span className="flex items-center gap-1.5 font-semibold">
                                    <Icon className="text-muted-foreground size-4" /> {t(label)}
                                </span>
                                <span className="font-bold tabular-nums">{mnt(v)}</span>
                            </div>
                            <div className="bg-muted mt-1.5 h-2 overflow-hidden rounded-full" title={`${pct}%`}>
                                <div className="bg-primary h-full rounded-full" style={{ width: `${(v / max) * 100}%` }} />
                            </div>
                            <p className="text-muted-foreground mt-1 text-xs tabular-nums">
                                {t('ad.payments', { n: data[key]?.count ?? 0 })} · {pct}%
                            </p>
                        </li>
                    );
                })}
            </ul>
        </Panel>
    );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className="bg-card overflow-hidden rounded-2xl shadow-xs">
            <h2 className="px-4 pt-4 pb-3 font-bold">{title}</h2>
            {children}
        </section>
    );
}

function Empty() {
    const { t } = useT();
    return <p className="text-muted-foreground px-4 pb-4 text-sm">{t('ea.none')}</p>;
}

function Kpi({ icon: Icon, label, value, sub }: { icon: LucideIcon; label: string; value: string; sub?: string }) {
    return (
        <div className="bg-card rounded-2xl p-4 shadow-xs">
            <div className="flex items-center justify-between gap-2">
                <p className="text-muted-foreground text-sm font-medium">{label}</p>
                <span className="bg-primary/10 text-primary grid size-9 shrink-0 place-items-center rounded-xl">
                    <Icon className="size-[18px]" />
                </span>
            </div>
            <p className="mt-2 text-2xl font-extrabold tracking-tight tabular-nums sm:text-[28px]">{value}</p>
            {sub && <p className="mt-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">{sub}</p>}
        </div>
    );
}

function Todo({
    href,
    icon: Icon,
    label,
    n,
    sub,
    urgent,
}: {
    href: string;
    icon: LucideIcon;
    label: string;
    n: number;
    sub?: string;
    urgent?: boolean;
}) {
    return (
        <li>
            <Link href={href} className="group hover:bg-muted/60 flex items-center gap-3 rounded-xl p-2.5 transition">
                <span
                    className={`grid size-10 shrink-0 place-items-center rounded-xl ${
                        urgent ? 'bg-red-600 text-white' : n ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'
                    }`}
                >
                    <Icon className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{label}</span>
                    {sub && <span className={`block text-xs ${urgent ? 'font-semibold text-red-600' : 'text-muted-foreground'}`}>{sub}</span>}
                </span>
                <span className={`text-xl font-extrabold tabular-nums ${n ? '' : 'text-muted-foreground'}`}>{n}</span>
                <ChevronRight className="text-muted-foreground size-4 transition group-hover:translate-x-0.5" />
            </Link>
        </li>
    );
}
