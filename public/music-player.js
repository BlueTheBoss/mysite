document.addEventListener('DOMContentLoaded', async () => {

    // ---- Security Check (HttpOnly session cookie, verified server-side) ----
    try {
        const sessionResp = await fetch('/api/session');
        const { authenticated } = await sessionResp.json();
        if (!authenticated) {
            window.location.href = '/'; // Go to homepage/PIN entry
            return;
        }
    } catch {
        window.location.href = '/';
        return;
    }

    // ---- XSS guard for metadata coming back from the API ----
    const escapeHtml = (s) => String(s ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    // ---- Elements ----
    const audio         = document.getElementById('audio-player');
    const playPauseBtn  = document.getElementById('play-pause-btn');
    const playIcon      = document.getElementById('play-icon');
    const pauseIcon     = document.getElementById('pause-icon');
    const prevBtn       = document.getElementById('prev-btn');
    const nextBtn       = document.getElementById('next-btn');
    const shuffleBtn    = document.getElementById('shuffle-btn');
    const repeatBtn     = document.getElementById('repeat-btn');
    const repeatIcon    = document.getElementById('repeat-icon');
    const repeatOneIcon = document.getElementById('repeat-one-icon');
    const progressTrack = document.getElementById('progress-track');
    const progressFill  = document.getElementById('progress-fill');
    const progressThumb = document.getElementById('progress-thumb');
    const volumeSlider  = document.getElementById('volume-slider');
    const volumeLabel   = document.getElementById('volume-label');
    const currentTimeEl = document.getElementById('current-time');
    const durationEl    = document.getElementById('duration');
    const trackTitle    = document.getElementById('track-title');
    const trackArtist   = document.getElementById('track-artist');
    const playlistEl    = document.getElementById('playlist');
    const plCount       = document.getElementById('playlist-count');
    const pageEl        = document.querySelector('.vibe-page');
    const bars          = document.querySelectorAll('.v-bar');

    // ---- Tracks ----
    let tracks = [];
    let idx     = 0;
    let playing = false;
    let seeking = false;
    let shuffle = false;
    let repeat  = 0; // 0: off, 1: playlist, 2: track
    const durs  = {};
    const prefetched = new Set(); // track indexes whose next-stream was warmed

    // =============================================
    // INITIAL LOAD FROM DROPBOX API
    // =============================================
    const fetchTracks = async (forceRefresh = false) => {
        trackTitle.textContent = "Authenticating...";
        trackArtist.textContent = "Checking secure session...";

        try {
            const resp = await fetch(`/api/music${forceRefresh ? '?refresh=true' : ''}`);

            if (resp.status === 401) {
                // Invalid or expired session (PIN likely changed server-side)
                window.location.href = '/';
                return;
            }

            if (!resp.ok) throw new Error('API Error');
            tracks = await resp.json();
            tracks.forEach((t, i) => {
                durs[i] = t.duration || 0;
            });
            
            if (tracks.length === 0) {
                trackTitle.textContent = "No tracks found";
                trackArtist.textContent = "Check your Dropbox folder";
                return;
            }

            // Init player with fetched tracks
            buildPlaylist();
            load(0);

            // BACKGROUND PROBE: Get all track durations at once if they are missing
            tracks.forEach((t, i) => {
                if (!durs[i]) {
                    const probe = new Audio();
                    probe.preload = "metadata";
                    probe.addEventListener('loadedmetadata', () => {
                        durs[i] = probe.duration;
                        const el = document.getElementById(`pl-dur-${i}`);
                        if (el) el.textContent = fmt(probe.duration);
                        updatePlaylistHeader();
                        probe.src = ""; // Clean up memory
                        probe.load();
                    });
                    probe.src = t.src;
                }
            });
        } catch (err) {
            console.error(err);
            trackTitle.textContent = "Load Failed";
            trackArtist.textContent = "Check .env configuration";
        }
    };

    // =============================================
    // REAL-TIME AUDIO VISUALIZER (Web Audio API)
    // =============================================
    const BAR_COUNT = bars.length;
    const MAX_H     = 50;
    const STEP      = 10; // Significantly reduced vertical resolution (fewer steps)
    
    let audioCtx    = null;
    let analyser    = null;
    let source      = null;
    let dataArray   = null;
    let visualRafId = null;

    // Enable CORS for real-time analysis (Required for Dropbox/External streams)
    audio.crossOrigin = "anonymous";

    const initAudioContext = () => {
        if (audioCtx) return;
        
        try {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            analyser = audioCtx.createAnalyser();
            analyser.fftSize = 64; // Low FFT for 12-24 bars
            
            source = audioCtx.createMediaElementSource(audio);
            source.connect(analyser);
            analyser.connect(audioCtx.destination);
            
            const bufferLength = analyser.frequencyBinCount;
            dataArray = new Uint8Array(bufferLength);
        } catch (e) {
            console.error("AudioContext initialization failed:", e);
        }
    };

    const drawBars = () => {
        visualRafId = requestAnimationFrame(drawBars);
        
        if (!analyser || !dataArray) return;
        
        analyser.getByteFrequencyData(dataArray);

        bars.forEach((bar, i) => {
            // Map freq index to dataArray (skipping some high-frequency noise)
            const dataIdx = Math.floor(i * (dataArray.length * 0.8) / BAR_COUNT);
            const value   = dataArray[dataIdx] || 0;
            
            // Convert byte 0-255 to height 3-MAX_H
            let h = (value / 255) * MAX_H;
            h = Math.max(3, Math.round(h / STEP) * STEP);
            
            bar.style.height = h + 'px';
        });

        // Match playlist mini-bars for the active song
        const activeItem = document.querySelector('.pl-item.active');
        if (activeItem) {
            const plBars = activeItem.querySelectorAll('.pb');
            plBars.forEach((pb, i) => {
                // Map to 4 bins (picking first few for more action)
                const dataIdx = Math.floor(i * (dataArray.length * 0.8) / plBars.length);
                const value   = dataArray[dataIdx] || 0;
                let h = (value / 255) * 18; // Scale to 18px max
                pb.style.height = Math.max(3, h) + 'px';
            });
        }
    };

    const startVisualizer = () => {
        initAudioContext();
        if (audioCtx && audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
        if (!visualRafId) drawBars();
    };

    const stopVisualizer = () => {
        if (visualRafId) {
            cancelAnimationFrame(visualRafId);
            visualRafId = null;
        }
        bars.forEach(b => { b.style.height = '3px'; });
        document.querySelectorAll('.pb').forEach(pb => { pb.style.height = '3px'; });
    };

    // ---- Helpers ----
    const fmt = (s) => {
        if (!s || isNaN(s)) return '0:00';
        const h   = Math.floor(s / 3600);
        const m   = Math.floor((s % 3600) / 60);
        const sec = Math.floor(s % 60);
        if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
        return `${m}:${sec.toString().padStart(2, '0')}`;
    };

    const updatePlaylistHeader = () => {
        if (!plCount) return;
        const totalSec = tracks.reduce((sum, t) => sum + (t.duration || 0), 0);
        let totalStr = '';
        if (totalSec > 0) {
            const mins = (totalSec / 60).toFixed(1);
            totalStr = ` • ${mins} min total`;
        }
        plCount.textContent = `${tracks.length} tracks${totalStr}`;
    };

    // ---- Build Playlist ----
    const buildPlaylist = () => {
        playlistEl.innerHTML = '';
        updatePlaylistHeader();

        tracks.forEach((t, i) => {
            const li = document.createElement('li');
            li.className = 'pl-item';
            if (i === idx) li.classList.add('active');
            li.innerHTML = `
                <span class="pl-num">${String(i + 1).padStart(2, '0')}</span>
                <div class="pl-meta">
                    <div class="pl-title">${escapeHtml(t.title)}</div>
                    <div class="pl-artist">${escapeHtml(t.artist)}</div>
                </div>
                <span class="pl-dur" id="pl-dur-${i}">${durs[i] ? fmt(durs[i]) : '--:--'}</span>
                <div class="pl-bars">
                    <div class="pb"></div><div class="pb"></div><div class="pb"></div><div class="pb"></div>
                </div>`;
            li.addEventListener('click', () => { load(i); play(); });
            playlistEl.appendChild(li);
        });

        attachCursorHover(document.querySelectorAll('.pl-item'));
    };

    // ---- Media Session API (OS Controls) ----
    const updateMediaSession = (index) => {
        if ('mediaSession' in navigator) {
            const track = tracks[index];
            navigator.mediaSession.metadata = new MediaMetadata({
                title: track.title,
                artist: track.artist,
                album: 'VibePlayer',
                artwork: [
                    { src: 'assets/vibeplayer-art.png', sizes: '512x512', type: 'image/png' }
                ]
            });

            // Handlers
            navigator.mediaSession.setActionHandler('play', play);
            navigator.mediaSession.setActionHandler('pause', pause);
            navigator.mediaSession.setActionHandler('previoustrack', () => prevBtn.click());
            navigator.mediaSession.setActionHandler('nexttrack', () => playNext(false));
            navigator.mediaSession.setActionHandler('seekbackward', () => { audio.currentTime = Math.max(0, audio.currentTime - 10); });
            navigator.mediaSession.setActionHandler('seekforward', () => { audio.currentTime = Math.min(audio.duration, audio.currentTime + 10); });
        }
    };

    // ---- Load ----
    const load = (i) => {
        idx = i;
        audio.src = tracks[i].src;

        trackTitle.style.opacity  = '0';
        trackArtist.style.opacity = '0';
        setTimeout(() => {
            trackTitle.textContent  = tracks[i].title;
            trackArtist.textContent = tracks[i].artist;
            trackTitle.style.opacity  = '1';
            trackArtist.style.opacity = '1';
        }, 200);

        setProgress(0);
        currentTimeEl.textContent = '0:00';
        durationEl.textContent    = durs[i] ? fmt(durs[i]) : '0:00';

        document.querySelectorAll('.pl-item').forEach((el, n) => {
            el.classList.toggle('active', n === i);
        });

        const active = playlistEl.children[i];
        if (active) active.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        
        // Sync with OS
        updateMediaSession(i);
    };

    // ---- Progress ----
    const setProgress = (pct) => {
        progressFill.style.width  = `${pct}%`;
        progressThumb.style.left  = `${pct}%`;
    };

    // ---- Play / Pause ----
    const play = () => {
        audio.play().catch(() => {});
        playing = true;
        playIcon.style.display  = 'none';
        pauseIcon.style.display = 'block';
        pageEl.classList.add('is-playing');
        startVisualizer();
    };

    const pause = () => {
        audio.pause();
        playing = false;
        playIcon.style.display  = 'block';
        pauseIcon.style.display = 'none';
        pageEl.classList.remove('is-playing');
        stopVisualizer();
    };

    playPauseBtn.addEventListener('click', () => playing ? pause() : play());

    // ---- Shuffle / Repeat Controls ----
    shuffleBtn.addEventListener('click', () => {
        shuffle = !shuffle;
        shuffleBtn.classList.toggle('active', shuffle);
    });

    repeatBtn.addEventListener('click', () => {
        repeat = (repeat + 1) % 3;
        
        // Update UI
        repeatBtn.classList.toggle('active', repeat > 0);
        if (repeat === 2) {
            repeatIcon.style.display = 'none';
            repeatOneIcon.style.display = 'block';
        } else {
            repeatIcon.style.display = 'block';
            repeatOneIcon.style.display = 'none';
        }
    });

    // ---- Next / Prev ----
    const playNext = (isAuto = false) => {
        if (isAuto && repeat === 2) {
            // Repeat Current Song
            load(idx);
            play();
            return;
        }

        let nextIdx = idx;
        if (shuffle) {
            // Pick random track that isn't the current one (if possible)
            if (tracks.length > 1) {
                while (nextIdx === idx) {
                    nextIdx = Math.floor(Math.random() * tracks.length);
                }
            }
        } else {
            nextIdx = idx + 1;
            if (nextIdx >= tracks.length) {
                if (repeat === 1) {
                    nextIdx = 0; // Repeat Playlist
                } else if (isAuto) {
                    pause(); // End of playlist, no repeat
                    return;
                } else {
                    nextIdx = 0; // Manual next always loops
                }
            }
        }
        load(nextIdx);
        play();
    };

    nextBtn.addEventListener('click', () => playNext(false));
    
    prevBtn.addEventListener('click', () => {
        if (audio.currentTime > 3) { 
            audio.currentTime = 0; 
        } else { 
            let prevIdx = idx - 1;
            if (prevIdx < 0) prevIdx = tracks.length - 1;
            load(prevIdx); 
            if (playing) play(); 
        }
    });

    audio.addEventListener('ended', () => playNext(true));

    // ---- Stream error recovery ----
    // Stream URLs are temporary (they expire after a few hours). If playback
    // dies mid-session, silently refresh the playlist once and resume.
    let recovering = false;
    audio.addEventListener('error', async () => {
        if (recovering || !tracks.length) return;
        recovering = true;
        try {
            trackArtist.textContent = 'Reconnecting to stream...';
            const oldIdx = idx;
            const wasPlaying = playing;
            await fetchTracks(true);
            if (tracks.length) {
                load(Math.min(oldIdx, tracks.length - 1));
                if (wasPlaying) play();
            }
        } finally {
            setTimeout(() => { recovering = false; }, 5000);
        }
    });

    // ---- Time sync ----
    audio.addEventListener('timeupdate', () => {
        if (seeking || !audio.duration) return;
        const pct = (audio.currentTime / audio.duration) * 100;
        setProgress(pct);
        currentTimeEl.textContent = fmt(audio.currentTime);

        // Prefetch the next track's metadata near the end of this one,
        // so hitting "next" (or auto-advance) starts instantly.
        if (pct > 75 && tracks.length > 1 && !prefetched.has(idx)) {
            prefetched.add(idx);
            const nextIdx = shuffle
                ? Math.floor(Math.random() * tracks.length)
                : (idx + 1) % tracks.length;
            if (!prefetched.has(nextIdx)) {
                prefetched.add(nextIdx);
                const probe = new Audio();
                probe.preload = 'auto';
                probe.src = tracks[nextIdx].src;
            }
        }
    });

    audio.addEventListener('loadedmetadata', () => {
        durationEl.textContent = fmt(audio.duration);
        durs[idx] = audio.duration;
        const durEl = document.getElementById(`pl-dur-${idx}`);
        if (durEl) durEl.textContent = fmt(audio.duration);
    });

    // ---- Seek ----
    const seekTo = (e) => {
        if (!audio.duration) return;
        const rect = progressTrack.getBoundingClientRect();
        const pct  = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        audio.currentTime = pct * audio.duration;
        setProgress(pct * 100);
        currentTimeEl.textContent = fmt(audio.currentTime);
    };

    progressTrack.addEventListener('mousedown', (e) => {
        seeking = true; seekTo(e);
        const onMove = (ev) => seekTo(ev);
        const onUp   = () => {
            seeking = false;
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    });

    progressTrack.addEventListener('touchstart', (e) => { seeking = true; seekTo(e.touches[0]); }, { passive: true });
    progressTrack.addEventListener('touchmove',  (e) => seekTo(e.touches[0]), { passive: true });
    progressTrack.addEventListener('touchend',   () => { seeking = false; });

    // ---- Volume ----
    audio.volume = volumeSlider.value / 100;
    volumeSlider.addEventListener('input', () => {
        audio.volume = volumeSlider.value / 100;
        if (volumeLabel) volumeLabel.textContent = `${volumeSlider.value}%`;
    });

    // ---- Custom Cursor ----
    const cursor = document.querySelector('.custom-cursor');
    if (cursor) {
        document.addEventListener('mousemove', (e) => {
            cursor.style.transform = `translate(${e.clientX}px, ${e.clientY}px) translate(-50%, -50%)`;
        });
    }

    const attachCursorHover = (els) => {
        if (!cursor) return;
        els.forEach(el => {
            el.addEventListener('mouseenter', () => cursor.classList.add('hover'));
            el.addEventListener('mouseleave', () => cursor.classList.remove('hover'));
        });
    };

    attachCursorHover(document.querySelectorAll('a, button, .progress-track, .v-slider'));

    // ---- Theme ----
    const themeToggle = document.getElementById('theme-toggle');
    const root        = document.documentElement;
    
    const getSystemDefaultTheme = () => {
        const hour = new Date().getHours();
        return (hour >= 19 || hour < 7) ? 'dark' : 'light';
    };

    const saved       = localStorage.getItem('theme');
    const systemTheme = getSystemDefaultTheme();
    const activeTheme = saved || systemTheme;

    root.setAttribute('data-theme', activeTheme);
    if (themeToggle) {
        themeToggle.textContent = activeTheme === 'dark' ? 'Light Mode' : 'Dark Mode';
    }

    // =============================================
    // FEATURE 14: CIRCULAR THEME TRANSITION (VibePlayer)
    // =============================================
    const applyThemeTransition = (btn, targetTheme) => {
        const rect = btn.getBoundingClientRect();
        const x = Math.round(rect.left + rect.width / 2);
        const y = Math.round(rect.top  + rect.height / 2);
        const newBg = targetTheme === 'dark' ? '#0D1824' : '#F2F6FB';

        const overlay = document.createElement('div');
        overlay.style.cssText = [
            'position:fixed', 'inset:0', 'z-index:99998', 'pointer-events:none',
            `background:${newBg}`,
            `clip-path:circle(0px at ${x}px ${y}px)`,
            'transition:clip-path 0.55s cubic-bezier(0.4,0,0.2,1)',
        ].join(';');
        document.body.appendChild(overlay);

        requestAnimationFrame(() => requestAnimationFrame(() => {
            overlay.style.clipPath = `circle(200vmax at ${x}px ${y}px)`;
        }));

        setTimeout(() => {
            root.setAttribute('data-theme', targetTheme);
            localStorage.setItem('theme', targetTheme);
            btn.textContent = targetTheme === 'dark' ? 'Light Mode' : 'Dark Mode';
            overlay.style.transition = 'clip-path 0.4s cubic-bezier(0.4,0,0.2,1)';
            overlay.style.clipPath = `circle(0px at ${x}px ${y}px)`;
            setTimeout(() => overlay.remove(), 420);
        }, 520);
    };

    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const newTheme = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
            applyThemeTransition(themeToggle, newTheme);
        });
    }

    // Keyboard support for Music Player
    window.addEventListener('keydown', (e) => {
        // Skip if user is in an input (unlikely on this page but good practice)
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;

        switch (e.key.toLowerCase()) {
            case ' ':
                e.preventDefault(); // Prevent scroll
                playing ? pause() : play();
                break;
            case 'arrowright':
                playNext(false);
                break;
            case 'arrowleft':
                prevBtn.click();
                break;
            case 'arrowup':
                e.preventDefault();
                volumeSlider.value = Math.min(100, parseInt(volumeSlider.value) + 5);
                volumeSlider.dispatchEvent(new Event('input'));
                break;
            case 'arrowdown':
                e.preventDefault();
                volumeSlider.value = Math.max(0, parseInt(volumeSlider.value) - 5);
                volumeSlider.dispatchEvent(new Event('input'));
                break;
            case 'm':
                audio.muted = !audio.muted;
                if (volumeLabel) volumeLabel.textContent = audio.muted ? 'Muted' : `${volumeSlider.value}%`;
                break;
            case 's':
                shuffleBtn.click();
                break;
            case 'r':
                repeatBtn.click();
                break;
            case 'escape': {
                const modal = document.getElementById('shortcuts-modal');
                if (modal) modal.classList.remove('show');
                break;
            }
        }
    });

    // =============================================
    // FEATURE 17: KEYBOARD SHORTCUTS MODAL
    // =============================================
    const shortcutsBtn   = document.getElementById('shortcuts-btn');
    const shortcutsModal = document.getElementById('shortcuts-modal');
    const shortcutsClose = document.getElementById('shortcuts-close');

    if (shortcutsBtn && shortcutsModal) {
        shortcutsBtn.addEventListener('click', () => shortcutsModal.classList.add('show'));
        shortcutsClose?.addEventListener('click', () => shortcutsModal.classList.remove('show'));
        shortcutsModal.addEventListener('click', e => {
            if (e.target === shortcutsModal) shortcutsModal.classList.remove('show');
        });
    }

    // ---- Init ----
    fetchTracks();
});
