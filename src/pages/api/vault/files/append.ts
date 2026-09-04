import type { APIRoute } from 'astro';
import { isAuthenticated, createRateLimiter, getClientIp } from '../../../../lib/security';
import { jsonResponse } from '../../../../lib/http';
import { appendUploadSession } from '../../../../lib/vault';

export const prerender = false;

const fileLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 240 });
// Stay under Vercel's ~4.5 MB function body limit
const MAX_CHUNK_BYTES = 4 * 1024 * 1024;
const SESSION_ID_RE = /^[A-Za-z0-9_:-]{10,256}$/;

// POST /api/vault/files/append?session=<id>&offset=<n>
// Body: raw application/octet-stream chunk (≤4 MB)
export const POST: APIRoute = async ({ request, clientAddress }) => {
    if (!isAuthenticated(request.headers)) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!fileLimiter.check(getClientIp(request.headers, clientAddress)).allowed) {
        return jsonResponse({ error: 'Too many requests' }, 429);
    }

    const url = new URL(request.url);
    const sessionId = url.searchParams.get('session') || '';
    const offset = Number(url.searchParams.get('offset'));
    if (!SESSION_ID_RE.test(sessionId)) return jsonResponse({ error: 'Invalid session' }, 400);
    if (!Number.isInteger(offset) || offset < 0 || offset > 200 * 1024 * 1024) {
        return jsonResponse({ error: 'Invalid offset' }, 400);
    }

    const declared = Number(request.headers.get('content-length') || '0');
    if (declared > MAX_CHUNK_BYTES) return jsonResponse({ error: 'Chunk too large' }, 413);

    let chunk: Buffer;
    try {
        chunk = Buffer.from(await request.arrayBuffer());
    } catch {
        return jsonResponse({ error: 'Failed to read chunk' }, 400);
    }
    if (chunk.byteLength === 0 || chunk.byteLength > MAX_CHUNK_BYTES) {
        return jsonResponse({ error: 'Empty or oversized chunk' }, 400);
    }

    try {
        await appendUploadSession(sessionId, offset, chunk);
        return jsonResponse({ success: true });
    } catch (err: any) {
        console.error('Chunk append failed:', err.message);
        return jsonResponse({ error: err.message || 'Storage error' }, 502);
    }
};
