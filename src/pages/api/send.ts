import type { APIRoute } from 'astro';
import 'dotenv/config';
import { Resend } from 'resend';
import { createRateLimiter, getClientIp, escapeHtml } from '../../lib/security';
import { jsonResponse, readJson } from '../../lib/http';
import { writeVaultJson, OPS_CONTACT_DIR, slugify } from '../../lib/vault';

export const prerender = false;

// Best-effort ops log: one small JSON per submission under ops/contact/.
// Never blocks or fails the contact response — email delivery is the
// primary path, this is the audit trail.
function logContact(entry: Record<string, unknown>): void {
    const ts = new Date();
    const stamp = ts.toISOString().replace(/[:.]/g, '-');
    const who = slugify(String(entry.name || 'unknown'), 40) || 'unknown';
    writeVaultJson(`${OPS_CONTACT_DIR}/${stamp}-${who}.json`, entry)
        .catch(err => console.warn('Contact ops-log failed:', err.message));
}

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// Contact form is a spam magnet: strict per-IP limit
const sendLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 5
});

const LIMITS = { name: 100, email: 254, message: 5000 };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const POST: APIRoute = async ({ request, clientAddress }) => {
    const body = await readJson(request);
    if (!body) {
        return jsonResponse({ error: 'Invalid request' }, 400);
    }

    const { name, email, message, website } = body;

    const ip = getClientIp(request.headers, clientAddress);
    const rl = sendLimiter.check(ip);
    if (!rl.allowed) {
        return jsonResponse({ error: 'Too many messages. Try again later.', retryAfter: rl.retryAfterSecs }, 429);
    }

    // Honeypot: hidden field humans never fill. Bots get a fake success.
    if (website) {
        logContact({ ts: new Date().toISOString(), name: tName, email: tEmail, message: tMessage, honeypot: true, ip });
        return jsonResponse({ success: true });
    }

    // Validate & clamp
    const tName = typeof name === 'string' ? name.trim().slice(0, LIMITS.name) : '';
    const tEmail = typeof email === 'string' ? email.trim().slice(0, LIMITS.email) : '';
    const tMessage = typeof message === 'string' ? message.trim().slice(0, LIMITS.message) : '';

    if (!tName || !tEmail || !tMessage) {
        return jsonResponse({ error: 'Missing required fields' }, 400);
    }
    if (!EMAIL_RE.test(tEmail)) {
        return jsonResponse({ error: 'Invalid email address' }, 400);
    }

    logContact({ ts: new Date().toISOString(), name: tName, email: tEmail, message: tMessage, honeypot: false, ip });

    try {
        // Escape everything — email fields are attacker-controlled input
        const esc = escapeHtml;
        const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: 'Courier New', monospace; background-color: #F4F9FF; padding: 40px; margin: 0; }
                    .container { max-width: 600px; margin: auto; background-color: #FFFFFF; border: 2px solid #0D1824; padding: 0; }
                    .header { background-color: #0D1824; color: #FFFFFF; padding: 25px; border-bottom: 4px solid #3A6E9E; }
                    .header h2 { margin: 0; font-size: 20px; letter-spacing: 2px; text-transform: uppercase; }
                    .content { padding: 30px; }
                    .field { margin-bottom: 20px; }
                    .label { font-weight: 800; text-transform: uppercase; font-size: 12px; color: #5B8DB8; display: block; margin-bottom: 5px; }
                    .value { font-size: 16px; color: #0D1824; font-weight: 500; }
                    .message-box { background-color: #EBF2F9; border: 2px solid #3A6E9E; padding: 20px; margin-top: 10px; font-style: italic; white-space: pre-wrap; }
                    .footer { padding: 20px; text-align: center; font-size: 12px; color: #4A6B8A; border-top: 1px dashed #3A6E9E; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h2>✦ New Transmission</h2>
                    </div>
                    <div class="content">
                        <div class="field">
                            <span class="label">Sender Name</span>
                            <span class="value">${esc(tName)}</span>
                        </div>
                        <div class="field">
                            <span class="label">Email Address</span>
                            <span class="value">${esc(tEmail)}</span>
                        </div>
                        <div class="field">
                            <span class="label">The Message</span>
                            <div class="message-box">
                                "${esc(tMessage)}"
                            </div>
                        </div>
                    </div>
                    <div class="footer">
                        Sent from your Midnight Fog Portfolio • armevox.vercel.app
                    </div>
                </div>
            </body>
            </html>
        `;

        if (resend) {
            const data = await resend.emails.send({
                from: 'Portfolio Contact <onboarding@resend.dev>',
                to: ['armaanevo@proton.me'], // Sending to user's email
                subject: `✦ Message from ${tName}`,
                reply_to: tEmail,
                text: `Name: ${tName}\nEmail: ${tEmail}\n\nMessage:\n${tMessage}`,
                html: htmlContent
            });

            return jsonResponse({ success: true, data });
        } else {
            console.warn('Skipping email send: RESEND_API_KEY not set.');
            console.log(`[contact] Name: ${tName} | Email: ${tEmail}\n${tMessage}`);
            return jsonResponse({ success: true, message: 'Message logged to console (No API key)' });
        }
    } catch (error) {
        console.error('Resend API Error:', error);
        return jsonResponse({ success: false, error: 'Failed to send email' }, 500);
    }
};
