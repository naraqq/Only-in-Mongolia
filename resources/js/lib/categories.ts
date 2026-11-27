import type { TKey } from '@/lib/i18n';

/** What a creator's page can be about (config creators.categories), with its label. */
export const CATEGORY_LABELS: Record<string, TKey> = {
    music: 'starter.music',
    art: 'starter.art',
    photography: 'starter.photography',
    travel: 'starter.travel',
    food: 'starter.food',
    fitness: 'starter.fitness',
    style: 'starter.style',
    technology: 'starter.technology',
    comics: 'starter.comics',
    comedy: 'starter.comedy',
    education: 'starter.education',
    gaming: 'starter.gaming',
    lifestyle: 'starter.lifestyle',
};

export const categoryLabel = (key: string): TKey | null => CATEGORY_LABELS[key] ?? null;
