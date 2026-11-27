import { useWatchReport } from '@/lib/watch';
import { act, render } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function Player({ id }: { id?: number }) {
    const ref = useRef<HTMLVideoElement>(null);
    useWatchReport(ref, id);
    return <video ref={ref} />;
}

/** Drive a jsdom <video>: jsdom has no playback, so time, duration and paused are set by hand. */
function control(v: HTMLVideoElement) {
    let paused = true;
    let time = 0;
    Object.defineProperty(v, 'paused', { configurable: true, get: () => paused });
    Object.defineProperty(v, 'duration', { configurable: true, get: () => 100 });
    Object.defineProperty(v, 'currentTime', { configurable: true, get: () => time, set: (t: number) => (time = t) });
    return {
        play: () => (paused = false),
        to: (t: number) => {
            time = t;
            v.dispatchEvent(new Event('timeupdate'));
        },
        pause: () => {
            paused = true;
            v.dispatchEvent(new Event('pause'));
        },
        seek: (t: number) => {
            v.dispatchEvent(new Event('seeking'));
            time = t;
            v.dispatchEvent(new Event('timeupdate'));
        },
    };
}

const sent = () => (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => JSON.parse(c[1].body));

describe('useWatchReport', () => {
    beforeEach(() => vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('{}')))));
    afterEach(() => vi.unstubAllGlobals());

    it('counts only what was really played, and the furthest point, on pause', () => {
        const { container } = render(<Player id={7} />);
        const v = control(container.querySelector('video')!);
        act(() => {
            v.play();
            for (let t = 0; t <= 10; t += 0.5) v.to(t); // 10 s of normal playback
            v.seek(80); // a jump: not watched
            v.to(80.5);
            v.pause();
        });
        expect(sent()).toEqual([{ media_id: 7, seconds: 10, percent: 81 }]);
    });

    it('reports nothing for videos that are not a post’s', () => {
        const { container } = render(<Player />);
        const v = control(container.querySelector('video')!);
        act(() => {
            v.play();
            v.to(1);
            v.to(2);
            v.pause();
        });
        expect(sent()).toEqual([]);
    });
});
