import type { APIRoute } from 'astro';
import { isAuthenticated, clearSessionCookieHeader } from '../../lib/security';
import { jsonResponse } from '../../lib/http';

export const prerender = false;

// GET  /api/session        → { authenticated: true|false }
// GET  /api/session?logout → clears the session cookie
export const GET: APIRoute = ({ request }) => {
    if (!process.env.SECRET_PIN) {
        return jsonResponse({ error: 'Server misconfiguration' }, 500);
    }

    if (new URL(request.url).searchParams.has('logout')) {
        return jsonResponse({ authenticated: false }, 200, {
            'Set-Cookie': clearSessionCookieHeader(request.headers),
        });
    }

    return jsonResponse({ authenticated: isAuthenticated(request.headers) });
};
