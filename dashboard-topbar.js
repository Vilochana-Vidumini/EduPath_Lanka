// EduPath Lanka — Shared dashboard topbar (theme alignment + notifications)
import { database } from "./firebase-config.js";
import { ref, onValue } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
import { wireThemeToggle } from "./theme.js";

export function ensureDashboardTopbarLayout() {
    const topbarRight = document.querySelector('.topbar-right');
    if (!topbarRight) return;

    topbarRight.classList.add('dashboard-topbar-actions');

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
}

export function initDashboardNotifications(uid) {
    if (!uid) return;

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

    onValue(ref(database, `notifications/${uid}`), (snapshot) => {
        list.innerHTML = '';
        let unread = 0;

        if (!snapshot.exists()) {
            list.innerHTML = '<li class="notification-empty">No new notifications.</li>';
            if (badge) badge.classList.add('hidden');
            return;
        }

        const data = snapshot.val();
        const entries = Object.entries(data)
            .map(([id, n]) => ({ id, ...n }))
            .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

        if (entries.length === 0) {
            list.innerHTML = '<li class="notification-empty">No new notifications.</li>';
            if (badge) badge.classList.add('hidden');
            return;
        }

        entries.forEach((n) => {
            if (n.read === false || n.read === undefined) unread++;
            const li = document.createElement('li');
            li.className = 'notification-item';
            li.innerHTML = `
                <strong>${escapeHtml(n.title || 'Notification')}</strong>
                <p>${escapeHtml(n.message || n.body || '')}</p>
                <span class="notification-time">${formatNotifTime(n.createdAt)}</span>
            `;
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
    }, () => {
        list.innerHTML = '<li class="notification-empty">No new notifications.</li>';
        if (badge) badge.classList.add('hidden');
    });
}

function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function formatNotifTime(ts) {
    if (!ts) return '';
    const d = new Date(typeof ts === 'number' ? ts : Date.parse(ts));
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
