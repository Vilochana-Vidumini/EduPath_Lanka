import { auth, database } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { ref, get, push, set, update, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
import { themeToggleButtonHTML, wireThemeToggle } from "./theme.js";
import {
    getDashboardDestination,
    getProfileDestination,
    getPublicHomeDestination,
    normalizeRole,
    SIDEBAR_STORAGE_KEY
} from "./shared-navigation.js";

async function handleLogout(e) {
    e.preventDefault();
    closeAuthPanel();
    await recordLogout();
    signOut(auth).then(() => {
        preserveThemeOnClear();
        sessionStorage.clear();
        window.location.href = 'login.html';
    }).catch(err => {
        console.error("Sign out error:", err);
        window.location.href = 'login.html';
    });
}

async function recordLogout() {
    const user = auth.currentUser;
    if (!user) return;
    const recordId = sessionStorage.getItem('edupathLoginRecordId');
    const fullName = localStorage.getItem('fullName') || user.displayName || user.email || 'User';
    const role = localStorage.getItem('userType') || 'user';
    const updates = {};
    updates[`users/${user.uid}/isOnline`] = false;
    updates[`users/${user.uid}/lastLogoutAt`] = serverTimestamp();
    updates[`presence/${user.uid}`] = { state: 'offline', lastChanged: serverTimestamp() };
    if (recordId) {
        updates[`loginHistory/${user.uid}/${recordId}/sessionStatus`] = 'completed';
        updates[`loginHistory/${user.uid}/${recordId}/logoutAt`] = serverTimestamp();
    }
    const logRef = push(ref(database, 'activityLogs'));
    updates[`activityLogs/${logRef.key}`] = {
        logId: logRef.key,
        uid: user.uid,
        userName: fullName,
        userRole: role,
        actionType: 'logout',
        description: `${fullName} logged out`,
        relatedEntityType: 'user',
        relatedEntityId: user.uid,
        createdAt: serverTimestamp()
    };
    return update(ref(database), updates).catch((err) => console.error('Logout tracking failed:', err));
}

export function preserveThemeOnClear() {
    const savedTheme = localStorage.getItem('theme');
    const sidebarCollapsed = localStorage.getItem(SIDEBAR_STORAGE_KEY) ?? localStorage.getItem('sidebarCollapsed');
    localStorage.clear();
    if (savedTheme) localStorage.setItem('theme', savedTheme);
    if (sidebarCollapsed) localStorage.setItem(SIDEBAR_STORAGE_KEY, sidebarCollapsed);
}



const AUTH_PANEL_LINKS = {
    student: [
        { href: getDashboardDestination('student'), icon: 'fa-tachometer-alt', label: 'My Dashboard' },
        { href: getProfileDestination('student'), icon: 'fa-user', label: 'My Profile' },
        { href: 'pathway.html', icon: 'fa-route', label: 'Pathway Finder' },
        { href: 'student-dashboard.html#pathway-history', icon: 'fa-poll-h', label: 'My Results' },
        { href: 'courses.html', icon: 'fa-book-open', label: 'Courses' },
        { href: 'scholarships.html', icon: 'fa-hand-holding-usd', label: 'Scholarships' },
<<<<<<< HEAD
        { href: 'talent-opportunities.html', icon: 'fa-star', label: 'Talent Opportunities' },
=======
>>>>>>> origin/Sewmini
        { href: 'mentors.html', icon: 'fa-chalkboard-teacher', label: 'Mentors' },
        { href: getPublicHomeDestination(), icon: 'fa-home', label: 'Public Home' },
    ],
    mentor: [
        { href: getDashboardDestination('mentor'), icon: 'fa-tachometer-alt', label: 'My Dashboard' },
        { href: getProfileDestination('mentor'), icon: 'fa-user-tie', label: 'My Profile' },
        { href: 'mentor-dashboard.html#requests', icon: 'fa-user-plus', label: 'Student Requests' },
        { href: 'mentor-dashboard.html#availability', icon: 'fa-calendar-check', label: 'Availability' },
        { href: 'mentor-dashboard.html#resources', icon: 'fa-book-reader', label: 'Guidance Resources' },
        { href: getPublicHomeDestination(), icon: 'fa-home', label: 'Public Home' },
    ],
    institute: [
        { href: 'institute-dashboard.html', icon: 'fa-tachometer-alt', label: 'Dashboard' },
        { href: 'institute-dashboard.html#profile', icon: 'fa-building', label: 'Institute Profile' },
        { href: 'institute-dashboard.html#courses', icon: 'fa-file-lines', label: 'Course Approvals' },
        { href: 'institute-dashboard.html#submit-course', icon: 'fa-plus-circle', label: 'Submit Course' },
        { href: 'institute-dashboard.html#support', icon: 'fa-headset', label: 'Admin Messages' },
        { href: 'index.html', icon: 'fa-home', label: 'Home' },
    ],
    admin: [
        { href: getDashboardDestination('admin'), icon: 'fa-tachometer-alt', label: 'My Dashboard' },
        { href: getProfileDestination('admin'), icon: 'fa-user-shield', label: 'My Profile' },
        { href: 'admin-dashboard.html#students', icon: 'fa-user-graduate', label: 'Manage Students' },
        { href: 'admin-dashboard.html#mentors', icon: 'fa-chalkboard-teacher', label: 'Manage Mentors' },
        { href: 'admin-dashboard.html#courses', icon: 'fa-book', label: 'Manage Courses' },
        { href: 'admin-dashboard.html#scholarships', icon: 'fa-hand-holding-usd', label: 'Manage Scholarships' },
        { href: 'admin-dashboard.html#reports', icon: 'fa-chart-bar', label: 'Reports' },
        { href: getPublicHomeDestination(), icon: 'fa-home', label: 'Public Home' },
    ],
};

function isDashboardPage() {
    const page = window.location.pathname.split('/').pop() || '';
    return page.includes('-dashboard.html');
}

function ensureAuthPanelShell() {
    if (document.getElementById('ep-auth-panel')) return;

    const overlay = document.createElement('div');
    overlay.id = 'ep-auth-panel-overlay';
    overlay.className = 'ep-auth-panel-overlay';
    overlay.setAttribute('aria-hidden', 'true');

    const panel = document.createElement('aside');
    panel.id = 'ep-auth-panel';
    panel.className = 'ep-auth-panel';
    panel.setAttribute('aria-hidden', 'true');
    panel.innerHTML = `
        <div class="ep-auth-panel-header">
            <a href="index.html" class="logo">EduPath<span>Lanka</span></a>
            <button type="button" class="ep-auth-panel-close" id="ep-auth-panel-close" aria-label="Close menu">
                <i class="fas fa-times"></i>
            </button>
        </div>
        <div class="ep-auth-panel-user" id="ep-auth-panel-user"></div>
        <ul class="ep-auth-panel-links" id="ep-auth-panel-links"></ul>
    `;

    document.body.appendChild(overlay);
    document.body.appendChild(panel);

    overlay.addEventListener('click', closeAuthPanel);
    document.getElementById('ep-auth-panel-close')?.addEventListener('click', closeAuthPanel);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeAuthPanel();
    });
}

