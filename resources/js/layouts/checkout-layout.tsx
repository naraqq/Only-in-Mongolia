import AppLogo from '@/components/app-logo';
import { useT } from '@/lib/i18n';
import { Head, Link } from '@inertiajs/react';
import { Check, Lock, X } from 'lucide-react';
import { type ReactNode } from 'react';

/**
 * Checkout pages: no social sidebars, just the logo, a step bar, the current step and an order summary
 * (beside it on wide screens, above it on phones). `current` is the 0-based step; steps.length means all done.
 */
export default function CheckoutLayout({
    title,
    steps,
    current,
    backHref,
    summary,
    children,
}: {
    title: string;
    steps: string[];
    current: number;
    backHref: string;
    summary: ReactNode;
    children: ReactNode;
}) {
    const { t } = useT();

    return (
        <div className="bg-background min-h-dvh">
            <Head title={title} />
            <header className="bg-background/90 sticky top-0 z-20 backdrop-blur">
                <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-3 px-4">
                    <Link href={route('home')} className="shrink-0">
                        <AppLogo />
                    </Link>
                    <span className="text-muted-foreground hidden items-center gap-1.5 text-sm font-medium sm:inline-flex">
                        <Lock className="size-4" /> {t('co.secure')}
                    </span>
                    <Link href={backHref} className="hover:bg-muted grid size-10 place-items-center rounded-full" aria-label={t('co.cancel')}>
                        <X className="size-5" />
                    </Link>
                </div>
            </header>

            <div className="animate-page-in mx-auto max-w-5xl px-4 py-6 lg:py-10">
                <ol className="mx-auto flex max-w-xl items-center">
                    {steps.map((label, i) => {
                        const done = i < current;
                        const active = i === current;
                        return (
                            <li key={label} className={`flex items-center ${i < steps.length - 1 ? 'flex-1' : ''}`}>
                                <span className="flex flex-col items-center gap-1.5 sm:flex-row sm:gap-2">
                                    <span
                                        className={`grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold transition ${
                                            done
                                                ? 'bg-emerald-500 text-white'
                                                : active
                                                  ? 'bg-primary text-primary-foreground ring-primary/20 ring-4'
                                                  : 'bg-muted text-muted-foreground'
                                        }`}
                                    >
                                        {done ? <Check className="size-4" strokeWidth={3} /> : i + 1}
                                    </span>
                                    <span
                                        className={`text-xs font-semibold sm:text-sm ${active || done ? 'text-foreground' : 'text-muted-foreground'}`}
                                    >
                                        {label}
                                    </span>
                                </span>
                                {i < steps.length - 1 && (
                                    <span
                                        className={`mx-2 mb-5 h-0.5 flex-1 rounded-full sm:mx-3 sm:mb-0 ${done ? 'bg-emerald-500' : 'bg-border'}`}
                                    />
                                )}
                            </li>
                        );
                    })}
                </ol>

                <div className="mt-6 grid items-start gap-5 lg:mt-10 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-8">
                    <aside className="lg:sticky lg:top-24 lg:order-2">{summary}</aside>
                    <main className="border-border border-t p-5 sm:p-8 lg:order-1">{children}</main>
                </div>

                <p className="text-muted-foreground mt-8 flex items-center justify-center gap-1.5 text-xs">
                    <Lock className="size-3.5" /> {t('pay.secure')}
                </p>
            </div>
        </div>
    );
}
