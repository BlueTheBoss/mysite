// Page-view beacon for the private ops panel (public pages only).
// External file (loaded via <script src>) so the site's Content-Security-Policy
// (`script-src 'self'`, no 'unsafe-inline') actually allows it to run.
// Same-origin, fire-and-forget; silently ignored when storage is off.
try {
    fetch('/api/vault/track', {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: location.pathname }),
    }).catch(() => {});
} catch {}