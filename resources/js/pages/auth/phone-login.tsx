import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import AuthLayout from '@/layouts/auth-layout';
import { useT } from '@/lib/i18n';
import { Head, router, useForm } from '@inertiajs/react';
import { ArrowLeft, ArrowRight, CircleCheck, Hourglass, LoaderCircle, MessageSquare } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';

type Status = 'PENDING' | 'VERIFIED' | 'EXPIRED';

type Verification = {
    phone: string;
    code: string;
    status: Status;
    sms_uri: string;
    display_instruction: string;
    expires_at: string;
    shortcode: string;
};

const POLL_MS = 3000;

/** Phone-first login/sign-up: enter number → text the code to 144773 → signed in (new people pick a name). */
export default function PhoneLogin({ verification }: { verification: Verification | null }) {
    const { t } = useT();

    return (
        <AuthLayout title={verification ? t('ph.stepTitle') : t('ph.title')} description={verification ? '' : t('ph.sub')}>
            <Head title={t('ph.title')} />
            {verification ? <SmsStep v={verification} /> : <PhoneStep />}
        </AuthLayout>
    );
}

function PhoneStep() {
    const { t } = useT();
    const { data, setData, post, processing, errors } = useForm({ phone: '' });

    function submit(e: FormEvent) {
        e.preventDefault();
        post(route('login.phone.start'));
    }

    return (
        <form onSubmit={submit} autoComplete="off" className="flex flex-col gap-5">
            <div className="grid gap-2">
                <label htmlFor="phone" className="text-sm font-bold">
                    {t('ph.phone')}
                </label>
                <div className="bg-card border-input focus-within:border-ring focus-within:ring-ring/15 flex h-15 items-center overflow-hidden rounded-2xl border transition focus-within:ring-4">
                    <span className="border-border text-foreground ml-4 shrink-0 border-r pr-3 text-base font-bold tabular-nums">+976</span>
                    <input
                        id="phone"
                        type="tel"
                        inputMode="numeric"
                        autoComplete="off"
                        required
                        aria-invalid={Boolean(errors.phone)}
                        placeholder="9911 2233"
                        className="login-phone-input text-foreground placeholder:text-muted-foreground h-full w-full min-w-0 bg-transparent px-3 text-2xl font-extrabold tracking-wide tabular-nums scheme-light outline-none dark:scheme-dark"
                        value={data.phone}
                        onChange={(e) => setData('phone', formatPhone(e.target.value))}
                    />
                </div>
                <InputError message={errors.phone} />
            </div>

            <Button
                type="submit"
                className="group bg-brand-2 hover:bg-brand-2/80 focus-visible:ring-ring h-15 w-full justify-between rounded-2xl px-5 text-base font-bold text-[#20251e] transition disabled:opacity-65"
                disabled={processing || data.phone.replace(/\D/g, '').length < 8}
            >
                {t('ph.continue')}
                {processing ? (
                    <LoaderCircle className="size-5 animate-spin" />
                ) : (
                    <ArrowRight className="size-5 transition group-hover:translate-x-0.5" />
                )}
            </Button>
        </form>
    );
}

/** "99112233" -> "9911 2233" (8-digit Mongolian numbers). */
function formatPhone(raw: string) {
    const d = raw.replace(/\D/g, '').slice(0, 8);
    return d.length > 4 ? `${d.slice(0, 4)} ${d.slice(4)}` : d;
}

