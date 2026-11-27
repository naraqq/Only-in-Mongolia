import AppLogo from '@/components/app-logo';
import AppLogoIcon from '@/components/app-logo-icon';
import AreaSwitch, { adminWaiting, useBusinessSwitch, type AreaTarget } from '@/components/area-switch';
import { type CreatorCardData } from '@/components/creator-card';
import LangSwitch from '@/components/lang-switch';
import NowPlayingBar from '@/components/now-playing-bar';
import SearchBox from '@/components/search-box';
import Sponsored from '@/components/sponsored';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import UserAvatar from '@/components/user-avatar';
import { mnt } from '@/lib/format';
import { useT, type TKey } from '@/lib/i18n';
import { useLayoutArea } from '@/lib/layout-area';
import { useLive } from '@/lib/live';
import { type SharedData } from '@/types';
import { Head, Link, router, usePage } from '@inertiajs/react';
import {
    BadgeCheck,
    Bell,
    Bookmark,
    Clapperboard,
    Compass,
    House,
    LogIn,
    LogOut,
    MessageCircle,
    MoreHorizontal,
    Plus,
    Search,
    Settings,
    ShieldCheck,
    UserRound,
    Users,
    Wallet,
    type LucideIcon,
} from 'lucide-react';
import { type ReactNode } from 'react';

type NavLink = { label: TKey; href: string; icon: LucideIcon; match: (url: string) => boolean; badge?: number };

/**
 * The main app shell: navigation on the left, the page in a narrow centre column, and search plus suggested
 * creators on the right. On phones the left column becomes a bottom tab bar and the right column is hidden.
 */
