import '../css/app.css';

import { createInertiaApp } from '@inertiajs/react';
import { resolvePageComponent } from 'laravel-vite-plugin/inertia-helpers';
import { type ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import { route as routeFn } from 'ziggy-js';
import Toaster from './components/toaster';
import { initializeTheme } from './hooks/use-appearance';

declare global {
    const route: typeof routeFn;
}

const appName = import.meta.env.VITE_APP_NAME || 'Only in Mongolia';
const pages = import.meta.glob('./pages/**/*.tsx');

/**
 * Pages load on first visit, which made every new screen pause. Once the app is up and the browser is idle,
 * fetch the rest in the background so moving between screens is instant.
 */
function warmPages() {
    const idle = window.requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 1500));
    idle(() => Object.values(pages).forEach((load) => load().catch(() => {})));
}

/**
 * DEV ONLY: while files are being saved, Vite on Windows can hand the browser a half-written page module with
 * no component in it, which React reports as "Element type is invalid ... got: object". Reload once to pick
 * up the finished file instead of leaving a blank page. Never runs in production builds.
 */
async function resolvePage(name: string) {
    const page = (await resolvePageComponent(`./pages/${name}.tsx`, pages)) as { default?: ComponentType };
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

        root.render(
            <>
                <App {...props} />
                <Toaster />
            </>,
        );
        warmPages();
    },
    // Only for slow loads: a bar that flashes on every quick change feels jumpy.
    progress: {
        color: '#E11D48',
        delay: 300,
        showSpinner: false,
    },
});

// This will set light / dark mode on load...
initializeTheme();
