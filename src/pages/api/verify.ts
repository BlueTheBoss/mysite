import type { APIRoute } from 'astro';
import 'dotenv/config';
import { Resend } from 'resend';
import {
    timingSafeEqualStr,
    generateSessionToken,
    sessionCookieHeader,
    createRateLimiter,
    getClientIp,
    escapeHtml
} from '../../lib/security';
import { jsonResponse, readJson } from '../../lib/http';

export const prerender = false;

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

const pinLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000, // 15-minute window
    max: 10                   // attempts per IP before lockout
});

export const POST: APIRoute = async ({ request, clientAddress }) => {
    const body = await readJson(request);
    if (!body) {
        return jsonResponse({ success: false, message: 'Invalid request' }, 400);
    }

    const { pin, env } = body as { pin?: unknown; env?: Record<string, unknown> };
    const serverPin = process.env.SECRET_PIN;

    // Fail loudly if PIN isn't configured — no silent fallback
    if (!serverPin) {
        console.error('SECRET_PIN is not configured!');
        return jsonResponse({ error: 'Server misconfiguration' }, 500);
    }

    // Reject malformed payloads early
    if (typeof pin !== 'string' || pin.length === 0 || pin.length > 128) {
        return jsonResponse({ success: false, message: 'Invalid request' }, 400);
    }

    const clientIp = getClientIp(request.headers, clientAddress);

    // ── Rate limit check ──
    const record = pinLimiter.check(clientIp);
    if (!record.allowed) {
        console.warn(`Rate limit exceeded for ${clientIp} — ${record.count} attempts`);
        return jsonResponse(
            { error: 'Too many attempts. Try again later.', retryAfter: record.retryAfterSecs },
            429
        );
    }

    // ── PIN verification ──
    // Constant-time compare (both sides hashed to fixed length first)
    if (timingSafeEqualStr(pin, serverPin)) {
        pinLimiter.reset(clientIp); // Clear counter on success

        const token = generateSessionToken(serverPin);
        // Token lives in an HttpOnly cookie — JavaScript can never read or exfiltrate it.
        return jsonResponse(
            { success: true, message: 'Access granted' },
            200,
            { 'Set-Cookie': sessionCookieHeader(request.headers, token) }
        );
    }

    // ── Failed attempt: slow the attacker down slightly ──
    await new Promise(r => setTimeout(r, 250 + Math.floor(Math.random() * 250)));

    // ── Send alert email (best effort, never blocks the response) ──
    try {
        if (resend) {
            const esc = escapeHtml;
            const htmlAlert = `
            <!DOCTYPE html>
            <html>
            <body style="font-family: sans-serif; background-color: #FFF0F0; padding: 40px;">
                <div style="max-width: 600px; margin: auto; background: #FFFFFF; border: 2px solid #C62828; padding: 0;">
                    <div style="background: #C62828; color: #FFFFFF; padding: 20px;">
                        <h2 style="margin: 0; font-size: 18px; letter-spacing: 1px;">⚠ SECURITY ALERT</h2>
                    </div>

                    <div style="background: #F8D7DA; padding: 15px; border: 1px solid #712B13; margin-bottom: 20px;">
                        <strong style="display: block; font-size: 12px; color: #712B13; text-transform: uppercase;">
                            Attempt ${record.count} of 10 before lockout
                        </strong>
                        <span style="font-size: 14px; color: #712B13;">
                            ${10 - record.count} attempt(s) remaining before IP is blocked for 15 minutes.
                        </span>
                    </div>

                    <table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #555;">
                        <tr><td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>IP Address:</strong></td><td style="padding: 8px 0; border-bottom: 1px solid #eee;">${esc(clientIp)}</td></tr>
                        <tr><td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Device (UA):</strong></td><td style="padding: 8px 0; border-bottom: 1px solid #eee;">${esc(env?.ua)}</td></tr>
                        <tr><td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Platform:</strong></td><td style="padding: 8px 0; border-bottom: 1px solid #eee;">${esc(env?.platform)}</td></tr>
                        <tr><td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Screen/Window:</strong></td><td style="padding: 8px 0; border-bottom: 1px solid #eee;">${esc(env?.screen)} / ${esc(env?.window)}</td></tr>
                        <tr><td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Cores/RAM:</strong></td><td style="padding: 8px 0; border-bottom: 1px solid #eee;">${esc(env?.cores)} Cores / ~${esc(env?.mem)}GB RAM</td></tr>
                        <tr><td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Touch Support:</strong></td><td style="padding: 8px 0; border-bottom: 1px solid #eee;">${env?.touch ? 'Yes (' + esc(env.touch) + ' pts)' : 'No'}</td></tr>
                        <tr><td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Referrer:</strong></td><td style="padding: 8px 0; border-bottom: 1px solid #eee;">${esc(env?.ref)}</td></tr>
                        <tr><td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Local Time:</strong></td><td style="padding: 8px 0; border-bottom: 1px solid #eee;">${esc(env?.time)}</td></tr>
                        <tr><td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Timezone:</strong></td><td style="padding: 8px 0; border-bottom: 1px solid #eee;">${esc(env?.tz)}</td></tr>
                        <tr><td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Cookies/DNT:</strong></td><td style="padding: 8px 0; border-bottom: 1px solid #eee;">${env?.cookies ? 'Enabled' : 'Disabled'} / DNT: ${esc(env?.dnt)}</td></tr>
                    </table>
                </div>
            </body>
            </html>
        `;

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

    return jsonResponse({ success: false, message: 'Invalid PIN' }, 401);
};
