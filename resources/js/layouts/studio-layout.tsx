import { useWorkAreaSwitches } from '@/components/area-switch';
import DashboardLayout, { type PageProps } from '@/layouts/dashboard-layout';
import { useT } from '@/lib/i18n';
import { useLayoutArea } from '@/lib/layout-area';
import { type SharedData } from '@/types';
import { usePage } from '@inertiajs/react';
import { ChartColumn, Images, LayoutDashboard, ListOrdered, MessageCircle, Ticket, UserPen, Users, Wallet } from 'lucide-react';

/** The creator studio: overview and posts, earnings, and shortcuts to the page, messages and profile. */
export default function StudioLayout(props: PageProps) {
    const { t } = useT();
    const { auth, unreadMessages } = usePage<SharedData & { unreadMessages: number }>().props;
    const handle = auth.creator?.handle ?? '';
    useLayoutArea('studio', t('nav.studio'));
    const switches = useWorkAreaSwitches('studio');

    return (
        <DashboardLayout
            {...props}
            area={{
                badge: t('nav.studio'),
                role: `@${handle}`,
                home: route('studio'),
                switches,
                groups: [
                    {
                        title: t('nav.studio'),
                        items: [
                            { label: t('stu.overview'), href: route('studio'), icon: LayoutDashboard, active: route().current('studio') },
                            { label: t('lib.title'), href: route('studio.library'), icon: Images, active: route().current('studio.library') },
                            { label: t('series.title'), href: route('studio.series'), icon: ListOrdered, active: route().current('studio.series') },
                            { label: t('fp.title'), href: route('studio.fans'), icon: Users, active: route().current('studio.fans') },
                            { label: t('ins.title'), href: route('studio.insights'), icon: ChartColumn, active: route().current('studio.insights') },
                            { label: t('ea.title'), href: route('studio.earnings'), icon: Wallet, active: route().current('studio.earnings') },
                            { label: t('pro.title'), href: route('studio.promotions'), icon: Ticket, active: route().current('studio.promotions') },
                        ],
                    },
                    {
                        title: t('stu.page'),
                        items: [
                            {
                                label: t('nav.messages'),
                                href: route('studio.messages'),
                                icon: MessageCircle,
                                count: unreadMessages,
                                active: route().current('studio.messages') || route().current('studio.messages.show'),
                            },
                            { label: t('nav.editProfile'), href: route('studio.profile'), icon: UserPen, active: route().current('studio.profile') },
                        ],
                    },
                ],
            }}
        />
    );
}
