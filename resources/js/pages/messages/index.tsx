import AudioPlayer from '@/components/audio-player';
import { LibraryButton, PickedThumbs, type Picked } from '@/components/library-picker';
import MediaThumbs from '@/components/media-thumbs';
import MoreMenu from '@/components/more-menu';
import PriceField from '@/components/price-field';
import TipButton from '@/components/tip-button';
import UnlockButton from '@/components/unlock-button';
import UserAvatar from '@/components/user-avatar';
import VideoPlayer from '@/components/video-player';
import SocialLayout from '@/layouts/social-layout';
import StudioLayout from '@/layouts/studio-layout';
import { mnt, priceOk, timeAgo } from '@/lib/format';
import { useT, type TKey } from '@/lib/i18n';
import { useLive, useLiveConnected } from '@/lib/live';
import { type SharedData } from '@/types';
import { Link, router, useForm, usePage, usePoll } from '@inertiajs/react';
import {
    ArrowLeft,
    BadgeCheck,
    Compass,
    ExternalLink,
    HandCoins,
    ImagePlus,
    LoaderCircle,
    Lock,
    Megaphone,
    MessageCircle,
    Search,
    SendHorizontal,
} from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';

type Person = { id: number; name: string; handle: string | null; avatar_url: string | null };
type Item = { id: number; other: Person; last: { mine: boolean; body: string | null; has_media: boolean; at: string } | null; unread: number };
type Msg = {
    id: number;
    sender_id: number;
    body: string | null;
    tip_amount: number | null;
    price: number | null;
    locked: boolean;
    counts: { image: number; video: number; audio?: number };
    created_at: string;
    media: { id: number; type: 'image' | 'video' | 'audio'; url: string; stamp?: string | null }[];
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

/** Messages within this long of each other (same sender) form one group: one avatar, one time. */
const GROUP_MS = 5 * 60 * 1000;

/** Inbox on the left, the open conversation on the right, each in its own panel. Phones show one or the other. */
export default function Messages({
    conversations,
    thread,
    me,
    area = 'social',
}: {
    conversations: Item[];
    thread: Thread | null;
    me: number;
    /** Opened from the studio: same inbox, in the studio layout, links stay in the studio. */
    area?: 'social' | 'studio';
}) {
    const { t } = useT();
    const [q, setQ] = useState('');
    // New messages arrive in real time; the 4-second check only runs while that connection is down.
    const reload = () => router.reload({ only: ['conversations', 'thread', 'unreadMessages'] });
    const connected = useLiveConnected();
    const poll = usePoll(4000, { only: ['conversations', 'thread', 'unreadMessages'] }, { autoStart: false });
    useEffect(() => {
        if (connected) poll.stop();
        else poll.start();
        return () => poll.stop();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [connected]);
    useLive(thread ? `conversation.${thread.id}` : null, ['message'], reload);
    useLive(`user.${me}`, ['inbox'], reload);
    const shown = conversations.filter((c) => !q.trim() || `${c.other.name} ${c.other.handle ?? ''}`.toLowerCase().includes(q.trim().toLowerCase()));

    return (
        <Shell area={area} title={thread ? thread.other.name : t('nav.messages')}>
            <div
                className={`flex gap-4 ${area === 'studio' ? 'h-[calc(100svh-6.5rem-var(--player-h,0px))] pb-2' : 'h-[calc(100svh-3.5rem-4rem-var(--player-h,0px))] md:h-[calc(100svh-var(--player-h,0px))] md:py-4'}`}
            >
                {/* Inbox */}
                <aside
                    className={`bg-card w-full shrink-0 flex-col overflow-hidden md:flex md:w-[340px] md:rounded-2xl md:shadow-xs ${thread ? 'hidden' : 'flex'}`}
                >
                    <div className="px-4 pt-4 pb-3">
                        {area === 'social' && <h1 className="text-2xl font-extrabold tracking-tight">{t('nav.messages')}</h1>}
                        {conversations.length > 0 && (
                            <label className="bg-muted focus-within:ring-primary/25 mt-3 flex h-10 items-center gap-2 rounded-full px-3.5 focus-within:ring-2">
                                <Search className="text-muted-foreground size-4 shrink-0" />
                                <input
                                    value={q}
                                    onChange={(e) => setQ(e.target.value)}
                                    placeholder={t('dm.search')}
                                    className="placeholder:text-muted-foreground w-full bg-transparent text-sm outline-none"
                                />
                            </label>
                        )}
                    </div>
                    {conversations.length === 0 ? (
                        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
                            <span className="bg-primary/10 text-primary grid size-16 place-items-center rounded-full">
                                <MessageCircle className="size-8" />
                            </span>
                            <p className="font-bold">{t('dm.emptyTitle')}</p>
                            <p className="text-muted-foreground text-sm">{t(area === 'studio' ? 'dm.emptyCreator' : 'dm.empty')}</p>
                            <Link
                                href={route(area === 'studio' ? 'studio' : 'creators')}
                                className="bg-primary text-primary-foreground mt-1 inline-flex h-10 items-center gap-2 rounded-full px-5 text-sm font-bold"
                            >
                                {area === 'studio' ? <Megaphone className="size-4" /> : <Compass className="size-4" />}{' '}
                                {t(area === 'studio' ? 'mm.title' : 'wal.discover')}
                            </Link>
                        </div>
                    ) : (
                        <ul className="flex-1 overflow-y-auto px-2 pb-2">
                            {shown.map((c) => {
                                const active = thread?.id === c.id;
                                return (
                                    <li key={c.id}>
                                        <Link
                                            href={route(area === 'studio' ? 'studio.messages.show' : 'messages.show', c.id)}
                                            preserveScroll
                                            prefetch
                                            className={`flex items-center gap-3 rounded-xl px-2.5 py-2.5 transition ${active ? 'bg-primary/10' : 'hover:bg-muted/60'}`}
                                        >
                                            <UserAvatar
                                                name={c.other.name}
                                                src={c.other.avatar_url}
                                                seed={c.other.handle ?? c.other.name}
                                                className="size-14 shrink-0 text-lg"
                                            />
                                            <span className="min-w-0 flex-1">
                                                <span className={`block truncate text-[15px] ${c.unread ? 'font-bold' : 'font-semibold'}`}>
                                                    {c.other.name}
                                                </span>
                                                <span
                                                    className={`flex min-w-0 items-center gap-1 text-[13px] ${c.unread ? 'text-foreground font-semibold' : 'text-muted-foreground'}`}
                                                >
                                                    <span className="truncate">
                                                        {c.last && (c.last.mine ? `${t('dm.you')}: ` : '')}
                                                        {c.last?.body ?? (c.last?.has_media ? `📷 ${t('dm.photo')}` : '')}
                                                    </span>
                                                    {c.last && <span className="shrink-0">· {timeAgo(c.last.at, t)}</span>}
                                                </span>
                                            </span>
                                            {c.unread > 0 && (
                                                <span className="bg-primary size-3 shrink-0 rounded-full" aria-label={String(c.unread)} />
                                            )}
                                        </Link>
                                    </li>
                                );
                            })}
                            {shown.length === 0 && <li className="text-muted-foreground p-6 text-center text-sm">{t('dm.noMatch')}</li>}
                        </ul>
                    )}
                </aside>

                {/* Conversation */}
                <section
                    className={`bg-card min-w-0 flex-1 flex-col overflow-hidden md:rounded-2xl md:shadow-xs ${thread ? 'flex' : 'hidden md:flex'}`}
                >
                    {thread ? (
                        <Conversation thread={thread} me={me} area={area} />
                    ) : (
                        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
                            <span className="bg-muted text-muted-foreground grid size-20 place-items-center rounded-full">
                                <MessageCircle className="size-9" />
                            </span>
                            <p className="text-lg font-bold">{t('dm.pickTitle')}</p>
                            <p className="text-muted-foreground max-w-xs text-sm">{t('dm.pick')}</p>
                        </div>
                    )}
                </section>
            </div>
        </Shell>
    );
}

function Conversation({ thread, me, area }: { thread: Thread; me: number; area: 'social' | 'studio' }) {
    const { t } = useT();
    const scroller = useRef<HTMLDivElement>(null);
    const lastId = thread.messages.at(-1)?.id;

    // Keep the newest message in view when one arrives or the conversation changes.
    useLayoutEffect(() => {
        scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
    }, [lastId, thread.id]);

    const o = thread.other;
    const lastFromThem = [...thread.messages].reverse().find((m) => m.sender_id !== me)?.id;
    const avatar = (size: string) => <UserAvatar name={o.name} src={o.avatar_url} seed={o.handle ?? o.name} className={size} />;

    return (
        <>
            <header className="z-10 flex h-16 shrink-0 items-center gap-3 px-3 shadow-[0_1px_4px_rgb(0_0_0/0.06)]">
                <Link
                    href={route(area === 'studio' ? 'studio.messages' : 'messages.index')}
                    className="hover:bg-muted grid size-9 place-items-center rounded-full md:hidden"
                    aria-label="Back"
                >
                    <ArrowLeft className="size-5" />
                </Link>
                {o.handle ? <Link href={route('creator.show', o.handle)}>{avatar('size-10')}</Link> : avatar('size-10')}
                <div className="min-w-0 flex-1">
                    {o.handle ? (
                        <Link href={route('creator.show', o.handle)} className="flex items-center gap-1 font-bold hover:underline">
                            <span className="truncate">{o.name}</span>
                            <BadgeCheck className="text-primary size-4 shrink-0" />
                        </Link>
                    ) : (
                        <p className="truncate font-bold">{o.name}</p>
                    )}
                    {o.handle && <p className="text-muted-foreground truncate text-xs">@{o.handle}</p>}
                </div>
                {o.handle && (
                    <>
                        <TipButton
                            handle={o.handle}
                            name={o.name}
                            className="bg-primary/12 text-primary hover:bg-primary/20 inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-bold transition"
                        />
                        <Link
                            href={route('creator.show', o.handle)}
                            className="text-muted-foreground hover:bg-muted hover:text-foreground hidden size-9 place-items-center rounded-full transition sm:grid"
                            aria-label={t('dm.viewPage')}
                            title={t('dm.viewPage')}
                        >
                            <ExternalLink className="size-[18px]" />
                        </Link>
                    </>
                )}
                <MoreMenu report={lastFromThem ? { type: 'message', id: lastFromThem } : undefined} blockUserId={o.id} blocked={thread.iBlocked} />
            </header>

            <div ref={scroller} className="flex-1 overflow-y-auto px-4 py-4">
                {/* Who you're talking to, at the top of the thread */}
                <div className="flex flex-col items-center gap-2 pt-4 pb-8 text-center">
                    {avatar('size-20 text-2xl')}
                    <p className="text-lg font-bold">{o.name}</p>
                    {o.handle && (
                        <Link
                            href={route('creator.show', o.handle)}
                            className="bg-muted hover:bg-muted/70 rounded-full px-4 py-1.5 text-sm font-semibold"
                        >
                            {t('dm.viewPage')}
                        </Link>
                    )}
                    {thread.messages.length === 0 && <p className="text-muted-foreground mt-2 text-sm">{t('dm.start', { name: o.name })}</p>}
                </div>

                <div className="flex flex-col">
                    {thread.messages.map((m, i) => {
                        const mine = m.sender_id === me;
                        const prev = thread.messages[i - 1];
                        const next = thread.messages[i + 1];
                        const at = new Date(m.created_at).getTime();
                        const newDay = !prev || prev.created_at.slice(0, 10) !== m.created_at.slice(0, 10);
                        const joinsPrev = !newDay && prev && prev.sender_id === m.sender_id && at - new Date(prev.created_at).getTime() < GROUP_MS;
                        const endsGroup =
                            !next ||
                            next.sender_id !== m.sender_id ||
                            new Date(next.created_at).getTime() - at >= GROUP_MS ||
                            next.created_at.slice(0, 10) !== m.created_at.slice(0, 10);
                        return (
                            <div key={m.id} className={joinsPrev ? 'mt-0.5' : 'mt-3'}>
                                {newDay && (
                                    <p className="text-muted-foreground my-4 text-center text-xs font-semibold">
                                        {m.created_at.slice(0, 10).replaceAll('-', '.')}
                                    </p>
                                )}
                                <div className={`flex items-end gap-2 ${mine ? 'justify-end' : 'justify-start'}`}>
                                    {!mine && <span className="mb-[18px] size-7 shrink-0">{endsGroup && avatar('size-7 text-[11px]')}</span>}
                                    <div className={`flex max-w-[75%] flex-col gap-1 ${mine ? 'items-end' : 'items-start'}`}>
                                        {m.locked && (
                                            <div className="flex w-64 flex-col items-center gap-2 rounded-2xl bg-gradient-to-br from-zinc-800 to-black p-5 text-center text-white">
                                                <Lock className="size-6" />
                                                <span className="text-sm text-white/70">
                                                    {m.counts.image > 0 && `📷 ${m.counts.image}`} {m.counts.video > 0 && `🎬 ${m.counts.video}`}{' '}
                                                    {!!m.counts.audio && `🎧 ${m.counts.audio}`}
                                                </span>
                                                <UnlockButton
                                                    href={route('messages.buy', m.id)}
                                                    price={m.price ?? 0}
                                                    className="rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2 text-sm font-bold transition hover:brightness-110"
                                                >
                                                    {t('ppv.unlock', { price: mnt(m.price ?? 0) })}
                                                </UnlockButton>
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
                                                    x.type === 'audio' ? (
                                                        <div key={x.id} className="col-span-full min-w-[260px]">
                                                            <AudioPlayer
                                                                src={x.url}
                                                                stamp={x.stamp}
                                                                compact
                                                                artist={mine ? null : thread.other.name}
                                                                href={typeof window !== 'undefined' ? window.location.pathname : null}
                                                            />
                                                        </div>
                                                    ) : x.type === 'video' ? (
                                                        <VideoPlayer
                                                            key={x.id}
                                                            src={x.url}
                                                            id={`mm${x.id}`}
                                                            stamp={x.stamp}
                                                            videoClassName="max-h-80 w-full"
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
                                                className={`rounded-[20px] px-3.5 py-2 text-[15px] leading-snug break-words whitespace-pre-line ${
                                                    mine ? 'bg-primary text-primary-foreground' : 'bg-muted'
                                                } ${joinsPrev ? (mine ? 'rounded-tr-md' : 'rounded-tl-md') : ''} ${endsGroup ? '' : mine ? 'rounded-br-md' : 'rounded-bl-md'}`}
                                                title={m.created_at.slice(0, 16).replace('T', ' ').replaceAll('-', '.')}
                                            >
                                                {m.body}
                                            </p>
                                        )}
                                        {endsGroup && <span className="text-muted-foreground px-1 text-[11px]">{m.created_at.slice(11, 16)}</span>}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {thread.cannotSend ? (
                <p className="bg-muted/60 text-muted-foreground p-4 text-center text-sm">{t(REASONS[thread.cannotSend] ?? 'dm.closed')}</p>
            ) : (
                <Composer conversationId={thread.id} />
            )}
        </>
    );
}

/** The social layout, or the studio's (no inbox on phones there: the studio has its own menu). */
function Shell({ area, title, children }: { area: 'social' | 'studio'; title: string; children: ReactNode }) {
    const { t } = useT();
    return area === 'studio' ? (
        <StudioLayout title={title} heading={t('nav.messages')} subtitle={t('stu.messagesSub')}>
            {children}
        </StudioLayout>
    ) : (
        <SocialLayout title={title} wide>
            {children}
        </SocialLayout>
    );
}

function Composer({ conversationId }: { conversationId: number }) {
    const { t } = useT();
    const form = useForm({ body: '', media: [] as File[], price: 5000 });
    const [ppv, setPpv] = useState(false);
    const [picked, setPicked] = useState<Picked[]>([]);
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

    useEffect(() => {
        form.reset();
        setPicked([]);
    }, [conversationId]); // eslint-disable-line react-hooks/exhaustive-deps

    const hasMedia = form.data.media.length > 0 || picked.length > 0;
    const priced = ppv && hasMedia;
    const canSend = !form.processing && (form.data.body.trim() !== '' || hasMedia) && (!priced || priceOk(form.data.price, ppvLimits));

    function submit(e?: FormEvent) {
        e?.preventDefault();
        if (!canSend) return;
        form.transform((d) => ({ ...d, vault: picked.map((p) => p.id), price: priced ? d.price : null }));
        form.post(route('messages.send', conversationId), {
            forceFormData: true,
            preserveScroll: true,
            onSuccess: () => {
                form.reset();
                setPicked([]);
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
        <form onSubmit={submit} className="shrink-0 px-3 pt-2 pb-3">
            <PickedThumbs picked={picked} onRemove={(id) => setPicked((p) => p.filter((x) => x.id !== id))} className="mb-2" />
            <MediaThumbs
                files={form.data.media}
                onRemove={(i) =>
                    form.setData(
                        'media',
                        form.data.media.filter((_, j) => j !== i),
                    )
                }
                className="mb-2"
            />
            {isCreator && hasMedia && (
                <div className="mb-2 flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setPpv(!ppv)}
                        className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-sm font-semibold transition ${ppv ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300' : 'bg-muted text-muted-foreground hover:text-foreground'}`}
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
                    className="text-primary hover:bg-primary/10 grid size-10 shrink-0 place-items-center rounded-full transition"
                    aria-label={t('st.addMedia')}
                    title={t('st.addMedia')}
                >
                    <ImagePlus className="size-5" />
                </button>
                {isCreator && (
                    <LibraryButton
                        picked={picked}
                        onChange={setPicked}
                        max={10 - form.data.media.length}
                        iconOnly
                        className="grid size-10 shrink-0 place-items-center rounded-full text-violet-600 transition hover:bg-violet-500/10 dark:text-violet-400"
                    />
                )}
                <input
                    ref={files}
                    type="file"
                    multiple
                    accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm,audio/*,.mp3,.m4a,.aac,.wav,.ogg,.opus,.flac"
                    className="hidden"
                    onChange={(e) => {
                        form.setData('media', [...form.data.media, ...Array.from(e.target.files ?? [])].slice(0, 10 - picked.length));
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
                    className="bg-muted focus:ring-primary/20 max-h-40 min-h-10 flex-1 resize-none rounded-[20px] px-4 py-2.5 text-[15px] outline-none focus:ring-2"
                />
                <button
                    type="submit"
                    disabled={!canSend}
                    className="bg-primary text-primary-foreground grid size-10 shrink-0 place-items-center rounded-full shadow-md transition hover:brightness-110 disabled:opacity-40 disabled:shadow-none"
                    aria-label={t('dm.send')}
                >
                    {form.processing ? <LoaderCircle className="size-5 animate-spin" /> : <SendHorizontal className="size-5" />}
                </button>
            </div>
        </form>
    );
}
