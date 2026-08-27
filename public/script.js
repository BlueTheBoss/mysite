// Session state lives in an HttpOnly cookie managed by /api/verify —
// this script never touches tokens directly.

document.addEventListener('DOMContentLoaded', () => {
    console.log("Portfolio site loaded");

    // ---- Motion preferences (shared by every animation below) ----
    const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const onMotionAllowed = (fn) => { if (!REDUCED_MOTION) fn(); };

    // Auto calculate age
    const determineAge = () => {
        const birthDate = new Date('2010-04-17');
        const today = new Date();
        let currentAge = today.getFullYear() - birthDate.getFullYear();
        const m = today.getMonth() - birthDate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
            currentAge--;
        }
        const ageSpan = document.getElementById('age-span');
        if (ageSpan) {
            ageSpan.textContent = currentAge;
        }
    };
    determineAge();

    // =============================================
    // DYNAMIC NEUBRUTALISM (Direction 1)
    // =============================================

    // 1. Sortable Bento Grid
    const bentoGrid = document.querySelector('.bento-grid-system');
    if (bentoGrid && typeof Sortable !== 'undefined') {
        new Sortable(bentoGrid, {
            animation: 250,
            ghostClass: 'sortable-ghost',
            dragClass: 'sortable-drag',
            easing: "cubic-bezier(0.16, 1, 0.3, 1)",
            delay: 100, // slight delay for mobile scrolling support
            delayOnTouchOnly: true
        });
    }

    // 2. Animated SVG Wobble Filter
    const wobbleNoise = document.getElementById('wobble-noise');
    let wobbleSeed = 0;
    if (wobbleNoise && !REDUCED_MOTION) {
        // Update seed constantly to jitter the SVG displacement.
        // Skipped entirely in background tabs and for reduced-motion users.
        setInterval(() => {
            if (document.hidden) return;
            wobbleSeed += 1;
            wobbleNoise.setAttribute('seed', wobbleSeed);
        }, 120); // 120ms gives it a classic 8fps "boiling lines" animation feel
    }

    // =============================================
    // HERO UPGRADES
    // =============================================

    // --- A. Staggered Word Reveal on Hero Title ---
    (function () {
        const heroTitle = document.querySelector('.hero-title');
        if (!heroTitle) return;

        const nodes = Array.from(heroTitle.childNodes);
        heroTitle.style.cssText = 'opacity:1;transform:none;filter:none;';
        heroTitle.classList.remove('reveal');
        heroTitle.innerHTML = '';

        const items = [];
        nodes.forEach(node => {
            if (node.nodeType === Node.TEXT_NODE) {
                node.textContent.trim().split(/\s+/).filter(Boolean).forEach(w => {
                    items.push({ type: 'text', content: w });
                });
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                items.push({ type: 'element', node: node.cloneNode(true) });
            }
        });

        items.forEach((item, i) => {
            const wrap = document.createElement('span');
            wrap.className = 'word-wrap';
            const inner = document.createElement('span');
            inner.className = 'word-inner';
            if (item.type === 'text') {
                inner.textContent = item.content;
            } else {
                inner.appendChild(item.node);
            }
            wrap.appendChild(inner);
            heroTitle.appendChild(wrap);
            if (i < items.length - 1) heroTitle.appendChild(document.createTextNode('\u00a0'));
        });

        setTimeout(() => {
            heroTitle.querySelectorAll('.word-inner').forEach((el, i) => {
                setTimeout(() => el.classList.add('word-revealed'), i * 130);
            });
        }, 600);
    })();

    // --- B. Hero Particle Canvas ---
    onMotionAllowed(() => {
        const canvas = document.getElementById('hero-particles');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        let W, H;
        const particles = [];

        const DPR = Math.min(window.devicePixelRatio || 1, 2);
        const resize = () => {
            W = canvas.offsetWidth;
            H = canvas.offsetHeight;
            canvas.width  = Math.round(W * DPR);
            canvas.height = Math.round(H * DPR);
            ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
        };
        resize();
        window.addEventListener('resize', resize, { passive: true });

        // Fewer particles on small screens
        const N = window.matchMedia('(max-width: 768px)').matches ? 28 : 55;
        const mk = () => ({
            x: Math.random() * W,
            y: Math.random() * H,
            r: Math.random() * 1.5 + 0.4,
            vx: (Math.random() - 0.5) * 0.25,
            vy: -(Math.random() * 0.35 + 0.08),
            a: Math.random() * 0.45 + 0.08,
        });
        for (let i = 0; i < N; i++) particles.push(mk());

        let running = false;
        let rafId = null;

        // Pause the whole loop while the hero is scrolled out of view
        const tick = () => {
            ctx.clearRect(0, 0, W, H);
            particles.forEach(p => {
                p.x += p.vx;
                p.y += p.vy;
                if (p.y < -4 || p.x < -4 || p.x > W + 4) {
                    Object.assign(p, mk(), { y: H + 4, x: Math.random() * W });
                }
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(91,141,184,${p.a})`;
                ctx.fill();
            });
            rafId = requestAnimationFrame(tick);
        };

        new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting && !running) {
                running = true;
                rafId = requestAnimationFrame(tick);
            } else if (!entry.isIntersecting && running) {
                running = false;
                cancelAnimationFrame(rafId);
            }
        }, { threshold: 0 }).observe(canvas);
    });

    // --- C. Rotating Typing Subtitle ---
    (function () {
        const el = document.getElementById('typing-role');
        if (!el) return;
        const roles = [
            'AOSP Tinkerer',
            'Linux Daily Driver',
            'Vibecoder',
            'Audiophile',
            'Moon Admirer',
            'Potterhead',
            'Self-Host Enthusiast',
            'Cinephile',
        ];
        let ri = 0, ci = 0, deleting = false;

        const typeStep = () => {
            const word = roles[ri];
            if (!deleting) {
                el.textContent = word.slice(0, ci + 1);
                ci++;
                if (ci === word.length) { deleting = true; setTimeout(typeStep, 2200); return; }
            } else {
                el.textContent = word.slice(0, ci - 1);
                ci--;
                if (ci === 0) { deleting = false; ri = (ri + 1) % roles.length; setTimeout(typeStep, 350); return; }
            }
            setTimeout(typeStep, deleting ? 45 : 95);
        };
        setTimeout(typeStep, 2000);
    })();

    
    // Theme setup
    const themeToggle = document.getElementById('theme-toggle');
    const rootElement = document.documentElement;
    
    const getSystemDefaultTheme = () => {
        return 'dark';
    };

    const savedTheme = localStorage.getItem('theme');
    const systemTheme = getSystemDefaultTheme();
    const activeTheme = savedTheme || systemTheme;
    
    rootElement.setAttribute('data-theme', activeTheme);
    if (themeToggle) {
        themeToggle.textContent = activeTheme === 'dark' ? 'Light Mode' : 'Dark Mode';
    }

    // =============================================
    // FEATURE 14: CIRCULAR THEME TRANSITION
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

        // Double rAF ensures the browser registers the start state before transitioning
        requestAnimationFrame(() => requestAnimationFrame(() => {
            overlay.style.clipPath = `circle(200vmax at ${x}px ${y}px)`;
        }));

        setTimeout(() => {
            rootElement.setAttribute('data-theme', targetTheme);
            localStorage.setItem('theme', targetTheme);
            btn.textContent = targetTheme === 'dark' ? 'Light Mode' : 'Dark Mode';
            // Shrink back to reveal the newly-applied theme
            overlay.style.transition = 'clip-path 0.4s cubic-bezier(0.4,0,0.2,1)';
            overlay.style.clipPath = `circle(0px at ${x}px ${y}px)`;
            setTimeout(() => overlay.remove(), 420);
        }, 520);
    };

    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const newTheme = rootElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
            applyThemeTransition(themeToggle, newTheme);
        });
    }
    
    // =============================================
    // 1. PAGE LOAD CURTAIN
    // =============================================
    const loader = document.getElementById('page-loader');
    if (loader) {
        window.addEventListener('load', () => {
            setTimeout(() => loader.classList.add('hidden'), 800);
        });
        // Fallback: hide after 2.5s max
        setTimeout(() => loader.classList.add('hidden'), 2500);
    }

    // =============================================
    // 2. SCROLL PROGRESS BAR
    // =============================================
    const scrollProgress = document.getElementById('scroll-progress');
    const updateScrollProgress = () => {
        if (!scrollProgress) return;
        const scrollTop = window.scrollY;
        const docHeight = document.documentElement.scrollHeight - window.innerHeight;
        const scrollPercent = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
        scrollProgress.style.setProperty('--scroll-pct', scrollPercent + '%');
    };

    // =============================================
    // 3. NAVBAR AUTO-HIDE on scroll down / show on scroll up
    // =============================================
    const navbar = document.querySelector('.navbar');
    let lastScrollY = 0;
    let ticking = false;
    const handleNavbarScroll = () => {
        const currentScrollY = window.scrollY;
        if (navbar) {
            if (currentScrollY > lastScrollY && currentScrollY > 100) {
                navbar.classList.add('nav-hidden');
            } else {
                navbar.classList.remove('nav-hidden');
            }
        }
        lastScrollY = currentScrollY;
        ticking = false;
    };

    // =============================================
    // 4. ACTIVE NAV LINK HIGHLIGHT
    // =============================================
    const navSectionLinks = document.querySelectorAll('.spine-tab[data-section]');
    const sections = document.querySelectorAll('section[id]');
    const updateActiveNav = () => {
        let currentSection = '';
        sections.forEach(section => {
            const sectionTop = section.offsetTop - 200;
            if (window.scrollY >= sectionTop) {
                currentSection = section.getAttribute('id');
            }
        });
        navSectionLinks.forEach(link => {
            if (link.dataset.section === currentSection) {
                link.classList.add('active-section');
            } else {
                link.classList.remove('active-section');
            }
        });
    };

    // Combined scroll handler (perf: single listener)
    window.addEventListener('scroll', () => {
        updateScrollProgress();
        updateActiveNav();
        if (!ticking) {
            requestAnimationFrame(handleNavbarScroll);
            ticking = true;
        }
    }, { passive: true });

    // =============================================
    // 5. SCROLL REVEAL (with blur)
    // =============================================
    const revealElements = document.querySelectorAll('.reveal, .reveal-left, .reveal-right, .reveal-monolith');
    const revealObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('active');
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1, rootMargin: "0px 0px -50px 0px" });
    revealElements.forEach(el => revealObserver.observe(el));

    // =============================================
    // 6. HERO TEXT SLIDE-UP
    // =============================================
    const textMasks = document.querySelectorAll('.text-mask');
    if (textMasks.length) {
        setTimeout(() => {
            textMasks.forEach((mask, i) => {
                setTimeout(() => mask.classList.add('revealed'), i * 180);
            });
        }, 900); // delayed a bit more so loader finishes first
    }

    // =============================================
    // 7. TEXT SCRAMBLE on section titles
    // =============================================
    const scrambleChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*';
    const scrambleText = (el) => {
        const original = el.getAttribute('data-original');
        if (!original) return;
        const length = original.length;
        let iteration = 0;
        const maxIterations = length;
        const interval = setInterval(() => {
            el.textContent = original.split('').map((char, i) => {
                if (char === ' ' || char === '\n') return char;
                if (i < iteration) return original[i];
                return scrambleChars[Math.floor(Math.random() * scrambleChars.length)];
            }).join('');
            iteration += 1.5;
            if (iteration >= maxIterations) {
                el.textContent = original;
                clearInterval(interval);
            }
        }, 30);
    };

    document.querySelectorAll('[data-scramble]').forEach(el => {
        // Store original text (innerText preserves line breaks)
        el.setAttribute('data-original', el.innerText);
        const scrambleObserver = new IntersectionObserver((entries, obs) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    setTimeout(() => scrambleText(el), 200);
                    obs.unobserve(el);
                }
            });
        }, { threshold: 0.3 });
        scrambleObserver.observe(el);
    });

    // =============================================
    // 8. SPRING-PHYSICS CUSTOM CURSOR
    // =============================================
    const cursor = document.querySelector('.custom-cursor');
    if (cursor) {
        const trail = document.createElement('div');
        trail.classList.add('cursor-trail');
        document.body.appendChild(trail);

        let mouseX = 0, mouseY = 0;
        let cursorX = 0, cursorY = 0;
        let trailX = 0, trailY = 0;
        let rafId = null;
        let lastMoveAt = 0;

        const place = (el, x, y) => {
            el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
        };

        // Reduced motion: no springs, no loop — just follow instantly
        if (REDUCED_MOTION) {
            document.addEventListener('mousemove', (e) => place(cursor, e.clientX, e.clientY));
            trail.style.display = 'none';
        } else {
            const animateCursor = () => {
                cursorX += (mouseX - cursorX) * 0.15;
                cursorY += (mouseY - cursorY) * 0.15;
                place(cursor, cursorX, cursorY);

                trailX += (mouseX - trailX) * 0.08;
                trailY += (mouseY - trailY) * 0.08;
                place(trail, trailX, trailY);

                // Stop burning frames once the springs have settled
                const settled = (performance.now() - lastMoveAt > 250) &&
                    Math.abs(mouseX - cursorX) + Math.abs(mouseY - cursorY) < 0.5 &&
                    Math.abs(mouseX - trailX) + Math.abs(mouseY - trailY) < 0.5;
                if (settled) {
                    rafId = null;
                    return;
                }
                rafId = requestAnimationFrame(animateCursor);
            };

            document.addEventListener('mousemove', (e) => {
                mouseX = e.clientX;
                mouseY = e.clientY;
                lastMoveAt = performance.now();
                if (rafId === null) rafId = requestAnimationFrame(animateCursor);
            }, { passive: true });
        }

        const interactables = document.querySelectorAll('a, button, input, textarea, .project-card, .contact-tile, .theme-toggle-btn');
        interactables.forEach(el => {
            el.addEventListener('mouseenter', () => {
                cursor.classList.add('hover');
                trail.style.opacity = '0';
            });
            el.addEventListener('mouseleave', () => {
                cursor.classList.remove('hover');
                trail.style.opacity = '0.5';
            });
        });
    }

    // =============================================
    // 9. CLICK SPARKLE BURST
    // =============================================
    if (!REDUCED_MOTION) {
        document.addEventListener('click', (e) => {
            const count = 8 + Math.floor(Math.random() * 4);
            for (let i = 0; i < count; i++) {
                const spark = document.createElement('div');
                spark.classList.add('click-sparkle');
                const angle = (Math.PI * 2 / count) * i + (Math.random() * 0.5);
                const dist = 30 + Math.random() * 50;
                spark.style.setProperty('--tx', Math.cos(angle) * dist + 'px');
                spark.style.setProperty('--ty', Math.sin(angle) * dist + 'px');
                spark.style.left = e.clientX + 'px';
                spark.style.top = e.clientY + 'px';
                const size = (4 + Math.random() * 5) + 'px';
                spark.style.width = size;
                spark.style.height = size;
                document.body.appendChild(spark);
                spark.addEventListener('animationend', () => spark.remove());
            }
        });
    }

    // =============================================
    // 10. MAGNETIC BUTTONS + RIPPLE
    // =============================================
    const magneticBtns = document.querySelectorAll('.btn-primary');
    magneticBtns.forEach(btn => {
        btn.style.overflow = 'hidden'; // for ripple containment
        btn.addEventListener('mousemove', (e) => {
            const rect = btn.getBoundingClientRect();
            const x = e.clientX - rect.left - rect.width / 2;
            const y = e.clientY - rect.top - rect.height / 2;
            btn.style.transform = `translate(${x * 0.2}px, ${y * 0.25}px)`;
        });
        btn.addEventListener('mouseleave', () => {
            btn.style.transform = '';
        });
        // Ripple on click
        btn.addEventListener('click', (e) => {
            const ripple = document.createElement('span');
            ripple.classList.add('btn-ripple');
            const rect = btn.getBoundingClientRect();
            const size = Math.max(rect.width, rect.height);
            ripple.style.width = ripple.style.height = size + 'px';
            ripple.style.left = (e.clientX - rect.left - size / 2) + 'px';
            ripple.style.top = (e.clientY - rect.top - size / 2) + 'px';
            btn.appendChild(ripple);
            ripple.addEventListener('animationend', () => ripple.remove());
        });
    });

    // =============================================
    // 10b. 3D TILT on the profile card
    // =============================================
    (function () {
        const card = document.querySelector('.profile-img-container');
        if (!card || REDUCED_MOTION || window.matchMedia('(pointer: coarse)').matches) return;

        const MAX_DEG = 10;
        card.addEventListener('mousemove', (e) => {
            if (!card.classList.contains('active')) return; // wait for reveal
            const r = card.getBoundingClientRect();
            const px = (e.clientX - r.left) / r.width - 0.5;
            const py = (e.clientY - r.top) / r.height - 0.5;
            card.classList.add('tilting');
            card.style.transform =
                `perspective(700px) rotateX(${(-py * MAX_DEG).toFixed(2)}deg) rotateY(${(px * MAX_DEG).toFixed(2)}deg) scale(1.04)`;
        });
        card.addEventListener('mouseleave', () => {
            card.classList.remove('tilting');
            card.style.transform = '';
        });
    })();

    // =============================================
    // 10c. Marquees speed up with scroll velocity
    // =============================================
    (function () {
        if (REDUCED_MOTION) return;
        const tracks = document.querySelectorAll('.brutal-marquee-track, .marquee-content');
        if (!tracks.length) return;

        let lastY = window.scrollY;
        let lastT = performance.now();
        let rate = 1, target = 1, raf = null, decayTimer = null;

        const tick = () => {
            rate += (target - rate) * 0.08;
            tracks.forEach(t => t.getAnimations().forEach(a => {
                if (a instanceof CSSAnimation) a.playbackRate = rate;
            }));
            if (Math.abs(target - rate) > 0.02 || target !== 1) {
                raf = requestAnimationFrame(tick);
            } else {
                rate = 1;
                raf = null;
            }
        };

        window.addEventListener('scroll', () => {
            const now = performance.now();
            const velocity = Math.abs(window.scrollY - lastY) / Math.max(1, now - lastT); // px/ms
            lastY = window.scrollY;
            lastT = now;
            target = Math.min(1 + velocity * 0.6, 3.5);
            if (raf === null) raf = requestAnimationFrame(tick);
            clearTimeout(decayTimer);
            decayTimer = setTimeout(() => {
                target = 1;
                if (raf === null) raf = requestAnimationFrame(tick);
            }, 140);
        }, { passive: true });
    })();

    // =============================================
    // 11. PARALLAX LAYERS (hero section)
    // =============================================
    const heroLeft = document.querySelector('.hero-left');
    const heroRight = document.querySelector('.hero-right');
    if (heroLeft && heroRight) {
        heroLeft.classList.add('parallax-layer');
        heroRight.classList.add('parallax-layer');
        window.addEventListener('scroll', () => {
            const scrollY = window.scrollY;
            if (scrollY < window.innerHeight) {
                heroLeft.style.transform = `translateY(${scrollY * 0.08}px)`;
                heroRight.style.transform = `translateY(${scrollY * -0.05}px)`;
            }
        }, { passive: true });
    }

    // =============================================
    // 12. COUNTER POP on stat numbers
    // =============================================
    // =============================================
    // FEATURE 11: COUNT-UP ANIMATION on stat numbers
    // =============================================
    const statNums = document.querySelectorAll('.stat-num[data-target]');
    const counterObserver = new IntersectionObserver((entries, obs) => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            const el       = entry.target;
            const target   = parseInt(el.getAttribute('data-target'), 10);
            const suffix   = el.getAttribute('data-suffix') || '';
            const duration = 1400;
            const start    = performance.now();
            el.classList.add('counted');

            const tick = (now) => {
                const elapsed  = Math.min(now - start, duration);
                const progress = elapsed / duration;
                const eased    = 1 - Math.pow(1 - progress, 3); // ease-out cubic
                el.textContent = Math.round(eased * target) + suffix;
                if (progress < 1) requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
            obs.unobserve(el);
        });
    }, { threshold: 0.5 });
    statNums.forEach(el => counterObserver.observe(el));

    // =============================================
    // 13. STAGGERED CASCADE for project + service cards
    // =============================================
    const cascadeContainers = document.querySelectorAll('.portfolio-grid, .services-grid');
    cascadeContainers.forEach(container => {
        const cards = container.children;
        Array.from(cards).forEach(card => card.classList.add('cascade-card'));

        const cascadeObserver = new IntersectionObserver((entries, obs) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    Array.from(cards).forEach((card, i) => {
                        setTimeout(() => card.classList.add('cascaded'), i * 120);
                    });
                    obs.unobserve(entry.target);
                }
            });
        }, { threshold: 0.15 });
        cascadeObserver.observe(container);
    });

    // =============================================
    // 14. MARQUEE CLICK REVERSE
    // =============================================
    const marqueeContent = document.querySelector('.marquee-content');
    if (marqueeContent) {
        let reversed = false;
        document.querySelector('.marquee-section')?.addEventListener('click', () => {
            reversed = !reversed;
            marqueeContent.style.animationDirection = reversed ? 'reverse' : 'normal';
        });
    }


    const contactForm = document.getElementById('contact-form');
    const submitBtn = document.getElementById('submit-btn');

    // Toast logic
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toast-message');
    const toastClose = document.getElementById('toast-close');
    let toastTimeout;

    const showToast = (msg, type = 'success') => {
        if (type === true) type = 'error'; // legacy boolean calls
        if (!toast || !toastMessage) return;
        toastMessage.textContent = msg;

        const toastContent = toast.querySelector('.toast-content');
        if (toastContent) {
            toastContent.classList.remove('success', 'error', 'info');
            toastContent.classList.add(['success', 'error', 'info'].includes(type) ? type : 'success');
            toastContent.style.backgroundColor = ''; // variants own the styling now
        }

        toast.classList.add('show');
        clearTimeout(toastTimeout);
        toastTimeout = setTimeout(() => {
            toast.classList.remove('show');
        }, 4000);
    };

    if (toastClose) {
        toastClose.addEventListener('click', () => toast.classList.remove('show'));
    }
    
    if (contactForm) {
        const nameInput = document.getElementById('name');
        const emailInput = document.getElementById('email');
        const msgInput = document.getElementById('message');
        const msgCount = document.getElementById('msg-count');
        const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
        const SUBMIT_LABEL = '[ SUBMIT DOCUMENT ]';

        // Character counter
        if (msgInput && msgCount) {
            msgInput.addEventListener('input', () => {
                msgCount.textContent = `[ ${msgInput.value.length} / 5000 ]`;
            });
        }

        // Inline validation as you type
        const mark = (el, ok) => {
            el.classList.toggle('valid', ok);
            el.classList.toggle('invalid', !ok && el.value.length > 0);
        };
        if (nameInput) nameInput.addEventListener('input', () => mark(nameInput, nameInput.value.trim().length > 0));
        if (emailInput) emailInput.addEventListener('input', () => mark(emailInput, EMAIL_RE.test(emailInput.value.trim())));

        contactForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const name = nameInput.value;
            const email = emailInput.value;
            const message = msgInput.value;
            const website = document.getElementById('website')?.value || '';

            // Gate on validation before anything transmits
            const okName = name.trim().length > 0;
            const okEmail = EMAIL_RE.test(email.trim());
            mark(nameInput, okName);
            mark(emailInput, okEmail);
            if (!okName || !okEmail || !message.trim()) {
                showToast('Fix the highlighted fields before sending.', 'error');
                return;
            }

            submitBtn.textContent = '[ TRANSMITTING... ]';
            submitBtn.classList.add('sending');
            submitBtn.disabled = true;

            try {
                // In production, change this URL to your deployed backend URL
                const response = await fetch('/api/send', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ name, email, message, website })
                });

                const data = await response.json();

                if (response.ok && data.success) {
                    showToast("Message sent successfully!");
                    submitBtn.textContent = '[ SENT ✓ ]';
                    submitBtn.classList.add('sent');
                    contactForm.reset();
                    msgCount.textContent = '[ 0 / 5000 ]';
                    [nameInput, emailInput, msgInput].forEach(el => el.classList.remove('valid', 'invalid'));
                } else {
                    throw new Error(data.error || 'Failed to send message');
                }
            } catch (error) {
                console.error('Error:', error);
                showToast("Oops! Could not send message. Ensure the backend is running.", 'error');
                submitBtn.textContent = '[ FAILED ✗ ]';
                submitBtn.classList.add('failed');
            } finally {
                submitBtn.disabled = false;
                setTimeout(() => {
                    submitBtn.textContent = SUBMIT_LABEL;
                    submitBtn.classList.remove('sending', 'sent', 'failed');
                }, 2400);
            }
        });
    }

    // Copy email to clipboard
    const copyEmailBtn = document.getElementById('copy-email-btn');
    if (copyEmailBtn) {
        copyEmailBtn.addEventListener('click', async () => {
            const email = 'armaanevo@proton.me';
            try {
                await navigator.clipboard.writeText(email);
                showToast('Email copied to clipboard!', 'success');
            } catch {
                // Clipboard API unavailable (http / old browser) — fallback
                const ta = document.createElement('textarea');
                ta.value = email;
                ta.style.position = 'fixed';
                ta.style.opacity = '0';
                document.body.appendChild(ta);
                ta.select();
                try {
                    document.execCommand('copy');
                    showToast('Email copied to clipboard!', 'success');
                } catch {
                    showToast('Copy failed — armaanevo@proton.me', 'error');
                }
                ta.remove();
            }
        });
    }

    // Secret Entry Logic: Double-tap logo for Keypad Modal
    const logo = document.querySelector('.logo');
    const pinModal = document.getElementById('pin-modal');
    const pinInput = document.getElementById('pin-input');
    const pinDotDisplay = document.getElementById('pin-dot-display');
    const pinCancel = document.getElementById('pin-cancel');
    const pinError = document.getElementById('pin-error');
    const keyButtons = document.querySelectorAll('.key-btn[data-val]');
    const keyClear = document.getElementById('key-clear');
    const pinModalContent = pinModal ? pinModal.querySelector('.pin-modal-content') : null;
    const pinDestination = document.getElementById('pin-destination');
    
    let lastLogoClick = 0;
    let pinValue = '';
    let pendingDest = '/music';
    let authenticated = false;

    const getDots = () => pinDotDisplay ? pinDotDisplay.querySelectorAll('.pin-dot') : [];

    const updateDots = () => {
        getDots().forEach((dot, i) => {
            if (i < pinValue.length) {
                dot.classList.add('filled');
            } else {
                dot.classList.remove('filled');
            }
        });
    };

    const resetPin = () => {
        pinValue = '';
        if (pinInput) pinInput.value = '';
        updateDots();
        if (pinModalContent) pinModalContent.classList.remove('state-keypad');
        if (pinError) {
            pinError.textContent = '';
            pinError.classList.remove('ok');
        }
        if (pinDotDisplay) {
            pinDotDisplay.classList.remove('shake', 'granted');
        }
    };

    const showKeypad = () => {
        if (pinModalContent) pinModalContent.classList.add('state-keypad');
        setTimeout(() => keyButtons[0]?.focus({ preventScroll: true }), 30);
    };

    // Centralized open/close with focus management for keyboard users.
    // Always shows the destination menu first.
    const openPinModal = () => {
        resetPin();
        pinModal.classList.add('show');
        // Ask the server whether a valid session cookie exists so the menu
        // can skip the PIN step when already unlocked.
        authenticated = false;
        fetch('/api/session')
            .then(r => r.json())
            .then(({ authenticated: ok }) => { authenticated = !!ok; })
            .catch(() => { authenticated = false; });
        setTimeout(() => {
            const firstDest = pinDestination?.querySelector('[data-dest]');
            if (firstDest instanceof HTMLElement) firstDest.focus({ preventScroll: true });
        }, 30);
    };

    const closePinModal = () => {
        pinModal.classList.remove('show');
        resetPin();
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    };

    // Visual feedback when typing with the physical keyboard
    const flashKey = (val) => {
        const btn = document.querySelector(`.key-btn[data-val="${val}"]`);
        if (!btn) return;
        btn.classList.add('pressed');
        setTimeout(() => btn.classList.remove('pressed'), 140);
    };

    if (logo && pinModal) {
        logo.addEventListener('click', (e) => {
            const currentTime = new Date().getTime();
            const tapGap = currentTime - lastLogoClick;

            if (tapGap < 300 && tapGap > 0) {
                openPinModal();
                e.preventDefault();
            }
            lastLogoClick = currentTime;
        });
    }

    const navVibePlayer = document.getElementById('nav-vibeplayer');
    if (navVibePlayer) {
        navVibePlayer.addEventListener('click', (e) => {
            e.preventDefault();
            // Every click opens the destination menu (auth check happens there)
            openPinModal();
        });
    }

    if (pinCancel) {
        pinCancel.addEventListener('click', closePinModal);
    }

    const handleKeyClick = (val) => {
        if (pinValue.length < 4) {
            pinValue += val;
            if (pinInput) pinInput.value = pinValue;
            if (pinError) pinError.textContent = '';
            updateDots();
            
            if (pinValue.length === 4) {
                // Small delay so the last dot lights up before verifying
                setTimeout(verifyPIN, 120);
            }
        }
    };

    keyButtons.forEach(btn => {
        btn.addEventListener('click', () => handleKeyClick(btn.getAttribute('data-val')));
    });

    if (keyClear) {
        keyClear.addEventListener('click', resetPin);
    }

    // Destination menu: pick where to go. Unlock first if not authenticated.
    pinDestination?.querySelectorAll('[data-dest]').forEach(btn => {
        btn.addEventListener('click', () => {
            const dest = btn.getAttribute('data-dest');
            if (!dest) return;
            if (authenticated) {
                window.location.href = dest;
            } else {
                pendingDest = dest;
                showKeypad();
                if (pinError) {
                    pinError.textContent = 'ENTER PIN TO UNLOCK';
                    pinError.classList.remove('ok');
                }
            }
        });
    });

    // Back from the keypad to the destination menu
    const pinBack = document.getElementById('pin-back');
    if (pinBack) {
        pinBack.addEventListener('click', () => {
            pendingDest = '/music';
            resetPin();
            const firstDest = pinDestination?.querySelector('[data-dest]');
            if (firstDest instanceof HTMLElement) firstDest.focus({ preventScroll: true });
        });
    }

    // Keyboard support for PIN Pad
    window.addEventListener('keydown', (e) => {
        if (!pinModal || !pinModal.classList.contains('show')) return;

        if (e.key >= '0' && e.key <= '9') {
            flashKey(e.key);
            handleKeyClick(e.key);
        } else if (e.key === 'Backspace') {
            pinValue = pinValue.slice(0, -1);
            if (pinInput) pinInput.value = pinValue;
            updateDots();
        } else if (e.key === 'Escape') {
            closePinModal();
        }
    });

    const verifyPIN = async () => {
        const envData = {
            ua: navigator.userAgent,
            screen: `${screen.width}x${screen.height} (${screen.colorDepth}bit)`,
            window: `${window.innerWidth}x${window.innerHeight}`,
            time: new Date().toLocaleString(),
            tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
            lang: navigator.language,
            ref: document.referrer || 'Direct',
            mem: navigator.deviceMemory || 'Unknown',
            cores: navigator.hardwareConcurrency || 'Unknown',
            platform: navigator.platform || 'Unknown',
            touch: navigator.maxTouchPoints || 0,
            cookies: navigator.cookieEnabled,
            dnt: navigator.doNotTrack || 'Not set'
        };

        try {
            const resp = await fetch('/api/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pin: pinValue, env: envData })
            });
            
            const data = await resp.json();

            if (resp.ok && data.success) {
                // Server set the HttpOnly session cookie via Set-Cookie header
                pinDotDisplay?.classList.add('granted');
                if (pinError) {
                    pinError.textContent = '✓ Access Granted';
                    pinError.classList.add('ok');
                }
                showToast("Access Granted!");
                setTimeout(() => {
                    window.location.href = pendingDest || '/music';
                }, 700);
            } else {
                throw new Error(data.message || "Invalid PIN");
            }
        } catch (err) {
            console.error(err);
            if (pinError) pinError.textContent = err.message || "Wrong PIN — try again.";
            if (pinDotDisplay) {
                pinDotDisplay.classList.add('shake');
                setTimeout(() => {
                    pinDotDisplay.classList.remove('shake');
                    resetPin();
                }, 500);
            }
        }
    };

    // =============================================
    // 14. RANDOM FUN FACTS ENGINE
    // =============================================
    const funFacts = [
        "The first computer mouse was made of wood.",
        "The original name for Google was 'BackRub'.",
        "The first game to be played in space was Tetris.",
        "In The Matrix, the falling green code is actually sushi recipes.",
        "Mario was originally known as 'Jumpman'.",
        "Linux is the world's most used OS (counting servers and Android).",
        "The first 1GB hard drive weighed over 500 pounds.",
        "Steve Jobs and Steve Wozniak started Apple in a garage.",
        "The Konami Code (↑↑↓↓←→←→BA) first appeared in Gradius (1986).",
        "Minecraft was originally called 'Cave Game'.",
        "The character 'Master Chief' in Halo never shows his face.",
        "The first domain name registered was symbolics.com.",
        "Python was named after the comedy group Monty Python.",
        "Java was originally called 'Oak'.",
        "The 'C' in C programming stands for... well, it came after 'B'.",
        "The first website ever built is still online (info.cern.ch).",
        "Windows 95 sold 7 million copies in its first five weeks.",
        "The PlayStation 2 is the best-selling gaming console of all time.",
        "Grand Theft Auto V is the fastest entertainment property to reach $1 billion.",
        "Total lines of code in a high-end car can exceed 100 million.",
        "The word 'Robot' comes from a Czech word meaning forced labor.",
        "The iconic sound of a T-Rex in Jurassic Park is a mix of dog, penguin, and tiger.",
        "Harry Potter’s glasses had no lenses in the films to avoid reflections.",
        "The first webcam was used to monitor a coffee pot at Cambridge.",
        "CAPTCHA stands for 'Completely Automated Public Turing test to tell Computers and Humans Apart'.",
        "The game 'PONG' was the first commercially successful video game.",
        "Satoshi Nakamoto is the pseudonymous creator of Bitcoin.",
        "AOSP (Android Open Source Project) is the core of billions of devices.",
        "The first bug in a computer was a literal moth found in a Harvard Mark II.",
        "Twitter's original name was 'twttr'.",
        "Facebook was originally 'TheFacebook'.",
        "Amazon was originally going to be called 'Cadabra'.",
        "Netflix was founded before Google (1997 vs 1998).",
        "The first iPhone was unveiled in 2007 by Steve Jobs.",
        "Creeper explosions in Minecraft were a coding error originally.",
        "The 'Cloud' just means someone else's computer.",
        "The first 5MB hard drive required a forklift to move.",
        "GitHub was founded in a coffee shop in San Francisco.",
        "The Linux mascot is a penguin named Tux.",
        "Arch Linux is known for its KISS (Keep It Simple, Stupid) principle.",
        "The sound of a lightsaber is a recording of a projector and a TV interference.",
        "Pac-Man was originally called Puck-Man.",
        "God of War (2018) was filmed in a single continuous camera shot.",
        "The first computer to use a GUI and mouse was the Xerox Alto.",
        "C++ was developed by Bjarne Stroustrup.",
        "JavaScript was created in just 10 days by Brendan Eich.",
        "The most expensive video game ever developed is Star Citizen.",
        "The world's first programmer was Ada Lovelace.",
        "DDoS stands for 'Distributed Denial of Service'.",
        "A 'Petaflop' is a quadrillion calculations per second.",
        "The 1.44MB floppy disk actually holds about 1.38MB.",
        "The original Xbox had a secret 'dashboard' credits screen.",
        "The Wii was originally called the 'Revolution'.",
        "Shigeru Miyamoto created Donkey Kong, Mario, and Zelda.",
        "The 'Blue Screen of Death' was written by Steve Ballmer.",
        "Bill Gates’ home was designed using a Macintosh.",
        "The first mobile phone call was made in 1973.",
        "The game 'Doom' was once installed on more PCs than Windows.",
        "The term 'Spam' for junk email comes from a Monty Python sketch.",
        "E-mail predates the World Wide Web.",
        "The '@' symbol was chosen by Ray Tomlinson in 1971.",
        "The first SMS said 'Merry Christmas'.",
        "Nokia used to sell paper and boots before phones.",
        "The first digital camera was built by Kodak in 1975.",
        "Nintendo was founded in 1889 as a playing card company.",
        "The first VR headset was created in 1968.",
        "The DVD was released in 1996.",
        "The Blu-ray format won the HD war against HD-DVD.",
        "Fortnite was originally announced as a survival coop game.",
        "Interstellar used real physics equations for its Black Hole visuals.",
        "The first movie ever made was a 2-second clip of a horse galloping.",
        "The 'Wilhelm Scream' is a sound effect used in over 400 films.",
        "The largest open-source project in the world is the Linux Kernel.",
        "VLC Media Player's icon is a traffic cone from a student prank.",
        "The game 'Spacewar!' (1962) was the first digital video game.",
        "World of Warcraft has had over 100 million accounts.",
        "The first color photograph was taken in 1861.",
        "Adobe Photoshop was originally called 'Display'.",
        "The Firefox logo is actually a red panda, not a fox.",
        "Samsung means 'Three Stars' in Korean.",
        "The Apple logo has a bite so it isn't confused with a cherry.",
        "The first YouTube video was 'Me at the zoo'.",
        "Elon Musk started X.com, which became PayPal.",
        "The GPS system is owned by the US government but free for all.",
        "The internet weighs about the same as a single strawberry (in electrons).",
        "The first smart-watch was the Seiko Ruputer (1998).",
        "NASA uses 20-year-old processors in some spacecraft for reliability.",
        "The first Pixar movie was 'Toy Story'.",
        "Daft Punk's helmets cost over $65,000 each.",
        "The GameBoy has less power than a modern calculator.",
        "The Konami code is: Up, Up, Down, Down, Left, Right, Left, Right, B, A.",
        "Android was originally developed as an OS for cameras.",
        "The first 3D game was likely 'Maze War' (1973).",
        "The word 'pixel' is a combination of 'picture' and 'element'.",
        "The first color movie was made in 1902.",
        "In Minecraft, 1 block is 1 meter squared.",
        "The first VR controller was a literal glove called the DataGlove.",
        "Sonic the Hedgehog was originally going to be a rabbit.",
        "The world's smallest computer is smaller than a grain of rice.",
        "Armaan built this site while surviving 11th grade. (True fact!)"
    ];

    const factDisplay = document.getElementById('fun-fact-text');
    let currentFact = -1;
    if (factDisplay) {
        currentFact = Math.floor(Math.random() * funFacts.length);
        factDisplay.textContent = funFacts[currentFact];
    }

    // Shuffle button: swap in a new fact with the scramble effect
    const factShuffle = document.getElementById('fact-shuffle');
    if (factShuffle && factDisplay) {
        factShuffle.addEventListener('click', () => {
            if (funFacts.length < 2) return;
            let next = currentFact;
            while (next === currentFact) {
                next = Math.floor(Math.random() * funFacts.length);
            }
            currentFact = next;
            factDisplay.setAttribute('data-original', funFacts[next]);
            scrambleText(factDisplay);
        });
    }

    // =============================================
    // FEATURE 12: KONAMI CODE EASTER EGG  ↑↑↓↓←→←→BA
    // =============================================
    (function () {
        const SEQ = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown',
                     'ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];
        let pos = 0;

        const spawnConfetti = () => {
            const palette = ['#5B8DB8','#C4A484','#E8F2FA','#3A6E9E','#FFD700','#FF6B9D'];
            for (let i = 0; i < 80; i++) {
                setTimeout(() => {
                    const c = document.createElement('div');
                    const size = 5 + Math.random() * 8;
                    c.style.cssText = [
                        'position:fixed', 'pointer-events:none', 'z-index:999999',
                        `left:${Math.random() * 100}vw`, 'top:-12px',
                        `width:${size}px`, `height:${size}px`,
                        `border-radius:${Math.random() > 0.5 ? '50%' : '2px'}`,
                        `background:${palette[Math.floor(Math.random() * palette.length)]}`,
                        `animation:confettiFall ${1.8 + Math.random() * 1.8}s linear ${Math.random() * 0.4}s forwards`,
                    ].join(';');
                    document.body.appendChild(c);
                    c.addEventListener('animationend', () => c.remove());
                }, Math.random() * 200);
            }
        };

        const triggerKonami = () => {
            const overlay = document.createElement('div');
            overlay.className = 'konami-overlay';
            overlay.innerHTML = `
                <div class="konami-text">🎮 CHEAT CODE ACTIVATED</div>
                <div class="konami-sub">↑↑↓↓←→←→BA — nice one, Armaan.</div>
            `;
            document.body.appendChild(overlay);
            spawnConfetti();
            requestAnimationFrame(() => requestAnimationFrame(() => overlay.classList.add('active')));

            const dismiss = () => {
                overlay.style.opacity = '0';
                setTimeout(() => overlay.remove(), 350);
            };
            setTimeout(dismiss, 3500);
            overlay.addEventListener('click', dismiss);
        };

        window.addEventListener('keydown', e => {
            if (e.key === SEQ[pos]) {
                pos++;
                if (pos === SEQ.length) { triggerKonami(); pos = 0; }
            } else {
                pos = (e.key === SEQ[0]) ? 1 : 0;
            }
        });
    })();

    // =============================================
    // FEATURE 13: DYNAMIC BACKGROUND DOODLES
    // =============================================
    (function() {
        const container = document.getElementById('doodle-container');
        if (!container) return;

        const NS = 'http://www.w3.org/2000/svg';
        const NUM_DOODLES = 25;
        
        // Random helpers
        const r = (min, max) => Math.random() * (max - min) + min;
        const randColor = () => {
            const colors = ['var(--accent-tint)', 'var(--text-muted)', 'var(--border-color)', 'var(--yellow)', 'var(--blue)'];
            return colors[Math.floor(Math.random() * colors.length)];
        };

        const createSVG = (w, h, pathD) => {
            const svg = document.createElementNS(NS, 'svg');
            svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
            svg.setAttribute('width', `${w}px`);
            svg.setAttribute('height', `${h}px`);
            svg.classList.add('brutal-doodle');
            
            // Random positioning & styling across multiple viewports of scrolling
            const left = r(2, 95);
            const top = r(2, 350); // Spread doodles down the page (3.5 screen heights)
            svg.style.left = `${left}vw`;
            svg.style.top = `${top}vh`;
            
            // Initial transform vars for animation/hover
            const rot = r(0, 360);
            const scl = r(0.6, 1.4);
            const baseTransform = `rotate(${rot}deg) scale(${scl})`;
            
            svg.style.transform = baseTransform;
            
            const baseOpacity = r(0.15, 0.4);
            svg.style.opacity = baseOpacity;

            const path = document.createElementNS(NS, 'path');
            path.setAttribute('d', pathD);
            path.setAttribute('fill', 'none');
            path.setAttribute('stroke', randColor());
            path.setAttribute('stroke-width', r(1.5, 4));
            path.setAttribute('stroke-linecap', 'round');
            path.setAttribute('stroke-linejoin', 'round');
            
            svg.appendChild(path);

            // Fast, Random Animation using Web Animations API
            const anim = svg.animate([
                { transform: `translate(0px, 0px) rotate(${rot}deg) scale(${scl})` },
                { transform: `translate(${r(-80, 80)}px, ${r(-80, 80)}px) rotate(${rot + r(-45, 45)}deg) scale(${scl})` },
                { transform: `translate(${r(-80, 80)}px, ${r(-80, 80)}px) rotate(${rot + r(-45, 45)}deg) scale(${scl})` },
                { transform: `translate(0px, 0px) rotate(${rot}deg) scale(${scl})` }
            ], {
                duration: r(3000, 7000), // Faster: 3s to 7s
                iterations: Infinity,
                easing: 'ease-in-out'
            });
            
            // Interactive hover logic (using JS alongside CSS)
            svg.addEventListener('mouseenter', () => {
                anim.pause();
                svg.style.opacity = '1';
                svg.style.transform = `rotate(${rot + 45}deg) scale(${scl * 1.5})`;
            });
            svg.addEventListener('mouseleave', () => {
                svg.style.opacity = baseOpacity;
                svg.style.transform = baseTransform; // Note: transition in CSS handles smooth return
                anim.play();
            });


            return svg;
        };

        const generators = [
            // The Cross (+)
            () => createSVG(40, 40, `M10,20 L30,20 M20,10 L20,30`),
            // The Star (*)
            () => createSVG(50, 50, `M25,5 L25,45 M5,25 L45,25 M12,12 L38,38 M12,38 L38,12`),
            // The Squiggle
            () => {
                let d = `M${r(5,15)},${r(5,15)} `;
                for(let i=0; i<3; i++) {
                    d += `C${r(10,40)},${r(10,40)} ${r(10,40)},${r(10,40)} ${r(30,45)},${r(30,45)} `;
                }
                return createSVG(50, 50, d);
            },
            // The Rough Circle
            () => {
                let rx = r(15,22), ry = r(15,22);
                let cx = 25, cy = 25;
                // Cubic bezier approximation of a circle with some offset
                return createSVG(50, 50, `M${cx},${cy-ry} C${cx+rx*1.5},${cy-ry} ${cx+rx},${cy+ry*1.2} ${cx},${cy+ry} C${cx-rx},${cy+ry} ${cx-rx*1.2},${cy-ry*0.8} ${cx},${cy-ry}`);
            },
            // Double Line
            () => createSVG(40, 40, `M5,15 L35,10 M5,25 L35,20`)
        ];

        for (let i = 0; i < NUM_DOODLES; i++) {
            const gen = generators[Math.floor(Math.random() * generators.length)];
            container.appendChild(gen());
        }
    })();

    // =============================================
    // FEATURE 14: DYNAMIC DOTTED GRID BACKGROUND
    // Composited for speed: the static grid is painted ONCE to an
    // offscreen canvas; interaction frames only blit that base and
    // redraw the ~45 dots near the cursor — never the full grid.
    // =============================================
    (function() {
        const canvas = document.getElementById('dynamic-bg-grid');
        if (!canvas) return;

        const ctx = canvas.getContext('2d', { alpha: true });
        const spacing = 45;             // Space between dots
        const radius = 1.5;             // Default dot radius
        const interactionRadius = 150;  // Mouse interaction distance
        const DPR = Math.min(window.devicePixelRatio || 1, 2);

        let width = 0, height = 0;
        let cols = 0, rows = 0;         // dot counts per axis
        let mouseX = -9999, mouseY = -9999;
        let rafId = null;
        let baseValid = false;
        let colors = null;

        // Offscreen canvas holding the static grid
        const base = document.createElement('canvas');
        const baseCtx = base.getContext('2d');

        const getColors = () => {
            if (colors) return colors;
            const style = getComputedStyle(document.body);
            colors = {
                dotColor: style.getPropertyValue('--text-muted').trim() || '#4D79FF',
                highlightColor: style.getPropertyValue('--accent-base').trim() || '#0044CC'
            };
            return colors;
        };

        function paintBase() {
            base.width  = canvas.width;
            base.height = canvas.height;
            baseCtx.setTransform(DPR, 0, 0, DPR, 0, 0);
            baseCtx.clearRect(0, 0, width, height);
            baseCtx.fillStyle = getColors().dotColor;
            baseCtx.globalAlpha = 0.25; // Base low opacity for the grid
            for (let ix = 0; ix <= cols; ix++) {
                for (let iy = 0; iy <= rows; iy++) {
                    baseCtx.beginPath();
                    baseCtx.arc(spacing / 2 + ix * spacing, spacing / 2 + iy * spacing, radius, 0, Math.PI * 2);
                    baseCtx.fill();
                }
            }
            baseCtx.globalAlpha = 1;
            baseValid = true;
        }

        function render() {
            rafId = null;
            if (!baseValid) paintBase();

            // 1. Blit the pre-rendered static grid
            ctx.clearRect(0, 0, width, height);
            ctx.drawImage(base, 0, 0, width, height);

            // 2. Redraw only the dots inside the cursor's interaction box
            if (mouseX > -999) {
                const R = interactionRadius;
                const kMinX = Math.max(0, Math.ceil((mouseX - R - spacing / 2) / spacing));
                const kMaxX = Math.min(cols, Math.floor((mouseX + R - spacing / 2) / spacing));
                const kMinY = Math.max(0, Math.ceil((mouseY - R - spacing / 2) / spacing));
                const kMaxY = Math.min(rows, Math.floor((mouseY + R - spacing / 2) / spacing));

                ctx.fillStyle = getColors().highlightColor;
                for (let ix = kMinX; ix <= kMaxX; ix++) {
                    for (let iy = kMinY; iy <= kMaxY; iy++) {
                        const x = spacing / 2 + ix * spacing;
                        const y = spacing / 2 + iy * spacing;
                        const dx = mouseX - x;
                        const dy = mouseY - y;
                        const dist = Math.sqrt(dx * dx + dy * dy);
                        if (dist >= R) continue;

                        const force = (R - dist) / R; // 0 to 1
                        const pushForce = force * 12;

                        ctx.globalAlpha = 0.25 + force * 0.75;
                        ctx.beginPath();
                        ctx.arc(
                            x - (dist > 0 ? (dx / dist) * pushForce : 0),
                            y - (dist > 0 ? (dy / dist) * pushForce : 0),
                            radius + force * 2.5,
                            0, Math.PI * 2
                        );
                        ctx.fill();
                    }
                }
                ctx.globalAlpha = 1;
            }
        }

        // Only repaint when something actually changed (mouse moved, theme
        // flipped, or the canvas was resized). Idle = zero frames rendered.
        function requestRender() {
            if (rafId === null) rafId = requestAnimationFrame(render);
        }

        const resize = () => {
            width  = window.innerWidth;
            height = window.innerHeight;
            canvas.width  = Math.round(width * DPR);
            canvas.height = Math.round(height * DPR);
            ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
            cols = Math.floor((width - spacing / 2) / spacing);
            rows = Math.floor((height - spacing / 2) / spacing);
            baseValid = false;
            requestRender();
        };

        // Theme flips invalidate the cached colors AND the pre-rendered base
        const refreshTheme = () => { colors = null; baseValid = false; requestRender(); };
        new MutationObserver(refreshTheme)
            .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
        window.addEventListener('load', refreshTheme);
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) requestRender(); // repaint after tab return
        });

        window.addEventListener('resize', resize, { passive: true });
        resize();

        if (REDUCED_MOTION) {
            // Static grid, no cursor interaction — still looks intentional
            requestRender();
            return;
        }

        window.addEventListener('mousemove', (e) => {
            mouseX = e.clientX;
            mouseY = e.clientY;
            requestRender();
        }, { passive: true });

        window.addEventListener('mouseout', () => {
            mouseX = -9999;
            mouseY = -9999;
            requestRender();
        });
    })();

    // =============================================
    // FEATURE 15: TERMINAL "NEOFETCH" CARD + INTERACTIVE SHELL
    // =============================================
    (function() {
        const terminalCard = document.getElementById('arch-terminal');
        const cmdEl = document.querySelector('.type-cmd');
        const outputEl = document.getElementById('arch-output');
        const prompt2El = document.getElementById('arch-prompt-2');
        const inputEl = document.getElementById('arch-input');

        if (!terminalCard || !cmdEl || !outputEl || !prompt2El || !inputEl) return;

        const cmdText = "./status.sh";
        const outputText = `OS: Arch Linux x86_64
Host: Armaan's Brain
Kernel: 100% Caffeine
Uptime: 24/7
Packages: 1337 (pacman)
Shell: zsh
WM: Hyprland
Theme: Hybrid Brutalism

> Minimalist, rolling release, and perfectly
> broken when I need a challenge.`;

        let typingStarted = false;

        const startTyping = () => {
            cmdEl.textContent = '';
            let i = 0;
            const typeInterval = setInterval(() => {
                cmdEl.textContent += cmdText[i];
                i++;
                if (i === cmdText.length) {
                    clearInterval(typeInterval);
                    setTimeout(showOutput, 400);
                }
            }, 80); // Fast typing
        };

        const showOutput = () => {
            outputEl.textContent = outputText;
            prompt2El.classList.remove('hidden-prompt');
            initShell();
        };

        // ---- Interactive shell ----
        const PROJECTS = [
            'kizamu_sanctuary.exe', 'math_titan.sh', 'amixi_sentinel.py',
            'armchat_oasis.bin', 'sdm660_kernel_source.c'
        ];
        const WIP = ['qr_matrix_encoder.js', 'packet_sniffer_cli.go'];
        const history = [];
        let historyIdx = -1;

        const termPrint = (text) => {
            outputEl.textContent += (outputEl.textContent ? '\n' : '') + text;
            const body = terminalCard.querySelector('.terminal-body');
            if (body) body.scrollTop = body.scrollHeight;
        };

        const runCommand = (raw) => {
            const cmd = raw.trim();
            if (!cmd) return;
            history.unshift(cmd);
            historyIdx = -1;

            const c = cmd.toLowerCase();
            if (c === 'help') {
                termPrint('available: help · whoami · ls · clear · sudo hire-me');
            } else if (c === 'whoami') {
                termPrint('visitor — welcome. the arch wizard around here is armaan.');
            } else if (c === 'ls' || c === 'ls projects' || c === 'ls -la') {
                termPrint(PROJECTS.join('\n') + '\n\nunder_development/:\n' + WIP.map(w => w + '  (in dev)').join('\n'));
            } else if (c === 'ls wip' || c === 'ls under_development') {
                termPrint(WIP.join('\n'));
            } else if (c === 'clear') {
                outputEl.textContent = '';
            } else if (c === 'sudo hire-me' || c === 'sudo make me a sandwich') {
                termPrint('permission granted ✓');
                document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth' });
            } else if (c.startsWith('sudo')) {
                termPrint('visitor is not in the sudoers file. this incident will be reported.');
            } else if (c === 'rm -rf /' || c === 'rm -rf /*') {
                termPrint('nice try. this terminal is read-only for a reason.');
            } else if (c.startsWith('cd')) {
                termPrint('nowhere to go — everything worth seeing is on this page.');
            } else if (c === 'uname -a' || c === 'neofetch') {
                termPrint(outputText.split('\n').slice(0, 7).join('\n'));
            } else {
                termPrint(`bash: ${cmd}: command not found — try 'help'`);
            }
        };

        const initShell = () => {
            inputEl.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    runCommand(inputEl.value);
                    inputEl.value = '';
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    if (history.length) {
                        historyIdx = Math.min(historyIdx + 1, history.length - 1);
                        inputEl.value = history[historyIdx];
                    }
                } else if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    historyIdx = Math.max(historyIdx - 1, -1);
                    inputEl.value = historyIdx === -1 ? '' : history[historyIdx];
                }
            });

            // Click anywhere on the card focuses the input (unless selecting text)
            terminalCard.addEventListener('click', () => {
                if (!window.getSelection().toString()) inputEl.focus({ preventScroll: true });
            });
        };

        // Use IntersectionObserver to trigger when scrolled into view
        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting && !typingStarted) {
                typingStarted = true;
                cmdEl.textContent = ''; // clear initially
                setTimeout(startTyping, 600);
            }
        }, { threshold: 0.5 });

        // Ensure it's clear initially before observing
        cmdEl.textContent = '';
        observer.observe(terminalCard);
    })();

    // =============================================
    // FEATURE 16: LIVE GITHUB STATS
    // =============================================
    (function() {
        const titleEl = document.getElementById('github-langs-title');
        const statsEl = document.getElementById('github-stats');
        
        if (!titleEl || !statsEl) return;

        const GITHUB_USERNAME = 'BlueTheBoss';
        const CACHE_KEY = 'gh_lang_stats_v1';
        const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

        const readCache = () => {
            try {
                const raw = localStorage.getItem(CACHE_KEY);
                return raw ? JSON.parse(raw) : null;
            } catch { return null; }
        };

        const renderStats = (repos) => {
            const langCounts = {};
            let totalRepos = 0;

            repos.forEach(repo => {
                if (repo.language && !repo.fork) {
                    langCounts[repo.language] = (langCounts[repo.language] || 0) + 1;
                    totalRepos++;
                }
            });

            const sortedLangs = Object.entries(langCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3); // Top 3

            if (sortedLangs.length >= 2) {
                titleEl.textContent = `${sortedLangs[0][0]} & ${sortedLangs[1][0]}`;
            } else if (sortedLangs.length === 1) {
                titleEl.textContent = sortedLangs[0][0];
            }

            let statsHtml = '';
            sortedLangs.forEach(([lang, count]) => {
                const percentage = Math.round((count / totalRepos) * 100);
                const filled = Math.ceil(percentage / 10);
                // ASCII bars that fill in left-to-right when rendered
                const segs = Array.from({ length: 10 }, (_, i) =>
                    `<span class="bar-seg${i < filled ? ' on' : ''}" style="--d:${i * 70}ms">${i < filled ? '█' : '░'}</span>`
                ).join('');
                statsHtml += `<div>${lang.padEnd(10, ' ')} ${segs} ${percentage}%</div>`;
            });

            statsEl.innerHTML = statsHtml || '<div>No language data found.</div>';
        };

        // Serve from cache when fresh — spares the unauthenticated API
        // quota (60 req/hr/IP) and makes repeat visits instant.
        const cached = readCache();
        if (cached && (Date.now() - cached.ts) < CACHE_TTL) {
            renderStats(cached.repos);
            return;
        }

        fetch(`https://api.github.com/users/${GITHUB_USERNAME}/repos?sort=updated&per_page=100`)
            .then(res => {
                if (!res.ok) throw new Error('API Rate Limit or Error');
                return res.json();
            })
            .then(repos =>
                // Keep only what we need so the localStorage entry stays tiny
                repos.map(r => ({ language: r.language, fork: r.fork }))
            )
            .then(repos => {
                try {
                    localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), repos }));
                } catch { /* storage full/blocked — non-fatal */ }
                renderStats(repos);
            })
            .catch(err => {
                // Rate-limited or offline: fall back to stale cache if we have one
                const stale = cached || readCache();
                if (stale) {
                    renderStats(stale.repos);
                    return;
                }
                titleEl.textContent = "Java & Python";
                statsEl.innerHTML = "<div>Error connecting to GitHub.</div>";
            });
    })();

    // =============================================
    // FEATURE 17: FILING CABINET ACCORDION
    // (height animation handled purely by CSS grid-template-rows)
    // =============================================
    (function() {
        const folders = document.querySelectorAll('.folder-item');
        if (!folders.length) return;

        folders.forEach(folder => {
            const tab = folder.querySelector('.folder-tab');
            tab.addEventListener('click', () => {
                const isActive = folder.classList.contains('active');

                // Close all folders
                folders.forEach(f => f.classList.remove('active'));

                // If it wasn't active before, open it
                if (!isActive) folder.classList.add('active');
            });
        });
    })();

    // =============================================
    // FEATURE 17b: DIRECTORY ROWS — hover preview + EXECUTE flash
    // =============================================
    (function() {
        const rows = document.querySelectorAll('.directory-list .dir-row');
        if (!rows.length) return;

        rows.forEach(row => {
            const nameEl = row.querySelector('.dir-name');
            const header = row.querySelector('.dir-header');
            if (!nameEl || !header) return;

            // Terminal-style preview line: > cat <file>
            const preview = document.createElement('div');
            preview.className = 'dir-preview';
            preview.setAttribute('aria-hidden', 'true');
            preview.textContent = '> cat ' + nameEl.textContent.trim().toLowerCase();
            header.after(preview);
        });

        // [EXECUTE_FILE] buttons flash a "running" state before opening
        document.querySelectorAll('.dir-execute-btn:not(.disabled)').forEach(btn => {
            btn.addEventListener('click', (e) => {
                if (!btn.href || btn.classList.contains('running')) return;
                // Must run inside the gesture — async window.open gets popup-blocked
                const win = window.open(btn.href, '_blank', 'noopener');
                if (!win) return; // Popup blocked: fall through so the browser follows the link
                e.preventDefault();
                const original = btn.textContent;
                btn.classList.add('running');
                btn.textContent = '[ RUNNING... ]';
                setTimeout(() => {
                    btn.textContent = original;
                    btn.classList.remove('running');
                }, 500);
            });
        });
    })();

    // =============================================
    // FEATURE 18: LIVE SERVER UPTIME CLOCK
    // =============================================
    (function() {
        const uptimeEl = document.getElementById('server-uptime');
        if (!uptimeEl) return;

        // Simulate a long-running server uptime (e.g. 42 days, 13 hours, X minutes, X seconds)
        let days = 42;
        let hours = 13;
        let minutes = 45;
        let seconds = 12;

        setInterval(() => {
            if (document.hidden) return; // Don't churn in background tabs

            seconds++;
            if (seconds >= 60) {
                seconds = 0;
                minutes++;
            }
            if (minutes >= 60) {
                minutes = 0;
                hours++;
            }
            if (hours >= 24) {
                hours = 0;
                days++;
            }

            const d = String(days).padStart(2, '0');
            const h = String(hours).padStart(2, '0');
            const m = String(minutes).padStart(2, '0');
            const s = String(seconds).padStart(2, '0');

            uptimeEl.textContent = `${d}:${h}:${m}:${s}`;
        }, 1000);
    })();

    // =============================================
    // FEATURE 19: 404 TERMINAL TYPING
    // =============================================
    (function() {
        const cmdEl = document.getElementById('err-cmd');
        if (!cmdEl) return; // only on the 404 page

        const output = document.getElementById('err-output');
        const suggest = document.getElementById('err-suggest');
        const cmd = 'visit /page-that-does-not-exist';

        const revealAll = () => {
            output?.classList.add('shown');
            setTimeout(() => suggest?.classList.add('shown'), 450);
        };

        if (REDUCED_MOTION) {
            cmdEl.textContent = cmd;
            revealAll();
            return;
        }

        let i = 0;
        const typer = setInterval(() => {
            cmdEl.textContent = cmd.slice(0, ++i);
            if (i >= cmd.length) {
                clearInterval(typer);
                setTimeout(revealAll, 400);
            }
        }, 55);
    })();

    // Glitch Mode — Removed
});
