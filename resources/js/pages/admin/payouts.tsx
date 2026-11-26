import AdminLayout from '@/layouts/admin-layout';
import { mnt } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { Link, useForm } from '@inertiajs/react';
import { AlertTriangle, Check, Copy, Landmark, X } from 'lucide-react';
import { useState } from 'react';

type Row = {
    id: number;
    amount: number;
    status: 'requested' | 'paid' | 'rejected';
    creator: { handle: string; display_name: string };
    bank: { name: string; account: string; holder: string };
    reference: string | null;
    available: number | null;
    requested_at: string;
    processed_at: string | null;
};

const day = (iso: string) => iso.slice(0, 16).replace('T', ' ').replaceAll('-', '.');

/** Admin payout queue: transfer the money from the bank, then mark it paid with the reference (or reject with a reason). */
export default function AdminPayouts({ open, done }: { open: Row[]; done: Row[] }) {
    const { t } = useT();

    return (
        <AdminLayout title={t('nav.payouts')} subtitle={t('ap.sub')}>
            <div className="flex flex-col gap-6">
                {open.length === 0 ? (
                    <p className="text-muted-foreground bg-card rounded-2xl p-10 text-center text-sm shadow-xs">{t('ap.empty')}</p>
                ) : (
                    open.map((p) => <Request key={p.id} p={p} />)
                )}

                {done.length > 0 && (
                    <section>
                        <h2 className="text-muted-foreground mb-2 px-1 text-xs font-semibold tracking-wider uppercase">{t('ap.history')}</h2>
                        <ul className="bg-card rounded-2xl text-sm shadow-xs">
                            {done.map((p) => (
                                <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                                    <span className="w-28 font-bold tabular-nums">{mnt(p.amount)}</span>
                                    <Link href={route('creator.show', p.creator.handle)} className="font-medium hover:underline">
                                        @{p.creator.handle}
                                    </Link>
                                    <span className="text-muted-foreground min-w-0 flex-1 truncate">{p.reference}</span>
                                    <span className="text-muted-foreground text-xs">{p.processed_at && day(p.processed_at)}</span>
                                    <span
                                        className={`rounded-full px-2 py-0.5 text-xs font-bold ${p.status === 'paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}
                                    >
                                        {t(p.status === 'paid' ? 'ea.statusPaid' : 'ea.statusRejected')}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </section>
                )}
            </div>
        </AdminLayout>
    );
}

function Request({ p }: { p: Row }) {
    const { t } = useT();
    const form = useForm({ decision: 'paid' as 'paid' | 'rejected', reference: '' });
    const [copied, setCopied] = useState(false);
    const short = p.available !== null && p.available < p.amount;

    const decide = (decision: 'paid' | 'rejected') => {
        form.transform((d) => ({ ...d, decision }));
        form.post(route('admin.payouts.decide', p.id), { preserveScroll: true });
    };

    return (
        <article className="bg-card rounded-2xl p-4 shadow-xs">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <p className="text-2xl font-extrabold tabular-nums">{mnt(p.amount)}</p>
                    <p className="text-sm">
                        <Link href={route('creator.show', p.creator.handle)} className="font-semibold hover:underline">
                            {p.creator.display_name} (@{p.creator.handle})
                        </Link>
                        <span className="text-muted-foreground"> · {day(p.requested_at)}</span>
                    </p>
                </div>
                <div className="bg-muted rounded-xl px-3 py-2 text-sm">
                    <p className="flex items-center gap-1.5 font-semibold">
                        <Landmark className="size-4" /> {p.bank.name}
                    </p>
                    <p className="flex items-center gap-2 font-mono">
                        {p.bank.account}
                        <button
                            type="button"
                            onClick={() => {
                                navigator.clipboard?.writeText(p.bank.account);
                                setCopied(true);
                            }}
                            className="text-muted-foreground hover:text-foreground"
                            aria-label="Copy"
                        >
                            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                        </button>
                    </p>
                    <p className="text-muted-foreground">{p.bank.holder}</p>
                </div>
            </div>
            {short && (
                <p className="mt-3 flex items-center gap-2 rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">
                    <AlertTriangle className="size-4" /> {t('ap.short', { available: mnt(p.available ?? 0) })}
                </p>
            )}
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <input
                    value={form.data.reference}
                    onChange={(e) => form.setData('reference', e.target.value)}
                    maxLength={120}
                    placeholder={t('ap.reference')}
                    className="bg-muted h-11 flex-1 rounded-xl px-3 text-sm outline-none"
                />
                <button
                    type="button"
                    disabled={!form.data.reference.trim() || form.processing}
                    onClick={() => decide('paid')}
                    className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-40"
                >
                    <Check className="size-4" /> {t('ap.markPaid')}
                </button>
                <button
                    type="button"
                    disabled={!form.data.reference.trim() || form.processing}
                    onClick={() => decide('rejected')}
                    className="bg-muted inline-flex h-11 items-center justify-center gap-1.5 rounded-xl px-4 text-sm font-bold text-red-600 hover:bg-red-50 disabled:opacity-40"
                >
                    <X className="size-4" /> {t('ap.reject')}
                </button>
            </div>
        </article>
    );
}
