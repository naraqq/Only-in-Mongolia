import AppLogo from '@/components/app-logo';
import AppLogoIcon from '@/components/app-logo-icon';
import { type CreatorCardData } from '@/components/creator-card';
import LangSwitch from '@/components/lang-switch';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import UserAvatar from '@/components/user-avatar';
import { avatarGradient, mnt } from '@/lib/format';
import { useT, type TKey } from '@/lib/i18n';
import { type SharedData } from '@/types';
import { Head, Link, router, usePage } from '@inertiajs/react';
import {
    BadgeCheck,
    Banknote,
    Bell,
    Bookmark,
    Compass,
    House,
    LogIn,
    LogOut,
    MessageCircle,
    MoreHorizontal,
    PenSquare,
    Plus,
    Search,
    Settings,
    ShieldCheck,
    Sparkles,
    UserPen,
    UserRound,
    Users,
    type LucideIcon,
} from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';

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
    const page = usePage<SharedData & { unreadMessages: number; unreadNotifications: number }>();
    const { auth, unreadMessages, unreadNotifications } = page.props;
    const user = auth.user;
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
                  ...(creator
                      ? [
                            { label: 'nav.studio', href: route('studio'), icon: PenSquare, match: (u: string) => u === '/studio' } as NavLink,
                            {
                                label: 'nav.myProfile',
                                href: route('creator.show', creator.handle),
                                icon: UserRound,
                                match: (u: string) => u === `/@${creator.handle}`,
                            } as NavLink,
                        ]
                      : [
                            {
                                label: 'nav.becomeCreator',
                                href: route('creator.apply'),
                                icon: Sparkles,
                                match: (u: string) => u === '/creator/apply',
                            } as NavLink,
                        ]),
                  ...(user.is_admin
                      ? [
                            {
                                label: 'nav.admin',
                                href: route('admin.creators'),
                                icon: ShieldCheck,
                                match: (u: string) => u.startsWith('/admin/creators'),
                            } as NavLink,
                            {
                                label: 'nav.payouts',
                                href: route('admin.payouts'),
                                icon: Banknote,
                                match: (u: string) => u.startsWith('/admin/payouts'),
                            } as NavLink,
                        ]
                      : []),
              ]
            : []),
    ];

    const newPost = creator ? route('studio') : user ? route('creator.apply') : route('login');

    return (
        <div className="bg-background min-h-svh">
            <Head title={title} />

            {/* Phone top bar */}
            <header className="bg-background/90 sticky top-0 z-30 flex h-14 items-center gap-3 border-b px-4 backdrop-blur md:hidden">
                <Link href={route('home')} aria-label={t('nav.home')}>
                    <AppLogo />
                </Link>
                <div className="ml-auto flex items-center gap-2">
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

            <div className="mx-auto flex max-w-[1240px] justify-center">
                {/* Left: navigation */}
                <aside className="sticky top-0 hidden h-svh w-20 shrink-0 flex-col px-3 py-4 md:flex xl:w-64">
                    <Link href={route('home')} className="mb-6 flex items-center px-3 py-2" aria-label={t('nav.home')}>
                        <AppLogoIcon className="size-9 xl:hidden" />
                        <AppLogo className="hidden xl:flex" />
                    </Link>
                    <nav className="flex flex-col gap-1">
                        {links.map((l) => {
                            const active = l.match(path);
                            return (
                                <Link
                                    key={l.href}
                                    href={l.href}
                                    prefetch
                                    className={`group flex items-center gap-4 rounded-2xl px-3 py-2.5 text-[17px] transition ${active ? 'bg-primary/10 text-primary font-bold' : 'text-foreground/70 hover:bg-muted hover:text-foreground font-medium'}`}
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

                    <Button
                        asChild
                        size="lg"
                        className="from-primary shadow-primary/25 mt-6 h-12 rounded-full bg-gradient-to-r to-rose-500 text-[15px] font-bold shadow-lg transition hover:brightness-110 xl:w-full"
                    >
                        <Link href={newPost} aria-label={t(creator ? 'nav.newPost' : user ? 'nav.becomeCreator' : 'nav.login')}>
                            {user ? <Plus className="size-5" /> : <LogIn className="size-5" />}
                            <span className="hidden xl:inline">{t(creator ? 'nav.newPost' : user ? 'nav.becomeCreator' : 'nav.login')}</span>
                        </Link>
                    </Button>

                    {user && (
                        <div className="mt-auto">
                            <AccountMenu />
                        </div>
                    )}
                </aside>

                {/* Centre: the page */}
                <main className={`min-h-svh w-full min-w-0 pb-20 md:border-x md:pb-0 ${wide ? 'max-w-[960px]' : 'max-w-[620px]'}`}>
                    {header !== undefined && (
                        <div className="bg-background/85 sticky top-14 z-20 flex h-14 items-center gap-3 border-b px-5 backdrop-blur-md md:top-0">
                            {header}
                        </div>
                    )}
                    {children}
                </main>

                {/* Right: search and suggestions */}
                {!wide && (
                    <aside className="sticky top-0 hidden h-svh w-80 shrink-0 overflow-y-auto px-6 py-4 lg:block">
                        <RightRail />
                    </aside>
                )}
            </div>

            {/* Phone bottom tabs */}
            <nav className="bg-background/95 fixed inset-x-0 bottom-0 z-30 flex h-16 items-center justify-around border-t backdrop-blur md:hidden">
                {links.slice(0, 2).map((l) => (
                    <TabLink key={l.href} href={l.href} icon={l.icon} label={t(l.label)} active={l.match(path)} />
                ))}
                <Link
                    href={newPost}
                    className="from-primary shadow-primary/30 grid size-12 place-items-center rounded-full bg-gradient-to-br to-rose-500 text-white shadow-lg"
                    aria-label={t('nav.newPost')}
                >
                    <Plus className="size-6" />
                </Link>
                {links.slice(2, 4).map((l) => (
                    <TabLink key={l.href} href={l.href} icon={l.icon} label={t(l.label)} active={l.match(path)} badge={l.badge} />
                ))}
            </nav>
        </div>
    );
}

function TabLink({ href, icon: Icon, label, active, badge }: { href: string; icon: LucideIcon; label: string; active: boolean; badge?: number }) {
    return (
        <Link
            href={href}
            className={`relative grid size-11 place-items-center ${active ? 'text-primary' : 'text-muted-foreground'}`}
            aria-label={label}
        >
            <Icon className="size-6" strokeWidth={active ? 2.4 : 1.8} />
            {!!badge && <Badge n={badge} />}
        </Link>
    );
}

/** Unread count on a nav icon. */
function Badge({ n }: { n: number }) {
    return (
        <span className="bg-primary ring-background absolute -top-1.5 -right-2 grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[10px] font-bold text-white ring-2">
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
                        <UserPen className="mr-2 size-4" /> {t('nav.editProfile')}
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

function RightRail() {
    const { t } = useT();
    const { suggestions } = usePage<SharedData & { suggestions: CreatorCardData[] }>().props;
    const [q, setQ] = useState('');

    function search(e: FormEvent) {
        e.preventDefault();
        router.get(route('creators'), q.trim() ? { q: q.trim() } : {});
    }

    return (
        <div className="flex flex-col gap-6">
            <form onSubmit={search} className="border-input focus-within:border-ring flex items-center gap-2 rounded-full border px-4">
                <Search className="text-muted-foreground size-4 shrink-0" aria-hidden />
                <input
                    type="search"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder={t('rail.search')}
                    className="placeholder:text-muted-foreground h-11 w-full bg-transparent text-sm outline-none"
                />
            </form>

            {suggestions.length > 0 && (
                <section>
                    <h2 className="text-muted-foreground mb-3 text-xs font-semibold tracking-wider uppercase">{t('rail.suggestions')}</h2>
                    <div className="flex flex-col gap-3">
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

/** A banner-style creator tile: colour cover, avatar, name and price. */
function SuggestionCard({ c }: { c: CreatorCardData }) {
    const { t } = useT();
    const g = avatarGradient(c.handle);

    return (
        <Link href={route('creator.show', c.handle)} className={`group relative block h-28 overflow-hidden rounded-xl bg-gradient-to-br ${g}`}>
            <span className="absolute inset-0 bg-black/15 transition group-hover:bg-black/25" />
            <span className="absolute top-2 left-2 rounded-md bg-black/40 px-1.5 py-0.5 text-[11px] font-semibold text-white">
                {c.price_monthly === 0 ? t('rail.free') : t('cp.monthly', { price: mnt(c.price_monthly) })}
            </span>
            {c.adult_content && (
                <span className="absolute top-2 right-2 rounded-md bg-rose-600 px-1.5 py-0.5 text-[11px] font-semibold text-white">18+</span>
            )}
            <span className="absolute inset-x-0 bottom-0 flex items-center gap-3 bg-gradient-to-t from-black/60 to-transparent p-3 text-white">
                <UserAvatar name={c.display_name} src={c.avatar_url} seed={c.handle} className="size-12 border-2 border-white text-lg" />
                <span className="min-w-0">
                    <span className="flex items-center gap-1 font-semibold">
                        <span className="truncate">{c.display_name}</span>
                        <BadgeCheck className="size-4 shrink-0" aria-hidden />
                    </span>
                    <span className="block truncate text-xs text-white/80">@{c.handle}</span>
                </span>
            </span>
        </Link>
    );
}
