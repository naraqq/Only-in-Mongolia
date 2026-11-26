import { useEffect, type RefObject } from 'react';

/**
 * Post views for creator insights. A post counts as seen once at least half of it has been on screen for
 * about a second. Seen posts are queued and sent in small batches (and when the page is left), once per page view.
 */

const DWELL_MS = 1000;
const FLUSH_MS = 4000;
const sent = new Set<number>();
let queue: number[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

function flush() {
    timer = null;
    if (!queue.length) return;
    const ids = queue;
    queue = [];
    const xsrf = decodeURIComponent(document.cookie.match(/(?:^|; )XSRF-TOKEN=([^;]*)/)?.[1] ?? '');
    fetch(route('posts.views'), {
        method: 'POST',
        credentials: 'same-origin',
        keepalive: true, // still goes out if the page is closing
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-XSRF-TOKEN': xsrf, 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ ids }),
    }).catch(() => {
        /* a lost view isn't worth bothering anyone about */
    });
}

function seen(id: number) {
    if (sent.has(id)) return;
    sent.add(id);
    queue.push(id);
    if (queue.length >= 20) flush();
    else timer ??= setTimeout(flush, FLUSH_MS);
}

if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flush());
}

/** Count a view of post `id` once its element has been at least half visible for a moment. */
export function useSeen(ref: RefObject<HTMLElement | null>, id: number, enabled = true) {
    useEffect(() => {
        const el = ref.current;
        if (!enabled || !el || sent.has(id) || typeof IntersectionObserver === 'undefined') return;
        let dwell: ReturnType<typeof setTimeout> | null = null;
        const io = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) dwell ??= setTimeout(() => (seen(id), io.disconnect()), DWELL_MS);
                else if (dwell) {
                    clearTimeout(dwell);
                    dwell = null;
                }
            },
            { threshold: 0.5 },
        );
        io.observe(el);
        return () => {
            if (dwell) clearTimeout(dwell);
            io.disconnect();
        };
    }, [ref, id, enabled]);
}