export function openAuthPanel() {
    ensureAuthPanelShell();
    document.getElementById('ep-auth-panel')?.classList.add('open');
    document.getElementById('ep-auth-panel-overlay')?.classList.add('show');
    document.body.style.overflow = 'hidden';
}

export function closeAuthPanel() {
    document.getElementById('ep-auth-panel')?.classList.remove('open');
    document.getElementById('ep-auth-panel-overlay')?.classList.remove('show');
    document.body.style.overflow = '';
}

function renderAuthPanel(role, fullName, photoURL) {
    ensureAuthPanelShell();

    const links = AUTH_PANEL_LINKS[role] || AUTH_PANEL_LINKS.student;
    const linksEl = document.getElementById('ep-auth-panel-links');
    const userEl = document.getElementById('ep-auth-panel-user');

    if (linksEl) {
        linksEl.innerHTML = links.map((l) =>
            `<li><a href="${l.href}"><i class="fas ${l.icon}"></i>${l.label}</a></li>`
        ).join('') + `<li><a href="#" class="text-danger" id="ep-auth-panel-logout"><i class="fas fa-sign-out-alt"></i>Logout</a></li>`;

        linksEl.querySelectorAll('a:not(#ep-auth-panel-logout)').forEach((link) => {
            link.addEventListener('click', () => closeAuthPanel());
        });
    }

    if (userEl) {
        const initials = fullName.split(' ').map((n) => n[0]).join('').substring(0, 2).toUpperCase();
        userEl.innerHTML = `
            ${photoURL
                ? `<img src="${photoURL}" alt="${fullName}" style="width:42px;height:42px;border-radius:50%;object-fit:cover;">`
                : `<div class="sidebar-user-avatar"><span class="sidebar-initials">${initials}</span><span class="online-dot"></span></div>`
            }
            <div class="sidebar-user-info">
                <span class="sidebar-user-name">${fullName}</span>
                <span class="sidebar-user-role role-${role}">${role}</span>
            </div>
        `;
    }

    document.getElementById('ep-auth-panel-logout')?.addEventListener('click', handleLogout);
}

