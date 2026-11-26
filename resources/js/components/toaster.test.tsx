import { toast } from '@/lib/toast';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Toaster from './toaster';

describe('<Toaster />', () => {
    it('shows toasts, runs the action and closes', () => {
        const follow = vi.fn();
        render(<Toaster />);

        act(() => {
            toast('Follow this creator to message them.', { action: { label: 'Follow', onClick: follow } });
        });
        expect(screen.getByText('Follow this creator to message them.')).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: 'Follow' }));
        expect(follow).toHaveBeenCalledOnce();
        expect(screen.queryByText('Follow this creator to message them.')).toBeNull(); // the action closes it
    });

    it('closes from the X', () => {
        render(<Toaster />);
        act(() => {
            toast('Saved');
        });
        fireEvent.click(screen.getByRole('button', { name: 'Close' }));
        expect(screen.queryByText('Saved')).toBeNull();
    });
});
