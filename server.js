require('dotenv').config();
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));

// Security headers (mirror of vercel.json so local dev matches production)
app.use((req, res, next) => {
    res.set({
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
        'Cross-Origin-Opener-Policy': 'same-origin'
    });
    next();
});

// Static files
app.use(express.static(__dirname, {
    extensions: ['html'],
    etag: false,
    lastModified: false,
    setHeaders(res, filePath) {
        const ext = filePath.split('.').pop().toLowerCase();
        if (['jpg', 'jpeg', 'png', 'svg', 'webp', 'avif', 'woff2'].includes(ext)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else {
            // Dev server: always serve fresh HTML/CSS/JS
            res.setHeader('Cache-Control', 'no-store');
        }
    }
}));

// API Routes
const musicHandler = require('./api/music');
app.get('/api/music', musicHandler);

const verifyHandler = require('./api/verify');
app.post('/api/verify', verifyHandler);

const sendHandler = require('./api/send');
app.post('/api/send', sendHandler);

const sessionHandler = require('./api/session');
app.get('/api/session', sessionHandler);

app.listen(PORT, () => {
    console.log(`\n--- VibePlayer Server Running ---`);
    console.log(`URL: http://localhost:${PORT}/music.html`);
    console.log(`Press Ctrl+C to stop\n`);
});
