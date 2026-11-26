import { type SVGAttributes } from 'react';

/** The sun rising above an open horizon. */
export default function AppLogoIcon({ className = '', ...props }: SVGAttributes<SVGElement>) {
    return (
        <svg {...props} className={className.replace(/\bfill-current\b/g, '')} viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg" aria-hidden>
            <rect width="40" height="40" rx="10" fill="#d4f47c" />
            <circle cx="20" cy="15" r="5" fill="#20251e" />
            <path d="M7 29 16 21l5 4 6-5 6 9H7Z" fill="#20251e" />
        </svg>
    );
}
