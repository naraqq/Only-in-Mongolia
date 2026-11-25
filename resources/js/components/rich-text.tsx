import { useT } from '@/lib/i18n';
import { Link } from '@inertiajs/react';
import { useState, type ReactNode } from 'react';

const TOKENS = /(https?:\/\/[^\s<]+[^\s<.,:;!?)"'»]|#[\p{L}\p{N}_]+|@[A-Za-z0-9_.]{3,30}[A-Za-z0-9_])/gu;

/** Post text: links, #tags and @mentions stand out; long text is folded behind "Show more". */
export default function RichText({ text, className = '' }: { text: string; className?: string }) {
    const { t } = useT();
    const long = text.length > 320 || text.split('\n').length > 7;
    const [open, setOpen] = useState(false);

    const parts: ReactNode[] = text.split(TOKENS).map((part, i) => {
        if (i % 2 === 0) return part;
        if (part.startsWith('http')) {
            return (
                <a key={i} href={part} target="_blank" rel="noopener noreferrer nofollow ugc" className="text-primary break-all hover:underline">
                    {part.replace(/^https?:\/\/(www\.)?/, '')}
                </a>
            );
        }
        if (part.startsWith('@')) {
            return (
                <Link key={i} href={route('creator.show', part.slice(1))} className="text-primary font-medium hover:underline">
                    {part}
                </Link>
            );
        }
        return (
            <span key={i} className="text-primary font-medium">
                {part}
            </span>
        );
    });

    return (
        <div className={className}>
            <p className={`text-[15px] leading-relaxed break-words whitespace-pre-line ${long && !open ? 'line-clamp-6' : ''}`}>{parts}</p>
            {long && !open && (
                <button
                    type="button"
                    onClick={() => setOpen(true)}
                    className="text-muted-foreground hover:text-foreground mt-1 text-sm font-semibold"
                >
                    {t('po.showMore')}
                </button>
            )}
        </div>
    );
}
