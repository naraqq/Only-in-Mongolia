import UserAvatar from '@/components/user-avatar';
import { sendJson } from '@/lib/http';
import { useT } from '@/lib/i18n';
import { useLive, useLiveConnected } from '@/lib/live';
import { type SharedData } from '@/types';
import { Link, usePage } from '@inertiajs/react';
import { Bell, BellRing, CalendarClock, ChevronUp, Eye, EyeOff, LoaderCircle, MessageCircleQuestion, Send } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';

export type QaSummary = {
    state: 'upcoming' | 'live' | 'ended';
    starts_at: string;
    ends_at: string | null;
    rsvps: number;
    rsvped: boolean;
    questions: number;
    owner: boolean;
};

type Question = {
    id: number;
    body: string;
    votes: number;
    voted: boolean;
    mine: boolean;
    answer: string | null;
    answered_at: string | null;
    hidden: boolean;
    user: { name: string; avatar_url: string | null };
};

type QaFull = QaSummary & { can_ask: boolean; open_per_fan: number; list: Question[] };

const LIVE_REFRESH_MS = 5000;
const at = (iso: string) => new Date(iso).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' }).replaceAll('-', '.');
const clock = (iso: string) => new Date(iso).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });

/**
 * A live Q&A on a post. Before: "remind me" and questions in advance. Live: the list refreshes every few seconds
 * and the creator answers the top-voted questions. After: the answers stay.
 */
