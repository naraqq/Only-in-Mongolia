import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { sendJson } from '@/lib/http';
import { useT } from '@/lib/i18n';
import { Link, useForm } from '@inertiajs/react';
import { ArrowUpRight, BarChart3, Check } from 'lucide-react';
import { useState, type FormEvent } from 'react';

export type PollData = {
    options: { label: string; votes: number }[];
    selected: number | null;
    can_vote: boolean;
    follow_up_id: number | null;
};

export type FollowUpChoice = { id: number; body: string | null };

export default function PostPoll({ id, handle, poll, choices }: { id: number; handle: string; poll: PollData; choices?: FollowUpChoice[] }) {
    const { t } = useT();
    const [updated, setUpdated] = useState<PollData | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(false);
    const result = updated ?? poll;
    const total = result.options.reduce((sum, option) => sum + option.votes, 0);
    const showResults = result.selected !== null || !result.can_vote;

    async function vote(option: number) {
        setBusy(true);
        setError(false);
        try {
            const reply = await sendJson<{ poll: PollData }>('POST', route('posts.poll.vote', id), { option });
            setUpdated(reply.poll);
        } catch {
            setError(true);
        } finally {
            setBusy(false);
        }
    }

    return (
        <section aria-label={t('poll.title')} className="border-border mx-4 mt-3 rounded-xl border p-3 sm:p-4">
            <div className="text-primary mb-2 flex items-center gap-1.5 text-xs font-bold">
                <BarChart3 className="size-4" aria-hidden /> {t('poll.title')}
            </div>
            <div className="grid gap-2">
                {result.options.map((option, index) => {
                    const percent = total ? Math.round((option.votes * 100) / total) : 0;
                    return showResults ? (
                        <div
                            key={option.label}
                            className="bg-muted relative isolate flex min-h-11 items-center justify-between gap-3 overflow-hidden rounded-lg px-3 py-2 text-sm"
                        >
                            <span aria-hidden className="bg-primary/15 absolute inset-y-0 left-0 -z-10" style={{ width: `${percent}%` }} />
                            <span className="flex min-w-0 items-center gap-2 break-words">
                                {result.selected === index && <Check className="text-primary size-4 shrink-0" aria-label={t('poll.yourVote')} />}
                                {option.label}
                            </span>
                            <span className="shrink-0 font-bold tabular-nums">{percent}%</span>
                        </div>
                    ) : (
                        <button
                            key={option.label}
                            type="button"
                            disabled={busy}
                            onClick={() => void vote(index)}
                            className="border-border hover:border-primary hover:bg-primary/5 min-h-11 rounded-lg border px-3 py-2 text-left text-sm font-medium break-words transition disabled:opacity-60"
                        >
                            {option.label}
                        </button>
                    );
                })}
            </div>
            <p aria-live="polite" className="text-muted-foreground mt-2 text-xs">
                {t('poll.votes', { count: total })}
            </p>
            {error && (
                <p role="alert" className="text-destructive mt-2 text-sm">
                    {t('poll.voteError')}
                </p>
            )}
            {poll.follow_up_id !== null && (
                <Link
                    href={route('creator.show', { handle, _query: { focus: poll.follow_up_id } }) + `#post-${poll.follow_up_id}`}
                    className="text-primary mt-3 inline-flex min-h-9 items-center gap-1.5 text-sm font-bold hover:underline"
                >
                    {t('poll.viewFollowUp')} <ArrowUpRight className="size-4" aria-hidden />
                </Link>
            )}
            {choices !== undefined && <FollowUpForm key={poll.follow_up_id ?? 'none'} id={id} initial={poll.follow_up_id} choices={choices} />}
        </section>
    );
}

function FollowUpForm({ id, initial, choices }: { id: number; initial: number | null; choices: FollowUpChoice[] }) {
    const { t } = useT();
    const form = useForm({ post_id: initial === null ? '' : String(initial) });

    function save(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        form.post(route('posts.poll.follow-up', id), { preserveScroll: true });
    }

    if (!choices.length) return <p className="text-muted-foreground border-border mt-3 border-t pt-3 text-xs">{t('poll.publishFollowUp')}</p>;

    return (
        <form onSubmit={save} className="border-border mt-3 flex flex-wrap items-end gap-2 border-t pt-3">
            <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm font-semibold">
                {t('poll.followUp')}
                <select
                    value={form.data.post_id}
                    onChange={(event) => form.setData('post_id', event.target.value)}
                    className="border-border bg-card min-h-10 w-full min-w-0 rounded-lg border px-2 text-sm"
                >
                    <option value="">{t('poll.noFollowUp')}</option>
                    {choices.map((post) => (
                        <option key={post.id} value={post.id}>
                            {post.body?.slice(0, 75) || t('poll.postLabel', { id: post.id })}
                        </option>
                    ))}
                </select>
            </label>
            <Button type="submit" variant="outline" disabled={form.processing || !form.isDirty}>
                {t('pe.save')}
            </Button>
            <InputError className="w-full" message={form.errors.post_id} />
        </form>
    );
}
