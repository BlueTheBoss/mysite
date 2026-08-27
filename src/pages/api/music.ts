import type { APIRoute } from 'astro';
import mm from 'music-metadata';
import { getDbx, hasDropboxCredentials } from '../../lib/dropbox';
import { isAuthenticated } from '../../lib/security';
import { jsonResponse } from '../../lib/http';

export const prerender = false;

const cleanEnv = (val: string | undefined): string => (val ? val.trim() : '');

let MUSIC_PATH = cleanEnv(process.env.DROPBOX_MUSIC_PATH) || '/Music';
if (MUSIC_PATH && !MUSIC_PATH.startsWith('/')) {
    MUSIC_PATH = '/' + MUSIC_PATH;
}
if (MUSIC_PATH === '/') {
    MUSIC_PATH = '';
}

// Simple in-memory cache
let cachedTracks: any[] | null = null;
let cacheTime: number | null = null;
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

// Cap parallel Dropbox/metadata work so a big folder can't hammer the API
const SCAN_CONCURRENCY = 5;

// ── Library scan (de-duplicated) ───────────────────────────────────────────────
// Concurrent callers share one in-flight scan instead of stampeding Dropbox.
let scanPromise: Promise<any[]> | null = null;

function startScan(): Promise<any[]> {
    if (!scanPromise) {
        console.log(`Scanning Dropbox: ${MUSIC_PATH}`);
        scanPromise = performScan().finally(() => { scanPromise = null; });
    }
    return scanPromise;
}

async function performScan(): Promise<any[]> {
    const dbx = getDbx();

    // 1. List files in the target folder
    const response = await dbx.filesListFolder({ path: MUSIC_PATH });
    const audioFiles = response.result.entries.filter((entry: any) => {
        if (entry['.tag'] !== 'file') return false;
        const ext = entry.name.toLowerCase().split('.').pop();
        return ['mp3', 'wav', 'ogg', 'm4a', 'flac'].includes(ext);
    });

    // 2. Process files with bounded concurrency
    // Each file gets ONE temporary link (valid ~4h, unguessable, no public
    // shared link is ever created) used for both metadata scanning and playback.
    const results: any[] = new Array(audioFiles.length).fill(null);
    let cursor = 0;

    const worker = async () => {
        while (cursor < audioFiles.length) {
            const i = cursor++;
            results[i] = await processFile(audioFiles[i]).catch((err: Error) => {
                console.error(`Error processing ${audioFiles[i].name}:`, err.message);
                return null;
            });
        }
    };
    await Promise.all(
        Array.from({ length: Math.min(SCAN_CONCURRENCY, audioFiles.length) }, worker)
    );

    const tracks = results.filter((t) => t !== null);

    // Update cache
    cachedTracks = tracks;
    cacheTime = Date.now();

    return tracks;
}

export const GET: APIRoute = async ({ request }) => {
    try {
        // 0. Security Check — HttpOnly session cookie (set by /api/verify)
        if (!isAuthenticated(request.headers)) {
            console.warn(`Unauthorized music API access attempt`);
            return jsonResponse({ error: 'Unauthorized' }, 401);
        }

        // 1. Check Credentials
        if (!hasDropboxCredentials()) {
            console.error('Missing Dropbox credentials in .env');
            return jsonResponse({
                error: 'Missing .env configuration',
                details: 'Check DROPBOX_APP_KEY, DROPBOX_APP_SECRET, and DROPBOX_REFRESH_TOKEN'
            }, 500);
        }

        // 2. Cache strategy (unless ?nocache=true or ?refresh=true is passed)
        const forceRefresh = new URL(request.url).searchParams.get('nocache') === 'true' ||
            new URL(request.url).searchParams.get('refresh') === 'true';
        if (!forceRefresh && cachedTracks) {
            const age = Date.now() - (cacheTime || 0);

            if (age < CACHE_DURATION) {
                // Fresh — serve instantly, zero Dropbox calls
                return jsonResponse(cachedTracks);
            }

            // Stale-while-revalidate — serve the old list right now and
            // refresh in the background so the next request is warm.
            startScan().catch(err => console.warn('Background refresh failed:', (err as Error).message));
            return jsonResponse(cachedTracks);
        }

        // 3. Cold cache or forced refresh — full scan
        const tracks = await startScan();
        return jsonResponse(tracks);

    } catch (error) {
        console.error('Dropbox API Error:', error);

        // Stale cache fallback
        if (cachedTracks) return jsonResponse(cachedTracks);

        return jsonResponse({ error: 'Failed to fetch music from Dropbox' }, 500);
    }
};

async function processFile(file: any): Promise<any> {
    let artist = '';
    let title: string = file.name.replace(/\.[^/.]+$/, '');
    let directSrc: string | null = null;

    try {
        const dbx = getDbx();

        // Single temporary link per file — doubles as the stream URL and the
        // metadata source. Links auto-expire (~4h), so nothing permanent leaks.
        const tempLinkResp = await dbx.filesGetTemporaryLink({ path: file.path_lower });
        const tempUrl = tempLinkResp.result.link;
        directSrc = tempUrl;

        // Fetch exactly the first 1MB using standard HTTP headers
        const metadataResp = await fetch(tempUrl, {
            headers: { 'Range': 'bytes=0-1048575' }
        });

        if (metadataResp.ok || metadataResp.status === 206) {
            const arrayBuffer = await metadataResp.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);

            const metadata = await mm.parseBuffer(buffer);
            // Check multiple artist fields - specifically looking for 'Contributing Artist' (artists array)
            artist = (metadata.common as any).artist ||
                     ((metadata.common as any).artists && (metadata.common as any).artists.join(', ')) ||
                     (metadata.common as any).albumartist ||
                     (metadata.common as any).composer ||
                     '';
            if ((metadata.common as any).title) title = (metadata.common as any).title;
            const duration = (metadata.format as any).duration || 0;

            return { title, artist, duration, src: directSrc };
        }
    } catch (metaErr) {
        console.warn(`Direct-scan failed for ${file.name}: ${(metaErr as Error).message}`);
    }

    // Fallback: derive artist from "Artist - Title" filename pattern
    if (!artist && title.includes(' - ')) {
        const parts = title.split(' - ');
        artist = parts[0].trim();
        title = parts[1].trim();
    }

    if (!directSrc) return null; // No playable URL — skip the track entirely

    if (!artist) artist = 'Unknown Artist';
    return { title, artist, src: directSrc };
}
