import InputError from '@/components/input-error';
import MediaThumbs from '@/components/media-thumbs';
import PriceField from '@/components/price-field';
import UserAvatar from '@/components/user-avatar';
import { priceOk, toLocalInput } from '@/lib/format';
import { useT, type TKey } from '@/lib/i18n';
import { type SharedData } from '@/types';
import { useForm, usePage } from '@inertiajs/react';
import { CalendarClock, Globe, ImagePlus, LoaderCircle, Lock, LockOpen, X } from 'lucide-react';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type FormEvent } from 'react';

type Audience = 'subscribers' | 'public' | 'ppv';
// `short` is what fits on a phone.
const AUDIENCES: { value: Audience; label: TKey; short: TKey; icon: typeof Globe }[] = [
    { value: 'subscribers', label: 'po.subscribers', short: 'st.subscribers', icon: Lock },
    { value: 'public', label: 'po.public', short: 'po.public', icon: Globe },
    { value: 'ppv', label: 'ppv.option', short: 'ppv.option', icon: LockOpen },
];

export type ComposerHandle = { focus: () => void };

/**
 * Write a post: text, photos/videos (with previews), who sees it (subscribers, everyone, or pay to unlock),
 * an optional publish time, and (for 18+ pages) the 18+ flag. Used in the studio and on the home feed.
 */
