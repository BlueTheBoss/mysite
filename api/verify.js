const { Resend } = require('resend');
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { pin, env } = req.body;
    const serverPin = process.env.SECRET_PIN || '1234'; // Fallback for local dev
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    if (serverPin && pin === serverPin) {
        return res.status(200).json({ success: true, message: 'Access granted' });
    } else {
        // Log the failure to the owner via email
        try {
            const htmlAlert = `
                <!DOCTYPE html>
                <html>
                <body style="font-family: sans-serif; background-color: #FFF0F0; padding: 40px;">
                    <div style="max-width: 600px; margin: 0 auto; background: white; border: 3px solid #712B13; box-shadow: 8px 8px 0px #712B13; padding: 30px;">
                        <h1 style="color: #712B13; margin-top: 0; text-transform: uppercase;">Security Alert: Failed PIN Attempt</h1>
                        <p style="font-size: 16px; color: #333;">An incorrect passcode was entered on your site.</p>
                        
                        <div style="background: #F8D7DA; padding: 15px; border: 1px solid #712B13; margin-bottom: 20px;">
                            <strong style="display: block; font-size: 12px; color: #712B13; text-transform: uppercase;">Attempted PIN</strong>
                            <span style="font-size: 24px; font-weight: 900; color: #712B13; letter-spacing: 4px;">${pin}</span>
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
    }
};
