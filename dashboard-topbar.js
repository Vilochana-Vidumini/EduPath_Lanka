// EduPath Lanka — Shared dashboard topbar (theme alignment + notifications)
import { database } from "./firebase-config.js";
import { ref, onValue, serverTimestamp, update } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
import { wireThemeToggle } from "./theme.js";
import { handleNotificationClick, isUnreadNotification } from "./notifications.js";

let dashboardClockTimer = null;
let dashboardGreetingName = 'User';
let activeNotificationUid = '';
let activeNotificationRole = '';

export function ensureDashboardTopbarLayout() {
    const topbar = document.querySelector('.topbar');
    const topbarRight = document.querySelector('.topbar-right');
    if (!topbarRight) return;

    topbarRight.classList.add('dashboard-topbar-actions');

    const existingDateTime = document.querySelector(".mentor-date-time");
    if (!existingDateTime) {
        let clock = document.querySelector('.dashboard-clock-card');
        if (!clock) {
            clock = document.createElement('div');
            clock.className = 'dashboard-clock-card';
            clock.innerHTML = `
                <span class="dashboard-greeting" id="dashboard-greeting">Good Day, User</span>
                <span class="dashboard-date" id="dashboard-date">Today</span>
                <time class="dashboard-live-clock" id="dashboard-live-clock" datetime="">--:--:--</time>
            `;
        }
        clock.classList.add('topbar-clock-card');
        const profileSlot = topbarRight.querySelector('.user-profile, .ep-avatar-container');
        const firstAction = topbarRight.querySelector('.live-sync, .theme-toggle, .topbar-theme-wrap, .notification-wrap') || profileSlot || topbarRight.firstElementChild;
        if (clock.parentElement !== topbarRight || clock.nextElementSibling !== firstAction) {
            topbarRight.insertBefore(clock, firstAction);
        }
        if (topbar) topbar.classList.add('has-topbar-clock');
    }

    if (!topbarRight.querySelector('.notification-wrap')) {
        const profileSlot = topbarRight.querySelector('.user-profile, .ep-avatar-container');
        const wrap = document.createElement('div');
        wrap.className = 'notification-wrap';
        wrap.innerHTML = `
            <button type="button" class="notification-btn" id="notification-btn" aria-label="Notifications" title="Notifications">
                <i class="fas fa-bell" aria-hidden="true"></i>
                <span class="notification-badge hidden" id="notification-badge">0</span>
            </button>
            <div class="notification-dropdown" id="notification-dropdown" role="menu" aria-hidden="true">
                <div class="notification-dropdown-header">Notifications</div>
                <ul class="notification-list" id="notification-list"></ul>
            </div>
        `;
        if (profileSlot) {
            topbarRight.insertBefore(wrap, profileSlot);
        } else {
            topbarRight.appendChild(wrap);
        }
    }

    const themeWrap = topbarRight.querySelector('.topbar-theme-wrap');
    const notifWrap = topbarRight.querySelector('.notification-wrap');
    if (themeWrap && notifWrap && themeWrap.compareDocumentPosition(notifWrap) & Node.DOCUMENT_POSITION_FOLLOWING) {
        topbarRight.insertBefore(themeWrap, notifWrap);
    }

    wireThemeToggle(topbarRight);
    startDashboardClock();
}

