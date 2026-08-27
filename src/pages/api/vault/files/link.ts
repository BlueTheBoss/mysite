import type { APIRoute } from 'astro';
import { isAuthenticated } from '../../../../lib/security';
import { jsonResponse } from '../../../../lib/http';
import { vaultTempLink, FILES_DIR, safeFilename } from '../../../../lib/vault';

export const prerender = false;

// GET /api/vault/files/link?name=<file> → { url }
// Returns a short-lived (~4h) unguessable Dropbox link — the same mechanism
// the music player uses for streaming. Only issued to authenticated requests.
export const GET: APIRoute = async ({ request }) => {
    if (!isAuthenticated(request.headers)) return jsonResponse({ error: 'Unauthorized' }, 401);

    const name = safeFilename(new URL(request.url).searchParams.get('name') || '', 120);
    if (!name || name === 'unnamed') return jsonResponse({ error: 'Invalid file name' }, 400);

    try {
        const url = await vaultTempLink(`${FILES_DIR}/${name}`);
        return jsonResponse({ success: true, url });
    } catch (err: any) {
        console.error('Temp link failed:', err.message);
        return jsonResponse({ error: err.message || 'Storage error' }, 502);
    }
};
