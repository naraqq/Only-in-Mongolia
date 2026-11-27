import { uploadInChunks, UploadAborted, UploadRejected } from '@/lib/chunked-upload';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** A fake server: pieces arrive through XHR, everything else through fetch. */
type Server = { received: Set<number>; failNext: number; rejectComplete?: string; missingOnce?: number[] };

let server: Server;
let pieceCalls: number[];

class FakeXhr {
    status = 0;
    responseText = '';
    timeout = 0;
    withCredentials = false;
    upload: { onprogress?: (e: { loaded: number }) => void } = {};
    onload?: () => void;
    onerror?: () => void;
    ontimeout?: () => void;
    onabort?: () => void;
    onloadend?: () => void;
    private url = '';
    open(_m: string, url: string) {
        this.url = url;
    }
    setRequestHeader() {}
    abort() {
        this.onabort?.();
    }
    send(blob: Blob) {
        const index = Number(this.url.split('/').pop());
        pieceCalls.push(index);
        queueMicrotask(() => {
            if (server.failNext > 0) {
                server.failNext--;
                this.onerror?.();
            } else {
                this.upload.onprogress?.({ loaded: blob.size });
                server.received.add(index);
                this.status = 204;
                this.onload?.();
            }
            this.onloadend?.();
        });
    }
}

function reply(status: number, body: unknown) {
    return Promise.resolve(new Response(status === 204 ? null : JSON.stringify(body), { status }));
}

beforeEach(() => {
    vi.useFakeTimers();
    server = { received: new Set(), failNext: 0 };
    pieceCalls = [];
    vi.stubGlobal('XMLHttpRequest', FakeXhr);
    vi.stubGlobal('route', (name: string, params?: string | { upload: string; index: number }) =>
        typeof params === 'object' ? `/uploads/${params.upload}/chunks/${params.index}` : `/${name}/${params ?? ''}`,
    );
    vi.stubGlobal(
        'fetch',
        vi.fn((url: string, init: RequestInit) => {
            if (url.startsWith('/uploads.start')) return reply(201, { id: 'u1', chunk_size: 10, chunks: 3, received: [], completed: false });
            if (url.startsWith('/uploads.show')) return reply(200, { id: 'u1', chunk_size: 10, chunks: 3, received: [...server.received], completed: false });
            if (url.startsWith('/uploads.complete')) {
                if (server.rejectComplete) return reply(422, { message: 'x', errors: { file: [server.rejectComplete] } });
                if (server.missingOnce) {
                    const missing = server.missingOnce;
                    server.missingOnce = undefined;
                    missing.forEach((i) => server.received.delete(i));
                    return reply(409, { missing });
                }
                return reply(200, { id: 'u1', type: 'video', mime: 'video/mp4' });
            }
            throw new Error(`unexpected ${init.method} ${url}`);
        }),
    );
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

const file = () => new File(['x'.repeat(25)], 'clip.mp4', { type: 'video/mp4' }); // 3 pieces of 10, 10, 5

describe('uploadInChunks', () => {
    it('sends every piece, reports progress, and returns the finished upload', async () => {
        const progress: number[] = [];
        const result = await uploadInChunks(file(), { signal: new AbortController().signal, onProgress: (n) => progress.push(n) });

        expect(result).toEqual({ id: 'u1', type: 'video', mime: 'video/mp4' });
        expect([...server.received].sort()).toEqual([0, 1, 2]);
        expect(progress.at(-1)).toBe(25);
    });

    it('retries a piece after a network error', async () => {
        server.failNext = 2;
        const done = uploadInChunks(file(), { signal: new AbortController().signal, onProgress: () => {} });
        await vi.runAllTimersAsync();

        await expect(done).resolves.toMatchObject({ id: 'u1' });
        expect(pieceCalls.length).toBe(5); // 3 pieces + 2 retries
    });

    it('resumes by sending only the pieces the server is missing', async () => {
        server.received = new Set([0, 2]);
        await uploadInChunks(file(), { signal: new AbortController().signal, onProgress: () => {}, resumeId: 'u1' });

        expect(pieceCalls).toEqual([1]);
    });

    it('resends pieces the server says are missing when finishing', async () => {
        server.missingOnce = [1];
        await uploadInChunks(file(), { signal: new AbortController().signal, onProgress: () => {} });

        expect(pieceCalls.filter((i) => i === 1).length).toBe(2);
    });

    it('gives up with the server’s message when the file is refused', async () => {
        server.rejectComplete = 'Videos can be at most 2 GB.';
        await expect(uploadInChunks(file(), { signal: new AbortController().signal, onProgress: () => {} })).rejects.toEqual(
            new UploadRejected('Videos can be at most 2 GB.'),
        );
    });

    it('stops when aborted (pause)', async () => {
        server.failNext = 99; // keeps it waiting between retries
        const controller = new AbortController();
        const done = uploadInChunks(file(), { signal: controller.signal, onProgress: () => {} });
        await vi.advanceTimersByTimeAsync(10);
        controller.abort();

        await expect(done).rejects.toBeInstanceOf(UploadAborted);
    });
});
