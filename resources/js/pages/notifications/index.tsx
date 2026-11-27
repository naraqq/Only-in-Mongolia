import { PushNudge } from '@/components/push-settings';
import UserAvatar from '@/components/user-avatar';
import SocialLayout from '@/layouts/social-layout';
import { mnt } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { useLive } from '@/lib/live';
import { type SharedData } from '@/types';
import { router, usePage, useRemember } from '@inertiajs/react';
import {
    Banknote,
    Bell,
    CalendarClock,
    CheckCheck,
    Gift,
    HandCoins,
    ImagePlus,
    LockOpen,
    Megaphone,
    MessageCircle,
    MessageCircleQuestion,
    Radio,
    RefreshCw,
    Star,
    Undo2,
    UserPlus,
    Wallet as WalletIcon,
    type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';

type Kind =
    | 'followed'
    | 'subscribed'
    | 'tipped'
    | 'purchased'
    | 'new_post'
    | 'commented'
    | 'replied'
    | 'expiring'
    | 'auto_renewed'
    | 'trial_started'
    | 'renew_failed'
    | 'payout_paid'
    | 'payout_rejected'
    | 'refunded'
    | 'charge_refunded'
    | 'qa_live'
    | 'qa_answered'
    | 'ad_approved'
    | 'ad_rejected';
type Item = {
    id: string;
    kind: Kind;
    read: boolean;
    at: string;
    data: { amount?: number; renewed?: boolean; note?: string; expires_at?: string; reason?: string; wallet?: boolean; date?: string };
    actor: { name: string; handle: string | null; avatar_url: string | null } | null;
    url: string | null;
};

const ICONS: Record<Kind, [LucideIcon, string]> = {
    followed: [UserPlus, 'bg-sky-500'],
    payout_paid: [Banknote, 'bg-emerald-600'],
    payout_rejected: [Banknote, 'bg-red-600'],
    refunded: [Undo2, 'bg-amber-600'],
    charge_refunded: [Undo2, 'bg-amber-600'],
    subscribed: [Star, 'bg-primary text-primary-foreground!'],
    tipped: [HandCoins, 'bg-amber-500'],
    purchased: [LockOpen, 'bg-orange-500'],
    new_post: [ImagePlus, 'bg-violet-500'],
    commented: [MessageCircle, 'bg-sky-500'],
    replied: [MessageCircle, 'bg-sky-500'],
    expiring: [CalendarClock, 'bg-zinc-700'],
    auto_renewed: [RefreshCw, 'bg-emerald-500'],
    trial_started: [Gift, 'bg-emerald-500'],
    renew_failed: [WalletIcon, 'bg-amber-500'],
    qa_live: [Radio, 'bg-red-500'],
    qa_answered: [MessageCircleQuestion, 'bg-violet-500'],
    ad_approved: [Megaphone, 'bg-emerald-600'],
    ad_rejected: [Megaphone, 'bg-red-600'],
};

/** The bell: who followed, subscribed, tipped or bought, new posts, and subscriptions about to end. */
export default function Notifications({ notifications }: { notifications: Item[] }) {
    const { t } = useT();
    // Opened on this visit. Kept in the browser history, so Back shows them as read straight away.
    const [opened, setOpened] = useRemember<string[]>([], 'notifications:opened');
    const [busy, setBusy] = useState(false);
    // New notifications appear at the top as they happen.
    const me = usePage<SharedData>().props.auth.user?.id;
    useLive(me ? `user.${me}` : null, ['notification'], () => router.reload({ only: ['notifications'] }));
    const isRead = (n: Item) => n.read || opened.includes(n.id);
    const unread = notifications.filter((n) => !isRead(n)).length;

    function open(n: Item) {
        setOpened((ids) => [...ids, n.id]);
        router.post(route('notifications.open', n.id), {}, { preserveScroll: true });
    }

    function readAll() {
        router.post(route('notifications.read-all'), {}, { preserveScroll: true, onStart: () => setBusy(true), onFinish: () => setBusy(false) });
    }

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
            case 'replied':
                return t('nt.replied', { name });
            case 'commented':
                return t('nt.commented', { name });
            case 'new_post':
                return t('nt.newPost', { name });
            case 'qa_live':
                return t('nt.qaLive', { name });
            case 'qa_answered':
                return t('nt.qaAnswered', { name });
            case 'payout_paid':
                return t('nt.payoutPaid', { amount });
            case 'payout_rejected':
                return t('nt.payoutRejected', { amount });
            case 'refunded':
                return t('nt.refunded', { name, amount });
            case 'ad_approved':
                return t('nt.adApproved', { title: n.data.note ?? '', date: (n.data.date ?? '').replaceAll('-', '.') });
            case 'ad_rejected':
                return t(n.data.wallet ? 'nt.adRejectedWallet' : 'nt.adRejected', { title: n.data.note ?? '', reason: n.data.reason ?? '', amount });
            case 'charge_refunded':
                return t('nt.chargeRefunded', { name, amount });
            case 'trial_started':
                return t('nt.trialStarted', { name });
            case 'auto_renewed':
                return t('nt.autoRenewed', { name, amount });
            case 'renew_failed':
                return t('nt.renewFailed', { name, amount });
            case 'expiring':
                return t('nt.expiring', { name, date: (n.data.expires_at ?? '').slice(0, 10).replaceAll('-', '.') });
        }
    }

    return (
        <SocialLayout
            title={t('nav.notifications')}
            header={
                <>
                    <h1 className="text-lg font-bold tracking-wide uppercase">{t('nav.notifications')}</h1>
                    {unread > 0 && (
                        <button
                            type="button"
                            onClick={readAll}
                            disabled={busy}
                            className="text-primary hover:bg-primary/10 ml-auto inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-bold transition disabled:opacity-50"
                        >
                            <CheckCheck className="size-4" /> {t('nt.readAll')}
                        </button>
                    )}
                </>
            }
        >
            <PushNudge />
            {notifications.length === 0 ? (
                <div className="text-muted-foreground flex flex-col items-center gap-3 p-12 text-center text-sm">
                    <span className="bg-muted grid size-16 place-items-center rounded-full">
                        <Bell className="size-7" />
                    </span>
                    {t('nt.empty')}
                </div>
            ) : (
                <ul className="flex flex-col">
                    {notifications.map((n) => {
                        const [Icon, color] = ICONS[n.kind] ?? [Bell, 'bg-zinc-500'];
                        const read = isRead(n);
                        const body = (
                            <div className={`hover:bg-muted/60 flex gap-3 px-4 py-3.5 transition ${read ? '' : 'bg-primary/8'}`}>
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
                                    <span className={`block text-[15px] leading-snug ${read ? '' : 'font-semibold'}`}>{text(n)}</span>
                                    {n.data.note && (
                                        <span className="text-muted-foreground mt-0.5 block truncate text-sm italic">“{n.data.note}”</span>
                                    )}
                                    <span className={`mt-0.5 block text-xs ${read ? 'text-muted-foreground' : 'text-primary font-bold'}`}>
                                        {when(n.at)}
                                    </span>
                                </span>
                                {!read && <span className="bg-primary mt-2 size-2.5 shrink-0 rounded-full" role="img" aria-label={t('nt.new')} />}
                            </div>
                        );
                        return (
                            <li key={n.id}>
                                <button type="button" onClick={() => open(n)} className="block w-full text-left">
                                    {body}
                                </button>
                            </li>
                        );
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
