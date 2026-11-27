import { useWorkAreaSwitches } from '@/components/area-switch';
import DashboardLayout, { type PageProps } from '@/layouts/dashboard-layout';
import { useT } from '@/lib/i18n';
import { useLayoutArea } from '@/lib/layout-area';
import { type SharedData } from '@/types';
import { usePage } from '@inertiajs/react';
import { Building2, Megaphone, Plus, Wallet } from 'lucide-react';

/** The Business area: a company's sponsored banners (campaigns), a new one, and the company's details. */
export default function BusinessLayout(props: PageProps) {
    const { t } = useT();
    const company = usePage<SharedData>().props.auth.company;
    useLayoutArea('business', t('biz.title'));
    const switches = useWorkAreaSwitches('business');

    return (
        <DashboardLayout
            {...props}
            area={{
                badge: t('biz.title'),
                role: company?.name ?? t('biz.title'),
                home: route('business'),
                switches,
                groups: [
                    {
                        title: t('biz.title'),
                        items: company
                            ? [
                                  { label: t('biz.campaigns'), href: route('business'), icon: Megaphone, active: route().current('business') },
                                  {
                                      label: t('biz.newCampaign'),
                                      href: route('business.campaigns.new'),
                                      icon: Plus,
                                      active: route().current('business.campaigns.new'),
                                  },
                                  {
                                      label: t('biz.company'),
                                      href: route('business.company'),
                                      icon: Building2,
                                      active: route().current('business.company'),
                                  },
                              ]
                            : [{ label: t('biz.company'), href: route('business.company'), icon: Building2, active: true }],
                    },
                    { title: t('biz.account'), items: [{ label: t('wal.title'), href: route('wallet'), icon: Wallet }] },
                ],
            }}
        />
    );
}
