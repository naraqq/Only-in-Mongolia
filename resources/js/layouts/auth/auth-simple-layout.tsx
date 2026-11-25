import AppLogo from '@/components/app-logo';
import LangSwitch from '@/components/lang-switch';
import { avatarGradient } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { Link } from '@inertiajs/react';
import { BadgeCheck, Heart, Lock } from 'lucide-react';

interface AuthLayoutProps {
    children: React.ReactNode;
    name?: string;
    title?: string;
    description?: string;
}

/** Photos from Unsplash (free to use under the Unsplash License); credited in the corner of the hero. */
const SLIDES = ['/images/auth/eagle-hunter.jpg', '/images/auth/eagle-men.jpg', '/images/auth/ger-camp.jpg'];

/** Sign-in pages: a photo hero of Mongolia on one side, the form on the other. On phones the photo becomes a banner. */
export default function AuthSimpleLayout({ children, title, description }: AuthLayoutProps) {
    return (
        <div className="bg-background grid min-h-svh grid-cols-[minmax(0,1fr)] grid-rows-[auto_1fr] lg:grid-cols-[1.1fr_1fr] lg:grid-rows-1">
            <Hero />

            <div className="relative isolate flex flex-col overflow-hidden px-6 pt-6 pb-10 sm:px-10">
                {/* Soft brand glow behind the form */}
                <div className="bg-primary/10 absolute -top-32 -right-32 -z-10 size-96 rounded-full blur-3xl" aria-hidden />
                <div className="absolute -bottom-40 -left-24 -z-10 size-96 rounded-full bg-amber-400/10 blur-3xl" aria-hidden />
                <div className="flex justify-end">
                    <LangSwitch />
                </div>

                <div className="flex flex-1 items-center justify-center py-8 lg:py-10">
                    <div className="w-full max-w-sm">
                        <div className="mb-8">
                            <h1 className="text-3xl font-extrabold tracking-tight lg:text-4xl">{title}</h1>
                            {description && <p className="text-muted-foreground mt-2 text-[15px] leading-relaxed">{description}</p>}
                        </div>
                        <div className="flex flex-col gap-6">{children}</div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function Hero() {
    const { t } = useT();

    return (
        <aside className="relative h-[38svh] min-h-64 overflow-hidden bg-zinc-900 text-white lg:sticky lg:top-0 lg:h-svh">
            {/* Slow crossfade between photos */}
            {SLIDES.map((src, i) => (
                <div key={src} className="auth-slide absolute inset-0" style={{ animationDelay: `${i * 6}s`, opacity: i === 0 ? 1 : 0 }}>
                    <img src={src} alt="" className="auth-kenburns size-full object-cover" style={{ animationDelay: `${i * 6}s` }} />
                </div>
            ))}
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-black/40" />
            <div className="from-primary/30 absolute inset-0 bg-gradient-to-br via-transparent to-transparent mix-blend-overlay" />

            <div className="relative flex h-full flex-col p-6 sm:p-10">
                <Link href={route('home')} className="w-fit rounded-2xl bg-white/10 px-3 py-2 ring-1 ring-white/20 backdrop-blur-md">
                    <AppLogo />
                </Link>

                {/* Floating preview cards */}
                <div className="pointer-events-none relative hidden flex-1 lg:block">
                    <div className="auth-float absolute top-[14%] right-[6%] w-64 rounded-2xl bg-white/12 p-4 shadow-2xl ring-1 ring-white/25 backdrop-blur-xl">
                        <div className="flex items-center gap-3">
                            <span
                                className={`grid size-11 place-items-center rounded-full bg-gradient-to-br text-lg font-bold ${avatarGradient('saraa.art')}`}
                            >
                                С
                            </span>
                            <div className="min-w-0">
                                <p className="flex items-center gap-1 font-semibold">
                                    Сараа <BadgeCheck className="size-4 text-sky-300" />
                                </p>
                                <p className="text-xs text-white/70">@saraa.art</p>
                            </div>
                        </div>
                        <div className="mt-3 flex items-center justify-between rounded-xl bg-white/10 px-3 py-2 text-sm">
                            <span className="inline-flex items-center gap-1.5 text-white/80">
                                <Lock className="size-3.5" /> {t('auth.cardLocked')}
                            </span>
                            <span className="font-bold">₮9,900</span>
                        </div>
                    </div>

                    <div
                        className="auth-float bg-primary absolute right-[14%] bottom-[18%] flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold shadow-2xl shadow-black/40"
                        style={{ animationDelay: '-1.5s' }}
                    >
                        <Heart className="size-4 fill-white" /> {t('auth.cardNew')}
                    </div>
                </div>

                <div className="mt-auto max-w-lg">
                    <h2 className="text-3xl leading-tight font-extrabold tracking-tight text-balance sm:text-4xl lg:text-5xl">
                        {t('auth.heroTitle')}
                    </h2>
                    {/* Which photo is showing */}
                    <div className="mt-6 flex max-w-48 gap-1.5" aria-hidden>
                        {SLIDES.map((src, i) => (
                            <span key={src} className="h-1 flex-1 overflow-hidden rounded-full bg-white/25">
                                <span className="auth-progress block h-full rounded-full bg-white" style={{ animationDelay: `${i * 6}s` }} />
                            </span>
                        ))}
                    </div>
                    <p className="mt-4 hidden text-[11px] text-white/45 lg:block">
                        {t('auth.photos')}: Fadhil Abhimantra, ulziibayar badamdorj, Peter Burdon · Unsplash
                    </p>
                </div>
            </div>
        </aside>
    );
}