export default function PostQa({ id, qa: initial }: { id: number; qa: QaSummary }) {
    const { t } = useT();
    const signedIn = !!usePage<SharedData>().props.auth.user;
    const [qa, setQa] = useState<QaSummary | QaFull>(initial);
    const [open, setOpen] = useState(initial.state === 'live');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const full = 'list' in qa ? qa : null;

    const load = useCallback(async () => {
        try {
            const reply = await sendJson<{ qa: QaFull }>('GET', route('posts.qa', id));
            setQa(reply.qa);
        } catch {
            /* the next refresh will try again */
        }
    }, [id]);

    // Questions load when opened. New questions, votes and answers arrive in real time; while that connection is
    // down and the Q&A is live, the list is checked every few seconds instead (only while the tab is visible).
    const connected = useLiveConnected();
    useLive(open && qa.state !== 'ended' ? `qa.${id}` : null, ['qa'], () => void load(), 'public');
    useEffect(() => {
        if (!open) return;
        void load();
        if (qa.state !== 'live' || connected) return;
        const timer = setInterval(() => document.visibilityState === 'visible' && void load(), LIVE_REFRESH_MS);
        return () => clearInterval(timer);
    }, [open, qa.state, load, connected]);

    // Flip from upcoming to live (or live to ended) on time, without a reload.
    useEffect(() => {
        const next = qa.state === 'upcoming' ? qa.starts_at : qa.state === 'live' ? qa.ends_at : null;
        if (!next) return;
        const wait = new Date(next).getTime() - Date.now();
        if (wait > 24 * 3600 * 1000) return;
        const timer = setTimeout(
            () => {
                setQa((q) => ({ ...q, state: q.state === 'upcoming' ? 'live' : 'ended' }));
                if (qa.state === 'upcoming') setOpen(true);
            },
            Math.max(0, wait) + 500,
        );
        return () => clearTimeout(timer);
    }, [qa.state, qa.starts_at, qa.ends_at]);

    async function act(method: 'POST', url: string, body: unknown) {
        setBusy(true);
        setError(null);
        try {
            const reply = await sendJson<{ qa: QaFull }>(method, url, body);
            setQa(reply.qa);
            return true;
        } catch (e) {
            setError(e instanceof Error && e.message === '422' ? t('qa.tooMany', { n: full?.open_per_fan ?? 3 }) : t('qa.error'));
            return false;
        } finally {
            setBusy(false);
        }
    }

    const live = qa.state === 'live';

    return (
        <section
            aria-label={t('qa.title')}
            className={`mx-4 mt-3 rounded-xl border p-3 sm:p-4 ${live ? 'border-red-500/50 bg-red-500/5' : 'border-border'}`}
        >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                {live ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-extrabold tracking-wide text-red-600 uppercase dark:text-red-400">
                        <span className="relative flex size-2.5">
                            <span className="absolute inline-flex size-full animate-ping rounded-full bg-red-500 opacity-75" />
                            <span className="relative inline-flex size-2.5 rounded-full bg-red-500" />
                        </span>
                        {t('qa.liveNow')}
                    </span>
                ) : (
                    <span className="text-primary inline-flex items-center gap-1.5 text-xs font-bold">
                        {qa.state === 'upcoming' ? <CalendarClock className="size-4" /> : <MessageCircleQuestion className="size-4" />}
                        {qa.state === 'upcoming' ? t('qa.upcoming', { when: at(qa.starts_at) }) : t('qa.ended')}
                    </span>
                )}
                {live && qa.ends_at && <span className="text-muted-foreground text-xs">{t('qa.until', { time: clock(qa.ends_at) })}</span>}
                <span className="text-muted-foreground ml-auto text-xs tabular-nums">
                    {t('qa.going', { n: qa.rsvps })} ·{' '}
                    {t('qa.questionsCount', { n: full ? full.list.filter((q) => !q.hidden).length : qa.questions })}
                </span>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
                {qa.state === 'upcoming' && !qa.owner && signedIn && (
                    <button
                        type="button"
                        disabled={busy}
                        onClick={() => void act('POST', route('posts.qa.rsvp', id), { on: !qa.rsvped })}
                        aria-pressed={qa.rsvped}
                        className={`inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-sm font-bold transition disabled:opacity-60 ${
                            qa.rsvped ? 'bg-muted text-foreground' : 'bg-primary text-primary-foreground hover:brightness-110'
                        }`}
                    >
                        {qa.rsvped ? <BellRing className="size-4" /> : <Bell className="size-4" />}
                        {t(qa.rsvped ? 'qa.reminderOn' : 'qa.remindMe')}
                    </button>
                )}
                {!signedIn && qa.state !== 'ended' && (
                    <Link
                        href={route('login')}
                        className="bg-primary text-primary-foreground inline-flex h-9 items-center rounded-full px-4 text-sm font-bold"
                    >
                        {t('qa.signInToAsk')}
                    </Link>
                )}
                {!open && (
                    <button type="button" onClick={() => setOpen(true)} className="text-primary min-h-9 px-1 text-sm font-semibold hover:underline">
                        {t(qa.state === 'ended' ? 'qa.seeAnswers' : 'qa.seeQuestions')}
                    </button>
                )}
            </div>

            {open && full?.can_ask && <AskBox busy={busy} onAsk={(body) => act('POST', route('posts.qa.ask', id), { body })} />}
            {error && (
                <p role="alert" className="text-destructive mt-2 text-sm">
                    {error}
                </p>
            )}

            {open &&
                (full ? (
                    full.list.length === 0 ? (
                        <p className="text-muted-foreground mt-3 text-sm">{t(qa.owner ? 'qa.emptyOwner' : 'qa.empty')}</p>
                    ) : (
                        <ul className="mt-3 flex flex-col gap-2" aria-live={live ? 'polite' : undefined}>
                            {full.list.map((q) => (
                                <QuestionItem
                                    key={q.id}
                                    q={q}
                                    owner={qa.owner}
                                    canVote={signedIn && !qa.owner && !q.mine && qa.state !== 'ended'}
                                    canAnswer={qa.owner && qa.state !== 'upcoming'}
                                    busy={busy}
                                    act={act}
                                />
                            ))}
                        </ul>
                    )
                ) : (
                    <LoaderCircle className="text-muted-foreground mx-auto mt-3 size-5 animate-spin" />
                ))}
        </section>
    );
}

