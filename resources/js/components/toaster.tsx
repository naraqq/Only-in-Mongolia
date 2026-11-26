import { dismiss, toastStore, type Toast } from '@/lib/toast';
import { CircleAlert, CircleCheck, Info, Lock, X } from 'lucide-react';
import { useSyncExternalStore } from 'react';

const ICONS = { lock: Lock, check: CircleCheck, alert: CircleAlert, info: Info };
const TONE: Record<Toast['tone'], string> = {
    info: 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900',
    success: 'bg-emerald-600 text-white',
    error: 'bg-red-600 text-white',
};

/** Shows toasts at the bottom of the screen (above the phone tab bar), newest at the bottom. */
export default function Toaster() {
    const items = useSyncExternalStore(toastStore.subscribe, toastStore.snapshot, toastStore.snapshot);

    return (
        <div
            className="pointer-events-none fixed inset-x-0 bottom-20 z-[100] flex flex-col items-center gap-2 px-4 md:bottom-6"
            role="status"
            aria-live="polite"
        >
            {items.map((x) => {
                const Icon = ICONS[x.icon ?? (x.tone === 'success' ? 'check' : x.tone === 'error' ? 'alert' : 'info')];
                return (
                    <div
                        key={x.id}
                        className={`animate-toast-in pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl py-3 pr-2 pl-4 shadow-xl ${TONE[x.tone]}`}
                    >
                        <Icon className="size-5 shrink-0 opacity-90" />
                        <p className="min-w-0 flex-1 text-sm leading-snug font-medium">{x.message}</p>
                        {x.action && (
                            <button
                                type="button"
                                onClick={() => {
                                    x.action!.onClick();
                                    dismiss(x.id);
                                }}
                                className="bg-primary text-primary-foreground shrink-0 rounded-full px-3.5 py-1.5 text-sm font-bold transition hover:brightness-110"
                            >
                                {x.action.label}
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={() => dismiss(x.id)}
                            className="grid size-7 shrink-0 place-items-center rounded-full opacity-70 transition hover:opacity-100"
                            aria-label="Close"
                        >
                            <X className="size-4" />
                        </button>
                    </div>
                );
            })}
        </div>
    );
}