export function initDashboardNotifications(uid, role = '') {
    if (!uid) return;
    activeNotificationUid = uid;
    activeNotificationRole = role || inferDashboardRole();

    ensureDashboardTopbarLayout();

    const btn = document.getElementById('notification-btn');
    const dropdown = document.getElementById('notification-dropdown');
    const badge = document.getElementById('notification-badge');
    const list = document.getElementById('notification-list');

    if (!btn || !dropdown || !list) return;

    const toggleDropdown = (e) => {
        e.stopPropagation();
        const open = dropdown.classList.toggle('show');
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    };

    btn.addEventListener('click', toggleDropdown);

    document.addEventListener('click', (e) => {
        if (!dropdown.contains(e.target) && !btn.contains(e.target)) {
            dropdown.classList.remove('show');
            btn.setAttribute('aria-expanded', 'false');
        }
    });

    let personalNotifications = [];
    let adminNotifications = [];
    let guestMessageNotifications = [];

    const renderNotifications = () => {
        list.innerHTML = '';
        let unread = 0;

        const notifiedGuestIds = new Set(adminNotifications
            .filter((notification) => notification.type === 'ASK_EDUPATH_MESSAGE' || notification.category === 'ASK_EDUPATH_MESSAGE')
            .map((notification) => String(notification.relatedId || ''))
            .filter(Boolean));
        const fallbackGuestNotifications = guestMessageNotifications.filter((notification) => !notifiedGuestIds.has(String(notification.relatedId || '')));
        const entries = [...personalNotifications, ...adminNotifications, ...fallbackGuestNotifications]
            .sort((a, b) => getNotificationTime(b.createdAt) - getNotificationTime(a.createdAt));

        if (entries.length === 0) {
            list.innerHTML = '<li class="notification-empty">No new notifications.</li>';
            if (badge) badge.classList.add('hidden');
            return;
        }

        entries.forEach((n) => {
            if (isUnreadNotification(n, activeNotificationUid)) unread++;
            const li = document.createElement('li');
            li.className = `notification-item ${isUnreadNotification(n, activeNotificationUid) ? 'unread' : 'read'}`;
            li.tabIndex = 0;
            li.setAttribute('role', 'menuitem');
            li.dataset.notificationId = n.notificationId || n.id || '';
            li.dataset.targetPage = n.targetPage || '';
            li.dataset.targetSection = n.targetSection || '';
            li.dataset.relatedId = n.relatedEntityId || n.relatedId || '';
            li.innerHTML = `
                <strong>${escapeHtml(n.title || 'Notification')}</strong>
                <p>${escapeHtml(n.message || n.body || '')}</p>
                <span class="notification-time">${formatNotifTime(n.createdAt)}</span>
            `;
            li.addEventListener('click', () => openNotification(n));
            li.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    openNotification(n);
                }
            });
            list.appendChild(li);
        });

        if (badge) {
            if (unread > 0) {
                badge.textContent = unread > 9 ? '9+' : String(unread);
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        }
    };

    onValue(ref(database, `notifications/${uid}`), (snapshot) => {
        personalNotifications = snapshot.exists()
            ? Object.entries(snapshot.val() || {}).map(([id, n]) => ({ id, source: 'personal', path: `notifications/${uid}/${id}`, ...n }))
            : [];
        renderNotifications();
    }, () => {
        list.innerHTML = '<li class="notification-empty">No new notifications.</li>';
        if (badge) badge.classList.add('hidden');
    });

    onValue(ref(database, 'notifications/admin'), (snapshot) => {
        adminNotifications = snapshot.exists()
            ? Object.entries(snapshot.val() || {}).map(([id, n]) => ({ id, source: 'admin', path: `notifications/admin/${id}`, ...n }))
            : [];
        renderNotifications();
    }, () => renderNotifications());

    onValue(ref(database, 'guestMessages'), (snapshot) => {
        guestMessageNotifications = snapshot.exists()
            ? Object.entries(snapshot.val() || {})
                .filter(([, message]) => String(message?.status || 'new').toLowerCase() === 'new')
                .map(([id, message]) => ({
                    id: `guest-${id}`,
                    source: 'guestMessage',
                    title: 'New Ask EduPath Message',
                    message: 'A new guest message has been submitted through Ask EduPath.',
                    type: 'ASK_EDUPATH_MESSAGE',
                    category: 'ASK_EDUPATH_MESSAGE',
                    relatedId: id,
                    createdAt: message.createdAt || message.updatedAt,
                    isRead: false
                }))
            : [];
        renderNotifications();
    }, () => renderNotifications());
}

export function updateDashboardGreetingName(fullName = 'User') {
    dashboardGreetingName = getFirstName(fullName);
    startDashboardClock();
}

function startDashboardClock() {
    updateDashboardClock();
    if (dashboardClockTimer) return;
    dashboardClockTimer = setInterval(updateDashboardClock, 1000);
}

function updateDashboardClock() {
    const greetingEl = document.getElementById('dashboard-greeting');
    const dateEl = document.getElementById('dashboard-date');
    const clockEl = document.getElementById('dashboard-live-clock');
    if (!greetingEl && !dateEl && !clockEl) return;

    const now = new Date();
    const greeting = getTimeGreeting(now.getHours());
    if (greetingEl) greetingEl.textContent = `${greeting}, ${dashboardGreetingName}`;
    if (dateEl) {
        dateEl.textContent = now.toLocaleDateString(undefined, {
            weekday: 'long',
            day: '2-digit',
            month: 'long',
            year: 'numeric'
        });
    }
    if (clockEl) {
        clockEl.textContent = now.toLocaleTimeString(undefined, {
            hour: '2-digit',
            minute: '2-digit'
        });
        clockEl.setAttribute('datetime', now.toISOString());
    }
}

function getTimeGreeting(hour) {
    if (hour < 12) return 'Good Morning';
    if (hour < 17) return 'Good Afternoon';
    return 'Good Evening';
}

function getFirstName(fullName) {
    return String(fullName || 'User').trim().split(/\s+/)[0] || 'User';
}

function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function getNotificationTime(ts) {
    if (!ts) return 0;
    if (typeof ts === 'number') return ts;
    if (typeof ts === 'object' && typeof ts.seconds === 'number') return ts.seconds * 1000;
    const parsed = Date.parse(ts);
    return Number.isNaN(parsed) ? 0 : parsed;
}

async function openNotification(notification = {}) {
    if (notification.source === 'guestMessage' && notification.relatedId) {
        await update(ref(database, `guestMessages/${notification.relatedId}`), {
            status: 'read',
            readAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        }).catch((error) => console.error('Guest message read update failed:', error));
    }

    await handleNotificationClick(notification, {
        uid: activeNotificationUid,
        role: activeNotificationRole,
        showToast: window.EduPathToast?.show
    });
}

function formatNotifTime(ts) {
    if (!ts) return '';
    const d = new Date(getNotificationTime(ts));
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function inferDashboardRole() {
    if (document.body.classList.contains('student-dashboard-page')) return 'student';
    if (document.body.classList.contains('mentor-dashboard-page')) return 'mentor';
    if (document.body.classList.contains('admin-dashboard-page')) return 'admin';
    if (document.body.classList.contains('institute-dashboard-page')) return 'institute';
    return '';
}
