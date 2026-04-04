const { Dropbox } = require('dropbox');
const mm = require('music-metadata');

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
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

module.exports = async (req, res) => {
    try {
        // 0. Security Check
        const clientPin = req.headers['x-pin'];
        const serverPin = process.env.SECRET_PIN;
        
        if (!serverPin || clientPin !== serverPin) {
            console.warn(`Unauthorized music API access attempt from ${req.ip}`);
            return res.status(401).json({ error: 'Unauthorized', details: 'A valid PIN is required.' });
        }

        // 1. Check Credentials
        if (!REFRESH_TOKEN || !APP_KEY || !APP_SECRET) {
            console.error('Missing Dropbox credentials in .env');
            return res.status(500).json({ 
                error: 'Missing .env configuration', 
                details: 'Check DROPBOX_APP_KEY, DROPBOX_APP_SECRET, and DROPBOX_REFRESH_TOKEN' 
            });
        }

        // 2. Return cache if valid (unless ?nocache=true or ?refresh=true is passed)
        const forceRefresh = req.query.nocache === 'true' || req.query.refresh === 'true';
        if (!forceRefresh && cachedTracks && cacheTime && (Date.now() - cacheTime) < CACHE_DURATION) {
            return res.status(200).json(cachedTracks);
        }

        console.log(`Scanning Dropbox: ${MUSIC_PATH}`);

        // 3. List files in the target folder
        const response = await dbx.filesListFolder({ path: MUSIC_PATH });
        const audioFiles = response.result.entries.filter(entry => {
            if (entry['.tag'] !== 'file') return false;
            const ext = entry.name.toLowerCase().split('.').pop();
            return ['mp3', 'wav', 'ogg', 'm4a'].includes(ext);
        });

        // Process files in parallel
        const trackPromises = audioFiles.map(async (file) => {
            try {
                let sharedLink = null;
                let artist = '';
                let title = file.name.replace(/\.[^/.]+$/, '');
                
                // 1. Get existing link or create new one
                try {
                    const links = await dbx.sharingListSharedLinks({ path: file.path_lower, direct_only: true });
                    if (links.result.links && links.result.links.length > 0) {
                        sharedLink = links.result.links[0].url;
                    }
                } catch (e) {}

                if (!sharedLink) {
                    const linkResp = await dbx.sharingCreateSharedLinkWithSettings({
                        path: file.path_lower,
                        settings: { requested_visibility: 'public' }
                    });
                    sharedLink = linkResp.result.url;
                }

                // 2. Extract Metadata (Gaining direct access via TemporaryLink to support Range)
                try {
                    const tempLinkResp = await dbx.filesGetTemporaryLink({ path: file.path_lower });
                    const tempUrl = tempLinkResp.result.link;

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
                        
                        // 3. Convert to direct stream link
                        const directSrc = sharedLink
                            .replace('www.dropbox.com', 'dl.dropboxusercontent.com')
                            .replace('?dl=0', '');

                        return { title, artist, duration, src: directSrc };
                    }
                } catch (metaErr) {
                    console.warn(`Direct-scan failed for ${file.name}: ${metaErr.message}`);
                }

                // Fallback: If artist is still empty, try to split from filename/title
                if (!artist && title.includes(' - ')) {
                    const parts = title.split(' - ');
                    artist = parts[0].trim();
                    title = parts[1].trim();
                }

                if (!artist) artist = 'Unknown Artist';

                // 3. Convert to direct stream link
                const directSrc = sharedLink
                    .replace('www.dropbox.com', 'dl.dropboxusercontent.com')
                    .replace('?dl=0', '');

                return { title, artist, src: directSrc };
            } catch (err) {
                console.error(`Error processing ${file.name}:`, err.message);
                return null;
            }
        });

        const tracks = (await Promise.all(trackPromises)).filter(t => t !== null);

        // Update cache
        cachedTracks = tracks;
        cacheTime    = Date.now();

        res.status(200).json(tracks);

    } catch (error) {
        console.error('Dropbox API Error:', error);
        
        // Stale cache fallback
        if (cachedTracks) return res.status(200).json(cachedTracks);

        res.status(500).json({ error: 'Failed to fetch music from Dropbox' });
    }
};
