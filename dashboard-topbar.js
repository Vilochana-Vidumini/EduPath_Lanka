// EduPath Lanka — Shared dashboard topbar (theme alignment + notifications)
import { database } from "./firebase-config.js";
import { ref, onValue, serverTimestamp, update } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
import { wireThemeToggle } from "./theme.js";

let dashboardClockTimer = null;
let dashboardGreetingName = 'User';
let activeNotificationUid = '';

export function ensureDashboardTopbarLayout() {
    const topbarRight = document.querySelector('.topbar-right');
    if (!topbarRight) return;

    topbarRight.classList.add('dashboard-topbar-actions');

    if (!topbarRight.querySelector('.dashboard-clock-card')) {
        const profileSlot = topbarRight.querySelector('.user-profile, .ep-avatar-container');
        const clock = document.createElement('div');
        clock.className = 'dashboard-clock-card';
        clock.innerHTML = `
            <span class="dashboard-greeting" id="dashboard-greeting">Good Day, User</span>
            <time class="dashboard-live-clock" id="dashboard-live-clock" datetime="">--:--:--</time>
        `;
        if (profileSlot) {
            topbarRight.insertBefore(clock, profileSlot);
        } else {
            topbarRight.appendChild(clock);
        }
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

export function initDashboardNotifications(uid) {
    if (!uid) return;
    activeNotificationUid = uid;

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
            if (isUnreadNotification(n)) unread++;
            const li = document.createElement('li');
            li.className = `notification-item ${isUnreadNotification(n) ? 'unread' : 'read'}`;
            li.tabIndex = 0;
            li.setAttribute('role', 'menuitem');
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
    const clockEl = document.getElementById('dashboard-live-clock');
    if (!greetingEl && !clockEl) return;

    const now = new Date();
    const greeting = getTimeGreeting(now.getHours());
    if (greetingEl) greetingEl.textContent = `${greeting}, ${dashboardGreetingName}`;
    if (clockEl) {
        clockEl.textContent = now.toLocaleTimeString(undefined, {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
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

function isUnreadNotification(notification = {}) {
    if (notification.source === 'admin' && activeNotificationUid) {
        return notification.readBy?.[activeNotificationUid] !== true;
    }
    return notification.isRead === false || notification.read === false || notification.status === 'unread' || (notification.isRead === undefined && notification.read === undefined && notification.status === undefined);
}

function getNotificationTime(ts) {
    if (!ts) return 0;
    if (typeof ts === 'number') return ts;
    if (typeof ts === 'object' && typeof ts.seconds === 'number') return ts.seconds * 1000;
    const parsed = Date.parse(ts);
    return Number.isNaN(parsed) ? 0 : parsed;
}

async function openNotification(notification = {}) {
    if (notification.path && isUnreadNotification(notification)) {
        const updates = notification.source === 'admin' && activeNotificationUid
            ? {
                [`readBy/${activeNotificationUid}`]: true,
                [`readAtBy/${activeNotificationUid}`]: serverTimestamp()
            }
            : {
                isRead: true,
                read: true,
                status: 'read',
                readAt: serverTimestamp()
            };
        await update(ref(database, notification.path), updates).catch((error) => console.error('Notification read update failed:', error));
    }

    if (notification.source === 'guestMessage' && notification.relatedId) {
        await update(ref(database, `guestMessages/${notification.relatedId}`), {
            status: 'read',
            readAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        }).catch((error) => console.error('Guest message read update failed:', error));
    }

    if (notification.type === 'ASK_EDUPATH_MESSAGE' || notification.category === 'ASK_EDUPATH_MESSAGE') {
        if (location.pathname.toLowerCase().endsWith('/admin-dashboard.html') || document.getElementById('support-inbox')) {
            location.hash = 'support-inbox';
            window.dispatchEvent(new HashChangeEvent('hashchange'));
        } else {
            window.location.href = 'admin-dashboard.html#support-inbox';
        }
    }
}

function formatNotifTime(ts) {
    if (!ts) return '';
    const d = new Date(getNotificationTime(ts));
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
