import type { APIRoute } from 'astro';
import { isAuthenticated } from '../../../../lib/security';
import { jsonResponse, readJson } from '../../../../lib/http';
import { deleteVaultPath, FILES_DIR, safeRelPath } from '../../../../lib/vault';
import { isVaultPathLocked } from '../../../../lib/turso';

export const prerender = false;

// POST /api/vault/files/delete  { path?: string, paths?: string[] }
export const POST: APIRoute = async ({ request }) => {
    if (!isAuthenticated(request.headers)) return jsonResponse({ error: 'Unauthorized' }, 401);

    const body = await readJson(request, 8192);
    if (!body) return jsonResponse({ error: 'Invalid request' }, 400);

    const rawPaths: string[] = Array.isArray(body.paths)
        ? body.paths.map((p: any) => String(p || ''))
        : [String(body.path || body.name || '')];

    const cleanPaths: string[] = rawPaths
        .map(p => safeRelPath(p))
        .filter((p): p is string => Boolean(p));

    if (cleanPaths.length === 0) return jsonResponse({ error: 'No valid paths provided' }, 400);

    // Check if any of the items or their parents are locked
    for (const p of cleanPaths) {
        const parts = p.split('/');
        let checkAcc = '';
        for (const part of parts) {
            checkAcc = checkAcc ? `${checkAcc}/${part}` : part;
            if (await isVaultPathLocked(checkAcc)) {
                return jsonResponse({ error: `"${checkAcc}" is locked. Unlock it first before deleting.` }, 403);
            }
        }
    }

    try {
        const deleted: string[] = [];
        for (const p of cleanPaths) {
            await deleteVaultPath(`${FILES_DIR}/${p}`);
            deleted.push(p);
        }
        return jsonResponse({ success: true, count: deleted.length, deleted });
    } catch (err: any) {
        console.error('File delete failed:', err.message);
        return jsonResponse({ error: err.message || 'Storage error' }, 502);
    }
};
