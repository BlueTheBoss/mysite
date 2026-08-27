import 'dotenv/config';
import { Dropbox } from 'dropbox';

// Shared Dropbox client (refresh-token flow with automatic token refresh).
// Used by the music endpoint and the /vault storage layer.
const cleanEnv = (val: string | undefined): string => (val ? val.trim() : '');

const REFRESH_TOKEN = cleanEnv(process.env.DROPBOX_REFRESH_TOKEN);
const APP_KEY = cleanEnv(process.env.DROPBOX_APP_KEY);
const APP_SECRET = cleanEnv(process.env.DROPBOX_APP_SECRET);
const ACCESS_TOKEN = cleanEnv(process.env.DROPBOX_ACCESS_TOKEN);

export function hasDropboxCredentials(): boolean {
    return Boolean((REFRESH_TOKEN && APP_KEY && APP_SECRET) || ACCESS_TOKEN);
}

let dbx: Dropbox | null = null;

export function getDbx(): Dropbox {
    if (dbx) return dbx;
    if (REFRESH_TOKEN && APP_KEY && APP_SECRET) {
        dbx = new Dropbox({ clientId: APP_KEY, clientSecret: APP_SECRET, refreshToken: REFRESH_TOKEN });
    } else if (ACCESS_TOKEN) {
        dbx = new Dropbox({ accessToken: ACCESS_TOKEN });
    } else {
        throw new Error('Missing Dropbox credentials: set DROPBOX_REFRESH_TOKEN, DROPBOX_APP_KEY, DROPBOX_APP_SECRET (or DROPBOX_ACCESS_TOKEN)');
    }
    return dbx;
}
