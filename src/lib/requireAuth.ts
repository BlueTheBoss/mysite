import 'dotenv/config';
import { getSessionToken, verifySessionToken } from './security';

export interface VaultAuth {
    /** Verified session token (also safe to re-use for expiry display) */
    token: string;
    /** Absolute epoch ms when the session expires */
    expiresAt: number;
}

// Returns auth info when the request carries a valid session cookie,
// null otherwise. Vault pages use this to short-circuit rendering:
// unauthenticated visitors get a redirect before any private content
// is ever built.
export function requireVaultAuth(request: Request): VaultAuth | null {
    const pin = process.env.SECRET_PIN;
    if (!pin) return null;

    const token = getSessionToken(request.headers);
    if (!token || !verifySessionToken(token, pin)) return null;

    const expiry = Number(token.slice(0, token.indexOf('.')));
    if (!Number.isFinite(expiry)) return null;

    return { token, expiresAt: expiry };
}
