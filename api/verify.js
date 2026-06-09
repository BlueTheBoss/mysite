const { Resend } = require('resend');
const crypto = require('crypto');
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// ── Rate Limiting ──────────────────────────────────────────────────────────────
// In-memory per-process store. Works perfectly for Express (server.js) and
// provides meaningful protection on Vercel (each warm lambda instance tracks
// its own callers, which is sufficient for a personal portfolio).
const rateLimitMap = new Map(); // ip → { count, resetAt }
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000; // 15-minute window

function getRateLimitRecord(ip) {
    const now = Date.now();
    let record = rateLimitMap.get(ip);
    if (!record || now > record.resetAt) {
        record = { count: 0, resetAt: now + WINDOW_MS };
    }
    return record;
}

function incrementRateLimit(ip) {
    const record = getRateLimitRecord(ip);
    record.count++;
    rateLimitMap.set(ip, record);
    return record;
}

function resetRateLimit(ip) {
    rateLimitMap.delete(ip);
}

// ── Session Token ──────────────────────────────────────────────────────────────
// Stateless HMAC token derived from the server PIN.
// The raw PIN is never sent back to the client — only this token.
// Rotating the PIN automatically invalidates all existing sessions.
function generateSessionToken(secretPin) {
    return crypto
        .createHmac('sha256', secretPin)
        .update('music_session_v1')
        .digest('hex');
}

// ── Handler ───────────────────────────────────────────────────────────────────
module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { pin, env } = req.body;
    const serverPin = process.env.SECRET_PIN;

    // Fail loudly if PIN isn't configured — no silent fallback
    if (!serverPin) {
        console.error('FATAL: SECRET_PIN environment variable is not set.');
        return res.status(500).json({ error: 'Server misconfiguration' });
    }

    // Resolve caller IP
    const clientIp = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown')
        .split(',')[0]
        .trim();

    // ── Rate limit check ──
    const record = incrementRateLimit(clientIp);
    if (record.count > MAX_ATTEMPTS) {
        const retryAfterSecs = Math.ceil((record.resetAt - Date.now()) / 1000);
        console.warn(`Rate limit exceeded for ${clientIp} — ${record.count} attempts`);
        return res.status(429).json({
            error: 'Too many attempts. Try again later.',
            retryAfter: retryAfterSecs
        });
    }

    // ── PIN verification ──
    if (pin === serverPin) {
        resetRateLimit(clientIp); // Clear counter on success
        const token = generateSessionToken(serverPin);
        return res.status(200).json({ success: true, message: 'Access granted', token });
    }

    // ── Failed attempt: send alert email ──
    try {
        const htmlAlert = `
            <!DOCTYPE html>
            <html>
            <body style="font-family: sans-serif; background-color: #FFF0F0; padding: 40px;">
                <div style="max-width: 600px; margin: 0 auto; background: white; border: 3px solid #712B13; box-shadow: 8px 8px 0px #712B13; padding: 30px;">
                    <h1 style="color: #712B13; margin-top: 0; text-transform: uppercase;">Security Alert: Failed PIN Attempt</h1>
                    <p style="font-size: 16px; color: #333;">An incorrect passcode was entered on your site.</p>

                    <div style="background: #F8D7DA; padding: 15px; border: 1px solid #712B13; margin-bottom: 20px;">
                        <strong style="display: block; font-size: 12px; color: #712B13; text-transform: uppercase;">
                            Attempt ${record.count} of ${MAX_ATTEMPTS} before lockout
                        </strong>
                        <span style="font-size: 14px; color: #712B13;">
                            ${MAX_ATTEMPTS - record.count} attempt(s) remaining before IP is blocked for 15 minutes.
                        </span>
                    </div>

                    <table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #555;">
                        <tr><td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>IP Address:</strong></td><td style="padding: 8px 0; border-bottom: 1px solid #eee;">${clientIp}</td></tr>
                        <tr><td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Device (UA):</strong></td><td style="padding: 8px 0; border-bottom: 1px solid #eee;">${env?.ua || 'Unknown'}</td></tr>
                        <tr><td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Platform:</strong></td><td style="padding: 8px 0; border-bottom: 1px solid #eee;">${env?.platform || 'Unknown'}</td></tr>
                        <tr><td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Screen/Window:</strong></td><td style="padding: 8px 0; border-bottom: 1px solid #eee;">${env?.screen} / ${env?.window}</td></tr>
                        <tr><td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Cores/RAM:</strong></td><td style="padding: 8px 0; border-bottom: 1px solid #eee;">${env?.cores} Cores / ~${env?.mem}GB RAM</td></tr>
                        <tr><td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Touch Support:</strong></td><td style="padding: 8px 0; border-bottom: 1px solid #eee;">${env?.touch ? 'Yes (' + env.touch + ' pts)' : 'No'}</td></tr>
                        <tr><td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Referrer:</strong></td><td style="padding: 8px 0; border-bottom: 1px solid #eee;">${env?.ref}</td></tr>
                        <tr><td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Local Time:</strong></td><td style="padding: 8px 0; border-bottom: 1px solid #eee;">${env?.time}</td></tr>
                        <tr><td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Timezone:</strong></td><td style="padding: 8px 0; border-bottom: 1px solid #eee;">${env?.tz}</td></tr>
                        <tr><td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Cookies/DNT:</strong></td><td style="padding: 8px 0; border-bottom: 1px solid #eee;">${env?.cookies ? 'Enabled' : 'Disabled'} / DNT: ${env?.dnt}</td></tr>
                    </table>
                </div>
            </body>
            </html>
        `;

        if (resend) {
            await resend.emails.send({
                from: 'Security Alert <onboarding@resend.dev>',
                to: ['armaanevo@proton.me'],
                subject: `Security Alert: Failed PIN Attempt on your Portfolio`,
                html: htmlAlert
            });
        } else {
            console.warn('Skipping security alert email: RESEND_API_KEY not set.');
        }
    } catch (err) {
        console.error('Failed to send security alert:', err);
    }

    return res.status(401).json({ success: false, message: 'Invalid PIN' });
};
