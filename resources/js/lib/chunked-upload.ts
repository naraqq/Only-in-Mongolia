/**
 * Sends one file to the server in pieces (see App\Media\ChunkedUploads):
 *  - several pieces at once, each retried with a growing wait if the network drops or the server hiccups;
 *  - waits while the device is offline, then carries on;
 *  - can be stopped (pause) and started again later, sending only the pieces that hadn't arrived yet.
 */

export type UploadKind = 'image' | 'video' | 'audio';
export type UploadResult = { id: string; type: UploadKind; mime: string };

type Started = { id: string; chunk_size: number; chunks: number; received: number[]; completed: boolean };

/** A problem retrying won't fix (file too large, wrong type, blocked). Carries the server's message. */
export class UploadRejected extends Error {}

/** Thrown when the upload was stopped on purpose (pause or remove). */
export class UploadAborted extends Error {}

export type UploadOptions = {
    signal: AbortSignal;
    /** Bytes confirmed or in flight so far. */
    onProgress: (sent: number) => void;
    /** The server's id for this upload, once known (keep it to resume later). */
    onStarted?: (id: string) => void;
    /** "Finishing": all pieces are there and the server is checking and storing the file. */
    onFinishing?: () => void;
    /** Resume this upload instead of starting a new one. */
    resumeId?: string;
    /** How many pieces go up at once. */
    parallel?: number;
};

const RETRIES = 6;

function xsrf(): string {
    return decodeURIComponent(document.cookie.match(/(?:^|; )XSRF-TOKEN=([^;]*)/)?.[1] ?? '');
}

function headers(json = true): Record<string, string> {
    return {
        Accept: 'application/json',
        ...(json ? { 'Content-Type': 'application/json' } : {}),
        'X-XSRF-TOKEN': xsrf(),
        'X-Requested-With': 'XMLHttpRequest',
    };
}

class HttpError extends Error {
    constructor(
        public status: number,
        public body: unknown,
    ) {
        super(`HTTP ${status}`);
    }
}

/** The server is missing some pieces when asked to finish (e.g. one was lost in a crash): send them again. */
class MissingPieces extends Error {
    constructor(public missing: number[]) {
        super('missing pieces');
    }
}

/** The first message from a Laravel validation error, or a general one. */
export function serverMessage(body: unknown): string | null {
    const b = body as { message?: string; errors?: Record<string, string[]> } | null;
    const first = b?.errors ? Object.values(b.errors)[0]?.[0] : undefined;
    return first ?? b?.message ?? null;
}

/** Worth trying again: network failure, timeouts, rate limits, server errors (incl. a 419 after the session refreshed). */
function retriable(e: unknown): boolean {
    if (e instanceof HttpError) return e.status === 408 || e.status === 419 || e.status === 429 || e.status >= 500;
    return !(e instanceof UploadAborted || e instanceof UploadRejected || e instanceof MissingPieces);
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        if (signal.aborted) return reject(new UploadAborted());
        const t = setTimeout(done, ms);
        function done() {
            signal.removeEventListener('abort', stop);
            resolve();
        }
        function stop() {
            clearTimeout(t);
            reject(new UploadAborted());
        }
        signal.addEventListener('abort', stop, { once: true });
    });
}

/** Resolves once the device is online (immediately if it is). */
function online(signal: AbortSignal): Promise<void> {
    if (typeof navigator === 'undefined' || navigator.onLine !== false) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const on = () => {
            signal.removeEventListener('abort', stop);
            resolve();
        };
        const stop = () => {
            window.removeEventListener('online', on);
            reject(new UploadAborted());
        };
        window.addEventListener('online', on, { once: true });
        signal.addEventListener('abort', stop, { once: true });
    });
}

/** Run $fn, retrying on network trouble with 1s, 2s, 4s… waits (plus jitter), and pausing while offline. */
async function withRetry<T>(fn: () => Promise<T>, signal: AbortSignal): Promise<T> {
    for (let attempt = 0; ; attempt++) {
        await online(signal);
        try {
            return await fn();
        } catch (e) {
            if (signal.aborted) throw new UploadAborted();
            if (!retriable(e) || attempt >= RETRIES) {
                if (e instanceof HttpError) throw new UploadRejected(serverMessage(e.body) ?? `HTTP ${e.status}`);
                throw e;
            }
            await wait(Math.min(30_000, 1000 * 2 ** attempt) + Math.random() * 400, signal);
        }
    }
}

