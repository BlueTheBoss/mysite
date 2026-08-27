const crypto = require('crypto');

// ── Session Tokens ─────────────────────────────────────────────────────────────
// Expiring HMAC token: "<expiryMs>.<hmac(expiryMs)>". Stateless, but bounded:
// the server rejects anything older than SESSION_TTL_MS. Rotating SECRET_PIN
// invalidates every outstanding token immediately.
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const SESSION_COOKIE = 'vibe_session';

function signExpiry(secretPin, expiryMs) {
    return crypto
        .createHmac('sha256', String(secretPin))
        .update(`vibe_session_v1:${expiryMs}`)
        .digest('hex');
}

function generateSessionToken(secretPin) {
    const expiry = Date.now() + SESSION_TTL_MS;
    return `${expiry}.${signExpiry(secretPin, expiry)}`;
}

// Returns true only if the token is well-formed, unexpired, and correctly signed.
function verifySessionToken(token, secretPin) {
    if (!token || !secretPin || typeof token !== 'string') return false;
    const dotAt = token.indexOf('.');
    if (dotAt === -1) return false;

    const expiry = Number(token.slice(0, dotAt));
    const sig = token.slice(dotAt + 1);
    if (!Number.isFinite(expiry) || expiry <= Date.now()) return false;
    // Reject tokens "issued" further in the future than one TTL allows
    if (expiry > Date.now() + SESSION_TTL_MS + 60_000) return false;

    return timingSafeEqualStr(sig, signExpiry(secretPin, expiry));
}

// Constant-time string compare (hashes first so lengths never leak)
function timingSafeEqualStr(a, b) {
    const ha = crypto.createHash('sha256').update(String(a)).digest();
    const hb = crypto.createHash('sha256').update(String(b)).digest();
    return crypto.timingSafeEqual(ha, hb);
}

// ── Cookies ────────────────────────────────────────────────────────────────────
function parseCookies(req) {
    const out = {};
    const raw = req.headers.cookie;
    if (!raw) return out;
    for (const pair of raw.split(';')) {
        const idx = pair.indexOf('=');
        if (idx === -1) continue;
        out[pair.slice(0, idx).trim()] = decodeURIComponent(pair.slice(idx + 1).trim());
    }
    return out;
}

function isSecureRequest(req) {
    return req.socket?.encrypted === true ||
        (req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
}

function sessionCookieHeader(req, token) {
    // Secure flag only on HTTPS so localhost dev keeps working
    const flags = [`vibe_session=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Strict'];
    if (isSecureRequest(req)) flags.push('Secure');
    flags.push(`Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`);
    return flags.join('; ');
}

function clearSessionCookieHeader(req) {
    const flags = [`${SESSION_COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Strict', 'Max-Age=0'];
    if (isSecureRequest(req)) flags.push('Secure');
    return flags.join('; ');
}

// Extracts the session token from cookie or legacy header
function getSessionToken(req) {
    return parseCookies(req)[SESSION_COOKIE] || req.headers['x-session-token'] || null;
}

// Full check against the configured PIN
function isAuthenticated(req) {
    const pin = process.env.SECRET_PIN;
    if (!pin) return false;
    try {
        return verifySessionToken(getSessionToken(req), pin);
    } catch {
        return false;
    }
}

// ── Rate Limiting ──────────────────────────────────────────────────────────────
// In-memory sliding-window limiter with periodic cleanup. Per-instance on
// serverless, exact on a single Express process.
function createRateLimiter({ windowMs, max, maxKeys = 10_000 }) {
    const hits = new Map(); // key → { count, resetAt }

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
        check(key) {
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
        reset(key) { hits.delete(key); }
    };
}

function getClientIp(req) {
    return (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown')
        .split(',')[0]
        .trim()
        .slice(0, 64);
}

// ── Sanitization ───────────────────────────────────────────────────────────────
function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

module.exports = {
    SESSION_TTL_MS,
    generateSessionToken,
    verifySessionToken,
    timingSafeEqualStr,
    parseCookies,
    sessionCookieHeader,
    clearSessionCookieHeader,
    getSessionToken,
    isAuthenticated,
    createRateLimiter,
    getClientIp,
    escapeHtml
};
