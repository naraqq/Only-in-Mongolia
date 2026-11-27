import { sendJson } from '@/lib/http';
import { useT } from '@/lib/i18n';
import { ArrowUpRight, Megaphone, Volume2, VolumeX } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export type SponsoredAd = {
    id: number;
    advertiser: string;
    title: string;
    body: string | null;
    /** The picture, or a video banner's still. */
    image: string | null;
    /** A video banner: plays muted and loops while on screen. */
    video?: string | null;
    href: string;
    domain: string;
};
type Ad = SponsoredAd;

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
    const [advertise, setAdvertise] = useState<string | null>(null);

    useEffect(() => {
        let alive = true;
        sendJson<{ ads: Ad[]; advertise: string | null }>('GET', route('ads.slot', adult ? { adult: 1 } : {}))
            .then((r) => {
                if (!alive) return;
                setAds(r.ads);
                setAdvertise(r.advertise);
            })
            .catch(() => {});
        return () => {
            alive = false;
        };
    }, [adult]);

    if (!ads.length && !advertise) return null;

    return (
        <section aria-label={t('ads.sponsored')} className="flex flex-col gap-3">
            {ads.map((ad) => (
                <Banner key={ad.id} ad={ad} />
            ))}
            {advertise && (
                <a
                    href={advertise}
                    className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 self-start text-xs font-semibold transition"
                >
                    <Megaphone className="size-3.5" /> {t('ads.advertise')}
                </a>
            )}
        </section>
    );
}

export function Banner({ ad, preview = false }: { ad: Ad; preview?: boolean }) {
    const { t } = useT();
    const box = useRef<HTMLAnchorElement>(null);

    // Count the view once it has really been seen.
    useEffect(() => {
        const el = box.current;
        if (preview || !el || !('IntersectionObserver' in window)) return;
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
    }, [ad.id, preview]);

    return (
        <a
            ref={box}
            href={ad.href}
            onClick={preview ? (e) => e.preventDefault() : undefined}
            target="_blank"
            rel="sponsored noopener noreferrer"
            className="group bg-card border-border/60 hover:border-border block overflow-hidden rounded-2xl border shadow-xs transition"
        >
            <div className="relative aspect-[6/5] overflow-hidden bg-zinc-200 dark:bg-zinc-800">
                {ad.video ? (
                    <BannerVideo src={ad.video} poster={ad.image} />
                ) : (
                    ad.image && (
                        <img
                            src={ad.image}
                            alt=""
                            loading="lazy"
                            className="size-full object-cover transition duration-500 group-hover:scale-[1.03]"
                        />
                    )
                )}
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

/**
 * A video banner: muted, looping, and only playing while at least half on screen (and not at all for people who
 * asked for less motion: they see the still). The sound button stays inside the banner without following its link.
 */
function BannerVideo({ src, poster }: { src: string; poster: string | null }) {
    const { t } = useT();
    const video = useRef<HTMLVideoElement>(null);
    const [sound, setSound] = useState(false);

    useEffect(() => {
        const v = video.current;
        if (!v || !('IntersectionObserver' in window)) return;
        const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        const io = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting && !still) void v.play().catch(() => {});
                else v.pause();
            },
            { threshold: 0.5 },
        );
        io.observe(v);
        return () => io.disconnect();
    }, [src]);

    return (
        <>
            <video
                ref={video}
                src={src}
                poster={poster ?? undefined}
                muted={!sound}
                loop
                playsInline
                preload="metadata"
                disablePictureInPicture
                className="size-full bg-black object-cover"
            />
            <button
                type="button"
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setSound((s) => !s);
                    void video.current?.play().catch(() => {});
                }}
                className="absolute right-2 bottom-2 grid size-8 place-items-center rounded-full bg-black/60 text-white backdrop-blur-sm transition hover:bg-black/80"
                aria-label={t(sound ? 'vp.mute' : 'vp.unmute')}
                aria-pressed={sound}
            >
                {sound ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
            </button>
        </>
    );
}