async function json<T>(method: string, url: string, signal: AbortSignal, body?: unknown): Promise<T> {
    let res: Response;
    try {
        res = await fetch(url, {
            method,
            credentials: 'same-origin',
            headers: headers(),
            body: body === undefined ? undefined : JSON.stringify(body),
            signal,
        });
    } catch (e) {
        if (signal.aborted) throw new UploadAborted();
        throw e;
    }
    const data = res.status === 204 ? null : await res.json().catch(() => null);
    if (res.status === 409 && Array.isArray((data as { missing?: unknown })?.missing))
        throw new MissingPieces((data as { missing: number[] }).missing);
    if (!res.ok) throw new HttpError(res.status, data);
    return data as T;
}

/** One piece, with upload progress (fetch can't report that, XHR can). */
function sendPiece(url: string, blob: Blob, signal: AbortSignal, onBytes: (n: number) => void): Promise<void> {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', url);
        Object.entries(headers(false)).forEach(([k, v]) => xhr.setRequestHeader(k, v));
        xhr.setRequestHeader('Content-Type', 'application/octet-stream');
        xhr.withCredentials = true;
        xhr.timeout = 120_000;
        xhr.upload.onprogress = (e) => onBytes(e.loaded);
        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) return resolve();
            let body: unknown = null;
            try {
                body = JSON.parse(xhr.responseText);
            } catch {
                /* not JSON */
            }
            reject(new HttpError(xhr.status, body));
        };
        xhr.onerror = () => reject(new Error('network'));
        xhr.ontimeout = () => reject(new Error('timeout'));
        xhr.onabort = () => reject(new UploadAborted());
        const stop = () => xhr.abort();
        signal.addEventListener('abort', stop, { once: true });
        xhr.onloadend = () => signal.removeEventListener('abort', stop);
        xhr.send(blob);
    });
}

export async function uploadInChunks(file: File, opts: UploadOptions): Promise<UploadResult> {
    const { signal, onProgress } = opts;
    const parallel = opts.parallel ?? 3;

    const state = await withRetry(
        () =>
            opts.resumeId
                ? json<Started>('GET', route('uploads.show', opts.resumeId), signal)
                : json<Started>('POST', route('uploads.start'), signal, { name: file.name, size: file.size, mime: file.type || null }),
        signal,
    );
    opts.onStarted?.(state.id);

    const pieceBytes = (i: number) => Math.min(state.chunk_size, file.size - i * state.chunk_size);
    const done = new Set(state.received);
    const inFlight = new Map<number, number>();
    const report = () => {
        let sent = 0;
        done.forEach((i) => (sent += pieceBytes(i)));
        inFlight.forEach((n) => (sent += n));
        onProgress(Math.min(sent, file.size));
    };
    report();

    async function sendAll(indexes: number[]) {
        const queue = [...indexes];
        async function worker() {
            for (let i = queue.shift(); i !== undefined; i = queue.shift()) {
                const index = i;
                const blob = file.slice(index * state.chunk_size, index * state.chunk_size + pieceBytes(index));
                await withRetry(async () => {
                    inFlight.set(index, 0);
                    try {
                        await sendPiece(route('uploads.chunk', { upload: state.id, index }), blob, signal, (n) => {
                            inFlight.set(index, n);
                            report();
                        });
                    } finally {
                        inFlight.delete(index);
                    }
                }, signal);
                done.add(index);
                report();
            }
        }
        await Promise.all(Array.from({ length: Math.min(parallel, queue.length) }, worker));
    }

    if (!state.completed) {
        await sendAll(Array.from({ length: state.chunks }, (_, i) => i).filter((i) => !done.has(i)));
    }

    opts.onFinishing?.();
    // The server joins and checks the file; if it says pieces are missing, send those and ask again.
    for (let round = 0; ; round++) {
        try {
            return await withRetry(() => json<UploadResult>('POST', route('uploads.complete', state.id), signal), signal);
        } catch (e) {
            if (!(e instanceof MissingPieces) || round >= 2) throw e instanceof MissingPieces ? new UploadRejected('missing pieces') : e;
            e.missing.forEach((i) => done.delete(i));
            report();
            await sendAll(e.missing);
        }
    }
}
