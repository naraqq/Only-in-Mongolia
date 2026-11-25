import react from '@vitejs/plugin-react';
import laravel from 'laravel-vite-plugin';
import {
    defineConfig
} from 'vite';
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
    plugins: [
        laravel({
            input: ['resources/css/app.css', 'resources/js/app.tsx'],
            ssr: 'resources/js/ssr.jsx',
            refresh: true,
        }),
        react(),
        tailwindcss(),
    ],
    esbuild: {
        jsx: 'automatic',
    },
    server: {
        watch: {
            // On Windows the watcher can fire while a file is still being written; Vite then caches an empty
            // module and serves it until the file changes again. Wait for the write to finish first.
            awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 25 },
        },
    },
});