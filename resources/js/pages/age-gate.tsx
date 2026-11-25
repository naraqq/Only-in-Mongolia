import AppLogoIcon from '@/components/app-logo-icon';
import LangSwitch from '@/components/lang-switch';
import { Button } from '@/components/ui/button';
import { useT } from '@/lib/i18n';
import { Head, useForm } from '@inertiajs/react';
import { ShieldAlert } from 'lucide-react';

/** Full-screen 18+ confirmation shown before anything else on the site. */
export default function AgeGate() {
    const { t } = useT();
    const form = useForm({ adult: true });

    return (
        <div className="bg-background relative flex min-h-svh flex-col items-center justify-center p-6">
            <Head title={t('age.title')} />
            <LangSwitch className="absolute top-4 right-4" />

            <div className="w-full max-w-md text-center">
                <AppLogoIcon className="mx-auto size-10 fill-current" />
                <div className="mx-auto mt-8 grid size-16 place-items-center rounded-full bg-rose-50 text-rose-600 dark:bg-rose-950">
                    <ShieldAlert className="size-8" aria-hidden />
                </div>
                <p className="mt-4 text-5xl font-bold tracking-tight">18+</p>
                <h1 className="mt-3 text-xl font-semibold">{t('age.title')}</h1>
                <p className="text-muted-foreground mt-3 leading-relaxed">{t('age.body')}</p>

                <div className="mt-8 flex flex-col gap-3">
                    <Button size="lg" className="w-full" disabled={form.processing} onClick={() => form.post(route('age-gate.confirm'))}>
                        {t('age.yes')}
                    </Button>
                    <Button size="lg" variant="outline" className="w-full" asChild>
                        <a href="https://www.google.com" rel="noopener noreferrer">
                            {t('age.no')}
                        </a>
                    </Button>
                </div>
                <p className="text-muted-foreground mt-6 text-xs">{t('age.note')}</p>
            </div>
        </div>
    );
}
