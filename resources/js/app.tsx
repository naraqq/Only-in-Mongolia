import '../css/app.css';

import { createInertiaApp } from '@inertiajs/react';
import { resolvePageComponent } from 'laravel-vite-plugin/inertia-helpers';
import { type ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import { route as routeFn } from 'ziggy-js';
import { initializeTheme } from './hooks/use-appearance';

declare global {
    const route: typeof routeFn;
}

const appName = import.meta.env.VITE_APP_NAME || 'Only in Mongolia';

/**
 * DEV ONLY: while files are being saved, Vite on Windows can hand the browser a half-written page module with
 * no component in it, which React reports as "Element type is invalid ... got: object". Reload once to pick
 * up the finished file instead of leaving a blank page. Never runs in production builds.
 */
async function resolvePage(name: string) {
    const page = (await resolvePageComponent(`./pages/${name}.tsx`, import.meta.glob('./pages/**/*.tsx'))) as { default?: ComponentType };
    if (import.meta.env.DEV && typeof page?.default !== 'function') {
        const key = `reloaded:${name}`;
        if (!sessionStorage.getItem(key)) {
            sessionStorage.setItem(key, '1');
            window.location.reload();
            return new Promise<never>(() => {}); // wait for the reload
        }
    } else if (import.meta.env.DEV) {
        sessionStorage.removeItem(`reloaded:${name}`);
    }
    return page;
}

createInertiaApp({
    title: (title) => `${title} - ${appName}`,
    resolve: resolvePage,
    setup({ el, App, props }) {
        const root = createRoot(el);

        root.render(<App {...props} />);
    },
    progress: {
        color: '#E11D48',
    },
});

// This will set light / dark mode on load...
initializeTheme();
