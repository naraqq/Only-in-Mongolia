import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import SocialLayout from '@/layouts/social-layout';
import { useT } from '@/lib/i18n';
import { useForm } from '@inertiajs/react';
import { CircleCheck, Clock, IdCard, Landmark, LoaderCircle, Lock, ShieldCheck, UserRound, XCircle } from 'lucide-react';
import { type FormEvent, type ReactNode } from 'react';

type Application = {
    handle: string;
    display_name: string;
    bio: string | null;
    price_monthly: number;
    adult_content: boolean;
    status: 'pending' | 'approved' | 'rejected';
    review_note: string | null;
    reviewed_at: string | null;
    submitted_at: string;
};

const mnt = (n: number) => '₮' + n.toLocaleString('en-US');

export default function CreatorApply({
    application,
    banks,
    limits,
}: {
    application: Application | null;
    banks: string[];
    limits: { min: number; max: number };
}) {
    const { t } = useT();
    const canApply = !application || application.status === 'rejected';

    return (
        <SocialLayout title={t('cr.title')} header={<h1 className="text-lg font-bold tracking-wide uppercase">{t('cr.title')}</h1>}>
            <div className="p-4 md:py-6">
                <p className="text-muted-foreground">{t('cr.sub')}</p>

                {application && <Status app={application} />}
                {canApply && <ApplyForm banks={banks} limits={limits} previous={application} />}
            </div>
        </SocialLayout>
    );
}

function Status({ app }: { app: Application }) {
    const { t } = useT();
    const view = {
        pending: { icon: Clock, tone: 'border-amber-200 bg-amber-50 text-amber-900', title: t('cr.pendingT'), body: t('cr.pendingD') },
        approved: {
            icon: CircleCheck,
            tone: 'border-emerald-200 bg-emerald-50 text-emerald-900',
            title: t('cr.approvedT'),
            body: t('cr.approvedD', { handle: app.handle }),
        },
        rejected: {
            icon: XCircle,
            tone: 'border-rose-200 bg-rose-50 text-rose-900',
            title: t('cr.rejectedT'),
            body: t('cr.rejectedD', { note: app.review_note ?? '' }),
        },
    }[app.status];
    const Icon = view.icon;

    return (
        <div className={`mt-6 flex gap-3 rounded-lg border p-4 ${view.tone}`}>
            <Icon className="mt-0.5 size-5 shrink-0" aria-hidden />
            <div>
                <p className="font-medium">{view.title}</p>
                <p className="mt-1 text-sm opacity-90">{view.body}</p>
                <p className="mt-2 text-xs opacity-75">
                    @{app.handle} · {mnt(app.price_monthly)}
                </p>
            </div>
        </div>
    );
}

