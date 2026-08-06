document.addEventListener('DOMContentLoaded', () => {
    initNavbarState();
    initSmoothNavigation();
    initScrollAnimations();
    initCountUp();
    initMobileMenu();
    initShapeBlurCards();
    initPageReveal();
    initHeroTextLoop();
    initPostcardModal();
});

function initNavbarState() {
    const navbar = document.getElementById('navbar');
    if (!navbar) return;

    const update = () => {
        navbar.classList.toggle('scrolled', window.scrollY > 36);
    };

    update();
    window.addEventListener('scroll', update, { passive: true });
}

function initSmoothNavigation() {
    document.querySelectorAll('a[href^="#"]').forEach((link) => {
        link.addEventListener('click', (event) => {
            const id = link.getAttribute('href');
            if (!id || id === '#') return;

            const target = document.querySelector(id);
            if (!target) return;

            event.preventDefault();
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    });
}

function initScrollAnimations() {
    const animated = document.querySelectorAll('[data-animate]');
    if (!animated.length) return;

    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            entry.target.classList.add('visible');
            observer.unobserve(entry.target);
        });
    }, {
        threshold: 0.16,
        rootMargin: '0px 0px -60px 0px',
    });

    animated.forEach((element) => observer.observe(element));
}

function initCountUp() {
    const counters = document.querySelectorAll('[data-count]');
    if (!counters.length) return;

    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            animateCount(entry.target, parseFloat(entry.target.dataset.count || '0'));
            observer.unobserve(entry.target);
        });
    }, { threshold: 0.5 });

    counters.forEach((counter) => observer.observe(counter));
}

