import 'dotenv/config';
import crypto from 'node:crypto';

// ── Session Tokens ─────────────────────────────────────────────────────────────
// Expiring HMAC token: "<expiryMs>.<hmac(expiryMs)>". Stateless, but bounded:
// the server rejects anything older than SESSION_TTL_MS. The HMAC is keyed by
// SESSION_SECRET — an independent, high-entropy random value — never the PIN.
// The PIN is only 4 digits (~10k candidates), so signing with it would let
// anyone holding one captured token offline-recover the PIN in milliseconds.
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
export const SESSION_COOKIE = 'vibe_session';

const sessionSecret = () => (process.env.SESSION_SECRET || '').trim();

export function hasSessionSecret(): boolean {
    return Boolean(sessionSecret());
}

function signExpiry(expiryMs: number): string {
    return crypto
        .createHmac('sha256', sessionSecret())
        .update(`vibe_session_v1:${expiryMs}`)
        .digest('hex');
}

export function generateSessionToken(): string {
    if (!hasSessionSecret()) throw new Error('SESSION_SECRET is not configured');
    const expiry = Date.now() + SESSION_TTL_MS;
    return `${expiry}.${signExpiry(expiry)}`;
}

// Returns true only if the token is well-formed, unexpired, and correctly signed.
export function verifySessionToken(token: unknown): boolean {
    if (!hasSessionSecret() || !token || typeof token !== 'string') return false;
    const dotAt = token.indexOf('.');
    if (dotAt === -1) return false;

    const expiry = Number(token.slice(0, dotAt));
    const sig = token.slice(dotAt + 1);
    if (!Number.isFinite(expiry) || expiry <= Date.now()) return false;
    // Reject tokens "issued" further in the future than one TTL allows
    if (expiry > Date.now() + SESSION_TTL_MS + 60_000) return false;

    return timingSafeEqualStr(sig, signExpiry(expiry));
}

// If the token is valid, returns its expiry timestamp — used by the vault
// dashboard to show how long the current session lasts.
export function sessionExpiry(token: unknown): number | null {
    if (!token || typeof token !== 'string') return null;
    if (!verifySessionToken(token)) return null;
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
    // Both are required: the PIN gates entry, SESSION_SECRET signs tokens.
    if (!process.env.SECRET_PIN || !hasSessionSecret()) return false;
    try {
        return verifySessionToken(getSessionToken(headers));
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

// Defense-in-depth for rendered markdown: `marked()` passes raw HTML through,
// so untrusted note content could smuggle scripts/event handlers/URLs in.
// Not a full HTML parser, but it strips every element that can execute code —
// enough for a single-owner personal notes app.
export function sanitizeHtml(value: unknown): string {
    let out = String(value ?? '');
    // Remove entire dangerous blocks, nested content included
    out = out.replace(/<\s*(script|iframe|object|embed|form|svg|math)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '');
    // Remove any unpaired openings from the same set
    out = out.replace(/<\s*(script|iframe|object|embed|form|svg|math)\b[^>]*>/gi, '');
    // Strip inline event handlers (onclick=…, onload=…)
    out = out.replace(/\s+on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
    // Disarm javascript:/data:/vbscript: URLs on navigation/load attributes
    out = out.replace(/\b(href|src|srcdoc|action|formaction)\s*=\s*(["'])\s*(?:javascript|data|vbscript)\s*:/gi, '$1=$2#');
    return out;
}
