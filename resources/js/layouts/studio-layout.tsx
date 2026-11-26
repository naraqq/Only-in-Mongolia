import DashboardLayout, { type PageProps } from '@/layouts/dashboard-layout';
import { useT } from '@/lib/i18n';
import { type SharedData } from '@/types';
import { usePage } from '@inertiajs/react';
import { ChartColumn, ExternalLink, Images, LayoutDashboard, MessageCircle, Ticket, UserPen, Wallet } from 'lucide-react';

/** The creator studio: overview and posts, earnings, and shortcuts to the page, messages and profile. */
export default function StudioLayout(props: PageProps) {
    const { t } = useT();
    const { auth, unreadMessages } = usePage<SharedData & { unreadMessages: number }>().props;
    const handle = auth.creator?.handle ?? '';

    return (
        <DashboardLayout
            {...props}
            area={{
                badge: t('nav.studio'),
                role: `@${handle}`,
                home: route('studio'),
                groups: [
                    {
                        title: t('nav.studio'),
                        items: [
                            { label: t('stu.overview'), href: route('studio'), icon: LayoutDashboard, active: route().current('studio') },
                            { label: t('lib.title'), href: route('studio.library'), icon: Images, active: route().current('studio.library') },
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
                            { label: t('stu.myPage'), href: route('creator.show', handle), icon: ExternalLink },
                        ],
                    },
                ],
            }}
        />
    );
}
