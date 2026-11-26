/** A tiny app-wide toast queue. Call toast('…') from anywhere; <Toaster /> shows them. */

export type ToastTone = 'info' | 'success' | 'error';
export type ToastAction = { label: string; onClick: () => void };
export type Toast = { id: number; message: string; tone: ToastTone; action?: ToastAction; icon?: 'lock' | 'check' | 'alert' | 'info' };

let items: Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function toast(message: string, options: { tone?: ToastTone; action?: ToastAction; icon?: Toast['icon']; duration?: number } = {}): number {
    const id = nextId++;
    // The same message again replaces the old one instead of stacking up.
    items = [
        ...items.filter((x) => x.message !== message),
        { id, message, tone: options.tone ?? 'info', action: options.action, icon: options.icon },
    ].slice(-3);
    emit();
    setTimeout(() => dismiss(id), options.duration ?? (options.action ? 6000 : 4000));
    return id;
}

export function dismiss(id: number): void {
    items = items.filter((x) => x.id !== id);
    emit();
}

export const toastStore = {
    subscribe(listener: () => void) {
        listeners.add(listener);
        return () => listeners.delete(listener);
    },
    snapshot: () => items,
};
