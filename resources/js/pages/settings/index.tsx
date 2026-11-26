import InputError from '@/components/input-error';
import { InstallRow, PushRow } from '@/components/push-settings';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import UserAvatar from '@/components/user-avatar';
import { useAppearance, type Appearance } from '@/hooks/use-appearance';
import SocialLayout from '@/layouts/social-layout';
import { sendJson } from '@/lib/http';
import { setLocale, useT, type Locale, type TKey } from '@/lib/i18n';
import { installStore } from '@/lib/push';
import { type SharedData } from '@/types';
import { Link, router, useForm, usePage } from '@inertiajs/react';
import { ChevronRight, Monitor, Moon, Phone, ShieldCheck, Sun, Trash2, UserPen, type LucideIcon } from 'lucide-react';
import { useSyncExternalStore, type FormEvent, type ReactNode } from 'react';

const THEMES: [Appearance, TKey, LucideIcon][] = [
    ['light', 'set.light', Sun],
    ['dark', 'set.dark', Moon],
    ['system', 'set.system', Monitor],
];

/** Settings: account (phone, profile), language, appearance, and deleting the account. */
type BlockedPerson = { id: number; name: string; handle: string | null; avatar_url: string | null };

export default function Settings({
    phone,
    isCreator,
    twoFactor,
    deleteWord,
    blocked,
}: {
    phone: string | null;
    isCreator: boolean;
    twoFactor: boolean;
    deleteWord: string;
    blocked: BlockedPerson[];
}) {
    const { t, locale } = useT();
    const { appearance, updateAppearance } = useAppearance();

    return (
        <SocialLayout title={t('nav.settings')} header={<h1 className="text-lg font-bold tracking-wide uppercase">{t('nav.settings')}</h1>}>
            <div className="flex flex-col gap-6 p-4">
                <Section title={t('set.account')}>
                    <Row icon={Phone} label={t('set.phone')} value={phone ? `+976 ${phone.slice(0, 4)} ${phone.slice(4)}` : '—'} />
                    <Link href={route('me.edit', { edit: 1 })} className="hover:bg-muted/60 block transition">
                        <Row icon={UserPen} label={t('nav.editProfile')} chevron />
                    </Link>
                    <Link href={route('two-factor.show')} className="hover:bg-muted/60 block transition">
                        <Row icon={ShieldCheck} label={t('2fa.title')} value={t(twoFactor ? '2fa.onShort' : '2fa.offShort')} chevron />
                    </Link>
                </Section>

                <AppSection />

                <Section title={t('lang.label')}>
                    <Segmented
                        value={locale}
                        onChange={(l) => l !== locale && setLocale(l as Locale)}
                        options={[
                            ['mn', 'Монгол'],
                            ['en', 'English'],
                        ]}
                    />
                </Section>

                <Section title={t('set.appearance')}>
                    <div className="grid grid-cols-3 gap-2 p-2">
                        {THEMES.map(([value, label, Icon]) => (
                            <button
                                key={value}
                                type="button"
                                onClick={() => updateAppearance(value)}
                                className={`flex flex-col items-center gap-2 rounded-xl py-4 text-sm font-semibold transition ${
                                    appearance === value ? 'bg-primary/10 text-primary' : 'bg-muted hover:bg-muted/70'
                                }`}
                            >
                                <Icon className="size-5" /> {t(label)}
                            </button>
                        ))}
                    </div>
                </Section>

                <Section title={t('bl.title')}>
                    {blocked.length === 0 ? (
                        <p className="text-muted-foreground px-4 py-3.5 text-sm">{t('bl.none')}</p>
                    ) : (
                        blocked.map((b) => (
                            <div key={b.id} className="flex items-center gap-3 px-4 py-3">
                                <UserAvatar name={b.name} src={b.avatar_url} seed={b.handle ?? b.name} className="size-9" />
                                <span className="min-w-0 flex-1 truncate font-medium">
                                    {b.name}
                                    {b.handle && <span className="text-muted-foreground font-normal"> @{b.handle}</span>}
                                </span>
                                <button
                                    type="button"
                                    onClick={async () => {
                                        await sendJson('POST', route('users.block', b.id));
                                        router.reload({ only: ['blocked'] });
                                    }}
                                    className="hover:bg-muted bg-muted rounded-full px-3 py-1 text-xs font-bold"
                                >
                                    {t('bl.unblock')}
                                </button>
                            </div>
                        ))
                    )}
                </Section>

                <Section title={t('set.danger')}>
                    <DeleteAccount word={deleteWord} isCreator={isCreator} />
                </Section>
            </div>
        </SocialLayout>
    );
}

