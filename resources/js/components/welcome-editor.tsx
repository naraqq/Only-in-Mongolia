import InputError from '@/components/input-error';
import { LibraryButton, PickedThumbs, type Picked } from '@/components/library-picker';
import PriceField from '@/components/price-field';
import { mnt, priceOk } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { useForm, usePage } from '@inertiajs/react';
import { HandHeart, LoaderCircle, Lock } from 'lucide-react';
import { useState, type FormEvent } from 'react';

export type WelcomeSettings = {
    enabled: boolean;
    body: string;
    price: number | null;
    items: Picked[];
    sent: number;
    unlocked: number;
    earned: number;
};

/** Studio → Promotions: the DM every new subscriber gets automatically (optionally with paid photos/videos). */
export default function WelcomeEditor({ welcome }: { welcome: WelcomeSettings }) {
    const { t } = useT();
    const { ppvLimits } = usePage<{ ppvLimits: { min: number; max: number } }>().props;
    const [picked, setPicked] = useState<Picked[]>(welcome.items);
    const [locked, setLocked] = useState(welcome.price !== null);
    const form = useForm({ enabled: welcome.enabled, body: welcome.body, price: welcome.price ?? 5000 });
    const priced = locked && picked.length > 0;
    const empty = !form.data.body.trim() && picked.length === 0;

    function save(e?: FormEvent, enabled = form.data.enabled) {
        e?.preventDefault();
        form.transform((d) => ({ ...d, enabled, vault: picked.map((p) => p.id), price: priced ? d.price : null }));
        form.put(route('studio.welcome'), { preserveScroll: true });
    }

    return (
        <section className="bg-card rounded-2xl p-5 shadow-xs">
            <div className="flex items-start gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-sky-500/15 text-sky-600 dark:text-sky-400">
                    <HandHeart className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                    <h2 className="font-bold">{t('wel.title')}</h2>
                    <p className="text-muted-foreground text-sm">{t('wel.sub')}</p>
                </div>
                <button
                    type="button"
                    role="switch"
                    aria-checked={form.data.enabled}
                    aria-label={t('wel.title')}
                    disabled={form.processing || (!form.data.enabled && empty)}
                    onClick={() => {
                        form.setData('enabled', !form.data.enabled);
                        save(undefined, !form.data.enabled);
                    }}
                    className={`relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-50 ${form.data.enabled ? 'bg-primary' : 'bg-muted-foreground/30'}`}
                >
                    <span className={`bg-background absolute top-1 left-1 size-5 rounded-full shadow transition-transform ${form.data.enabled ? 'translate-x-5' : ''}`} />
                </button>
            </div>

            <form onSubmit={save} className="mt-4">
                <textarea
                    value={form.data.body}
                    onChange={(e) => form.setData('body', e.target.value)}
                    rows={3}
                    maxLength={2000}
                    placeholder={t('wel.placeholder')}
                    className="placeholder:text-muted-foreground bg-muted focus:ring-primary/25 w-full resize-none rounded-xl px-3.5 py-2.5 text-[15px] outline-none focus:ring-2"
                />
                <InputError message={form.errors.body} />
                <PickedThumbs picked={picked} onRemove={(id) => setPicked((p) => p.filter((x) => x.id !== id))} className="mt-2" />
                {Object.entries(form.errors)
                    .filter(([k]) => k.startsWith('vault'))
                    .map(([k, v]) => (
                        <InputError key={k} message={v} />
                    ))}

                <div className="mt-3 flex flex-wrap items-center gap-2">
                    <LibraryButton
                        picked={picked}
                        onChange={setPicked}
                        max={10}
                        className="hover:bg-muted inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-violet-600 transition dark:text-violet-400"
                    />
                    {picked.length > 0 && (
                        <button
                            type="button"
                            onClick={() => setLocked(!locked)}
                            className={`inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold transition ${locked ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300' : 'bg-muted text-muted-foreground hover:text-foreground'}`}
                        >
                            <Lock className="size-3.5" /> {t('ppv.lockMedia')}
                        </button>
                    )}
                    {priced && <PriceField value={form.data.price} onChange={(v) => form.setData('price', v)} />}
                    <button
                        type="submit"
                        disabled={form.processing || (form.data.enabled && empty) || (priced && !priceOk(form.data.price, ppvLimits))}
                        className="bg-primary text-primary-foreground ml-auto inline-flex h-9 items-center gap-2 rounded-full px-4 text-sm font-bold transition hover:brightness-110 disabled:opacity-40"
                    >
                        {form.processing && <LoaderCircle className="size-4 animate-spin" />}
                        {t('pe.save')}
                    </button>
                </div>
            </form>

            {welcome.sent > 0 && (
                <dl className="bg-muted/60 mt-4 grid grid-cols-3 gap-2 rounded-xl p-3 text-center">
                    <Stat label={t('wel.sent')} value={String(welcome.sent)} />
                    <Stat label={t('wel.unlocked')} value={String(welcome.unlocked)} />
                    <Stat label={t('wel.earned')} value={mnt(welcome.earned)} />
                </dl>
            )}
        </section>
    );
}

function Stat({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <dt className="text-muted-foreground text-xs">{label}</dt>
            <dd className="font-bold tabular-nums">{value}</dd>
        </div>
    );
}
