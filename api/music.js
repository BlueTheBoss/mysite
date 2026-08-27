const { Dropbox } = require('dropbox');
const mm = require('music-metadata');
const { isAuthenticated } = require('./_lib/security');

// Initialize Dropbox client
const config = {};

// Helper to safely trim env vars
const cleanEnv = (val) => val ? val.trim() : '';

const REFRESH_TOKEN = cleanEnv(process.env.DROPBOX_REFRESH_TOKEN);
const APP_KEY       = cleanEnv(process.env.DROPBOX_APP_KEY);
const APP_SECRET    = cleanEnv(process.env.DROPBOX_APP_SECRET);
const ACCESS_TOKEN  = cleanEnv(process.env.DROPBOX_ACCESS_TOKEN);

// Prioritize Refresh Token flow (recommended)
if (REFRESH_TOKEN && APP_KEY && APP_SECRET) {
    config.clientId     = APP_KEY;
    config.clientSecret = APP_SECRET;
    config.refreshToken = REFRESH_TOKEN;
} else if (ACCESS_TOKEN) {
    config.accessToken = ACCESS_TOKEN;
}

const dbx = new Dropbox(config);

let MUSIC_PATH = cleanEnv(process.env.DROPBOX_MUSIC_PATH) || '/Music';
if (MUSIC_PATH && !MUSIC_PATH.startsWith('/')) {
    MUSIC_PATH = '/' + MUSIC_PATH;
}
if (MUSIC_PATH === '/') {
    MUSIC_PATH = '';
}

// Simple in-memory cache
let cachedTracks = null;
let cacheTime    = null;
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

// Cap parallel Dropbox/metadata work so a big folder can't hammer the API
const SCAN_CONCURRENCY = 5;

// ── Library scan (de-duplicated) ───────────────────────────────────────────────
// Concurrent callers share one in-flight scan instead of stampeding Dropbox.
let scanPromise = null;

function startScan() {
    if (!scanPromise) {
        console.log(`Scanning Dropbox: ${MUSIC_PATH}`);
        scanPromise = performScan().finally(() => { scanPromise = null; });
    }
    return scanPromise;
}

async function performScan() {
    // 1. List files in the target folder
    const response = await dbx.filesListFolder({ path: MUSIC_PATH });
    const audioFiles = response.result.entries.filter(entry => {
        if (entry['.tag'] !== 'file') return false;
        const ext = entry.name.toLowerCase().split('.').pop();
        return ['mp3', 'wav', 'ogg', 'm4a', 'flac'].includes(ext);
    });

    // 2. Process files with bounded concurrency
    // Each file gets ONE temporary link (valid ~4h, unguessable, no public
    // shared link is ever created) used for both metadata scanning and playback.
    const results = new Array(audioFiles.length).fill(null);
    let cursor = 0;

    const worker = async () => {
        while (cursor < audioFiles.length) {
            const i = cursor++;
            results[i] = await processFile(audioFiles[i]).catch(err => {
                console.error(`Error processing ${audioFiles[i].name}:`, err.message);
                return null;
            });
        }
    };
    await Promise.all(
        Array.from({ length: Math.min(SCAN_CONCURRENCY, audioFiles.length) }, worker)
    );

    const tracks = results.filter(t => t !== null);

    // Update cache
    cachedTracks = tracks;
    cacheTime    = Date.now();

    return tracks;
}

module.exports = async (req, res) => {
    try {
        // 0. Security Check — HttpOnly session cookie (set by /api/verify)
        if (!isAuthenticated(req)) {
            console.warn(`Unauthorized music API access attempt`);
            return res.status(401).json({ error: 'Unauthorized' });
        }

        // 1. Check Credentials
        if (!REFRESH_TOKEN || !APP_KEY || !APP_SECRET) {
            console.error('Missing Dropbox credentials in .env');
            return res.status(500).json({
                error: 'Missing .env configuration',
                details: 'Check DROPBOX_APP_KEY, DROPBOX_APP_SECRET, and DROPBOX_REFRESH_TOKEN'
            });
        }

        // 2. Cache strategy (unless ?nocache=true or ?refresh=true is passed)
        const forceRefresh = req.query.nocache === 'true' || req.query.refresh === 'true';
        if (!forceRefresh && cachedTracks) {
            const age = Date.now() - cacheTime;

            if (age < CACHE_DURATION) {
                // Fresh — serve instantly, zero Dropbox calls
                return res.status(200).json(cachedTracks);
            }

            // Stale-while-revalidate — serve the old list right now and
            // refresh in the background so the next request is warm.
            res.status(200).json(cachedTracks);
            startScan().catch(err => console.warn('Background refresh failed:', err.message));
            return;
        }

        // 3. Cold cache or forced refresh — full scan
        const tracks = await startScan();
        res.status(200).json(tracks);

    } catch (error) {
        console.error('Dropbox API Error:', error);

        // Stale cache fallback
        if (cachedTracks) return res.status(200).json(cachedTracks);

        res.status(500).json({ error: 'Failed to fetch music from Dropbox' });
    }
};

async function processFile(file) {
    let artist = '';
    let title = file.name.replace(/\.[^/.]+$/, '');
    let directSrc = null;

    try {
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
            artist = metadata.common.artist ||
                     (metadata.common.artists && metadata.common.artists.join(', ')) ||
                     metadata.common.albumartist ||
                     metadata.common.composer ||
                     '';
            if (metadata.common.title) title = metadata.common.title;
            const duration = metadata.format.duration || 0;

            return { title, artist, duration, src: directSrc };
        }
    } catch (metaErr) {
        console.warn(`Direct-scan failed for ${file.name}: ${metaErr.message}`);
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
