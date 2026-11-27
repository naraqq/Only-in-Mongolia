import { router } from '@inertiajs/react';
import { useEffect } from 'react';

/**
 * Creator page visits for conversion insights. The browser reports them (not the server) so hover prefetches
 * don't count, and it knows the page the visitor came from: the outside site on the first load, then the
 * previous screen in the app.
 */

let current = typeof window !== 'undefined' ? window.location.href : '';
let previous = typeof document !== 'undefined' ? document.referrer : '';

if (typeof window !== 'undefined') {
    router.on('navigate', (event) => {
        const next = new URL(event.detail.page.url, window.location.origin).href;
        if (next !== current) {
            previous = current;
            current = next;
        }
    });
}

/** Report this creator page once it has been on screen briefly. */
export function useCreatorVisit(handle: string, page: 'profile' | 'series', pageId = 0) {
    useEffect(() => {
        const timer = setTimeout(() => {
            const here = window.location.href;
            const from = current === here ? previous : current;
            const xsrf = decodeURIComponent(document.cookie.match(/(?:^|; )XSRF-TOKEN=([^;]*)/)?.[1] ?? '');
            fetch(route('visits'), {
                method: 'POST',
                credentials: 'same-origin',
                keepalive: true,
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                    'X-XSRF-TOKEN': xsrf,
                    'X-Requested-With': 'XMLHttpRequest',
                },
                body: JSON.stringify({ handle, page, page_id: pageId, from: from || null, ref: new URL(here).searchParams.get('ref') }),
            }).catch(() => {
                /* a lost visit isn't worth bothering anyone about */
            });
        }, 800);
        return () => clearTimeout(timer);
    }, [handle, page, pageId]);
}
