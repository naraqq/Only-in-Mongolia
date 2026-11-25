import AdminTabs from '@/components/admin-tabs';
import UserAvatar from '@/components/user-avatar';
import SocialLayout from '@/layouts/social-layout';
import { mnt } from '@/lib/format';
import { useT, type TKey } from '@/lib/i18n';
import { Link, router, useForm } from '@inertiajs/react';
import { ArrowLeft, Ban, HandCoins, LockOpen, RotateCcw, ShieldCheck, ShieldOff, Star, type LucideIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';

type Purpose = 'subscription' | 'tip' | 'ppv';
type PaymentRow = {
    id: string;
    purpose: Purpose;
    amount: number;
    status: 'paid' | 'refunded';
    fan: { id: number; name: string | null };
    creator: { handle: string; display_name: string } | null;
    at: string;
    refund_reason: string | null;
};
type ReportRow = { id: number; reason: string; type: string; details: string | null; status: string; reporter: string | null; at: string };
type Props = {
    user: {
        id: number;
        name: string;
        phone: string | null;
        birthdate: string | null;
        avatar_url: string | null;
        is_admin: boolean;
        banned_at: string | null;
        ban_reason: string | null;
        joined: string;
        is_me: boolean;
        subscriptions: number;
        following: number;
    };
    creator: {
        id: number;
        handle: string;
        display_name: string;
        status: string;
        price: number;
        subscribers: number;
        posts: number;
        earned: number;
        available: number;
        paid_out: number;
    } | null;
    spent: number;
    paymentsMade: PaymentRow[];
    paymentsReceived: PaymentRow[];
    reportsAgainst: ReportRow[];
    reportsFiled: ReportRow[];
};

const day = (iso: string) => iso.slice(0, 10).replaceAll('-', '.');
const PURPOSE: Record<Purpose, [TKey, LucideIcon]> = {
    subscription: ['ea.subscription', Star],
    tip: ['tip.for', HandCoins],
    ppv: ['ppv.option', LockOpen],
};

/** Admins: one account in full, with ban / admin / refund actions. */
export default function AdminUser({ user, creator, spent, paymentsMade, paymentsReceived, reportsAgainst, reportsFiled }: Props) {
    const { t } = useT();

    return (
        <SocialLayout title={user.name} header={<h1 className="text-lg font-bold tracking-wide uppercase">{t('nav.adminHome')}</h1>} wide>
            <div className="flex flex-col gap-6 p-4">
                <AdminTabs />
                <Link href={route('admin.users')} className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm">
                    <ArrowLeft className="size-4" /> {t('au.back')}
                </Link>

                <section className="flex flex-wrap items-start gap-4">
                    <UserAvatar name={user.name} src={user.avatar_url} seed={creator?.handle ?? user.name} className="size-16 text-2xl" />
                    <div className="min-w-0 flex-1">
                        <h2 className="flex flex-wrap items-center gap-2 text-xl font-bold">
                            {user.name}
                            {user.is_admin && (
                                <span className="bg-primary/10 text-primary inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold">
                                    <ShieldCheck className="size-3.5" /> {t('au.admin')}
                                </span>
                            )}
                            {user.banned_at && (
                                <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">{t('au.bannedTag')}</span>
                            )}
                        </h2>
                        <p className="text-muted-foreground text-sm">
                            #{user.id} · {user.phone ?? '—'} · {t('au.born', { date: user.birthdate ? day(user.birthdate) : '—' })} ·{' '}
                            {t('au.joined', { date: day(user.joined) })}
                        </p>
                        {creator && (
                            <p className="mt-1 text-sm">
                                <Link href={route('creator.show', creator.handle)} className="font-semibold hover:underline">
                                    {creator.display_name} (@{creator.handle})
                                </Link>
                                <span className="text-muted-foreground"> · {t(`au.status.${creator.status}` as TKey)}</span>
                            </p>
                        )}
                    </div>
                    <Actions user={user} creator={creator} />
                </section>

                {user.banned_at && (
                    <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800">
                        <span className="font-semibold">{t('au.bannedOn', { date: day(user.banned_at) })}</span> {user.ban_reason}
                    </p>
                )}

                <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Stat label={t('au.spent')} value={mnt(spent)} />
                    <Stat label={t('au.subsActive')} value={user.subscriptions} />
                    {creator ? (
                        <>
                            <Stat label={t('ea.earned')} value={mnt(creator.earned)} />
                            <Stat
                                label={t('ea.available')}
                                value={mnt(creator.available)}
                                sub={t('au.paidOutN', { amount: mnt(creator.paid_out) })}
                            />
                            <Stat label={t('au.subscribers')} value={creator.subscribers} />
                            <Stat label={t('au.posts')} value={creator.posts} />
                        </>
                    ) : (
                        <Stat label={t('au.following')} value={user.following} />
                    )}
                </section>

                {creator && (
                    <Section title={t('au.received')} empty={paymentsReceived.length === 0}>
                        {paymentsReceived.map((p) => (
                            <Payment key={p.id} p={p} other={p.fan.name ?? '—'} otherHref={route('admin.users.show', p.fan.id)} />
                        ))}
                    </Section>
                )}
                <Section title={t('au.made')} empty={paymentsMade.length === 0}>
                    {paymentsMade.map((p) => (
                        <Payment
                            key={p.id}
                            p={p}
                            other={p.creator ? '@' + p.creator.handle : '—'}
                            otherHref={p.creator ? route('creator.show', p.creator.handle) : undefined}
                        />
                    ))}
                </Section>
                <Section title={t('au.reportsAgainst')} empty={reportsAgainst.length === 0}>
                    {reportsAgainst.map((r) => (
                        <Report key={r.id} r={r} />
                    ))}
                </Section>
                {reportsFiled.length > 0 && (
                    <Section title={t('au.reportsFiled')} empty={false}>
                        {reportsFiled.map((r) => (
                            <Report key={r.id} r={r} />
                        ))}
                    </Section>
                )}
            </div>
        </SocialLayout>
    );
}

function Actions({ user, creator }: Pick<Props, 'user' | 'creator'>) {
    const { t } = useT();
    const [banning, setBanning] = useState(false);
    const form = useForm({ reason: '' });
    if (user.is_me) return null;

    const post = (name: string, id: number) => router.post(route(name, id), {}, { preserveScroll: true });

    return (
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
            <div className="flex flex-wrap gap-2">
                {!user.banned_at && (
                    <button
                        type="button"
                        onClick={() => {
                            if (confirm(t(user.is_admin ? 'au.confirmUnadmin' : 'au.confirmAdmin', { name: user.name })))
                                post('admin.users.admin', user.id);
                        }}
                        className="hover:bg-muted inline-flex h-10 items-center gap-1.5 rounded-xl border px-3 text-sm font-semibold"
                    >
                        {user.is_admin ? <ShieldOff className="size-4" /> : <ShieldCheck className="size-4" />}
                        {t(user.is_admin ? 'au.removeAdmin' : 'au.makeAdmin')}
                    </button>
                )}
                {creator?.status === 'suspended' && (
                    <button
                        type="button"
                        onClick={() => post('admin.creators.reinstate', creator.id)}
                        className="hover:bg-muted inline-flex h-10 items-center gap-1.5 rounded-xl border px-3 text-sm font-semibold"
                    >
                        <RotateCcw className="size-4" /> {t('au.reinstate')}
                    </button>
                )}
                {user.banned_at ? (
                    <button
                        type="button"
                        onClick={() => post('admin.users.unban', user.id)}
                        className="hover:bg-muted inline-flex h-10 items-center gap-1.5 rounded-xl border px-3 text-sm font-semibold"
                    >
                        <RotateCcw className="size-4" /> {t('au.unban')}
                    </button>
                ) : (
                    !user.is_admin && (
                        <button
                            type="button"
                            onClick={() => setBanning((b) => !b)}
                            className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-red-200 px-3 text-sm font-semibold text-red-600 hover:bg-red-50"
                        >
                            <Ban className="size-4" /> {t('au.ban')}
                        </button>
                    )
                )}
            </div>
            {banning && (
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        form.post(route('admin.users.ban', user.id), { preserveScroll: true, onSuccess: () => setBanning(false) });
                    }}
                    className="flex w-full gap-2 sm:w-96"
                >
                    <input
                        value={form.data.reason}
                        onChange={(e) => form.setData('reason', e.target.value)}
                        maxLength={300}
                        autoFocus
                        placeholder={t('au.banReason')}
                        className="border-input focus:border-primary h-10 flex-1 rounded-xl border px-3 text-sm outline-none"
                    />
                    <button
                        type="submit"
                        disabled={!form.data.reason.trim() || form.processing}
                        className="h-10 rounded-xl bg-red-600 px-4 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-40"
                    >
                        {t('au.ban')}
                    </button>
                </form>
            )}
            {(user.banned_at || !user.is_admin) && (
                <p className="text-muted-foreground text-xs sm:text-right">{user.banned_at ? t('au.unbanHint') : t('au.banHint')}</p>
            )}
        </div>
    );
}

