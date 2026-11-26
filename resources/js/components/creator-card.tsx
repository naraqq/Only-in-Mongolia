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

/** A creator in a list: who they are, what it costs, and a follow button. */
export default function CreatorCard({ c }: { c: CreatorCardData }) {
    const { t } = useT();
    const { auth } = usePage<SharedData>().props;
    const isMe = auth.creator?.handle === c.handle;

    return (
        <article className="border-border flex min-w-0 flex-col border-b pb-5">
            <Link href={route('creator.show', c.handle)} className="group block focus-visible:outline-2 focus-visible:outline-offset-4">
                {c.cover_url && (
                    <div className="bg-muted mb-4 aspect-[16/9] overflow-hidden rounded-lg">
                        <img
                            src={c.cover_url}
                            alt=""
                            loading="lazy"
                            className="h-full w-full object-cover motion-safe:transition-transform motion-safe:duration-500 motion-safe:group-hover:scale-[1.04]"
                        />
                    </div>
                )}
                <span className="flex items-center gap-3">
                    <UserAvatar name={c.display_name} src={c.avatar_url} seed={c.handle} className="size-12 text-lg" />
                    <span className="min-w-0">
                        <span className="flex items-center gap-1.5 font-semibold">
                            <span className="truncate text-lg font-bold tracking-tight">{c.display_name}</span>
                            <BadgeCheck className="text-primary size-4 shrink-0" aria-hidden />
                            {c.adult_content && <span className="rounded bg-rose-100 px-1 text-[10px] font-semibold text-rose-700">18+</span>}
                        </span>
                        <span className="text-muted-foreground block truncate text-sm">@{c.handle}</span>
                    </span>
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
