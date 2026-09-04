import type { APIRoute } from 'astro';
import { createRateLimiter, getClientIp } from '../../../lib/security';
import { readJson } from '../../../lib/http';
import { recordTursoView } from '../../../lib/turso';

export const prerender = false;

// Lightweight page-view counter. The beacon fires from public pages only;
// per-IP rate limit keeps a misbehaving client from spamming analytics.
const trackLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 60 });

export const POST: APIRoute = async ({ request, clientAddress }) => {
    const ip = getClientIp(request.headers, clientAddress);
    if (!trackLimiter.check(ip).allowed) {
        return new Response(null, { status: 204 });
    }

    const body = await readJson(request, 1024);
    const path = typeof body?.path === 'string' ? body.path : '';
    if (!path.startsWith('/') || path.startsWith('/vault') || path.length > 200) {
        return new Response(null, { status: 204 });
    }

    try {
        await recordTursoView(path);
    } catch (err: any) {
        console.warn('Visit tracking failed:', err.message);
    }
    return new Response(null, { status: 204 });
};

export const GET: APIRoute = () => new Response(null, { status: 204 });
