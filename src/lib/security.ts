import 'dotenv/config';
import crypto from 'node:crypto';

// ── Session Tokens ─────────────────────────────────────────────────────────────
// Expiring HMAC token: "<expiryMs>.<hmac(expiryMs)>". Stateless, but bounded:
// the server rejects anything older than SESSION_TTL_MS. Rotating SECRET_PIN
// invalidates every outstanding token immediately.
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
export const SESSION_COOKIE = 'vibe_session';

function signExpiry(secretPin: string, expiryMs: number): string {
    return crypto
        .createHmac('sha256', String(secretPin))
        .update(`vibe_session_v1:${expiryMs}`)
        .digest('hex');
}

export function generateSessionToken(secretPin: string): string {
    const expiry = Date.now() + SESSION_TTL_MS;
    return `${expiry}.${signExpiry(secretPin, expiry)}`;
}

// Returns true only if the token is well-formed, unexpired, and correctly signed.
export function verifySessionToken(token: unknown, secretPin: unknown): boolean {
    if (!token || !secretPin || typeof token !== 'string') return false;
    const dotAt = token.indexOf('.');
    if (dotAt === -1) return false;

    const expiry = Number(token.slice(0, dotAt));
    const sig = token.slice(dotAt + 1);
    if (!Number.isFinite(expiry) || expiry <= Date.now()) return false;
    // Reject tokens "issued" further in the future than one TTL allows
    if (expiry > Date.now() + SESSION_TTL_MS + 60_000) return false;

    return timingSafeEqualStr(sig, signExpiry(String(secretPin), expiry));
}

// If the token is valid, returns its expiry timestamp — used by the vault
// dashboard to show how long the current session lasts.
export function sessionExpiry(token: unknown, secretPin: unknown): number | null {
    if (!token || !secretPin || typeof token !== 'string') return null;
    if (!verifySessionToken(token, secretPin)) return null;
    const expiry = Number(token.slice(0, token.indexOf('.')));
    return Number.isFinite(expiry) ? expiry : null;
}

// Constant-time string compare (hashes first so lengths never leak)
export function timingSafeEqualStr(a: unknown, b: unknown): boolean {
    const ha = crypto.createHash('sha256').update(String(a)).digest();
    const hb = crypto.createHash('sha256').update(String(b)).digest();
    return crypto.timingSafeEqual(ha, hb);
}

// ── Cookies ────────────────────────────────────────────────────────────────────
export function parseCookieHeader(raw: string | null | undefined): Record<string, string> {
    const out: Record<string, string> = {};
    if (!raw) return out;
    for (const pair of raw.split(';')) {
        const idx = pair.indexOf('=');
        if (idx === -1) continue;
        out[pair.slice(0, idx).trim()] = decodeURIComponent(pair.slice(idx + 1).trim());
    }
    return out;
}

export function isSecureRequest(headers: Headers): boolean {
    return (headers.get('x-forwarded-proto') || '').split(',')[0].trim() === 'https';
}

export function sessionCookieHeader(headers: Headers, token: string): string {
    // Secure flag only on HTTPS so localhost dev keeps working
    const flags = [`vibe_session=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Strict'];
    if (isSecureRequest(headers)) flags.push('Secure');
    flags.push(`Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`);
    return flags.join('; ');
}

export function clearSessionCookieHeader(headers: Headers): string {
    const flags = [`${SESSION_COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Strict', 'Max-Age=0'];
    if (isSecureRequest(headers)) flags.push('Secure');
    return flags.join('; ');
}

// Extracts the session token from cookie or legacy header
export function getSessionToken(headers: Headers): string | null {
    return parseCookieHeader(headers.get('cookie'))[SESSION_COOKIE] || headers.get('x-session-token') || null;
}

// Full check against the configured PIN
export function isAuthenticated(headers: Headers): boolean {
    const pin = process.env.SECRET_PIN;
    if (!pin) return false;
    try {
        return verifySessionToken(getSessionToken(headers), pin);
    } catch {
        return false;
    }
}

// ── Rate Limiting ──────────────────────────────────────────────────────────────
// In-memory sliding-window limiter with periodic cleanup. Per-instance on
// serverless, exact on a single dev process.
export function createRateLimiter({ windowMs, max, maxKeys = 10_000 }: { windowMs: number; max: number; maxKeys?: number }) {
    const hits = new Map<string, { count: number; resetAt: number }>(); // key → { count, resetAt }

    function sweep() {
        const now = Date.now();
        for (const [k, v] of hits) if (now > v.resetAt) hits.delete(k);
    }
    // Opportunistic cleanup instead of a timer (serverless-safe)
    function maybeSweep() {
        if (hits.size > maxKeys) hits.clear();
        else if (hits.size > 500 && Math.random() < 0.1) sweep();
    }

    return {
        check(key: string) {
            maybeSweep();
            const now = Date.now();
            let rec = hits.get(key);
            if (!rec || now > rec.resetAt) {
                rec = { count: 0, resetAt: now + windowMs };
                hits.set(key, rec);
            }
            rec.count += 1;
            return {
                count: rec.count,
                allowed: rec.count <= max,
                retryAfterSecs: Math.max(1, Math.ceil((rec.resetAt - now) / 1000))
            };
        },
        reset(key: string) {
            hits.delete(key);
        }
    };
}

export function getClientIp(headers: Headers, remoteAddress?: string | null): string {
    return (
        headers.get('x-forwarded-for')?.split(',')[0].trim() ||
        remoteAddress ||
        'unknown'
    ).slice(0, 64);
}

// ── Sanitization ───────────────────────────────────────────────────────────────
export function escapeHtml(value: unknown): string {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
