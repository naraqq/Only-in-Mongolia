import AdminLayout from '@/layouts/admin-layout';
import { useT, type TKey } from '@/lib/i18n';
import { ask } from '@/lib/confirm';
import { Link, router, useForm } from '@inertiajs/react';
import { AlertTriangle, Ban, Check, ExternalLink, Image as ImageIcon, Trash2, X } from 'lucide-react';

type Row = {
    id: number;
    reason: string;
    urgent: boolean;
    details: string | null;
    type: 'post' | 'comment' | 'creator' | 'message' | 'url' | null;
    exists: boolean;
    preview: { text: string | null; media?: number; url?: string };
    creator: { handle: string; status: string } | null;
    reporter: string | null;
    contact_email: string | null;
    status: 'open' | 'actioned' | 'dismissed';
    resolution: string | null;
    created_at: string;
};

const when = (iso: string) => iso.slice(0, 16).replace('T', ' ').replaceAll('-', '.');

/** Moderation queue: urgent reports first. Remove the content, suspend the creator, or dismiss. */
export default function AdminReports({
    open,
    done,
    suspended,
}: {
    open: Row[];
    done: Row[];
    suspended: { id: number; handle: string; display_name: string }[];
}) {
    const { t } = useT();

    return (
        <AdminLayout title={t('nav.reports')}>
            <div className="flex flex-col gap-6">
                {open.length === 0 ? (
                    <p className="text-muted-foreground bg-card rounded-2xl p-10 text-center text-sm shadow-xs">{t('ar.empty')}</p>
                ) : (
                    open.map((r) => <Report key={r.id} r={r} />)
                )}

                {suspended.length > 0 && (
                    <section>
                        <h2 className="text-muted-foreground mb-2 px-1 text-xs font-semibold tracking-wider uppercase">{t('ar.suspended')}</h2>
                        <ul className="bg-card rounded-2xl text-sm shadow-xs">
                            {suspended.map((c) => (
                                <li key={c.id} className="flex items-center justify-between px-4 py-3">
                                    <span className="font-medium">
                                        {c.display_name} (@{c.handle})
                                    </span>
                                    <button
                                        type="button"
                                        onClick={async () =>
                                            (await ask({ message: t('ar.confirmReinstate'), confirm: t('ar.reinstate'), cancel: t('dlg.cancel') })) &&
                                            router.post(route('admin.creators.reinstate', c.id), {}, { preserveScroll: true })
                                        }
                                        className="bg-muted rounded-full px-3 py-1 text-xs font-bold hover:bg-emerald-50"
                                    >
                                        {t('ar.reinstate')}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </section>
                )}

                {done.length > 0 && (
                    <section>
                        <h2 className="text-muted-foreground mb-2 px-1 text-xs font-semibold tracking-wider uppercase">{t('ap.history')}</h2>
                        <ul className="bg-card rounded-2xl text-sm shadow-xs">
                            {done.map((r) => (
                                <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
                                    <span className="font-semibold">{t(`rp.${r.reason}` as TKey)}</span>
                                    <span className="text-muted-foreground min-w-0 flex-1 truncate">{r.preview.text}</span>
                                    <span className="text-muted-foreground text-xs">{r.resolution}</span>
                                </li>
                            ))}
                        </ul>
                    </section>
                )}
            </div>
        </AdminLayout>
    );
}

function Report({ r }: { r: Row }) {
    const { t } = useT();
    const form = useForm({ action: 'dismiss' as 'dismiss' | 'remove' | 'suspend', note: '' });
    const act = async (action: 'dismiss' | 'remove' | 'suspend') => {
        if (
            action !== 'dismiss' &&
            !(await ask({
                message: t(action === 'remove' ? 'ar.confirmRemove' : 'ar.confirmSuspend'),
                confirm: t(action === 'remove' ? 'ar.remove' : 'ar.suspend'),
                cancel: t('dlg.cancel'),
                danger: true,
            }))
        )
            return;
        form.transform((d) => ({ ...d, action }));
        form.post(route('admin.reports.act', r.id), { preserveScroll: true });
    };

    return (
        <article className={`rounded-2xl p-4 shadow-xs ${r.urgent ? 'bg-red-50 dark:bg-red-950/40' : 'bg-card'}`}>
            <div className="flex flex-wrap items-center gap-2">
                {r.urgent && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold text-white">
                        <AlertTriangle className="size-3" /> {t('ar.urgent')}
                    </span>
                )}
                <span className="font-bold">{t(`rp.${r.reason}` as TKey)}</span>
                <span className="text-muted-foreground text-sm">
                    · {r.type ? t(`ar.type.${r.type}` as TKey) : ''} · {when(r.created_at)}
                </span>
                {r.creator && (
                    <Link href={route('creator.show', r.creator.handle)} className="text-primary ml-auto text-sm font-semibold hover:underline">
                        @{r.creator.handle} {r.creator.status === 'suspended' && `(${t('ar.suspendedOne')})`}
                    </Link>
                )}
            </div>

            <div className="bg-muted mt-3 rounded-xl p-3 text-sm">
                {r.exists || r.type === 'url' ? (
                    <>
                        <p className="break-words whitespace-pre-line">{r.preview.text || '—'}</p>
                        {!!r.preview.media && (
                            <p className="text-muted-foreground mt-1 inline-flex items-center gap-1 text-xs">
                                <ImageIcon className="size-3.5" /> {r.preview.media}
                            </p>
                        )}
                        {r.preview.url && (
                            <a
                                href={r.preview.url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-primary mt-1 flex items-center gap-1 text-xs font-semibold"
                            >
                                <ExternalLink className="size-3.5" /> {t('ar.open')}
                            </a>
                        )}
                    </>
                ) : (
                    <p className="text-muted-foreground italic">{t('ar.gone')}</p>
                )}
            </div>
            {r.details && <p className="mt-2 text-sm">“{r.details}”</p>}
            <p className="text-muted-foreground mt-1 text-xs">
                {t('ar.by', { name: r.reporter ?? '—' })}
                {r.contact_email && ` · ${r.contact_email}`}
            </p>

            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <input
                    value={form.data.note}
                    onChange={(e) => form.setData('note', e.target.value)}
                    maxLength={300}
                    placeholder={t('ar.note')}
                    className="bg-card h-10 flex-1 rounded-xl px-3 text-sm outline-none"
                />
                <div className="flex gap-2">
                    {r.exists && (
                        <button
                            type="button"
                            onClick={() => act('remove')}
                            disabled={form.processing}
                            className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-red-600 px-3 text-sm font-bold text-white hover:bg-red-700"
                        >
                            <Trash2 className="size-4" /> {t('ar.remove')}
                        </button>
                    )}
                    {r.creator && r.creator.status !== 'suspended' && (
                        <button
                            type="button"
                            onClick={() => act('suspend')}
                            disabled={form.processing}
                            className="bg-muted inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-bold text-red-700 hover:bg-red-50"
                        >
                            <Ban className="size-4" /> {t('ar.suspend')}
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={() => act('dismiss')}
                        disabled={form.processing}
                        className="hover:bg-muted bg-muted inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-bold"
                    >
                        {r.exists ? <X className="size-4" /> : <Check className="size-4" />} {t('ar.dismiss')}
                    </button>
                </div>
            </div>
        </article>
    );
}
