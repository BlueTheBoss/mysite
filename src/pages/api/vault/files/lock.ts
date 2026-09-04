import type { APIRoute } from 'astro';
import { isAuthenticated } from '../../../../lib/security';
import { jsonResponse, readJson } from '../../../../lib/http';
import { safeRelPath } from '../../../../lib/vault';
import { setVaultLock, unlockVaultPath, isVaultPathLocked } from '../../../../lib/turso';

export const prerender = false;

// POST /api/vault/files/lock  { path, locked, pin }
export const POST: APIRoute = async ({ request }) => {
    if (!isAuthenticated(request.headers)) return jsonResponse({ error: 'Unauthorized' }, 401);

    const body = await readJson(request, 4096);
    if (!body) return jsonResponse({ error: 'Invalid request' }, 400);

    const rawPath = String(body.path || '');
    const cleanPath = safeRelPath(rawPath);
    if (!cleanPath) return jsonResponse({ error: 'Invalid path' }, 400);

    const isLocking = Boolean(body.locked);
    const pin = String(body.pin || '').trim();

    if (!/^\d{4}$/.test(pin)) {
        return jsonResponse({ error: 'Please enter a valid 4-digit PIN (digits only).' }, 400);
    }

    try {
        if (isLocking) {
            await setVaultLock(cleanPath, true, pin);
            return jsonResponse({ success: true, path: cleanPath, locked: true });
        } else {
            const unlockRes = await unlockVaultPath(cleanPath, pin);
            if (!unlockRes.success) {
                return jsonResponse({ error: unlockRes.error || 'Incorrect PIN' }, 403);
            }
            return jsonResponse({ success: true, path: cleanPath, locked: false });
        }
    } catch (err: any) {
        console.error('File lock action failed:', err.message);
        return jsonResponse({ error: err.message || 'Database error' }, 502);
    }
};
