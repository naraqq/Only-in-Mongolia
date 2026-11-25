/**
 * Small JSON requests for quick actions (like, save, comment) that shouldn't reload the page.
 * Sends Laravel's XSRF cookie back as a header, which is how Laravel checks CSRF for these.
 */
export async function sendJson<T = unknown>(method: 'GET' | 'POST' | 'DELETE', url: string, body?: unknown): Promise<T> {
    const xsrf = decodeURIComponent(document.cookie.match(/(?:^|; )XSRF-TOKEN=([^;]*)/)?.[1] ?? '');
    const res = await fetch(url, {
        method,
        credentials: 'same-origin',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-XSRF-TOKEN': xsrf, 'X-Requested-With': 'XMLHttpRequest' },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${res.status}`);
    return (await res.json()) as T;
}
