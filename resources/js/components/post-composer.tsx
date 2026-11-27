import DateTimePicker from '@/components/date-time-picker';
import InputError from '@/components/input-error';
import { LibraryButton, PickedThumbs, type Picked } from '@/components/library-picker';
import PriceField from '@/components/price-field';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import UploadTray from '@/components/upload-tray';
import UserAvatar from '@/components/user-avatar';
import { priceOk } from '@/lib/format';
import { useT, type TKey } from '@/lib/i18n';
import { toast } from '@/lib/toast';
import { formatBytes, formatDuration, MAX_BYTES, useUploads } from '@/lib/use-uploads';
import { type SharedData } from '@/types';
import { useForm, usePage } from '@inertiajs/react';
import {
    BarChart3,
    CalendarClock,
    Check,
    ChevronDown,
    Globe,
    ImagePlus,
    LoaderCircle,
    Lock,
    LockOpen,
    MessageCircleQuestion,
    Plus,
    ShieldCheck,
    Trash2,
    UploadCloud,
    X,
    type LucideIcon,
} from 'lucide-react';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type DragEvent, type ReactNode } from 'react';

type Audience = 'subscribers' | 'public' | 'ppv';
const AUDIENCES: { value: Audience; label: TKey; short: TKey; hint: TKey; icon: LucideIcon }[] = [
    { value: 'subscribers', label: 'po.subscribers', short: 'st.subscribers', hint: 'cmp.subsHint', icon: Lock },
    { value: 'public', label: 'po.public', short: 'po.public', hint: 'cmp.publicHint', icon: Globe },
    { value: 'ppv', label: 'ppv.option', short: 'ppv.option', hint: 'cmp.ppvHint', icon: LockOpen },
];
const ACCEPT = 'image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm,audio/*,.mp3,.m4a,.aac,.wav,.ogg,.opus,.flac';
const QA_MINUTES = [15, 30, 45, 60, 90, 120];

export type ComposerHandle = { focus: () => void };

/**
 * Write a post. Closed it's one calm line ("What's new?" and a few tools); once you start, it opens into the
 * full editor: text, photos/videos (pick, drop or from the library), a poll or a live Q&A, a publish time,
 * who sees it (one chip with a menu), and Publish. Used in the studio and on the home feed.
 */
