import { type CreatorCardData } from '@/components/creator-card';
import FollowButton from '@/components/follow-button';
import PostCard, { type PostItem } from '@/components/post-card';
import { Button } from '@/components/ui/button';
import UserAvatar from '@/components/user-avatar';
import SocialLayout from '@/layouts/social-layout';
import { useT, type TKey } from '@/lib/i18n';
import { type SharedData } from '@/types';
import { Link, router, usePage } from '@inertiajs/react';
import { ArrowRight, Clock3, Search as SearchIcon, SlidersHorizontal, X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';

type Filters = {
    q: string;
    tab: 'all' | 'creators' | 'posts';
    sort: 'relevance' | 'latest' | 'popular';
    media: 'any' | 'image' | 'video';
    date: 'any' | 'week' | 'month' | 'year';
};
type ResultPost = PostItem & { author: { name: string; handle: string; avatar_url: string | null } };
type Props = {
    filters: Filters;
    creators: CreatorCardData[];
    posts: ResultPost[];
    page: number;
    moreCreators: boolean;
    morePosts: boolean;
    /** Recent searches, from the account (signed-in only). */
    recent: string[];
};

const tabs = { all: 'search.all', creators: 'search.creators', posts: 'search.posts' } satisfies Record<Filters['tab'], TKey>;
const sorts = { relevance: 'search.relevance', latest: 'search.latest', popular: 'search.popular' } satisfies Record<Filters['sort'], TKey>;
const dates = { any: 'search.anyDate', week: 'search.week', month: 'search.month', year: 'search.year' } satisfies Record<Filters['date'], TKey>;
const media = { any: 'search.anyMedia', image: 'search.photos', video: 'search.videos' } satisfies Record<Filters['media'], TKey>;

export default function Search({ filters, creators, posts, page, moreCreators, morePosts, recent }: Props) {
    const { t } = useT();
    const { auth } = usePage<SharedData>().props;
    const [draft, setDraft] = useState(filters.q);
    const [loading, setLoading] = useState(false);
    const [filtersOpen, setFiltersOpen] = useState(false);
    const searchField = useRef<HTMLInputElement>(null);
    const activeFilters =
        Number(filters.sort !== 'relevance') + (filters.tab === 'creators' ? 0 : Number(filters.date !== 'any') + Number(filters.media !== 'any'));

    useEffect(() => {
        setDraft(filters.q);
    }, [filters.q]);

    function destination(next: Partial<Filters> = {}, targetPage = 1) {
        const value = { ...filters, ...next };
        return route('search', {
            q: value.q || undefined,
            tab: value.tab !== 'all' ? value.tab : undefined,
            sort: value.sort !== 'relevance' ? value.sort : undefined,
            media: value.tab !== 'creators' && value.media !== 'any' ? value.media : undefined,
            date: value.tab !== 'creators' && value.date !== 'any' ? value.date : undefined,
            page: targetPage > 1 ? targetPage : undefined,
        });
    }

    function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        router.get(destination({ q: draft.trim() }), {}, { preserveState: true, onStart: () => setLoading(true), onFinish: () => setLoading(false) });
    }

    // Recent searches are kept on the account; the server remembers each search and returns the latest.
    const clearRecent = () => router.delete(route('search.recent.clear'), { preserveScroll: true, preserveState: true });
    const forget = (query: string) => router.delete(route('search.recent.forget'), { data: { q: query }, preserveScroll: true, preserveState: true });

    function applyFilter(next: Partial<Filters>) {
        router.get(destination(next), {}, { preserveState: true, preserveScroll: true });
    }

    return (
        <SocialLayout title={t('nav.search')} wide>
            <div className="mx-auto w-full max-w-5xl px-4 pt-8 pb-12 sm:px-7 sm:pt-12 lg:px-10">
                <h1 className="text-4xl leading-none font-black tracking-[-0.055em] sm:text-6xl">{t('nav.search')}</h1>
                <form
                    role="search"
                    className="border-border bg-card focus-within:border-ring focus-within:ring-ring/15 mt-5 flex min-w-0 items-center gap-1 rounded-2xl border p-1.5 pl-3 transition focus-within:ring-4 sm:mt-6 sm:gap-2 sm:p-2 sm:pl-4"
                    onSubmit={submit}
                >
                    <SearchIcon className="text-muted-foreground size-5 shrink-0" aria-hidden />
                    <input
                        ref={searchField}
                        type="search"
                        aria-label={t('nav.search')}
                        placeholder={t('search.placeholder')}
                        maxLength={100}
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        className="placeholder:text-muted-foreground min-h-10 min-w-0 flex-1 bg-transparent px-1 font-medium outline-none sm:min-h-12 sm:text-lg [&::-webkit-search-cancel-button]:hidden"
                    />
                    {draft && (
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={t('search.clearQuery')}
                            onClick={() => {
                                setDraft('');
                                searchField.current?.focus();
                            }}
                        >
                            <X aria-hidden />
                        </Button>
                    )}
                    <Button type="submit" className="h-10 rounded-xl px-3 font-bold sm:h-12 sm:px-5" disabled={loading}>
                        {t('nav.search')} <ArrowRight className="hidden sm:block" aria-hidden />
                    </Button>
                </form>

                {filters.q ? (
                    <div aria-busy={loading} className="animate-page-in">
                        <div className="border-border mt-5 flex min-w-0 items-center justify-between gap-1.5 border-b sm:mt-7">
                            <nav
                                aria-label={t('search.resultTypes')}
                                className="flex min-w-0 gap-2 overflow-x-auto overflow-y-hidden [scrollbar-width:none] sm:gap-5"
                            >
                                {(Object.keys(tabs) as Filters['tab'][]).map((tab) => (
                                    <Link
                                        key={tab}
                                        href={destination({ tab })}
                                        aria-current={filters.tab === tab ? 'page' : undefined}
                                        className={`inline-flex min-h-12 shrink-0 items-center border-b-2 px-1.5 text-sm font-bold transition-colors sm:px-2 ${filters.tab === tab ? 'border-primary text-primary' : 'text-muted-foreground hover:text-foreground border-transparent'}`}
                                    >
                                        {t(tabs[tab])}
                                    </Link>
                                ))}
                            </nav>
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                aria-expanded={filtersOpen}
                                aria-controls="search-filters"
                                className="shrink-0 lg:hidden"
                                onClick={() => setFiltersOpen((open) => !open)}
                            >
                                <SlidersHorizontal aria-hidden /> <span className="max-[359px]:sr-only">{t('search.filters')}</span>
                                {activeFilters > 0 && (
                                    <span className="bg-primary text-primary-foreground rounded-full px-1.5 text-xs">{activeFilters}</span>
                                )}
                            </Button>
                        </div>
                        <div className="grid min-w-0 gap-0 lg:grid-cols-[minmax(0,1fr)_210px] lg:gap-8 xl:gap-12">
                            <aside
                                id="search-filters"
                                className={`border-border min-w-0 border-b py-4 lg:sticky lg:top-5 lg:order-2 lg:mt-6 lg:block lg:self-start lg:border-b-0 lg:border-l lg:py-0 lg:pl-5 ${filtersOpen ? 'block' : 'hidden'}`}
                            >
                                <div className="mb-3 flex items-center justify-between gap-2">
                                    <h2 className="text-sm font-bold">{t('search.filters')}</h2>
                                    {activeFilters > 0 && (
                                        <Link
                                            preserveState
                                            preserveScroll
                                            href={destination({ sort: 'relevance', date: 'any', media: 'any' })}
                                            className="text-primary text-xs font-semibold hover:underline"
                                        >
                                            {t('search.reset')}
                                        </Link>
                                    )}
                                </div>
                                <div className="grid grid-cols-2 gap-2 lg:grid-cols-1 lg:gap-3">
                                    <Filter label="search.sort" options={sorts} value={filters.sort} onChange={(sort) => applyFilter({ sort })} />
                                    {filters.tab !== 'creators' && (
                                        <>
                                            <Filter
                                                label="search.date"
                                                options={dates}
                                                value={filters.date}
                                                onChange={(date) => applyFilter({ date })}
                                            />
                                            <Filter
                                                label="search.format"
                                                options={media}
                                                value={filters.media}
                                                onChange={(format) => applyFilter({ media: format })}
                                            />
                                        </>
                                    )}
                                </div>
                            </aside>
                            <div className="min-w-0 lg:order-1">
                                {creators.length === 0 && posts.length === 0 && (
                                    <div className="py-12">
                                        <h2 className="text-lg font-bold">{t('search.noResults')}</h2>
                                        <p className="text-muted-foreground mt-1 text-sm">{t('search.tryAgain')}</p>
                                    </div>
                                )}
                                {creators.length > 0 && (
                                    <section className="pt-6">
                                        <ResultHeading
                                            title="search.creators"
                                            more={filters.tab === 'all' && moreCreators ? destination({ tab: 'creators' }) : null}
                                        />
                                        <ul className="divide-border divide-y">
                                            {creators.map((creator) => (
                                                <li
                                                    key={creator.handle}
                                                    className="hover:bg-muted/70 flex min-w-0 items-start gap-3 rounded-xl px-2 py-4 transition-colors sm:px-3"
                                                >
                                                    <Link
                                                        href={route('creator.show', creator.handle)}
                                                        className="group flex min-w-0 flex-1 items-start gap-3"
                                                    >
                                                        <UserAvatar
                                                            name={creator.display_name}
                                                            src={creator.avatar_url}
                                                            seed={creator.handle}
                                                            className="size-12 shrink-0 sm:size-14"
                                                        />
                                                        <span className="min-w-0">
                                                            <span className="block truncate font-bold group-hover:underline">
                                                                {creator.display_name}
                                                            </span>
                                                            <span className="text-muted-foreground block truncate text-sm">@{creator.handle}</span>
                                                            {creator.bio && (
                                                                <span className="text-muted-foreground mt-1 line-clamp-2 text-sm">{creator.bio}</span>
                                                            )}
                                                        </span>
                                                    </Link>
                                                    {auth.creator?.handle !== creator.handle && (
                                                        <FollowButton handle={creator.handle} initial={creator.following} size="sm" />
                                                    )}
                                                </li>
                                            ))}
                                        </ul>
                                    </section>
                                )}
                                {posts.length > 0 && (
                                    <section className="pt-6">
                                        <ResultHeading
                                            title="search.posts"
                                            more={filters.tab === 'all' && morePosts ? destination({ tab: 'posts' }) : null}
                                        />
                                        <div className="space-y-4">
                                            {posts.map((post) => (
                                                <PostCard key={post.id} post={post} author={post.author} linkAuthor compactMedia />
                                            ))}
                                        </div>
                                    </section>
                                )}
                            </div>
                        </div>
                        {filters.tab !== 'all' && (page > 1 || moreCreators || morePosts) && (
                            <nav aria-label={t('search.pages')} className="mt-6 flex flex-wrap items-center gap-3">
                                {page > 1 && (
                                    <Button variant="outline" asChild>
                                        <Link href={destination({}, page - 1)}>{t('search.previous')}</Link>
                                    </Button>
                                )}
                                <span className="text-muted-foreground text-sm">{t('search.page', { page })}</span>
                                {(moreCreators || morePosts) && (
                                    <Button variant="outline" asChild>
                                        <Link href={destination({}, page + 1)}>{t('search.next')}</Link>
                                    </Button>
                                )}
                            </nav>
                        )}
                    </div>
                ) : recent.length > 0 ? (
                    <section className="mt-7">
                        <div className="mb-2 flex items-center justify-between gap-3">
                            <h2 className="text-lg font-bold">{t('search.recent')}</h2>
                            <Button type="button" variant="ghost" size="sm" onClick={clearRecent}>
                                {t('search.clear')}
                            </Button>
                        </div>
                        <ul className="divide-border divide-y">
                            {recent.map((query) => (
                                <li key={query} className="group flex items-center gap-1">
                                    <Link
                                        href={destination({ q: query })}
                                        className="hover:bg-muted flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-md px-2 text-sm"
                                    >
                                        <Clock3 className="text-muted-foreground size-4 shrink-0" aria-hidden />
                                        <span className="truncate">{query}</span>
                                    </Link>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        aria-label={t('search.forget', { query })}
                                        className="text-muted-foreground shrink-0 opacity-60 group-hover:opacity-100"
                                        onClick={() => forget(query)}
                                    >
                                        <X aria-hidden />
                                    </Button>
                                </li>
                            ))}
                        </ul>
                    </section>
                ) : (
                    <p className="text-muted-foreground mt-5 text-sm">{t('search.hint')}</p>
                )}
            </div>
        </SocialLayout>
    );
}

function Filter<T extends string>({
    label,
    options,
    value,
    onChange,
}: {
    label: TKey;
    options: Record<T, TKey>;
    value: T;
    onChange: (value: T) => void;
}) {
    const { t } = useT();
    return (
        <label className="flex min-w-0 flex-col gap-1 sm:min-w-32">
            <span className="text-muted-foreground text-xs font-medium">{t(label)}</span>
            <select
                value={value}
                onChange={(event) => onChange(event.target.value as T)}
                className="border-border bg-card min-h-10 min-w-0 rounded-lg border px-2 text-sm"
            >
                {(Object.keys(options) as T[]).map((key) => (
                    <option key={key} value={key}>
                        {t(options[key])}
                    </option>
                ))}
            </select>
        </label>
    );
}

function ResultHeading({ title, more }: { title: TKey; more: string | null }) {
    const { t } = useT();
    return (
        <div className="mb-2 flex items-center justify-between gap-3">
            <h2 className="text-xl font-bold tracking-tight">{t(title)}</h2>
            {more && (
                <Link href={more} className="text-primary py-2 text-sm font-semibold hover:underline">
                    {t('search.seeAll')}
                </Link>
            )}
        </div>
    );
}
