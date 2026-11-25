import { Button } from '@/components/ui/button';
import AppLayout from '@/layouts/app-layout';
import { useT } from '@/lib/i18n';
import { Head, Link } from '@inertiajs/react';
import { Sparkles } from 'lucide-react';

export default function Dashboard({ creatorStatus }: { creatorStatus: 'pending' | 'approved' | 'rejected' | null }) {
    const { t } = useT();
    const statusLabel = { pending: t('cr.pendingT'), approved: t('cr.approvedT'), rejected: t('cr.rejectedT') };

    return (
        <AppLayout breadcrumbs={[{ title: t('nav.dashboard'), href: '/dashboard' }]}>
            <Head title={t('nav.dashboard')} />
            <div className="mx-auto w-full max-w-3xl p-4 md:py-8">
                <section className="flex flex-col gap-4 rounded-xl border p-6 sm:flex-row sm:items-center">
                    <div className="grid size-12 shrink-0 place-items-center rounded-full bg-rose-50 text-rose-600 dark:bg-rose-950">
                        <Sparkles className="size-6" aria-hidden />
                    </div>
                    <div className="flex-1">
                        <h2 className="font-semibold">{creatorStatus ? statusLabel[creatorStatus] : t('dash.creatorT')}</h2>
                        <p className="text-muted-foreground mt-1 text-sm">{creatorStatus ? t('cr.pendingD') : t('dash.creatorD')}</p>
                    </div>
                    <Button asChild>
                        <Link href={route('creator.apply')}>{t('nav.becomeCreator')}</Link>
                    </Button>
                </section>
            </div>
        </AppLayout>
    );
}
