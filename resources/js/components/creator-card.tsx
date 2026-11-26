import FollowButton from '@/components/follow-button';
import UserAvatar from '@/components/user-avatar';
import { mnt } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { type SharedData } from '@/types';
import { Link, usePage } from '@inertiajs/react';
import { BadgeCheck } from 'lucide-react';

export type CreatorCardData = {
    avatar_url: string | null;
    cover_url: string | null;
    handle: string;
    display_name: string;
    bio: string | null;
    price_monthly: number;
    adult_content: boolean;
    posts_count: number;
    followers_count: number;
    following: boolean;
};

/** A creator in a list: cover with the avatar over its edge, who they are, what it costs, and a follow button. */
export default function CreatorCard({ c }: { c: CreatorCardData }) {
    const { t } = useT();
    const { auth } = usePage<SharedData>().props;
    const isMe = auth.creator?.handle === c.handle;

    return (
        <article className="bg-card group/card flex min-w-0 flex-col overflow-hidden rounded-2xl shadow-xs transition hover:bg-[color-mix(in_oklab,var(--card),var(--foreground)_4%)] hover:shadow-md">
            <Link href={route('creator.show', c.handle)} className="block focus-visible:outline-2 focus-visible:-outline-offset-2">
                <div className="from-primary/30 to-primary/5 aspect-[16/7] overflow-hidden bg-gradient-to-br">
                    {c.cover_url && <img src={c.cover_url} alt="" loading="lazy" className="h-full w-full object-cover" />}
                </div>
                <div className="flex items-end justify-between gap-3 px-4">
                    <UserAvatar
                        name={c.display_name}
                        src={c.avatar_url}
                        seed={c.handle}
                        className="ring-card relative -mt-9 size-[72px] shrink-0 text-2xl ring-4"
                    />
                    <span className="bg-primary/12 text-primary mb-1 shrink-0 rounded-full px-3 py-1 text-sm font-bold tabular-nums">
                        {t('cp.monthly', { price: mnt(c.price_monthly) })}
                    </span>
                </div>
                <div className="mt-2 px-4">
                    <span className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate text-[17px] font-bold tracking-tight group-hover/card:underline">{c.display_name}</span>
                        <BadgeCheck className="text-primary size-4 shrink-0" aria-hidden />
                        {c.adult_content && <span className="rounded bg-rose-100 px-1 text-[10px] font-semibold text-rose-700">18+</span>}
                    </span>
                    <span className="text-muted-foreground block truncate text-sm">@{c.handle}</span>
                </div>
            </Link>
            <p className="text-muted-foreground mt-2 line-clamp-2 min-h-10 px-4 text-sm leading-5">{c.bio}</p>
            <div className="mt-auto flex items-center justify-between gap-2 px-4 pt-4 pb-4">
                <span className="text-muted-foreground min-w-0 truncate text-xs">
                    {t('fan.counts', { posts: c.posts_count, followers: c.followers_count })}
                </span>
                {!isMe && <FollowButton handle={c.handle} initial={c.following} size="sm" />}
            </div>
        </article>
    );
}
