# armevox | Personal Portfolio ✦

A stunning, **"Midnight Fog"** neubrutalist personal portfolio for Armaan Ahmad Ansari (@armevox). Built with a focus on bold typography, heavy borders, and a sophisticated cool-blue and deep-midnight palette.

> ⚠️ **Note:** This site was 100% **vibecoded** late at night. It features a professional-grade music suite, a private PIN-gated vault, and a "digital fingerprinting" security system. 💻🎧

## ✦ Key Features

- **Midnight Fog Design System**: A meticulously tuned palette of Pale Fog (`#F2F6FB`), Slate Blue (`#3A6E9E`), and Deep Midnight (`#0D1824`) that feels modern, cool, and highly readable.
- **Astro-powered**: Static-first pages with server-rendered API endpoints; the private `/vault` section is gated server-side and never rendered for unauthenticated visitors.
- **Dynamic Time-Awareness**: The site automatically adapts its theme to your local time—defaulting to **Dark Mode** between 7 PM and 7 AM for a comfortable late-night viewing experience.
- **VibePlayer (Music Suite)**: 
    - **System Integration**: Full **Media Session API** support—control playback and view metadata directly from your OS media overlay and hardware keys.
    - **Reactive Equalizer**: Small playlist indicators are linked directly to the **Web Audio API**, vibrating in real-time to the music's frequencies.
    - **Persistent "Remember Me"**: Authenticate once and stay logged in for **30 days** via secure HttpOnly session cookies.
    - **Military-Grade Metadata**: Robust Dropbox scanning engine that bypasses large artwork and extracts secondary "Contributing Artist" data with 100% reliability.
- **The Vault (PIN-gated private area)**: 
    - **Dashboard**: Session status, expiry, and quick links — server-rendered, `noindex`, `no-store`.
    - **Notes**: Private markdown journal stored in Dropbox, rendered server-side.
    - **Ops Panel**: Contact-form submissions log and visit counters.
    - **Files**: Private file vault with chunked uploads and short-lived download links.
- **Security & Monitoring**: 
    - **Forensic Fingerprinting**: Failed PIN attempts trigger an automatic email alert containing a detailed "digital fingerprint" (User Agent, Screen Res, RAM, CPU Cores, and Referrer).
    - **PIN Protection**: A hidden, secure entry point on the homepage with a full keyboard-reactive number pad; constant-time comparison and per-IP rate limiting.
- **Pretty URLs**: Clean, professional extensionless paths (e.g., `/music` and `/`) for a modern browsing feel.
- **Micro-Interactions**: Features a custom Javascript tracking cursor, sketching-styled CSS scrollbars, and cinematic "fade-in" smoothing in the visualizer.

## ✦ Tech Stack

- **Framework**: Astro (static pages + SSR endpoints on Vercel)
- **Frontend**: Vanilla CSS (Neubrutalism), Vanilla JS
- **Audio Engine**: Web Audio API (Live Frequency Analysis)
- **OS Integration**: Media Session API (Native OS Level Controls)
- **Backend**: Astro API endpoints (Node runtime)
- **Cloud Storage**: Dropbox API (Secure Music Streaming + Vault storage)
- **Email Service**: [Resend](https://resend.com) (Forensic Alerts & Contact Form)

## ✦ Getting Started

### 1. Requirements
Ensure you have [Node.js](https://nodejs.org/) v20+ installed.

### 2. Environment Setup
Create a `.env` file in the root directory (see `.env.example`):
```env
SECRET_PIN=your_4_digit_pin
SESSION_SECRET=your_random_64_char_secret   # signs session cookies; never reuse the PIN

DROPBOX_APP_KEY=your_app_key
DROPBOX_APP_SECRET=your_app_secret
DROPBOX_REFRESH_TOKEN=your_refresh_token
DROPBOX_MUSIC_PATH=/Music          # optional, defaults to /Music
DROPBOX_VAULT_PATH=/VibeVault      # optional, defaults to /VibeVault

RESEND_API_KEY=your_key            # optional; contact form logs to console without it
```

### 3. Running Locally
1. Install dependencies: `npm install`
2. Start the dev server: `npm run dev`
3. Visit: `http://localhost:4321`

## ✦ Let's Connect

- **GitHub**: [@armevox](https://github.com/armevox)
- **Instagram**: [@armevox](https://instagram.com/armevox)
- **Telegram**: [@armevox](https://t.me/armevox)

---
*Vibecoded with ✦ by Armaan Ahmad Ansari*
