// Authentication Helpers (Persistent Cookies)
const setCookie = (name, value, days) => {
    let expires = "";
    if (days) {
        const date = new Date();
        date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
        expires = "; expires=" + date.toUTCString();
    }
    document.cookie = name + "=" + (value || "") + expires + "; path=/; SameSite=Strict";
};

const getCookie = (name) => {
    const nameEQ = name + "=";
    const ca = document.cookie.split(';');
    for(let i=0;i < ca.length;i++) {
        let c = ca[i];
        while (c.charAt(0)==' ') c = c.substring(1,c.length);
        if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length,c.length);
    }
    return null;
};

document.addEventListener('DOMContentLoaded', () => {
    console.log("Portfolio site loaded");

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

    
    // Theme setup
    const themeToggle = document.getElementById('theme-toggle');
    const rootElement = document.documentElement;
    
    const getSystemDefaultTheme = () => {
        const hour = new Date().getHours();
        return (hour >= 19 || hour < 7) ? 'dark' : 'light';
    };

    const savedTheme = localStorage.getItem('theme');
    const systemTheme = getSystemDefaultTheme();
    const activeTheme = savedTheme || systemTheme;
    
    rootElement.setAttribute('data-theme', activeTheme);
    if (themeToggle) {
        themeToggle.textContent = activeTheme === 'dark' ? 'Light Mode' : 'Dark Mode';
    }

    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            if (rootElement.getAttribute('data-theme') === 'dark') {
                rootElement.setAttribute('data-theme', 'light');
                themeToggle.textContent = 'Dark Mode';
                localStorage.setItem('theme', 'light');
            } else {
                rootElement.setAttribute('data-theme', 'dark');
                themeToggle.textContent = 'Light Mode';
                localStorage.setItem('theme', 'dark');
            }
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
        scrollProgress.style.width = scrollPercent + '%';
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
    const navSectionLinks = document.querySelectorAll('.nav-links a[data-section]');
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
            link.classList.toggle('active-section', link.dataset.section === currentSection);
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
    const revealElements = document.querySelectorAll('.reveal, .reveal-left, .reveal-right');
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

        document.addEventListener('mousemove', (e) => {
            mouseX = e.clientX;
            mouseY = e.clientY;
        });

        const animateCursor = () => {
            cursorX += (mouseX - cursorX) * 0.15;
            cursorY += (mouseY - cursorY) * 0.15;
            cursor.style.transform = `translate(${cursorX}px, ${cursorY}px) translate(-50%, -50%)`;

            trailX += (mouseX - trailX) * 0.08;
            trailY += (mouseY - trailY) * 0.08;
            trail.style.transform = `translate(${trailX}px, ${trailY}px) translate(-50%, -50%)`;

            requestAnimationFrame(animateCursor);
        };
        requestAnimationFrame(animateCursor);

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
    const statNums = document.querySelectorAll('.stat-num');
    const counterObserver = new IntersectionObserver((entries, obs) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('counted');
                obs.unobserve(entry.target);
            }
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

    const showToast = (msg, isError = false) => {
        if (!toast || !toastMessage) return;
        toastMessage.textContent = msg;
        
        const toastContent = toast.querySelector('.toast-content');
        if (toastContent) {
            toastContent.style.backgroundColor = isError ? '#ffb3ba' : 'var(--yellow)';
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
        contactForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const name = document.getElementById('name').value;
            const email = document.getElementById('email').value;
            const message = document.getElementById('message').value;
            
            submitBtn.textContent = 'Sending...';
            submitBtn.disabled = true;
            
            try {
                // In production, change this URL to your deployed backend URL
                const response = await fetch('/api/send', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ name, email, message })
                });
                
                const data = await response.json();
                
                if (response.ok && data.success) {
                    showToast("Message sent successfully!");
                    contactForm.reset();
                } else {
                    throw new Error(data.error || 'Failed to send message');
                }
            } catch (error) {
                console.error('Error:', error);
                showToast("Oops! Could not send message. Ensure the backend is running.", true);
            } finally {
                submitBtn.textContent = 'Send Message';
                submitBtn.disabled = false;
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
    
    let lastLogoClick = 0;
    let pinValue = '';

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
        if (pinError) pinError.textContent = '';
        if (pinDotDisplay) {
            pinDotDisplay.classList.remove('shake');
        }
    };

    if (logo && pinModal) {
        logo.addEventListener('click', (e) => {
            const currentTime = new Date().getTime();
            const tapGap = currentTime - lastLogoClick;
            
            if (tapGap < 300 && tapGap > 0) {
                resetPin();
                pinModal.classList.add('show');
                e.preventDefault();
            }
            lastLogoClick = currentTime;
        });
    }

    const navVibePlayer = document.getElementById('nav-vibeplayer');
    if (navVibePlayer) {
        navVibePlayer.addEventListener('click', (e) => {
            e.preventDefault();
            const existingPin = getCookie('music_auth');
            if (existingPin) {
                // Persistent session found - direct bypass
                window.location.href = 'music';
            } else {
                resetPin();
                pinModal.classList.add('show');
            }
        });
    }

    if (pinCancel) {
        pinCancel.addEventListener('click', () => {
            pinModal.classList.remove('show');
            resetPin();
        });
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

    // Keyboard support for PIN Pad
    window.addEventListener('keydown', (e) => {
        if (!pinModal || !pinModal.classList.contains('show')) return;

        if (e.key >= '0' && e.key <= '9') {
            handleKeyClick(e.key);
        } else if (e.key === 'Backspace') {
            pinValue = pinValue.slice(0, -1);
            if (pinInput) pinInput.value = pinValue;
            updateDots();
        } else if (e.key === 'Escape') {
            pinModal.classList.remove('show');
            resetPin();
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
                // Store auth in session (lasts until browser tab is closed)
                sessionStorage.setItem('music_auth', pinValue);
                
                // Save PIN persistently for 30 days
                setCookie('music_auth', pinValue, 30);
                
                showToast("Access Granted! Opening VibePlayer...");
                setTimeout(() => {
                    window.location.href = 'music';
                }, 900);
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
});