function animateCount(element, target) {
    const duration = 1400;
    const start = performance.now();
    const isDecimal = target % 1 !== 0;

    function tick(now) {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        const value = target * eased;

        element.textContent = isDecimal
            ? value.toFixed(1)
            : Math.floor(value).toLocaleString();

        if (progress < 1) requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
}

function initMobileMenu() {
    const toggle = document.getElementById('navbarToggle');
    if (!toggle) return;

    const menu = document.createElement('nav');
    menu.className = 'mobile-menu';
    menu.setAttribute('aria-label', '移动端导航');
    menu.innerHTML = `
        <a href="#hero">Home</a>
        <a href="#products">Products</a>
        <a href="#data">Data</a>
        <a href="#twin">Twin</a>
        <a href="#scenes">Scenes</a>
        <a href="#contact">Contact</a>
    `;
    document.body.appendChild(menu);

    const close = () => {
        toggle.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
        menu.classList.remove('open');
        document.body.style.overflow = '';
    };

    toggle.addEventListener('click', () => {
        const isOpen = !toggle.classList.contains('open');
        toggle.classList.toggle('open', isOpen);
        toggle.setAttribute('aria-expanded', String(isOpen));
        menu.classList.toggle('open', isOpen);
        document.body.style.overflow = isOpen ? 'hidden' : '';
    });

    menu.querySelectorAll('a').forEach((link) => {
        link.addEventListener('click', close);
    });
}

function initShapeBlurCards() {
    const cards = document.querySelectorAll('.service-card, .scene-card');
    if (!cards.length) return;

    cards.forEach((card) => {
        card.addEventListener('pointermove', (event) => {
            const rect = card.getBoundingClientRect();
            const x = ((event.clientX - rect.left) / rect.width) * 100;
            const y = ((event.clientY - rect.top) / rect.height) * 100;

            card.style.setProperty('--mx', `${x.toFixed(2)}%`);
            card.style.setProperty('--my', `${y.toFixed(2)}%`);
        });

        card.addEventListener('pointerleave', () => {
            card.style.setProperty('--mx', '50%');
            card.style.setProperty('--my', '50%');
        });
    });
}

function initPageReveal() {
    const canvas = document.getElementById('pageRevealMask');
    if (!canvas || !window.matchMedia('(hover: hover)').matches) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const settings = {
        maskColor: 'rgba(9, 8, 18, 0.66)',
        startRadius: 10,
        endRadius: 142,
        radiusVariation: 0.42,
        lifetime: 560,
        stampStep: 14,
        maxStamps: 150,
    };
    const stamps = [];
    const pointer = { lastX: null, lastY: null };
    let width = 0;
    let height = 0;
    let dpr = 1;
    let running = false;

    const resize = () => {
        width = window.innerWidth;
        height = window.innerHeight;
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = settings.maskColor;
        ctx.fillRect(0, 0, width, height);
    };

    const addStamp = (x, y) => {
        if (stamps.length >= settings.maxStamps) stamps.shift();
        stamps.push({
            x,
            y,
            born: performance.now(),
            seed: Math.random() * Math.PI * 2,
            radius: settings.endRadius * (1 - settings.radiusVariation + Math.random() * settings.radiusVariation),
        });
    };

    const stampAlong = (x, y) => {
        if (pointer.lastX === null) {
            addStamp(x, y);
        } else {
            const dx = x - pointer.lastX;
            const dy = y - pointer.lastY;
            const distance = Math.hypot(dx, dy);
            const steps = Math.max(1, Math.ceil(distance / settings.stampStep));
            for (let index = 1; index <= steps; index += 1) {
                addStamp(pointer.lastX + (dx * index) / steps, pointer.lastY + (dy * index) / steps);
            }
        }
        pointer.lastX = x;
        pointer.lastY = y;
    };

    const carveInk = (x, y, radius, alpha, seed) => {
        const outerRadius = Math.max(0, Number(radius) || 0);
        const innerRadius = Math.min(outerRadius, outerRadius * 0.22);
        const gradient = ctx.createRadialGradient(x, y, innerRadius, x, y, outerRadius);
        gradient.addColorStop(0, `rgba(0, 0, 0, ${0.96 * alpha})`);
        gradient.addColorStop(0.58, `rgba(0, 0, 0, ${0.86 * alpha})`);
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();

        const segments = 32;
        for (let index = 0; index <= segments; index += 1) {
            const angle = (index / segments) * Math.PI * 2;
            const wobble = 0.78
                + 0.14 * Math.sin(angle * 3 + seed)
                + 0.08 * Math.sin(angle * 7 + seed * 2.1)
                + 0.05 * Math.sin(angle * 13 + seed * 0.7);
            const pointRadius = radius * wobble;
            const pointX = x + Math.cos(angle) * pointRadius;
            const pointY = y + Math.sin(angle) * pointRadius;
            if (index === 0) ctx.moveTo(pointX, pointY);
            else ctx.lineTo(pointX, pointY);
        }
        ctx.closePath();
        ctx.fill();
    };

    const render = (now) => {
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = settings.maskColor;
        ctx.fillRect(0, 0, width, height);
        ctx.globalCompositeOperation = 'destination-out';

        for (let index = stamps.length - 1; index >= 0; index -= 1) {
            const stamp = stamps[index];
            const progress = (now - stamp.born) / settings.lifetime;
            if (progress >= 1) {
                stamps.splice(index, 1);
                continue;
            }
            const eased = 1 - Math.pow(1 - progress, 3);
            carveInk(stamp.x, stamp.y, settings.startRadius + (stamp.radius - settings.startRadius) * eased, 1 - progress * progress, stamp.seed);
        }

        if (stamps.length) {
            requestAnimationFrame(render);
        } else {
            running = false;
        }
    };

    const start = () => {
        if (running) return;
        running = true;
        requestAnimationFrame(render);
    };

    const updatePointer = (event) => {
        stampAlong(event.clientX, event.clientY);
        start();
    };

    const stopPointer = () => {
        pointer.lastX = null;
        pointer.lastY = null;
    };

    resize();
    window.addEventListener('resize', resize, { passive: true });
    window.addEventListener('pointermove', updatePointer, { passive: true });
    window.addEventListener('pointerleave', stopPointer, { passive: true });
    window.addEventListener('blur', stopPointer, { passive: true });
}

function initHeroTextLoop() {
    const svg = document.querySelector('.curved-loop-svg');
    if (!svg || typeof svg.pauseAnimations !== 'function') return;

    const section = svg.closest('.hero') || svg;

    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                svg.unpauseAnimations();
            } else {
                svg.pauseAnimations();
            }
        });
    }, { threshold: 0 });

    observer.observe(section);
}

function initPostcardModal() {
    const modal = document.getElementById('postcardModal');
    const trigger = document.querySelector('[data-postcard-open]');
    if (!modal || !trigger) return;

    const close = () => {
        modal.classList.remove('is-open');
        modal.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('postcard-open');
    };

    trigger.addEventListener('click', (event) => {
        event.preventDefault();
        modal.classList.add('is-open');
        modal.setAttribute('aria-hidden', 'false');
        document.body.classList.add('postcard-open');
        modal.querySelector('.postcard-close')?.focus();
    });

    modal.querySelectorAll('[data-postcard-close]').forEach((button) => {
        button.addEventListener('click', close);
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && modal.classList.contains('is-open')) close();
    });
}
