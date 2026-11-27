import { UploadAborted, uploadInChunks, UploadRejected, type UploadKind, type UploadResult } from '@/lib/chunked-upload';
import { router } from '@inertiajs/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * The files a creator is adding to a post, uploading in the background the moment they're picked: two files at
 * a time, each in pieces (lib/chunked-upload). Tracks progress, speed and time left per file, can pause, resume,
 * retry and reorder, and keeps the page from being left while something is still going up.
 */

export type UploadStatus = 'queued' | 'uploading' | 'paused' | 'finishing' | 'done' | 'error';

export type UploadItem = {
    key: string;
    file: File;
    /** A local link to the file for previews. */
    url: string;
    kind: UploadKind;
    status: UploadStatus;
    /** Bytes sent so far. */
    sent: number;
    /** Bytes per second (smoothed); 0 when unknown. */
    speed: number;
    uploadId?: string;
    result?: UploadResult;
    error?: string;
    /** False when retrying can't help (wrong type, too large, blocked). */
    canRetry?: boolean;
    /** A video's frame, for the tile. */
    poster?: string;
    /** Seconds, for videos and audio. */
    duration?: number;
};

/** Same limits as the server (App\Media\Uploads::CHUNKED_MAX_KB). */
export const MAX_BYTES: Record<UploadKind, number> = { image: 20 * 1024 ** 2, video: 2 * 1024 ** 3, audio: 500 * 1024 ** 2 };

const AUDIO_EXT = /\.(mp3|m4a|aac|wav|ogg|oga|opus|flac)$/i;
const VIDEO_EXT = /\.(mp4|m4v|mov|webm)$/i;
const IMAGE_EXT = /\.(jpe?g|png|webp)$/i;

export function kindOf(file: File): UploadKind | null {
    const t = file.type;
    if (t.startsWith('audio/') || AUDIO_EXT.test(file.name)) return 'audio';
    if (['video/mp4', 'video/quicktime', 'video/webm'].includes(t) || (!t && VIDEO_EXT.test(file.name))) return 'video';
    if (['image/jpeg', 'image/png', 'image/webp'].includes(t) || (!t && IMAGE_EXT.test(file.name))) return 'image';
    return null;
}

export type Refused = { name: string; reason: 'type' | 'size' | 'count'; kind?: UploadKind };

const PARALLEL_FILES = 2;

function xsrf(): string {
    return decodeURIComponent(document.cookie.match(/(?:^|; )XSRF-TOKEN=([^;]*)/)?.[1] ?? '');
}

/** Tell the server to throw away an upload (fire and forget; unused ones are pruned anyway). */
function discard(id: string) {
    fetch(route('uploads.destroy', id), {
        method: 'DELETE',
        credentials: 'same-origin',
        keepalive: true,
        headers: { Accept: 'application/json', 'X-XSRF-TOKEN': xsrf(), 'X-Requested-With': 'XMLHttpRequest' },
    }).catch(() => {});
}

/** A frame from a video (about a tenth of the way in) and its length. Fails quietly for formats the browser can't play. */
function probe(url: string, kind: UploadKind): Promise<{ poster?: string; duration?: number }> {
    if (kind === 'image') return Promise.resolve({});
    return new Promise((resolve) => {
        const el = document.createElement(kind === 'video' ? 'video' : 'audio');
        const out: { poster?: string; duration?: number } = {};
        const finish = () => {
            clearTimeout(timer);
            el.removeAttribute('src');
            el.load();
            resolve(out);
        };
        const timer = setTimeout(finish, 8000);
        el.preload = 'metadata';
        el.muted = true;
        el.onerror = finish;
        el.onloadedmetadata = () => {
            if (Number.isFinite(el.duration)) out.duration = el.duration;
            if (kind !== 'video') return finish();
            (el as HTMLVideoElement).currentTime = Math.min(1.5, (el.duration || 0) * 0.1);
        };
        el.onseeked = () => {
            const v = el as HTMLVideoElement;
            try {
                const w = Math.min(480, v.videoWidth || 480);
                const h = Math.round((w * (v.videoHeight || 270)) / (v.videoWidth || 480));
                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                canvas.getContext('2d')?.drawImage(v, 0, 0, w, h);
                out.poster = canvas.toDataURL('image/jpeg', 0.75);
            } catch {
                /* no frame: the tile shows an icon */
            }
            finish();
        };
        el.src = url;
    });
}

