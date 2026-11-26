import AdminLayout from '@/layouts/admin-layout';
import { timeAgo } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { Link, router } from '@inertiajs/react';
import { CircleCheck, CircleX, ScrollText } from 'lucide-react';

type Action = {
    id: number;
    action: string;
    admin: { id: number; name: string } | null;
    subject: { type: string; id: string } | null;
    data: Record<string, string | number | boolean | null> | null;
    ok: boolean;
    ip: string | null;
    at: string;
};
/** Laravel's pager labels come HTML-escaped ("&laquo; Previous"). */
const label = (s: string) => s.replace('&laquo;', '«').replace('&raquo;', '»');

type Page<T> = { data: T[]; links: { url: string | null; label: string; active: boolean }[]; total: number };

/** Who did what in the admin area, newest first. Filter by admin or by kind of action. */
export default function Audit({
    actions,
    admins,
    kinds,
    filters,
}: {
    actions: Page<Action>;
    admins: { id: number; name: string }[];
    kinds: string[];
    filters: { admin?: number; action?: string };
}) {
    const { t } = useT();
    const set = (next: Record<string, string | number | undefined>) =>
        router.get(route('admin.audit'), { ...filters, ...next }, { preserveState: true, preserveScroll: true, replace: true });
    const select = 'bg-card h-10 rounded-xl px-3 text-sm font-semibold shadow-xs outline-none';

    return (
        <AdminLayout title={t('aud.title')} subtitle={t('aud.sub')}>
            <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center gap-2">
                    <select className={select} value={filters.admin ?? ''} onChange={(e) => set({ admin: e.target.value || undefined })}>
                        <option value="">{t('aud.allAdmins')}</option>
                        {admins.map((a) => (
                            <option key={a.id} value={a.id}>
                                {a.name}
                            </option>
                        ))}
                    </select>
                    <select className={select} value={filters.action ?? ''} onChange={(e) => set({ action: e.target.value || undefined })}>
                        <option value="">{t('aud.allActions')}</option>
                        {kinds.map((k) => (
                            <option key={k} value={k}>
                                {k}
                            </option>
                        ))}
                    </select>
                    <span className="text-muted-foreground ml-auto text-sm">{t('aud.count', { n: actions.total })}</span>
                </div>

                {actions.data.length === 0 ? (
                    <div className="bg-card text-muted-foreground flex flex-col items-center gap-3 rounded-2xl p-12 text-center text-sm shadow-xs">
                        <ScrollText className="size-8 opacity-50" /> {t('aud.empty')}
                    </div>
                ) : (
                    <div className="bg-card overflow-x-auto rounded-2xl shadow-xs">
                        <table className="w-full min-w-[720px] text-sm">
                            <thead>
                                <tr className="text-muted-foreground text-left text-xs">
                                    <th className="px-4 py-3 font-semibold">{t('aud.when')}</th>
                                    <th className="px-4 py-3 font-semibold">{t('aud.admin')}</th>
                                    <th className="px-4 py-3 font-semibold">{t('aud.action')}</th>
                                    <th className="px-4 py-3 font-semibold">{t('aud.subject')}</th>
                                    <th className="px-4 py-3 font-semibold">{t('aud.details')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {actions.data.map((a) => (
                                    <tr key={a.id} className="hover:bg-muted/40 align-top transition">
                                        <td className="px-4 py-3 whitespace-nowrap" title={a.at}>
                                            <span className="block font-medium">{timeAgo(a.at, t)}</span>
                                            <span className="text-muted-foreground text-xs">{a.ip}</span>
                                        </td>
                                        <td className="px-4 py-3 font-semibold whitespace-nowrap">
                                            {a.admin ? <Link href={route('admin.users.show', a.admin.id)}>{a.admin.name}</Link> : '—'}
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            <span className="inline-flex items-center gap-1.5">
                                                {a.ok ? (
                                                    <CircleCheck className="size-4 text-emerald-500" aria-label="ok" />
                                                ) : (
                                                    <CircleX className="size-4 text-red-500" aria-label={t('aud.failed')} />
                                                )}
                                                <code className="bg-muted rounded px-1.5 py-0.5 text-xs">{a.action}</code>
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            {a.subject ? (
                                                a.subject.type === 'User' ? (
                                                    <Link
                                                        href={route('admin.users.show', Number(a.subject.id))}
                                                        className="text-primary font-semibold"
                                                    >
                                                        User #{a.subject.id}
                                                    </Link>
                                                ) : (
                                                    <span>
                                                        {a.subject.type} #{a.subject.id.slice(-8)}
                                                    </span>
                                                )
                                            ) : (
                                                '—'
                                            )}
                                        </td>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {a.data
                                                ? Object.entries(a.data).map(([k, v]) => (
                                                      <span key={k} className="mr-3 inline-block">
                                                          <span className="font-semibold">{k}:</span> {String(v)}
                                                      </span>
                                                  ))
                                                : '—'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {actions.links.length > 3 && (
                    <nav className="flex flex-wrap justify-center gap-1">
                        {actions.links.map((l, i) =>
                            l.url ? (
                                <Link
                                    key={i}
                                    href={l.url}
                                    preserveScroll
                                    className={`grid h-9 min-w-9 place-items-center rounded-lg px-3 text-sm font-semibold ${l.active ? 'bg-primary text-white' : 'bg-card hover:bg-muted shadow-xs'}`}
                                >
                                    {label(l.label)}
                                </Link>
                            ) : (
                                <span key={i} className="text-muted-foreground grid h-9 min-w-9 place-items-center px-3 text-sm">
                                    {label(l.label)}
                                </span>
                            ),
                        )}
                    </nav>
                )}
            </div>
        </AdminLayout>
    );
}