function injectAuthPanelTrigger() {
    if (isDashboardPage()) return;

    const navContainer = document.querySelector('.nav-container, header.navbar .nav-container');
    if (!navContainer || navContainer.querySelector('#ep-auth-panel-trigger')) return;

    const logo = navContainer.querySelector('.logo');
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.id = 'ep-auth-panel-trigger';
    trigger.className = 'ep-auth-panel-trigger';
    trigger.setAttribute('aria-label', 'Open account menu');
    trigger.title = 'Account menu';
    trigger.innerHTML = '<i class="fas fa-bars"></i>';

    if (logo?.parentElement?.classList.contains('nav-left-group')) {
        logo.parentElement.insertBefore(trigger, logo);
    } else if (logo) {
        const group = document.createElement('div');
        group.className = 'nav-left-group';
        logo.parentNode.insertBefore(group, logo);
        group.appendChild(trigger);
        group.appendChild(logo);
    } else {
        navContainer.insertBefore(trigger, navContainer.firstChild);
    }

    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        openAuthPanel();
    });
}

function showAuthPanelTrigger(show) {
    const trigger = document.getElementById('ep-auth-panel-trigger');
    if (trigger) trigger.classList.toggle('visible', show);
}

// Global CSS Injection for the premium avatar dropdown and toast notifications
const injectGlobalStyles = () => {
    if (document.getElementById('ep-global-styles')) return;
    const style = document.createElement('style');
    style.id = 'ep-global-styles';
    style.textContent = `
        /* Enforced Premium Responsive Navbar Styling */
        header.navbar, .navbar {
            height: 70px !important;
            background: var(--nav-bg-theme, rgba(255, 255, 255, 0.84)) !important;
            backdrop-filter: blur(18px) !important;
            -webkit-backdrop-filter: blur(18px) !important;
            border-bottom: 1px solid var(--nav-border-theme, rgba(226, 232, 240, 0.75)) !important;
            display: flex !important;
            align-items: center !important;
            justify-content: space-between !important;
            padding: 0 2rem !important;
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            z-index: 1000 !important;
            box-shadow: 0 4px 30px rgba(0, 0, 0, 0.03) !important;
            box-sizing: border-box !important;
            transition: all 0.3s ease !important;
        }

        .nav-container {
            display: flex !important;
            align-items: center !important;
            justify-content: space-between !important;
            width: 100% !important;
            max-width: 1400px !important;
            margin: 0 auto !important;
        }

        .logo {
            font-size: 1.5rem !important;
            font-weight: 800 !important;
            color: var(--theme-text, #1e293b) !important;
            text-decoration: none !important;
            display: flex !important;
            align-items: center !important;
            gap: 6px !important;
            z-index: 1002 !important;
        }

        .logo span {
            color: var(--theme-primary, #4f46e5) !important;
        }

        .nav-links {
            display: flex !important;
            align-items: center !important;
            gap: 1.5rem !important;
            list-style: none !important;
            margin: 0 !important;
            padding: 0 !important;
        }

        .nav-links a {
            font-weight: 600 !important;
            font-size: 14px !important;
            color: var(--theme-muted, #475569) !important;
            text-decoration: none !important;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
            padding: 8px 14px !important;
            border-radius: 50px !important;
        }

        .nav-links a:hover, .nav-links a.active {
            color: var(--theme-primary, #4f46e5) !important;
            background: rgba(79, 70, 229, 0.06) !important;
        }

        /* Avatar Dropdown Wrapper */
        .ep-avatar-container {
            position: relative;
            display: inline-flex;
            align-items: center;
            gap: 10px;
            cursor: pointer;
            padding: 6px 14px;
            border-radius: 50px;
            background: var(--theme-card, rgba(255, 255, 255, 0.9));
            border: 1px solid var(--theme-border, rgba(226, 232, 240, 0.85));
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.02);
            transition: all 0.25s ease;
            user-select: none;
            z-index: 1001;
        }

        .ep-avatar-container:hover {
            background: #ffffff;
            border-color: rgba(79, 70, 229, 0.25);
            box-shadow: 0 6px 18px rgba(79, 70, 229, 0.06);
            transform: translateY(-1px);
        }

        .ep-avatar-img {
            width: 32px;
            height: 32px;
            border-radius: 50%;
            object-fit: cover;
            border: 2px solid #4f46e5;
            display: flex;
            align-items: center;
            justify-content: center;
            background: linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%);
            color: #3730a3;
            font-weight: 700;
            font-size: 13px;
            text-transform: uppercase;
        }

        .ep-avatar-name {
            font-weight: 600;
            font-size: 13.5px;
            color: var(--theme-text, #1e293b);
            max-width: 90px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .ep-avatar-chevron {
            font-size: 9px;
            color: #64748b;
            transition: transform 0.25s ease;
        }

        .ep-avatar-container.active .ep-avatar-chevron {
            transform: rotate(180deg);
        }

        /* Dropdown Menu Card */
        .ep-dropdown-menu {
            position: absolute;
            top: calc(100% + 8px);
            right: 0;
            width: 220px;
            background: var(--theme-card, rgba(255, 255, 255, 0.95));
            border: 1px solid var(--theme-border, rgba(226, 232, 240, 0.8));
            border-radius: 14px;
            box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.06), 0 8px 10px -6px rgba(0, 0, 0, 0.02);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            padding: 6px;
            display: flex;
            flex-direction: column;
            gap: 2px;
            transform: translateY(10px) scale(0.96);
            opacity: 0;
            pointer-events: none;
            transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
            z-index: 10000;
        }

        .ep-dropdown-menu.show {
            transform: translateY(0) scale(1);
            opacity: 1;
            pointer-events: auto;
        }

        .ep-dropdown-header {
            padding: 10px 14px 8px 14px;
            border-bottom: 1px solid #f1f5f9;
            margin-bottom: 4px;
        }

        .ep-dropdown-username {
            font-weight: 700;
            font-size: 13.5px;
            color: var(--theme-text, #0f172a);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .ep-dropdown-role {
            display: inline-block;
            font-size: 9px;
            font-weight: 800;
            padding: 1px 6px;
            border-radius: 6px;
            margin-top: 3px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .role-student {
            background: rgba(79, 70, 229, 0.08);
            color: #4f46e5;
        }

        .role-mentor {
            background: rgba(139, 92, 246, 0.08);
            color: #8b5cf6;
        }

        .role-institute {
            background: rgba(4, 120, 87, 0.08);
            color: #047857;
        }

        .role-admin {
            background: rgba(239, 68, 68, 0.08);
            color: #ef4444;
        }

        .ep-dropdown-item {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 8px 12px;
            font-size: 13.5px;
            color: var(--theme-muted, #475569);
            text-decoration: none !important;
            border-radius: 8px;
            transition: all 0.15s ease;
            font-weight: 500;
        }

        .ep-dropdown-item i {
            font-size: 14px;
            color: #94a3b8;
            width: 18px;
            text-align: center;
            transition: color 0.15s ease;
        }

        .ep-dropdown-item:hover {
            background: #f1f5f9;
            color: #0f172a;
        }

        .ep-dropdown-item:hover i {
            color: #4f46e5;
        }

        .ep-dropdown-item.text-danger {
            color: #ef4444;
        }

        .ep-dropdown-item.text-danger:hover {
            background: rgba(239, 68, 68, 0.04);
            color: #ef4444;
        }

        .ep-dropdown-item.text-danger:hover i {
            color: #ef4444;
        }

        /* Toast Notifications */
        .ep-toast-stack {
            position: fixed;
            right: 24px;
            top: 24px;
            z-index: 100000;
            display: grid;
            gap: 12px;
            width: min(420px, calc(100vw - 32px));
            pointer-events: none;
        }

        .ep-toast {
            width: 100%;
            background: var(--theme-surface, #ffffff);
            color: var(--theme-text, #0f172a);
            border-radius: 14px;
            padding: 14px 14px 14px 16px;
            display: grid;
            grid-template-columns: auto 1fr auto;
            align-items: start;
            gap: 12px;
            box-shadow: 0 18px 42px rgba(15, 23, 42, 0.18);
            transform: translateX(18px);
            opacity: 0;
            transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
            border-left: 5px solid var(--theme-primary, #4f46e5);
            pointer-events: auto;
        }

        .ep-toast.show {
            transform: translateX(0);
            opacity: 1;
        }

        .ep-toast span {
            font-weight: 700;
            font-size: 13.5px;
            line-height: 1.45;
            color: var(--theme-text, #334155);
        }

        .ep-toast-close {
            width: 28px;
            height: 28px;
            border: 0;
            border-radius: 8px;
            background: transparent;
            color: var(--theme-muted, #64748b);
            cursor: pointer;
        }

        .ep-toast-close:hover {
            background: rgba(148, 163, 184, 0.14);
        }

        .ep-toast-success {
            border-left-color: #10b981;
        }

        .ep-toast-success i {
            color: #10b981;
        }

        .ep-toast-error {
            border-left-color: #ef4444;
        }

        .ep-toast-error i {
            color: #ef4444;
        }

        .ep-toast-warning {
            border-left-color: #f59e0b;
        }

        .ep-toast-warning i {
            color: #f59e0b;
        }

        .ep-toast-info {
            border-left-color: #2563eb;
        }

        .ep-toast-info i {
            color: #2563eb;
        }

        @media (max-width: 640px) {
            .ep-toast-stack {
                top: 14px;
                right: 14px;
                width: calc(100vw - 28px);
            }
        }

        /* Mobile Menu Logged-In Card styles */
        .mobile-user-card {
            background: var(--theme-card, rgba(255, 255, 255, 0.8));
            border: 1px solid var(--theme-border, rgba(226, 232, 240, 0.8));
            border-radius: 16px;
            padding: 1rem;
            margin: 1rem;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .mobile-user-info {
            display: flex;
            align-items: center;
            gap: 10px;
            border-bottom: 1px solid #f1f5f9;
            padding-bottom: 10px;
        }

        .mobile-user-details h4 {
            font-size: 13.5px;
            font-weight: 700;
            color: var(--theme-text, #0f172a);
            margin: 0;
        }

        /* Spacing and responsiveness fixes */
        @media (max-width: 991px) {
            .nav-links {
                display: none !important;
            }
        }
    `;
    document.head.appendChild(style);

    // Dynamic padding-top for body to prevent gaps/borders on dashboard pages
    const hasNavbar = !!document.querySelector('header.navbar, .navbar');
    const hasSidebar = !!document.querySelector('.sidebar');
    if (hasNavbar && !hasSidebar) {
        document.body.style.setProperty('padding-top', '70px', 'important');
    } else {
        document.body.style.setProperty('padding-top', '0px', 'important');
    }
};

