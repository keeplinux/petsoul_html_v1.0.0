/**
 * Petsoul 官网 — 交互逻辑
 * 滚动视差 · 滚动触发动画 · 导航栏效果 · 数字跳动 · 移动端菜单
 */

document.addEventListener('DOMContentLoaded', () => {
    initNavbar();
    initScrollAnimations();
    initNavbarScroll();
    initCountUp();
    initMobileMenu();
});

/* ==========================================
   导航栏滚动效果 — 背景切换
   ========================================== */
function initNavbarScroll() {
    const navbar = document.getElementById('navbar');
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    }, { passive: true });
}

/* ==========================================
   Intersection Observer — 滚动触发动画
   ========================================== */
function initScrollAnimations() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                observer.unobserve(entry.target);
            }
        });
    }, {
        threshold: 0.15,
        rootMargin: '0px 0px -50px 0px'
    });

    document.querySelectorAll('[data-animate]').forEach(el => {
        observer.observe(el);
    });
}

/* ==========================================
   数字跳动计数动画
   ========================================== */
function initCountUp() {
    const countObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const el = entry.target;
                const target = parseFloat(el.dataset.count);
                animateCount(el, target);
                countObserver.unobserve(el);
            }
        });
    }, { threshold: 0.5 });

    document.querySelectorAll('[data-count]').forEach(el => {
        countObserver.observe(el);
    });
}

function animateCount(el, target) {
    const duration = 1500; // ms
    const start = performance.now();
    const isDecimal = target % 1 !== 0;

    function tick(now) {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        // easeOutCubic
        const eased = 1 - Math.pow(1 - progress, 3);
        const current = target * eased;

        el.textContent = isDecimal
            ? current.toFixed(1)
            : Math.floor(current).toLocaleString();

        if (progress < 1) {
            requestAnimationFrame(tick);
        }
    }

    requestAnimationFrame(tick);
}

/* ==========================================
   导航栏 (移动端也在此初始化)
   ========================================== */
function initNavbar() {
    // 导航锚点平滑滚动
    document.querySelectorAll('.navbar-nav a[href^="#"]').forEach(link => {
        link.addEventListener('click', (e) => {
            const target = document.querySelector(link.getAttribute('href'));
            if (target) {
                e.preventDefault();
                target.scrollIntoView({ behavior: 'smooth' });
            }
        });
    });
}

/* ==========================================
   移动端汉堡菜单
   ========================================== */
function initMobileMenu() {
    const toggle = document.getElementById('navbarToggle');
    if (!toggle) return;

    // 创建移动端菜单面板
    const mobileMenu = document.createElement('div');
    mobileMenu.className = 'navbar-mobile';
    mobileMenu.innerHTML = `
        <a href="#products">产品</a>
        <a href="#data">智能</a>
        <a href="#twin">数字孪生</a>
        <a href="#scenes">场景</a>
        <a href="#contact">支持</a>
    `;
    document.body.appendChild(mobileMenu);

    toggle.addEventListener('click', () => {
        toggle.classList.toggle('open');
        mobileMenu.classList.toggle('open');
        document.body.style.overflow = toggle.classList.contains('open') ? 'hidden' : '';
    });

    // 点击菜单项关闭
    mobileMenu.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', (e) => {
            const target = document.querySelector(link.getAttribute('href'));
            if (target) {
                e.preventDefault();
                target.scrollIntoView({ behavior: 'smooth' });
            }
            toggle.classList.remove('open');
            mobileMenu.classList.remove('open');
            document.body.style.overflow = '';
        });
    });
}
