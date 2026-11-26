import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import UserAvatar from '@/components/user-avatar';
import SocialLayout from '@/layouts/social-layout';
import StudioLayout from '@/layouts/studio-layout';
import { coverBg } from '@/lib/format';
import { useT, type TKey } from '@/lib/i18n';
import { toast } from '@/lib/toast';
import { type SharedData } from '@/types';
import { Link, router, useForm, usePage } from '@inertiajs/react';
import {
    ArrowLeft,
    Bookmark,
    Camera,
    ChevronRight,
    Clock,
    CreditCard,
    ExternalLink,
    ImagePlus,
    LoaderCircle,
    Pencil,
    Sparkles,
    Trash2,
    Users,
    XCircle,
} from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';

type Policy = 'everyone' | 'followers' | 'subscribers';
type Creator = {
    handle: string;
    display_name: string;
    bio: string | null;
    price_monthly: number;
    dm_policy: Policy;
    cover_url: string | null;
    bundles: Record<string, number>;
};

const POLICIES: { value: Policy; label: TKey }[] = [
    { value: 'everyone', label: 'pe.dmEveryone' },
    { value: 'followers', label: 'pe.dmFollowers' },
    { value: 'subscribers', label: 'pe.dmSubscribers' },
];

/**
 * My profile: cover, photo, name and what I follow, save and subscribe to.
 * "Edit profile" turns the same page into the form: photo, cover and name for everyone; display name, bio, price and message settings for creators.
 */