// Custom premium Toast helper
export const showToast = (message, type = 'success', options = {}) => {
    injectGlobalStyles();
    const toastType = ['success', 'error', 'warning', 'info'].includes(type) ? type : 'info';
    const duration = Number(options.duration || 5000);
    let stack = document.getElementById('ep-toast-stack');
    if (!stack) {
        stack = document.createElement('div');
        stack.id = 'ep-toast-stack';
        stack.className = 'ep-toast-stack';
        stack.setAttribute('aria-live', 'polite');
        stack.setAttribute('aria-atomic', 'false');
        document.body.appendChild(stack);
    }

    const iconClass = toastType === 'success'
        ? 'fa-check-circle'
        : toastType === 'error'
            ? 'fa-times-circle'
            : toastType === 'warning'
                ? 'fa-exclamation-triangle'
                : 'fa-info-circle';
    const toast = document.createElement('div');
    toast.className = `ep-toast ep-toast-${toastType}`;
    toast.setAttribute('role', toastType === 'error' ? 'alert' : 'status');
    toast.innerHTML = `
        <i class="fas ${iconClass}" aria-hidden="true"></i>
        <span>${escapeToastHtml(message)}</span>
        <button type="button" class="ep-toast-close" aria-label="Close notification"><i class="fas fa-times" aria-hidden="true"></i></button>
    `;
    stack.appendChild(toast);

    let closeTimer = null;
    const closeToast = () => {
        if (closeTimer) clearTimeout(closeTimer);
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    };
    toast.querySelector('.ep-toast-close')?.addEventListener('click', closeToast);
    
    setTimeout(() => toast.classList.add('show'), 20);
    closeTimer = setTimeout(closeToast, duration);
    return closeToast;
};