const PostComposer = forwardRef<ComposerHandle, { adultAllowed: boolean; className?: string; initialPicked?: Picked[] }>(function PostComposer(
    { adultAllowed, className = '', initialPicked },
    ref,
) {
    const { t } = useT();
    const { auth, ppvLimits } = usePage<SharedData & { ppvLimits: { min: number; max: number } }>().props;
    const form = useForm({
        body: '',
        visibility: 'subscribers' as 'public' | 'subscribers',
        is_adult: false as boolean,
        price: 5000,
        publish_at: '',
        poll_options: null as string[] | null,
        qa_starts_at: '',
        qa_minutes: 60,
    });
    const [qa, setQa] = useState(false);
    const [audience, setAudience] = useState<Audience>('subscribers');
    const [schedule, setSchedule] = useState(false);
    // Files handed over from the library ("Post" there) start attached.
    const [picked, setPicked] = useState<Picked[]>(initialPicked ?? []);
    const [active, setActive] = useState(!!initialPicked?.length);
    const [dragging, setDragging] = useState(false);
    // Files upload the moment they're picked; Publish only sends their ids.
    const uploads = useUploads(10 - picked.length, t('up.leave'));
    // "Publish" pressed while files were still going up: publish as soon as they're done.
    const [autoPublish, setAutoPublish] = useState(false);
    const box = useRef<HTMLTextAreaElement>(null);
    const files = useRef<HTMLInputElement>(null);

    const ppv = audience === 'ppv';
    const poll = form.data.poll_options;
    const mediaErrors = Object.entries(form.errors).filter(([k]) => k.startsWith('media') || k.startsWith('uploads'));
    const pollErrors = Object.entries(form.errors).filter(([key]) => key.startsWith('poll_options'));
    const pollIncomplete = poll !== null && (!form.data.body.trim() || poll.some((option) => !option.trim()));
    const empty = !form.data.body.trim() && uploads.items.length === 0 && picked.length === 0;
    const qaIncomplete = qa && (!form.data.body.trim() || !form.data.qa_starts_at);
    const room = 10 - picked.length - uploads.items.length;
    const open = active || !empty || !!poll || qa || schedule || Object.keys(form.errors).length > 0;
    const blocked =
        form.processing ||
        autoPublish ||
        uploads.failed > 0 ||
        empty ||
        pollIncomplete ||
        qaIncomplete ||
        (ppv && !priceOk(form.data.price, ppvLimits)) ||
        (schedule && !form.data.publish_at);
    const current = AUDIENCES.find((a) => a.value === audience)!;

    useImperativeHandle(ref, () => ({
        focus: () => {
            setActive(true);
            requestAnimationFrame(() => box.current?.focus());
        },
    }));

    // The box grows with the text.
    useEffect(() => {
        const el = box.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${Math.min(Math.max(el.scrollHeight, open ? 56 : 24), 360)}px`;
    }, [form.data.body, open]);

    function pick(a: Audience) {
        setAudience(a);
        if (a !== 'ppv') form.setData('visibility', a);
    }

    function addFiles(list: FileList | File[]) {
        const refused = uploads.add(list);
        setActive(true);
        if (refused.some((r) => r.reason === 'count')) toast(t('up.tooMany'), { tone: 'error', icon: 'alert' });
        refused
            .filter((r) => r.reason !== 'count')
            .slice(0, 3)
            .forEach((r) =>
                toast(
                    r.reason === 'type' ? t('up.badType', { name: r.name }) : t('up.tooBig', { name: r.name, max: formatBytes(MAX_BYTES[r.kind!]) }),
                    {
                        tone: 'error',
                        icon: 'alert',
                    },
                ),
            );
    }

    function startPoll() {
        if (ppv) pick('subscribers');
        form.setData('poll_options', ['', '']);
        setActive(true);
        requestAnimationFrame(() => box.current?.focus());
    }

    function startQa() {
        if (ppv) pick('subscribers');
        setQa(true);
        setActive(true);
        requestAnimationFrame(() => box.current?.focus());
    }

    function reset(discardUploads = true) {
        uploads.clear(discardUploads);
        setAutoPublish(false);
        form.reset();
        form.clearErrors();
        setPicked([]);
        setAudience('subscribers');
        setSchedule(false);
        setQa(false);
        setActive(false);
    }

    function submit(e?: { preventDefault: () => void }) {
        e?.preventDefault();
        if (uploads.failed > 0) {
            toast(t('up.fixFirst'), { tone: 'error', icon: 'alert' });
            return;
        }
        if (blocked) return;
        if (!uploads.allDone) {
            uploads.items.filter((i) => i.status === 'paused').forEach((i) => uploads.resume(i.key));
            setAutoPublish(true);
            return;
        }
        form.transform((d) => ({
            ...d,
            vault: picked.map((p) => p.id),
            uploads: uploads.ids,
            price: ppv ? d.price : null,
            publish_at: schedule && d.publish_at ? new Date(d.publish_at).toISOString() : null,
            qa_starts_at: qa && d.qa_starts_at ? new Date(d.qa_starts_at).toISOString() : null,
            qa_minutes: qa ? d.qa_minutes : null,
        }));
        form.post(route('studio.posts.store'), { preserveScroll: true, onSuccess: () => reset(false) });
    }

    // Publish once the last file is up; stop waiting if one fails.
    useEffect(() => {
        if (!autoPublish) return;
        if (uploads.failed > 0) {
            setAutoPublish(false);
            toast(t('up.fixFirst'), { tone: 'error', icon: 'alert' });
        } else if (uploads.allDone) {
            setAutoPublish(false);
            submit();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoPublish, uploads.allDone, uploads.failed]);

    const onDrag = (e: DragEvent, over: boolean) => {
        if (!e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        setDragging(over);
    };

    return (
        <form
            onSubmit={submit}
            onDragOver={(e) => onDrag(e, true)}
            onDragLeave={(e) => onDrag(e, false)}
            onDrop={(e) => {
                onDrag(e, false);
                addFiles(e.dataTransfer.files);
            }}
            className={`bg-card relative rounded-2xl shadow-xs ring-1 transition ${
                open ? 'ring-primary/25' : 'ring-border/60 hover:ring-border'
            } ${dragging ? 'ring-primary ring-2' : ''} ${className}`}
        >
            {dragging && (
                <div className="bg-primary/10 text-primary pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-2xl text-sm font-bold">
                    <span className="flex items-center gap-2">
                        <ImagePlus className="size-5" /> {t('cmp.drop')}
                    </span>
                </div>
            )}

            {/* Writing */}
            <div className={`flex gap-3 ${open ? 'p-4' : 'items-center px-4 py-3'}`}>
                {auth.user && (
                    <UserAvatar
                        name={auth.user.name}
                        src={auth.user.avatar_url}
                        seed={auth.creator?.handle}
                        className={`shrink-0 transition-all ${open ? 'size-10 max-sm:hidden' : 'size-9'}`}
                    />
                )}
                {/* Everything lines up in one column beside the avatar. */}
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <textarea
                            ref={box}
                            rows={1}
                            value={form.data.body}
                            onFocus={() => setActive(true)}
                            onChange={(e) => form.setData('body', e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Escape' && empty && !poll && !qa) {
                                    setActive(false);
                                    box.current?.blur();
                                }
                                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(e);
                            }}
                            placeholder={t(poll ? 'poll.question' : qa ? 'qa.topic' : 'st.placeholder')}
                            maxLength={5000}
                            className={`placeholder:text-muted-foreground w-full resize-none bg-transparent leading-snug outline-none ${open ? 'pt-2 text-[17px]' : 'text-base'}`}
                        />
                        {/* Closed: a few tools on the line itself. */}
                        {!open && (
                            <div className="hidden shrink-0 items-center gap-0.5 sm:flex">
                                <Tool icon={ImagePlus} label={t('st.addMedia')} onClick={() => files.current?.click()} />
                                <Tool icon={BarChart3} label={t('poll.add')} onClick={startPoll} />
                                <Tool icon={MessageCircleQuestion} label={t('qa.add')} onClick={startQa} />
                            </div>
                        )}
                    </div>
                    <input
                        ref={files}
                        type="file"
                        multiple
                        accept={ACCEPT}
                        className="hidden"
                        onChange={(e) => {
                            addFiles(e.target.files ?? []);
                            e.target.value = '';
                        }}
                    />

                    {open && (
                        <div className="animate-toast-in">
                            <InputError message={form.errors.body} className="mt-1" />

                            {poll && (
                                <Panel
                                    icon={BarChart3}
                                    title={t('poll.options')}
                                    onRemove={() => form.setData('poll_options', null)}
                                    removeLabel={t('poll.remove')}
                                >
                                    <div className="flex flex-col gap-2">
                                        {poll.map((option, index) => (
                                            <div key={index} className="flex min-w-0 items-center gap-2">
                                                <input
                                                    aria-label={t('poll.option', { number: index + 1 })}
                                                    placeholder={t('poll.option', { number: index + 1 })}
                                                    value={option}
                                                    maxLength={80}
                                                    onChange={(event) =>
                                                        form.setData(
                                                            'poll_options',
                                                            poll.map((value, i) => (i === index ? event.target.value : value)),
                                                        )
                                                    }
                                                    className="bg-card focus-visible:ring-primary/40 h-10 min-w-0 flex-1 rounded-lg px-3 text-sm outline-none focus-visible:ring-2"
                                                />
                                                {poll.length > 2 && (
                                                    <button
                                                        type="button"
                                                        aria-label={t('poll.removeOption', { number: index + 1 })}
                                                        className="text-muted-foreground hover:bg-card hover:text-foreground grid size-9 shrink-0 place-items-center rounded-lg"
                                                        onClick={() =>
                                                            form.setData(
                                                                'poll_options',
                                                                poll.filter((_, i) => i !== index),
                                                            )
                                                        }
                                                    >
                                                        <X className="size-4" />
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                        {poll.length < 4 && (
                                            <button
                                                type="button"
                                                className="text-primary inline-flex h-9 items-center gap-1.5 self-start rounded-lg px-1 text-sm font-semibold hover:underline"
                                                onClick={() => form.setData('poll_options', [...poll, ''])}
                                            >
                                                <Plus className="size-4" /> {t('poll.addOption')}
                                            </button>
                                        )}
                                        {pollErrors.map(([key, error]) => (
                                            <InputError key={key} message={error} />
                                        ))}
                                    </div>
                                </Panel>
                            )}

                            {qa && (
                                <Panel
                                    icon={MessageCircleQuestion}
                                    title={t('qa.title')}
                                    onRemove={() => setQa(false)}
                                    removeLabel={t('qa.remove')}
                                    hint={t('qa.composerHint')}
                                    live
                                >
                                    <div className="flex flex-wrap items-center gap-2">
                                        <DateTimePicker
                                            value={form.data.qa_starts_at}
                                            onChange={(v) => form.setData('qa_starts_at', v)}
                                            min={schedule && form.data.publish_at ? new Date(form.data.publish_at) : undefined}
                                            placeholder={t('qa.startsAt')}
                                            className="[&>button]:bg-card"
                                        />
                                        <div className="bg-card inline-flex rounded-xl p-1" role="group" aria-label={t('qa.length')}>
                                            {QA_MINUTES.map((m) => (
                                                <button
                                                    key={m}
                                                    type="button"
                                                    onClick={() => form.setData('qa_minutes', m)}
                                                    aria-pressed={form.data.qa_minutes === m}
                                                    className={`h-7 rounded-lg px-2 text-xs font-semibold tabular-nums transition ${
                                                        form.data.qa_minutes === m
                                                            ? 'bg-primary text-primary-foreground'
                                                            : 'text-muted-foreground hover:text-foreground'
                                                    }`}
                                                >
                                                    {t('qa.minutes', { n: m })}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <InputError message={form.errors.qa_starts_at ?? form.errors.qa_minutes} />
                                </Panel>
                            )}

                            <PickedThumbs picked={picked} onRemove={(id) => setPicked((p) => p.filter((x) => x.id !== id))} className="mt-3" />
                            <UploadTray
                                items={uploads.items}
                                onRemove={uploads.remove}
                                onPause={uploads.pause}
                                onResume={uploads.resume}
                                onMove={uploads.move}
                                onAddMore={room > 0 ? () => files.current?.click() : undefined}
                                className="mt-3"
                            />
                            {uploads.items.length > 0 && !uploads.allDone && (
                                <UploadSummary
                                    done={uploads.items.length - uploads.pending}
                                    total={uploads.items.length}
                                    percent={uploads.percent}
                                    speed={uploads.speed}
                                    secondsLeft={uploads.secondsLeft}
                                    failed={uploads.failed}
                                />
                            )}
                            {mediaErrors.map(([k, v]) => (
                                <InputError key={k} message={v} />
                            ))}
                            <InputError message={form.errors.is_adult} />

                            {/* What's set: publish time, price, 18+. */}
                            {(schedule || ppv || form.data.is_adult) && (
                                <div className="mt-3 flex flex-wrap items-center gap-2">
                                    {schedule && (
                                        <span className="inline-flex items-center rounded-xl bg-sky-500/10 pr-1 text-sky-700 dark:text-sky-300">
                                            <DateTimePicker
                                                value={form.data.publish_at}
                                                onChange={(v) => form.setData('publish_at', v)}
                                                placeholder={t('cmp.pickTime')}
                                                autoOpen={!form.data.publish_at}
                                                className="[&_svg]:text-inherit [&>button]:bg-transparent [&>button]:text-inherit"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setSchedule(false);
                                                    form.setData('publish_at', '');
                                                }}
                                                className="grid size-7 place-items-center rounded-lg hover:bg-sky-500/15"
                                                aria-label={t('cmp.noSchedule')}
                                            >
                                                <X className="size-3.5" />
                                            </button>
                                        </span>
                                    )}
                                    {ppv && <PriceField value={form.data.price} onChange={(v) => form.setData('price', v)} />}
                                    {form.data.is_adult && (
                                        <span className="inline-flex h-9 items-center gap-1 rounded-xl bg-rose-500/10 pr-1 pl-3 text-sm font-bold text-rose-600 dark:text-rose-300">
                                            18+
                                            <button
                                                type="button"
                                                onClick={() => form.setData('is_adult', false)}
                                                className="grid size-7 place-items-center rounded-lg hover:bg-rose-500/15"
                                                aria-label={t('pe.cancel')}
                                            >
                                                <X className="size-3.5" />
                                            </button>
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {open && (
                        <>
                            {/* Tools, who sees it, publish. */}
                            <div className="border-border mt-3 flex flex-wrap items-center gap-x-2 gap-y-2 border-t pt-2.5">
                                <div className="-ml-2 flex items-center gap-0.5">
                                    <Tool icon={ImagePlus} label={t('st.addMedia')} onClick={() => files.current?.click()} disabled={room <= 0} />
                                    <LibraryButton
                                        picked={picked}
                                        iconOnly
                                        onChange={setPicked}
                                        max={10 - uploads.items.length}
                                        className="text-muted-foreground hover:bg-muted hover:text-foreground grid size-9 place-items-center rounded-full transition [&_svg]:size-[19px]"
                                    />
                                    <Tool icon={BarChart3} label={t('poll.add')} onClick={startPoll} active={!!poll} disabled={qa || !!poll} />
                                    <Tool icon={MessageCircleQuestion} label={t('qa.add')} onClick={startQa} active={qa} disabled={!!poll || qa} />
                                    <Tool
                                        icon={CalendarClock}
                                        label={t('sch.later')}
                                        onClick={() => setSchedule(true)}
                                        active={schedule}
                                        disabled={schedule}
                                    />
                                    {adultAllowed && (
                                        <button
                                            type="button"
                                            onClick={() => form.setData('is_adult', !form.data.is_adult)}
                                            aria-pressed={form.data.is_adult}
                                            title={t('cmp.adult')}
                                            className={`grid h-9 min-w-9 place-items-center rounded-full px-1.5 text-xs font-extrabold transition ${
                                                form.data.is_adult
                                                    ? 'bg-rose-500/15 text-rose-600 dark:text-rose-300'
                                                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                                            }`}
                                        >
                                            18+
                                        </button>
                                    )}
                                </div>

                                <div className="ml-auto flex items-center gap-1.5 max-sm:w-full max-sm:justify-end">
                                    {(!empty || !!poll || qa) && (
                                        <button
                                            type="button"
                                            onClick={() => reset()}
                                            className="text-muted-foreground hover:text-foreground hover:bg-muted grid h-9 min-w-9 place-items-center rounded-full px-2 text-sm font-semibold transition sm:px-2.5 sm:hover:bg-transparent"
                                        >
                                            <span className="max-sm:hidden">{t('cmp.discard')}</span>
                                            <Trash2 className="size-4 sm:hidden" aria-label={t('cmp.discard')} />
                                        </button>
                                    )}
                                    <DropdownMenu>
                                        <DropdownMenuTrigger
                                            className="hover:bg-muted border-border inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold transition"
                                            aria-label={t('cmp.who')}
                                        >
                                            <current.icon className="text-primary size-4" />
                                            <span className="max-w-32 truncate">{t(current.short)}</span>
                                            <ChevronDown className="text-muted-foreground size-3.5" />
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" className="w-64">
                                            <p className="text-muted-foreground px-2 pt-1.5 pb-1 text-xs font-semibold">{t('cmp.who')}</p>
                                            {AUDIENCES.map((a) => {
                                                const off = a.value === 'ppv' && (!!poll || qa);
                                                return (
                                                    <DropdownMenuItem
                                                        key={a.value}
                                                        disabled={off}
                                                        onSelect={() => pick(a.value)}
                                                        className="items-start gap-3 py-2"
                                                    >
                                                        <a.icon className="mt-0.5 size-4 shrink-0" />
                                                        <span className="min-w-0 flex-1">
                                                            <span className="block text-sm font-semibold">{t(a.label)}</span>
                                                            <span className="text-muted-foreground block text-xs">
                                                                {t(off ? 'cmp.ppvNotWith' : a.hint)}
                                                            </span>
                                                        </span>
                                                        {audience === a.value && <Check className="text-primary mt-0.5 size-4 shrink-0" />}
                                                    </DropdownMenuItem>
                                                );
                                            })}
                                        </DropdownMenuContent>
                                    </DropdownMenu>

                                    <button
                                        type="submit"
                                        disabled={blocked}
                                        className="bg-primary text-primary-foreground disabled:bg-muted disabled:text-muted-foreground inline-flex h-9 items-center gap-2 rounded-full px-5 text-sm font-bold whitespace-nowrap transition hover:brightness-110 disabled:cursor-not-allowed disabled:hover:brightness-100"
                                    >
                                        {(form.processing || autoPublish) && <LoaderCircle className="size-4 animate-spin" />}
                                        {autoPublish
                                            ? t('up.willPublish', { percent: uploads.percent })
                                            : uploads.busy
                                              ? t('up.publishWhenReady')
                                              : schedule
                                                ? t('stu.schedule')
                                                : t('st.publish')}
                                    </button>
                                    {autoPublish && (
                                        <button
                                            type="button"
                                            onClick={() => setAutoPublish(false)}
                                            className="text-muted-foreground hover:text-foreground hover:bg-muted grid size-9 place-items-center rounded-full transition"
                                            aria-label={t('pe.cancel')}
                                            title={t('pe.cancel')}
                                        >
                                            <X className="size-4" />
                                        </button>
                                    )}
                                </div>
                            </div>

                            <p className="text-muted-foreground/80 mt-2 flex items-start gap-1.5 text-[11px] leading-snug">
                                <ShieldCheck className="mt-px size-3 shrink-0" /> {t('st.rules')}
                            </p>
                        </>
                    )}
                </div>
            </div>
        </form>
    );
});

/** All files together: how many are ready, overall progress, speed and time left. */
function UploadSummary({
    done,
    total,
    percent,
    speed,
    secondsLeft,
    failed,
}: {
    done: number;
    total: number;
    percent: number;
    speed: number;
    secondsLeft: number | null;
    failed: number;
}) {
    const { t } = useT();
    return (
        <div className="bg-muted/60 mt-2 rounded-xl px-3 py-2" role="status" aria-live="polite">
            <div className="flex items-center justify-between gap-2 text-xs">
                <span className="flex items-center gap-1.5 font-semibold">
                    {failed > 0 ? (
                        <span className="text-destructive">{t('up.failedCount', { n: failed })}</span>
                    ) : (
                        <>
                            <UploadCloud className="text-primary size-4" />
                            {t('up.progress', { done, total })}
                        </>
                    )}
                </span>
                <span className="text-muted-foreground tabular-nums">
                    {percent}%{speed > 0 && ` · ${formatBytes(speed)}/s`}
                    {secondsLeft !== null && ` · ${t('up.left', { time: formatDuration(secondsLeft) })}`}
                </span>
            </div>
            <div className="bg-border mt-1.5 h-1.5 overflow-hidden rounded-full">
                <div
                    className={`h-full rounded-full transition-[width] duration-300 ${failed > 0 ? 'bg-destructive' : 'bg-primary'}`}
                    style={{ width: `${percent}%` }}
                />
            </div>
        </div>
    );
}

/** A round, single-colour tool button; turns brand-coloured while its feature is on. */
function Tool({
    icon: Icon,
    label,
    onClick,
    active = false,
    disabled = false,
}: {
    icon: LucideIcon;
    label: string;
    onClick: () => void;
    active?: boolean;
    disabled?: boolean;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled && !active}
            aria-label={label}
            aria-pressed={active}
            title={label}
            className={`grid size-9 place-items-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-35 ${
                active ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
        >
            <Icon className="size-[19px]" />
        </button>
    );
}

/** A box for a poll or Q&A inside the composer, with its own remove button. */
function Panel({
    icon: Icon,
    title,
    hint,
    onRemove,
    removeLabel,
    live = false,
    children,
}: {
    icon: LucideIcon;
    title: string;
    hint?: string;
    onRemove: () => void;
    removeLabel: string;
    live?: boolean;
    children: ReactNode;
}) {
    return (
        <fieldset aria-label={title} className="bg-muted/60 mt-3 rounded-xl p-3">
            <div className="mb-2 flex items-center gap-2">
                <span
                    className={`grid size-6 place-items-center rounded-md ${live ? 'bg-red-500/15 text-red-600 dark:text-red-400' : 'bg-primary/15 text-primary'}`}
                >
                    <Icon className="size-3.5" />
                </span>
                <span className="text-sm font-bold">{title}</span>
                <button
                    type="button"
                    onClick={onRemove}
                    className="text-muted-foreground hover:bg-card hover:text-foreground ml-auto grid size-7 place-items-center rounded-lg"
                    aria-label={removeLabel}
                    title={removeLabel}
                >
                    <X className="size-4" />
                </button>
            </div>
            {hint && <p className="text-muted-foreground mb-2.5 text-xs">{hint}</p>}
            {children}
        </fieldset>
    );
}

export default PostComposer;
