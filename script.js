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
    
    // Scroll reveal animations
    const revealElements = document.querySelectorAll('.reveal, .reveal-left, .reveal-right');
    
    const revealObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('active');
                // Stop observing once revealed for better performance
                observer.unobserve(entry.target);
            }
        });
    }, {
        threshold: 0.1,
        rootMargin: "0px 0px -50px 0px"
    });

    revealElements.forEach(el => revealObserver.observe(el));
    
    // Custom Cursor tracking
    const cursor = document.querySelector('.custom-cursor');
    const scrollProgress = document.querySelector('.scroll-progress');

    if (cursor) {
        document.addEventListener('mousemove', (e) => {
            // Smoother cursor follow with requestAnimationFrame or simple transform
            cursor.style.transform = `translate(${e.clientX}px, ${e.clientY}px) translate(-50%, -50%)`;
        });
        
        const interactables = document.querySelectorAll('a, button, input, textarea, .project-card, .contact-tile, .theme-toggle-btn, .key-btn');
        interactables.forEach(el => {
            el.addEventListener('mouseenter', () => cursor.classList.add('hover'));
            el.addEventListener('mouseleave', () => cursor.classList.remove('hover'));
        });
    }

    // Scroll Progress & Simple Parallax
    window.addEventListener('scroll', () => {
        const winScroll = document.body.scrollTop || document.documentElement.scrollTop;
        const height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
        const scrolled = (winScroll / height) * 100;
        if (scrollProgress) scrollProgress.style.width = scrolled + "%";

        // Hero Parallax
        const heroGraphic1 = document.querySelector('.graphic-1');
        const heroGraphic2 = document.querySelector('.graphic-2');
        if (heroGraphic1) heroGraphic1.style.transform = `translateY(${winScroll * 0.2}px) rotate(${winScroll * 0.05}deg)`;
        if (heroGraphic2) heroGraphic2.style.transform = `translateY(${winScroll * -0.15}px) rotate(${winScroll * -0.03}deg)`;
    });

    // Sparkle Click Effect
    document.addEventListener('click', (e) => {
        const sparkleCount = 8;
        for (let i = 0; i < sparkleCount; i++) {
            const sparkle = document.createElement('div');
            sparkle.className = 'sparkle';
            sparkle.style.left = e.clientX + 'px';
            sparkle.style.top = e.clientY + 'px';
            
            // Random direction
            const angle = (Math.PI * 2 * i) / sparkleCount;
            const velocity = 50 + Math.random() * 50;
            const tx = Math.cos(angle) * velocity;
            const ty = Math.sin(angle) * velocity;
            
            sparkle.style.setProperty('--tx', `${tx}px`);
            sparkle.style.setProperty('--ty', `${ty}px`);
            
            document.body.appendChild(sparkle);
            setTimeout(() => sparkle.remove(), 600);
        }
    });

    // Magnetic Buttons
    const magneticWraps = document.querySelectorAll('.magnetic-wrap');
    magneticWraps.forEach(wrap => {
        const btn = wrap.querySelector('a, button');
        wrap.addEventListener('mousemove', (e) => {
            const rect = wrap.getBoundingClientRect();
            const x = e.clientX - rect.left - rect.width / 2;
            const y = e.clientY - rect.top - rect.height / 2;
            
            btn.style.transform = `translate(${x * 0.3}px, ${y * 0.3}px)`;
        });
        
        wrap.addEventListener('mouseleave', () => {
            btn.style.transform = `translate(0, 0)`;
        });
    });

    // 3D Tilt Effect for Project Cards
    const tiltCards = document.querySelectorAll('.tilt-card');
    tiltCards.forEach(card => {
        card.addEventListener('mousemove', (e) => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            
            const rotateX = (y - centerY) / 10;
            const rotateY = (centerX - x) / 10;
            
            card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-6px)`;
            
            const shine = card.querySelector('.tilt-shine');
            if (shine) {
                const shineX = (x / rect.width) * 100;
                const shineY = (y / rect.height) * 100;
                shine.style.background = `radial-gradient(circle at ${shineX}% ${shineY}%, rgba(255,255,255,0.15) 0%, transparent 80%)`;
            }
        });
        
        card.addEventListener('mouseleave', () => {
            card.style.transform = `perspective(1000px) rotateX(0deg) rotateY(0deg) translateY(0)`;
        });
    });

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