export default function EditProfile({
    area = 'social',
    editing: startEditing,
    profile,
    stats,
    creator,
    limits,
}: {
    /** Opened from the studio: always the form, in the studio layout. */
    area?: 'social' | 'studio';
    editing: boolean;
    profile: { name: string; avatar_url: string | null; cover_url: string | null; joined: string };
    stats: { following: number; subscriptions: number; saved: number };
    creator: Creator | null;
    limits: { min_price: number; max_price: number; max_discount: number };
}) {
    const { t } = useT();
    const { errors: pageErrors } = usePage<{ errors: Record<string, string> }>().props;
    const form = useForm({
        name: profile.name,
        display_name: creator?.display_name ?? '',
        bio: creator?.bio ?? '',
        price_monthly: creator?.price_monthly ?? 0,
        dm_policy: (creator?.dm_policy ?? 'followers') as Policy,
        bundles: (creator?.bundles ?? {}) as Record<string, number>,
    });
    const studio = area === 'studio';
    const [editing, setEditingState] = useState(startEditing);

    // Keep ?edit in the address so a refresh stays where you were. (The studio is always the form.)
    function setEditing(on: boolean) {
        if (studio) return;
        setEditingState(on);
        window.history.replaceState(window.history.state, '', route('me.edit', on ? { edit: 1 } : {}));
        window.scrollTo({ top: 0 });
    }

    function cancel() {
        form.clearErrors();
        form.reset();
        setEditing(false);
    }

    function submit(e: FormEvent) {
        e.preventDefault();
        form.patch(route('me.update'), {
            preserveScroll: true,
            onSuccess: () => {
                form.setDefaults();
                if (studio) toast(t('pe.saved'), { tone: 'success' });
                else setEditing(false);
            },
        });
    }

    const seed = creator?.handle ?? profile.name;
    const cover = creator ? creator.cover_url : profile.cover_url;
    const field = 'focus:ring-primary/25 bg-muted w-full rounded-2xl px-4 text-[15px] outline-none transition focus:ring-2';

    const title = t(editing ? 'nav.editProfile' : 'nav.myProfile');
    const joined = new Date(profile.joined);
    const stat = 'hover:bg-muted/60 flex flex-col items-center gap-0.5 rounded-2xl py-3 transition bg-muted';

    return (
        <Shell
            studio={studio}
            title={title}
            header={
                <>
                    {editing && (
                        <button
                            type="button"
                            onClick={cancel}
                            className="hover:bg-muted -ml-2 grid size-9 place-items-center rounded-full"
                            aria-label={t('pe.cancel')}
                        >
                            <ArrowLeft className="size-5" />
                        </button>
                    )}
                    <h1 className="text-lg font-bold">{title}</h1>
                </>
            }
        >
            {/* Cover + photo */}
            <div className={`group relative h-36 overflow-hidden sm:h-44 ${coverBg(seed, !!cover)}`}>
                {cover && <img src={cover} alt="" className="size-full object-cover" />}
                {editing && <PhotoButtons kind="cover" has={!!cover} className="absolute inset-0 grid place-items-center bg-black/25" />}
            </div>
            <div className="relative z-10 -mt-12 flex items-end justify-between gap-3 px-4">
                <div className="relative w-fit">
                    <UserAvatar
                        name={profile.name}
                        src={profile.avatar_url}
                        seed={seed}
                        className="ring-background size-24 text-4xl shadow-lg ring-4"
                    />
                    {editing && (
                        <PhotoButtons
                            kind="avatar"
                            has={!!profile.avatar_url}
                            className="absolute inset-0 grid place-items-center rounded-full bg-black/30"
                        />
                    )}
                </div>
                {!editing && (
                    <div className="flex gap-2 pb-1">
                        {creator && (
                            <Button asChild variant="outline" className="rounded-full">
                                <Link href={route('creator.show', creator.handle)}>
                                    <ExternalLink className="size-4" /> {t('pr.viewPage')}
                                </Link>
                            </Button>
                        )}
                        <Button variant="outline" className="rounded-full" onClick={() => setEditing(true)}>
                            <Pencil className="size-4" /> {t('nav.editProfile')}
                        </Button>
                    </div>
                )}
            </div>
            {editing && <InputError message={pageErrors.photo} className="mt-2 px-4" />}

            {!editing ? (
                <div className="flex flex-col gap-5 p-4">
                    <div>
                        <h2 className="text-xl font-extrabold">{creator?.display_name || profile.name}</h2>
                        {creator && <p className="text-muted-foreground text-[15px]">@{creator.handle}</p>}
                        {creator?.bio && <p className="mt-2 text-[15px] leading-snug whitespace-pre-line">{creator.bio}</p>}
                        <p className="text-muted-foreground mt-2 text-sm">
                            {t('pr.joined', { date: `${joined.getFullYear()}.${String(joined.getMonth() + 1).padStart(2, '0')}` })}
                        </p>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                        <Link href={route('dashboard')} className={stat}>
                            <Users className="text-muted-foreground size-5" />
                            <span className="text-lg font-bold tabular-nums">{stats.following}</span>
                            <span className="text-muted-foreground text-xs">{t('fan.followingTitle')}</span>
                        </Link>
                        <Link href={route('dashboard')} className={stat}>
                            <CreditCard className="text-muted-foreground size-5" />
                            <span className="text-lg font-bold tabular-nums">{stats.subscriptions}</span>
                            <span className="text-muted-foreground text-xs">{t('pr.subscriptions')}</span>
                        </Link>
                        <Link href={route('saved')} className={stat}>
                            <Bookmark className="text-muted-foreground size-5" />
                            <span className="text-lg font-bold tabular-nums">{stats.saved}</span>
                            <span className="text-muted-foreground text-xs">{t('nav.saved')}</span>
                        </Link>
                    </div>
                    {!creator && <CreatorCard />}
                </div>
            ) : (
                <form onSubmit={submit} className="flex flex-col gap-5 p-4">
                    <Field label={t('ph.name')} hint={creator ? t('pe.nameHint') : undefined} error={form.errors.name}>
                        <input
                            className={`${field} h-12`}
                            value={form.data.name}
                            maxLength={60}
                            onChange={(e) => form.setData('name', e.target.value)}
                        />
                    </Field>

                    {creator && (
                        <>
                            <Field label={t('pe.displayName')} error={form.errors.display_name}>
                                <input
                                    className={`${field} h-12`}
                                    value={form.data.display_name}
                                    maxLength={60}
                                    onChange={(e) => form.setData('display_name', e.target.value)}
                                />
                            </Field>
                            <Field label={t('pe.bio')} hint={`${form.data.bio.length}/500`} error={form.errors.bio}>
                                <textarea
                                    className={`${field} resize-none py-3`}
                                    rows={4}
                                    maxLength={500}
                                    value={form.data.bio}
                                    onChange={(e) => form.setData('bio', e.target.value)}
                                />
                            </Field>
                            <Field
                                label={t('pe.price')}
                                hint={t('pe.priceHint', {
                                    min: `₮${limits.min_price.toLocaleString('en-US')}`,
                                    max: `₮${limits.max_price.toLocaleString('en-US')}`,
                                })}
                                error={form.errors.price_monthly}
                            >
                                <div className="relative">
                                    <span className="text-muted-foreground absolute top-1/2 left-4 -translate-y-1/2 font-semibold">₮</span>
                                    <input
                                        className={`${field} h-12 pl-9 font-semibold tabular-nums`}
                                        inputMode="numeric"
                                        value={form.data.price_monthly ? form.data.price_monthly.toLocaleString('en-US') : ''}
                                        onChange={(e) => form.setData('price_monthly', Number(e.target.value.replace(/\D/g, '').slice(0, 7)))}
                                    />
                                </div>
                            </Field>
                            <Field label={t('pe.bundles')} hint={t('pe.bundlesHint', { max: limits.max_discount })}>
                                <div className="grid grid-cols-3 gap-2">
                                    {Object.keys(form.data.bundles).map((m) => {
                                        const pct = form.data.bundles[m] ?? 0;
                                        const total = Math.floor((form.data.price_monthly * Number(m) * (100 - pct)) / 10000) * 100;
                                        return (
                                            <div key={m} className={`rounded-2xl p-3 ${pct > 0 ? 'bg-primary/10' : 'bg-muted'}`}>
                                                <p className="text-sm font-bold">{t('cp.months', { n: Number(m) })}</p>
                                                <div className="mt-1.5 flex items-center gap-1">
                                                    <span className="text-muted-foreground text-sm">−</span>
                                                    <input
                                                        inputMode="numeric"
                                                        value={pct || ''}
                                                        placeholder="0"
                                                        onChange={(e) =>
                                                            form.setData('bundles', {
                                                                ...form.data.bundles,
                                                                [m]: Math.min(
                                                                    limits.max_discount,
                                                                    Number(e.target.value.replace(/\D/g, '').slice(0, 2)) || 0,
                                                                ),
                                                            })
                                                        }
                                                        className="bg-card h-9 w-14 rounded-lg px-2 text-center font-semibold tabular-nums outline-none"
                                                        aria-label={t('cp.months', { n: Number(m) })}
                                                    />
                                                    <span className="text-muted-foreground text-sm">%</span>
                                                </div>
                                                <p className="text-muted-foreground mt-1.5 text-xs">
                                                    {pct > 0
                                                        ? t('pe.bundleTotal', { price: `₮${total.toLocaleString('en-US')}` })
                                                        : t('pe.bundleOff')}
                                                </p>
                                            </div>
                                        );
                                    })}
                                </div>
                            </Field>
                            <Field label={t('pe.dmPolicy')} error={form.errors.dm_policy}>
                                <div className="bg-muted grid grid-cols-3 gap-1 rounded-2xl p-1">
                                    {POLICIES.map((p) => (
                                        <button
                                            key={p.value}
                                            type="button"
                                            onClick={() => form.setData('dm_policy', p.value)}
                                            className={`rounded-xl px-2 py-2.5 text-sm font-semibold transition ${form.data.dm_policy === p.value ? 'bg-card shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                                        >
                                            {t(p.label)}
                                        </button>
                                    ))}
                                </div>
                            </Field>
                        </>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                        <Button type="button" variant="outline" onClick={cancel} className="h-12 rounded-2xl font-bold">
                            {t('pe.cancel')}
                        </Button>
                        <Button
                            type="submit"
                            disabled={form.processing || !form.isDirty}
                            className="bg-primary shadow-primary/25 h-12 rounded-2xl font-bold shadow-lg hover:brightness-110 disabled:opacity-40 disabled:shadow-none"
                        >
                            {form.processing && <LoaderCircle className="size-5 animate-spin" />}
                            {t('pe.save')}
                        </Button>
                    </div>
                </form>
            )}
        </Shell>
    );
}

/** For people who aren't creators yet: an invitation, or where their application stands. */
function CreatorCard() {
    const { t } = useT();
    const status = usePage<SharedData>().props.auth.creator?.status;

    if (status === 'pending' || status === 'rejected') {
        const pending = status === 'pending';
        return (
            <Link
                href={route('creator.apply')}
                className={`flex items-center gap-3 rounded-2xl p-4 transition hover:brightness-95 ${
                    pending
                        ? 'bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200'
                        : 'bg-rose-100 text-rose-900 dark:bg-rose-950/50 dark:text-rose-200'
                }`}
            >
                {pending ? <Clock className="size-6 shrink-0" /> : <XCircle className="size-6 shrink-0" />}
                <span className="min-w-0 flex-1">
                    <span className="block font-bold">{t(pending ? 'pr.pendingT' : 'pr.rejectedT')}</span>
                    <span className="block text-sm opacity-80">{t(pending ? 'pr.pendingD' : 'pr.rejectedD')}</span>
                </span>
                <ChevronRight className="size-5 shrink-0 opacity-70" />
            </Link>
        );
    }

    return (
        <Link
            href={route('creator.apply')}
            className="bg-primary shadow-primary/20 group text-primary-foreground relative flex items-center gap-4 overflow-hidden rounded-2xl p-5 shadow-lg transition hover:brightness-110"
        >
            <Sparkles className="absolute -right-3 -bottom-4 size-24 opacity-15" aria-hidden />
            <span className="bg-primary-foreground/15 grid size-12 shrink-0 place-items-center rounded-2xl">
                <Sparkles className="size-6" />
            </span>
            <span className="relative min-w-0 flex-1">
                <span className="block text-lg font-extrabold">{t('pr.creatorT')}</span>
                <span className="text-primary-foreground/80 block text-sm">{t('pr.creatorD')}</span>
            </span>
            <span className="bg-primary-foreground text-primary relative inline-flex shrink-0 items-center gap-1 rounded-full px-4 py-2 text-sm font-bold transition group-hover:gap-2">
                {t('pr.creatorCta')} <ChevronRight className="size-4" />
            </span>
        </Link>
    );
}

/** The social layout with its header, or (from the studio) the studio layout with the form in a card. */
function Shell({ studio, title, header, children }: { studio: boolean; title: string; header: React.ReactNode; children: React.ReactNode }) {
    const { t } = useT();
    return studio ? (
        <StudioLayout title={title} subtitle={t('stu.profileSub')}>
            <div className="bg-card mx-auto max-w-2xl overflow-hidden rounded-2xl shadow-xs">{children}</div>
        </StudioLayout>
    ) : (
        <SocialLayout title={title} header={header}>
            {children}
        </SocialLayout>
    );
}

function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: React.ReactNode }) {
    return (
        <label className="block">
            <span className="mb-1.5 flex items-baseline justify-between text-sm font-semibold">
                {label}
                {hint && <span className="text-muted-foreground text-xs font-normal">{hint}</span>}
            </span>
            {children}
            <InputError message={error} className="mt-1.5" />
        </label>
    );
}

/** Upload / remove overlay for the avatar or cover. Uploads as soon as a file is picked. */
function PhotoButtons({ kind, has, className }: { kind: 'avatar' | 'cover'; has: boolean; className: string }) {
    const { t } = useT();
    const input = useRef<HTMLInputElement>(null);
    const [busy, setBusy] = useState(false);
    const opts = { preserveScroll: true, onStart: () => setBusy(true), onFinish: () => setBusy(false) };

    return (
        <div className={`${className} opacity-90 transition hover:opacity-100`}>
            <div className="flex items-center gap-2">
                <button
                    type="button"
                    onClick={() => input.current?.click()}
                    className="grid size-10 place-items-center rounded-full bg-black/50 text-white backdrop-blur transition hover:bg-black/70"
                    aria-label={t(kind === 'avatar' ? 'pe.changePhoto' : 'pe.changeCover')}
                    title={t(kind === 'avatar' ? 'pe.changePhoto' : 'pe.changeCover')}
                >
                    {busy ? (
                        <LoaderCircle className="size-5 animate-spin" />
                    ) : kind === 'avatar' ? (
                        <Camera className="size-5" />
                    ) : (
                        <ImagePlus className="size-5" />
                    )}
                </button>
                {has && !busy && (
                    <button
                        type="button"
                        onClick={() => router.delete(route('me.photo.destroy', kind), opts)}
                        className="grid size-10 place-items-center rounded-full bg-black/50 text-white backdrop-blur transition hover:bg-black/70"
                        aria-label={t('pe.remove')}
                        title={t('pe.remove')}
                    >
                        <Trash2 className="size-4" />
                    </button>
                )}
            </div>
            <input
                ref={input}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) router.post(route('me.photo', kind), { photo: file }, { ...opts, forceFormData: true });
                    e.target.value = '';
                }}
            />
        </div>
    );
}
