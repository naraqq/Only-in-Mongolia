import InputError from '@/components/input-error';
import { Input } from '@/components/ui/input';
import FlowLayout from '@/layouts/flow-layout';
import { avatarGradient, mnt } from '@/lib/format';
import { useT, type TKey } from '@/lib/i18n';
import { Link, useForm, type InertiaFormProps } from '@inertiajs/react';
import {
    ArrowLeft,
    ArrowRight,
    BadgeCheck,
    Camera,
    Check,
    CircleCheck,
    Clock,
    CreditCard,
    HandCoins,
    IdCard,
    Landmark,
    LoaderCircle,
    Lock,
    Pencil,
    Rocket,
    ShieldCheck,
    Sparkles,
    UserRound,
    Wallet,
    XCircle,
} from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';

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

type ApplyData = {
    handle: string;
    display_name: string;
    bio: string;
    price_monthly: string;
    adult_content: boolean;
    legal_name: string;
    register_number: string;
    id_front: File | null;
    id_back: File | null;
    selfie: File | null;
    bank_name: string;
    bank_account: string;
    account_holder: string;
    consent_age: boolean;
    consent_people: boolean;
    consent_legal: boolean;
};
type Form = InertiaFormProps<ApplyData>;

type Props = {
    application: Application | null;
    banks: string[];
    limits: { min: number; max: number };
    keep: number;
    account_name: string;
};

/** Become a creator: an intro, then four short steps (page, identity, payout, check and send). */
export default function CreatorApply(props: Props) {
    const { application } = props;
    const canApply = !application || application.status === 'rejected';
    return canApply ? <Flow {...props} /> : <StatusScreen app={application} />;
}

/* ------------------------------------------------------------------ status */

