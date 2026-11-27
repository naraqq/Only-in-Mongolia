import { useT, type TKey } from '@/lib/i18n';
import { CalendarClock, CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * The app's own date (and time) picker, instead of the browser's: same look in every browser, in the
 * app's language, with quick picks. Values use the same strings as the native inputs did, so forms don't
 * change: "2026-11-27T20:00" (datetime) or "2026-11-27" (date), in the browser's time zone.
 * Opens as a dropdown on wide screens and as a bottom sheet on phones.
 */

type Mode = 'datetime' | 'date';

const pad = (n: number) => String(n).padStart(2, '0');
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const sameDay = (a: Date, b: Date) => dayKey(a) === dayKey(b);
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);
const HOURS = Array.from({ length: 24 }, (_, i) => i);

function parse(value: string): Date | null {
    if (!value) return null;
    const [date, time = '00:00'] = value.split('T');
    const [y, m, d] = date.split('-').map(Number);
    const [hh, mm] = time.split(':').map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d, hh || 0, mm || 0);
}

function format(d: Date, mode: Mode) {
    return mode === 'date' ? dayKey(d) : `${dayKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** The next whole 5 minutes at or after `d`. */
function ceil5(d: Date) {
    const r = new Date(d);
    r.setSeconds(0, 0);
    r.setMinutes(Math.ceil(r.getMinutes() / 5) * 5);
    return r;
}

export default function DateTimePicker({
    value,
    onChange,
    mode = 'datetime',
    min,
    placeholder,
    clearable = false,
    autoOpen = false,
    className = '',
}: {
    value: string;
    onChange: (value: string) => void;
    mode?: Mode;
    /** Earliest allowed moment (default: now). */
    min?: Date;
    placeholder?: string;
    clearable?: boolean;
    /** Open the picker straight away (e.g. right after choosing "Schedule"). */
    autoOpen?: boolean;
    className?: string;
}) {
    const { t, locale } = useT();
    const intl = locale === 'mn' ? 'mn-MN' : 'en-GB';
    const [open, setOpen] = useState(autoOpen);
    const box = useRef<HTMLDivElement>(null);
    const panel = useRef<HTMLDivElement>(null);
    // Wide screens: the panel floats under the button (drawn at the page level so no card can clip it).
    const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
    const selected = parse(value);
    // "Now" is read when the picker opens, so quick picks and limits stay fresh.
    const [now, setNow] = useState(() => new Date());
    const floor = useMemo(
        () => (min ? ceil5(min) : mode === 'date' ? new Date(now.getFullYear(), now.getMonth(), now.getDate()) : ceil5(now)),
        [min, mode, now],
    );
    const [month, setMonth] = useState(() => {
        const base = selected ?? floor;
        return new Date(base.getFullYear(), base.getMonth(), 1);
    });

    useEffect(() => {
        if (!open) return;
        const close = (e: MouseEvent | TouchEvent) => {
            const target = e.target as Node;
            if (!box.current?.contains(target) && !panel.current?.contains(target)) setOpen(false);
        };
        const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
        document.addEventListener('mousedown', close);
        document.addEventListener('touchstart', close);
        document.addEventListener('keydown', esc);
        return () => {
            document.removeEventListener('mousedown', close);
            document.removeEventListener('touchstart', close);
            document.removeEventListener('keydown', esc);
        };
    }, [open]);

    useLayoutEffect(() => {
        if (!open) return;
        const place = () => {
            const rect = box.current?.getBoundingClientRect();
            const width = panel.current?.offsetWidth ?? 420;
            const height = panel.current?.offsetHeight ?? 420;
            if (!rect) return;
            const below = rect.bottom + 8 + height <= window.innerHeight || rect.top < height + 8;
            setPos({
                top: below ? rect.bottom + 8 : rect.top - height - 8,
                left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
            });
        };
        place();
        window.addEventListener('resize', place);
        window.addEventListener('scroll', place, true);
        return () => {
            window.removeEventListener('resize', place);
            window.removeEventListener('scroll', place, true);
        };
    }, [open, mode]);

    function toggle() {
        if (!open) {
            const n = new Date();
            setNow(n);
            const base = selected ?? min ?? n;
            setMonth(new Date(base.getFullYear(), base.getMonth(), 1));
        }
        setOpen((o) => !o);
    }

    /** Set a moment, never earlier than allowed. */
    function commit(d: Date) {
        onChange(format(mode === 'datetime' && d < floor ? floor : d, mode));
    }

    function pickDay(day: Date) {
        if (mode === 'date') {
            commit(day);
            setOpen(false);
            return;
        }
        const next = new Date(day);
        if (selected) next.setHours(selected.getHours(), selected.getMinutes());
        else next.setHours(20, 0); // evenings are when fans are around
        commit(next);
    }

    function pickTime(hours: number | null, minutes: number | null) {
        const base = new Date(selected ?? floor);
        if (hours !== null) base.setHours(hours);
        if (minutes !== null) base.setMinutes(minutes);
        commit(base);
    }

    // Calendar: weeks start on Monday.
    const days = useMemo(() => {
        const first = new Date(month);
        const lead = (first.getDay() + 6) % 7;
        const start = new Date(first.getFullYear(), first.getMonth(), 1 - lead);
        return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
    }, [month]);
    const weekdays = useMemo(
        () => Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(intl, { weekday: 'narrow' }).format(new Date(2024, 0, 1 + i))),
        [intl],
    );
    const floorDay = new Date(floor.getFullYear(), floor.getMonth(), floor.getDate());
    const canGoBack = new Date(month.getFullYear(), month.getMonth(), 0) >= floorDay;

    // Quick picks.
    const quick: { label: TKey; at: Date }[] = useMemo(() => {
        const d = (days: number, h: number, m = 0) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, h, m);
        if (mode === 'date') {
            return [
                { label: 'dtp.inWeek', at: d(7, 0) },
                { label: 'dtp.inMonth', at: new Date(now.getFullYear(), now.getMonth() + 1, now.getDate()) },
                { label: 'dtp.monthEnd', at: new Date(now.getFullYear(), now.getMonth() + 1, 0) },
            ];
        }
        const evening = now.getHours() < 19 ? { label: 'dtp.tonight' as TKey, at: d(0, 20) } : { label: 'dtp.tomorrowEvening' as TKey, at: d(1, 20) };
        return [{ label: 'dtp.inHour', at: ceil5(new Date(now.getTime() + 3600_000)) }, evening, { label: 'dtp.tomorrowMorning', at: d(1, 10) }];
    }, [mode, now]);

    const shown = selected
        ? new Intl.DateTimeFormat(intl, {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              ...(mode === 'datetime' ? { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' as const } : { year: 'numeric' }),
          }).format(selected)
        : null;
    const Icon = mode === 'datetime' ? CalendarClock : CalendarDays;
    const isToday = selected && sameDay(selected, floor);

    return (
        <div ref={box} className={`relative inline-block ${className}`}>
            <button
                type="button"
                onClick={toggle}
                aria-haspopup="dialog"
                aria-expanded={open}
                className={`bg-muted hover:bg-muted/70 inline-flex h-9 w-full items-center gap-2 rounded-xl px-3 text-sm transition ${open ? 'ring-primary/40 ring-2' : ''}`}
            >
                <Icon className="text-muted-foreground size-4 shrink-0" />
                <span className={`truncate ${shown ? 'font-semibold' : 'text-muted-foreground'}`}>{shown ?? placeholder ?? t('dtp.pick')}</span>
                {clearable && selected && (
                    <span
                        role="button"
                        tabIndex={0}
                        aria-label={t('dtp.clear')}
                        onClick={(e) => {
                            e.stopPropagation();
                            onChange('');
                        }}
                        onKeyDown={(e) => e.key === 'Enter' && onChange('')}
                        className="text-muted-foreground hover:text-foreground -mr-1 ml-auto grid size-6 place-items-center rounded-full"
                    >
                        <X className="size-3.5" />
                    </span>
                )}
            </button>

            {open &&
                createPortal(
                    <>
                        {/* Phones: dim the page behind the bottom sheet. */}
                        <div className="fixed inset-0 z-[59] bg-black/30 sm:hidden" aria-hidden />
                        <div
                            ref={panel}
                            role="dialog"
                            aria-label={t('dtp.pick')}
                            style={pos ? ({ '--dtp-top': `${pos.top}px`, '--dtp-left': `${pos.left}px` } as React.CSSProperties) : undefined}
                            className="bg-card border-border text-foreground animate-toast-in fixed inset-x-2 bottom-2 z-[60] rounded-2xl border p-3 shadow-2xl sm:inset-x-auto sm:top-(--dtp-top) sm:bottom-auto sm:left-(--dtp-left) sm:w-auto"
                        >
                            <div className="mb-3 flex flex-wrap gap-1.5">
                                {quick
                                    .filter((q) => q.at >= (mode === 'date' ? floorDay : floor))
                                    .map((q) => (
                                        <button
                                            key={q.label}
                                            type="button"
                                            onClick={() => {
                                                commit(q.at);
                                                setMonth(new Date(q.at.getFullYear(), q.at.getMonth(), 1));
                                                if (mode === 'date') setOpen(false);
                                            }}
                                            className="bg-primary/10 text-primary hover:bg-primary/20 h-8 rounded-full px-3 text-xs font-bold transition"
                                        >
                                            {t(q.label)}
                                        </button>
                                    ))}
                            </div>

                            <div className="flex flex-col gap-3 sm:flex-row">
                                {/* Calendar */}
                                <div className="w-full sm:w-[252px]">
                                    <div className="mb-1 flex items-center justify-between">
                                        <button
                                            type="button"
                                            disabled={!canGoBack}
                                            onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
                                            aria-label={t('dtp.prev')}
                                            className="hover:bg-muted grid size-8 place-items-center rounded-full disabled:opacity-30"
                                        >
                                            <ChevronLeft className="size-4" />
                                        </button>
                                        <span className="text-sm font-bold capitalize">
                                            {new Intl.DateTimeFormat(intl, { month: 'long', year: 'numeric' }).format(month)}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
                                            aria-label={t('dtp.next')}
                                            className="hover:bg-muted grid size-8 place-items-center rounded-full"
                                        >
                                            <ChevronRight className="size-4" />
                                        </button>
                                    </div>
                                    <div className="text-muted-foreground grid grid-cols-7 text-center text-[11px] font-semibold">
                                        {weekdays.map((w, i) => (
                                            <span key={i} className="py-1">
                                                {w}
                                            </span>
                                        ))}
                                    </div>
                                    <div className="grid grid-cols-7 gap-0.5">
                                        {days.map((day) => {
                                            const outside = day.getMonth() !== month.getMonth();
                                            const past = day < floorDay;
                                            const chosen = selected && sameDay(day, selected);
                                            const today = sameDay(day, now);
                                            return (
                                                <button
                                                    key={day.toISOString()}
                                                    type="button"
                                                    disabled={past}
                                                    onClick={() => pickDay(day)}
                                                    aria-pressed={!!chosen}
                                                    className={`grid h-9 place-items-center rounded-lg text-sm tabular-nums transition disabled:cursor-not-allowed disabled:opacity-25 ${
                                                        chosen
                                                            ? 'bg-primary text-primary-foreground font-bold'
                                                            : `hover:bg-muted ${outside ? 'text-muted-foreground/60' : ''} ${today ? 'ring-primary/50 font-bold ring-1 ring-inset' : ''}`
                                                    }`}
                                                >
                                                    {day.getDate()}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Time */}
                                {mode === 'datetime' && (
                                    <div className="border-border flex flex-col sm:border-l sm:pl-3">
                                        <span className="text-muted-foreground mb-1 text-xs font-semibold">{t('dtp.time')}</span>
                                        <div className="flex gap-1.5">
                                            <TimeColumn
                                                label={t('dtp.hour')}
                                                values={HOURS}
                                                current={selected?.getHours() ?? null}
                                                disabled={(h) => !!isToday && h < floor.getHours()}
                                                onPick={(h) => pickTime(h, null)}
                                            />
                                            <span className="self-center font-bold">:</span>
                                            <TimeColumn
                                                label={t('dtp.minute')}
                                                values={MINUTES}
                                                current={selected?.getMinutes() ?? null}
                                                disabled={(m) => !!isToday && selected?.getHours() === floor.getHours() && m < floor.getMinutes()}
                                                onPick={(m) => pickTime(null, m)}
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>

                            {mode === 'datetime' && (
                                <div className="border-border mt-3 flex items-center gap-2 border-t pt-3">
                                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{shown ?? t('dtp.pickDay')}</span>
                                    <button
                                        type="button"
                                        onClick={() => setOpen(false)}
                                        disabled={!selected}
                                        className="bg-primary text-primary-foreground h-9 rounded-lg px-4 text-sm font-bold disabled:opacity-40"
                                    >
                                        {t('dtp.done')}
                                    </button>
                                </div>
                            )}
                        </div>
                    </>,
                    document.body,
                )}
        </div>
    );
}

/** A scrolling column of hours or minutes; the chosen one scrolls into view. */
function TimeColumn({
    label,
    values,
    current,
    disabled,
    onPick,
}: {
    label: string;
    values: number[];
    current: number | null;
    disabled: (v: number) => boolean;
    onPick: (v: number) => void;
}) {
    const list = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const el = list.current?.querySelector<HTMLElement>('[aria-pressed="true"]');
        if (el && list.current) list.current.scrollTop = el.offsetTop - list.current.clientHeight / 2 + el.clientHeight / 2;
    }, [current]);

    return (
        <div
            ref={list}
            role="group"
            aria-label={label}
            className="bg-muted/50 flex h-[264px] w-14 flex-col gap-0.5 overflow-y-auto rounded-lg p-1 max-sm:h-40"
        >
            {values.map((v) => (
                <button
                    key={v}
                    type="button"
                    disabled={disabled(v)}
                    onClick={() => onPick(v)}
                    aria-pressed={current === v}
                    className={`h-8 shrink-0 rounded-md text-sm tabular-nums transition disabled:opacity-25 ${
                        current === v ? 'bg-primary text-primary-foreground font-bold' : 'hover:bg-muted'
                    }`}
                >
                    {pad(v)}
                </button>
            ))}
        </div>
    );
}
