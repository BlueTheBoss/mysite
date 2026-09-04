import type { APIRoute } from 'astro';
import { isAuthenticated } from '../../../../lib/security';
import { jsonResponse, readJson } from '../../../../lib/http';
import { getDbx } from '../../../../lib/dropbox';
import { FILES_DIR, safeFilename, safeRelPath, invalidateVaultList } from '../../../../lib/vault';
import { isVaultPathLocked } from '../../../../lib/turso';

export const prerender = false;

// POST /api/vault/files/mkdir  { folder, parentPath }
export const POST: APIRoute = async ({ request }) => {
    if (!isAuthenticated(request.headers)) return jsonResponse({ error: 'Unauthorized' }, 401);

    const body = await readJson(request, 4096);
    if (!body) return jsonResponse({ error: 'Invalid request' }, 400);

    const folder = safeFilename(String(body.folder || ''), 80);
    const parentPath = safeRelPath(String(body.parentPath || ''));

    if (!folder || folder === 'unnamed') {
        return jsonResponse({ error: 'Invalid folder name' }, 400);
    }

    if (parentPath && await isVaultPathLocked(parentPath)) {
        return jsonResponse({ error: 'Parent folder is locked' }, 403);
    }

    const target = parentPath ? `${FILES_DIR}/${parentPath}/${folder}` : `${FILES_DIR}/${folder}`;

    try {
        const dbx = getDbx();
        await dbx.filesCreateFolderV2({ path: target, autorename: false });
        invalidateVaultList();
        return jsonResponse({ success: true, folder, path: parentPath ? `${parentPath}/${folder}` : folder });
    } catch (err: any) {
        const summary = err?.error?.error_summary || err?.error_summary || err?.message || '';
        if (summary.includes('conflict')) {
            return jsonResponse({ error: 'A folder with that name already exists' }, 409);
        }
        console.error('Folder creation failed:', summary);
        return jsonResponse({ error: summary || 'Storage error' }, 502);
    }
};
