import InputError from '@/components/input-error';
import AuthLayout from '@/layouts/auth-layout';
import { useT } from '@/lib/i18n';
import { Link, useForm } from '@inertiajs/react';
import { KeyRound, LoaderCircle, ShieldCheck } from 'lucide-react';
import { useState, type FormEvent } from 'react';

/** After signing in: the code from the authenticator app, or a recovery code. */
export default function TwoFactorChallenge() {
    const { t } = useT();
    const [recovery, setRecovery] = useState(false);
    const form = useForm({ code: '' });
    const ready = recovery ? form.data.code.trim().length >= 6 : form.data.code.length === 6;

    function submit(e: FormEvent) {
        e.preventDefault();
        form.post(route('two-factor.verify'));
    }

    return (
        <AuthLayout title={t('2fa.challengeTitle')} description={t(recovery ? '2fa.challengeRecovery' : '2fa.challengeSub')}>
            <form onSubmit={submit} className="flex flex-col gap-4">
                <span className="bg-primary/10 text-primary mx-auto grid size-16 place-items-center rounded-2xl">
                    {recovery ? <KeyRound className="size-8" /> : <ShieldCheck className="size-8" />}
                </span>
                <input
                    key={recovery ? 'r' : 'c'}
                    autoFocus
                    inputMode={recovery ? 'text' : 'numeric'}
                    autoComplete="one-time-code"
                    value={form.data.code}
                    onChange={(e) => form.setData('code', recovery ? e.target.value.slice(0, 20) : e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder={recovery ? 'XXXXX-XXXXX' : '123 456'}
                    className="bg-muted focus:ring-primary/30 h-14 w-full rounded-2xl px-4 text-center text-2xl font-bold tracking-[0.3em] uppercase tabular-nums outline-none focus:ring-2"
                />
                <InputError message={form.errors.code} className="-mt-2 text-center" />
                <button
                    type="submit"
                    disabled={!ready || form.processing}
                    className="from-primary shadow-primary/25 flex h-14 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r to-rose-500 text-base font-bold text-white shadow-lg transition hover:brightness-110 disabled:opacity-40 disabled:shadow-none"
                >
                    {form.processing && <LoaderCircle className="size-5 animate-spin" />}
                    {t('2fa.verify')}
                </button>
                <button
                    type="button"
                    onClick={() => {
                        setRecovery(!recovery);
                        form.setData('code', '');
                        form.clearErrors();
                    }}
                    className="text-muted-foreground hover:text-foreground text-sm font-semibold"
                >
                    {t(recovery ? '2fa.useApp' : '2fa.useRecovery')}
                </button>
                <Link href={route('logout')} method="post" as="button" className="text-muted-foreground hover:text-foreground text-xs">
                    {t('nav.logout')}
                </Link>
            </form>
        </AuthLayout>
    );
}
