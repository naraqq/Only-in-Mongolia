import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { useT } from '@/lib/i18n';
import { useForm, usePage } from '@inertiajs/react';
import { ImagePlus, LoaderCircle, Megaphone, X } from 'lucide-react';
import { useRef, type FormEvent } from 'react';

/** Studio: one message to every subscriber (or follower), delivered into each fan's own conversation. */
export default function MassMessage({ subscribers, followers }: { subscribers: number; followers: number }) {
    const { t } = useT();
    const flash = usePage<{ flash?: { status?: string } }>().props.flash;
    const form = useForm({ body: '', audience: 'subscribers' as 'subscribers' | 'followers', media: [] as File[] });
    const files = useRef<HTMLInputElement>(null);
    const count = form.data.audience === 'subscribers' ? subscribers : followers;
    const sent = typeof flash?.status === 'string' && flash.status.startsWith('mass-sent:') ? Number(flash.status.split(':')[1]) : null;

    function submit(e: FormEvent) {
        e.preventDefault();
        form.post(route('studio.mass'), { forceFormData: true, preserveScroll: true, onSuccess: () => form.reset('body', 'media') });
    }

    return (
        <form onSubmit={submit} className="mt-6 rounded-2xl border p-4">
            <div className="flex items-center gap-2 font-bold">
                <Megaphone className="text-primary size-5" /> {t('mm.title')}
            </div>
            <div className="bg-muted mt-3 grid grid-cols-2 gap-1 rounded-xl p-1 text-sm">
                {(['subscribers', 'followers'] as const).map((a) => (
                    <button
                        key={a}
                        type="button"
                        onClick={() => form.setData('audience', a)}
                        className={`rounded-lg py-2 font-semibold transition ${form.data.audience === a ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}
                    >
                        {t(a === 'subscribers' ? 'pe.dmSubscribers' : 'pe.dmFollowers')} ({a === 'subscribers' ? subscribers : followers})
                    </button>
                ))}
            </div>
            <textarea
                value={form.data.body}
                onChange={(e) => form.setData('body', e.target.value)}
                rows={3}
                maxLength={2000}
                placeholder={t('mm.placeholder')}
                className="placeholder:text-muted-foreground mt-3 w-full resize-y bg-transparent text-[15px] outline-none"
            />
            {form.data.media.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-2">
                    {form.data.media.map((f, i) => (
                        <li key={i} className="bg-muted flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs">
                            <span className="max-w-32 truncate">{f.name}</span>
                            <button
                                type="button"
                                onClick={() =>
                                    form.setData(
                                        'media',
                                        form.data.media.filter((_, j) => j !== i),
                                    )
                                }
                            >
                                <X className="size-3.5" />
                            </button>
                        </li>
                    ))}
                </ul>
            )}
            <InputError message={form.errors.body} />
            <div className="mt-3 flex items-center gap-3 border-t pt-3">
                <button
                    type="button"
                    onClick={() => files.current?.click()}
                    className="hover:bg-muted inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm"
                >
                    <ImagePlus className="size-4" /> {t('st.addMedia')}
                </button>
                <input
                    ref={files}
                    type="file"
                    multiple
                    accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
                    className="hidden"
                    onChange={(e) => {
                        form.setData('media', [...form.data.media, ...Array.from(e.target.files ?? [])].slice(0, 10));
                        e.target.value = '';
                    }}
                />
                {sent !== null && !form.isDirty && <span className="text-sm font-semibold text-emerald-600">{t('mm.sent', { n: sent })}</span>}
                <Button
                    type="submit"
                    size="sm"
                    className="ml-auto rounded-full px-5"
                    disabled={form.processing || count === 0 || (!form.data.body.trim() && form.data.media.length === 0)}
                    onClick={(e) => !confirm(t('mm.confirm', { n: count })) && e.preventDefault()}
                >
                    {form.processing && <LoaderCircle className="size-4 animate-spin" />}
                    {t('mm.send', { n: count })}
                </Button>
            </div>
        </form>
    );
}
