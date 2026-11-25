import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import UserAvatar from '@/components/user-avatar';
import SocialLayout from '@/layouts/social-layout';
import { avatarGradient } from '@/lib/format';
import { useT, type TKey } from '@/lib/i18n';
import { Link, router, useForm, usePage } from '@inertiajs/react';
import { ArrowLeft, Camera, Check, ImagePlus, LoaderCircle, Trash2 } from 'lucide-react';
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

/** Edit profile: photo, cover and name for everyone; display name, bio, price and message settings for creators. */
export default function EditProfile({
    profile,
    creator,
    limits,
}: {
    profile: { name: string; avatar_url: string | null; cover_url: string | null };
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
    const [saved, setSaved] = useState(false);

    function submit(e: FormEvent) {
        e.preventDefault();
        form.patch(route('me.update'), {
            preserveScroll: true,
            onSuccess: () => {
                setSaved(true);
                setTimeout(() => setSaved(false), 2000);
            },
        });
    }

    const seed = creator?.handle ?? profile.name;
    const cover = creator ? creator.cover_url : profile.cover_url;
    const field =
        'border-input focus:border-primary focus:ring-primary/15 w-full rounded-2xl border bg-white px-4 text-[15px] shadow-sm outline-none transition focus:ring-4 dark:bg-zinc-900';

    return (
        <SocialLayout
            title={t('nav.editProfile')}
            header={
                <>
                    <Link
                        href={creator ? route('creator.show', creator.handle) : route('home')}
                        className="hover:bg-muted -ml-2 grid size-9 place-items-center rounded-full"
                    >
                        <ArrowLeft className="size-5" />
                    </Link>
                    <h1 className="text-lg font-bold">{t('nav.editProfile')}</h1>
                </>
            }
        >
            {/* Cover + photo */}
            <div className={`group relative h-36 overflow-hidden bg-gradient-to-br sm:h-44 ${avatarGradient(seed)}`}>
                {cover && <img src={cover} alt="" className="size-full object-cover" />}
                <PhotoButtons kind="cover" has={!!cover} className="absolute inset-0 grid place-items-center bg-black/25" />
            </div>
            <div className="relative z-10 -mt-12 px-4">
                <div className="relative w-fit">
                    <UserAvatar
                        name={profile.name}
                        src={profile.avatar_url}
                        seed={seed}
                        className="size-24 text-4xl shadow-lg ring-4 ring-white dark:ring-zinc-950"
                    />
                    <PhotoButtons
                        kind="avatar"
                        has={!!profile.avatar_url}
                        className="absolute inset-0 grid place-items-center rounded-full bg-black/30"
                    />
                </div>
                <InputError message={pageErrors.photo} className="mt-2" />
            </div>

            <form onSubmit={submit} className="flex flex-col gap-5 p-4">
                <Field label={t('ph.name')} hint={creator ? t('pe.nameHint') : undefined} error={form.errors.name}>
                    <input className={`${field} h-12`} value={form.data.name} maxLength={60} onChange={(e) => form.setData('name', e.target.value)} />
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
                                        <div key={m} className={`rounded-2xl border p-3 ${pct > 0 ? 'border-primary/50 bg-primary/5' : ''}`}>
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
                                                    className="border-input focus:border-primary h-9 w-14 rounded-lg border bg-transparent px-2 text-center font-semibold tabular-nums outline-none"
                                                    aria-label={t('cp.months', { n: Number(m) })}
                                                />
                                                <span className="text-muted-foreground text-sm">%</span>
                                            </div>
                                            <p className="text-muted-foreground mt-1.5 text-xs">
                                                {pct > 0 ? t('pe.bundleTotal', { price: `₮${total.toLocaleString('en-US')}` }) : t('pe.bundleOff')}
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
                                        className={`rounded-xl px-2 py-2.5 text-sm font-semibold transition ${form.data.dm_policy === p.value ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                                    >
                                        {t(p.label)}
                                    </button>
                                ))}
                            </div>
                        </Field>
                    </>
                )}

                <Button
                    type="submit"
                    disabled={form.processing || !form.isDirty}
                    className="from-primary shadow-primary/25 h-12 rounded-2xl bg-gradient-to-r to-rose-500 font-bold shadow-lg hover:brightness-110 disabled:opacity-40 disabled:shadow-none"
                >
                    {form.processing ? <LoaderCircle className="size-5 animate-spin" /> : saved ? <Check className="size-5" /> : null}
                    {saved ? t('pe.saved') : t('pe.save')}
                </Button>
            </form>
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
