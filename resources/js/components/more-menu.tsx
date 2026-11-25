import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { sendJson } from '@/lib/http';
import { useT, type TKey } from '@/lib/i18n';
import { type SharedData } from '@/types';
import { router, usePage } from '@inertiajs/react';
import { Ban, CircleCheck, Flag, LoaderCircle, MoreHorizontal } from 'lucide-react';
import { useState, type FormEvent } from 'react';

type Target = { type: 'post' | 'comment' | 'creator' | 'message'; id: number };

const REASONS: [string, TKey][] = [
    ['minor', 'rp.minor'],
    ['nonconsensual', 'rp.nonconsensual'],
    ['illegal', 'rp.illegal'],
    ['harassment', 'rp.harassment'],
    ['spam', 'rp.spam'],
    ['copyright', 'rp.copyright'],
    ['other', 'rp.other'],
];

/**
 * "⋯" with Report (if `report` is given) and Block/Unblock (if `blockUserId` is given). Signed-in users only.
 * Blocking reloads the page so everything reflects it.
 */
export default function MoreMenu({
    report,
    blockUserId,
    blocked = false,
    className = '',
}: {
    report?: Target;
    blockUserId?: number;
    blocked?: boolean;
    className?: string;
}) {
    const { t } = useT();
    const { auth } = usePage<SharedData>().props;
    const [reporting, setReporting] = useState(false);
    if (!auth.user || (!report && !blockUserId)) return null;

    async function toggleBlock() {
        if (!blocked && !confirm(t('bl.confirm'))) return;
        await sendJson('POST', route('users.block', blockUserId));
        router.reload();
    }

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <button
                        type="button"
                        className={`text-muted-foreground hover:bg-muted grid size-8 place-items-center rounded-full ${className}`}
                        aria-label={t('rp.more')}
                    >
                        <MoreHorizontal className="size-5" />
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                    {report && (
                        <DropdownMenuItem onSelect={() => setReporting(true)}>
                            <Flag className="mr-2 size-4" /> {t('rp.report')}
                        </DropdownMenuItem>
                    )}
                    {blockUserId && (
                        <DropdownMenuItem onSelect={toggleBlock} className="text-red-600 focus:text-red-600">
                            <Ban className="mr-2 size-4" /> {t(blocked ? 'bl.unblock' : 'bl.block')}
                        </DropdownMenuItem>
                    )}
                </DropdownMenuContent>
            </DropdownMenu>
            {report && <ReportDialog target={report} open={reporting} onOpenChange={setReporting} />}
        </>
    );
}

function ReportDialog({ target, open, onOpenChange }: { target: Target; open: boolean; onOpenChange: (o: boolean) => void }) {
    const { t } = useT();
    const [reason, setReason] = useState('');
    const [details, setDetails] = useState('');
    const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');

    async function submit(e: FormEvent) {
        e.preventDefault();
        setState('busy');
        try {
            await sendJson('POST', route('reports.store'), { ...target, reason, details });
            setState('done');
        } catch {
            setState('error');
        }
    }

    return (
        <Dialog
            open={open}
            onOpenChange={(o) => {
                onOpenChange(o);
                if (!o) setTimeout(() => setState('idle'), 200);
            }}
        >
            <DialogContent className="rounded-3xl sm:max-w-md">
                {state === 'done' ? (
                    <div className="flex flex-col items-center gap-3 py-4 text-center">
                        <CircleCheck className="size-12 text-emerald-600" />
                        <DialogTitle className="text-xl font-extrabold">{t('rp.thanks')}</DialogTitle>
                        <DialogDescription>{t('rp.thanksSub')}</DialogDescription>
                    </div>
                ) : (
                    <form onSubmit={submit} className="flex flex-col gap-4">
                        <div>
                            <DialogTitle className="text-xl font-extrabold">{t('rp.title')}</DialogTitle>
                            <DialogDescription className="mt-1">{t('rp.sub')}</DialogDescription>
                        </div>
                        <div className="flex flex-col gap-1.5">
                            {REASONS.map(([value, label]) => (
                                <label
                                    key={value}
                                    className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition ${reason === value ? 'border-primary bg-primary/5' : 'hover:bg-muted'}`}
                                >
                                    <input
                                        type="radio"
                                        name="reason"
                                        value={value}
                                        checked={reason === value}
                                        onChange={() => setReason(value)}
                                        className="accent-primary"
                                    />
                                    {t(label)}
                                </label>
                            ))}
                        </div>
                        <textarea
                            value={details}
                            onChange={(e) => setDetails(e.target.value)}
                            maxLength={1000}
                            rows={2}
                            placeholder={t('rp.details')}
                            className="border-input focus:border-primary resize-none rounded-xl border px-3 py-2 text-sm outline-none"
                        />
                        {state === 'error' && <p className="text-sm text-red-600">{t('cm.error')}</p>}
                        <button
                            type="submit"
                            disabled={!reason || state === 'busy'}
                            className="flex h-12 items-center justify-center gap-2 rounded-xl bg-red-600 font-bold text-white transition hover:bg-red-700 disabled:opacity-40"
                        >
                            {state === 'busy' && <LoaderCircle className="size-4 animate-spin" />} {t('rp.send')}
                        </button>
                    </form>
                )}
            </DialogContent>
        </Dialog>
    );
}
