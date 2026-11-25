import MoreMenu from '@/components/more-menu';
import PriceField from '@/components/price-field';
import TipButton from '@/components/tip-button';
import UserAvatar from '@/components/user-avatar';
import SocialLayout from '@/layouts/social-layout';
import { mnt, priceOk } from '@/lib/format';
import { useT, type TKey } from '@/lib/i18n';
import { type SharedData } from '@/types';
import { Link, useForm, usePage, usePoll } from '@inertiajs/react';
import { ArrowLeft, BadgeCheck, HandCoins, ImageIcon, ImagePlus, LoaderCircle, Lock, MessageCircle, SendHorizontal, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';

type Person = { id: number; name: string; handle: string | null; avatar_url: string | null };
type Item = { id: number; other: Person; last: { mine: boolean; body: string | null; has_media: boolean; at: string } | null; unread: number };
type Msg = {
    id: number;
    sender_id: number;
    body: string | null;
    tip_amount: number | null;
    price: number | null;
    locked: boolean;
    counts: { image: number; video: number };
    created_at: string;
    media: { id: number; type: 'image' | 'video'; url: string }[];
};
type Thread = { id: number; other: Person; messages: Msg[]; cannotSend: string | null; iBlocked: boolean };

const REASONS: Record<string, TKey> = {
    'cannot.follow': 'dm.needFollow',
    'cannot.subscribe': 'dm.needSubscribe',
    'cannot.closed': 'dm.closed',
    'cannot.self': 'dm.closed',
    'cannot.blocked': 'bl.chatBlocked',
    blocked: 'bl.chatBlocked',
    follow: 'dm.needFollow',
    subscribe: 'dm.needSubscribe',
    closed: 'dm.closed',
    self: 'dm.closed',
};

/** Inbox on the left, the open conversation on the right. Phones show one or the other. New messages arrive by polling. */
export default function Messages({ conversations, thread, me }: { conversations: Item[]; thread: Thread | null; me: number }) {
    const { t } = useT();
    usePoll(4000, { only: ['conversations', 'thread', 'unreadMessages'] });

    return (
        <SocialLayout title={thread ? thread.other.name : t('nav.messages')} wide>
            <div className="flex h-[calc(100svh-3.5rem-5rem)] md:h-svh">
                {/* Inbox */}
                <aside className={`w-full shrink-0 flex-col border-r md:flex md:w-80 ${thread ? 'hidden' : 'flex'}`}>
                    <div className="flex h-14 items-center border-b px-5">
                        <h1 className="text-lg font-bold">{t('nav.messages')}</h1>
                    </div>
                    {conversations.length === 0 ? (
                        <div className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center text-sm">
                            <MessageCircle className="size-10 opacity-40" />
                            {t('dm.empty')}
                        </div>
                    ) : (
                        <ul className="flex-1 overflow-y-auto">
                            {conversations.map((c) => (
                                <li key={c.id}>
                                    <Link
                                        href={route('messages.show', c.id)}
                                        preserveScroll
                                        className={`hover:bg-muted/60 flex items-center gap-3 px-4 py-3 transition ${thread?.id === c.id ? 'bg-muted' : ''}`}
                                    >
                                        <UserAvatar
                                            name={c.other.name}
                                            src={c.other.avatar_url}
                                            seed={c.other.handle ?? c.other.name}
                                            className="size-12 text-lg"
                                        />
                                        <span className="min-w-0 flex-1">
                                            <span className="flex items-center justify-between gap-2">
                                                <span className={`truncate ${c.unread ? 'font-bold' : 'font-semibold'}`}>{c.other.name}</span>
                                                {c.last && <span className="text-muted-foreground shrink-0 text-xs">{ago(c.last.at)}</span>}
                                            </span>
                                            <span className="flex items-center justify-between gap-2">
                                                <span
                                                    className={`truncate text-sm ${c.unread ? 'text-foreground font-semibold' : 'text-muted-foreground'}`}
                                                >
                                                    {c.last && (c.last.mine ? `${t('dm.you')}: ` : '')}
                                                    {c.last?.body ?? (c.last?.has_media ? `📷 ${t('dm.photo')}` : '')}
                                                </span>
                                                {c.unread > 0 && (
                                                    <span className="bg-primary grid h-5 min-w-5 shrink-0 place-items-center rounded-full px-1.5 text-[11px] font-bold text-white">
                                                        {c.unread}
                                                    </span>
                                                )}
                                            </span>
                                        </span>
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    )}
                </aside>

                {/* Conversation */}
                <section className={`min-w-0 flex-1 flex-col ${thread ? 'flex' : 'hidden md:flex'}`}>
                    {thread ? (
                        <Conversation thread={thread} me={me} />
                    ) : (
                        <div className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-3 text-sm">
                            <span className="bg-muted grid size-16 place-items-center rounded-full">
                                <MessageCircle className="size-7" />
                            </span>
                            {t('dm.pick')}
                        </div>
                    )}
                </section>
            </div>
        </SocialLayout>
    );
}

function Conversation({ thread, me }: { thread: Thread; me: number }) {
    const { t } = useT();
    const scroller = useRef<HTMLDivElement>(null);
    const lastId = thread.messages.at(-1)?.id;

    // Keep the newest message in view when one arrives or the conversation changes.
    useLayoutEffect(() => {
        scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
    }, [lastId, thread.id]);

    const o = thread.other;
    const lastFromThem = [...thread.messages].reverse().find((m) => m.sender_id !== me)?.id;

    return (
        <>
            <header className="flex h-14 shrink-0 items-center gap-3 border-b px-3">
                <Link
                    href={route('messages.index')}
                    className="hover:bg-muted grid size-9 place-items-center rounded-full md:hidden"
                    aria-label="Back"
                >
                    <ArrowLeft className="size-5" />
                </Link>
                <UserAvatar name={o.name} src={o.avatar_url} seed={o.handle ?? o.name} className="size-9" />
                <div className="min-w-0">
                    {o.handle ? (
                        <Link href={route('creator.show', o.handle)} className="flex items-center gap-1 font-bold hover:underline">
                            <span className="truncate">{o.name}</span>
                            <BadgeCheck className="size-4 shrink-0 text-sky-500" />
                        </Link>
                    ) : (
                        <p className="truncate font-bold">{o.name}</p>
                    )}
                    {o.handle && <p className="text-muted-foreground text-xs">@{o.handle}</p>}
                </div>
                <MoreMenu
                    report={lastFromThem ? { type: 'message', id: lastFromThem } : undefined}
                    blockUserId={o.id}
                    blocked={thread.iBlocked}
                    className={o.handle ? 'order-last' : 'ml-auto'}
                />
                {o.handle && (
                    <TipButton
                        handle={o.handle}
                        name={o.name}
                        className="ml-auto inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold text-amber-600 transition hover:bg-amber-50 dark:hover:bg-amber-950/40"
                    />
                )}
            </header>

            <div ref={scroller} className="flex-1 overflow-y-auto px-4 py-4">
                {thread.messages.length === 0 && <p className="text-muted-foreground py-10 text-center text-sm">{t('dm.start', { name: o.name })}</p>}
                <div className="flex flex-col gap-1.5">
                    {thread.messages.map((m, i) => {
                        const mine = m.sender_id === me;
                        const prev = thread.messages[i - 1];
                        const newDay = !prev || prev.created_at.slice(0, 10) !== m.created_at.slice(0, 10);
                        return (
                            <div key={m.id}>
                                {newDay && (
                                    <p className="text-muted-foreground my-3 text-center text-[11px] font-semibold tracking-wider uppercase">
                                        {m.created_at.slice(0, 10).replaceAll('-', '.')}
                                    </p>
                                )}
                                <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-[78%] ${mine ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
                                        {m.locked && (
                                            <div className="flex w-64 flex-col items-center gap-2 rounded-2xl bg-gradient-to-br from-zinc-800 to-black p-5 text-center text-white">
                                                <Lock className="size-6" />
                                                <span className="text-sm text-white/70">
                                                    {m.counts.image > 0 && `📷 ${m.counts.image}`} {m.counts.video > 0 && `🎬 ${m.counts.video}`}
                                                </span>
                                                <Link
                                                    href={route('messages.buy', m.id)}
                                                    method="post"
                                                    as="button"
                                                    className="rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2 text-sm font-bold transition hover:brightness-110"
                                                >
                                                    {t('ppv.unlock', { price: mnt(m.price ?? 0) })}
                                                </Link>
                                            </div>
                                        )}
                                        {mine && m.price && (
                                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                                                <Lock className="size-3" /> {mnt(m.price)}
                                            </span>
                                        )}
                                        {m.media.length > 0 && (
                                            <div className={`grid gap-1 overflow-hidden rounded-2xl ${m.media.length > 1 ? 'grid-cols-2' : ''}`}>
                                                {m.media.map((x) =>
                                                    x.type === 'video' ? (
                                                        <video
                                                            key={x.id}
                                                            src={x.url}
                                                            controls
                                                            preload="metadata"
                                                            className="max-h-80 w-full bg-black"
                                                        />
                                                    ) : (
                                                        <a key={x.id} href={x.url} target="_blank" rel="noreferrer">
                                                            <img src={x.url} alt="" className="max-h-80 w-full object-cover" loading="lazy" />
                                                        </a>
                                                    ),
                                                )}
                                            </div>
                                        )}
                                        {m.tip_amount && (
                                            <div className="flex items-center gap-2 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 px-4 py-3 text-white shadow-md">
                                                <HandCoins className="size-6" />
                                                <span>
                                                    <span className="block text-[11px] font-semibold tracking-wider uppercase opacity-90">
                                                        {mine ? t('tip.youTipped') : t('tip.theyTipped')}
                                                    </span>
                                                    <span className="block text-xl font-extrabold">{mnt(m.tip_amount)}</span>
                                                </span>
                                            </div>
                                        )}
                                        {m.body && (
                                            <p
                                                className={`rounded-2xl px-3.5 py-2 text-[15px] leading-snug break-words whitespace-pre-line ${
                                                    mine
                                                        ? 'from-primary rounded-br-md bg-gradient-to-br to-rose-500 text-white'
                                                        : 'bg-muted rounded-bl-md'
                                                }`}
                                            >
                                                {m.body}
                                            </p>
                                        )}
                                        <span className="text-muted-foreground px-1 text-[10px]">{m.created_at.slice(11, 16)}</span>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {thread.cannotSend ? (
                <p className="bg-muted/60 text-muted-foreground border-t p-4 text-center text-sm">{t(REASONS[thread.cannotSend] ?? 'dm.closed')}</p>
            ) : (
                <Composer conversationId={thread.id} />
            )}
        </>
    );
}

function Composer({ conversationId }: { conversationId: number }) {
    const { t } = useT();
    const form = useForm({ body: '', media: [] as File[], price: 5000 });
    const [ppv, setPpv] = useState(false);
    const { auth, ppvLimits } = usePage<SharedData & { ppvLimits: { min: number; max: number } }>().props;
    const isCreator = auth.creator?.status === 'approved';
    const files = useRef<HTMLInputElement>(null);
    const box = useRef<HTMLTextAreaElement>(null);

    // Grow the text box with its content, up to a limit.
    useEffect(() => {
        if (!box.current) return;
        box.current.style.height = 'auto';
        box.current.style.height = `${Math.min(box.current.scrollHeight, 160)}px`;
    }, [form.data.body]);

    useEffect(() => form.reset(), [conversationId]); // eslint-disable-line react-hooks/exhaustive-deps

    const priced = ppv && form.data.media.length > 0;
    const canSend =
        !form.processing && (form.data.body.trim() !== '' || form.data.media.length > 0) && (!priced || priceOk(form.data.price, ppvLimits));

    function submit(e?: FormEvent) {
        e?.preventDefault();
        if (!canSend) return;
        form.transform((d) => ({ ...d, price: priced ? d.price : null }));
        form.post(route('messages.send', conversationId), {
            forceFormData: true,
            preserveScroll: true,
            onSuccess: () => {
                form.reset();
                setPpv(false);
            },
        });
    }

    function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
        }
    }

    const error = form.errors.body ?? Object.entries(form.errors).find(([k]) => k.startsWith('media'))?.[1];

    return (
        <form onSubmit={submit} className="shrink-0 border-t p-3">
            {form.data.media.length > 0 && (
                <ul className="mb-2 flex flex-wrap gap-2">
                    {form.data.media.map((f, i) => (
                        <li key={i} className="bg-muted flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs">
                            <ImageIcon className="size-3.5" />
                            <span className="max-w-32 truncate">{f.name}</span>
                            <button
                                type="button"
                                onClick={() =>
                                    form.setData(
                                        'media',
                                        form.data.media.filter((_, j) => j !== i),
                                    )
                                }
                                aria-label={t('po.delete')}
                            >
                                <X className="size-3.5" />
                            </button>
                        </li>
                    ))}
                </ul>
            )}
            {isCreator && form.data.media.length > 0 && (
                <div className="mb-2 flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setPpv(!ppv)}
                        className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold transition ${ppv ? 'border-amber-300 text-amber-700' : 'text-muted-foreground hover:bg-muted'}`}
                    >
                        <Lock className="size-3.5" /> {t('ppv.lockMedia')}
                    </button>
                    {ppv && <PriceField value={form.data.price} onChange={(v) => form.setData('price', v)} />}
                </div>
            )}
            {error && <p className="mb-2 text-sm text-red-600">{REASONS[error] ? t(REASONS[error]) : error}</p>}
            <div className="flex items-end gap-2">
                <button
                    type="button"
                    onClick={() => files.current?.click()}
                    className="text-muted-foreground hover:text-primary hover:bg-muted grid size-10 shrink-0 place-items-center rounded-full transition"
                    aria-label={t('st.addMedia')}
                    title={t('st.addMedia')}
                >
                    <ImagePlus className="size-5" />
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
                <textarea
                    ref={box}
                    rows={1}
                    value={form.data.body}
                    onChange={(e) => form.setData('body', e.target.value)}
                    onKeyDown={onKey}
                    maxLength={2000}
                    placeholder={t('dm.placeholder')}
                    className="bg-muted focus:ring-primary/20 max-h-40 min-h-10 flex-1 resize-none rounded-2xl px-4 py-2.5 text-[15px] outline-none focus:ring-2"
                />
                <button
                    type="submit"
                    disabled={!canSend}
                    className="from-primary grid size-10 shrink-0 place-items-center rounded-full bg-gradient-to-br to-rose-500 text-white shadow-md transition hover:brightness-110 disabled:opacity-40 disabled:shadow-none"
                    aria-label={t('dm.send')}
                >
                    {form.processing ? <LoaderCircle className="size-5 animate-spin" /> : <SendHorizontal className="size-5" />}
                </button>
            </div>
        </form>
    );
}

/** "now", "5m", "3h", "2d", or the date. */
function ago(iso: string) {
    const s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 60) return '•';
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    if (s < 86400) return `${Math.floor(s / 3600)}h`;
    if (s < 7 * 86400) return `${Math.floor(s / 86400)}d`;
    return iso.slice(5, 10).replace('-', '.');
}
