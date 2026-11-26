import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import PayMethod from './pay-method';

const page = vi.hoisted(() => ({ balance: 0 }));

vi.mock('@inertiajs/react', () => ({
    usePage: () => ({ props: { auth: { user: { wallet_balance: page.balance } } } }),
    Link: () => null,
}));

vi.mock('@/lib/i18n', () => ({ useT: () => ({ t: (key: string) => key }) }));

beforeEach(() => {
    page.balance = 0;
});

it('lets fans switch between payment methods when the wallet covers the purchase', () => {
    page.balance = 9900;
    const onChange = vi.fn();
    const { rerender } = render(<PayMethod amount={9900} value="qpay" onChange={onChange} />);

    fireEvent.click(screen.getByRole('radio', { name: /wal.title/ }));
    expect(onChange).toHaveBeenCalledWith('wallet');

    rerender(<PayMethod amount={9900} value="wallet" onChange={onChange} />);
    expect(screen.getByRole('radio', { checked: true, name: /wal.title/ })).toBeTruthy();

    fireEvent.click(screen.getByRole('radio', { name: /QPay/ }));
    expect(onChange).toHaveBeenLastCalledWith('qpay');
});

it('prevents wallet selection when the balance falls short', () => {
    page.balance = 9899;
    const onChange = vi.fn();
    render(<PayMethod amount={9900} value="qpay" onChange={onChange} />);

    const wallet = screen.getByRole<HTMLButtonElement>('radio', { name: /wal.title/ });
    expect(wallet.disabled).toBe(true);
    fireEvent.click(wallet);
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('radio', { name: /QPay/, checked: true })).toBeTruthy();
});
