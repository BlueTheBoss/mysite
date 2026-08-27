import type { APIRoute } from 'astro';
import { isAuthenticated } from '../../../../lib/security';
import { jsonResponse, readJson } from '../../../../lib/http';
import { deleteVaultPath, FILES_DIR, safeFilename } from '../../../../lib/vault';

export const prerender = false;

// POST /api/vault/files/delete  { name }
// Only ever deletes inside FILES_DIR — the name is sanitized and joined
// server-side, so the client can never point it elsewhere.
export const POST: APIRoute = async ({ request }) => {
    if (!isAuthenticated(request.headers)) return jsonResponse({ error: 'Unauthorized' }, 401);

    const body = await readJson(request, 4096);
    if (!body) return jsonResponse({ error: 'Invalid request' }, 400);

    const name = safeFilename(String(body.name || ''), 120);
    if (!name || name === 'unnamed') return jsonResponse({ error: 'Invalid file name' }, 400);

    try {
        await deleteVaultPath(`${FILES_DIR}/${name}`);
        return jsonResponse({ success: true });
    } catch (err: any) {
        console.error('File delete failed:', err.message);
        return jsonResponse({ error: err.message || 'Storage error' }, 502);
    }
};
