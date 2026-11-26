/**
 * The installable app and push notifications, on this device.
 *  - registerServiceWorker(): once at start-up (public/sw.js shows the pushes).
 *  - pushStatus() / enablePush(key) / disablePush(): the settings switch.
 *  - installStore / promptInstall(): Android/desktop "Install app"; iPhone installs from Safari's Share menu.
 */

export type PushStatus = 'unsupported' | 'install-first' | 'denied' | 'on' | 'off';

const supported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

/** Running as the installed app (home screen), not in a browser tab. */
export const isStandalone = () =>
    typeof window !== 'undefined' &&
    (window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);

const isIos = () => typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);

export function registerServiceWorker(): void {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {});
    // The browser replaced our subscription: send the new one.
    navigator.serviceWorker.addEventListener('message', (e) => {
        if (e.data?.type === 'push:resubscribe' && window.__pushKey) enablePush(window.__pushKey).catch(() => {});
    });
}

export async function pushStatus(): Promise<PushStatus> {
    // iPhone/iPad only allow push for apps added to the home screen.
    if (isIos() && !isStandalone()) return 'install-first';
    if (!supported()) return 'unsupported';
    if (Notification.permission === 'denied') return 'denied';
    const reg = await navigator.serviceWorker.getRegistration('/');
    const sub = await reg?.pushManager.getSubscription();
    return sub && Notification.permission === 'granted' ? 'on' : 'off';
}

export async function enablePush(key: string): Promise<PushStatus> {
    if (!supported()) return 'unsupported';
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';

    const reg = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    // A subscription made with another server key can't be reused.
    if (sub && !sameKey(sub, key)) {
        await sub.unsubscribe();
        sub = null;
    }
    sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(key) });

    const json = sub.toJSON();
    await send('POST', route('push.subscribe'), {
        endpoint: json.endpoint,
        keys: json.keys,
        contentEncoding: (PushManager as unknown as { supportedContentEncodings?: string[] }).supportedContentEncodings?.includes('aes128gcm')
            ? 'aes128gcm'
            : 'aesgcm',
    });
    return 'on';
}

export async function disablePush(): Promise<PushStatus> {
    const reg = await navigator.serviceWorker.getRegistration('/');
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
        await send('DELETE', route('push.unsubscribe'), { endpoint: sub.endpoint }).catch(() => {});
        await sub.unsubscribe();
    }
    return 'off';
}

/* ---- "Install app" (Chrome, Edge, Android). Safari has no prompt: people use Share > Add to Home Screen. ---- */

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };
let deferred: InstallEvent | null = null;
const listeners = new Set<() => void>();

if (typeof window !== 'undefined') {
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault(); // we offer it in settings instead of the browser's own bar
        deferred = e as InstallEvent;
        listeners.forEach((l) => l());
    });
    window.addEventListener('appinstalled', () => {
        deferred = null;
        listeners.forEach((l) => l());
    });
}

export const installStore = {
    subscribe(l: () => void) {
        listeners.add(l);
        return () => listeners.delete(l);
    },
    /** 'prompt': we can show the install dialog. 'ios': show the Share-menu hint. 'none': installed or not offered. */
    snapshot: (): 'prompt' | 'ios' | 'none' => (isStandalone() ? 'none' : deferred ? 'prompt' : isIos() ? 'ios' : 'none'),
};

export async function promptInstall(): Promise<boolean> {
    if (!deferred) return false;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    deferred = null;
    listeners.forEach((l) => l());
    return outcome === 'accepted';
}

/* ---- helpers ---- */

declare global {
    interface Window {
        __pushKey?: string;
    }
}

async function send(method: 'POST' | 'DELETE', url: string, body: unknown): Promise<void> {
    const xsrf = decodeURIComponent(document.cookie.match(/(?:^|; )XSRF-TOKEN=([^;]*)/)?.[1] ?? '');
    const res = await fetch(url, {
        method,
        credentials: 'same-origin',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-XSRF-TOKEN': xsrf, 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${res.status}`);
}

export function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
    const base64 = (value + '='.repeat((4 - (value.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    const out = new Uint8Array(new ArrayBuffer(raw.length));
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
}

function sameKey(sub: PushSubscription, key: string): boolean {
    const current = sub.options.applicationServerKey;
    if (!current) return true;
    const a = new Uint8Array(current);
    const b = base64UrlToBytes(key);
    return a.length === b.length && a.every((x, i) => x === b[i]);
}