function SmsStep({ v }: { v: Verification }) {
    const { t } = useT();
    const [status, setStatus] = useState<Status>(v.status);
    const [left, setLeft] = useState(() => secondsLeft(v.expires_at));
    const [total] = useState(() => Math.max(1, secondsLeft(v.expires_at)));
    const completeForm = useRef<HTMLFormElement>(null);

    // Countdown to expiresAt.
    useEffect(() => {
        const id = setInterval(() => setLeft(secondsLeft(v.expires_at)), 1000);
        return () => clearInterval(id);
    }, [v.expires_at]);

    // Poll our server (which asks verify.mn) every 3s until VERIFIED / EXPIRED, with a hard stop.
    useEffect(() => {
        if (status !== 'PENDING') return;
        const hardStop = new Date(v.expires_at).getTime() + 15_000;
        let timer: ReturnType<typeof setTimeout>;
        let cancelled = false;

        async function tick() {
            if (cancelled) return;
            if (Date.now() > hardStop) {
                setStatus('EXPIRED');
                return;
            }
            try {
                const res = await fetch(route('login.phone.status'), { headers: { Accept: 'application/json' } });
                if (res.ok) {
                    const next = (await res.json()).status as Status;
                    if (next !== 'PENDING') {
                        setStatus(next);
                        return;
                    }
                }
            } catch {
                /* network blip: keep polling */
            }
            timer = setTimeout(tick, POLL_MS);
        }
        timer = setTimeout(tick, POLL_MS);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [status, v.expires_at]);

    // Verified → finish login (the server re-checks with verify.mn before logging in).
    useEffect(() => {
        if (status !== 'VERIFIED') return;
        // Allow the Inertia visit that displayed this step to finish before navigating.
        const timer = setTimeout(() => completeForm.current?.requestSubmit(), 0);
        return () => clearTimeout(timer);
    }, [status]);

    const newCode = () => router.post(route('login.phone.start'), { phone: v.phone });
    const cancel = () => router.post(route('login.phone.cancel'));

    if (status === 'VERIFIED') {
        const csrf = typeof document === 'undefined' ? '' : document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content;
        return (
            <form
                ref={completeForm}
                method="post"
                action={route('login.phone.complete')}
                className="flex flex-col items-center gap-4 py-6 text-center"
            >
                <input type="hidden" name="_token" value={csrf ?? ''} />
                <CircleCheck className="text-primary size-12" aria-hidden />
                <p className="text-primary font-medium" role="status">
                    {t('ph.verified')}
                </p>
                <Button type="submit" className="w-full">
                    {t('ph.continue')}
                </Button>
            </form>
        );
    }

    if (status === 'EXPIRED') {
        return (
            <div className="flex flex-col gap-4 text-center">
                <Hourglass className="text-muted-foreground mx-auto size-10" aria-hidden />
                <p className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-800">{t('ph.expired')}</p>
                <Button onClick={newCode} className="h-14 w-full rounded-2xl text-base font-bold">
                    {t('ph.newCode')}
                </Button>
                <button type="button" onClick={cancel} className="text-muted-foreground hover:text-foreground text-sm">
                    {t('ph.change')}
                </button>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-5">
            {/* The code and where to send it */}
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-zinc-900 to-zinc-800 p-6 text-white shadow-xl">
                <div
                    className="from-primary/50 absolute -top-12 -right-12 size-40 rounded-full bg-gradient-to-br to-amber-400/40 blur-2xl"
                    aria-hidden
                />
                <div className="relative flex items-end justify-between gap-4">
                    <div>
                        <div className="text-xs font-medium tracking-wider text-white/60 uppercase">{t('ph.code')}</div>
                        <div className="mt-1 font-mono text-4xl font-bold tracking-[0.25em]">{v.code}</div>
                    </div>
                    <div className="text-right">
                        <div className="text-xs font-medium tracking-wider text-white/60 uppercase">{t('ph.to')}</div>
                        <div className="mt-1 font-mono text-2xl font-bold">{v.shortcode}</div>
                    </div>
                </div>
            </div>

            <Button asChild className="h-14 w-full rounded-xl text-base font-bold">
                <a href={v.sms_uri}>
                    <MessageSquare className="size-5" aria-hidden /> {t('ph.send')}
                </a>
            </Button>

            <div className="bg-muted/60 flex items-center gap-3 rounded-2xl p-3">
                <Countdown left={left} total={total} />
                <div className="min-w-0 flex-1 text-sm">
                    <p className="font-semibold">{t('ph.waiting')}</p>
                    <p className="text-muted-foreground text-xs">{t('ph.cost')}</p>
                </div>
            </div>

            {/* verify.mn's own instruction, verbatim: it names the number the SMS must come from. */}
            <p className="text-muted-foreground text-xs leading-relaxed whitespace-pre-line">{v.display_instruction}</p>

            <button type="button" onClick={cancel} className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm">
                <ArrowLeft className="size-4" /> {t('ph.change')} · {v.phone}
            </button>
        </div>
    );
}

/** A ring that empties as the code's time runs out, with mm:ss in the middle. */
function Countdown({ left, total }: { left: number; total: number }) {
    const r = 20;
    const c = 2 * Math.PI * r;
    return (
        <div className="relative grid size-12 shrink-0 place-items-center">
            <svg viewBox="0 0 48 48" className="absolute inset-0 -rotate-90">
                <circle cx="24" cy="24" r={r} fill="none" strokeWidth="4" className="stroke-border" />
                <circle
                    cx="24"
                    cy="24"
                    r={r}
                    fill="none"
                    strokeWidth="4"
                    strokeLinecap="round"
                    className="stroke-primary transition-[stroke-dashoffset] duration-1000 ease-linear"
                    strokeDasharray={c}
                    strokeDashoffset={c * (1 - Math.min(1, left / total))}
                />
            </svg>
            <span className="font-mono text-[10px] font-semibold tabular-nums">{mmss(left)}</span>
        </div>
    );
}

function secondsLeft(iso: string) {
    return Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 1000));
}

function mmss(s: number) {
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