export default function SocialLayout({
    title,
    header,
    children,
    wide = false,
}: {
    title: string;
    header?: ReactNode;
    children: ReactNode;
    /** Wide centre column without the right-hand column (e.g. messages). */
    wide?: boolean;
}) {
    const { t } = useT();
    useLayoutArea('client');
    const page = usePage<
        SharedData & {
            unreadMessages: number;
            unreadNotifications: number;
            adminCounts: { applications: number; payouts: number; reports: number; ads: number } | null;
        }
    >();
    const { auth, unreadMessages, unreadNotifications, adminCounts } = page.props;
    const user = auth.user;
    // Bell and message badges update the moment something arrives.
    useLive(user ? `user.${user.id}` : null, ['notification', 'inbox'], () =>
        router.reload({ only: ['unreadNotifications', 'unreadMessages', 'adminCounts'] }),
    );
    const creator = auth.creator?.status === 'approved' ? auth.creator : null;
    const path = page.url.split('?')[0];

    const links: NavLink[] = [
        { label: 'nav.home', href: route('home'), icon: House, match: (u) => u === '/' || u === '/feed' },
        { label: 'nav.discover', href: route('creators'), icon: Compass, match: (u) => u.startsWith('/creators') },
        ...(user
            ? [
                  {
                      label: 'nav.notifications',
                      href: route('notifications'),
                      icon: Bell,
                      match: (u: string) => u.startsWith('/notifications'),
                      badge: unreadNotifications,
                  } as NavLink,
                  {
                      label: 'nav.messages',
                      href: route('messages.index'),
                      icon: MessageCircle,
                      match: (u: string) => u.startsWith('/messages'),
                      badge: unreadMessages,
                  } as NavLink,
                  { label: 'fan.followingTitle', href: route('dashboard'), icon: Users, match: (u: string) => u === '/dashboard' } as NavLink,
                  { label: 'nav.saved', href: route('saved'), icon: Bookmark, match: (u: string) => u === '/saved' } as NavLink,
                  { label: 'wal.title', href: route('wallet'), icon: Wallet, match: (u: string) => u === '/wallet' } as NavLink,
                  ...(creator
                      ? [
                            {
                                label: 'nav.myProfile',
                                href: route('creator.show', creator.handle),
                                icon: UserRound,
                                match: (u: string) => u === `/@${creator.handle}`,
                            } as NavLink,
                        ]
                      : [
                            {
                                label: 'nav.myProfile',
                                href: route('me.edit'),
                                icon: UserRound,
                                match: (u: string) => u.startsWith('/profile'),
                            } as NavLink,
                        ]),
              ]
            : []),
    ];

    // Other parts of the app (they have their own layout): shown apart from the menu, as switches.
    const business = useBusinessSwitch();
    const areas: AreaTarget[] = [
        ...(creator
            ? [{ label: t('nav.studio'), sub: t('nav.studioSub'), href: route('studio'), icon: Clapperboard, tone: 'studio' } as AreaTarget]
            : []),
        ...(user?.is_admin
            ? [
                  {
                      label: t('nav.adminHome'),
                      sub: t('nav.adminSub'),
                      href: route('admin.dashboard'),
                      icon: ShieldCheck,
                      tone: 'admin',
                      badge: adminWaiting(adminCounts),
                  } as AreaTarget,
              ]
            : []),
        ...(business ? [business] : []),
    ];

    // The big button: "New post" for creators, "Log in" for guests. Fans become creators from their profile page.
    const newPost = creator ? route('studio') : user ? null : route('login');

    return (
        <div className="bg-background min-h-svh">
            <Head title={title} />

            {/* Phone top bar */}
            <header className="bg-background sticky top-0 z-30 flex h-14 items-center gap-3 px-4 shadow-xs md:hidden">
                <Link href={route('home')} className="min-w-0" aria-label={t('nav.home')}>
                    <AppLogo className={user ? '' : 'max-[359px]:[&>span]:hidden'} />
                </Link>
                <div className="ml-auto flex shrink-0 items-center gap-2">
                    <Link
                        href={route('search')}
                        aria-label={t('nav.search')}
                        aria-current={path === '/search' ? 'page' : undefined}
                        className="hover:bg-muted grid size-9 place-items-center rounded-full"
                    >
                        <Search className="size-5" aria-hidden />
                    </Link>
                    <LangSwitch />
                    {user ? (
                        <AccountMenu compact />
                    ) : (
                        <Button asChild size="sm">
                            <Link href={route('login')}>{t('nav.login')}</Link>
                        </Button>
                    )}
                </div>
            </header>

            {/* Desktop navigation, workspace, and contextual discovery. */}
            <div className="mx-auto flex w-full max-w-[1500px]">
                {/* Left: navigation */}
                <aside className="sticky top-0 hidden h-[calc(100svh-var(--player-h,0px))] w-20 shrink-0 flex-col overflow-y-auto px-3 py-5 md:flex xl:w-60">
                    <Link href={route('home')} className="mb-6 flex items-center px-3 py-2" aria-label={t('nav.home')}>
                        <AppLogoIcon className="size-9 xl:hidden" />
                        <AppLogo className="hidden xl:flex" />
                    </Link>
                    <nav className="flex flex-col gap-1">
                        <Link
                            href={route('search')}
                            aria-current={path === '/search' ? 'page' : undefined}
                            title={t('nav.search')}
                            className={`flex items-center gap-4 rounded-lg px-3 py-2.5 text-[15px] transition ${path === '/search' ? 'bg-muted text-foreground font-bold' : 'text-foreground/70 hover:bg-muted hover:text-foreground font-medium'}`}
                        >
                            <Search className="size-6 shrink-0" aria-hidden />
                            <span className="hidden xl:inline">{t('nav.search')}</span>
                        </Link>
                        {links.map((l) => {
                            const active = l.match(path);
                            return (
                                <Link
                                    key={l.href}
                                    href={l.href}
                                    // Pages with a live count (notifications, messages) always load fresh.
                                    prefetch={l.badge === undefined}
                                    className={`group flex items-center gap-4 rounded-lg px-3 py-2.5 text-[15px] transition ${active ? 'bg-muted text-foreground font-bold' : 'text-foreground/70 hover:bg-muted hover:text-foreground font-medium'}`}
                                    aria-current={active ? 'page' : undefined}
                                    title={t(l.label)}
                                >
                                    <span className="relative">
                                        <l.icon className="size-6 shrink-0" strokeWidth={active ? 2.4 : 1.8} />
                                        {!!l.badge && <Badge n={l.badge} />}
                                    </span>
                                    <span className="hidden truncate xl:inline">{t(l.label)}</span>
                                </Link>
                            );
                        })}
                    </nav>

                    {areas.length > 0 && (
                        <div className="border-border mt-4 flex flex-col gap-1.5 border-t pt-4">
                            <span className="text-muted-foreground hidden px-3 pb-0.5 text-[11px] font-bold tracking-wider uppercase xl:block">
                                {t('nav.switchTo')}
                            </span>
                            {areas.map((a) => (
                                <AreaSwitch key={a.href} area={a} compact />
                            ))}
                        </div>
                    )}

                    {newPost && (
                        <Button asChild size="lg" className="mt-6 h-11 rounded-lg text-sm font-bold xl:w-full">
                            <Link href={newPost} aria-label={t(creator ? 'nav.newPost' : 'nav.login')}>
                                {creator ? <Plus className="size-5" /> : <LogIn className="size-5" />}
                                <span className="hidden xl:inline">{t(creator ? 'nav.newPost' : 'nav.login')}</span>
                            </Link>
                        </Button>
                    )}

                    {user && (
                        <div className="mt-auto">
                            <AccountMenu />
                        </div>
                    )}
                </aside>

                {/* Main workspace */}
                <main className="min-h-svh min-w-0 flex-1 pb-[calc(5rem+env(safe-area-inset-bottom)+var(--player-h,0px))] md:px-6 md:pb-[var(--player-h,0px)]">
                    <div className={`animate-page-in mx-auto w-full ${wide ? 'max-w-[1100px]' : 'max-w-[680px]'}`}>
                        {header !== undefined && (
                            <div className="bg-background sticky top-14 z-20 flex h-14 items-center gap-3 px-5 md:top-0">{header}</div>
                        )}
                        {children}
                    </div>
                </main>

                {/* Right: search and suggestions */}
                {!wide && (
                    <aside className="sticky top-0 hidden h-[calc(100svh-var(--player-h,0px))] w-80 shrink-0 overflow-y-auto px-4 py-4 lg:block xl:w-[340px] 2xl:w-[360px]">
                        <RightRail />
                    </aside>
                )}
            </div>

            {/* Whatever is playing (music, podcasts) keeps playing from page to page. */}
            <NowPlayingBar aboveTabs />

            {/* Phone bottom tabs */}
            <nav className="border-border bg-background/95 fixed inset-x-0 bottom-0 z-30 flex min-h-16 items-center justify-around gap-1 border-t px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
                {links.slice(0, 2).map((l) => (
                    <TabLink key={l.href} href={l.href} icon={l.icon} label={t(l.label)} active={l.match(path)} />
                ))}
                {newPost && (
                    <Link
                        href={newPost}
                        className="bg-primary text-primary-foreground grid size-11 shrink-0 place-items-center rounded-xl"
                        aria-label={t(creator ? 'nav.newPost' : 'nav.login')}
                    >
                        {creator ? <Plus className="size-6" /> : <LogIn className="size-6" />}
                    </Link>
                )}
                {links.slice(2, 4).map((l) => (
                    <TabLink
                        key={l.href}
                        href={l.href}
                        icon={l.icon}
                        label={t(l.label)}
                        active={l.match(path)}
                        badge={l.badge}
                        prefetch={l.badge === undefined}
                    />
                ))}
            </nav>
        </div>
    );
}