function Payment({ p, other, otherHref }: { p: PaymentRow; other: string; otherHref?: string }) {
    const { t } = useT();
    const [open, setOpen] = useState(false);
    const form = useForm({ reason: '' });
    const [label, Icon] = PURPOSE[p.purpose];
    const refunded = p.status === 'refunded';

    return (
        <li className="px-4 py-3 text-sm">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className={`w-24 font-bold tabular-nums ${refunded ? 'text-muted-foreground line-through' : ''}`}>{mnt(p.amount)}</span>
                <span className="text-muted-foreground inline-flex items-center gap-1.5">
                    <Icon className="size-3.5" /> {t(label)}
                </span>
                {otherHref ? (
                    <Link href={otherHref} className="font-medium hover:underline">
                        {other}
                    </Link>
                ) : (
                    <span>{other}</span>
                )}
                <span className="text-muted-foreground flex-1 text-xs">{day(p.at)}</span>
                {refunded ? (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800" title={p.refund_reason ?? ''}>
                        {t('au.refunded')}
                    </span>
                ) : (
                    <button
                        type="button"
                        onClick={() => setOpen((o) => !o)}
                        className="text-muted-foreground hover:text-foreground text-xs font-semibold underline"
                    >
                        {t('au.refund')}
                    </button>
                )}
            </div>
            {refunded && p.refund_reason && <p className="text-muted-foreground mt-1 text-xs">{p.refund_reason}</p>}
            {open && !refunded && (
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        if (confirm(t('au.confirmRefund', { amount: mnt(p.amount) })))
                            form.post(route('admin.payments.refund', p.id), { preserveScroll: true, onSuccess: () => setOpen(false) });
                    }}
                    className="mt-2 flex flex-col gap-2"
                >
                    <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">{t('au.refundHint')}</p>
                    <div className="flex gap-2">
                        <input
                            value={form.data.reason}
                            onChange={(e) => form.setData('reason', e.target.value)}
                            maxLength={300}
                            autoFocus
                            placeholder={t('au.refundReason')}
                            className="border-input focus:border-primary h-10 flex-1 rounded-xl border px-3 text-sm outline-none"
                        />
                        <button
                            type="submit"
                            disabled={!form.data.reason.trim() || form.processing}
                            className="bg-foreground text-background h-10 rounded-xl px-4 text-sm font-bold disabled:opacity-40"
                        >
                            {t('au.refund')}
                        </button>
                    </div>
                </form>
            )}
        </li>
    );
}

