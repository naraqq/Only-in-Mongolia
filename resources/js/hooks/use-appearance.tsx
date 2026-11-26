import { router, usePage } from '@inertiajs/react';
import { useState } from 'react';

export type Appearance = 'light' | 'dark' | 'system';

/**
 * Light, dark, or follow the device. The choice lives on the server (the account, plus a cookie for visitors),
 * and the server renders <html class="dark"> itself, so the page never starts in the wrong colours.
 */

const media = () => window.matchMedia('(prefers-color-scheme: dark)');

function apply(appearance: Appearance) {
    const root = document.documentElement;
    root.dataset.appearance = appearance;
    root.classList.toggle('dark', appearance === 'dark' || (appearance === 'system' && media().matches));
}

/** On load: keep following the device while the choice is "system" (the server already set the first paint). */
export function initializeTheme() {
    media().addEventListener('change', () => {
        if (document.documentElement.dataset.appearance === 'system') apply('system');
    });
}

export function useAppearance() {
    const saved = usePage<{ appearance?: Appearance }>().props.appearance ?? 'system';
    const [appearance, setAppearance] = useState<Appearance>(saved);

    const updateAppearance = (mode: Appearance) => {
        setAppearance(mode);
        apply(mode); // instantly, then remember it on the server
        router.post(route('appearance', mode), {}, { preserveScroll: true, preserveState: true });
    };

    return { appearance, updateAppearance };
}
