import type { APIRoute } from 'astro';
import { isAuthenticated } from '../../../../lib/security';
import { jsonResponse, readJson } from '../../../../lib/http';
import { deleteVaultPath, FILES_DIR, safeRelPath } from '../../../../lib/vault';
import { isVaultPathLocked } from '../../../../lib/turso';

export const prerender = false;

// POST /api/vault/files/delete  { path }
export const POST: APIRoute = async ({ request }) => {
    if (!isAuthenticated(request.headers)) return jsonResponse({ error: 'Unauthorized' }, 401);

    const body = await readJson(request, 4096);
    if (!body) return jsonResponse({ error: 'Invalid request' }, 400);

    const raw = String(body.path || body.name || '');
    const cleanPath = safeRelPath(raw);
    if (!cleanPath) return jsonResponse({ error: 'Invalid path' }, 400);

    // Check if the item or any parent folder is locked
    const parts = cleanPath.split('/');
    let checkAcc = '';
    for (const part of parts) {
        checkAcc = checkAcc ? `${checkAcc}/${part}` : part;
        if (await isVaultPathLocked(checkAcc)) {
            return jsonResponse({ error: `"${checkAcc}" is locked. Unlock it first before deleting.` }, 403);
        }
    }

    try {
        await deleteVaultPath(`${FILES_DIR}/${cleanPath}`);
        return jsonResponse({ success: true, path: cleanPath });
    } catch (err: any) {
        console.error('File delete failed:', err.message);
        return jsonResponse({ error: err.message || 'Storage error' }, 502);
    }
};
