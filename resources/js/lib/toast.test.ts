import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dismiss, toast, toastStore } from './toast';

describe('toast', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => {
        toastStore.snapshot().forEach((x) => dismiss(x.id));
        vi.useRealTimers();
    });

    it('shows a toast and hides it after a few seconds', () => {
        toast('Saved', { tone: 'success' });
        expect(toastStore.snapshot().map((x) => [x.message, x.tone])).toEqual([['Saved', 'success']]);
        vi.advanceTimersByTime(4100);
        expect(toastStore.snapshot()).toEqual([]);
    });

    it('keeps toasts with a button up longer', () => {
        toast('Follow to message', { action: { label: 'Follow', onClick: () => {} } });
        vi.advanceTimersByTime(4100);
        expect(toastStore.snapshot()).toHaveLength(1);
        vi.advanceTimersByTime(2000);
        expect(toastStore.snapshot()).toHaveLength(0);
    });

    it('replaces the same message instead of stacking, and shows at most three', () => {
        toast('Same');
        toast('Same');
        expect(toastStore.snapshot()).toHaveLength(1);
        ['a', 'b', 'c', 'd'].forEach((m) => toast(m));
        expect(toastStore.snapshot().map((x) => x.message)).toEqual(['b', 'c', 'd']);
    });

    it('tells subscribers when the list changes', () => {
        const listener = vi.fn();
        const stop = toastStore.subscribe(listener);
        const id = toast('Hi');
        dismiss(id);
        expect(listener).toHaveBeenCalledTimes(2);
        stop();
    });
});
