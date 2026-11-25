import { useT, type TKey } from '@/lib/i18n';
import { Link, usePage } from '@inertiajs/react';

type Counts = { applications: number; payouts: number; reports: number } | null;

const TABS: { label: TKey; route: string; count?: keyof NonNullable<Counts> }[] = [
    { label: 'ad.tabDashboard', route: 'admin.dashboard' },
    { label: 'nav.admin', route: 'admin.creators', count: 'applications' },
    { label: 'nav.payouts', route: 'admin.payouts', count: 'payouts' },
    { label: 'nav.reports', route: 'admin.reports', count: 'reports' },
    { label: 'au.title', route: 'admin.users*' },
];

/** Tabs across the admin pages, with how many items wait in each queue. */
export default function AdminTabs() {
    const { t } = useT();
    const { adminCounts } = usePage<{ adminCounts: Counts }>().props;

    return (
        <nav className="-mx-4 flex gap-1 overflow-x-auto border-b px-4 pb-px">
            {TABS.map((tab) => {
                const active = route().current(tab.route);
                const href = route(tab.route.replace('*', ''));
                const n = tab.count && adminCounts ? adminCounts[tab.count] : 0;
                return (
                    <Link
                        key={tab.route}
                        href={href}
                        className={`-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-semibold transition ${
                            active ? 'border-primary text-foreground' : 'text-muted-foreground hover:text-foreground border-transparent'
                        }`}
                    >
                        {t(tab.label)}
                        {n > 0 && <span className="bg-primary rounded-full px-1.5 text-[11px] leading-5 font-bold text-white">{n}</span>}
                    </Link>
                );
            })}
        </nav>
    );
}
