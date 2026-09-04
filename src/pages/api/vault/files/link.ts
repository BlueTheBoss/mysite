import type { APIRoute } from 'astro';
import { isAuthenticated } from '../../../../lib/security';
import { jsonResponse } from '../../../../lib/http';
import { vaultTempLink, FILES_DIR, safeRelPath } from '../../../../lib/vault';

export const prerender = false;

// GET /api/vault/files/link?path=<file> → { url }
// Returns a short-lived (~4h) unguessable Dropbox link — the same mechanism
// the music player uses for streaming. Only issued to authenticated requests.
export const GET: APIRoute = async ({ request }) => {
    if (!isAuthenticated(request.headers)) return jsonResponse({ error: 'Unauthorized' }, 401);

    const urlObj = new URL(request.url);
    const raw = urlObj.searchParams.get('path') || urlObj.searchParams.get('name') || '';
    const cleanPath = safeRelPath(raw);
    if (!cleanPath) return jsonResponse({ error: 'Invalid file path' }, 400);

    try {
        const url = await vaultTempLink(`${FILES_DIR}/${cleanPath}`);
        return jsonResponse({ success: true, url });
    } catch (err: any) {
        console.error('Temp link failed:', err.message);
        return jsonResponse({ error: err.message || 'Storage error' }, 502);
    }
};
