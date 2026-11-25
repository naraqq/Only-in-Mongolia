import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import AuthLayout from '@/layouts/auth-layout';
import { useT } from '@/lib/i18n';
import { Head, useForm } from '@inertiajs/react';
import { LoaderCircle } from 'lucide-react';
import { type FormEvent } from 'react';

/** Last sign-up step for a new number: just a name. */
export default function PhoneName({ phone }: { phone: string }) {
    const { t } = useT();
    const { data, setData, post, processing, errors } = useForm({ name: '', birthdate: '' });
    // Latest allowed birth date: exactly 18 years ago today.
    const adultBy = new Date(new Date().setFullYear(new Date().getFullYear() - 18)).toISOString().slice(0, 10);

    function submit(e: FormEvent) {
        e.preventDefault();
        post(route('login.phone.name.store'));
    }

    return (
        <AuthLayout title={t('ph.nameTitle')} description={t('ph.nameSub', { phone })}>
            <Head title={t('ph.create')} />
            <form onSubmit={submit} className="flex flex-col gap-6">
                <div className="grid gap-2">
                    <Label htmlFor="name">{t('ph.name')}</Label>
                    <Input
                        id="name"
                        autoFocus
                        required
                        maxLength={60}
                        autoComplete="name"
                        placeholder={t('ph.namePh')}
                        value={data.name}
                        onChange={(e) => setData('name', e.target.value)}
                    />
                    <InputError message={errors.name} />
                </div>
                <div className="grid gap-2">
                    <Label htmlFor="birthdate">{t('ph.birthdate')}</Label>
                    <Input
                        id="birthdate"
                        type="date"
                        required
                        min="1900-01-01"
                        max={adultBy}
                        value={data.birthdate}
                        onChange={(e) => setData('birthdate', e.target.value)}
                    />
                    {errors.birthdate ? (
                        <InputError message={errors.birthdate} />
                    ) : (
                        <p className="text-muted-foreground text-xs">{t('ph.birthdateHint')}</p>
                    )}
                </div>
                <Button type="submit" className="w-full" disabled={processing || !data.name.trim() || !data.birthdate}>
                    {processing && <LoaderCircle className="h-4 w-4 animate-spin" />}
                    {t('ph.create')}
                </Button>
            </form>
        </AuthLayout>
    );
}
