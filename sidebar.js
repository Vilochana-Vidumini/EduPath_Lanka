// EduPath Lanka — Dashboard sidebar collapse & mobile toggle
const MOBILE_BP = 768;
const STORAGE_KEY = 'sidebarCollapsed';

export function applySidebarCollapsedEarly() {
    if (typeof window === 'undefined') return;
    if (localStorage.getItem(STORAGE_KEY) === 'true' && window.innerWidth > MOBILE_BP) {
        document.documentElement.classList.add('sidebar-collapsed');
    }
}

applySidebarCollapsedEarly();

function isMobile() {
    return window.innerWidth <= MOBILE_BP;
}

function setCollapsed(collapsed) {
    if (isMobile()) return;
    document.documentElement.classList.toggle('sidebar-collapsed', collapsed);
    localStorage.setItem(STORAGE_KEY, collapsed ? 'true' : 'false');
}

function syncCollapsedFromStorage() {
    if (isMobile()) {
        document.documentElement.classList.remove('sidebar-collapsed');
        return;
    }
    setCollapsed(localStorage.getItem(STORAGE_KEY) === 'true');
}

export function initDashboardSidebar() {
    const sidebar = document.getElementById('sidebar');
    const toggle = document.getElementById('sidebar-toggle');
    const closeBtn = document.getElementById('close-sidebar');
    const overlay = document.getElementById('sidebar-overlay');

    if (!sidebar) return;

    syncCollapsedFromStorage();

    const closeMobile = () => {
        sidebar.classList.remove('active');
        document.body.classList.remove('sidebar-mobile-open');
        overlay?.classList.remove('show');
    };

    const openMobile = () => {
        sidebar.classList.add('active');
        document.body.classList.add('sidebar-mobile-open');
        overlay?.classList.add('show');
    };

    toggle?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (isMobile()) {
            if (sidebar.classList.contains('active')) closeMobile();
            else openMobile();
        } else {
            setCollapsed(!document.documentElement.classList.contains('sidebar-collapsed'));
        }
    });

    closeBtn?.addEventListener('click', closeMobile);
    overlay?.addEventListener('click', closeMobile);

    window.addEventListener('resize', () => {
        if (!isMobile()) {
            closeMobile();
            syncCollapsedFromStorage();
        } else {
            document.documentElement.classList.remove('sidebar-collapsed');
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && sidebar.classList.contains('active')) closeMobile();
    });
}

export function updateSidebarUser({ fullName = 'User', role = 'student', photoURL = '' } = {}) {
    const nameEl = document.getElementById('sidebar-user-name');
    const roleEl = document.getElementById('sidebar-user-role');
    const avatarEl = document.getElementById('sidebar-user-avatar');

    if (nameEl) nameEl.textContent = fullName;
    if (roleEl) {
        roleEl.textContent = role;
        roleEl.className = `sidebar-user-role role-${role.toLowerCase()}`;
    }
    if (avatarEl) {
        const initials = fullName.split(' ').map((n) => n[0]).join('').substring(0, 2).toUpperCase();
        avatarEl.innerHTML = photoURL
            ? `<img src="${photoURL}" alt="${fullName}"><span class="online-dot" aria-hidden="true"></span>`
            : `<span class="sidebar-initials">${initials}</span><span class="online-dot" aria-hidden="true"></span>`;
    }
}
