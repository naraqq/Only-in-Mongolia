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
export const mnt = (n: number) => '₮' + n.toLocaleString('en-US');

/** Is a pay-per-view (or tip) amount within the allowed range? */
export const priceOk = (value: number, limits: { min: number; max: number }) => value >= limits.min && value <= limits.max;
