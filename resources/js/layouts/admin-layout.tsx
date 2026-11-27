import { useWorkAreaSwitches } from '@/components/area-switch';
import DashboardLayout, { type PageProps } from '@/layouts/dashboard-layout';
import { useT } from '@/lib/i18n';
import { useLayoutArea } from '@/lib/layout-area';
import { usePage } from '@inertiajs/react';
import { Banknote, Flag, LayoutDashboard, Megaphone, ScrollText, Sparkles, Users } from 'lucide-react';

type Counts = { applications: number; payouts: number; reports: number; ads: number } | null;

/** The admin area: dashboard, the three review queues with how many items wait in each, and users. */
export default function AdminLayout(props: PageProps) {
    const { t } = useT();
    const counts = usePage<{ adminCounts: Counts }>().props.adminCounts;
    useLayoutArea('admin', t('nav.adminHome'));
    const switches = useWorkAreaSwitches('admin');
    const item = (label: Parameters<typeof t>[0], name: string, icon: typeof Users, count?: number) => ({
        label: t(label),
        href: route(name),
        icon,
        active: route().current(name) || route().current(`${name}.*`),
        count,
    });

    return (
        <DashboardLayout
            {...props}
            area={{
                badge: t('nav.adminHome'),
                role: t('nav.adminHome'),
                home: route('admin.dashboard'),
                switches,
                groups: [
                    { title: t('adm.overview'), items: [item('ad.tabDashboard', 'admin.dashboard', LayoutDashboard)] },
                    {
                        title: t('adm.queues'),
                        items: [
                            item('nav.admin', 'admin.creators', Sparkles, counts?.applications),
                            item('nav.payouts', 'admin.payouts', Banknote, counts?.payouts),
                            item('nav.reports', 'admin.reports', Flag, counts?.reports),
                        ],
                    },
                    {
                        title: t('adm.manage'),
                        items: [
                            item('au.title', 'admin.users', Users),
                            item('ads.title', 'admin.ads', Megaphone, counts?.ads),
                            item('aud.title', 'admin.audit', ScrollText),
                        ],
                    },
                ],
            }}
        />
    );
}