function Report({ r }: { r: ReportRow }) {
    const { t } = useT();
    return (
        <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm">
            <span className="font-semibold">{t(`rp.${r.reason}` as TKey)}</span>
            <span className="bg-muted rounded px-1.5 text-xs">{r.type}</span>
            <span className="text-muted-foreground min-w-0 flex-1 truncate">{r.details}</span>
            <span className="text-muted-foreground text-xs">
                {r.reporter ?? '—'} · {day(r.at)}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${r.status === 'open' ? 'bg-primary/10 text-primary' : 'bg-muted'}`}>
                {t(`au.report.${r.status}` as TKey)}
            </span>
        </li>
    );
}

function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
    return (
        <div className="rounded-2xl border p-3">
            <p className="text-muted-foreground text-xs">{label}</p>
            <p className="text-lg font-bold tabular-nums">{value}</p>
            {sub && <p className="text-muted-foreground text-xs">{sub}</p>}
        </div>
    );
}

function Section({ title, empty, children }: { title: string; empty: boolean; children: ReactNode }) {
    const { t } = useT();
    return (
        <section>
            <h3 className="text-muted-foreground mb-2 px-1 text-xs font-semibold tracking-wider uppercase">{title}</h3>
            {empty ? (
                <p className="text-muted-foreground rounded-2xl border border-dashed p-6 text-center text-sm">{t('au.nothing')}</p>
            ) : (
                <ul className="divide-y rounded-2xl border">{children}</ul>
            )}
        </section>
    );
}
