import InputError from '@/components/input-error';
import { Thumb, type LibraryItem } from '@/components/library-picker';
import StudioLayout from '@/layouts/studio-layout';
import { ask } from '@/lib/confirm';
import { useT } from '@/lib/i18n';
import { toast } from '@/lib/toast';
import { Link, router, useForm, usePage } from '@inertiajs/react';
import { Images, LoaderCircle, Trash2, Upload } from 'lucide-react';
import { useEffect, useRef } from 'react';

/** Studio → Library: everything the creator uploaded, ready to reuse in posts and messages. */
export default function Library({
    items,
    type,
    counts,
}: {
    items: LibraryItem[];
    type: 'image' | 'video' | null;
    counts: { image: number; video: number };
}) {
    const { t } = useT();
    const form = useForm({ media: [] as File[] });
    const input = useRef<HTMLInputElement>(null);
    const errors = Object.entries(form.errors);
    const flash = usePage<{ flash?: { status?: string } }>().props.flash;
    useEffect(() => {
        if (flash?.status === 'library-added') toast(t('lib.added'), { tone: 'success' });
    }, [flash?.status, t]);

    function upload(files: File[]) {
        if (!files.length) return;
        form.transform(() => ({ media: files }));
        form.post(route('studio.library.store'), { forceFormData: true, preserveScroll: true });
    }

    async function remove(item: LibraryItem) {
        const message = item.uses > 0 ? t('lib.removeUsed', { n: item.uses }) : t('lib.removeConfirm');
        if (await ask({ message, confirm: t('po.delete'), cancel: t('dlg.cancel'), danger: true })) {
            router.delete(route('studio.library.destroy', item.id), { preserveScroll: true });
        }
    }

    const tabs: [typeof type, string][] = [
        [null, t('lib.all', { n: counts.image + counts.video })],
        ['image', t('lib.photos', { n: counts.image })],
        ['video', t('lib.videos', { n: counts.video })],
    ];

    return (
        <StudioLayout
            title={t('lib.title')}
            subtitle={t('lib.sub')}
            actions={
                <button
                    type="button"
                    onClick={() => input.current?.click()}
                    disabled={form.processing}
                    className="bg-primary text-primary-foreground inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-bold transition hover:brightness-110 disabled:opacity-60"
                >
                    {form.processing ? <LoaderCircle className="size-4 animate-spin" /> : <Upload className="size-4" />}
                    {t('lib.upload')}
                </button>
            }
        >
            <input
                ref={input}
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
                className="hidden"
                onChange={(e) => {
                    upload(Array.from(e.target.files ?? []).slice(0, 20));
                    e.target.value = '';
                }}
            />
            <div className="mx-auto flex max-w-5xl flex-col gap-4">
                <div className="bg-muted inline-flex w-fit gap-1 rounded-full p-1">
                    {tabs.map(([value, label]) => (
                        <Link
                            key={value ?? 'all'}
                            href={route('studio.library', value ? { type: value } : {})}
                            preserveScroll
                            className={`h-8 rounded-full px-3.5 text-sm leading-8 font-semibold transition ${type === value ? 'bg-card shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                            {label}
                        </Link>
                    ))}
                </div>

                {form.progress && (
                    <div className="bg-muted h-1 overflow-hidden rounded-full">
                        <div className="bg-primary h-full transition-[width]" style={{ width: `${form.progress.percentage ?? 0}%` }} />
                    </div>
                )}
                {errors.map(([k, v]) => (
                    <InputError key={k} message={v} />
                ))}

                {items.length === 0 ? (
                    <div className="bg-card text-muted-foreground flex flex-col items-center gap-3 rounded-2xl p-12 text-center text-sm shadow-xs">
                        <span className="bg-muted grid size-14 place-items-center rounded-full">
                            <Images className="size-6" />
                        </span>
                        {t('lib.empty')}
                    </div>
                ) : (
                    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                        {items.map((item) => (
                            <li key={item.id} className="group bg-card relative overflow-hidden rounded-2xl shadow-xs">
                                <Thumb item={item} className="aspect-square" />
                                <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
                                    <span className="text-muted-foreground truncate">
                                        {item.uses > 0 ? t('lib.usedIn', { n: item.uses }) : t('lib.unused')}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => remove(item)}
                                        className="text-muted-foreground grid size-7 shrink-0 place-items-center rounded-full transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                                        aria-label={t('po.delete')}
                                    >
                                        <Trash2 className="size-4" />
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </StudioLayout>
    );
}
