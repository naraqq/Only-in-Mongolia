import AppLogoIcon from '@/components/app-logo-icon';
import { useSplash } from '@/lib/layout-area';
import { useState } from 'react';

/**
 * The brand splash between parts of the app (fan side ↔ studio ↔ admin ↔ sign-in): the logo zooms in, then
 * out as the whole screen fades to reveal the new layout. It covers the screen for under a second and never
 * holds up the page underneath, which is already loaded.
 */
export default function LayoutSplash({ name }: { name: string }) {
    const { key, label } = useSplash();
    // The last splash that finished; a new key shows straight away (same render, so nothing flashes first).
    const [done, setDone] = useState(0);

    if (key === 0 || key === done) return null;

    return (
        <div
            key={key}
            aria-hidden
            onAnimationEnd={(e) => e.target === e.currentTarget && setDone(key)}
            className="splash-screen bg-background fixed inset-0 z-[200] grid place-items-center"
        >
            <div className="flex flex-col items-center gap-4">
                <AppLogoIcon className="splash-logo size-20 drop-shadow-xl" />
                <div className="splash-text flex flex-col items-center gap-1">
                    <span className="text-2xl font-extrabold tracking-tight">{name}</span>
                    {label && <span className="text-muted-foreground text-xs font-bold tracking-[0.2em] uppercase">{label}</span>}
                </div>
            </div>
        </div>
    );
}
