const { Resend } = require('resend');
const { createRateLimiter, getClientIp, escapeHtml } = require('./_lib/security');

const resend = (process.env.RESEND_API_KEY) ? new Resend(process.env.RESEND_API_KEY) : null;

// Contact form is a spam magnet: strict per-IP limit
const sendLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 5
});

const LIMITS = { name: 100, email: 254, message: 5000 };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const ip = getClientIp(req);
    const rl = sendLimiter.check(ip);
    if (!rl.allowed) {
        return res.status(429).json({ error: 'Too many messages. Try again later.', retryAfter: rl.retryAfterSecs });
    }

    const { name, email, message, website } = req.body || {};

    // Honeypot: hidden field humans never fill. Bots get a fake success.
    if (website) {
        return res.status(200).json({ success: true });
    }

    // Validate & clamp
    const tName = typeof name === 'string' ? name.trim().slice(0, LIMITS.name) : '';
    const tEmail = typeof email === 'string' ? email.trim().slice(0, LIMITS.email) : '';
    const tMessage = typeof message === 'string' ? message.trim().slice(0, LIMITS.message) : '';

    if (!tName || !tEmail || !tMessage) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    if (!EMAIL_RE.test(tEmail)) {
        return res.status(400).json({ error: 'Invalid email address' });
    }

    try {
        // Escape everything — email fields are attacker-controlled input
        const esc = escapeHtml;
        const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #F2F6FB; margin: 0; padding: 40px; }
                    .container { max-width: 600px; margin: 0 auto; background-color: #FFFFFF; border: 3px solid #0D1824; box-shadow: 8px 8px 0px #0D1824; }
                    .header { background-color: #0D1824; color: #E8F2FA; padding: 20px; text-align: center; border-bottom: 3px solid #0D1824; }
                    .header h1 { margin: 0; font-size: 20px; text-transform: uppercase; letter-spacing: 2px; }
                    .content { padding: 30px; color: #1E2E40; line-height: 1.6; }
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
                        <h1>Message in a Bottle ✦</h1>
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

            res.status(200).json({ success: true, data });
        } else {
            console.warn('Skipping email send: RESEND_API_KEY not set.');
            console.log(`[contact] Name: ${tName} | Email: ${tEmail}\n${tMessage}`);
            res.status(200).json({ success: true, message: 'Message logged to console (No API key)' });
        }
    } catch (error) {
        console.error('Resend API Error:', error);
        res.status(500).json({ success: false, error: 'Failed to send email' });
    }
};
