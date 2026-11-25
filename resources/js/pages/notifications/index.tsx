import UserAvatar from '@/components/user-avatar';
import SocialLayout from '@/layouts/social-layout';
import { mnt } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { Link } from '@inertiajs/react';
import { Banknote, Bell, CalendarClock, HandCoins, ImagePlus, LockOpen, MessageCircle, Star, UserPlus, type LucideIcon } from 'lucide-react';

type Kind = 'followed' | 'subscribed' | 'tipped' | 'purchased' | 'new_post' | 'commented' | 'expiring' | 'payout_paid' | 'payout_rejected';
type Item = {
    id: string;
    kind: Kind;
    read: boolean;
    at: string;
    data: { amount?: number; renewed?: boolean; note?: string; expires_at?: string };
    actor: { name: string; handle: string | null; avatar_url: string | null } | null;
    url: string | null;
};

const ICONS: Record<Kind, [LucideIcon, string]> = {
    followed: [UserPlus, 'bg-sky-500'],
    payout_paid: [Banknote, 'bg-emerald-600'],
    payout_rejected: [Banknote, 'bg-red-600'],
    subscribed: [Star, 'bg-primary'],
    tipped: [HandCoins, 'bg-amber-500'],
    purchased: [LockOpen, 'bg-orange-500'],
    new_post: [ImagePlus, 'bg-violet-500'],
    commented: [MessageCircle, 'bg-sky-500'],
    expiring: [CalendarClock, 'bg-zinc-700'],
};

/** The bell: who followed, subscribed, tipped or bought, new posts, and subscriptions about to end. */
export default function Notifications({ notifications }: { notifications: Item[] }) {
    const { t } = useT();

    function text(n: Item) {
        const name = n.actor?.name ?? '—';
        const amount = n.data.amount ? mnt(n.data.amount) : '';
        switch (n.kind) {
            case 'followed':
                return t('nt.followed', { name });
            case 'subscribed':
                return t(n.data.renewed ? 'nt.renewed' : 'nt.subscribed', { name, amount });
            case 'tipped':
                return t('nt.tipped', { name, amount });
            case 'purchased':
                return t('nt.purchased', { name, amount });
            case 'commented':
                return t('nt.commented', { name });
            case 'new_post':
                return t('nt.newPost', { name });
            case 'payout_paid':
                return t('nt.payoutPaid', { amount });
            case 'payout_rejected':
                return t('nt.payoutRejected', { amount });
            case 'expiring':
                return t('nt.expiring', { name, date: (n.data.expires_at ?? '').slice(0, 10).replaceAll('-', '.') });
        }
    }

    return (
        <SocialLayout title={t('nav.notifications')} header={<h1 className="text-lg font-bold tracking-wide uppercase">{t('nav.notifications')}</h1>}>
            {notifications.length === 0 ? (
                <div className="text-muted-foreground flex flex-col items-center gap-3 p-12 text-center text-sm">
                    <span className="bg-muted grid size-16 place-items-center rounded-full">
                        <Bell className="size-7" />
                    </span>
                    {t('nt.empty')}
                </div>
            ) : (
                <ul className="divide-y">
                    {notifications.map((n) => {
                        const [Icon, color] = ICONS[n.kind] ?? [Bell, 'bg-zinc-500'];
                        const body = (
                            <div className={`flex gap-3 px-4 py-3.5 transition ${n.read ? '' : 'bg-primary/5'} ${n.url ? 'hover:bg-muted/60' : ''}`}>
                                <span className="relative shrink-0">
                                    <UserAvatar
                                        name={n.actor?.name ?? '?'}
                                        src={n.actor?.avatar_url}
                                        seed={n.actor?.handle ?? n.actor?.name}
                                        className="size-11"
                                    />
                                    <span
                                        className={`ring-background absolute -right-1 -bottom-1 grid size-5 place-items-center rounded-full text-white ring-2 ${color}`}
                                    >
                                        <Icon className="size-3" />
                                    </span>
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block text-[15px] leading-snug">{text(n)}</span>
                                    {n.data.note && (
                                        <span className="text-muted-foreground mt-0.5 block truncate text-sm italic">“{n.data.note}”</span>
                                    )}
                                    <span className="text-muted-foreground mt-0.5 block text-xs">{when(n.at)}</span>
                                </span>
                                {!n.read && <span className="bg-primary mt-2 size-2.5 shrink-0 rounded-full" aria-label="new" />}
                            </div>
                        );
                        return <li key={n.id}>{n.url ? <Link href={n.url}>{body}</Link> : body}</li>;
                    })}
                </ul>
            )}
        </SocialLayout>
    );
}

/** "5m", "3h", "2d", or the date. */
function when(iso: string) {
    const s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 60) return '•';
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    if (s < 86400) return `${Math.floor(s / 3600)}h`;
    if (s < 7 * 86400) return `${Math.floor(s / 86400)}d`;
    return iso.slice(0, 10).replaceAll('-', '.');
}
