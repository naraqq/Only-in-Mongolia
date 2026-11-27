import { sendJson } from '@/lib/http';
import { useT } from '@/lib/i18n';
import { ArrowUpRight, Megaphone } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

type Ad = { id: number; advertiser: string; title: string; body: string | null; image: string; href: string; domain: string };

/** Views are counted once a banner has been at least half on screen for a second (and once per visitor per day, on the server). */
const SEEN_MS = 1000;

/**
 * Sponsored banners from other companies, in the right-hand column. Always labelled as sponsored; clicks go through
 * the app (counted) and open the advertiser's site in a new tab. On 18+ creators' pages only campaigns that
 * opted in are shown.
 */
export default function Sponsored({ adult = false }: { adult?: boolean }) {
    const { t } = useT();
    const [ads, setAds] = useState<Ad[]>([]);
    const [contact, setContact] = useState<string | null>(null);

    useEffect(() => {
        let alive = true;
        sendJson<{ ads: Ad[]; contact: string | null }>('GET', route('ads.slot', adult ? { adult: 1 } : {}))
            .then((r) => {
                if (!alive) return;
                setAds(r.ads);
                setContact(r.contact);
            })
            .catch(() => {});
        return () => {
            alive = false;
        };
    }, [adult]);

    if (!ads.length && !contact) return null;

    return (
        <section aria-label={t('ads.sponsored')} className="flex flex-col gap-3">
            {ads.map((ad) => (
                <Banner key={ad.id} ad={ad} />
            ))}
            {contact && (
                <a
                    href={`mailto:${contact}?subject=${encodeURIComponent(t('ads.mailSubject'))}`}
                    className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 self-start text-xs font-semibold transition"
                >
                    <Megaphone className="size-3.5" /> {t('ads.advertise')}
                </a>
            )}
        </section>
    );
}

function Banner({ ad }: { ad: Ad }) {
    const { t } = useT();
    const box = useRef<HTMLAnchorElement>(null);

    // Count the view once it has really been seen.
    useEffect(() => {
        const el = box.current;
        if (!el || !('IntersectionObserver' in window)) return;
        let timer: ReturnType<typeof setTimeout> | null = null;
        const io = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    timer ??= setTimeout(() => {
                        void sendJson('POST', route('ads.views'), { ids: [ad.id] }).catch(() => {});
                        io.disconnect();
                    }, SEEN_MS);
                } else if (timer) {
                    clearTimeout(timer);
                    timer = null;
                }
            },
            { threshold: 0.5 },
        );
        io.observe(el);
        return () => {
            io.disconnect();
            if (timer) clearTimeout(timer);
        };
    }, [ad.id]);

    return (
        <a
            ref={box}
            href={ad.href}
            target="_blank"
            rel="sponsored noopener noreferrer"
            className="group bg-card border-border/60 hover:border-border block overflow-hidden rounded-2xl border shadow-xs transition"
        >
            <div className="relative aspect-[6/5] overflow-hidden bg-zinc-200 dark:bg-zinc-800">
                <img src={ad.image} alt="" loading="lazy" className="size-full object-cover transition duration-500 group-hover:scale-[1.03]" />
                <span className="absolute top-2 left-2 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-white uppercase backdrop-blur-sm">
                    {t('ads.sponsored')}
                </span>
            </div>
            <div className="flex items-start gap-2 p-3">
                <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm leading-snug font-bold">{ad.title}</p>
                    {ad.body && <p className="text-muted-foreground mt-0.5 line-clamp-2 text-xs">{ad.body}</p>}
                    <p className="text-muted-foreground mt-1 truncate text-[11px]">
                        {ad.advertiser} · {ad.domain}
                    </p>
                </div>
                <ArrowUpRight className="text-muted-foreground group-hover:text-foreground mt-0.5 size-4 shrink-0 transition" />
            </div>
        </a>
    );
}
