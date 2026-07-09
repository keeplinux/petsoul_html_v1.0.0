document.addEventListener('DOMContentLoaded', () => {
    initNavbarState();
    initSmoothNavigation();
    initScrollAnimations();
    initCountUp();
    initMobileMenu();
    initShapeBlurCards();
    initRibbonsCursor();
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

function initRibbonsCursor() {
    const canvas = document.getElementById('cursorRibbons');
    if (!canvas) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        canvas.remove();
        return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const settings = {
        baseSpring: 0.03,
        baseFriction: 0.9,
        baseThickness: 30,
        pointCount: 48,
        speedMultiplier: 0.58,
        maxAge: 520,
        effectAmplitude: 2.2,
    };
    const colors = ['#ffffff', '#FC8EAC', '#66F0DC'];
    const ribbons = colors.map((color, index) => ({
        color,
        offsetX: (index - 1) * 10,
        offsetY: (index - 1) * 6,
        spring: settings.baseSpring + (index - 1) * 0.006,
        friction: settings.baseFriction - index * 0.015,
        velocity: { x: 0, y: 0 },
        points: Array.from({ length: settings.pointCount }, () => ({ x: window.innerWidth / 2, y: window.innerHeight / 2 })),
    }));

    const pointer = {
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
        active: false,
    };
    let width = 0;
    let height = 0;
    let dpr = 1;
    let lastTime = performance.now();
    let frameId = 0;

    const resize = () => {
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        width = window.innerWidth;
        height = window.innerHeight;
        canvas.width = Math.ceil(width * dpr);
        canvas.height = Math.ceil(height * dpr);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const updatePointer = (event) => {
        pointer.active = true;
        pointer.x = event.clientX;
        pointer.y = event.clientY;
    };

    const drawRibbon = (ribbon, time) => {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.shadowColor = ribbon.color;
        ctx.shadowBlur = 18;

        for (let i = ribbon.points.length - 1; i > 1; i -= 1) {
            const current = ribbon.points[i];
            const previous = ribbon.points[i - 1];
            const age = i / (ribbon.points.length - 1);
            const wave = Math.sin(time * 0.005 + i * 0.34) * settings.effectAmplitude * (1 - age);

            ctx.beginPath();
            ctx.moveTo(previous.x, previous.y + wave);
            ctx.lineTo(current.x, current.y - wave);
            ctx.lineWidth = Math.max(1, settings.baseThickness * Math.pow(1 - age, 1.25));
            ctx.strokeStyle = hexToRgba(ribbon.color, 0.58 * Math.pow(1 - age, 0.9));
            ctx.stroke();
        }

        ctx.restore();
    };

    const tick = (now) => {
        const dt = Math.min(now - lastTime, 48);
        lastTime = now;
        ctx.clearRect(0, 0, width, height);

        if (pointer.active) {
            ribbons.forEach((ribbon) => {
                const head = ribbon.points[0];
                const targetX = pointer.x + ribbon.offsetX;
                const targetY = pointer.y + ribbon.offsetY;

                ribbon.velocity.x += (targetX - head.x) * ribbon.spring;
                ribbon.velocity.y += (targetY - head.y) * ribbon.spring;
                ribbon.velocity.x *= ribbon.friction;
                ribbon.velocity.y *= ribbon.friction;

                head.x += ribbon.velocity.x;
                head.y += ribbon.velocity.y;

                for (let i = 1; i < ribbon.points.length; i += 1) {
                    const segmentDelay = settings.maxAge / (ribbon.points.length - 1);
                    const alpha = Math.min(1, (dt * settings.speedMultiplier) / segmentDelay);
                    ribbon.points[i].x += (ribbon.points[i - 1].x - ribbon.points[i].x) * alpha;
                    ribbon.points[i].y += (ribbon.points[i - 1].y - ribbon.points[i].y) * alpha;
                }

                drawRibbon(ribbon, now);
            });
        }

        frameId = requestAnimationFrame(tick);
    };

    resize();
    window.addEventListener('resize', resize, { passive: true });
    window.addEventListener('pointermove', updatePointer, { passive: true });
    window.addEventListener('pointerleave', () => {
        pointer.active = false;
    });
    window.addEventListener('blur', () => {
        pointer.active = false;
    });
    frameId = requestAnimationFrame(tick);
}

function hexToRgba(hex, alpha) {
    const normalized = hex.replace('#', '');
    const value = Number.parseInt(normalized.length === 3
        ? normalized.split('').map((char) => char + char).join('')
        : normalized, 16);
    const red = (value >> 16) & 255;
    const green = (value >> 8) & 255;
    const blue = value & 255;
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}
