import AdminTabs from '@/components/admin-tabs';
import BarChart from '@/components/bar-chart';
import UserAvatar from '@/components/user-avatar';
import SocialLayout from '@/layouts/social-layout';
import { mnt } from '@/lib/format';
import { useT, type TKey } from '@/lib/i18n';
import { Link } from '@inertiajs/react';
import { AlertTriangle, Banknote, ChevronRight, Flag, HandCoins, LockOpen, Sparkles, Star, type LucideIcon } from 'lucide-react';

type Point = { date: string; value: number };
type Props = {
    kpis: { users: number; usersNew7d: number; creators: number; subscriptions: number; gmvMonth: number; feeMonth: number; gmvAll: number };
    todo: { applications: number; payouts: number; payoutsAmount: number; reports: number; urgentReports: number };
    byPurpose: Partial<Record<'subscription' | 'tip' | 'ppv', { total: number; count: number }>>;
    revenue: Point[];
    signups: Point[];
    topCreators: { handle: string; display_name: string; avatar_url: string | null; total: number; count: number }[];
    recentPayments: {
        id: string;
        purpose: 'subscription' | 'tip' | 'ppv';
        amount: number;
        fan: string | null;
        creator: string | null;
        paid_at: string;
    }[];
};

const PURPOSES: ['subscription' | 'tip' | 'ppv', TKey, LucideIcon][] = [
    ['subscription', 'ea.subscription', Star],
    ['tip', 'tip.for', HandCoins],
    ['ppv', 'ppv.option', LockOpen],
];

/** Admin home: the numbers that matter, the queues waiting for you, 30-day trends, top creators, recent payments. */
export default function AdminDashboard({ kpis, todo, byPurpose, revenue, signups, topCreators, recentPayments }: Props) {
    const { t } = useT();
    const purposeLabel = Object.fromEntries(PURPOSES.map(([k, l]) => [k, l])) as Record<string, TKey>;

    return (
        <SocialLayout title={t('nav.adminHome')} header={<h1 className="text-lg font-bold tracking-wide uppercase">{t('nav.adminHome')}</h1>} wide>
            <div className="flex flex-col gap-6 p-4">
                <AdminTabs />

                {/* Waiting for you */}
                <section className="grid gap-3 sm:grid-cols-3">
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
                </section>

                {/* Headline numbers */}
                <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <Kpi label={t('ad.gmvMonth')} value={mnt(kpis.gmvMonth)} />
                    <Kpi label={t('ad.feeMonth')} value={mnt(kpis.feeMonth)} />
                    <Kpi label={t('ad.subsActive')} value={kpis.subscriptions.toLocaleString('en-US')} />
                    <Kpi label={t('ad.users')} value={kpis.users.toLocaleString('en-US')} sub={t('ad.new7d', { n: kpis.usersNew7d })} />
                </section>

                {/* Where this month's money came from */}
                <section className="grid grid-cols-3 gap-3">
                    {PURPOSES.map(([key, label, Icon]) => (
                        <div key={key} className="rounded-2xl border p-4">
                            <p className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
                                <Icon className="size-3.5" /> {t(label)}
                            </p>
                            <p className="mt-1 text-lg font-extrabold tabular-nums">{mnt(byPurpose[key]?.total ?? 0)}</p>
                            <p className="text-muted-foreground text-xs">{t('ad.payments', { n: byPurpose[key]?.count ?? 0 })}</p>
                        </div>
                    ))}
                </section>

                <section className="grid gap-4 lg:grid-cols-2">
                    <BarChart title={t('ad.revenue30')} data={revenue} format={mnt} />
                    <BarChart title={t('ad.signups30')} data={signups} format={(n) => n.toLocaleString('en-US')} />
                </section>

                <section className="grid gap-4 lg:grid-cols-2">
                    <div>
                        <h2 className="text-muted-foreground mb-2 px-1 text-xs font-semibold tracking-wider uppercase">{t('ad.topCreators')}</h2>
                        <ol className="divide-y rounded-2xl border">
                            {topCreators.length === 0 && <li className="text-muted-foreground p-4 text-sm">{t('ea.none')}</li>}
                            {topCreators.map((c, i) => (
                                <li key={c.handle}>
                                    <Link
                                        href={route('creator.show', c.handle)}
                                        className="hover:bg-muted/50 flex items-center gap-3 px-4 py-3 transition"
                                    >
                                        <span className="text-muted-foreground w-4 text-sm font-bold">{i + 1}</span>
                                        <UserAvatar name={c.display_name} src={c.avatar_url} seed={c.handle} className="size-9" />
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate font-semibold">{c.display_name}</span>
                                            <span className="text-muted-foreground block text-xs">
                                                @{c.handle} · {t('ad.payments', { n: c.count })}
                                            </span>
                                        </span>
                                        <span className="font-bold tabular-nums">{mnt(c.total)}</span>
                                    </Link>
                                </li>
                            ))}
                        </ol>
                    </div>
                    <div>
                        <h2 className="text-muted-foreground mb-2 px-1 text-xs font-semibold tracking-wider uppercase">{t('ad.recentPayments')}</h2>
                        <ul className="divide-y rounded-2xl border text-sm">
                            {recentPayments.length === 0 && <li className="text-muted-foreground p-4">{t('ea.none')}</li>}
                            {recentPayments.map((p) => (
                                <li key={p.id} className="flex items-center gap-3 px-4 py-2.5">
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate font-medium">
                                            {p.fan ?? '—'} → @{p.creator}
                                        </span>
                                        <span className="text-muted-foreground block text-xs">
                                            {t(purposeLabel[p.purpose] ?? 'ea.subscription')} ·{' '}
                                            {p.paid_at.slice(0, 16).replace('T', ' ').replaceAll('-', '.')}
                                        </span>
                                    </span>
                                    <span className="font-bold tabular-nums">{mnt(p.amount)}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </section>

                <p className="text-muted-foreground text-xs">{t('ad.allTime', { amount: mnt(kpis.gmvAll), creators: kpis.creators })}</p>
            </div>
        </SocialLayout>
    );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
    return (
        <div className="rounded-2xl border p-4">
            <p className="text-muted-foreground text-xs font-medium">{label}</p>
            <p className="mt-1 text-2xl font-extrabold tracking-tight tabular-nums">{value}</p>
            {sub && <p className="text-muted-foreground text-xs">{sub}</p>}
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
        <Link
            href={href}
            className={`group flex items-center gap-3 rounded-2xl border p-4 transition hover:shadow-sm ${
                urgent ? 'border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/30' : n ? 'border-primary/30 bg-primary/5' : ''
            }`}
        >
            <span
                className={`grid size-10 place-items-center rounded-full ${urgent ? 'bg-red-600 text-white' : n ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'}`}
            >
                <Icon className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{label}</span>
                {sub && <span className={`block text-xs ${urgent ? 'font-semibold text-red-700' : 'text-muted-foreground'}`}>{sub}</span>}
            </span>
            <span className="text-2xl font-extrabold tabular-nums">{n}</span>
            <ChevronRight className="text-muted-foreground size-4 transition group-hover:translate-x-0.5" />
        </Link>
    );
}
