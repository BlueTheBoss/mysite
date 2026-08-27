const {
    isAuthenticated,
    getSessionToken,
    clearSessionCookieHeader
} = require('./_lib/security');

// GET  /api/session        → { authenticated: true|false }
// GET  /api/session?logout → clears the session cookie
module.exports = (req, res) => {
    if (!process.env.SECRET_PIN) {
        return res.status(500).json({ error: 'Server misconfiguration' });
    }

    if ('logout' in req.query) {
        res.setHeader('Set-Cookie', clearSessionCookieHeader(req));
        return res.status(200).json({ authenticated: false });
    }

    res.status(200).json({ authenticated: isAuthenticated(req) });
};
