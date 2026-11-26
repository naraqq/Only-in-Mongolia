import { useT } from '@/lib/i18n';
import { Play, X } from 'lucide-react';
import { useEffect, useMemo } from 'react';

/** Previews of picked photos and videos, each with a remove button. */
export default function MediaThumbs({ files, onRemove, className = '' }: { files: File[]; onRemove: (i: number) => void; className?: string }) {
    const { t } = useT();
    const urls = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
    useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);

    if (files.length === 0) return null;

    return (
        <ul className={`flex flex-wrap gap-2 ${className}`}>
            {files.map((f, i) => (
                <li key={urls[i]} className="bg-muted relative size-24 overflow-hidden rounded-xl">
                    {f.type.startsWith('video/') ? (
                        <>
                            <video src={urls[i]} muted playsInline preload="metadata" className="size-full object-cover" />
                            <span className="absolute inset-0 grid place-items-center">
                                <span className="grid size-8 place-items-center rounded-full bg-black/55 text-white">
                                    <Play className="size-4 fill-current" />
                                </span>
                            </span>
                        </>
                    ) : (
                        <img src={urls[i]} alt="" className="size-full object-cover" />
                    )}
                    <button
                        type="button"
                        onClick={() => onRemove(i)}
                        className="absolute top-1 right-1 grid size-6 place-items-center rounded-full bg-black/60 text-white transition hover:bg-black/80"
                        aria-label={t('po.delete')}
                    >
                        <X className="size-3.5" />
                    </button>
                </li>
            ))}
        </ul>
    );
}
