import { answer, confirmStore, type Ask } from '@/lib/confirm';
import * as Dialog from '@radix-ui/react-dialog';
import { TriangleAlert } from 'lucide-react';
import { useEffect, useState, useSyncExternalStore } from 'react';

/** Shows the question from ask(): a small card in the middle (a sheet at the bottom on phones). Esc or a tap outside cancels. */
export default function ConfirmHost() {
    const current = useSyncExternalStore(confirmStore.subscribe, confirmStore.snapshot, confirmStore.snapshot);
    // Keep the last question on screen while the dialog fades out.
    const [shown, setShown] = useState<Ask | null>(current);
    useEffect(() => {
        if (current) setShown(current);
    }, [current]);

    return (
        <Dialog.Root open={!!current} onOpenChange={(open) => !open && answer(false)}>
            <Dialog.Portal>
                <Dialog.Overlay className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-[110] bg-black/50" />
                <Dialog.Content
                    onOpenAutoFocus={(e) => {
                        // Focus "confirm" for harmless questions, "cancel" for destructive ones.
                        e.preventDefault();
                        (e.currentTarget as HTMLElement).querySelector<HTMLElement>('[data-autofocus]')?.focus();
                    }}
                    className="bg-card data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-bottom-4 sm:data-[state=open]:zoom-in-95 sm:data-[state=open]:slide-in-from-bottom-0 fixed inset-x-0 bottom-0 z-[110] mx-auto w-full max-w-sm rounded-t-3xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl duration-200 sm:inset-x-4 sm:top-1/2 sm:bottom-auto sm:-translate-y-1/2 sm:rounded-3xl"
                >
                    {shown && (
                        <>
                            <div className="flex gap-3">
                                {shown.danger && (
                                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-red-50 text-red-600 dark:bg-red-950/50">
                                        <TriangleAlert className="size-5" />
                                    </span>
                                )}
                                <div className="min-w-0 pt-0.5">
                                    <Dialog.Title className={shown.title ? 'text-lg leading-snug font-bold' : 'sr-only'}>
                                        {shown.title ?? shown.confirm}
                                    </Dialog.Title>
                                    <Dialog.Description
                                        className={`text-[15px] leading-snug ${shown.title ? 'text-muted-foreground mt-1' : 'font-semibold'}`}
                                    >
                                        {shown.message}
                                    </Dialog.Description>
                                </div>
                            </div>
                            <div className="mt-5 flex gap-2">
                                <button
                                    type="button"
                                    data-autofocus={shown.danger ? '' : undefined}
                                    onClick={() => answer(false)}
                                    className="bg-muted hover:bg-muted/70 h-11 flex-1 rounded-full text-sm font-bold transition"
                                >
                                    {shown.cancel}
                                </button>
                                <button
                                    type="button"
                                    data-autofocus={shown.danger ? undefined : ''}
                                    onClick={() => answer(true)}
                                    className={`h-11 flex-1 rounded-full text-sm font-bold transition hover:brightness-110 ${shown.danger ? 'bg-red-600 text-white' : 'bg-primary text-primary-foreground'}`}
                                >
                                    {shown.confirm}
                                </button>
                            </div>
                        </>
                    )}
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
