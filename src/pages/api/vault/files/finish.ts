import type { APIRoute } from 'astro';
import { isAuthenticated, createRateLimiter, getClientIp } from '../../../../lib/security';
import { jsonResponse } from '../../../../lib/http';
import { finishUploadSession, FILES_DIR, safeFilename } from '../../../../lib/vault';

export const prerender = false;

const fileLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 60 });
const SESSION_ID_RE = /^[A-Za-z0-9_:-]{10,256}$/;

// POST /api/vault/files/finish?session=<id>&offset=<n>&name=<file>[&hasFinal=1]
// Commits the upload session. Client protocol: appends carry all-but-last
// chunk; the final chunk (if any) rides in the body as raw bytes. Params
// live in the query string so the body stays free for the chunk.
export const POST: APIRoute = async ({ request, clientAddress }) => {
    if (!isAuthenticated(request.headers)) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!fileLimiter.check(getClientIp(request.headers, clientAddress)).allowed) {
        return jsonResponse({ error: 'Too many requests' }, 429);
    }

    const url = new URL(request.url);
    const sessionId = url.searchParams.get('session') || '';
    const offset = Number(url.searchParams.get('offset'));
    const name = safeFilename(url.searchParams.get('name') || '', 120);
    if (!SESSION_ID_RE.test(sessionId)) return jsonResponse({ error: 'Invalid session' }, 400);
    if (!Number.isInteger(offset) || offset < 0) return jsonResponse({ error: 'Invalid offset' }, 400);
    if (!name || name === 'unnamed') return jsonResponse({ error: 'Invalid file name' }, 400);

    let finalChunk = Buffer.alloc(0);
    if (url.searchParams.get('hasFinal') === '1') {
        const declared = Number(request.headers.get('content-length') || '0');
        if (declared > 4 * 1024 * 1024) return jsonResponse({ error: 'Final chunk too large' }, 413);
        try {
            finalChunk = Buffer.from(await request.arrayBuffer());
        } catch {
            return jsonResponse({ error: 'Failed to read final chunk' }, 400);
        }
        if (finalChunk.byteLength === 0) return jsonResponse({ error: 'Missing final chunk' }, 400);
    }

    const folder = safeRelPath(url.searchParams.get('folder') || '');
    const target = folder ? `${FILES_DIR}/${folder}/${name}` : `${FILES_DIR}/${name}`;

    try {
        await finishUploadSession(sessionId, offset, finalChunk, target);
        return jsonResponse({ success: true, name, path: folder ? `${folder}/${name}` : name });
    } catch (err: any) {
        console.error('Upload finish failed:', err.message);
        return jsonResponse({ error: err.message || 'Storage error' }, 502);
    }
};
