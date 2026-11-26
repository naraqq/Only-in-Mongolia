import InputError from '@/components/input-error';
import SocialLayout from '@/layouts/social-layout';
import { useT } from '@/lib/i18n';
import { ask } from '@/lib/confirm';
import { Link, router, useForm, usePage } from '@inertiajs/react';
import { ArrowLeft, Check, Copy, KeyRound, LoaderCircle, ShieldAlert, ShieldCheck, Smartphone } from 'lucide-react';
import QRCode from 'qrcode';
import { useEffect, useState, type FormEvent } from 'react';

type Setup = { secret: string; url: string };

/** Turn two-step sign-in on (scan, confirm, save recovery codes) or off. */
export default function TwoFactor({
    enabled,
    setup,
    recoveryCodes,
    required,
    recoveryLeft,
}: {
    enabled: boolean;
    setup: Setup | null;
    recoveryCodes: string[] | null;
    required: boolean;
    recoveryLeft: number;
}) {
    const { t } = useT();
    const flash = usePage<{ flash?: { status?: string } }>().props.flash;

    return (
        <SocialLayout
            title={t('2fa.title')}
            header={
                <>
                    <Link
                        href={route('settings')}
                        className="hover:bg-muted -ml-2 grid size-9 place-items-center rounded-full"
                        aria-label={t('cr.back')}
                    >
                        <ArrowLeft className="size-5" />
                    </Link>
                    <h1 className="text-lg font-bold">{t('2fa.title')}</h1>
                </>
            }
        >
            <div className="flex flex-col gap-5 p-4">
                {flash?.status === 'admin-needs-2fa' && !enabled && (
                    <p className="flex items-start gap-3 rounded-2xl bg-amber-100 p-4 text-sm text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
                        <ShieldAlert className="mt-0.5 size-5 shrink-0" /> {t('2fa.adminNeeds')}
                    </p>
                )}

                <section className="bg-card flex items-center gap-4 rounded-2xl p-5 shadow-xs">
                    <span
                        className={`grid size-12 shrink-0 place-items-center rounded-2xl ${enabled ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-muted text-muted-foreground'}`}
                    >
                        {enabled ? <ShieldCheck className="size-6" /> : <ShieldAlert className="size-6" />}
                    </span>
                    <div className="min-w-0 flex-1">
                        <p className="font-bold">{enabled ? t('2fa.on') : t('2fa.off')}</p>
                        <p className="text-muted-foreground text-sm">{t('2fa.why')}</p>
                    </div>
                </section>

                {recoveryCodes && <RecoveryCodes codes={recoveryCodes} />}
                {!enabled && !setup && <Start required={required} />}
                {!enabled && setup && <Confirm setup={setup} />}
                {enabled && <Disable recoveryLeft={recoveryLeft} required={required} />}
            </div>
        </SocialLayout>
    );
}

function Start({ required }: { required: boolean }) {
    const { t } = useT();
    const [busy, setBusy] = useState(false);
    return (
        <section className="bg-card rounded-2xl p-5 shadow-xs">
            <ol className="text-muted-foreground flex flex-col gap-2 text-sm">
                <li className="flex gap-2">
                    <Smartphone className="text-foreground mt-0.5 size-4 shrink-0" /> {t('2fa.step1')}
                </li>
                <li className="flex gap-2">
                    <KeyRound className="text-foreground mt-0.5 size-4 shrink-0" /> {t('2fa.step2')}
                </li>
            </ol>
            {required && <p className="mt-3 text-sm font-semibold text-amber-600 dark:text-amber-400">{t('2fa.requiredNote')}</p>}
            <button
                type="button"
                disabled={busy}
                onClick={() => router.post(route('two-factor.enable'), {}, { onStart: () => setBusy(true), onFinish: () => setBusy(false) })}
                className="bg-primary text-primary-foreground mt-5 inline-flex h-11 items-center gap-2 rounded-full px-5 text-sm font-bold shadow-md transition hover:brightness-110 disabled:opacity-50"
            >
                {busy && <LoaderCircle className="size-4 animate-spin" />}
                {t('2fa.turnOn')}
            </button>
        </section>
    );
}

