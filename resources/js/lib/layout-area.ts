import { useLayoutEffect, useSyncExternalStore } from 'react';

/**
 * Which part of the app is on screen: the fan side, the creator studio, admin, or signing in.
 * Moving between pages of the same part changes nothing; moving to another part shows the brand splash
 * (components/layout-splash.tsx) over the new layout while it settles in.
 */
export type LayoutArea = 'client' | 'studio' | 'admin' | 'business' | 'auth';

let current: LayoutArea | null = null;
let splash = { key: 0, label: '' };
const listeners = new Set<() => void>();

/** Call at the top of a layout. Runs before the browser paints, so the new layout never flashes first. */
export function useLayoutArea(area: LayoutArea, label = '') {
    useLayoutEffect(() => {
        if (current !== null && current !== area) {
            splash = { key: splash.key + 1, label };
            listeners.forEach((notify) => notify());
        }
        current = area;
    }, [area, label]);
}

export function useSplash() {
    return useSyncExternalStore(
        (notify) => {
            listeners.add(notify);
            return () => listeners.delete(notify);
        },
        () => splash,
        () => splash,
    );
}
