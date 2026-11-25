import FollowButton from '@/components/follow-button';
import UserAvatar from '@/components/user-avatar';
import { mnt } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { type SharedData } from '@/types';
import { Link, usePage } from '@inertiajs/react';
import { BadgeCheck } from 'lucide-react';

export type CreatorCardData = {
    avatar_url: string | null;
    handle: string;
    display_name: string;
    bio: string | null;
    price_monthly: number;
    adult_content: boolean;
    posts_count: number;
    followers_count: number;
    following: boolean;
};

/** A creator in a list: who they are, what it costs, and a follow button. */
export default function CreatorCard({ c }: { c: CreatorCardData }) {
    const { t } = useT();
    const { auth } = usePage<SharedData>().props;
    const isMe = auth.creator?.handle === c.handle;

    return (
        <article className="flex flex-col rounded-xl border p-4 transition hover:shadow-sm">
            <Link href={route('creator.show', c.handle)} className="flex items-center gap-3">
                <UserAvatar name={c.display_name} src={c.avatar_url} seed={c.handle} className="size-12 text-lg" />
                <span className="min-w-0">
                    <span className="flex items-center gap-1.5 font-semibold">
                        <span className="truncate">{c.display_name}</span>
                        <BadgeCheck className="size-4 shrink-0 text-sky-500" aria-hidden />
                        {c.adult_content && <span className="rounded bg-rose-100 px-1 text-[10px] font-semibold text-rose-700">18+</span>}
                    </span>
                    <span className="text-muted-foreground block truncate text-sm">@{c.handle}</span>
                </span>
            </Link>
            {c.bio && <p className="text-muted-foreground mt-3 line-clamp-2 text-sm">{c.bio}</p>}
            <div className="mt-auto flex items-center justify-between gap-2 pt-4">
                <div className="text-muted-foreground text-xs">
                    <b className="text-foreground font-semibold">{t('cp.monthly', { price: mnt(c.price_monthly) })}</b>
                    <span className="block">{t('fan.counts', { posts: c.posts_count, followers: c.followers_count })}</span>
                </div>
                {!isMe && <FollowButton handle={c.handle} initial={c.following} size="sm" />}
            </div>
        </article>
    );
}