/** $leaveWarning: the question asked before leaving the page mid-upload. */
export function useUploads(max: number, leaveWarning: string) {
    const [items, setItems] = useState<UploadItem[]>([]);
    const latest = useRef(items);
    latest.current = items;
    const controllers = useRef(new Map<string, AbortController>());
    const pausing = useRef(new Set<string>());
    const meter = useRef(new Map<string, { t: number; sent: number; shown: number }>());

    const patch = useCallback((key: string, change: Partial<UploadItem> | ((i: UploadItem) => Partial<UploadItem>)) => {
        setItems((list) => list.map((i) => (i.key === key ? { ...i, ...(typeof change === 'function' ? change(i) : change) } : i)));
    }, []);

    const start = useCallback(
        (item: UploadItem) => {
            const controller = new AbortController();
            controllers.current.set(item.key, controller);
            meter.current.set(item.key, { t: performance.now(), sent: item.sent, shown: 0 });
            patch(item.key, { status: 'uploading', error: undefined, speed: 0 });

            uploadInChunks(item.file, {
                signal: controller.signal,
                resumeId: item.uploadId,
                onStarted: (id) => patch(item.key, { uploadId: id }),
                onFinishing: () => patch(item.key, { status: 'finishing', sent: item.file.size, speed: 0 }),
                onProgress: (sent) => {
                    // Speed is smoothed over time and the screen updated a few times a second, not on every event.
                    const m = meter.current.get(item.key);
                    const now = performance.now();
                    if (!m) return;
                    const dt = (now - m.t) / 1000;
                    if (dt < 0.25 && sent < item.file.size) return;
                    const rate = dt > 0 ? Math.max(0, sent - m.sent) / dt : 0;
                    m.shown = m.shown ? m.shown * 0.7 + rate * 0.3 : rate;
                    m.t = now;
                    m.sent = sent;
                    patch(item.key, (i) => (i.status === 'uploading' ? { sent, speed: m.shown } : {}));
                },
            })
                .then((result) => patch(item.key, { status: 'done', result, sent: item.file.size, speed: 0 }))
                .catch((e) => {
                    if (e instanceof UploadAborted || controller.signal.aborted) {
                        if (pausing.current.delete(item.key)) patch(item.key, { status: 'paused', speed: 0 });
                        return;
                    }
                    const rejected = e instanceof UploadRejected;
                    patch(item.key, {
                        status: 'error',
                        speed: 0,
                        error: rejected ? e.message : undefined, // no message: the tile says the connection dropped
                        canRetry: !rejected,
                        // A rejected file is gone on the server; a fresh try starts over.
                        ...(rejected ? { uploadId: undefined, sent: 0 } : {}),
                    });
                })
                .finally(() => {
                    if (controllers.current.get(item.key) === controller) controllers.current.delete(item.key);
                });
        },
        [patch],
    );

    // Start waiting files while fewer than two are going up.
    useEffect(() => {
        const active = items.filter((i) => i.status === 'uploading' || i.status === 'finishing').length;
        items
            .filter((i) => i.status === 'queued')
            .slice(0, Math.max(0, PARALLEL_FILES - active))
            .forEach(start);
    }, [items, start]);

    const add = useCallback(
        (list: FileList | File[]): Refused[] => {
            const refused: Refused[] = [];
            const room = max - latest.current.length;
            const fresh: UploadItem[] = [];
            for (const file of Array.from(list)) {
                const kind = kindOf(file);
                if (!kind) refused.push({ name: file.name, reason: 'type' });
                else if (file.size > MAX_BYTES[kind]) refused.push({ name: file.name, reason: 'size', kind });
                else if (fresh.length >= room) refused.push({ name: file.name, reason: 'count' });
                else
                    fresh.push({
                        key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                        file,
                        url: URL.createObjectURL(file),
                        kind,
                        status: 'queued',
                        sent: 0,
                        speed: 0,
                    });
            }
            if (fresh.length) {
                setItems((l) => [...l, ...fresh]);
                fresh.forEach((item) => probe(item.url, item.kind).then((info) => patch(item.key, info)));
            }
            return refused;
        },
        [max, patch],
    );

    const remove = useCallback((key: string) => {
        const item = latest.current.find((i) => i.key === key);
        if (!item) return;
        controllers.current.get(key)?.abort();
        controllers.current.delete(key);
        if (item.uploadId) discard(item.uploadId);
        URL.revokeObjectURL(item.url);
        setItems((l) => l.filter((i) => i.key !== key));
    }, []);

    const pause = useCallback(
        (key: string) => {
            const item = latest.current.find((i) => i.key === key);
            if (item?.status === 'queued') return patch(key, { status: 'paused' });
            if (item?.status !== 'uploading') return;
            pausing.current.add(key);
            controllers.current.get(key)?.abort();
        },
        [patch],
    );

    /** Resume a paused file or retry a failed one (picking up where it stopped when the server still has its pieces). */
    const resume = useCallback((key: string) => patch(key, { status: 'queued', error: undefined }), [patch]);

    const move = useCallback((from: number, to: number) => {
        setItems((l) => {
            if (from === to || from < 0 || to < 0 || from >= l.length || to >= l.length) return l;
            const next = [...l];
            const [it] = next.splice(from, 1);
            next.splice(to, 0, it);
            return next;
        });
    }, []);

    /** Forget everything. $discard: also throw the files away on the server (not after they went into a post). */
    const clear = useCallback((discardOnServer = true) => {
        controllers.current.forEach((c) => c.abort());
        controllers.current.clear();
        latest.current.forEach((i) => {
            if (discardOnServer && i.uploadId) discard(i.uploadId);
            URL.revokeObjectURL(i.url);
        });
        setItems([]);
    }, []);

    const summary = useMemo(() => {
        const size = items.reduce((s, i) => s + i.file.size, 0);
        const sent = items.reduce((s, i) => s + (i.status === 'done' ? i.file.size : i.sent), 0);
        const speed = items.reduce((s, i) => s + (i.status === 'uploading' ? i.speed : 0), 0);
        const pending = items.filter((i) => i.status !== 'done').length;
        return {
            size,
            sent,
            speed,
            percent: size ? Math.floor((sent / size) * 100) : 100,
            secondsLeft: speed > 0 ? (size - sent) / speed : null,
            pending,
            failed: items.filter((i) => i.status === 'error').length,
            paused: items.filter((i) => i.status === 'paused').length,
            /** Something is still moving (or will, by itself). */
            busy: items.some((i) => i.status === 'queued' || i.status === 'uploading' || i.status === 'finishing'),
            allDone: pending === 0,
            ids: items.filter((i) => i.status === 'done' && i.result).map((i) => i.result!.id),
        };
    }, [items]);

    // Don't lose uploads by closing the tab or following a link mid-way.
    const busy = summary.busy;
    useEffect(() => {
        if (!busy) return;
        const beforeUnload = (e: BeforeUnloadEvent) => {
            e.preventDefault();
            e.returnValue = '';
        };
        window.addEventListener('beforeunload', beforeUnload);
        const off = router.on('before', (e) => {
            const visit = e.detail.visit;
            if (visit.method === 'get' && !visit.only?.length && !visit.preserveState && !window.confirm(leaveWarning)) e.preventDefault();
        });
        return () => {
            window.removeEventListener('beforeunload', beforeUnload);
            off();
        };
    }, [busy, leaveWarning]);

    // Leaving the composer for good: stop and throw away whatever didn't go into a post.
    useEffect(
        () => () => {
            controllers.current.forEach((c) => c.abort());
            latest.current.forEach((i) => {
                if (i.uploadId) discard(i.uploadId);
                URL.revokeObjectURL(i.url);
            });
        },
        [],
    );

    return { items, add, remove, pause, resume, move, clear, ...summary };
}

export function formatBytes(n: number): string {
    if (n < 1024) return `${n} B`;
    const units = ['KB', 'MB', 'GB'];
    let v = n / 1024;
    let u = 0;
    while (v >= 1024 && u < units.length - 1) {
        v /= 1024;
        u++;
    }
    return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[u]}`;
}

export function formatDuration(seconds: number): string {
    const s = Math.max(0, Math.round(seconds));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = String(s % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}