/** Push notifications and installing the app, on this device. Hidden when neither applies. */
function AppSection() {
    const { t } = useT();
    const { pushKey } = usePage<SharedData>().props;
    const install = useSyncExternalStore(installStore.subscribe, installStore.snapshot, () => 'none' as const);
    if (!pushKey && install === 'none') return null;

    return (
        <Section title={t('set.appSection')}>
            <PushRow />
            <InstallRow />
        </Section>
    );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
    return (
        <section>
            <h2 className="text-muted-foreground mb-2 px-1 text-xs font-semibold tracking-wider uppercase">{title}</h2>
            <div className="bg-card overflow-hidden rounded-2xl shadow-xs">{children}</div>
        </section>
    );
}

function Row({ icon: Icon, label, value, chevron }: { icon: LucideIcon; label: string; value?: string; chevron?: boolean }) {
    return (
        <div className="flex items-center gap-3 px-4 py-3.5">
            <Icon className="text-muted-foreground size-5" />
            <span className="flex-1 font-medium">{label}</span>
            {value && <span className="text-muted-foreground tabular-nums">{value}</span>}
            {chevron && <ChevronRight className="text-muted-foreground size-4" />}
        </div>
    );
}

function Segmented({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, string][] }) {
    return (
        <div className="grid grid-cols-2 gap-1 p-2">
            {options.map(([v, label]) => (
                <button
                    key={v}
                    type="button"
                    onClick={() => onChange(v)}
                    className={`rounded-xl py-2.5 text-sm font-semibold transition ${value === v ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'}`}
                >
                    {label}
                </button>
            ))}
        </div>
    );
}

function DeleteAccount({ word, isCreator }: { word: string; isCreator: boolean }) {
    const { t } = useT();
    const form = useForm({ confirm: '' });

    function submit(e: FormEvent) {
        e.preventDefault();
        form.delete(route('settings.destroy'), { preserveScroll: true });
    }

    return (
        <Dialog>
            <DialogTrigger asChild>
                <button
                    type="button"
                    className="flex w-full items-center gap-3 px-4 py-3.5 text-left font-medium text-red-600 transition hover:bg-red-50 dark:hover:bg-red-950/30"
                >
                    <Trash2 className="size-5" /> {t('set.delete')}
                </button>
            </DialogTrigger>
            <DialogContent className="rounded-3xl sm:max-w-sm">
                <form onSubmit={submit} className="flex flex-col gap-4">
                    <DialogTitle className="text-xl font-extrabold">{t('set.deleteTitle')}</DialogTitle>
                    <DialogDescription>{t(isCreator ? 'set.deleteCreator' : 'set.deleteFan')}</DialogDescription>
                    <label className="text-sm font-medium">
                        {t('set.typeToConfirm', { word })}
                        <input
                            value={form.data.confirm}
                            onChange={(e) => form.setData('confirm', e.target.value)}
                            autoComplete="off"
                            className="bg-muted mt-1.5 h-12 w-full rounded-xl px-4 font-mono tracking-wider outline-none"
                        />
                    </label>
                    <InputError message={form.errors.confirm} />
                    <button
                        type="submit"
                        disabled={form.data.confirm !== word || form.processing}
                        className="h-12 rounded-xl bg-red-600 font-bold text-white transition hover:bg-red-700 disabled:opacity-40"
                    >
                        {t('set.deleteForever')}
                    </button>
                </form>
            </DialogContent>
        </Dialog>
    );
}