function TabLink({
    href,
    icon: Icon,
    label,
    active,
    badge,
    prefetch = true,
}: {
    href: string;
    icon: LucideIcon;
    label: string;
    active: boolean;
    badge?: number;
    prefetch?: boolean;
}) {
    return (
        <Link
            prefetch={prefetch}
            href={href}
            className={`flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-lg px-1 ${active ? 'text-primary font-bold' : 'text-muted-foreground font-medium'}`}
            aria-label={label}
            aria-current={active ? 'page' : undefined}
        >
            <span className="relative">
                <Icon className="size-5" strokeWidth={active ? 2.4 : 1.8} />
                {!!badge && <Badge n={badge} />}
            </span>
            <span className="max-w-full truncate text-[10px]">{label}</span>
        </Link>
    );
}

/** Unread count on a nav icon. */
function Badge({ n }: { n: number }) {
    return (
        <span className="bg-primary ring-background text-primary-foreground absolute -top-1.5 -right-2 grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[10px] font-bold ring-2">
            {n > 99 ? '99+' : n}
        </span>
    );
}

/** "More": settings, appearance, log out. */
function AccountMenu({ compact = false }: { compact?: boolean }) {
    const { t } = useT();
    const { auth } = usePage<SharedData>().props;
    if (!auth.user) return null;

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                {compact ? (
                    <button className="rounded-full">
                        <UserAvatar name={auth.user.name} src={auth.user.avatar_url} letters={2} className="size-8 text-xs" />
                    </button>
                ) : (
                    <button className="hover:bg-muted flex w-full items-center gap-3 rounded-2xl p-2 text-left transition" title={t('nav.more')}>
                        <UserAvatar name={auth.user.name} src={auth.user.avatar_url} letters={2} className="size-10 text-sm" />
                        <span className="hidden min-w-0 flex-1 xl:block">
                            <span className="block truncate text-sm font-semibold">{auth.user.name}</span>
                            <span className="text-muted-foreground block truncate text-xs">
                                {auth.creator?.status === 'approved' ? `@${auth.creator.handle}` : t('nav.more')}
                            </span>
                        </span>
                        <MoreHorizontal className="text-muted-foreground hidden size-5 shrink-0 xl:block" />
                    </button>
                )}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
                <div className="px-2 py-1.5 text-sm">
                    <p className="truncate font-semibold">{auth.user.name}</p>
                    {auth.creator?.status === 'approved' && <p className="text-muted-foreground truncate">@{auth.creator.handle}</p>}
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild className="md:hidden">
                    <Link href={route('dashboard')} className="w-full">
                        <Users className="mr-2 size-4" /> {t('fan.followingTitle')}
                    </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                    <Link href={route('me.edit')} className="w-full">
                        <UserRound className="mr-2 size-4" /> {t('nav.myProfile')}
                    </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="md:hidden">
                    <Link href={route('wallet')} className="w-full">
                        <Wallet className="mr-2 size-4" /> {t('wal.title')}
                    </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                    <Link href={route('settings')} className="w-full">
                        <Settings className="mr-2 size-4" /> {t('nav.settings')}
                    </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                    <Link href={route('logout')} method="post" as="button" className="w-full">
                        <LogOut className="mr-2 size-4" /> {t('nav.logout')}
                    </Link>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

export function RightRail() {
    const { t } = useT();
    const page = usePage<SharedData & { suggestions: CreatorCardData[]; creator?: { adult_content?: boolean } }>();
    const { suggestions } = page.props;
    // Only a creator's own page (or series) counts as "next to 18+ content".
    const adultPage = page.component.startsWith('creator/') && !!page.props.creator?.adult_content;

    return (
        <div className="flex flex-col gap-6">
            <SearchBox />

            {/* Sponsored banners (on an 18+ creator's page, only campaigns that opted in). */}
            <Sponsored adult={adultPage} />

            {suggestions.length > 0 && (
                <section>
                    <h2 className="text-muted-foreground mb-3 text-xs font-semibold tracking-wider uppercase">{t('rail.suggestions')}</h2>
                    <div className="flex flex-col">
                        {suggestions.map((c) => (
                            <SuggestionCard key={c.handle} c={c} />
                        ))}
                    </div>
                    <Button asChild variant="outline" className="mt-4 w-full rounded-full">
                        <Link href={route('creators')}>{t('rail.discoverMore')}</Link>
                    </Button>
                </section>
            )}

            <div className="flex items-center justify-between">
                <LangSwitch />
                <span className="text-muted-foreground text-xs">© {new Date().getFullYear()}</span>
            </div>
        </div>
    );
}

/** A compact recommendation beside the main feed. */
function SuggestionCard({ c }: { c: CreatorCardData }) {
    const { t } = useT();

    return (
        <Link href={route('creator.show', c.handle)} className="group border-border flex min-h-15 items-center gap-3 border-b py-2">
            <UserAvatar name={c.display_name} src={c.avatar_url} seed={c.handle} className="size-10 text-sm" />
            <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1 text-sm font-semibold group-hover:underline">
                    <span className="truncate">{c.display_name}</span>
                    <BadgeCheck className="text-primary size-3.5 shrink-0" aria-hidden />
                    {c.adult_content && <span className="text-destructive text-[10px]">18+</span>}
                </span>
                <span className="text-muted-foreground block truncate text-xs">@{c.handle}</span>
            </span>
            <span className="text-muted-foreground shrink-0 text-xs">
                {c.price_monthly === 0 ? t('rail.free') : t('cp.monthly', { price: mnt(c.price_monthly) })}
            </span>
        </Link>
    );
}
