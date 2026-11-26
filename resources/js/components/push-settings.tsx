import { useT } from '@/lib/i18n';
import { disablePush, enablePush, installStore, promptInstall, pushStatus, type PushStatus } from '@/lib/push';
import { toast } from '@/lib/toast';
import { type SharedData } from '@/types';
import { usePage } from '@inertiajs/react';
import { BellRing, Download, LoaderCircle, Share, X } from 'lucide-react';
import { useEffect, useState, useSyncExternalStore } from 'react';

function usePush() {
    const { pushKey } = usePage<SharedData>().props;
    const [status, setStatus] = useState<PushStatus | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        pushStatus().then(setStatus, () => setStatus('unsupported'));
    }, []);

    async function toggle(t: (k: 'set.pushFailed') => string) {
        if (!pushKey || busy) return;
        setBusy(true);
        try {
            setStatus(status === 'on' ? await disablePush() : await enablePush(pushKey));
        } catch {
            toast(t('set.pushFailed'), { tone: 'error' });
        } finally {
            setBusy(false);
        }
    }

    return { pushKey, status, busy, toggle };
}

/** Settings row: push notifications on this device, or why they can't be turned on. */
export function PushRow() {
    const { t } = useT();
    const { pushKey, status, busy, toggle } = usePush();
    if (!pushKey || status === null) return null;

    const note =
        status === 'install-first'
            ? t('set.pushIos')
            : status === 'denied'
              ? t('set.pushDenied')
              : status === 'unsupported'
                ? t('set.pushUnsupported')
                : t('set.pushHint');
    const canToggle = status === 'on' || status === 'off';

    return (
        <div className="flex items-center gap-3 px-4 py-3.5">
            <BellRing className="text-muted-foreground size-5 shrink-0" />
            <span className="min-w-0 flex-1">
                <span className="block font-medium">{t('set.push')}</span>
                <span className="text-muted-foreground block text-sm leading-snug">{note}</span>
            </span>
            {canToggle && (
                <button
                    type="button"
                    role="switch"
                    aria-checked={status === 'on'}
                    aria-label={t('set.push')}
                    disabled={busy}
                    onClick={() => toggle(t)}
                    className={`relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-60 ${status === 'on' ? 'bg-primary' : 'bg-muted-foreground/30'}`}
                >
                    <span
                        className={`bg-background absolute top-1 left-1 grid size-5 place-items-center rounded-full shadow transition-transform ${status === 'on' ? 'translate-x-5' : ''}`}
                    >
                        {busy && <LoaderCircle className="size-3 animate-spin" />}
                    </span>
                </button>
            )}
        </div>
    );
}

/** Settings row: install the app (Chrome/Edge/Android dialog, or the iPhone Share-menu hint). */
export function InstallRow() {
    const { t } = useT();
    const mode = useSyncExternalStore(installStore.subscribe, installStore.snapshot, () => 'none' as const);
    if (mode === 'none') return null;

    return (
        <div className="flex items-center gap-3 px-4 py-3.5">
            <Download className="text-muted-foreground size-5 shrink-0" />
            <span className="min-w-0 flex-1">
                <span className="block font-medium">{t('set.install')}</span>
                <span className="text-muted-foreground block text-sm leading-snug">
                    {mode === 'ios' ? (
                        <>
                            {t('set.installIos')} <Share className="inline size-3.5 align-[-2px]" />
                        </>
                    ) : (
                        t('set.installHint')
                    )}
                </span>
            </span>
            {mode === 'prompt' && (
                <button
                    type="button"
                    onClick={() => promptInstall()}
                    className="bg-primary text-primary-foreground h-9 shrink-0 rounded-full px-4 text-sm font-bold transition hover:brightness-110"
                >
                    {t('set.installBtn')}
                </button>
            )}
        </div>
    );
}

const NUDGE_KEY = 'push-nudge-dismissed';

/** On the notifications page: offer to get them on this phone too, once, until turned on or dismissed. */
export function PushNudge() {
    const { t } = useT();
    const { pushKey, status, busy, toggle } = usePush();
    const [dismissed, setDismissed] = useState(() => {
        try {
            return localStorage.getItem(NUDGE_KEY) === '1';
        } catch {
            return false;
        }
    });
    if (!pushKey || status !== 'off' || dismissed) return null;

    function dismiss() {
        setDismissed(true);
        try {
            localStorage.setItem(NUDGE_KEY, '1');
        } catch {
            /* private mode: it just shows again next time */
        }
    }

    return (
        <div className="bg-primary/10 mx-4 mt-3 flex items-center gap-3 rounded-2xl p-3 pl-4">
            <BellRing className="text-primary size-5 shrink-0" />
            <p className="min-w-0 flex-1 text-sm leading-snug font-medium">{t('set.pushNudge')}</p>
            <button
                type="button"
                onClick={() => toggle(t)}
                disabled={busy}
                className="bg-primary text-primary-foreground inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-bold transition hover:brightness-110 disabled:opacity-60"
            >
                {busy && <LoaderCircle className="size-4 animate-spin" />}
                {t('set.pushTurnOn')}
            </button>
            <button
                type="button"
                onClick={dismiss}
                className="text-muted-foreground hover:bg-muted grid size-8 shrink-0 place-items-center rounded-full"
                aria-label={t('po.close')}
            >
                <X className="size-4" />
            </button>
        </div>
    );
}
