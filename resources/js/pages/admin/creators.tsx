import { Button } from '@/components/ui/button';
import AdminLayout from '@/layouts/admin-layout';
import { useT } from '@/lib/i18n';
import { useForm } from '@inertiajs/react';
import { AlertTriangle, Check, X } from 'lucide-react';

type Applicant = {
    id: number;
    handle: string;
    display_name: string;
    bio: string | null;
    price_monthly: number;
    adult_content: boolean;
    status: 'pending' | 'approved' | 'rejected';
    review_note: string | null;
    legal_name: string;
    register_number: string;
    born: string | null;
    bank_name: string;
    bank_account: string;
    account_holder: string;
    consented_at: string;
    submitted_at: string;
    user: { id: number; name: string; phone: string | null; birthdate: string | null; joined: string };
    shared_account: string[];
};

const mnt = (n: number) => '₮' + n.toLocaleString('en-US');
const day = (iso: string) => iso.slice(0, 10).replaceAll('-', '.');

export default function CreatorReview({ pending, recent }: { pending: Applicant[]; recent: Applicant[] }) {
    const { t } = useT();

    return (
        <AdminLayout title={t('nav.admin')} subtitle={t('ad.sub')}>
            <div>
                <h2 className="mt-2 mb-3 font-bold">
                    {t('ad.pending')} <span className="text-muted-foreground">({pending.length})</span>
                </h2>
                {pending.length === 0 ? (
                    <p className="text-muted-foreground bg-card rounded-lg p-8 text-center text-sm shadow-xs">{t('ad.none')}</p>
                ) : (
                    <div className="flex flex-col gap-6">
                        {pending.map((a) => (
                            <ApplicantCard key={a.id} a={a} />
                        ))}
                    </div>
                )}

                {recent.length > 0 && (
                    <>
                        <h2 className="mt-10 mb-3 font-medium">{t('ad.recent')}</h2>
                        <ul className="bg-card rounded-lg shadow-xs">
                            {recent.map((a) => (
                                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                                    <span>
                                        <b className="font-medium">@{a.handle}</b> · {a.legal_name}
                                    </span>
                                    <span className={a.status === 'approved' ? 'text-emerald-700' : 'text-rose-700'}>
                                        {a.status === 'approved' ? t('ad.approved') : t('ad.rejected')}
                                        {a.review_note && <span className="text-muted-foreground"> · {a.review_note}</span>}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </>
                )}
            </div>
        </AdminLayout>
    );
}

function ApplicantCard({ a }: { a: Applicant }) {
    const { t } = useT();
    const form = useForm({ decision: 'approved', note: '' });
    const dobMismatch = a.born && a.user.birthdate && a.born !== a.user.birthdate;

    const decide = (decision: 'approved' | 'rejected') => {
        form.transform((d) => ({ ...d, decision }));
        form.post(route('admin.creators.decide', a.id), { preserveScroll: true });
    };

    return (
        <article className="bg-card rounded-xl p-5 shadow-xs">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                    <h3 className="text-lg font-semibold">
                        {a.display_name} <span className="text-muted-foreground font-normal">@{a.handle}</span>
                    </h3>
                    <p className="text-muted-foreground text-sm">
                        {t('ad.price', { price: mnt(a.price_monthly) })}
                        {a.adult_content && <span className="ml-2 rounded bg-rose-100 px-1.5 py-0.5 text-xs font-semibold text-rose-700">18+</span>}
                    </p>
                </div>
                <span className="text-muted-foreground text-xs">{day(a.submitted_at)}</span>
            </div>
            {a.bio && <p className="mt-2 text-sm">{a.bio}</p>}

            {/* ID front / back / selfie, from private storage */}
            <div className="mt-4 grid grid-cols-3 gap-3">
                {(['front', 'back', 'selfie'] as const).map((k) => (
                    <a
                        key={k}
                        href={route('admin.creators.document', [a.id, k])}
                        target="_blank"
                        className="bg-muted block overflow-hidden rounded-lg"
                    >
                        <img src={route('admin.creators.document', [a.id, k])} alt={k} className="aspect-[4/3] w-full object-cover" />
                    </a>
                ))}
            </div>

            <dl className="mt-4 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
                <Row k={t('cr.legalName')} v={a.legal_name} />
                <Row k={t('cr.register')} v={a.register_number} mono />
                <Row k={t('ad.born')} v={a.born ? day(a.born) : '—'} />
                <Row k={t('ad.signupDob')} v={a.user.birthdate ? day(a.user.birthdate) : '—'} />
                <Row k={t('cr.bank')} v={a.bank_name} />
                <Row k={t('cr.account')} v={a.bank_account} mono />
                <Row k={t('cr.holder')} v={a.account_holder} />
                <Row k={t('ad.phone')} v={a.user.phone ?? '—'} mono />
            </dl>

            {(dobMismatch || a.shared_account.length > 0) && (
                <ul className="mt-4 space-y-1.5">
                    {dobMismatch && <Warn>{`${t('ad.born')} ≠ ${t('ad.signupDob')}`}</Warn>}
                    {a.shared_account.length > 0 && (
                        <Warn>{t('ad.sharedAccount', { handles: a.shared_account.map((h) => '@' + h).join(', ') })}</Warn>
                    )}
                </ul>
            )}

            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <input
                    className="bg-muted h-9 flex-1 rounded-lg px-3 text-sm outline-none"
                    placeholder={t('ad.notePh')}
                    value={form.data.note}
                    maxLength={500}
                    onChange={(e) => form.setData('note', e.target.value)}
                />
                <div className="flex gap-2">
                    <Button type="button" disabled={form.processing} onClick={() => decide('approved')}>
                        <Check className="size-4" /> {t('ad.approve')}
                    </Button>
                    <Button
                        type="button"
                        variant="destructive"
                        disabled={form.processing || !form.data.note.trim()}
                        onClick={() => decide('rejected')}
                    >
                        <X className="size-4" /> {t('ad.reject')}
                    </Button>
                </div>
            </div>
        </article>
    );
}

function Row({ k, v, mono = false }: { k: string; v: string; mono?: boolean }) {
    return (
        <div className="flex justify-between gap-3 py-1">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className={mono ? 'font-mono' : ''}>{v}</dd>
        </div>
    );
}

function Warn({ children }: { children: string }) {
    return (
        <li className="flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <AlertTriangle className="size-4 shrink-0 text-amber-600" /> {children}
        </li>
    );
}
