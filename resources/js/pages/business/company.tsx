import InputError from '@/components/input-error';
import BusinessLayout from '@/layouts/business-layout';
import { mnt } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { useForm, usePage } from '@inertiajs/react';
import { BadgeCheck, Building2, CreditCard, ImagePlus, LoaderCircle, Megaphone } from 'lucide-react';
import { useEffect, useMemo, type FormEvent, type ReactNode } from 'react';

type Company = { name: string; logo: string | null; register_number: string; email: string; website: string | null };

const field = 'bg-muted focus:ring-primary/30 h-11 w-full rounded-xl px-3 text-sm outline-none focus:ring-2';

/**
 * Business → Company: who advertises. The first visit explains how advertising works (three steps) and asks for
 * the company's details; later it's where they're changed.
 */
export default function BusinessCompany({ company }: { company: Company | null }) {
    const { t } = useT();
    const status = usePage<{ flash?: { status?: string } }>().props.flash?.status;
    const form = useForm({
        name: company?.name ?? '',
        register_number: company?.register_number ?? '',
        email: company?.email ?? '',
        website: company?.website ?? '',
        logo: null as File | null,
    });
    const logo = useMemo(() => (form.data.logo ? URL.createObjectURL(form.data.logo) : company?.logo), [form.data.logo, company?.logo]);
    useEffect(() => () => void (form.data.logo && logo && URL.revokeObjectURL(logo)), [form.data.logo, logo]);

    function submit(e: FormEvent) {
        e.preventDefault();
        form.post(route('business.company.save'), { forceFormData: true, preserveScroll: true });
    }

    return (
        <BusinessLayout title={company ? t('biz.company') : t('biz.join')} subtitle={company ? t('biz.companySub') : t('biz.joinSub')}>
            <div className="mx-auto flex max-w-3xl flex-col gap-5">
                {!company && (
                    <ol className="grid gap-3 sm:grid-cols-3">
                        <Step n={1} icon={<Building2 className="size-5" />} title={t('biz.step1')} text={t('biz.step1Text')} />
                        <Step n={2} icon={<CreditCard className="size-5" />} title={t('biz.step2')} text={t('biz.step2Text')} />
                        <Step n={3} icon={<Megaphone className="size-5" />} title={t('biz.step3')} text={t('biz.step3Text')} />
                    </ol>
                )}

                <form onSubmit={submit} className="bg-card flex flex-col gap-4 rounded-2xl p-5 shadow-xs">
                    <div className="flex items-center gap-4">
                        <label className="group bg-muted border-border hover:border-primary/50 relative grid size-20 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-2xl border-2 border-dashed">
                            {logo ? (
                                <img src={logo} alt="" className="size-full object-cover" />
                            ) : (
                                <ImagePlus className="text-muted-foreground size-6" />
                            )}
                            <input
                                type="file"
                                accept="image/jpeg,image/png,image/webp"
                                className="hidden"
                                onChange={(e) => form.setData('logo', e.target.files?.[0] ?? null)}
                            />
                        </label>
                        <div className="text-sm">
                            <p className="font-semibold">{t('biz.logo')}</p>
                            <p className="text-muted-foreground text-xs">{t('biz.logoHint')}</p>
                            <InputError message={form.errors.logo} />
                        </div>
                    </div>

                    <Field label={t('biz.name')} error={form.errors.name}>
                        <input
                            className={field}
                            value={form.data.name}
                            maxLength={120}
                            required
                            onChange={(e) => form.setData('name', e.target.value)}
                        />
                    </Field>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field label={t('biz.register')} hint={t('biz.registerHint')} error={form.errors.register_number}>
                            <input
                                className={`${field} tabular-nums`}
                                inputMode="numeric"
                                maxLength={7}
                                required
                                value={form.data.register_number}
                                onChange={(e) => form.setData('register_number', e.target.value.replace(/\D/g, ''))}
                            />
                        </Field>
                        <Field label={t('biz.email')} hint={t('biz.emailHint')} error={form.errors.email}>
                            <input
                                className={field}
                                type="email"
                                required
                                value={form.data.email}
                                onChange={(e) => form.setData('email', e.target.value)}
                            />
                        </Field>
                    </div>
                    <Field label={t('biz.website')} error={form.errors.website}>
                        <input
                            className={field}
                            type="url"
                            placeholder="https://"
                            value={form.data.website}
                            onChange={(e) => form.setData('website', e.target.value)}
                        />
                    </Field>

                    <div className="flex items-center justify-end gap-3">
                        {status === 'company-saved' && company && (
                            <span className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-600">
                                <BadgeCheck className="size-4" /> {t('biz.saved')}
                            </span>
                        )}
                        <button
                            type="submit"
                            disabled={form.processing}
                            className="bg-primary text-primary-foreground inline-flex h-11 items-center gap-2 rounded-full px-6 text-sm font-bold transition hover:brightness-110 disabled:opacity-60"
                        >
                            {form.processing && <LoaderCircle className="size-4 animate-spin" />}
                            {company ? t('pe.save') : t('biz.createCompany')}
                        </button>
                    </div>
                </form>

                {!company && <PriceNote />}
            </div>
        </BusinessLayout>
    );
}

function PriceNote() {
    const { t } = useT();
    const price = usePage<{ dailyPrice?: number }>().props.dailyPrice;
    return price ? <p className="text-muted-foreground text-center text-xs">{t('biz.priceNote', { price: mnt(price) })}</p> : null;
}

function Step({ n, icon, title, text }: { n: number; icon: ReactNode; title: string; text: string }) {
    return (
        <li className="bg-card flex flex-col gap-2 rounded-2xl p-4 shadow-xs">
            <span className="flex items-center gap-2">
                <span className="grid size-9 place-items-center rounded-xl bg-violet-600 text-white">{icon}</span>
                <span className="text-muted-foreground text-xs font-bold">{n}</span>
            </span>
            <span className="font-bold">{title}</span>
            <span className="text-muted-foreground text-sm">{text}</span>
        </li>
    );
}

function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
    return (
        <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold">{label}</span>
            {children}
            {hint && <span className="text-muted-foreground text-xs">{hint}</span>}
            <InputError message={error} />
        </label>
    );
}
