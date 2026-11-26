import { type SharedData } from '@/types';
import { usePage } from '@inertiajs/react';
import AppLogoIcon from './app-logo-icon';

/** Logo mark plus the product name. */
export default function AppLogo({ className = '' }: { className?: string }) {
    const { name } = usePage<SharedData>().props;
    return (
        <span className={`flex min-w-0 items-center gap-2.5 ${className}`}>
            <AppLogoIcon className="size-8 shrink-0" />
            <span className="truncate text-[17px] leading-none font-extrabold tracking-tight">{name}</span>
        </span>
    );
}
