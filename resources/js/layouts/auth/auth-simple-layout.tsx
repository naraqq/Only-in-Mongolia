import AppLogo from '@/components/app-logo';
import LangSwitch from '@/components/lang-switch';
import { useT } from '@/lib/i18n';
import { Link } from '@inertiajs/react';
import { ArrowUpRight } from 'lucide-react';
import coverPhoto from '../../../../database/seeders/images/cover-erdene.travel.jpg';

interface AuthLayoutProps {
    children: React.ReactNode;
    title?: string;
    description?: string;
}

export default function AuthSimpleLayout({ children, title, description }: AuthLayoutProps) {
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

    return (
        <aside className="relative isolate flex min-h-[360px] flex-col justify-end overflow-hidden bg-[#242b23] p-6 text-white sm:p-10 lg:order-1 lg:min-h-svh xl:p-14">
            <img src={coverPhoto} alt="" fetchPriority="high" className="absolute inset-0 -z-20 size-full object-cover" />
            <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black/90 via-black/35 to-transparent" aria-hidden />
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
