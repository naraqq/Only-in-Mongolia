import AppLogo from '@/components/app-logo';
import { useT, type TKey } from '@/lib/i18n';
import { Head, Link } from '@inertiajs/react';
import { ArrowLeft, House, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';

type Status = 403 | 404 | 419 | 429 | 500 | 503;

const TEXT: Record<Status, { title: TKey; body: TKey }> = {
    403: { title: 'err.403.title', body: 'err.403.body' },
    404: { title: 'err.404.title', body: 'err.404.body' },
    419: { title: 'err.419.title', body: 'err.419.body' },
    429: { title: 'err.429.title', body: 'err.429.body' },
    500: { title: 'err.500.title', body: 'err.500.body' },
    503: { title: 'err.503.title', body: 'err.503.body' },
};

/**
 * Our own page for errors (not found, not allowed, page expired, too many requests, server trouble, maintenance).
 * Rendered by bootstrap/app.php; it can't rely on the signed-in user, so it stands on its own.
 */
export default function ErrorPage({ status, retryAfter }: { status: Status; retryAfter: number | null }) {
    const { t } = useT();
    const text = TEXT[status] ?? TEXT[500];
    const [wait, setWait] = useState(status === 429 ? (retryAfter ?? 30) : 0);

    // Too many requests: count down until trying again makes sense.
    useEffect(() => {
        if (wait <= 0) return;
        const timer = setTimeout(() => setWait((w) => w - 1), 1000);
        return () => clearTimeout(timer);
    }, [wait]);

    const reload = () => window.location.reload();
    const canGoBack = typeof window !== 'undefined' && window.history.length > 1;

    return (
        <div className="bg-background text-foreground relative flex min-h-svh flex-col overflow-hidden">
            <Head title={t(text.title)} />
            {/* A soft glow of the brand colour behind everything. */}
            <div
                aria-hidden
                className="bg-brand-2/25 dark:bg-brand-2/10 pointer-events-none absolute -top-40 left-1/2 size-[640px] -translate-x-1/2 rounded-full blur-3xl"
            />

            <header className="relative flex items-center px-5 py-4 sm:px-8">
                <Link href={route('home')} aria-label={t('nav.home')}>
                    <AppLogo />
                </Link>
            </header>

            <main className="relative flex flex-1 flex-col items-center justify-center px-6 pb-16 text-center">
                <Scene status={status} />
                <p className="text-primary mt-6 text-sm font-extrabold tracking-[0.25em] tabular-nums">{t('err.code', { code: status })}</p>
                <h1 className="mt-2 max-w-xl text-3xl font-extrabold tracking-tight text-balance sm:text-4xl">{t(text.title)}</h1>
                <p className="text-muted-foreground mt-3 max-w-md text-base text-pretty">{t(text.body)}</p>

                <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                    {status === 419 || status === 500 || status === 503 ? (
                        <button
                            type="button"
                            onClick={reload}
                            className="bg-primary text-primary-foreground inline-flex h-11 items-center gap-2 rounded-xl px-5 text-sm font-bold transition hover:brightness-110"
                        >
                            <RefreshCw className="size-4" /> {t('err.refresh')}
                        </button>
                    ) : status === 429 ? (
                        <button
                            type="button"
                            onClick={reload}
                            disabled={wait > 0}
                            className="bg-primary text-primary-foreground inline-flex h-11 items-center gap-2 rounded-xl px-5 text-sm font-bold tabular-nums transition hover:brightness-110 disabled:opacity-50"
                        >
                            <RefreshCw className={`size-4 ${wait > 0 ? 'animate-spin [animation-duration:2s]' : ''}`} />
                            {wait > 0 ? t('err.tryIn', { n: wait }) : t('err.tryAgain')}
                        </button>
                    ) : (
                        <Link
                            href={route('home')}
                            className="bg-primary text-primary-foreground inline-flex h-11 items-center gap-2 rounded-xl px-5 text-sm font-bold transition hover:brightness-110"
                        >
                            <House className="size-4" /> {t('err.home')}
                        </Link>
                    )}
                    {canGoBack && (
                        <button
                            type="button"
                            onClick={() => window.history.back()}
                            className="hover:bg-muted inline-flex h-11 items-center gap-2 rounded-xl px-5 text-sm font-semibold transition"
                        >
                            <ArrowLeft className="size-4" /> {t('err.back')}
                        </button>
                    )}
                    {(status === 419 || status === 429 || status === 500 || status === 503) && (
                        <Link
                            href={route('home')}
                            className="hover:bg-muted inline-flex h-11 items-center gap-2 rounded-xl px-5 text-sm font-semibold transition"
                        >
                            <House className="size-4" /> {t('err.home')}
                        </Link>
                    )}
                </div>
            </main>
        </div>
    );
}

/** The logo's scene, large: the sun over the steppe, with a touch for each error. */
function Scene({ status }: { status: Status }) {
    const sunUp = status !== 503 && status !== 500;
    return (
        <svg viewBox="0 0 240 150" className="w-64 max-w-full sm:w-80" aria-hidden>
            <defs>
                <clipPath id="err-frame">
                    <rect width="240" height="150" rx="28" />
                </clipPath>
            </defs>
            <g clipPath="url(#err-frame)">
                <rect width="240" height="150" fill="#d4f47c" />
                {/* Sun: rises for most errors, sinks for server trouble. */}
                <circle cx="120" cy={sunUp ? 58 : 98} r="22" fill="#20251e" className="err-sun" />
                {status === 429 && (
                    <g stroke="#20251e" strokeWidth="5" strokeLinecap="round" opacity="0.5">
                        <path d="M60 40h22M52 58h28M60 76h22" className="err-speed" />
                    </g>
                )}
                {status === 403 && (
                    <g fill="none" stroke="#20251e" strokeWidth="6" strokeLinecap="round">
                        <path d="M30 100h180" />
                        <path d="M50 100V82M90 100V82M150 100V82M190 100V82" />
                        <path d="M38 88h164" />
                    </g>
                )}
                {/* Hills */}
                <path d="M0 150V112l44-34 34 26 42-36 40 32 30-22 50 40v32Z" fill="#20251e" />
                {status === 404 && (
                    <g fill="#d4f47c">
                        <circle cx="150" cy="128" r="3" />
                        <circle cx="166" cy="122" r="3" />
                        <circle cx="182" cy="128" r="3" />
                        <text x="198" y="133" fontSize="18" fontWeight="800" fill="#d4f47c">
                            ?
                        </text>
                    </g>
                )}
                {status === 419 && (
                    <g fill="none" stroke="#d4f47c" strokeWidth="4" strokeLinecap="round">
                        <circle cx="120" cy="125" r="13" />
                        <path d="M120 117v8l6 4" />
                    </g>
                )}
                {status === 500 && (
                    <path d="M110 110l8 10-6 6 10 14" fill="none" stroke="#d4f47c" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
                )}
                {status === 503 && (
                    <text x="104" y="138" fontSize="20" fontWeight="800" fill="#d4f47c">
                        z<tspan fontSize="14">z</tspan>
                    </text>
                )}
            </g>
        </svg>
    );
}
