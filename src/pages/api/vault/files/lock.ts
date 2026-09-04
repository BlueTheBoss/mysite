import type { APIRoute } from 'astro';
import { isAuthenticated } from '../../../../lib/security';
import { jsonResponse, readJson } from '../../../../lib/http';
import { safeRelPath } from '../../../../lib/vault';
import { setVaultLock, unlockVaultPath, isVaultPathLocked } from '../../../../lib/turso';

export const prerender = false;

// POST /api/vault/files/lock  { path?: string, paths?: string[], locked: boolean, pin: string }
export const POST: APIRoute = async ({ request }) => {
    if (!isAuthenticated(request.headers)) return jsonResponse({ error: 'Unauthorized' }, 401);

    const body = await readJson(request, 8192);
    if (!body) return jsonResponse({ error: 'Invalid request' }, 400);

    const rawPaths: string[] = Array.isArray(body.paths)
        ? body.paths.map((p: any) => String(p || ''))
        : [String(body.path || '')];

    const cleanPaths: string[] = rawPaths
        .map(p => safeRelPath(p))
        .filter((p): p is string => Boolean(p));

    if (cleanPaths.length === 0) return jsonResponse({ error: 'No valid paths provided' }, 400);

    const isLocking = Boolean(body.locked);
    const pin = String(body.pin || '').trim();

    if (!/^\d{4}$/.test(pin)) {
        return jsonResponse({ error: 'Please enter a valid 4-digit PIN (digits only).' }, 400);
    }

    try {
        if (isLocking) {
            for (const p of cleanPaths) {
                await setVaultLock(p, true, pin);
            }
            return jsonResponse({ success: true, count: cleanPaths.length, locked: true });
        } else {
            const failed: { path: string; error: string }[] = [];
            for (const p of cleanPaths) {
                const unlockRes = await unlockVaultPath(p, pin);
                if (!unlockRes.success) {
                    failed.push({ path: p, error: unlockRes.error || 'Incorrect PIN' });
                }
            }
            if (failed.length > 0 && failed.length === cleanPaths.length) {
                return jsonResponse({ error: failed[0].error || 'Incorrect PIN' }, 403);
            }
            return jsonResponse({ success: true, count: cleanPaths.length - failed.length, failed, locked: false });
        }
    } catch (err: any) {
        console.error('File lock action failed:', err.message);
        return jsonResponse({ error: err.message || 'Database error' }, 502);
    }
};