function Confirm({ setup }: { setup: Setup }) {
    const { t } = useT();
    const [qr, setQr] = useState<string | null>(null);
    const form = useForm({ code: '' });

    useEffect(() => {
        QRCode.toDataURL(setup.url, { margin: 1, width: 220 }).then(setQr, () => setQr(null));
    }, [setup.url]);

    function submit(e: FormEvent) {
        e.preventDefault();
        form.post(route('two-factor.confirm'), { preserveScroll: true });
    }

    return (
        <section className="bg-card rounded-2xl p-5 shadow-xs">
            <h2 className="font-bold">{t('2fa.scanTitle')}</h2>
            <p className="text-muted-foreground mt-1 text-sm">{t('2fa.scanSub')}</p>
            <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row sm:items-start">
                <div className="grid size-[220px] shrink-0 place-items-center overflow-hidden rounded-2xl bg-white p-2">
                    {qr ? <img src={qr} alt="QR" className="size-full" /> : <LoaderCircle className="size-6 animate-spin text-zinc-400" />}
                </div>
                <div className="w-full min-w-0">
                    <p className="text-muted-foreground text-xs font-semibold">{t('2fa.manual')}</p>
                    <CopyText text={setup.secret} />
                    <form onSubmit={submit} className="mt-5">
                        <label className="text-sm font-semibold" htmlFor="code">
                            {t('2fa.enterCode')}
                        </label>
                        <input
                            id="code"
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            autoFocus
                            value={form.data.code}
                            onChange={(e) => form.setData('code', e.target.value.replace(/\D/g, '').slice(0, 6))}
                            placeholder="123 456"
                            className="bg-muted focus:ring-primary/30 mt-1.5 h-12 w-full rounded-xl px-4 text-center text-xl font-bold tracking-[0.4em] tabular-nums outline-none focus:ring-2"
                        />
                        <InputError message={form.errors.code} className="mt-1.5" />
                        <button
                            type="submit"
                            disabled={form.data.code.length !== 6 || form.processing}
                            className="bg-primary text-primary-foreground mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl font-bold transition hover:brightness-110 disabled:opacity-40"
                        >
                            {form.processing && <LoaderCircle className="size-4 animate-spin" />}
                            {t('2fa.confirm')}
                        </button>
                    </form>
                </div>
            </div>
        </section>
    );
}

function RecoveryCodes({ codes }: { codes: string[] }) {
    const { t } = useT();
    return (
        <section className="rounded-2xl bg-emerald-50 p-5 dark:bg-emerald-950/40">
            <h2 className="flex items-center gap-2 font-bold text-emerald-800 dark:text-emerald-200">
                <Check className="size-5" /> {t('2fa.savedTitle')}
            </h2>
            <p className="mt-1 text-sm text-emerald-900/80 dark:text-emerald-200/80">{t('2fa.recoverySub')}</p>
            <ul className="bg-card mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-xl p-4 font-mono text-sm tabular-nums">
                {codes.map((c) => (
                    <li key={c}>{c}</li>
                ))}
            </ul>
            <div className="mt-3">
                <CopyText text={codes.join('\n')} label={t('2fa.copyAll')} />
            </div>
        </section>
    );
}

function Disable({ recoveryLeft, required }: { recoveryLeft: number; required: boolean }) {
    const { t } = useT();
    const form = useForm({ code: '' });
    return (
        <section className="bg-card rounded-2xl p-5 shadow-xs">
            <p className="text-muted-foreground text-sm">{t('2fa.recoveryLeft', { n: recoveryLeft })}</p>
            <form
                onSubmit={async (e) => {
                    e.preventDefault();
                    if (await ask({ message: t(required ? '2fa.offAdminConfirm' : '2fa.offConfirm'), confirm: t('2fa.turnOff'), cancel: t('dlg.cancel'), danger: true }))
                        form.delete(route('two-factor.disable'), { preserveScroll: true });
                }}
                className="mt-4 flex flex-wrap items-start gap-2"
            >
                <input
                    value={form.data.code}
                    onChange={(e) => form.setData('code', e.target.value.slice(0, 20))}
                    placeholder={t('2fa.codeOrRecovery')}
                    className="bg-muted focus:ring-primary/30 h-11 min-w-0 flex-1 rounded-xl px-4 text-sm outline-none focus:ring-2"
                />
                <button
                    type="submit"
                    disabled={!form.data.code || form.processing}
                    className="h-11 rounded-xl bg-red-600 px-4 text-sm font-bold text-white transition hover:bg-red-700 disabled:opacity-40"
                >
                    {t('2fa.turnOff')}
                </button>
                <InputError message={form.errors.code} className="w-full" />
            </form>
        </section>
    );
}

function CopyText({ text, label }: { text: string; label?: string }) {
    const { t } = useT();
    const [done, setDone] = useState(false);
    return (
        <button
            type="button"
            onClick={() =>
                navigator.clipboard?.writeText(text).then(() => {
                    setDone(true);
                    setTimeout(() => setDone(false), 1500);
                })
            }
            className="bg-muted hover:bg-muted/70 mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left transition"
        >
            <span className="min-w-0 flex-1 truncate font-mono text-sm font-semibold tracking-wider">{label ?? text}</span>
            <span className="text-muted-foreground inline-flex shrink-0 items-center gap-1 text-xs font-bold">
                {done ? <Check className="size-4 text-emerald-500" /> : <Copy className="size-4" />} {t(done ? 'stu.copied' : 'stu.copy')}
            </span>
        </button>
    );
}
