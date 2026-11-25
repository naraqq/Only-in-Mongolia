import AppLogoIcon from '@/components/app-logo-icon';
import LangSwitch from '@/components/lang-switch';
import { Button } from '@/components/ui/button';
import { useT } from '@/lib/i18n';
import { type SharedData } from '@/types';
import { Head, Link, usePage } from '@inertiajs/react';
import { type ReactNode } from 'react';

/** Public pages (creator pages), for signed-in users and visitors alike. */
export default function SiteLayout({ title, children, wide = false }: { title: string; children: ReactNode; wide?: boolean }) {
    const { t } = useT();
    const { auth, name } = usePage<SharedData>().props;

    return (
        <div className="bg-background min-h-svh">
            <Head title={title} />
            <header className="sticky top-0 z-30 border-b bg-white/90 backdrop-blur dark:bg-zinc-950/90">
                <div className={`mx-auto flex h-14 items-center gap-3 px-4 ${wide ? 'max-w-5xl' : 'max-w-3xl'}`}>
                    <Link href={route('home')} className="flex items-center gap-2 font-semibold">
                        <AppLogoIcon className="size-6 fill-current" />
                        <span className="hidden sm:inline">{name}</span>
                    </Link>
                    <nav className="ml-2 flex items-center gap-4 text-sm">
                        <Link href={route('creators')} className="text-muted-foreground hover:text-foreground">
                            {t('nav.creators')}
                        </Link>
                        {auth.user && (
                            <Link href={route('feed')} className="text-muted-foreground hover:text-foreground">
                                {t('nav.feed')}
                            </Link>
                        )}
                    </nav>
                    <div className="ml-auto flex items-center gap-2">
                        <LangSwitch />
                        <Button asChild size="sm" variant={auth.user ? 'outline' : 'default'}>
                            <Link href={auth.user ? route('dashboard') : route('login')}>{auth.user ? t('nav.dashboard') : t('nav.login')}</Link>
                        </Button>
                    </div>
                </div>
            </header>
            <main className={`mx-auto px-4 py-6 ${wide ? 'max-w-5xl' : 'max-w-3xl'}`}>{children}</main>
        </div>
    );
}