function StatusScreen({ app }: { app: Application }) {
    const { t } = useT();
    const approved = app.status === 'approved';
    const steps: { label: TKey; done: boolean; now: boolean }[] = [
        { label: 'cr.tlSent', done: true, now: false },
        { label: 'cr.tlReview', done: approved, now: !approved },
        { label: 'cr.tlLive', done: approved, now: false },
    ];

    return (
        <FlowLayout title={t('cr.title')} closeHref={route('me.edit')}>
            <div className="flex flex-col items-center text-center">
                <span
                    className={`grid size-20 place-items-center rounded-full ${approved ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60' : 'bg-amber-100 text-amber-600 dark:bg-amber-950/60'}`}
                >
                    {approved ? <CircleCheck className="size-10" /> : <Clock className="size-10" />}
                </span>
                <h1 className="mt-5 text-2xl font-extrabold">{t(approved ? 'cr.approvedT' : 'cr.pendingT')}</h1>
                <p className="text-muted-foreground mt-2 max-w-md">{approved ? t('cr.approvedD', { handle: app.handle }) : t('cr.pendingD')}</p>
            </div>

            <ol className="bg-card mx-auto mt-8 flex max-w-md flex-col gap-4 rounded-3xl p-5 shadow-xs">
                {steps.map((s) => (
                    <li key={s.label} className="flex items-center gap-3">
                        <span
                            className={`grid size-8 shrink-0 place-items-center rounded-full ${
                                s.done ? 'bg-emerald-500 text-white' : s.now ? 'bg-amber-500 text-white' : 'bg-muted text-muted-foreground'
                            }`}
                        >
                            {s.done ? (
                                <Check className="size-4" strokeWidth={3} />
                            ) : s.now ? (
                                <Clock className="size-4" />
                            ) : (
                                <Rocket className="size-4" />
                            )}
                        </span>
                        <span className={`font-semibold ${s.done || s.now ? '' : 'text-muted-foreground'}`}>{t(s.label)}</span>
                    </li>
                ))}
            </ol>

            <div className="bg-card mx-auto mt-4 flex max-w-md items-center gap-3 rounded-3xl p-4 shadow-xs">
                <span
                    className={`grid size-12 shrink-0 place-items-center rounded-full bg-gradient-to-br text-lg font-bold text-white ${avatarGradient(app.handle)}`}
                >
                    {app.display_name.charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">{app.display_name}</p>
                    <p className="text-muted-foreground truncate text-sm">@{app.handle}</p>
                </div>
                <span className="text-sm font-bold">
                    {mnt(app.price_monthly)}
                    <span className="text-muted-foreground font-normal">{t('cr.perMonth')}</span>
                </span>
            </div>

            <div className="mx-auto mt-8 flex max-w-md flex-col gap-2">
                {approved ? (
                    <Link
                        href={route('studio')}
                        className="bg-primary shadow-primary/25 text-primary-foreground flex h-12 items-center justify-center gap-2 rounded-2xl font-bold shadow-lg transition hover:brightness-110"
                    >
                        {t('cr.openStudio')} <ArrowRight className="size-4" />
                    </Link>
                ) : null}
                <Link
                    href={route('me.edit')}
                    className="bg-muted hover:bg-muted/70 flex h-12 items-center justify-center rounded-2xl font-bold transition"
                >
                    {t('cr.toProfile')}
                </Link>
            </div>
        </FlowLayout>
    );
}

/* -------------------------------------------------------------------- flow */

const STEPS: { title: TKey; icon: typeof UserRound; fields: string[] }[] = [
    { title: 'cr.sProfile', icon: UserRound, fields: ['handle', 'display_name', 'bio', 'price_monthly', 'adult_content'] },
    { title: 'cr.sIdentity', icon: IdCard, fields: ['legal_name', 'register_number', 'id_front', 'id_back', 'selfie'] },
    { title: 'cr.sPayout', icon: Landmark, fields: ['bank_name', 'bank_account', 'account_holder'] },
    { title: 'cr.sReview', icon: ShieldCheck, fields: ['consent_age', 'consent_people', 'consent_legal'] },
];

function Flow({ application: previous, banks, limits, keep, account_name }: Props) {
    const { t } = useT();
    // -1 is the intro; 0..3 are the steps.
    const [step, setStep] = useState(-1);
    const form = useForm<ApplyData>({
        handle: previous?.handle ?? '',
        display_name: previous?.display_name ?? account_name,
        bio: previous?.bio ?? '',
        price_monthly: previous ? String(previous.price_monthly) : '',
        adult_content: previous?.adult_content ?? false,
        legal_name: '',
        register_number: '',
        id_front: null,
        id_back: null,
        selfie: null,
        bank_name: '',
        bank_account: '',
        account_holder: '',
        consent_age: false,
        consent_people: false,
        consent_legal: false,
    });
    const { data, setData, errors, processing } = form;

    // When the server says no, go back to the first step with a problem.
    useEffect(() => {
        const keys = Object.keys(errors);
        if (!keys.length) return;
        const at = STEPS.findIndex((s) => s.fields.some((f) => keys.includes(f)));
        if (at >= 0) setStep(at);
    }, [errors]);

    useEffect(() => {
        window.scrollTo({ top: 0 });
    }, [step]);

    const price = Number(data.price_monthly || 0);
    const [identityAttempted, setIdentityAttempted] = useState(false);
    const registerValid = /^[А-ЯЁӨҮ]{2}[0-9]{8}$/.test(data.register_number);
    const identityReady = data.legal_name.trim() !== '' && registerValid && !!data.id_front && !!data.id_back && !!data.selfie;
    const ready = [
        data.handle.length >= 3 && data.display_name.trim() !== '' && price >= limits.min && price <= limits.max,
        identityReady,
        data.bank_name !== '' && data.bank_account.trim().length >= 6 && data.account_holder.trim() !== '',
        data.consent_age && data.consent_people && data.consent_legal,
    ];

    function next(e: FormEvent) {
        e.preventDefault();
        if (step === 1) setIdentityAttempted(true);
        if (!ready[step] || processing) return;
        if (step < 3) {
            // Someone filling in their own name twice is the common case.
            if (step === 1 && !data.account_holder) setData('account_holder', data.legal_name);
            setStep(step + 1);
            return;
        }
        form.post(route('creator.apply.store'), { forceFormData: true, preserveScroll: true });
    }

    if (step === -1) {
        return <Intro keep={keep} previous={previous} onStart={() => setStep(0)} />;
    }

    const S = STEPS[step];
    return (
        <FlowLayout
            title={t('cr.title')}
            closeHref={route('me.edit')}
            progress={(step + 1) / STEPS.length}
            footer={
                <>
                    <button
                        type="button"
                        onClick={() => setStep(step - 1)}
                        className="bg-muted hover:bg-muted/70 inline-flex h-12 items-center gap-2 rounded-2xl px-5 font-bold transition"
                    >
                        <ArrowLeft className="size-4" /> {t('cr.back')}
                    </button>
                    <button
                        type="submit"
                        form="apply"
                        disabled={(step !== 1 && !ready[step]) || processing}
                        className="bg-primary shadow-primary/25 text-primary-foreground inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl font-bold shadow-lg transition hover:brightness-110 disabled:opacity-40 disabled:shadow-none"
                    >
                        {processing && <LoaderCircle className="size-4 animate-spin" />}
                        {step < 3 ? t('cr.next') : processing ? t('cr.sending') : t('cr.submit')}
                        {step < 3 && <ArrowRight className="size-4" />}
                    </button>
                </>
            }
        >
            <p className="text-primary text-sm font-bold">{t('cr.step', { n: step + 1, total: STEPS.length })}</p>
            <h1 className="mt-1 flex items-center gap-2 text-2xl font-extrabold">{t(S.title)}</h1>
            {step === 1 && <Private text={t('cr.identityHint')} />}
            {step === 2 && <Private text={t('cr.payoutHint')} />}

            <form id="apply" onSubmit={next} className="mt-6 flex flex-col gap-5">
                {step === 0 && <PageStep form={form} limits={limits} />}
                {step === 1 && <IdentityStep form={form} attempted={identityAttempted} registerValid={registerValid} />}
                {step === 2 && <PayoutStep form={form} banks={banks} />}
                {step === 3 && <ReviewStep form={form} onEdit={setStep} />}
            </form>
        </FlowLayout>
    );
}

/* ------------------------------------------------------------------- intro */

function Intro({ keep, previous, onStart }: { keep: number; previous: Application | null; onStart: () => void }) {
    const { t } = useT();
    const perks: { icon: typeof Wallet; title: string; body: string }[] = [
        { icon: CreditCard, title: t('cr.b1T'), body: t('cr.b1D') },
        { icon: HandCoins, title: t('cr.b2T'), body: t('cr.b2D') },
        { icon: Wallet, title: t('cr.b3T', { pct: keep }), body: t('cr.b3D') },
    ];
    const needs: { icon: typeof IdCard; label: TKey }[] = [
        { icon: IdCard, label: 'cr.need1' },
        { icon: Camera, label: 'cr.need2' },
        { icon: Landmark, label: 'cr.need3' },
    ];

    return (
        <FlowLayout
            title={t('cr.title')}
            closeHref={route('me.edit')}
            footer={
                <button
                    type="button"
                    onClick={onStart}
                    className="bg-primary shadow-primary/25 text-primary-foreground inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl font-bold shadow-lg transition hover:brightness-110"
                >
                    {t(previous ? 'cr.tryAgain' : 'cr.start')} <ArrowRight className="size-4" />
                </button>
            }
        >
            {previous?.status === 'rejected' && (
                <div className="mb-6 flex gap-3 rounded-2xl bg-rose-100 p-4 text-rose-900 dark:bg-rose-950/50 dark:text-rose-200">
                    <XCircle className="mt-0.5 size-5 shrink-0" />
                    <div>
                        <p className="font-bold">{t('cr.rejectedT')}</p>
                        <p className="mt-1 text-sm">{t('cr.rejectedD', { note: previous.review_note ?? '' })}</p>
                    </div>
                </div>
            )}

            <div className="bg-primary text-primary-foreground relative overflow-hidden rounded-3xl p-6 shadow-lg sm:p-8">
                <Sparkles className="absolute -top-4 -right-4 size-32 opacity-15" aria-hidden />
                <span className="bg-primary-foreground/15 grid size-12 place-items-center rounded-2xl">
                    <Sparkles className="size-6" />
                </span>
                <h1 className="mt-4 text-2xl leading-tight font-extrabold sm:text-3xl">{t('cr.heroT')}</h1>
                <p className="text-primary-foreground/80 mt-2 max-w-md">{t('cr.heroD')}</p>
            </div>

            <ul className="mt-5 grid gap-3 sm:grid-cols-3">
                {perks.map((p) => (
                    <li key={p.title} className="bg-card rounded-2xl p-4 shadow-xs">
                        <span className="bg-primary/10 text-primary grid size-10 place-items-center rounded-xl">
                            <p.icon className="size-5" />
                        </span>
                        <p className="mt-3 font-bold">{p.title}</p>
                        <p className="text-muted-foreground mt-1 text-sm leading-snug">{p.body}</p>
                    </li>
                ))}
            </ul>

            <section className="bg-card mt-5 rounded-2xl p-5 shadow-xs">
                <h2 className="font-bold">{t('cr.needT')}</h2>
                <ul className="mt-3 flex flex-col gap-3">
                    {needs.map((n) => (
                        <li key={n.label} className="flex items-center gap-3 text-[15px]">
                            <span className="bg-muted grid size-9 shrink-0 place-items-center rounded-full">
                                <n.icon className="size-4" />
                            </span>
                            {t(n.label)}
                        </li>
                    ))}
                </ul>
                <p className="text-muted-foreground mt-4 flex items-start gap-2 text-sm">
                    <Clock className="mt-0.5 size-4 shrink-0" /> {t('cr.needTime')}
                </p>
            </section>
        </FlowLayout>
    );
}

/* ------------------------------------------------------------------- steps */

function PageStep({ form, limits }: { form: Form; limits: { min: number; max: number } }) {
    const { t } = useT();
    const { data, setData, errors } = form;
    const price = Number(data.price_monthly || 0);
    const handle = data.handle || 'username';

    return (
        <>
            {/* Live preview of the page */}
            <div className="bg-card overflow-hidden rounded-3xl shadow-xs">
                <div className={`h-20 bg-gradient-to-br ${avatarGradient(handle)}`} />
                <div className="flex items-end gap-3 px-4 pb-4">
                    <span
                        className={`ring-card -mt-8 grid size-16 shrink-0 place-items-center rounded-full bg-gradient-to-br text-2xl font-bold text-white ring-4 ${avatarGradient(handle)}`}
                    >
                        {(data.display_name || '?').charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1 truncate font-bold">
                            {data.display_name || t('cr.displayName')} <BadgeCheck className="size-4 shrink-0 text-primary" />
                        </p>
                        <p className="text-muted-foreground truncate text-sm">@{handle}</p>
                    </div>
                    <span className="shrink-0 text-sm font-bold">
                        {price ? mnt(price) : '₮—'}
                        <span className="text-muted-foreground font-normal">{t('cr.perMonth')}</span>
                    </span>
                </div>
                {data.bio && <p className="text-muted-foreground px-4 pb-4 text-sm whitespace-pre-line">{data.bio}</p>}
            </div>

            <Field label={t('cr.handle')} error={errors.handle} hint={t('cr.handleHint')}>
                <div className="bg-muted focus-within:ring-primary/30 flex h-11 items-center rounded-xl focus-within:ring-2">
                    <span className="text-muted-foreground pl-3.5 text-sm">onlyinmongolia.mn/@</span>
                    <input
                        className="h-full w-full min-w-0 bg-transparent pr-3.5 text-[15px] font-semibold outline-none"
                        value={data.handle}
                        autoFocus
                        onChange={(e) =>
                            setData(
                                'handle',
                                e.target.value
                                    .toLowerCase()
                                    .replace(/[^a-z0-9_.]/g, '')
                                    .slice(0, 30),
                            )
                        }
                    />
                </div>
            </Field>
            <Field label={t('cr.displayName')} error={errors.display_name}>
                <Input value={data.display_name} onChange={(e) => setData('display_name', e.target.value)} maxLength={60} />
            </Field>
            <Field label={t('cr.bio')} error={errors.bio} hint={`${data.bio.length}/500`}>
                <textarea
                    className="bg-muted placeholder:text-muted-foreground focus-visible:ring-primary/30 min-h-24 w-full resize-none rounded-xl px-3.5 py-2.5 text-[15px] outline-none focus-visible:ring-2"
                    value={data.bio}
                    maxLength={500}
                    onChange={(e) => setData('bio', e.target.value)}
                />
            </Field>
            <Field label={t('cr.price')} error={errors.price_monthly} hint={t('cr.priceHint', { min: mnt(limits.min), max: mnt(limits.max) })}>
                <div className="flex flex-wrap gap-2">
                    {[9900, 14900, 19900, 29900]
                        .filter((p) => p >= limits.min && p <= limits.max)
                        .map((p) => (
                            <button
                                key={p}
                                type="button"
                                onClick={() => setData('price_monthly', String(p))}
                                className={`h-10 rounded-full px-4 text-sm font-bold transition ${price === p ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/70'}`}
                            >
                                {mnt(p)}
                            </button>
                        ))}
                </div>
                <div className="relative mt-2">
                    <span className="text-muted-foreground absolute top-1/2 left-3.5 -translate-y-1/2 font-semibold">₮</span>
                    <Input
                        inputMode="numeric"
                        placeholder="15,000"
                        className="pl-8 font-semibold tabular-nums sm:max-w-56"
                        value={price ? price.toLocaleString('en-US') : ''}
                        onChange={(e) => setData('price_monthly', e.target.value.replace(/\D/g, '').slice(0, 7))}
                    />
                </div>
            </Field>
            <Toggle checked={data.adult_content} onChange={(v) => setData('adult_content', v)} hint={t('cr.adultHint')}>
                {t('cr.adult')}
            </Toggle>
        </>
    );
}

function IdentityStep({ form, attempted, registerValid }: { form: Form; attempted: boolean; registerValid: boolean }) {
    const { t } = useT();
    const { data, setData, errors } = form;
    const registerError = (attempted || data.register_number.length > 0) && !registerValid ? t('cr.registerFormat') : errors.register_number;

    return (
        <>
            <Field label={t('cr.legalName')} error={attempted && !data.legal_name.trim() ? t('cr.legalNameRequired') : errors.legal_name}>
                <Input value={data.legal_name} autoFocus onChange={(e) => setData('legal_name', e.target.value)} maxLength={100} />
            </Field>
            <Field label={t('cr.register')} error={registerError} hint={t('cr.registerHint')}>
                <Input
                    placeholder="УБ99031512"
                    className="font-semibold tracking-wider uppercase sm:max-w-60"
                    value={data.register_number}
                    onChange={(e) => {
                        form.clearErrors('register_number');
                        setData('register_number', e.target.value.replace(/\s+/g, '').toUpperCase());
                    }}
                    aria-invalid={!!registerError}
                />
            </Field>
            <div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <Photo
                        label={t('cr.idFront')}
                        icon={IdCard}
                        file={data.id_front}
                        error={errors.id_front}
                        onPick={(f) => setData('id_front', f)}
                    />
                    <Photo label={t('cr.idBack')} icon={IdCard} file={data.id_back} error={errors.id_back} onPick={(f) => setData('id_back', f)} />
                    <Photo label={t('cr.selfie')} icon={Camera} file={data.selfie} error={errors.selfie} onPick={(f) => setData('selfie', f)} />
                </div>
                <p className="text-muted-foreground mt-2 text-xs">{t('cr.photoHint')}</p>
                {attempted && (!data.id_front || !data.id_back || !data.selfie) && <InputError message={t('cr.photosRequired')} />}
            </div>
        </>
    );
}

function PayoutStep({ form, banks }: { form: Form; banks: string[] }) {
    const { t } = useT();
    const { data, setData, errors } = form;

    return (
        <>
            <Field label={t('cr.bank')} error={errors.bank_name}>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {banks.map((b) => (
                        <button
                            key={b}
                            type="button"
                            onClick={() => setData('bank_name', b)}
                            className={`flex h-12 items-center gap-2 rounded-xl px-3 text-left text-sm font-semibold transition ${
                                data.bank_name === b ? 'bg-primary/15 text-primary' : 'bg-muted hover:bg-muted/70'
                            }`}
                        >
                            <Landmark className="size-4 shrink-0" />
                            <span className="truncate">{b}</span>
                            {data.bank_name === b && <Check className="ml-auto size-4 shrink-0" strokeWidth={3} />}
                        </button>
                    ))}
                </div>
            </Field>
            <Field label={t('cr.account')} error={errors.bank_account}>
                <Input
                    inputMode="numeric"
                    placeholder="5000123456"
                    className="font-semibold tracking-wider tabular-nums"
                    value={data.bank_account}
                    onChange={(e) => setData('bank_account', e.target.value)}
                />
            </Field>
            <Field label={t('cr.holder')} error={errors.account_holder}>
                <Input value={data.account_holder} onChange={(e) => setData('account_holder', e.target.value)} maxLength={80} />
            </Field>
        </>
    );
}

function ReviewStep({ form, onEdit }: { form: Form; onEdit: (step: number) => void }) {
    const { t } = useT();
    const { data, setData, errors } = form;
    const rows: { step: number; icon: typeof UserRound; title: TKey; lines: string[] }[] = [
        {
            step: 0,
            icon: UserRound,
            title: 'cr.sProfile',
            lines: [
                `${data.display_name} · @${data.handle}`,
                `${mnt(Number(data.price_monthly || 0))}${t('cr.perMonth')}${data.adult_content ? ' · 18+' : ''}`,
            ],
        },
        { step: 1, icon: IdCard, title: 'cr.sIdentity', lines: [data.legal_name, data.register_number] },
        { step: 2, icon: Landmark, title: 'cr.sPayout', lines: [data.bank_name, `${data.bank_account} · ${data.account_holder}`] },
    ];

    return (
        <>
            <ul className="flex flex-col gap-2">
                {rows.map((r) => (
                    <li key={r.title} className="bg-card flex items-center gap-3 rounded-2xl p-4 shadow-xs">
                        <span className="bg-muted grid size-10 shrink-0 place-items-center rounded-full">
                            <r.icon className="size-5" />
                        </span>
                        <div className="min-w-0 flex-1">
                            <p className="text-muted-foreground text-xs font-semibold">{t(r.title)}</p>
                            {r.lines.map((l) => (
                                <p key={l} className="truncate text-[15px] font-semibold">
                                    {l}
                                </p>
                            ))}
                        </div>
                        <button
                            type="button"
                            onClick={() => onEdit(r.step)}
                            className="text-muted-foreground hover:bg-muted hover:text-foreground grid size-9 shrink-0 place-items-center rounded-full transition"
                            aria-label={t('cr.edit')}
                            title={t('cr.edit')}
                        >
                            <Pencil className="size-4" />
                        </button>
                    </li>
                ))}
            </ul>

            <section className="bg-card flex flex-col gap-1 rounded-2xl p-2 shadow-xs">
                <h2 className="px-2 pt-2 pb-1 font-bold">{t('cr.sConsent')}</h2>
                <Consent checked={data.consent_age} onChange={(v) => setData('consent_age', v)} error={errors.consent_age}>
                    {t('cr.consentAge')}
                </Consent>
                <Consent checked={data.consent_people} onChange={(v) => setData('consent_people', v)} error={errors.consent_people}>
                    {t('cr.consentPeople')}
                </Consent>
                <Consent checked={data.consent_legal} onChange={(v) => setData('consent_legal', v)} error={errors.consent_legal}>
                    {t('cr.consentLegal')}
                </Consent>
            </section>
        </>
    );
}

/* ----------------------------------------------------------------- pieces */

function Private({ text }: { text: string }) {
    return (
        <p className="text-muted-foreground mt-2 flex items-start gap-2 text-sm">
            <Lock className="mt-0.5 size-4 shrink-0" /> {text}
        </p>
    );
}

function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: ReactNode }) {
    return (
        <div>
            <p className="mb-1.5 text-sm font-semibold">{label}</p>
            {children}
            {error ? <InputError message={error} className="mt-1.5" /> : hint && <p className="text-muted-foreground mt-1.5 text-xs">{hint}</p>}
        </div>
    );
}