const PostComposer = forwardRef<ComposerHandle, { adultAllowed: boolean; className?: string }>(function PostComposer(
    { adultAllowed, className = '' },
    ref,
) {
    const { t } = useT();
    const { auth, ppvLimits } = usePage<SharedData & { ppvLimits: { min: number; max: number } }>().props;
    const form = useForm({
        body: '',
        visibility: 'subscribers' as 'public' | 'subscribers',
        is_adult: false as boolean,
        media: [] as File[],
        price: 5000,
        publish_at: '',
    });
    const [audience, setAudience] = useState<Audience>('subscribers');
    const [schedule, setSchedule] = useState(false);
    const box = useRef<HTMLTextAreaElement>(null);
    const files = useRef<HTMLInputElement>(null);
    const mediaErrors = Object.entries(form.errors).filter(([k]) => k.startsWith('media'));
    const ppv = audience === 'ppv';
    const empty = !form.data.body.trim() && form.data.media.length === 0;

    useImperativeHandle(ref, () => ({ focus: () => box.current?.focus() }));

    // The box grows with the text.
    useEffect(() => {
        const el = box.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${Math.min(Math.max(el.scrollHeight, 72), 320)}px`;
    }, [form.data.body]);

    function pick(a: Audience) {
        setAudience(a);
        if (a !== 'ppv') form.setData('visibility', a);
    }

    function submit(e: FormEvent) {
        e.preventDefault();
        form.transform((d) => ({
            ...d,
            price: ppv ? d.price : null,
            publish_at: schedule && d.publish_at ? new Date(d.publish_at).toISOString() : null,
        }));
        form.post(route('studio.posts.store'), {
            forceFormData: true,
            preserveScroll: true,
            onSuccess: () => {
                form.reset();
                setAudience('subscribers');
                setSchedule(false);
            },
        });
    }

    const tool = 'hover:bg-muted inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold transition';

    return (
        <form onSubmit={submit} className={className}>
            <div className="flex gap-3">
                {auth.user && (
                    <UserAvatar name={auth.user.name} src={auth.user.avatar_url} seed={auth.creator?.handle} className="size-10 shrink-0" />
                )}
                <textarea
                    ref={box}
                    value={form.data.body}
                    onChange={(e) => form.setData('body', e.target.value)}
                    placeholder={t('st.placeholder')}
                    maxLength={5000}
                    className="placeholder:text-muted-foreground min-h-[72px] w-full resize-none bg-transparent pt-2 text-[17px] leading-snug outline-none"
                />
            </div>
            <InputError message={form.errors.body} />

            <MediaThumbs
                files={form.data.media}
                onRemove={(i) =>
                    form.setData(
                        'media',
                        form.data.media.filter((_, j) => j !== i),
                    )
                }
                className="mt-3"
            />
            {mediaErrors.map(([k, v]) => (
                <InputError key={k} message={v} />
            ))}
            <InputError message={form.errors.is_adult} />

            {/* Who sees it */}
            <div className="mt-4 flex flex-wrap items-center gap-2">
                <div className="bg-muted grid w-full grid-cols-3 rounded-full p-1 sm:inline-flex sm:w-auto">
                    {AUDIENCES.map((a) => (
                        <button
                            key={a.value}
                            type="button"
                            onClick={() => pick(a.value)}
                            className={`inline-flex h-8 min-w-0 items-center justify-center gap-1.5 rounded-full px-2 text-[13px] font-semibold whitespace-nowrap transition sm:px-3 sm:text-sm ${
                                audience === a.value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                            }`}
                            aria-pressed={audience === a.value}
                        >
                            <a.icon className="hidden size-3.5 shrink-0 sm:block" />
                            <span className="truncate sm:hidden">{t(a.short)}</span>
                            <span className="hidden truncate sm:inline">{t(a.label)}</span>
                        </button>
                    ))}
                </div>
                {ppv && <PriceField value={form.data.price} onChange={(v) => form.setData('price', v)} />}
            </div>

            {schedule && (
                <div className="mt-3 flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-sky-600">
                        <CalendarClock className="size-4" /> {t('sch.later')}
                    </span>
                    <input
                        type="datetime-local"
                        value={form.data.publish_at}
                        min={toLocalInput(new Date().toISOString())}
                        onChange={(e) => form.setData('publish_at', e.target.value)}
                        className="bg-muted h-9 rounded-xl px-3 text-sm outline-none"
                    />
                    <button
                        type="button"
                        onClick={() => setSchedule(false)}
                        className="text-muted-foreground hover:bg-muted grid size-8 place-items-center rounded-full"
                        aria-label={t('pe.cancel')}
                    >
                        <X className="size-4" />
                    </button>
                </div>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-1 pt-1">
                <button type="button" onClick={() => files.current?.click()} className={`${tool} text-emerald-600 dark:text-emerald-400`}>
                    <ImagePlus className="size-[18px]" /> {t('st.addMedia')}
                </button>
                <input
                    ref={files}
                    type="file"
                    multiple
                    accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
                    className="hidden"
                    onChange={(e) => {
                        form.setData('media', [...form.data.media, ...Array.from(e.target.files ?? [])].slice(0, 10));
                        e.target.value = '';
                    }}
                />
                {!schedule && (
                    <button type="button" onClick={() => setSchedule(true)} className={`${tool} text-sky-600 dark:text-sky-400`}>
                        <CalendarClock className="size-[18px]" /> {t('sch.later')}
                    </button>
                )}
                {adultAllowed && (
                    <button
                        type="button"
                        onClick={() => form.setData('is_adult', !form.data.is_adult)}
                        className={`${tool} ${form.data.is_adult ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300' : 'text-muted-foreground'}`}
                        aria-pressed={form.data.is_adult}
                    >
                        18+
                    </button>
                )}
                <button
                    type="submit"
                    disabled={form.processing || empty || (ppv && !priceOk(form.data.price, ppvLimits)) || (schedule && !form.data.publish_at)}
                    className="bg-primary text-primary-foreground ml-auto inline-flex h-10 items-center gap-2 rounded-lg px-6 text-sm font-bold transition hover:brightness-110 disabled:opacity-40 disabled:shadow-none"
                >
                    {form.processing && <LoaderCircle className="size-4 animate-spin" />}
                    {schedule ? t('stu.schedule') : t('st.publish')}
                </button>
            </div>
            {form.progress && (
                <div className="bg-muted mt-3 h-1 overflow-hidden rounded-full">
                    <div className="bg-primary h-full transition-[width]" style={{ width: `${form.progress.percentage ?? 0}%` }} />
                </div>
            )}
        </form>
    );
});

export default PostComposer;
