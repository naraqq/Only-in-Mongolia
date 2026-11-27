import { echo, echoIsConfigured } from '@laravel/echo-react';
import { useEffect, useRef, useState } from 'react';

/**
 * Real-time updates (Laravel Reverb, see app/Support/Live.php). The server only says *that* something changed;
 * the page then reloads that piece through the normal routes. When the connection is down (or Reverb isn't set
 * up), `useLiveConnected()` is false and pages fall back to checking every few seconds.
 */

/** Run `onPing` whenever one of `events` arrives on `channel`. Pass null to listen to nothing (e.g. signed out). */
export function useLive(channel: string | null, events: string[], onPing: () => void, kind: 'private' | 'public' = 'private') {
    const latest = useRef(onPing);
    latest.current = onPing;
    const names = events.join(',');

    useEffect(() => {
        if (!channel || !echoIsConfigured()) return;
        const handler = () => latest.current();
        let sub: { listen: (e: string, cb: () => void) => unknown; stopListening: (e: string, cb?: () => void) => unknown };
        try {
            sub = kind === 'private' ? echo().private(channel) : echo().channel(channel);
        } catch {
            return;
        }
        const list = names.split(',');
        // Server events use broadcastAs(), so they're listened to with a leading dot.
        list.forEach((e) => sub.listen(`.${e}`, handler));
        return () => list.forEach((e) => sub.stopListening(`.${e}`, handler));
    }, [channel, kind, names]);
}

const status = () => {
    try {
        return echoIsConfigured() && echo().connectionStatus() === 'connected';
    } catch {
        return false;
    }
};

/** Whether real-time updates are flowing right now (false when Reverb isn't set up, instead of throwing). */
export function useLiveConnected(): boolean {
    const [connected, setConnected] = useState(status);
    useEffect(() => {
        if (!echoIsConfigured()) return;
        try {
            setConnected(status());
            return echo().connector.onConnectionChange((s: string) => setConnected(s === 'connected'));
        } catch {
            return;
        }
    }, []);
    return connected;
}
