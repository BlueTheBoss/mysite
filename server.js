require('dotenv').config();
const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(__dirname, { extensions: ['html'] }));

// API Routes
const musicHandler = require('./api/music');
app.get('/api/music', musicHandler);

const verifyHandler = require('./api/verify');
app.post('/api/verify', verifyHandler);

const sendHandler = require('./api/send');
app.post('/api/send', sendHandler);

app.listen(PORT, () => {
    console.log(`\n--- VibePlayer Server Running ---`);
    console.log(`URL: http://localhost:${PORT}/music.html`);
    console.log(`Press Ctrl+C to stop\n`);
});