window.EduPathToast = { show: showToast, success: (message, options) => showToast(message, 'success', options), error: (message, options) => showToast(message, 'error', options), warning: (message, options) => showToast(message, 'warning', options), info: (message, options) => showToast(message, 'info', options) };

function escapeToastHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function escapeAttr(value) {
    return escapeToastHtml(value).replace(/`/g, '&#096;');
}

// Activity and Session Timeout Manager
const setupSessionTimeout = (user) => {
    if (!user) return;

    if (!sessionStorage.getItem('loginTime')) {
        sessionStorage.setItem('loginTime', Date.now().toString());
    }
    if (!sessionStorage.getItem('lastActivity')) {
        sessionStorage.setItem('lastActivity', Date.now().toString());
    }

    const activityEvents = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    let throttleTimeout = null;

    const updateActivity = () => {
        if (!throttleTimeout) {
            sessionStorage.setItem('lastActivity', Date.now().toString());
            throttleTimeout = setTimeout(() => {
                throttleTimeout = null;
            }, 10000);
        }
    };

    activityEvents.forEach(event => {
        window.addEventListener(event, updateActivity, { passive: true });
    });

    const timeoutInterval = setInterval(() => {
        const now = Date.now();
        const loginTime = Number(sessionStorage.getItem('loginTime')) || now;
        const lastActivity = Number(sessionStorage.getItem('lastActivity')) || now;

        const thirtyMinutes = 30 * 60 * 1000;
        const twoHours = 2 * 60 * 60 * 1000;

        const isInactive = (now - lastActivity) > thirtyMinutes;
        const isMaxSessionExceeded = (now - loginTime) > twoHours;

        if (isInactive || isMaxSessionExceeded) {
            clearInterval(timeoutInterval);
            activityEvents.forEach(event => {
                window.removeEventListener(event, updateActivity);
            });

            signOut(auth).then(() => {
                preserveThemeOnClear();
                sessionStorage.clear();
                window.location.href = 'login.html?sessionExpired=true';
            }).catch(err => {
                console.error("Auto-logout error:", err);
                window.location.href = 'login.html';
            });
        }
    }, 60000);
};

document.addEventListener('DOMContentLoaded', () => {
    injectGlobalStyles();
    wireThemeToggle();

    const navLinksContainer = document.querySelector('.nav-links');
    const navButtonsDesktop = document.querySelector('.nav-buttons');
    const mobileLinksContainer = document.querySelector('.mobile-links');
    const dashboardUserProfile = document.querySelector('.user-profile');
    
    const path = window.location.pathname;
    const page = path.split('/').pop() || 'index.html';
    
    let loggedInUser = null;
    let currentUserType = '';

    // Standard public navigation items - KEPT 100% UNIFIED & NON-SHIFTING
    const publicLinks = [
        { href: 'index.html', text: 'Home' },
        { href: 'about.html', text: 'About Us' },
        { href: 'courses.html', text: 'Courses' },
        { href: 'mentors.html', text: 'Mentors' },
        { href: 'scholarships.html', text: 'Scholarships' },
        { href: 'pathway.html', text: 'Pathway Finder' },
        { href: 'institutes.html', text: 'Institutes' }
    ];

    function createNavItem(href, text, isActive) {
        return `<a href="${href}" class="${isActive ? 'active' : ''}">${text}</a>`;
    }

    function renderPublicDesktopNav() {
        const exploreActive = ['courses.html', 'scholarships.html', 'institutes.html'].includes(page);
        const guidanceActive = ['pathway.html', 'mentors.html'].includes(page);

        return `
            ${createNavItem('index.html', 'Home', page === 'index.html' || page === '')}
            <div class="nav-dropdown">
                <button type="button" class="nav-dropdown-toggle ${exploreActive ? 'active' : ''}">
                    Explore <i class="fas fa-chevron-down" aria-hidden="true"></i>
                </button>
                <div class="nav-dropdown-menu">
                    <a href="courses.html" class="${page === 'courses.html' ? 'active' : ''}"><i class="fas fa-book-open" aria-hidden="true"></i> Courses</a>
                    <a href="scholarships.html" class="${page === 'scholarships.html' ? 'active' : ''}"><i class="fas fa-graduation-cap" aria-hidden="true"></i> Scholarships</a>
                    <a href="institutes.html" class="${page === 'institutes.html' ? 'active' : ''}"><i class="fas fa-building-columns" aria-hidden="true"></i> Institutes</a>
                </div>
            </div>
            <div class="nav-dropdown">
                <button type="button" class="nav-dropdown-toggle ${guidanceActive ? 'active' : ''}">
                    Guidance <i class="fas fa-chevron-down" aria-hidden="true"></i>
                </button>
                <div class="nav-dropdown-menu">
                    <a href="pathway.html" class="${page === 'pathway.html' ? 'active' : ''}"><i class="fas fa-compass" aria-hidden="true"></i> Pathway Finder</a>
                    <a href="mentors.html" class="${page === 'mentors.html' ? 'active' : ''}"><i class="fas fa-user-tie" aria-hidden="true"></i> Mentors</a>
                </div>
            </div>
            ${createNavItem('about.html', 'About Us', page === 'about.html')}
        `;
    }

    function renderNavLinks(linksObj) {
        if (navLinksContainer) {
            navLinksContainer.innerHTML = renderPublicDesktopNav();
        }
        
        if (mobileLinksContainer) {
            let inner = mobileLinksContainer.querySelector('.mobile-links-inner') || mobileLinksContainer;
            const menuHtml = linksObj.map(l => createNavItem(l.href, l.text, l.href === page)).join('');
            const closeBtnHtml = mobileLinksContainer.querySelector('.close-btn') ? '' : '<div class="close-btn"><i class="fas fa-times"></i></div>';
            
            if (!mobileLinksContainer.querySelector('.mobile-links-inner')) {
                mobileLinksContainer.innerHTML = `
                    ${closeBtnHtml}
                    <nav class="mobile-links-inner">
                        ${menuHtml}
                    </nav>
                `;
            } else {
                mobileLinksContainer.querySelector('.mobile-links-inner').innerHTML = menuHtml;
            }
            
            const closeBtn = mobileLinksContainer.querySelector('.close-btn');
            if (closeBtn) {
                closeBtn.addEventListener('click', () => {
                    mobileLinksContainer.parentElement.classList.remove('active');
                });
            }
        }
        setActiveLinks();
    }

    function setActiveLinks() {
        document.querySelectorAll('.nav-links a, .mobile-links a').forEach(link => {
            const href = link.getAttribute('href');
            if (href === page || (page === '' && href === 'index.html')) {
                link.classList.add('active');
            } else {
                link.classList.remove('active');
            }
        });
    }

    // Default init with completely stable center menu links
    renderNavLinks(publicLinks);

    // Main Auth Listener
    onAuthStateChanged(auth, (user) => {
        if (user) {
            loggedInUser = user;
            setupSessionTimeout(user);

            // Fetch extra details from Realtime Database
            get(ref(database, 'users/' + user.uid)).then((snapshot) => {
                let dashboardUrl = getDashboardDestination('student');
                let profileUrl = getProfileDestination('student');
                let role = 'student';
                let fullName = user.displayName || 'EduPath User';
                let photoURL = user.photoURL || '';

                if (snapshot.exists()) {
                    const data = snapshot.val();
                    const rawType = data.userType || data.role || 'student';
                    role = normalizeRole(rawType) || 'student';
                    currentUserType = role;
                    fullName = data.fullName || fullName;
                    photoURL = data.photoURL || photoURL;
                }

                dashboardUrl = getDashboardDestination(role);
                profileUrl = getProfileDestination(role);
                
                // Perform route protection
                validateRoute(role);

                injectAuthPanelTrigger();
                renderAuthPanel(role, fullName, photoURL);
                showAuthPanelTrigger(true);

                // Keep center nav links stable for all logged-in states!
                renderNavLinks(publicLinks);

                // Init initials and display details
                const initials = fullName.split(' ').map(n => n[0]).join('').substring(0, 2);
                const firstName = fullName.split(' ')[0];
                const safeFullName = escapeToastHtml(fullName);
                const safeFirstName = escapeToastHtml(firstName);
                const safeInitials = escapeToastHtml(initials);
                const safePhotoURL = escapeAttr(photoURL);

                const dropdownHtml = `
                    <div class="ep-avatar-container" id="ep-user-dropdown-trigger">
                        ${photoURL ? `<img src="${safePhotoURL}" class="ep-avatar-img" alt="${safeFullName}">` : `<div class="ep-avatar-img">${safeInitials}</div>`}
                        <span class="ep-avatar-name">${safeFirstName}</span>
                        <i class="fas fa-chevron-down ep-avatar-chevron"></i>
                        
                        <div class="ep-dropdown-menu" id="ep-user-dropdown-menu">
                            <div class="ep-dropdown-header">
                                <div class="ep-dropdown-username">${safeFullName}</div>
                                <span class="ep-dropdown-role role-${role}">${role}</span>
                            </div>
                            <a href="${dashboardUrl}" class="ep-dropdown-item"><i class="fas fa-tachometer-alt"></i> My Dashboard</a>
                            <a href="${profileUrl}" class="ep-dropdown-item"><i class="fas fa-user"></i> My Profile</a>
<<<<<<< HEAD
                            <a href="${profileUrl}" class="ep-dropdown-item"><i class="fas fa-key"></i> Change Password</a>
=======
                            <a href="profile.html#security" class="ep-dropdown-item"><i class="fas fa-key"></i> Change Password</a>
>>>>>>> origin/Sewmini
                            <a href="${getPublicHomeDestination()}" class="ep-dropdown-item"><i class="fas fa-house"></i> Public Home</a>
                            <hr style="border: 0; border-top: 1px solid #f1f5f9; margin: 4px 0;">
                            <a href="#" class="ep-dropdown-item text-danger" id="ep-dropdown-logout"><i class="fas fa-sign-out-alt"></i> Logout</a>
                        </div>
                    </div>
                `;

                // Render in desktop navbar on public pages
                if (navButtonsDesktop) {
                    navButtonsDesktop.innerHTML = themeToggleButtonHTML() + dropdownHtml;
                    wireThemeToggle(navButtonsDesktop);
                }

                // Render in dashboard topbars
                if (dashboardUserProfile) {
                    dashboardUserProfile.outerHTML = dropdownHtml;
                }

                // Wire up dynamic click listener for dropdown toggling
                setTimeout(() => {
                    const trigger = document.getElementById('ep-user-dropdown-trigger');
                    const menu = document.getElementById('ep-user-dropdown-menu');
                    
                    if (trigger && menu) {
                        trigger.addEventListener('click', (e) => {
                            e.stopPropagation();
                            trigger.classList.toggle('active');
                            menu.classList.toggle('show');
                        });
                        
                        window.addEventListener('click', () => {
                            trigger.classList.remove('active');
                            menu.classList.remove('show');
                        });
                    }

                    document.getElementById('ep-dropdown-logout')?.addEventListener('click', handleLogout);
                    document.getElementById('mobile-logout-btn')?.addEventListener('click', handleLogout);
                }, 100);

                // Update Mobile Menu overlay with beautiful user card
                if (mobileLinksContainer) {
                    const inner = mobileLinksContainer.querySelector('.mobile-links-inner') || mobileLinksContainer;
                    inner.querySelectorAll('.btn-login, .btn-signup, #mobile-logout-btn').forEach(el => el.remove());
                    
                    const mobileCardHtml = `
                        <div class="mobile-user-card">
                            <div class="mobile-user-info">
                                ${photoURL ? `<img src="${safePhotoURL}" class="avatar-sm" style="width:40px;height:40px;border-radius:50%;object-fit:cover;" alt="${safeFullName}">` : `<div class="ep-avatar-img" style="width:40px;height:40px;font-size:12px;">${safeInitials}</div>`}
                                <div class="mobile-user-details">
                                    <h4>${safeFullName}</h4>
                                    <span class="ep-dropdown-role role-${role}" style="margin:0;">${role}</span>
                                </div>
                            </div>
                            <a href="${dashboardUrl}" class="ep-dropdown-item" style="padding: 6px 8px;"><i class="fas fa-tachometer-alt"></i> My Dashboard</a>
                            <a href="${profileUrl}" class="ep-dropdown-item" style="padding: 6px 8px;"><i class="fas fa-user"></i> My Profile</a>
                            <a href="${getPublicHomeDestination()}" class="ep-dropdown-item" style="padding: 6px 8px;"><i class="fas fa-house"></i> Public Home</a>
                            <a href="#" id="mobile-logout-btn" class="ep-dropdown-item text-danger" style="padding: 6px 8px;"><i class="fas fa-sign-out-alt"></i> Logout</a>
                        </div>
                    `;
                    
                    inner.querySelector('.mobile-user-card')?.remove();
                    inner.insertAdjacentHTML('beforeend', mobileCardHtml);
                    
                    setTimeout(() => {
                        document.getElementById('mobile-logout-btn')?.addEventListener('click', handleLogout);
                    }, 100);
                }
            });
        } else {
            loggedInUser = null;
            currentUserType = '';
            showAuthPanelTrigger(false);
            closeAuthPanel();
            
            // Check route protection
            validateRoute(null);

            // Re-render nav links for stable guest states
            renderNavLinks(publicLinks);

            if (navButtonsDesktop) {
                navButtonsDesktop.innerHTML = `
                    ${themeToggleButtonHTML()}
                    <a href="login.html" class="btn btn-login">Login</a>
                    <a href="signup.html" class="btn btn-signup">Sign Up</a>
                `;
                wireThemeToggle(navButtonsDesktop);
            }
            
            if (mobileLinksContainer) {
                const inner = mobileLinksContainer.querySelector('.mobile-links-inner') || mobileLinksContainer;
                inner.querySelector('.mobile-user-card')?.remove();
                
                if (!inner.querySelector('.btn-login')) {
                    inner.insertAdjacentHTML('beforeend', `
                        <a href="login.html" class="btn btn-login" style="margin-top: 1.5rem; text-align: center; display: block; border-radius: 50px;">Login</a>
                        <a href="signup.html" class="btn btn-signup" style="text-align: center; margin-top: 0.5rem; display: block; border-radius: 50px;">Sign Up</a>
                    `);
                }
            }
        }
    });

    function validateRoute(role) {
        const protectedRoutes = {
            'student-dashboard.html': 'student',
            'pathway.html': 'student',
            'mentor-dashboard.html': 'mentor',
            'institute-dashboard.html': 'institute',
            'admin-dashboard.html': 'admin'
        };

        const currentPage = window.location.pathname.split('/').pop();
        if (currentPage === 'profile.html' && !role) {
            window.location.href = `login.html?redirect=profile.html`;
            return;
        }

        const requiredRole = protectedRoutes[currentPage];

        if (requiredRole) {
            if (!role) {
                window.location.href = `login.html?redirect=${encodeURIComponent(currentPage)}`;
                return;
            }

            if (role !== requiredRole) {
                if (role === 'student') window.location.href = 'student-dashboard.html';
                else if (role === 'mentor') window.location.href = 'mentor-dashboard.html';
                else if (role === 'institute') window.location.href = 'institute-dashboard.html';
                else if (role === 'admin') window.location.href = 'admin-dashboard.html';
                else window.location.href = 'index.html';
            }
        }
    }

    document.addEventListener('click', (e) => {
        const linkTarget = e.target.closest('.restricted-link');
        if (linkTarget) {
            e.preventDefault();
            const destination = linkTarget.getAttribute('href') || linkTarget.getAttribute('data-href') || 'index.html';
            
            if (loggedInUser) {
                window.location.href = destination;
            } else {
                showToast("Please login or create an account to access this feature.", "warning");
                setTimeout(() => {
                    window.location.href = `login.html?redirect=${encodeURIComponent(destination)}`;
                }, 1500);
            }
            return;
        }

        const actionTarget = e.target.closest('.restricted-action');
        if (actionTarget) {
            e.preventDefault();
            
            if (loggedInUser) {
                const actionName = actionTarget.getAttribute('data-action');
                const event = new CustomEvent('restricted-action-triggered', {
                    detail: { action: actionName, element: actionTarget }
                });
                document.dispatchEvent(event);
            } else {
                showToast("Please login or create an account to access this feature.", "warning");
                setTimeout(() => {
                    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
                    window.location.href = `login.html?redirect=${encodeURIComponent(currentPage)}`;
                }, 1500);
            }
        }
    });
});
