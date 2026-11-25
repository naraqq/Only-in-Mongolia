import { setLocale, useT, type Locale } from '@/lib/i18n';

/** МН / EN toggle; the choice is remembered in the session. */
export default function LangSwitch({ className = '' }: { className?: string }) {
    const { t, locale } = useT();
    const opts: [Locale, string][] = [
        ['mn', 'МН'],
        ['en', 'EN'],
    ];
    return (
        <div className={`bg-muted flex rounded-lg p-0.5 text-xs ${className}`} role="group" aria-label={t('lang.label')}>
            {opts.map(([l, label]) => (
                <button
                    key={l}
                    type="button"
                    onClick={() => l !== locale && setLocale(l)}
                    className={`rounded-md px-2 py-1 font-semibold transition ${l === locale ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                    aria-pressed={l === locale}
                >
                    {label}
                </button>
            ))}
        </div>
    );
}
