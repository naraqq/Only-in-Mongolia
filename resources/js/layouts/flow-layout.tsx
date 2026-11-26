import AppLogo from '@/components/app-logo';
import { useT } from '@/lib/i18n';
import { Head, Link } from '@inertiajs/react';
import { X } from 'lucide-react';
import { type ReactNode } from 'react';

/**
 * A focused, step-by-step screen (e.g. becoming a creator): no sidebars, just the logo, a close button,
 * a thin progress bar, one narrow column, and the step's buttons pinned to the bottom.
 */
export default function FlowLayout({
    title,
    closeHref,
    progress,
    footer,
    children,
}: {
    title: string;
    closeHref: string;
    /** 0–1; leave out to hide the bar. */
    progress?: number;
    footer?: ReactNode;
    children: ReactNode;
}) {
    const { t } = useT();

    return (
        <div className="bg-background flex min-h-dvh flex-col">
            <Head title={title} />
            <header className="bg-background/90 sticky top-0 z-20 backdrop-blur">
                <div className="mx-auto flex h-16 max-w-2xl items-center justify-between gap-3 px-4">
                    <Link href={route('home')} className="shrink-0">
                        <AppLogo />
                    </Link>
                    <Link
                        href={closeHref}
                        className="hover:bg-muted grid size-10 place-items-center rounded-full transition"
                        aria-label={t('po.close')}
                    >
                        <X className="size-5" />
                    </Link>
                </div>
                {progress !== undefined && (
                    <div className="bg-muted h-1">
                        <div
                            className="bg-primary h-full rounded-r-full transition-[width] duration-500"
                            style={{ width: `${Math.max(0, Math.min(1, progress)) * 100}%` }}
                        />
                    </div>
                )}
            </header>

            <main className="animate-page-in mx-auto w-full max-w-2xl flex-1 px-4 pt-6 pb-10 sm:pt-10">{children}</main>

            {footer && (
                <footer className="bg-card/95 sticky bottom-0 z-20 shadow-[0_-2px_12px_rgb(0_0_0/0.08)] backdrop-blur">
                    <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">{footer}</div>
                </footer>
            )}
        </div>
    );
}
