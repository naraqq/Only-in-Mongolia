/**
 * The app's own confirm dialog, instead of the browser's confirm(). Call it from anywhere and await the answer:
 *   if (await ask({ message: t('cm.confirmDelete'), confirm: t('po.delete'), cancel: t('dlg.cancel'), danger: true })) …
 * <ConfirmHost /> shows it. Labels are passed in (already translated), so it works outside any page.
 */

export type Ask = { message: string; title?: string; confirm: string; cancel: string; danger?: boolean };
type Pending = Ask & { resolve: (yes: boolean) => void };

let current: Pending | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function ask(options: Ask): Promise<boolean> {
    // A second question replaces an unanswered one, which counts as "no".
    current?.resolve(false);
    return new Promise((resolve) => {
        current = { ...options, resolve };
        emit();
    });
}

export function answer(yes: boolean): void {
    if (!current) return;
    const { resolve } = current;
    current = null;
    emit();
    resolve(yes);
}

export const confirmStore = {
    subscribe(listener: () => void) {
        listeners.add(listener);
        return () => listeners.delete(listener);
    },
    snapshot: () => current,
};