/** A photo tile: tap to pick, shows the picked photo. */
function Photo({
    label,
    icon: Icon,
    file,
    error,
    onPick,
}: {
    label: string;
    icon: typeof IdCard;
    file: File | null;
    error?: string;
    onPick: (f: File | null) => void;
}) {
    const { t } = useT();
    const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
    useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);

    return (
        <div>
            <label
                className={`group relative grid aspect-[4/3] cursor-pointer place-items-center overflow-hidden rounded-2xl transition ${
                    url ? '' : error ? 'bg-red-100 text-red-600 dark:bg-red-950/50' : 'bg-muted text-muted-foreground hover:bg-muted/70'
                }`}
            >
                {url ? (
                    <>
                        <img src={url} alt="" className="absolute inset-0 size-full object-cover" />
                        <span className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/70 to-transparent p-2 text-xs font-semibold text-white">
                            <span className="inline-flex items-center gap-1">
                                <CircleCheck className="size-3.5 text-emerald-400" /> {label}
                            </span>
                            <span className="opacity-80">{t('cr.change')}</span>
                        </span>
                    </>
                ) : (
                    <span className="flex flex-col items-center gap-1.5 px-2 text-center">
                        <Icon className="size-6" />
                        <span className="text-xs leading-tight font-semibold">{label}</span>
                        <span className="text-primary text-xs font-bold">{t('cr.upload')}</span>
                    </span>
                )}
                <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    onChange={(e) => onPick(e.target.files?.[0] ?? null)}
                />
            </label>
            {error && <InputError message={error} className="mt-1" />}
        </div>
    );
}