function AskBox({ busy, onAsk }: { busy: boolean; onAsk: (body: string) => Promise<boolean> }) {
    const { t } = useT();
    const [body, setBody] = useState('');

    async function submit(e: FormEvent) {
        e.preventDefault();
        if (body.trim().length < 3) return;
        if (await onAsk(body.trim())) setBody('');
    }

    return (
        <form onSubmit={submit} className="mt-3 flex items-center gap-2">
            <input
                value={body}
                onChange={(e) => setBody(e.target.value)}
                maxLength={300}
                placeholder={t('qa.askPlaceholder')}
                aria-label={t('qa.askPlaceholder')}
                className="border-border bg-card focus-visible:border-ring min-h-10 min-w-0 flex-1 rounded-lg border px-3 text-sm outline-none"
            />
            <button
                type="submit"
                disabled={busy || body.trim().length < 3}
                className="bg-primary text-primary-foreground inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg px-4 text-sm font-bold disabled:opacity-40"
            >
                <Send className="size-4" /> {t('qa.ask')}
            </button>
        </form>
    );
}

function QuestionItem({
    q,
    owner,
    canVote,
    canAnswer,
    busy,
    act,
}: {
    q: Question;
    owner: boolean;
    canVote: boolean;
    canAnswer: boolean;
    busy: boolean;
    act: (method: 'POST', url: string, body: unknown) => Promise<boolean>;
}) {
    const { t } = useT();
    const [answer, setAnswer] = useState('');

    return (
        <li className={`bg-muted/50 flex gap-3 rounded-lg p-3 ${q.hidden ? 'opacity-50' : ''}`}>
            <button
                type="button"
                disabled={!canVote || busy}
                onClick={() => void act('POST', route('qa.vote', q.id), { on: !q.voted })}
                aria-pressed={q.voted}
                aria-label={t('qa.upvote')}
                className={`flex h-12 w-10 shrink-0 flex-col items-center justify-center rounded-lg text-xs font-bold tabular-nums transition ${
                    q.voted ? 'bg-primary text-primary-foreground' : 'bg-card'
                } ${canVote ? 'hover:brightness-95' : 'cursor-default'}`}
            >
                <ChevronUp className="size-4" />
                {q.votes}
            </button>
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                    <UserAvatar name={q.user.name} src={q.user.avatar_url} className="size-5" />
                    <span className="truncate text-xs font-semibold">{q.user.name}</span>
                    {owner && (
                        <button
                            type="button"
                            disabled={busy}
                            onClick={() => void act('POST', route('qa.hide', q.id), { hidden: !q.hidden })}
                            className="text-muted-foreground hover:text-foreground ml-auto inline-flex items-center gap-1 text-xs"
                        >
                            {q.hidden ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />} {t(q.hidden ? 'qa.unhide' : 'qa.hide')}
                        </button>
                    )}
                </div>
                <p className="mt-1 text-sm font-medium break-words">{q.body}</p>
                {q.answer ? (
                    <p className="border-primary mt-2 border-l-2 pl-2 text-sm break-words whitespace-pre-line">{q.answer}</p>
                ) : (
                    canAnswer &&
                    !q.hidden && (
                        <form
                            onSubmit={async (e) => {
                                e.preventDefault();
                                if (answer.trim() && (await act('POST', route('qa.answer', q.id), { answer: answer.trim() }))) setAnswer('');
                            }}
                            className="mt-2 flex items-end gap-2"
                        >
                            <textarea
                                value={answer}
                                onChange={(e) => setAnswer(e.target.value)}
                                maxLength={2000}
                                rows={2}
                                placeholder={t('qa.answerPlaceholder')}
                                className="border-border bg-card focus-visible:border-ring min-w-0 flex-1 resize-none rounded-lg border px-3 py-2 text-sm outline-none"
                            />
                            <button
                                type="submit"
                                disabled={busy || !answer.trim()}
                                className="bg-primary text-primary-foreground inline-flex h-10 shrink-0 items-center rounded-lg px-3 text-sm font-bold disabled:opacity-40"
                            >
                                {t('qa.answer')}
                            </button>
                        </form>
                    )
                )}
            </div>
        </li>
    );
}
