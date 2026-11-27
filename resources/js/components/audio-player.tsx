import { SeekBar } from '@/components/now-playing-bar';
import { useT } from '@/lib/i18n';
import { clock, play, seek, toggle, usePlayer } from '@/lib/player';
import { AudioLines, LoaderCircle, Pause, Play } from 'lucide-react';
import { useState } from 'react';

/**
 * An audio file in a post, a chat or the library: cover, title, creator and a play button. Playing hands the
 * track to the app's player (docked at the bottom, keeps playing across pages); while it's the one playing,
 * this card shows its progress and can seek too. Paid audio shows the viewer's ID (sound can't be stamped).
 */
export default function AudioPlayer({
    src,
    title,
    artist,
    artwork,
    href,
    stamp,
    compact = false,
}: {
    src: string;
    title?: string | null;
    artist?: string | null;
    artwork?: string | null;
    href?: string | null;
    stamp?: string | null;
    compact?: boolean;
}) {
    const { t } = useT();
    const p = usePlayer();
    const [length, setLength] = useState(0);
    const name = title || t('au.track');
    const current = p.track?.key === src;
    const playing = current && p.playing;
    const duration = current && p.duration ? p.duration : length;
    const time = current ? p.time : 0;

    function press() {
        if (current) toggle();
        else play({ key: src, src, title: name, artist, artwork, href, stamp });
    }

    return (
        <div
            className={`flex items-center gap-3 rounded-2xl border p-2.5 transition ${
                current ? 'border-primary/40 bg-primary/5' : 'bg-muted/60 border-border/60'
            }`}
            onContextMenu={stamp ? (e) => e.preventDefault() : undefined}
        >
            {/* Only to read the length; playback happens in the app's player. */}
            <audio src={src} preload="metadata" className="hidden" onLoadedMetadata={(e) => setLength(e.currentTarget.duration)} />

            <button
                type="button"
                onClick={press}
                aria-label={t(playing ? 'au.pause' : 'au.play')}
                className={`group relative grid shrink-0 place-items-center overflow-hidden rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white shadow-sm ${compact ? 'size-12' : 'size-14'}`}
            >
                {artwork ? (
                    <img src={artwork} alt="" className="absolute inset-0 size-full object-cover" />
                ) : (
                    <AudioLines className="size-6 transition group-hover:opacity-0" />
                )}
                <span
                    className={`absolute inset-0 grid place-items-center bg-black/35 transition ${playing || artwork ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                >
                    {current && p.loading && p.playing ? (
                        <LoaderCircle className="size-6 animate-spin" />
                    ) : playing ? (
                        <Pause className="size-6 fill-current" />
                    ) : (
                        <Play className="ml-0.5 size-6 fill-current" />
                    )}
                </span>
            </button>

            <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{name}</p>
                <p className="text-muted-foreground truncate text-xs">
                    {artist}
                    {artist && duration > 0 && ' · '}
                    {duration > 0 && clock(duration)}
                </p>
                {current && (
                    <div className="mt-1 flex items-center gap-2">
                        <SeekBar value={time} max={duration} onSeek={seek} label={t('au.seek')} />
                        <span className="text-muted-foreground shrink-0 text-[11px] tabular-nums">{clock(time)}</span>
                    </div>
                )}
                {stamp && !compact && <p className="text-muted-foreground/70 mt-0.5 truncate text-[10px]">{stamp}</p>}
            </div>

            {playing && (
                <span className="mr-1 flex h-4 shrink-0 items-end gap-0.5" aria-hidden>
                    {[0, 1, 2].map((i) => (
                        <span key={i} className="eq-bar bg-primary w-0.5 rounded-full" style={{ animationDelay: `${i * 0.15}s` }} />
                    ))}
                </span>
            )}
        </div>
    );
}
