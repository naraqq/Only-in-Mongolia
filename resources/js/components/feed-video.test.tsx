import FeedVideo from '@/components/feed-video';
import VideoPlayer from '@/components/video-player';
import { resetFeed } from '@/lib/feed-video';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@inertiajs/react', () => ({ usePage: () => ({ props: { locale: 'en' } }) }));

/** Each observed element's IntersectionObserver callback, to say how much of it is "on screen". */
const observers = new Map<Element, (entries: Partial<IntersectionObserverEntry>[]) => void>();
let reducedMotion = false;

beforeEach(() => {
    resetFeed();
    observers.clear();
    reducedMotion = false;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
        cb(0);
        return 0;
    });
    vi.stubGlobal(
        'IntersectionObserver',
        class {
            constructor(private cb: (entries: Partial<IntersectionObserverEntry>[]) => void) {}
            observe(el: Element) {
                observers.set(el, this.cb);
            }
            disconnect() {}
        },
    );
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: reducedMotion && q.includes('reduced-motion') }));

    // jsdom has no playback: play()/pause() flip `paused` per element and fire the events.
    const paused = new WeakMap<HTMLMediaElement, boolean>();
    Object.defineProperty(HTMLMediaElement.prototype, 'paused', {
        configurable: true,
        get: function () {
            return paused.get(this) ?? true;
        },
    });
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement) {
        paused.set(this, false);
        this.dispatchEvent(new Event('play'));
        return Promise.resolve();
    });
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (this: HTMLMediaElement) {
        paused.set(this, true);
        this.dispatchEvent(new Event('pause'));
    });
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

function onScreen(video: HTMLVideoElement, ratio: number) {
    act(() => observers.get(video.parentElement!)!([{ isIntersecting: ratio > 0, intersectionRatio: ratio }]));
}

function twoVideos() {
    const { container } = render(
        <>
            <FeedVideo src="/media/1" />
            <FeedVideo src="/media/2" />
        </>,
    );
    return Array.from(container.querySelectorAll('video')) as [HTMLVideoElement, HTMLVideoElement];
}

describe('FeedVideo', () => {
    it('plays the video that is on screen, muted, and switches as you scroll', () => {
        const [a, b] = twoVideos();
        onScreen(a, 1);
        onScreen(b, 0.3);
        expect(a.paused).toBe(false);
        expect(a.muted).toBe(true);
        expect(b.paused).toBe(true);

        onScreen(a, 0.2);
        onScreen(b, 0.9);
        expect(a.paused).toBe(true);
        expect(b.paused).toBe(false);
    });

    it('sound is one switch for the whole feed', () => {
        const [a, b] = twoVideos();
        onScreen(a, 1);
        fireEvent.click(screen.getAllByRole('button', { name: 'Unmute' })[0]);
        expect(a.muted).toBe(false);
        expect(b.muted).toBe(false);
        expect(screen.getAllByRole('button', { name: 'Mute' })).toHaveLength(2);
    });

    it('a tap pauses and plays it where it is, and it stays paused; a double tap likes instead', () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] }); // not requestAnimationFrame (autoplay uses it)
        const like = vi.fn();
        const { container } = render(<FeedVideo src="/media/1" onDoubleTap={like} />);
        const video = container.querySelector('video')!;
        onScreen(video, 1);
        expect(video.paused).toBe(false); // autoplay
        const surface = () => container.querySelector('[role="button"][tabindex="0"]')!;

        fireEvent.pointerUp(surface(), { button: 0 });
        act(() => vi.advanceTimersByTime(300));
        expect(video.paused).toBe(true);
        onScreen(video, 0.9); // still on screen: autoplay leaves it paused
        expect(video.paused).toBe(true);

        vi.advanceTimersByTime(1000);
        fireEvent.pointerUp(surface(), { button: 0 });
        act(() => vi.advanceTimersByTime(300));
        expect(video.paused).toBe(false);

        vi.advanceTimersByTime(1000);
        fireEvent.pointerUp(surface(), { button: 0 });
        fireEvent.pointerUp(surface(), { button: 0 });
        act(() => vi.advanceTimersByTime(300));
        expect(like).toHaveBeenCalledOnce();
        expect(video.paused).toBe(false); // a like doesn't pause it
    });

    it('waits while a full player is playing, and carries on after', () => {
        const { container } = render(
            <>
                <FeedVideo src="/media/1" />
                <VideoPlayer src="/media/9" />
            </>,
        );
        const [feed, full] = Array.from(container.querySelectorAll('video'));
        onScreen(feed, 1);
        expect(feed.paused).toBe(false);

        act(() => void full.play());
        expect(feed.paused).toBe(true);
        act(() => full.pause());
        expect(feed.paused).toBe(false);
    });

    it('stays still while its post is open full screen', () => {
        const { container, rerender } = render(<FeedVideo src="/media/1" />);
        const video = container.querySelector('video')!;
        onScreen(video, 1);
        rerender(<FeedVideo src="/media/1" active={false} />);
        expect(video.paused).toBe(true);
    });

    it('lets go of its download while the full player has the same video, and comes back at the same moment', () => {
        const { container, rerender } = render(<FeedVideo src="/media/1" />);
        const video = container.querySelector('video')!;
        video.currentTime = 12;
        rerender(<FeedVideo src="/media/1" active={false} />);
        expect(video.hasAttribute('src')).toBe(false); // the connection is free for the full player

        rerender(<FeedVideo src="/media/1" active />);
        expect(video.getAttribute('src')).toBe('/media/1#t=12');
    });

    it('a long video that ended is not started over while still on screen', () => {
        const [a] = twoVideos();
        onScreen(a, 1);
        act(() => {
            a.pause();
            a.dispatchEvent(new Event('ended'));
        });
        expect(a.paused).toBe(true);
        onScreen(a, 0); // scrolled away…
        onScreen(a, 1); // …and back
        expect(a.paused).toBe(false);
    });

    it('does not autoplay for people who asked for less motion', () => {
        reducedMotion = true;
        const { container } = render(<FeedVideo src="/media/1" />);
        const video = container.querySelector('video')!;
        onScreen(video, 1);
        expect(video.paused).toBe(true);
        expect(container.querySelector('.lucide-play')).toBeTruthy(); // a play button instead
    });
});
