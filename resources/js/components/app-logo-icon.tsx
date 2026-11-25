import { SVGAttributes, useId } from 'react';

/** Brand mark: a sun over the steppe's rolling hills, on a crimson-to-amber tile. Carries its own colours. */
export default function AppLogoIcon({ className = '', ...props }: SVGAttributes<SVGElement>) {
    const id = useId();
    return (
        <svg {...props} className={className.replace(/\bfill-current\b/g, '')} viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg" aria-hidden>
            <defs>
                <linearGradient id={`${id}g`} x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor="#E11D48" />
                    <stop offset="1" stopColor="#F59E0B" />
                </linearGradient>
            </defs>
            <rect width="40" height="40" rx="11" fill={`url(#${id}g)`} />
            <circle cx="20" cy="16" r="6" fill="#fff" />
            <path d="M4 31c5-6 9-8 13-4 3-5 8-8 13-3 2 2 4 4 6 7v1c0 3-2 5-5 5H9c-3 0-5-2-5-5v-1Z" fill="#fff" fillOpacity=".92" />
        </svg>
    );
}
