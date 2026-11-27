import UserAvatar from '@/components/user-avatar';
import { useT } from '@/lib/i18n';
import { type SharedData } from '@/types';
import { Link, usePage } from '@inertiajs/react';
import { ArrowLeftRight, Building2, Clapperboard, ShieldCheck, type LucideIcon } from 'lucide-react';

/**
 * A switch to another part of the app (fan side, studio, admin), set apart from the ordinary menu: a coloured tile
 * (or the creator's own photo for their public page), a subtitle, and a "switch" arrow. Used in every sidebar.
 */
export type AreaTarget = {
    label: string;
    sub: string;
    href: string;
    tone: 'studio' | 'admin' | 'page' | 'business';
    icon?: LucideIcon;
    /** Show this photo as the tile (the creator's page). */
    avatar?: { name: string; src: string | null; seed?: string };
    badge?: number;
};

const TONES = {
    studio: 'bg-primary text-primary-foreground',
    admin: 'bg-amber-400 text-amber-950',
    page: 'bg-sky-500 text-white',
    business: 'bg-violet-600 text-white',
};

type AdminCounts = { applications: number; payouts: number; reports: number; ads: number } | null;

/** Everything waiting for admins, for the switch's badge. */
export const adminWaiting = (c: AdminCounts) => (c ? c.applications + c.payouts + c.reports + (c.ads ?? 0) : 0);

/** The Business area (a company's sponsored banners), for people who advertise. */
export function useBusinessSwitch(): AreaTarget | null {
    const { t } = useT();
    const company = usePage<SharedData>().props.auth.company;
    return company ? { label: t('biz.title'), sub: company.name, href: route('business'), tone: 'business', icon: Building2 } : null;
}

/** The other parts of the app this person can switch to from a work area (studio or admin). */
export function useWorkAreaSwitches(here: 'studio' | 'admin' | 'business'): AreaTarget[] {
    const { t } = useT();
    const { auth, adminCounts } = usePage<SharedData & { adminCounts: AdminCounts }>().props;
    const business = useBusinessSwitch();
    const creator = auth.creator?.status === 'approved' ? auth.creator : null;
    const user = auth.user;
    if (!user) return [];

    return [
        ...(creator
            ? [
                  {
                      label: t('stu.myPage'),
                      sub: `@${creator.handle} · ${t('nav.publicPage')}`,
                      href: route('creator.show', creator.handle),
                      tone: 'page',
                      avatar: { name: user.name, src: user.avatar_url, seed: creator.handle },
                  } as AreaTarget,
              ]
            : []),
        ...(creator && here !== 'studio'
            ? [{ label: t('nav.studio'), sub: t('nav.studioSub'), href: route('studio'), tone: 'studio', icon: Clapperboard } as AreaTarget]
            : []),
        ...(user.is_admin && here !== 'admin'
            ? [
                  {
                      label: t('nav.adminHome'),
                      sub: t('nav.adminSub'),
                      href: route('admin.dashboard'),
                      tone: 'admin',
                      icon: ShieldCheck,
                      badge: adminWaiting(adminCounts),
                  } as AreaTarget,
              ]
            : []),
        ...(business && here !== 'business' ? [business] : []),
    ];
}

export default function AreaSwitch({ area, compact = false }: { area: AreaTarget; compact?: boolean }) {
    const text = compact ? 'hidden xl:flex' : 'flex';
    return (
        <Link
            href={area.href}
            title={area.label}
            className="group border-border/60 hover:border-border hover:bg-muted flex items-center gap-3 rounded-xl border px-2 py-2 transition xl:px-2.5"
        >
            <span className={`relative grid size-9 shrink-0 place-items-center rounded-lg shadow-xs ${area.avatar ? '' : TONES[area.tone]}`}>
                {area.avatar ? (
                    <UserAvatar name={area.avatar.name} src={area.avatar.src} seed={area.avatar.seed} className="size-9 ring-2 ring-sky-500" />
                ) : (
                    area.icon && <area.icon className="size-[18px]" strokeWidth={2.2} />
                )}
                {!!area.badge && (
                    <span className="bg-primary ring-background text-primary-foreground absolute -top-1.5 -right-2 grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[10px] font-bold ring-2">
                        {area.badge > 99 ? '99+' : area.badge}
                    </span>
                )}
            </span>
            <span className={`${text} min-w-0 flex-1 flex-col`}>
                <span className="truncate text-sm font-bold">{area.label}</span>
                <span className="text-muted-foreground truncate text-xs">{area.sub}</span>
            </span>
            <ArrowLeftRight
                className={`text-muted-foreground group-hover:text-foreground size-4 shrink-0 transition ${compact ? 'hidden xl:block' : ''}`}
            />
        </Link>
    );
}
