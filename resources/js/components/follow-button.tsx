import { Button } from '@/components/ui/button';
import { useT } from '@/lib/i18n';
import { type SharedData } from '@/types';
import { Link, router, usePage } from '@inertiajs/react';
import { Check, Plus } from 'lucide-react';
import { useState } from 'react';

/** Free follow toggle. Optimistic; visitors are sent to log in. */
export default function FollowButton({
    handle,
    initial,
    size = 'default',
    starter = false,
}: {
    handle: string;
    initial: boolean;
    size?: 'default' | 'sm';
    starter?: boolean;
}) {
    const { t } = useT();
    const { auth } = usePage<SharedData>().props;
    const [following, setFollowing] = useState(initial);
    const [busy, setBusy] = useState(false);

    if (!auth.user) {
        return (
            <Button asChild size={size} variant="outline">
                <Link href={route('login')}>
                    <Plus className="size-4" /> {t('fan.follow')}
                </Link>
            </Button>
        );
    }

    function toggle() {
        const next = !following;
        setFollowing(next);
        setBusy(true);
        const opts = { preserveScroll: true, preserveState: true, onError: () => setFollowing(!next), onFinish: () => setBusy(false) };
        const params = { handle, ...(starter ? { _query: { view: 'starter' } } : {}) };
        if (next) router.post(route('creator.follow', params), {}, opts);
        else router.delete(route('creator.unfollow', params), opts);
    }

    return (
        <Button type="button" size={size} variant={following ? 'outline' : 'default'} onClick={toggle} disabled={busy}>
            {following ? <Check className="size-4" /> : <Plus className="size-4" />}
            {following ? t('fan.following') : t('fan.follow')}
        </Button>
    );
}
