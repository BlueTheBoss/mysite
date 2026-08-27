import type { APIRoute } from 'astro';
import { createRateLimiter, getClientIp } from '../../../lib/security';
import { readJson } from '../../../lib/http';
import { readVaultJson, writeVaultJson, OPS_VISITS_DIR } from '../../../lib/vault';

export const prerender = false;

// Lightweight page-view counter. The beacon fires from public pages only;
// per-IP rate limit keeps a misbehaving client from hammering Dropbox.
const trackLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 30 });

type DayCounts = Record<string, number>;

function dayFile(date = new Date()): string {
    return `${OPS_VISITS_DIR}/${date.toISOString().slice(0, 10)}.json`;
}

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
        const file = dayFile();
        const counts = (await readVaultJson<DayCounts>(file)) || {};
        counts[path] = (counts[path] || 0) + 1;
        await writeVaultJson(file, counts);
    } catch (err: any) {
        // Tracking is best-effort — a storage hiccup must never break a page
        console.warn('Visit tracking failed:', err.message);
    }
    return new Response(null, { status: 204 });
};

// GET — nothing to serve; the beacon only needs POST. The ops page reads
// the visit files directly from storage.
export const GET: APIRoute = () => new Response(null, { status: 204 });
