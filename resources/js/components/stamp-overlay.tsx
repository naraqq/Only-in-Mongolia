import { useEffect, useState } from 'react';

// Spots the label moves between, as [left %, top %].
const SPOTS: [number, number][] = [
    [8, 10],
    [56, 18],
    [20, 46],
    [62, 58],
    [10, 78],
    [48, 84],
];

/**
 * The viewer's ID over a paid video, the same text that is stamped on paid photos. It drifts to a new spot
 * every few seconds, so a screen recording can't simply be cropped to remove it. Clicks pass through to the player.
 */
export default function StampOverlay({ text }: { text?: string | null }) {
    const [spot, setSpot] = useState(() => Math.floor(Math.random() * SPOTS.length));

    useEffect(() => {
        if (!text) return;
        const id = setInterval(() => setSpot((s) => (s + 1 + Math.floor(Math.random() * (SPOTS.length - 1))) % SPOTS.length), 7000);
        return () => clearInterval(id);
    }, [text]);

    if (!text) return null;
    const [left, top] = SPOTS[spot];

    return (
        <span
            aria-hidden
            className="pointer-events-none absolute z-[1] -rotate-12 font-mono text-xs font-bold whitespace-nowrap text-white/45 transition-[left,top] duration-[2500ms] ease-in-out select-none [text-shadow:0_0_3px_rgb(0_0_0/0.6)] motion-reduce:transition-none sm:text-sm"
            style={{ left: `${left}%`, top: `${top}%` }}
        >
            {text}
        </span>
    );
}