function Toggle({ checked, onChange, hint, children }: { checked: boolean; onChange: (v: boolean) => void; hint?: string; children: ReactNode }) {
    return (
        <label className="bg-card flex cursor-pointer items-center gap-3 rounded-2xl p-4 shadow-xs">
            <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold">{children}</span>
                {hint && <span className="text-muted-foreground mt-0.5 block text-xs">{hint}</span>}
            </span>
            <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
            <span className="bg-muted peer-checked:bg-primary peer-focus-visible:ring-primary/30 relative h-7 w-12 shrink-0 rounded-full transition peer-focus-visible:ring-2 after:absolute after:top-1 after:left-1 after:size-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-5" />
        </label>
    );
}

function Consent({ checked, onChange, error, children }: { checked: boolean; onChange: (v: boolean) => void; error?: string; children: ReactNode }) {
    return (
        <label
            className={`flex cursor-pointer items-start gap-3 rounded-xl p-2.5 text-[15px] leading-snug transition ${checked ? '' : 'hover:bg-muted/60'}`}
        >
            <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
            <span
                className={`peer-focus-visible:ring-primary/30 mt-0.5 grid size-5 shrink-0 place-items-center rounded-md transition peer-focus-visible:ring-2 ${checked ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}
            >
                {checked && <Check className="size-3.5" strokeWidth={3} />}
            </span>
            <span>
                {children}
                {error && <InputError message={error} className="mt-1" />}
            </span>
        </label>
    );
}
