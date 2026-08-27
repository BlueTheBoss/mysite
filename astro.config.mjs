import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';

export default defineConfig({
    // Static by default; individual pages/endpoints opt into SSR with
    // `export const prerender = false` (used by the vault and API routes).
    output: 'static',
    site: 'https://armevox.vercel.app',
    adapter: vercel(),
    // Keep URL parity with the previous cleanUrls setup: /music, not /music/
    trailingSlash: 'never',
    build: {
        // Emit dist/index.html, dist/music.html, dist/404.html
        format: 'file',
    },
});
