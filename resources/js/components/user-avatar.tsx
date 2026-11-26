import { avatarGradient } from '@/lib/format';

/**
 * A round profile photo, or (without one) the first letter(s) on a colour picked from `seed`.
 * Size and ring come from `className`, e.g. "size-10" or "size-24 text-4xl ring-4 ring-white".
 */
export default function UserAvatar({
    name,
    src,
    seed,
    className = 'size-10',
    letters = 1,
}: {
    name: string;
    src?: string | null;
    seed?: string;
    className?: string;
    letters?: 1 | 2;
}) {
    if (src) {
        return <img src={src} alt="" className={`shrink-0 rounded-full bg-zinc-200 object-cover dark:bg-zinc-800 ${className}`} loading="lazy" />;
    }
    const text =
        letters === 2
            ? name
                  .trim()
                  .split(/\s+/)
                  .map((w) => w.charAt(0))
                  .join('')
                  .slice(0, 2)
                  .toUpperCase()
            : name.trim().charAt(0).toUpperCase();

    return (
        <span
            className={`grid shrink-0 place-items-center rounded-full bg-gradient-to-br font-bold text-white ${avatarGradient(seed ?? name)} ${className}`}
            aria-hidden
        >
            {text}
        </span>
    );
}
