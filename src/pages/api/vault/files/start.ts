import type { APIRoute } from 'astro';
import { isAuthenticated, createRateLimiter, getClientIp } from '../../../../lib/security';
import { jsonResponse, readJson } from '../../../../lib/http';
import { startUploadSession, FILES_DIR, safeFilename } from '../../../../lib/vault';

export const prerender = false;

const fileLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 60 });
const MAX_FILE_BYTES = 150 * 1024 * 1024; // 150 MB per file

// POST /api/vault/files/start  { name, size } → { sessionId, name }
// Opens a Dropbox upload session; chunks are appended via /append and the
// file is committed via /finish. Keeping state in the Dropbox session id
// means the server holds nothing between requests.
export const POST: APIRoute = async ({ request, clientAddress }) => {
    if (!isAuthenticated(request.headers)) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!fileLimiter.check(getClientIp(request.headers, clientAddress)).allowed) {
        return jsonResponse({ error: 'Too many requests' }, 429);
    }

    const body = await readJson(request, 4096);
    if (!body) return jsonResponse({ error: 'Invalid request' }, 400);

    const name = safeFilename(String(body.name || ''), 120);
    const size = Number(body.size);
    if (!name || name === 'unnamed') return jsonResponse({ error: 'Invalid file name' }, 400);
    if (!Number.isFinite(size) || size < 0 || size > MAX_FILE_BYTES) {
        return jsonResponse({ error: `File too large (max ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB)` }, 413);
    }

    try {
        const sessionId = await startUploadSession(Buffer.alloc(0));
        return jsonResponse({ success: true, sessionId, name });
    } catch (err: any) {
        console.error('Upload session start failed:', err.message);
        return jsonResponse({ error: err.message || 'Storage error' }, 502);
    }
};
