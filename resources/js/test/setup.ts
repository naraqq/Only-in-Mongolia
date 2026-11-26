import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Ziggy's route() is a global in the app; tests get a simple stand-in.
vi.stubGlobal('route', (name: string, params?: unknown) => `/${name}${params ? `?${JSON.stringify(params)}` : ''}`);

afterEach(() => cleanup());
