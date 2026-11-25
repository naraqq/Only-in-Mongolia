/** Small display helpers shared across pages. Kept out of component files so Vite's hot reload keeps working. */

const GRADIENTS = [
    'from-rose-400 to-fuchsia-600',
    'from-amber-400 to-rose-500',
    'from-sky-400 to-indigo-600',
    'from-emerald-400 to-teal-600',
    'from-violet-400 to-purple-700',
];

/** A stable avatar colour for a handle or name. */
export const avatarGradient = (key: string) => GRADIENTS[[...key].reduce((a, c) => a + c.charCodeAt(0), 0) % GRADIENTS.length];

/** 9900 → "₮9,900" */
/** "now", "5m", "3h", "2d", then the date. `t` is the translator from useT(). */
export const timeAgo = (iso: string, t: (key: 'ago.now' | 'ago.m' | 'ago.h' | 'ago.d', vars?: Record<string, number>) => string) => {
    const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return t('ago.now');
    if (s < 3600) return t('ago.m', { n: Math.floor(s / 60) });
    if (s < 86400) return t('ago.h', { n: Math.floor(s / 3600) });
    if (s < 7 * 86400) return t('ago.d', { n: Math.floor(s / 86400) });
    return iso.slice(0, 10).replaceAll('-', '.');
};

export const mnt = (n: number) => '₮' + n.toLocaleString('en-US');

/** Is a pay-per-view (or tip) amount within the allowed range? */
export const priceOk = (value: number, limits: { min: number; max: number }) => value >= limits.min && value <= limits.max;

/** "2026-11-27T14:30:00+08:00" → "2026-11-27T14:30" for <input type="datetime-local">, in the browser's time zone. */
export const toLocalInput = (iso: string | null) => {
    if (!iso) return '';
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