function ApplyForm({ banks, limits, previous }: { banks: string[]; limits: { min: number; max: number }; previous: Application | null }) {
    const { t } = useT();
    const { data, setData, post, processing, errors } = useForm({
        handle: previous?.handle ?? '',
        display_name: previous?.display_name ?? '',
        bio: previous?.bio ?? '',
        price_monthly: previous ? String(previous.price_monthly) : '',
        adult_content: previous?.adult_content ?? false,
        legal_name: '',
        register_number: '',
        id_front: null as File | null,
        id_back: null as File | null,
        selfie: null as File | null,
        bank_name: '',
        bank_account: '',
        account_holder: '',
        consent_age: false as boolean,
        consent_people: false as boolean,
        consent_legal: false as boolean,
    });

    function submit(e: FormEvent) {
        e.preventDefault();
        post(route('creator.apply.store'), { forceFormData: true, preserveScroll: true });
    }

    const allConsents = data.consent_age && data.consent_people && data.consent_legal;
    const file = (key: 'id_front' | 'id_back' | 'selfie', label: string) => (
        <Field label={label} error={errors[key]} hint={t('cr.photoHint')}>
            <Input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setData(key, e.target.files?.[0] ?? null)} required />
        </Field>
    );

    return (
        <form onSubmit={submit} className="mt-8 flex flex-col gap-6">
            <Section icon={UserRound} title={t('cr.sProfile')}>
                <Field label={t('cr.handle')} error={errors.handle} hint={t('cr.handleHint')}>
                    <div className="border-input focus-within:border-ring focus-within:ring-ring/50 flex overflow-hidden rounded-md border shadow-xs focus-within:ring-[3px]">
                        <span className="bg-muted text-muted-foreground border-input grid place-items-center border-r px-3 text-sm">@</span>
                        <input
                            className="w-full bg-transparent px-3 py-2 text-sm outline-none"
                            value={data.handle}
                            onChange={(e) =>
                                setData(
                                    'handle',
                                    e.target.value
                                        .toLowerCase()
                                        .replace(/[^a-z0-9_.]/g, '')
                                        .slice(0, 30),
                                )
                            }
                            required
                            minLength={3}
                        />
                    </div>
                </Field>
                <Field label={t('cr.displayName')} error={errors.display_name}>
                    <Input value={data.display_name} onChange={(e) => setData('display_name', e.target.value)} maxLength={60} required />
                </Field>
                <Field label={t('cr.bio')} error={errors.bio}>
                    <textarea
                        className="border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 min-h-20 w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
                        value={data.bio}
                        maxLength={500}
                        onChange={(e) => setData('bio', e.target.value)}
                    />
                </Field>
                <Field label={t('cr.price')} error={errors.price_monthly} hint={t('cr.priceHint', { min: mnt(limits.min), max: mnt(limits.max) })}>
                    <Input
                        inputMode="numeric"
                        placeholder="15,000"
                        className="sm:max-w-48"
                        value={data.price_monthly ? Number(data.price_monthly).toLocaleString('en-US') : ''}
                        onChange={(e) => setData('price_monthly', e.target.value.replace(/\D/g, ''))}
                        required
                    />
                </Field>
                <Check checked={data.adult_content} onChange={(v) => setData('adult_content', v)} hint={t('cr.adultHint')}>
                    {t('cr.adult')}
                </Check>
            </Section>

            <Section icon={IdCard} title={t('cr.sIdentity')} note={t('cr.identityHint')} locked>
                <Field label={t('cr.legalName')} error={errors.legal_name}>
                    <Input value={data.legal_name} onChange={(e) => setData('legal_name', e.target.value)} maxLength={100} required />
                </Field>
                <Field label={t('cr.register')} error={errors.register_number} hint={t('cr.registerHint')}>
                    <Input
                        placeholder="УБ99031512"
                        className="uppercase sm:max-w-56"
                        value={data.register_number}
                        onChange={(e) => setData('register_number', e.target.value.toUpperCase().slice(0, 12))}
                        required
                    />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                    {file('id_front', t('cr.idFront'))}
                    {file('id_back', t('cr.idBack'))}
                </div>
                {file('selfie', t('cr.selfie'))}
            </Section>

            <Section icon={Landmark} title={t('cr.sPayout')} note={t('cr.payoutHint')} locked>
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label={t('cr.bank')} error={errors.bank_name}>
                        <select
                            className="border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs"
                            value={data.bank_name}
                            onChange={(e) => setData('bank_name', e.target.value)}
                            required
                        >
                            <option value="" disabled>
                                —
                            </option>
                            {banks.map((b) => (
                                <option key={b} value={b}>
                                    {b}
                                </option>
                            ))}
                        </select>
                    </Field>
                    <Field label={t('cr.account')} error={errors.bank_account}>
                        <Input
                            inputMode="numeric"
                            placeholder="5000123456"
                            value={data.bank_account}
                            onChange={(e) => setData('bank_account', e.target.value)}
                            required
                        />
                    </Field>
                </div>
                <Field label={t('cr.holder')} error={errors.account_holder}>
                    <Input value={data.account_holder} onChange={(e) => setData('account_holder', e.target.value)} maxLength={80} required />
                </Field>
            </Section>

            <Section icon={ShieldCheck} title={t('cr.sConsent')}>
                <Check checked={data.consent_age} onChange={(v) => setData('consent_age', v)} error={errors.consent_age}>
                    {t('cr.consentAge')}
                </Check>
                <Check checked={data.consent_people} onChange={(v) => setData('consent_people', v)} error={errors.consent_people}>
                    {t('cr.consentPeople')}
                </Check>
                <Check checked={data.consent_legal} onChange={(v) => setData('consent_legal', v)} error={errors.consent_legal}>
                    {t('cr.consentLegal')}
                </Check>
            </Section>

            <Button type="submit" size="lg" disabled={processing || !allConsents}>
                {processing && <LoaderCircle className="size-4 animate-spin" />}
                {processing ? t('cr.sending') : t('cr.submit')}
            </Button>
        </form>
    );
}

function Section({
    icon: Icon,
    title,
    note,
    locked = false,
    children,
}: {
    icon: typeof UserRound;
    title: string;
    note?: string;
    locked?: boolean;
    children: ReactNode;
}) {
    return (
        <section className="rounded-xl border p-5">
            <h2 className="flex items-center gap-2 font-medium">
                <Icon className="text-muted-foreground size-4" aria-hidden /> {title}
                {locked && <Lock className="text-muted-foreground ml-auto size-3.5" aria-hidden />}
            </h2>
            {note && <p className="text-muted-foreground mt-1 text-sm">{note}</p>}
            <div className="mt-4 flex flex-col gap-4">{children}</div>
        </section>
    );
}

function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: ReactNode }) {
    return (
        <div className="grid gap-2">
            <Label>{label}</Label>
            {children}
            {error ? <InputError message={error} /> : hint && <p className="text-muted-foreground text-xs">{hint}</p>}
        </div>
    );
}

function Check({
    checked,
    onChange,
    hint,
    error,
    children,
}: {
    checked: boolean;
    onChange: (v: boolean) => void;
    hint?: string;
    error?: string;
    children: ReactNode;
}) {
    return (
        <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" className="mt-0.5 size-4 shrink-0" checked={checked} onChange={(e) => onChange(e.target.checked)} />
            <span>
                {children}
                {hint && <span className="text-muted-foreground mt-0.5 block text-xs">{hint}</span>}
                {error && <InputError message={error} className="mt-1" />}
            </span>
        </label>
    );
}
