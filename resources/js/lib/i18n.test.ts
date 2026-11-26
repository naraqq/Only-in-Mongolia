import { describe, expect, it } from 'vitest';
import { dictionaries, translate } from './i18n';

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('translations', () => {
    const { en, mn } = dictionaries;

    it('has every key in both languages', () => {
        expect(Object.keys(mn).sort()).toEqual(Object.keys(en).sort());
    });

    it('uses the same {placeholders} in both languages', () => {
        const mismatched = Object.keys(en).filter(
            (k) => placeholders(en[k as keyof typeof en]).join() !== placeholders(mn[k as keyof typeof mn]).join(),
        );
        expect(mismatched).toEqual([]);
    });

    it('has no empty strings', () => {
        const empty = [...Object.entries(en), ...Object.entries(mn)].filter(([, v]) => !v.trim()).map(([k]) => k);
        expect(empty).toEqual([]);
    });

    it('fills placeholders, falls back to English, then to the key', () => {
        expect(translate('mn', 'wal.daysLeft', { n: 3 })).toBe('3 хоног үлдсэн');
        expect(translate('en', 'wal.daysLeft', { n: 3 })).toBe('3 days left');
        expect(translate('xx', 'wal.daysLeft', { n: 3 })).toBe('3 хоног үлдсэн'); // unknown language: Mongolian
        expect(translate('en', 'no.such.key')).toBe('no.such.key');
        expect(translate('en', 'wal.daysLeft')).toBe('{n} days left'); // a missing value stays visible
    });
});
