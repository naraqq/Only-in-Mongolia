import AppLogo from '@/components/app-logo';
import LangSwitch from '@/components/lang-switch';
import { useT } from '@/lib/i18n';
import { useLayoutArea } from '@/lib/layout-area';
import { Link } from '@inertiajs/react';
import { ArrowUpRight, Pause, Play } from 'lucide-react';
import { useEffect, useState } from 'react';

const loginImages = ['/images/login-images/login-v1.png', '/images/login-images/login-v2.png', '/images/login-images/login-v3.png'];

interface AuthLayoutProps {
    children: React.ReactNode;
    title?: string;
    description?: string;
}

export default function AuthSimpleLayout({ children, title, description }: AuthLayoutProps) {
    useLayoutArea('auth');
    return (
        <div className="bg-background text-foreground grid min-h-svh lg:grid-cols-[1.2fr_1fr]">
            <section className="flex min-w-0 flex-col lg:order-2">
                <header className="flex items-center justify-between gap-4 px-5 py-4 sm:px-8 lg:justify-end">
                    <Link href={route('home')} className="min-w-0 lg:hidden">
                        <AppLogo />
                    </Link>
                    <LangSwitch />
                </header>

                <main className="grid flex-1 place-items-center px-5 py-10 sm:px-8 sm:py-14">
                    <div className="w-full max-w-[420px]">
                        <div className="mb-8">
                            <h1 className="text-4xl leading-[1.04] font-black tracking-tight text-balance sm:text-5xl">{title}</h1>
                            {description && <p className="text-muted-foreground mt-3 text-base leading-relaxed">{description}</p>}
                        </div>
                        {children}
                    </div>
                </main>
            </section>
            <CreatorPreview />
        </div>
    );
}

function CreatorPreview() {
    const { locale } = useT();
    const mn = locale === 'mn';
    const [active, setActive] = useState(0);
    const [paused, setPaused] = useState(false);
    const [reducedMotion, setReducedMotion] = useState(false);

    useEffect(() => {
        const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
        const update = () => setReducedMotion(preference.matches);
        update();
        preference.addEventListener('change', update);
        return () => preference.removeEventListener('change', update);
    }, []);

    useEffect(() => {
        if (paused || reducedMotion) return;
        const timer = window.setTimeout(() => setActive((index) => (index + 1) % loginImages.length), 7000);
        return () => window.clearTimeout(timer);
    }, [active, paused, reducedMotion]);

    return (
        <aside className="relative isolate flex min-h-[360px] flex-col justify-end overflow-hidden bg-[#242b23] p-6 text-white sm:p-10 lg:order-1 lg:min-h-svh xl:p-14">
            {loginImages.map((src, index) => (
                <img
                    key={src}
                    src={src}
                    alt=""
                    fetchPriority={index === 0 ? 'high' : 'low'}
                    className={`absolute inset-0 -z-20 size-full object-cover object-[center_20%] motion-safe:transition-opacity motion-safe:duration-700 ${active === index ? 'opacity-100' : 'opacity-0'}`}
                />
            ))}
            <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black/65 via-transparent to-transparent" aria-hidden />
            <div role="group" aria-label={mn ? 'Нүүр зураг' : 'Login images'} className="absolute top-4 right-4 z-10 flex rounded-full bg-black/65">
                {loginImages.map((src, index) => (
                    <button
                        key={src}
                        type="button"
                        aria-label={mn ? `Зураг ${index + 1}` : `Image ${index + 1}`}
                        aria-pressed={active === index}
                        onClick={() => {
                            setActive(index);
                            setPaused(true);
                        }}
                        className="grid size-10 place-items-center rounded-full hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-2"
                    >
                        <span className={`size-2.5 rounded-full border border-white ${active === index ? 'bg-white' : ''}`} aria-hidden />
                    </button>
                ))}
                {!reducedMotion && (
                    <button
                        type="button"
                        aria-label={
                            paused
                                ? mn
                                    ? 'Зураг солихыг үргэлжлүүлэх'
                                    : 'Resume image rotation'
                                : mn
                                  ? 'Зураг солихыг түр зогсоох'
                                  : 'Pause image rotation'
                        }
                        onClick={() => setPaused((value) => !value)}
                        className="grid size-10 place-items-center rounded-full hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-2"
                    >
                        {paused ? <Play className="size-4" aria-hidden /> : <Pause className="size-4" aria-hidden />}
                    </button>
                )}
            </div>
            <div className="animate-page-in max-w-xl">
                <p className="text-brand-2 text-xs font-bold tracking-[0.18em] uppercase">
                    {mn ? 'Монголын бүтээгчдийн платформ' : 'Made for Mongolian creators'}
                </p>
                <h2 className="mt-3 text-5xl leading-[0.94] font-black tracking-[-0.06em] text-balance sm:text-7xl xl:text-8xl">Only in Mongolia</h2>
                <p className="mt-4 max-w-sm leading-relaxed text-white/85">
                    {mn ? 'Дуртай бүтээгчдээ олж, шинэ бүтээлийг нь дэмжээрэй.' : 'Find your favorite creators and support what they make next.'}
                </p>
                <Link
                    href={route('creators')}
                    className="group mt-6 inline-flex min-h-11 items-center gap-3 rounded-lg bg-white px-4 text-sm font-bold text-[#20251e] focus-visible:outline-2 focus-visible:outline-offset-4"
                >
                    {mn ? 'Бүтээгчдийг үзэх' : 'Discover creators'}
                    <ArrowUpRight
                        className="size-4 motion-safe:transition-transform motion-safe:group-hover:translate-x-0.5 motion-safe:group-hover:-translate-y-0.5"
                        aria-hidden
                    />
                </Link>
            </div>
        </aside>
    );
}
