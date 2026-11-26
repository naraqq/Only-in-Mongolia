import MassMessage from '@/components/mass-message';
import PostCard, { type PostItem } from '@/components/post-card';
import PostComposer, { type ComposerHandle } from '@/components/post-composer';
import PostEditor from '@/components/post-editor';
import StudioLayout from '@/layouts/studio-layout';
import { mnt } from '@/lib/format';
import { useT, type TKey } from '@/lib/i18n';
import { Link, router } from '@inertiajs/react';
import { ArrowRight, Check, Copy, CreditCard, ExternalLink, Heart, PenSquare, ShieldCheck, UserPlus, Wallet, type LucideIcon } from 'lucide-react';
import { useRef, useState } from 'react';

type StudioCreator = { handle: string; display_name: string; price_monthly: number; adult_content: boolean; avatar_url: string | null };
type Stats = { subscribers: number; followers: number; earnedThisMonth: number; feePercent: number };
type Filter = 'all' | 'published' | 'scheduled';
const FILTERS: [Filter, TKey][] = [
    ['all', 'stu.all'],
    ['published', 'stu.published'],
    ['scheduled', 'stu.scheduled'],
];

/** Studio home: how the page is doing, write a post, manage posts; earnings, sharing and messaging fans on the side. */
export default function Studio({ creator, posts, stats }: { creator: StudioCreator; posts: PostItem[]; stats: Stats }) {
    const { t } = useT();
    const [editing, setEditing] = useState<number | null>(null);
    const [filter, setFilter] = useState<Filter>('all');
    const composer = useRef<ComposerHandle>(null);
    const composerBox = useRef<HTMLDivElement>(null);
    const author = { name: creator.display_name, handle: creator.handle, avatar_url: creator.avatar_url };
    const likes = posts.reduce((s, p) => s + p.likes_count, 0);
    const scheduled = posts.filter((p) => p.publish_at).length;
    const shown = posts.filter((p) => (filter === 'all' ? true : filter === 'scheduled' ? !!p.publish_at : !p.publish_at));

    function write() {
        composerBox.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        composer.current?.focus();
    }

    return (
        <StudioLayout
            title={t('nav.studio')}
            heading={t('adm.hello', { name: creator.display_name })}
            subtitle={`@${creator.handle} · ${mnt(creator.price_monthly)}${t('cr.perMonth')}`}
            actions={
                <button
                    type="button"
                    onClick={write}
                    className="bg-primary text-primary-foreground inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-bold transition hover:brightness-110"
                >
                    <PenSquare className="size-4" /> <span className="hidden sm:inline">{t('nav.newPost')}</span>
                </button>
            }
        >
            <div className="flex flex-col gap-5">
                <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                    <Stat icon={CreditCard} label={t('st.subscribers')} value={stats.subscribers.toLocaleString('en-US')} />
                    <Stat icon={UserPlus} label={t('pe.dmFollowers')} value={stats.followers.toLocaleString('en-US')} />
                    <Stat icon={Wallet} label={t('st.earned')} value={mnt(stats.earnedThisMonth)} />
                    <Stat icon={Heart} label={t('stu.likes')} value={likes.toLocaleString('en-US')} />
                </section>

                <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
                    {/* Write and manage */}
                    <div className="flex min-w-0 flex-col gap-5">
                        <div ref={composerBox}>
                            <PostComposer ref={composer} adultAllowed={creator.adult_content} className="border-border border-b p-4" />
                            <p className="text-muted-foreground mt-2 flex items-start gap-1.5 px-1 text-xs">
                                <ShieldCheck className="mt-px size-3.5 shrink-0" /> {t('st.rules')}
                            </p>
                        </div>

                        <section>
                            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                                <h2 className="text-lg font-bold">
                                    {t('st.yourPosts')} <span className="text-muted-foreground font-semibold">{posts.length}</span>
                                </h2>
                                <div className="bg-muted inline-flex rounded-full p-1">
                                    {FILTERS.map(([f, label]) => (
                                        <button
                                            key={f}
                                            type="button"
                                            onClick={() => setFilter(f)}
                                            className={`h-8 rounded-full px-3 text-sm font-semibold transition ${
                                                filter === f ? 'bg-card shadow-sm' : 'text-muted-foreground hover:text-foreground'
                                            }`}
                                        >
                                            {t(label)}
                                            {f === 'scheduled' && scheduled > 0 && <span className="text-sky-600"> {scheduled}</span>}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {shown.length === 0 ? (
                                <div className="bg-card flex flex-col items-center gap-3 rounded-2xl px-6 py-12 text-center shadow-xs">
                                    <span className="bg-primary/10 text-primary grid size-14 place-items-center rounded-2xl">
                                        <PenSquare className="size-6" />
                                    </span>
                                    <p className="font-bold">{t('st.empty')}</p>
                                    <p className="text-muted-foreground max-w-xs text-sm">{t('stu.emptyD')}</p>
                                    <button
                                        type="button"
                                        onClick={write}
                                        className="bg-muted hover:bg-muted/70 mt-1 h-10 rounded-full px-5 text-sm font-bold"
                                    >
                                        {t('nav.newPost')}
                                    </button>
                                </div>
                            ) : (
                                <div className="flex flex-col gap-4">
                                    {shown.map((p) =>
                                        editing === p.id ? (
                                            <PostEditor key={p.id} post={p} onDone={() => setEditing(null)} />
                                        ) : (
                                            <PostCard
                                                key={p.id}
                                                post={p}
                                                author={author}
                                                onEdit={() => setEditing(p.id)}
                                                onPin={() => router.post(route('studio.posts.pin', p.id), {}, { preserveScroll: true })}
                                                onDelete={() =>
                                                    confirm(t('st.confirmDelete')) &&
                                                    router.delete(route('studio.posts.destroy', p.id), { preserveScroll: true })
                                                }
                                            />
                                        ),
                                    )}
                                </div>
                            )}
                        </section>
                    </div>

                    {/* Side */}
                    <aside className="flex flex-col gap-5 lg:sticky lg:top-24">
                        <section className="relative overflow-hidden rounded-xl bg-[#263125] p-5 text-white">
                            <p className="relative text-sm text-white/70">{t('st.earned')}</p>
                            <p className="relative mt-1 text-3xl font-extrabold tracking-tight tabular-nums">{mnt(stats.earnedThisMonth)}</p>
                            <p className="relative mt-1 text-xs text-white/60">{t('st.feeNote', { fee: stats.feePercent })}</p>
                            <Link
                                href={route('studio.earnings')}
                                className="relative mt-4 inline-flex h-10 items-center gap-2 rounded-full bg-white px-4 text-sm font-bold text-zinc-900 transition hover:bg-white/90"
                            >
                                {t('ea.open')} <ArrowRight className="size-4" />
                            </Link>
                        </section>

                        <ShareCard handle={creator.handle} />

                        <MassMessage subscribers={stats.subscribers} followers={stats.followers} />
                    </aside>
                </div>
            </div>
        </StudioLayout>
    );
}

function Stat({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
    return (
        <div className="bg-card rounded-2xl p-4 shadow-xs">
            <div className="flex items-center justify-between gap-2">
                <p className="text-muted-foreground text-sm font-medium">{label}</p>
                <span className="bg-primary/10 text-primary grid size-9 shrink-0 place-items-center rounded-xl">
                    <Icon className="size-[18px]" />
                </span>
            </div>
            <p className="mt-2 text-2xl font-extrabold tracking-tight tabular-nums sm:text-[28px]">{value}</p>
        </div>
    );
}

/** The page's address, ready to copy and send to fans. */
function ShareCard({ handle }: { handle: string }) {
    const { t } = useT();
    const [copied, setCopied] = useState(false);
    const url = route('creator.show', handle);
    const shown = url.replace(/^https?:\/\//, '');

    async function copy() {
        try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
        } catch {
            /* clipboard blocked: the link is still visible to copy by hand */
        }
    }

    return (
        <section className="bg-card rounded-2xl p-4 shadow-xs">
            <h2 className="font-bold">{t('stu.share')}</h2>
            <p className="text-muted-foreground mt-0.5 text-sm">{t('stu.shareD')}</p>
            <div className="bg-muted mt-3 flex items-center gap-1 rounded-xl p-1 pl-3">
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{shown}</span>
                <button
                    type="button"
                    onClick={copy}
                    className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-bold transition ${
                        copied ? 'bg-emerald-500 text-white' : 'bg-card hover:bg-card/80 shadow-sm'
                    }`}
                >
                    {copied ? <Check className="size-4" /> : <Copy className="size-4" />} {t(copied ? 'stu.copied' : 'stu.copy')}
                </button>
                <a
                    href={url}
                    className="text-muted-foreground hover:text-foreground grid size-8 shrink-0 place-items-center rounded-lg transition"
                    aria-label={t('stu.myPage')}
                >
                    <ExternalLink className="size-4" />
                </a>
            </div>
        </section>
    );
}
