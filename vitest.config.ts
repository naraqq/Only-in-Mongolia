import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Frontend unit tests (npm test). Kept apart from vite.config.js so the Laravel plugin doesn't run here.
export default defineConfig({
    plugins: [react()],
    resolve: { alias: { '@': fileURLToPath(new URL('./resources/js', import.meta.url)) } },
    test: {
        environment: 'jsdom',
        include: ['resources/js/**/*.test.{ts,tsx}'],
        setupFiles: ['resources/js/test/setup.ts'],
        restoreMocks: true,
    },
});
