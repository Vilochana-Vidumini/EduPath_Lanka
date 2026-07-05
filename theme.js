// EduPath Lanka — Theme toggle (light / dark)
(function applyStoredThemeEarly() {
    const stored = localStorage.getItem('theme');
    const theme = stored === 'dark' || stored === 'light' ? stored : 'light';
    document.documentElement.setAttribute('data-theme', theme);
    const collapsed = localStorage.getItem('edupathSidebarCollapsed') ?? localStorage.getItem('sidebarCollapsed');
    if (collapsed === 'true' && window.innerWidth > 768) {
        document.documentElement.classList.add('sidebar-collapsed');
    }
})();

export function getTheme() {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

export function setTheme(theme) {
    const next = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    syncThemeToggleIcons();
}

export function toggleTheme() {
    setTheme(getTheme() === 'dark' ? 'light' : 'dark');
}

export function themeToggleButtonHTML() {
    const isDark = getTheme() === 'dark';
    return `
        <button type="button" class="theme-toggle" id="theme-toggle" aria-label="Toggle dark mode" title="Toggle theme">
            <i class="fas ${isDark ? 'fa-sun' : 'fa-moon'}" aria-hidden="true"></i>
        </button>
    `;
}

export function syncThemeToggleIcons() {
    const isDark = getTheme() === 'dark';
    document.querySelectorAll('.theme-toggle i').forEach((icon) => {
        icon.className = `fas ${isDark ? 'fa-sun' : 'fa-moon'}`;
    });
    document.querySelectorAll('.theme-toggle').forEach((btn) => {
        btn.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
        btn.setAttribute('title', isDark ? 'Light mode' : 'Dark mode');
    });
}

export function wireThemeToggle(root = document) {
    root.querySelectorAll('.theme-toggle, #theme-toggle').forEach((btn) => {
        if (btn.dataset.themeWired === 'true') return;
        btn.dataset.themeWired = 'true';
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleTheme();
        });
    });
    syncThemeToggleIcons();
}

document.addEventListener('DOMContentLoaded', () => {
    wireThemeToggle();

    const topbarRight = document.querySelector('.topbar-right');
    if (topbarRight && !topbarRight.querySelector('.theme-toggle')) {
        topbarRight.classList.add('dashboard-topbar-actions');
        const wrap = document.createElement('div');
        wrap.className = 'topbar-theme-wrap';
        wrap.innerHTML = themeToggleButtonHTML();
        const notifWrap = topbarRight.querySelector('.notification-wrap');
        const profile = topbarRight.querySelector('.user-profile, .ep-avatar-container');
        if (notifWrap) {
            topbarRight.insertBefore(wrap.firstElementChild, notifWrap);
        } else if (profile) {
            topbarRight.insertBefore(wrap.firstElementChild, profile);
        } else {
            topbarRight.insertBefore(wrap.firstElementChild, topbarRight.firstChild);
        }
        wireThemeToggle(topbarRight);
    }

    const mobileMenu = document.querySelector('.mobile-menu .mobile-links, .mobile-menu .mobile-links-inner');
    if (mobileMenu && !mobileMenu.querySelector('.theme-toggle')) {
        const row = document.createElement('div');
        row.className = 'mobile-theme-row';
        row.innerHTML = themeToggleButtonHTML().replace('id="theme-toggle"', 'id="theme-toggle-mobile"');
        mobileMenu.insertBefore(row, mobileMenu.firstChild);
        wireThemeToggle(row);
    }
});
