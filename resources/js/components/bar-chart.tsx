import { useT } from '@/lib/i18n';
import { useState } from 'react';

type Point = { date: string; value: number };

const W = 600; // drawing units; the SVG scales to its container
const H = 160;
const PAD_LEFT = 52;
const PAD_BOTTOM = 26;

/**
 * One series of daily bars (single hue, so no legend: the title names it). Thin bars with a 2px gap,
 * 4px rounded tops sitting on the baseline, a recessive grid, a tooltip on hover/focus, and a table view.
 */
export default function BarChart({ title, data, format }: { title: string; data: Point[]; format: (n: number) => string }) {
    const { t } = useT();
    const [hover, setHover] = useState<number | null>(null);
    const max = Math.max(1, ...data.map((d) => d.value));
    const nice = niceMax(max);
    const plotW = W - PAD_LEFT;
    const plotH = H - PAD_BOTTOM;
    const slot = plotW / data.length;
    const barW = Math.max(2, slot - 2);
    const y = (v: number) => plotH - (v / nice) * plotH;
    const total = data.reduce((s, d) => s + d.value, 0);
    const day = (iso: string) => iso.slice(5).replace('-', '.');

    return (
        <figure className="rounded-2xl border p-4">
            <figcaption className="flex items-baseline justify-between gap-3">
                <span className="font-bold">{title}</span>
                <span className="text-muted-foreground text-sm tabular-nums">{format(total)}</span>
            </figcaption>

            <div className="relative mt-3">
                <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full overflow-visible" role="img" aria-label={`${title}: ${format(total)}`}>
                    {/* Recessive grid + y labels */}
                    {[0, 0.5, 1].map((f) => (
                        <g key={f}>
                            <line x1={PAD_LEFT} x2={W} y1={y(nice * f)} y2={y(nice * f)} className="stroke-border" strokeWidth={1} />
                            <text x={PAD_LEFT - 6} y={y(nice * f) + 4} textAnchor="end" className="fill-muted-foreground text-[15px] tabular-nums">
                                {compact(nice * f)}
                            </text>
                        </g>
                    ))}
                    {/* Bars */}
                    {data.map((d, i) => {
                        const h = Math.max(0, plotH - y(d.value));
                        const x = PAD_LEFT + i * slot + 1;
                        return (
                            <g key={d.date}>
                                {h > 0 && (
                                    <path
                                        d={topRounded(x, plotH - h, barW, h, Math.min(4, barW / 2, h))}
                                        className={`fill-primary transition-opacity ${hover !== null && hover !== i ? 'opacity-50' : ''}`}
                                    />
                                )}
                                {/* Hit target: the whole column, bigger than the bar */}
                                <rect
                                    x={PAD_LEFT + i * slot}
                                    y={0}
                                    width={slot}
                                    height={plotH}
                                    fill="transparent"
                                    tabIndex={0}
                                    onMouseEnter={() => setHover(i)}
                                    onMouseLeave={() => setHover(null)}
                                    onFocus={() => setHover(i)}
                                    onBlur={() => setHover(null)}
                                    aria-label={`${d.date}: ${format(d.value)}`}
                                />
                            </g>
                        );
                    })}
                    {/* X labels: first, middle, last */}
                    {[0, Math.floor(data.length / 2), data.length - 1].map((i) => (
                        <text key={i} x={PAD_LEFT + i * slot + slot / 2} y={H - 4} textAnchor="middle" className="fill-muted-foreground text-[15px]">
                            {data[i] && day(data[i].date)}
                        </text>
                    ))}
                </svg>
                {hover !== null && data[hover] && (
                    <div
                        className="bg-popover text-popover-foreground pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-lg border px-2.5 py-1.5 text-xs shadow-md"
                        style={{ left: `${((PAD_LEFT + hover * slot + slot / 2) / W) * 100}%` }}
                    >
                        <p className="text-muted-foreground">{data[hover].date.replaceAll('-', '.')}</p>
                        <p className="font-bold tabular-nums">{format(data[hover].value)}</p>
                    </div>
                )}
            </div>

            <details className="mt-2 text-sm">
                <summary className="text-muted-foreground cursor-pointer text-xs">{t('ad.table')}</summary>
                <table className="mt-2 w-full text-xs tabular-nums">
                    <tbody>
                        {data
                            .filter((d) => d.value > 0)
                            .map((d) => (
                                <tr key={d.date} className="border-t">
                                    <td className="py-1">{d.date.replaceAll('-', '.')}</td>
                                    <td className="py-1 text-right">{format(d.value)}</td>
                                </tr>
                            ))}
                    </tbody>
                </table>
            </details>
        </figure>
    );
}

/** A bar path with only the top corners rounded, so it stays anchored to the baseline. */
function topRounded(x: number, top: number, w: number, h: number, r: number) {
    return `M${x},${top + h} V${top + r} Q${x},${top} ${x + r},${top} H${x + w - r} Q${x + w},${top} ${x + w},${top + r} V${top + h} Z`;
}

/** A round axis maximum (1, 2, 2.5, 5 × 10ⁿ) at or above the data's max. */
function niceMax(v: number) {
    const p = 10 ** Math.floor(Math.log10(v));
    return [1, 2, 2.5, 5, 10].map((m) => m * p).find((m) => m >= v) ?? v;
}

function compact(n: number) {
    if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${+(n / 1_000).toFixed(1)}k`;
    return String(Math.round(n));
}
