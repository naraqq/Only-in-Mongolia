import { describe, expect, it, vi } from 'vitest';

// pay-method imports Inertia for the balance hook; the pure helper doesn't need it.
vi.mock('@inertiajs/react', () => ({ usePage: () => ({ props: { auth: { user: null } } }), Link: () => null }));

const { defaultMethod } = await import('./pay-method');

describe('defaultMethod', () => {
    it('picks the wallet when it covers the amount', () => {
        expect(defaultMethod(10000, 9900)).toBe('wallet');
        expect(defaultMethod(9900, 9900)).toBe('wallet');
    });

    it('falls back to QPay when the wallet is short or the amount is nothing', () => {
        expect(defaultMethod(5000, 9900)).toBe('qpay');
        expect(defaultMethod(10000, 0)).toBe('qpay');
    });
});
