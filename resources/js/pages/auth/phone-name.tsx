import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import AuthLayout from '@/layouts/auth-layout';
import { avatarGradient } from '@/lib/format';
import { useT, type TKey } from '@/lib/i18n';
import { Head, useForm } from '@inertiajs/react';
import { ArrowRight, Cake, CircleCheck, LoaderCircle, UserRound } from 'lucide-react';
import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react';

const initials = (name: string) =>
    name
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((w) => w.charAt(0))
        .join('')
        .slice(0, 2)
        .toUpperCase();

/** "80105376" → "8010 5376" */
const prettyPhone = (p: string) => (p.length === 8 ? `${p.slice(0, 4)} ${p.slice(4)}` : p);

/** Age on today's date for a valid Y/M/D, or null if the date doesn't exist. */
function ageOf(y: string, m: string, d: string): number | null {
    if (y.length !== 4 || !m || !d) return null;
    const [yy, mm, dd] = [Number(y), Number(m), Number(d)];
    const date = new Date(yy, mm - 1, dd);
    if (yy < 1900 || date.getFullYear() !== yy || date.getMonth() !== mm - 1 || date.getDate() !== dd || date > new Date()) return null;
    const now = new Date();
    return now.getFullYear() - yy - (now.getMonth() < mm - 1 || (now.getMonth() === mm - 1 && now.getDate() < dd) ? 1 : 0);
}

