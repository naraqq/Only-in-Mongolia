import VideoPlayer from '@/components/video-player';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@inertiajs/react', () => ({ usePage: () => ({ props: { locale: 'en' } }) }));

/** jsdom has no media playback: make play()/pause() flip `paused` and fire the events a browser would. */
beforeEach(() => {
    localStorage.clear();
    let paused = true;
    Object.defineProperty(HTMLMediaElement.prototype, 'paused', { configurable: true, get: () => paused });
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement) {
        paused = false;
        this.dispatchEvent(new Event('play'));
        return Promise.resolve();
    });
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (this: HTMLMediaElement) {
        paused = true;
        this.dispatchEvent(new Event('pause'));
    });
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
});

function withDuration(video: HTMLVideoElement, seconds: number) {
    Object.defineProperty(video, 'duration', { configurable: true, value: seconds });
    act(() => {
        video.dispatchEvent(new Event('loadedmetadata'));
    });
}

describe('VideoPlayer', () => {
    it('starts with a big play button and the length, then shows its own controls', () => {
        const { container } = render(<VideoPlayer src="/media/1" id="m1" />);
        const video = container.querySelector('video')!;
        expect(video.controls).toBe(false); // no browser controls
        withDuration(video, 125);
        expect(screen.getByText('2:05')).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: 'Play' }));
        expect(video.play).toHaveBeenCalled();
        expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy();
        expect(screen.getByRole('slider', { name: 'Seek' })).toBeTruthy();
    });

    it('answers the keyboard: skip, mute, play/pause', () => {
        const { container } = render(<VideoPlayer src="/media/1" />);
        const video = container.querySelector('video')!;
        withDuration(video, 100);
        const player = screen.getByLabelText('Video player');

        fireEvent.keyDown(player, { key: 'l' });
        expect(video.currentTime).toBe(10);
        fireEvent.keyDown(player, { key: 'ArrowLeft' });
        expect(video.currentTime).toBe(5);
        fireEvent.keyDown(player, { key: '5' });
        expect(video.currentTime).toBe(50);
        fireEvent.keyDown(player, { key: 'm' });
        expect(video.muted).toBe(true);
        expect(localStorage.getItem('vp.muted')).toBe('1'); // remembered for the next video
        fireEvent.keyDown(player, { key: ' ' });
        expect(video.play).toHaveBeenCalled();
    });

    it('only one video plays at a time', () => {
        const { container } = render(
            <>
                <VideoPlayer src="/media/1" />
                <VideoPlayer src="/media/2" />
            </>,
        );
        const [a, b] = Array.from(container.querySelectorAll('video'));
        act(() => void a.play());
        act(() => void b.play());
        expect(a.pause).toHaveBeenCalled();
    });

    it('continues a long video where it was left, with a way to start over', () => {
        localStorage.setItem('vp.pos.m7', '200');
        const { container } = render(<VideoPlayer src="/media/7" id="m7" autoPlay />);
        const video = container.querySelector('video')!;
        withDuration(video, 600);
        expect(video.currentTime).toBe(200);

        fireEvent.click(screen.getByRole('button', { name: 'Start over' }));
        expect(video.currentTime).toBe(0);
    });

    it('keeps paid videos stamped and out of picture-in-picture', () => {
        const { container } = render(<VideoPlayer src="/media/1" stamp="ID 12345" />);
        const video = container.querySelector('video')!;
        expect(screen.getByText('ID 12345')).toBeTruthy();
        expect(video.hasAttribute('disablepictureinpicture')).toBe(true);
        expect(screen.queryByRole('button', { name: 'Picture in picture' })).toBeNull();
    });

    it('says so when the video cannot play, and can try again', () => {
        const { container } = render(<VideoPlayer src="/media/1" />);
        const video = container.querySelector('video')!;
        act(() => {
            video.dispatchEvent(new Event('error'));
        });
        fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
        expect(video.load).toHaveBeenCalled();
    });
});
