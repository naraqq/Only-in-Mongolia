import '../css/app.css';

import { createInertiaApp } from '@inertiajs/react';
import { configureEcho } from '@laravel/echo-react';
import { resolvePageComponent } from 'laravel-vite-plugin/inertia-helpers';
import { type ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import { route as routeFn } from 'ziggy-js';
import ConfirmHost from './components/confirm-host';
import LayoutSplash from './components/layout-splash';
import Toaster from './components/toaster';
import { initializeTheme } from './hooks/use-appearance';
import { registerServiceWorker } from './lib/push';

type ReverbSettings = { key: string; host: string | null; port: number | null; scheme: 'http' | 'https' | null } | null;

/**
 * Real-time updates (lib/live.ts), with settings from the server at runtime (not baked in at build time, so one
 * Docker image works anywhere). By default the browser connects to the page's own address, where the proxy
 * passes it on to Reverb. No settings = Reverb isn't set up here, and pages keep checking now and then instead.
 */
function startRealtime(reverb: ReverbSettings) {
    if (!reverb?.key) return;
    const tls = (reverb.scheme ?? window.location.protocol.replace(':', '')) === 'https';
    const port = reverb.port ?? (window.location.port ? Number(window.location.port) : tls ? 443 : 80);
    configureEcho({
        broadcaster: 'reverb',
        key: reverb.key,
        wsHost: reverb.host ?? window.location.hostname,
        wsPort: port,
        wssPort: port,
        forceTLS: tls,
        enabledTransports: ['ws', 'wss'],
    });
}

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
        startRealtime(props.initialPage.props.reverb as ReverbSettings);
        const root = createRoot(el);

        root.render(
            <>
                <App {...props} />
                <Toaster />
                <ConfirmHost />
                <LayoutSplash name={(props.initialPage.props.name as string | undefined) ?? appName} />
            </>,
        );
        warmPages();
        window.__pushKey = (props.initialPage.props.pushKey as string | null | undefined) ?? undefined;
        registerServiceWorker();
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