/** Last sign-up step for a new number: a name and a date of birth (18+). */
export default function PhoneName({ phone }: { phone: string }) {
    const { t } = useT();
    const { data, setData, post, processing, errors, transform } = useForm({ name: '', birthdate: '' });
    const [dob, setDob] = useState({ y: '', m: '', d: '' });
    const age = ageOf(dob.y, dob.m, dob.d);
    const complete = dob.y.length === 4 && dob.m !== '' && dob.d !== '';

    function submit(e: FormEvent) {
        e.preventDefault();
        transform((d) => ({ ...d, birthdate: `${dob.y}-${dob.m.padStart(2, '0')}-${dob.d.padStart(2, '0')}` }));
        post(route('login.phone.name.store'));
    }

    return (
        <AuthLayout title={t('ph.nameTitle')} description="">
            <Head title={t('ph.create')} />

            <div className="-mt-4 flex items-center gap-4">
                {/* Live avatar preview */}
                <span
                    className={`grid size-16 shrink-0 place-items-center rounded-full bg-gradient-to-br text-xl font-bold text-white shadow-lg ring-4 ring-white transition-all dark:ring-zinc-900 ${
                        data.name.trim() ? avatarGradient(data.name.trim()) : 'from-zinc-200 to-zinc-300 dark:from-zinc-700 dark:to-zinc-800'
                    }`}
                    aria-hidden
                >
                    {initials(data.name) || <UserRound className="size-7 text-white" />}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                    <CircleCheck className="size-4" /> {t('ph.nameSub', { phone: `+976 ${prettyPhone(phone)}` })}
                </span>
            </div>

            <form onSubmit={submit} className="flex flex-col gap-5">
                {/* Name: floating label */}
                <div>
                    <label className="group border-input focus-within:border-primary focus-within:ring-primary/15 relative flex h-14 items-center gap-3 rounded-2xl border bg-white px-4 shadow-sm transition focus-within:ring-4 dark:bg-zinc-900">
                        <UserRound className="text-muted-foreground group-focus-within:text-primary size-5 shrink-0 transition" />
                        <span className="relative flex-1 self-stretch">
                            <input
                                id="name"
                                autoFocus
                                required
                                maxLength={60}
                                autoComplete="name"
                                placeholder=" "
                                value={data.name}
                                onChange={(e) => setData('name', e.target.value)}
                                className="peer absolute inset-x-0 bottom-2 bg-transparent text-[17px] font-semibold outline-none"
                            />
                            <span className="text-muted-foreground pointer-events-none absolute top-1/2 left-0 -translate-y-1/2 text-base transition-all peer-focus:top-3.5 peer-focus:text-xs peer-[:not(:placeholder-shown)]:top-3.5 peer-[:not(:placeholder-shown)]:text-xs">
                                {t('ph.name')}
                            </span>
                        </span>
                    </label>
                    <InputError message={errors.name} className="mt-2" />
                </div>

                {/* Date of birth: year / month / day boxes */}
                <fieldset>
                    <legend className="text-muted-foreground mb-2 flex w-full items-center justify-between text-sm font-medium">
                        <span className="inline-flex items-center gap-1.5">
                            <Cake className="size-4" /> {t('ph.birthdate')}
                        </span>
                        {complete && (
                            <span
                                className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                                    age === null
                                        ? 'bg-amber-100 text-amber-700'
                                        : age >= 18
                                          ? 'bg-emerald-100 text-emerald-700'
                                          : 'bg-rose-100 text-rose-700'
                                }`}
                            >
                                {age === null ? t('ph.badDate') : age >= 18 ? '18+ ✓' : t('ph.under18')}
                            </span>
                        )}
                    </legend>
                    <DateBoxes value={dob} onChange={setDob} />
                    {errors.birthdate && <InputError message={errors.birthdate} className="mt-2" />}
                </fieldset>

                <Button
                    type="submit"
                    className="from-primary shadow-primary/25 group mt-1 h-14 w-full rounded-2xl bg-gradient-to-r to-rose-500 text-base font-bold shadow-lg transition hover:brightness-110 disabled:opacity-40 disabled:shadow-none"
                    disabled={processing || !data.name.trim() || age === null || age < 18}
                >
                    {t('ph.create')}
                    {processing ? (
                        <LoaderCircle className="size-5 animate-spin" />
                    ) : (
                        <ArrowRight className="size-5 transition group-hover:translate-x-0.5" />
                    )}
                </Button>
            </form>
        </AuthLayout>
    );
}

type Dob = { y: string; m: string; d: string };
const PARTS: { key: keyof Dob; label: TKey; ph: string; max: number; grow: string }[] = [
    { key: 'y', label: 'ph.year', ph: '1998', max: 4, grow: 'flex-[1.4]' },
    { key: 'm', label: 'ph.month', ph: '05', max: 2, grow: 'flex-1' },
    { key: 'd', label: 'ph.day', ph: '21', max: 2, grow: 'flex-1' },
];

/** Three numeric boxes (Mongolian order: year, month, day). Typing a full part jumps to the next; backspace on empty goes back. */
function DateBoxes({ value, onChange }: { value: Dob; onChange: (v: Dob) => void }) {
    const { t } = useT();
    const refs = useRef<(HTMLInputElement | null)[]>([]);

    function set(i: number, raw: string) {
        const part = PARTS[i];
        let v = raw.replace(/\D/g, '').slice(0, part.max);
        if (part.key === 'm' && Number(v) > 12) v = '12';
        if (part.key === 'd' && Number(v) > 31) v = '31';
        onChange({ ...value, [part.key]: v });
        // Jump ahead once a part is clearly finished (e.g. "3" for a month can't become two digits above 12).
        const done = v.length === part.max || (part.key === 'm' && Number(v) > 1) || (part.key === 'd' && Number(v) > 3);
        if (done) refs.current[i + 1]?.focus();
    }

    function back(i: number, e: KeyboardEvent<HTMLInputElement>) {
        if (e.key === 'Backspace' && value[PARTS[i].key] === '' && i > 0) refs.current[i - 1]?.focus();
    }

    return (
        <div className="flex gap-2.5">
            {PARTS.map((p, i) => (
                <label
                    key={p.key}
                    className={`${p.grow} border-input focus-within:border-primary focus-within:ring-primary/15 flex h-14 flex-col justify-center rounded-2xl border bg-white px-4 shadow-sm transition focus-within:ring-4 dark:bg-zinc-900`}
                >
                    <span className="text-muted-foreground text-[10px] leading-tight font-semibold tracking-wider uppercase">{t(p.label)}</span>
                    <input
                        ref={(el) => {
                            refs.current[i] = el;
                        }}
                        inputMode="numeric"
                        autoComplete={p.key === 'y' ? 'bday-year' : p.key === 'm' ? 'bday-month' : 'bday-day'}
                        placeholder={p.ph}
                        value={value[p.key]}
                        onChange={(e) => set(i, e.target.value)}
                        onKeyDown={(e) => back(i, e)}
                        onBlur={() => p.key !== 'y' && value[p.key].length === 1 && onChange({ ...value, [p.key]: value[p.key].padStart(2, '0') })}
                        className="placeholder:text-muted-foreground/35 w-full bg-transparent text-[17px] leading-tight font-semibold tabular-nums outline-none"
                    />
                </label>
            ))}
        </div>
    );
}
