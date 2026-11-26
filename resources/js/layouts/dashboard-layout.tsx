import AppLogo from '@/components/app-logo';
import LangSwitch from '@/components/lang-switch';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import UserAvatar from '@/components/user-avatar';
import { useT } from '@/lib/i18n';
import { type SharedData } from '@/types';
import { Head, Link, usePage } from '@inertiajs/react';
import { ArrowLeft, Menu, type LucideIcon } from 'lucide-react';
import { type ReactNode } from 'react';

export type NavItem = { label: string; href: string; icon: LucideIcon; active?: boolean; count?: number };
export type NavGroup = { title: string; items: NavItem[] };
export type Area = {
    /** Short tag beside the logo, e.g. "Admin" or "Studio". */
    badge: string;
    home: string;
    groups: NavGroup[];
    /** Who you are in this area, under your name at the bottom of the sidebar. */
    role: string;
};

export type PageProps = {
    /** Browser tab title. */
    title: string;
    /** Big title in the top bar (defaults to `title`). */
    heading?: ReactNode;
    subtitle?: ReactNode;
    /** Shows a back arrow to this address. */
    back?: string;
    actions?: ReactNode;
    children: ReactNode;
};

/**
 * A work area's own shell, separate from the social app (admin, creator studio): a sidebar with sections and
 * counts, a top bar with the page title and actions, and a wide content area. On phones the sidebar opens from a menu button.
 */
export default function DashboardLayout({ area, title, heading, subtitle, back, actions, children }: PageProps & { area: Area }) {
    const { t } = useT();

    return (
        <div className="bg-background min-h-svh lg:pl-64">
            <Head title={`${title} · ${area.badge}`} />

            <aside className="border-border bg-background fixed inset-y-0 left-0 z-30 hidden w-64 border-r lg:flex">
                <Sidebar area={area} />
            </aside>

            <header className="bg-background/85 sticky top-0 z-20 backdrop-blur-md">
                <div className="mx-auto flex min-h-16 max-w-[1400px] items-center gap-3 px-4 py-3 lg:px-8">
                    <Sheet>
                        <SheetTrigger asChild>
                            <button
                                type="button"
                                className="hover:bg-muted -ml-2 grid size-10 place-items-center rounded-full lg:hidden"
                                aria-label={t('adm.menu')}
                            >
                                <Menu className="size-5" />
                            </button>
                        </SheetTrigger>
                        <SheetContent side="left" className="w-72 p-0 [&>button:last-child]:hidden">
                            <SheetTitle className="sr-only">{t('adm.menu')}</SheetTitle>
                            <Sidebar area={area} />
                        </SheetContent>
                    </Sheet>
                    {back && (
                        <Link
                            href={back}
                            className="hover:bg-muted -ml-1 grid size-9 shrink-0 place-items-center rounded-full transition"
                            aria-label={t('cr.back')}
                        >
                            <ArrowLeft className="size-5" />
                        </Link>
                    )}
                    <div className="min-w-0 flex-1">
                        <h1 className="truncate text-xl font-extrabold tracking-tight">{heading ?? title}</h1>
                        {subtitle && <p className="text-muted-foreground line-clamp-2 text-sm">{subtitle}</p>}
                    </div>
                    {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
                </div>
            </header>

            <main className="animate-page-in mx-auto max-w-[1400px] px-4 pt-2 pb-12 lg:px-8">{children}</main>
        </div>
    );
}

function Sidebar({ area }: { area: Area }) {
    const { t } = useT();
    const { auth } = usePage<SharedData>().props;

    return (
        <div className="flex h-full w-full flex-col">
            <div className="flex h-16 items-center gap-2 px-5">
                <Link href={area.home} className="flex min-w-0 items-center gap-2">
                    <AppLogo className="[&>span]:text-sm" />
                </Link>
                <span className="bg-primary/15 text-primary shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-extrabold tracking-wider uppercase">
                    {area.badge}
                </span>
            </div>

            <nav className="flex-1 overflow-y-auto px-3 py-2">
                {area.groups.map((g) => (
                    <div key={g.title} className="mb-5">
                        <p className="text-muted-foreground mb-1 px-3 text-[11px] font-bold tracking-wider uppercase">{g.title}</p>
                        <ul className="flex flex-col gap-0.5">
                            {g.items.map((item) => (
                                <li key={item.href}>
                                    <Link
                                        href={item.href}
                                        prefetch
                                        className={`flex h-10 items-center gap-3 rounded-xl px-3 text-[15px] font-semibold transition ${
                                            item.active ? 'bg-primary/10 text-primary' : 'text-foreground/80 hover:bg-muted hover:text-foreground'
                                        }`}
                                    >
                                        <item.icon className="size-[18px] shrink-0" />
                                        <span className="flex-1 truncate">{item.label}</span>
                                        {!!item.count && (
                                            <span className="bg-primary text-primary-foreground min-w-5 rounded-full px-1.5 text-center text-[11px] leading-5 font-bold tabular-nums">
                                                {item.count}
                                            </span>
                                        )}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>
                ))}
            </nav>

            <div className="flex flex-col gap-3 p-3">
                <Link
                    href={route('home')}
                    className="text-muted-foreground hover:bg-muted hover:text-foreground flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition"
                >
                    <ArrowLeft className="size-[18px]" /> {t('adm.backToApp')}
                </Link>
                {auth.user && (
                    <div className="bg-muted/60 flex items-center gap-3 rounded-2xl p-2.5">
                        <UserAvatar name={auth.user.name} src={auth.user.avatar_url} className="size-9 text-sm" />
                        <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-bold">{auth.user.name}</span>
                            <span className="text-muted-foreground block text-xs">{area.role}</span>
                        </span>
                        <LangSwitch />
                    </div>
                )}
            </div>
        </div>
    );
}
