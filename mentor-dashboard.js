import { auth, database } from "./firebase-config.js";
import { onAuthStateChanged, signOut, updatePassword } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { ref, get, set, update, push, onValue, off, serverTimestamp, query, orderByChild, equalTo } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
import { showToast, preserveThemeOnClear } from "./auth-nav.js?v=20260614-brand";
import { initDashboardSidebar, updateSidebarUser } from "./sidebar.js";
import { ensureDashboardTopbarLayout, initDashboardNotifications, updateDashboardGreetingName } from "./dashboard-topbar.js";

document.addEventListener('DOMContentLoaded', () => {
    initDashboardSidebar();

    let currentUid = null;
    let requestDetailCache = {};
    let supportConversation = {};
    let connectedStudents = {};
    let mentorConversations = {};
    let mentorConversationRefs = {};
    let activeConversationId = null;
    let currentUserData = {};
    let currentRequestRows = [];
    let mentorAvailability = {};
    let mentorAppointments = {};
    let appointmentCalendarDate = new Date();
    let selectedAppointmentDate = dateKeyLocal(new Date());
    let activeAppointmentTab = 'pending';
    let mentorDateTimer = null;
    const weekDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

    // --- Authentication & Role Check ---
    onAuthStateChanged(auth, (user) => {
        if (!user) {
            window.location.href = 'login.html';
            return;
        }
        currentUid = user.uid;

        // Verify role
        get(ref(database, 'users/' + user.uid)).then((snapshot) => {
            if (snapshot.exists()) {
                const userData = snapshot.val();
                const role = String(userData.userType || userData.role || '').trim().toLowerCase();
                if (role !== 'mentor') {
                    showToast("Access denied. Directing to correct dashboard...", "error");
                    setTimeout(() => {
                        window.location.href = 'login.html';
                    }, 1500);
                    return;
                }
                currentUserData = userData;
                
                // Initialize Dashboard
                initMentorDashboard(user.uid, userData);
                ensureDashboardTopbarLayout();
                initDashboardNotifications(user.uid);
                listenForAdminSupport(user.uid);
            } else {
                window.location.href = 'login.html';
            }
        }).catch(err => {
            console.error(err);
            window.location.href = 'login.html';
        });
    });

    // --- Logout ---
    const logoutBtn = document.getElementById('logout-btn-sidebar');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            await recordMentorLogout();
            signOut(auth).then(() => {
                preserveThemeOnClear();
                sessionStorage.clear();
                window.location.href = 'login.html';
            });
        });
    }

    document.getElementById('mentor-support-form')?.addEventListener('submit', sendMentorSupportMessage);
    document.getElementById('save-availability-btn')?.addEventListener('click', saveAvailability);
    document.getElementById('add-unavailable-date-btn')?.addEventListener('click', addUnavailableDateFromInput);
    ['sessionDuration', 'bufferMinutes', 'mentoringMode', 'availabilityStatus', 'maxSessionsPerDay'].forEach((id) => {
        document.getElementById(id)?.addEventListener('change', () => renderAvailabilityOverviewPanel(mentorAvailability));
    });
    bindWeeklyAvailabilityEditor();
    bindAppointmentControls();
    startMentorDateTime();
    setupSectionNavigation();

    async function recordMentorLogout() {
        const user = auth.currentUser;
        if (!user) return;
        const recordId = sessionStorage.getItem('edupathLoginRecordId');
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
            userName: localStorage.getItem('fullName') || user.displayName || 'Mentor',
            userRole: 'mentor',
            actionType: 'logout',
            description: 'Mentor logged out',
            relatedEntityType: 'user',
            relatedEntityId: user.uid,
            createdAt: serverTimestamp()
        };
        return update(ref(database), updates).catch(console.error);
    }

    function initMentorDashboard(uid, userData) {
        updateSidebarUser({
            fullName: userData.fullName || 'Mentor',
            role: 'mentor',
            photoURL: userData.photoURL || '',
        });
        updateDashboardGreetingName(userData.fullName || 'Mentor');

        const firstName = (userData.fullName || 'Mentor').split(' ')[0];
        const welcomeNameEl = document.getElementById('welcome-name');
        if (welcomeNameEl) {
            welcomeNameEl.textContent = firstName;
        }

        // Load Mentor Specific Data from /mentors/{uid}
        get(ref(database, 'mentors/' + uid)).then((snapshot) => {
            let mentorData = { status: "pending" };
            if (snapshot.exists()) {
                mentorData = snapshot.val();
            }
            
            updateStatusUI(mentorData.status);
            calculateProfileCompletion(uid, userData, mentorData);
            renderAvailability(mentorData);
        });

        // Setup Listeners
        listenForRequests(uid, userData.fullName);
        listenForConnectedStudents(uid);
        listenForAvailability(uid);
        listenForAppointments(uid);
    }

    function listenForAdminSupport(uid) {
        onValue(ref(database, `conversations/${supportConversationId(uid)}`), (snapshot) => {
            supportConversation = snapshot.val() || {};
            renderMentorSupportMessages();
            if (window.location.hash === '#support') markMentorSupportRead();
        });
    }

    async function sendMentorSupportMessage(event) {
        event.preventDefault();
        const user = auth.currentUser;
        if (!user) return showToast('Please log in again.', 'error');
        const subject = document.getElementById('mentor-support-subject')?.value.trim() || 'Mentor Support';
        const message = document.getElementById('mentor-support-message')?.value.trim();
        if (!message) return;
        const btn = event.currentTarget.querySelector("button[type='submit']");
        const original = btn?.innerHTML;
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
        }
        try {
            const userSnap = await get(ref(database, `users/${user.uid}`));
            const userData = userSnap.val() || {};
            const conversationId = supportConversationId(user.uid);
            const messageRef = push(ref(database, `conversations/${conversationId}/messages`));
            const currentUnread = Number(supportConversation.unreadByAdmin || 0);
            const senderName = userData.fullName || user.displayName || 'Mentor';
            const updates = {};
            updates[`conversations/${conversationId}/conversationId`] = conversationId;
            updates[`conversations/${conversationId}/type`] = 'admin-support';
            updates[`conversations/${conversationId}/studentUid`] = user.uid;
            updates[`conversations/${conversationId}/userUid`] = user.uid;
            updates[`conversations/${conversationId}/participantIds/${user.uid}`] = true;
            updates[`conversations/${conversationId}/participantRoles/${user.uid}`] = 'mentor';
            updates[`conversations/${conversationId}/participantNames/${user.uid}`] = senderName;
            updates[`conversations/${conversationId}/lastMessage`] = message;
            updates[`conversations/${conversationId}/lastMessageAt`] = serverTimestamp();
            updates[`conversations/${conversationId}/lastSenderUid`] = user.uid;
            updates[`conversations/${conversationId}/unreadByAdmin`] = currentUnread + 1;
            updates[`conversations/${conversationId}/unreadByUser`] = 0;
            updates[`conversations/${conversationId}/status`] = 'open';
            updates[`conversations/${conversationId}/updatedAt`] = serverTimestamp();
            if (!supportConversation.createdAt) updates[`conversations/${conversationId}/createdAt`] = serverTimestamp();
            updates[`conversations/${conversationId}/messages/${messageRef.key}`] = {
                messageId: messageRef.key,
                conversationId,
                senderUid: user.uid,
                senderName,
                senderEmail: userData.email || user.email || '',
                senderRole: 'mentor',
                receiverRole: 'admin',
                subject,
                message,
                status: 'sent',
                createdAt: serverTimestamp(),
                readAt: null
            };
            await update(ref(database), updates);
            event.currentTarget.reset();
            showToast('Your message was sent to EduPath Admin.', 'success');
        } catch (error) {
            console.error(error);
            showToast(error?.message || 'Message could not be sent.', 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = original || '<i class="fas fa-paper-plane"></i> Send Message';
            }
        }
    }

    function renderMentorSupportMessages() {
        const container = document.getElementById('mentor-support-replies');
        if (!container) return;
        const messages = Object.values(supportConversation.messages || {}).sort((a, b) => getTimeValue(a.createdAt) - getTimeValue(b.createdAt));
        if (!messages.length) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-inbox"></i><p>No messages yet. Ask admin a question.</p></div>';
            return;
        }
        container.innerHTML = messages.map((message) => `
            <article class="list-item">
                <div class="list-icon ${message.senderUid === currentUid ? 'bg-blue' : 'bg-cyan'}"><i class="fas ${message.senderUid === currentUid ? 'fa-paper-plane' : 'fa-reply'}"></i></div>
                <div class="list-content">
                    <h4>${escapeHtml(message.subject || 'EduPath Support')} <span class="badge ${message.senderUid === currentUid ? 'badge-primary' : 'badge-success'}">${escapeHtml(message.senderRole || 'support')}</span></h4>
                    <p>${escapeHtml(message.message || '')}</p>
                    <span class="text-sm text-muted">${formatSupportDate(message.createdAt)} - ${escapeHtml(message.status || 'sent')}</span>
                </div>
            </article>
        `).join('');
    }

    async function markMentorSupportRead() {
        if (!currentUid || !supportConversation?.conversationId) return;
        const conversationId = supportConversationId(currentUid);
        const updates = {
            [`conversations/${conversationId}/unreadByUser`]: 0,
            [`conversations/${conversationId}/updatedAt`]: serverTimestamp()
        };
        Object.entries(supportConversation.messages || {}).forEach(([messageId, message]) => {
            if ((message.senderRole || '').toLowerCase() === 'admin' && (message.status || '').toLowerCase() !== 'read') {
                updates[`conversations/${conversationId}/messages/${messageId}/status`] = 'read';
                updates[`conversations/${conversationId}/messages/${messageId}/readAt`] = serverTimestamp();
            }
        });
        await update(ref(database), updates).catch(console.error);
    }

    function supportConversationId(uid) { return `admin_${uid}`; }
    async function safeGet(dbRef) {
        try {
            return await get(dbRef);
        } catch (error) {
            console.warn('Optional mentor dashboard read skipped:', error?.message || error);
            return null;
        }
    }
    function getTimeValue(value) {
        if (!value) return 0;
        if (typeof value === 'number') return value;
        if (typeof value === 'object' && value.seconds) return value.seconds * 1000;
        return new Date(value).getTime() || 0;
    }
    function formatSupportDate(value) {
        const time = getTimeValue(value);
        return time ? new Date(time).toLocaleString() : 'Just now';
    }
    function timeToMinutes(value = '00:00') {
        const [hours, minutes] = String(value).split(':').map(Number);
        return (hours || 0) * 60 + (minutes || 0);
    }
    function minutesToTime(total) {
        const hours = Math.floor(total / 60);
        const minutes = total % 60;
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }
    function formatTimeLabel(value = '') {
        if (!value) return 'N/A';
        const [hours, minutes] = String(value).split(':').map(Number);
        const date = new Date();
        date.setHours(hours || 0, minutes || 0, 0, 0);
        return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    }
    function appointmentSortTime(item = {}) {
        return new Date(`${item.date || '2099-12-31'}T${item.startTime || '23:59'}`).getTime() || getTimeValue(item.createdAt);
    }
    function formatDay(dateValue = '') {
        const date = new Date(`${dateValue}T00:00:00`);
        return Number.isNaN(date.getTime()) ? '--' : String(date.getDate()).padStart(2, '0');
    }
    function formatMonth(dateValue = '') {
        const date = new Date(`${dateValue}T00:00:00`);
        return Number.isNaN(date.getTime()) ? 'DATE' : date.toLocaleDateString(undefined, { month: 'short' });
    }
    function formatStatus(status = '') {
        return String(status || '').split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
    }
    function dateKeyLocal(date = new Date()) {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }
    function intervalsOverlap(startA, endA, startB, endB) {
        return timeToMinutes(startA) < timeToMinutes(endB) && timeToMinutes(endA) > timeToMinutes(startB);
    }
    function dayLabel(day = '') {
        return day.charAt(0).toUpperCase() + day.slice(1);
    }
    function normalizeAvailability(data = {}) {
        const legacyDays = Array.isArray(data.availableDays)
            ? data.availableDays.map((day) => String(day).toLowerCase())
            : String(data.availableDays || data.availabilityDays || '').split(',').map((day) => day.trim().toLowerCase()).filter(Boolean);
        const availableDays = {};
        const daySchedules = {};
        weekDays.forEach((day) => {
            const enabled = data.availableDays?.[day] === true || legacyDays.includes(day);
            const ranges = Array.isArray(data.daySchedules?.[day]) ? data.daySchedules[day] : [];
            availableDays[day] = enabled || ranges.length > 0;
            daySchedules[day] = ranges.length ? ranges : (availableDays[day] ? [{ startTime: data.startTime || '18:00', endTime: data.endTime || '20:00' }] : []);
        });
        return {
            timezone: data.timezone || 'Asia/Colombo',
            availableDays,
            daySchedules,
            sessionDuration: Number(data.sessionDuration || 60),
            bufferMinutes: Number(data.bufferMinutes || 15),
            mentoringMode: data.mentoringMode || data.mode || 'Online',
            maxSessionsPerDay: Number(data.maxSessionsPerDay || 3),
            unavailableDates: data.unavailableDates || {},
            availabilityStatus: data.availabilityStatus || data.currentStatus || 'available'
        };
    }
    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[ch]));
    }

    function firstMeaningful(...values) {
        for (const value of values) {
            if (Array.isArray(value) && value.length) return value;
            if (value && typeof value === 'object' && Object.keys(value).length) return value;
            const text = String(value ?? '').trim();
            if (text && !['n/a', 'na', 'undefined', 'null'].includes(text.toLowerCase())) return value;
        }
        return '';
    }

    function normalizeComparable(value) {
        if (Array.isArray(value)) return value.filter(Boolean).join('|');
        if (value && typeof value === 'object') return JSON.stringify(value);
        const text = String(value ?? '').trim();
        return ['n/a', 'na', 'undefined', 'null'].includes(text.toLowerCase()) ? '' : text;
    }

    function detailRow(label, value) {
        return `<div class="modal-row"><strong>${escapeHtml(label)}:</strong> <span>${escapeHtml(displayVal(value || 'N/A'))}</span></div>`;
    }

    function renderAvailability(mentorData = {}) {
        const normalized = normalizeAvailability(mentorData);
        const duration = document.getElementById('sessionDuration');
        const buffer = document.getElementById('bufferMinutes');
        const mode = document.getElementById('mentoringMode');
        const status = document.getElementById('availabilityStatus');
        const maxSessions = document.getElementById('maxSessionsPerDay');
        mentorAvailability = { ...normalized, mentorUid: currentUid };
        renderWeeklyAvailability();
        if (duration) duration.value = String(normalized.sessionDuration);
        if (buffer) buffer.value = String(normalized.bufferMinutes);
        if (mode) mode.value = normalized.mentoringMode;
        if (status) status.value = normalized.availabilityStatus;
        if (maxSessions) maxSessions.value = normalized.maxSessionsPerDay;
        renderUnavailableDates();
        renderAvailabilityOverviewPanel(normalized);
        renderOverviewAvailability(mentorAvailability);
    }

    async function saveAvailability() {
        if (!currentUid) return showToast('Please log in again.', 'error');
        const btn = document.getElementById('save-availability-btn');
        const original = btn?.innerHTML;
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
        }
        try {
            const { availableDays, daySchedules } = collectWeeklyAvailability();
            const sessionDuration = Number(document.getElementById('sessionDuration')?.value || 60);
            const bufferMinutes = Number(document.getElementById('bufferMinutes')?.value || 15);
            const mentoringMode = document.getElementById('mentoringMode')?.value || 'Online';
            const maxSessionsPerDay = Math.max(1, Number(document.getElementById('maxSessionsPerDay')?.value || 3));
            const enabledDayLabels = Object.entries(availableDays).filter(([, enabled]) => enabled).map(([day]) => dayLabel(day));
            if (!enabledDayLabels.length) throw new Error('Please select at least one available day.');
            const availability = {
                mentorUid: currentUid,
                timezone: 'Asia/Colombo',
                availableDays,
                daySchedules,
                sessionDuration,
                bufferMinutes,
                mentoringMode,
                maxSessionsPerDay,
                unavailableDates: mentorAvailability.unavailableDates || {},
                updatedAt: serverTimestamp()
            };
            const firstRange = Object.values(daySchedules).flat()[0] || {};
            const availableTime = firstRange.startTime && firstRange.endTime ? `${formatTimeLabel(firstRange.startTime)} - ${formatTimeLabel(firstRange.endTime)}` : 'Set mentoring hours';
            const updates = {};
            updates[`mentorAvailability/${currentUid}`] = availability;
            updates[`mentors/${currentUid}/availableDays`] = enabledDayLabels;
            updates[`mentors/${currentUid}/availableTime`] = availableTime;
            updates[`mentors/${currentUid}/mentoringMode`] = mentoringMode;
            updates[`mentors/${currentUid}/availabilityStatus`] = document.getElementById('availabilityStatus')?.value || 'available';
            updates[`mentors/${currentUid}/availabilityUpdatedAt`] = serverTimestamp();
            updates[`mentors/${currentUid}/updatedAt`] = serverTimestamp();
            await update(ref(database), updates);
            renderOverviewAvailability({
                availableDays: enabledDayLabels,
                availableTime,
                mentoringMode,
                availabilityStatus: document.getElementById('availabilityStatus')?.value || 'available',
                maxSessionsPerDay
            });
            showToast('Availability updated successfully.', 'success');
        } catch (error) {
            console.error(error);
            showToast(error?.message || 'Could not update availability.', 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = original || 'Update Availability';
            }
        }
    }

    function renderOverviewAvailability(mentorData = {}) {
        const container = document.getElementById('overview-availability-list');
        const normalized = normalizeAvailability(mentorData);
        const enabledDays = Object.entries(normalized.availableDays).filter(([, enabled]) => enabled).map(([day]) => dayLabel(day));
        const firstRange = Object.values(normalized.daySchedules).flat()[0] || {};
        const days = enabledDays.length ? enabledDays.join(', ') : 'Set days';
        const time = mentorData.availableTime || mentorData.availabilityTime || (firstRange.startTime && firstRange.endTime ? `${formatTimeLabel(firstRange.startTime)} - ${formatTimeLabel(firstRange.endTime)}` : 'Set mentoring hours');
        const status = mentorData.availabilityStatus || mentorData.currentStatus || 'available';
        if (container) container.innerHTML = `
            <div class="overview-row">
                <span class="date-tile">${escapeHtml(String(days).slice(0, 3).toUpperCase())}</span>
                <div><strong>${escapeHtml(days)}</strong><span>${escapeHtml(time)}</span></div>
                <span class="status-pill ${status === 'unavailable' ? 'is-muted' : ''}">${escapeHtml(status === 'unavailable' ? 'Unavailable' : 'Available')}</span>
            </div>
        `;
        const heroAvailability = document.getElementById('mentor-hero-availability');
        if (heroAvailability) heroAvailability.textContent = enabledDays.length ? `${enabledDays.length} days this week` : 'Set your availability';
    }

    function renderAvailabilityOverviewPanel(data = mentorAvailability) {
        const normalized = normalizeAvailability(data);
        normalized.sessionDuration = Number(document.getElementById('sessionDuration')?.value || normalized.sessionDuration);
        normalized.bufferMinutes = Number(document.getElementById('bufferMinutes')?.value || normalized.bufferMinutes);
        const enabledDays = weekDays.filter((day) => normalized.availableDays[day]);
        setTextSafe('availability-days-count', `${enabledDays.length} ${enabledDays.length === 1 ? 'day' : 'days'}`);
        setTextSafe('availability-duration-summary', `${normalized.sessionDuration} minutes`);
        setTextSafe('availability-buffer-summary', `${normalized.bufferMinutes} minutes`);
        const preview = document.getElementById('availability-weekly-preview');
        if (!preview) return;
        preview.innerHTML = weekDays.map((day) => {
            const ranges = normalized.daySchedules[day] || [];
            const firstRange = ranges[0];
            const text = normalized.availableDays[day] && firstRange
                ? `${formatTimeLabel(firstRange.startTime)} - ${formatTimeLabel(firstRange.endTime)}`
                : 'Not available';
            return `
                <div class="availability-preview-row weekly-preview-row ${normalized.availableDays[day] ? 'is-active' : ''}">
                    <span class="weekday-pill">${escapeHtml(dayLabel(day).slice(0, 3))}</span>
                    <i class="fas fa-circle"></i>
                    <p>${escapeHtml(text)}</p>
                </div>
            `;
        }).join('');
    }

    function startMentorDateTime() {
        updateMentorDateTime();
        if (!mentorDateTimer) mentorDateTimer = setInterval(updateMentorDateTime, 1000);
    }

    function updateMentorDateTime() {
        const now = new Date();
        const dateText = now.toLocaleDateString('en-LK', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        const timeText = now.toLocaleTimeString('en-LK', { hour: '2-digit', minute: '2-digit', hour12: true });
        const hour = now.getHours();
        let greeting = 'Good Night';
        if (hour >= 5 && hour < 12) greeting = 'Good Morning';
        else if (hour >= 12 && hour < 17) greeting = 'Good Afternoon';
        else if (hour >= 17 && hour < 21) greeting = 'Good Evening';
        const dateEl = document.getElementById('mentor-dashboard-date');
        const timeEl = document.getElementById('mentor-dashboard-time');
        const greetingEl = document.getElementById('mentor-dashboard-greeting');
        if (dateEl) dateEl.textContent = dateText;
        if (timeEl) timeEl.textContent = timeText;
        if (greetingEl) greetingEl.textContent = `${greeting},`;
    }

    function listenForAvailability(uid) {
        onValue(ref(database, `mentorAvailability/${uid}`), (snapshot) => {
            mentorAvailability = snapshot.val() || {};
            renderAvailability(mentorAvailability);
        });
    }

    function bindWeeklyAvailabilityEditor() {
        document.querySelectorAll('[data-add-range]').forEach((button) => {
            button.addEventListener('click', () => {
                const day = button.dataset.addRange;
                const normalized = normalizeAvailability(mentorAvailability);
                normalized.availableDays[day] = true;
                normalized.daySchedules[day] = [...(normalized.daySchedules[day] || []), { startTime: '18:00', endTime: '20:00' }];
                mentorAvailability = normalized;
                renderWeeklyAvailability();
                renderAvailabilityOverviewPanel(mentorAvailability);
            });
        });
        document.querySelectorAll('[data-day-toggle]').forEach((input) => {
            input.addEventListener('change', () => {
                const day = input.dataset.dayToggle;
                const normalized = normalizeAvailability(mentorAvailability);
                normalized.availableDays[day] = input.checked;
                if (input.checked && !(normalized.daySchedules[day] || []).length) normalized.daySchedules[day] = [{ startTime: '18:00', endTime: '20:00' }];
                mentorAvailability = normalized;
                renderWeeklyAvailability();
                renderAvailabilityOverviewPanel(mentorAvailability);
            });
        });
    }

    function renderWeeklyAvailability() {
        const normalized = normalizeAvailability(mentorAvailability);
        weekDays.forEach((day) => {
            const toggle = document.querySelector(`[data-day-toggle="${day}"]`);
            const ranges = document.querySelector(`[data-day-ranges="${day}"]`);
            const row = document.querySelector(`[data-day="${day}"]`);
            const addButton = document.querySelector(`[data-add-range="${day}"]`);
            if (toggle) toggle.checked = !!normalized.availableDays[day];
            if (addButton) addButton.disabled = !normalized.availableDays[day];
            row?.classList.toggle('is-disabled', !normalized.availableDays[day]);
            row?.classList.toggle('is-active', !!normalized.availableDays[day]);
            if (!ranges) return;
            ranges.innerHTML = (normalized.daySchedules[day] || []).map((range, index) => `
                <div class="time-range-row time-range-item">
                    <label class="time-input-wrap"><i class="far fa-clock"></i><input type="time" value="${escapeHtml(range.startTime || '18:00')}" data-range-start="${escapeHtml(day)}" data-range-index="${index}"></label>
                    <span class="time-range-separator">to</span>
                    <label class="time-input-wrap"><i class="far fa-clock"></i><input type="time" value="${escapeHtml(range.endTime || '20:00')}" data-range-end="${escapeHtml(day)}" data-range-index="${index}"></label>
                    <button class="remove-time-range" type="button" data-remove-range="${escapeHtml(day)}" data-range-index="${index}" aria-label="Remove range">&times;</button>
                </div>
            `).join('');
            ranges.querySelectorAll('[data-range-start]').forEach((input) => input.addEventListener('change', updateRangeInput));
            ranges.querySelectorAll('[data-range-end]').forEach((input) => input.addEventListener('change', updateRangeInput));
            ranges.querySelectorAll('[data-remove-range]').forEach((button) => button.addEventListener('click', () => {
                const data = normalizeAvailability(mentorAvailability);
                data.daySchedules[button.dataset.removeRange].splice(Number(button.dataset.rangeIndex), 1);
                data.availableDays[button.dataset.removeRange] = data.daySchedules[button.dataset.removeRange].length > 0;
                mentorAvailability = data;
                renderWeeklyAvailability();
                renderAvailabilityOverviewPanel(mentorAvailability);
            }));
        });
        renderAvailabilityOverviewPanel(normalized);
    }

    function updateRangeInput(event) {
        const input = event.currentTarget;
        const day = input.dataset.rangeStart || input.dataset.rangeEnd;
        const index = Number(input.dataset.rangeIndex);
        const data = normalizeAvailability(mentorAvailability);
        const range = data.daySchedules[day]?.[index];
        if (!range) return;
        if (input.dataset.rangeStart) range.startTime = input.value;
        if (input.dataset.rangeEnd) range.endTime = input.value;
        mentorAvailability = data;
        renderAvailabilityOverviewPanel(mentorAvailability);
    }

    function collectWeeklyAvailability() {
        const availableDays = {};
        const daySchedules = {};
        weekDays.forEach((day) => {
            const enabled = document.querySelector(`[data-day-toggle="${day}"]`)?.checked === true;
            const ranges = Array.from(document.querySelectorAll(`[data-day-ranges="${day}"] .time-range-row`)).map((row) => {
                const inputs = row.querySelectorAll('input[type="time"]');
                return { startTime: inputs[0]?.value || '', endTime: inputs[1]?.value || '' };
            }).filter((range) => range.startTime && range.endTime);
            availableDays[day] = enabled && ranges.length > 0;
            daySchedules[day] = availableDays[day] ? ranges : [];
            ranges.forEach((range) => {
                if (timeToMinutes(range.endTime) <= timeToMinutes(range.startTime)) {
                    throw new Error(`${dayLabel(day)} has an invalid time range.`);
                }
            });
        });
        return { availableDays, daySchedules };
    }

    function addUnavailableDateFromInput() {
        const input = document.getElementById('unavailableDateInput');
        const value = input?.value;
        if (!value) return;
        mentorAvailability.unavailableDates = { ...(mentorAvailability.unavailableDates || {}), [value]: true };
        input.value = '';
        renderUnavailableDates();
        renderAvailabilityOverviewPanel(mentorAvailability);
    }

    function renderUnavailableDates() {
        const container = document.getElementById('unavailable-dates-list');
        if (!container) return;
        const dates = Object.keys(mentorAvailability.unavailableDates || {}).sort();
        container.innerHTML = dates.length ? dates.map((date) => `
            <span class="availability-chip unavailable-date-chip"><i class="far fa-calendar"></i>${escapeHtml(formatUnavailableDateLabel(date))}<button type="button" data-remove-unavailable="${escapeHtml(date)}" aria-label="Remove ${escapeHtml(date)}">&times;</button></span>
        `).join('') : '<span class="text-muted text-sm">No unavailable dates added.</span>';
        container.querySelectorAll('[data-remove-unavailable]').forEach((button) => {
            button.addEventListener('click', () => {
                delete mentorAvailability.unavailableDates[button.dataset.removeUnavailable];
                renderUnavailableDates();
                renderAvailabilityOverviewPanel(mentorAvailability);
            });
        });
    }

    function formatUnavailableDateLabel(value = '') {
        const date = new Date(`${value}T00:00:00`);
        if (Number.isNaN(date.getTime())) return value;
        return date.toLocaleDateString(undefined, { month: 'long', day: '2-digit', year: 'numeric' });
    }

    function setupSectionNavigation() {
        const navLinks = document.querySelectorAll('.sidebar-links a[data-section]');
        const sections = document.querySelectorAll('.dashboard-section');

        function showSection(sectionId) {
            if (!sectionId) return;

            const target = document.getElementById(sectionId);
            if (!target) {
                console.warn('Mentor dashboard section not found:', sectionId);
                return;
            }

            sections.forEach((section) => {
                section.classList.remove('active');
                section.style.display = 'none';
            });

            target.classList.add('active');
            target.style.display = '';

            navLinks.forEach((link) => {
                link.classList.toggle('active', link.dataset.section === sectionId);
            });

            localStorage.setItem('mentorActiveSection', sectionId);

            if (sectionId === 'support') markMentorSupportRead();

            if (window.innerWidth <= 768) {
                const sidebar = document.getElementById('sidebar');
                const overlay = document.getElementById('sidebar-overlay');
                sidebar?.classList.remove('mobile-open', 'active');
                overlay?.classList.remove('active');
            }

            window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        navLinks.forEach((link) => {
            link.addEventListener('click', (event) => {
                const sectionId = link.dataset.section;
                if (!sectionId) return;
                event.preventDefault();
                showSection(sectionId);
                if (history.pushState) {
                    history.pushState(null, '', `#${sectionId}`);
                }
            });
        });

        document.querySelectorAll('[data-section-jump]').forEach((button) => {
            button.addEventListener('click', () => {
                const sectionId = button.dataset.sectionJump;
                showSection(sectionId);
                if (history.pushState) {
                    history.pushState(null, '', `#${sectionId}`);
                }
            });
        });

        window.addEventListener('popstate', () => {
            const sectionId = window.location.hash ? window.location.hash.replace('#', '') : 'overview-section';
            showSection(document.getElementById(sectionId) ? sectionId : 'overview-section');
        });

        const hashSection = window.location.hash ? window.location.hash.replace('#', '') : '';
        const savedSection = localStorage.getItem('mentorActiveSection');
        const defaultSection = 'overview-section';
        const initialSection = document.getElementById(hashSection)
            ? hashSection
            : document.getElementById(savedSection)
                ? savedSection
                : defaultSection;

        showSection(initialSection);
    }

    function bindAppointmentControls() {
        document.getElementById('appointment-prev-month')?.addEventListener('click', () => {
            appointmentCalendarDate.setMonth(appointmentCalendarDate.getMonth() - 1);
            renderMentorAppointments();
        });
        document.getElementById('appointment-next-month')?.addEventListener('click', () => {
            appointmentCalendarDate.setMonth(appointmentCalendarDate.getMonth() + 1);
            renderMentorAppointments();
        });
        document.querySelectorAll('[data-appointment-tab]').forEach((button) => {
            button.addEventListener('click', () => {
                activeAppointmentTab = button.dataset.appointmentTab;
                document.querySelectorAll('[data-appointment-tab]').forEach((item) => item.classList.toggle('active', item === button));
                document.querySelectorAll('[data-tab-panel]').forEach((panel) => panel.classList.toggle('active', panel.dataset.tabPanel === activeAppointmentTab));
            });
        });
        document.querySelectorAll('[data-calendar-view-mode]').forEach((button) => {
            button.addEventListener('click', () => {
                const mode = button.dataset.calendarViewMode;
                document.querySelectorAll('[data-calendar-view-mode]').forEach((item) => item.classList.toggle('active', item === button));
                if (mode === 'today') {
                    const today = new Date();
                    appointmentCalendarDate = new Date(today.getFullYear(), today.getMonth(), 1);
                    selectedAppointmentDate = dateKeyLocal(today);
                    renderMentorAppointments();
                    return;
                }
                renderMonthlyAppointmentCalendar(Object.entries(mentorAppointments || {}));
            });
        });
        document.querySelectorAll('[data-appointment-view]').forEach((button) => {
            button.addEventListener('click', () => {
                const view = button.dataset.appointmentView;
                document.querySelectorAll('[data-appointment-view]').forEach((item) => item.classList.toggle('active', item === button));
                document.getElementById('appointments-calendar-view')?.classList.toggle('hidden', view !== 'calendar');
                document.getElementById('appointments-list-view')?.classList.toggle('is-list-only', view === 'list');
            });
        });
    }

    function updateStatusUI(status) {
        const statEl = document.getElementById('stat-status');
        const alertEl = document.getElementById('status-alert');
        
        statEl.textContent = status ? status.charAt(0).toUpperCase() + status.slice(1) : "Pending";
        
        if (status === 'pending') {
            statEl.className = 'text-warning';
            if (alertEl) {
                alertEl.textContent = "Your mentor profile is currently under review by an admin. You can complete your profile details while waiting for approval.";
                alertEl.className = "alert alert-warning";
                alertEl.classList.remove('hidden');
            }
        } else if (status === 'approved') {
            statEl.className = 'text-success';
            if (alertEl) alertEl.classList.add('hidden');
        } else if (status === 'rejected') {
            statEl.className = 'text-danger';
            if (alertEl) {
                alertEl.textContent = "Your mentor application was rejected. Please contact support.";
                alertEl.className = "alert alert-danger";
                alertEl.classList.remove('hidden');
            }
        }
    }



    function calculateProfileCompletion(uid, userData, mentorData) {
        // Fields to verify (10 total)
        const fields = {
            fullName: userData.fullName || mentorData.fullName || '',
            email: userData.email || mentorData.email || '',
            phone: userData.phone || mentorData.phone || '',
            photoURL: userData.photoURL || mentorData.photoURL || '',
            mentorType: mentorData.mentorType || '',
            field: mentorData.field || mentorData.mentoringField || '',
            universityOrCompany: mentorData.universityOrCompany || mentorData.organization || '',
            experience: mentorData.experience || mentorData.experienceYears || '',
            bio: mentorData.bio || '',
            availableTime: mentorData.availableTime || ''
        };

        let completed = 0;
        const total = 10;

        // Check off checklist tasks dynamically
        const toggleTask = (id, condition) => {
            const el = document.getElementById(id);
            if (el) {
                if (condition) {
                    el.innerHTML = `<i class="fas fa-check-circle text-success" style="margin-right: 8px;"></i> ${el.textContent.trim()}`;
                    el.style.color = 'var(--success)';
                } else {
                    el.innerHTML = `<i class="far fa-circle text-muted" style="margin-right: 8px;"></i> ${el.textContent.trim()}`;
                    el.style.color = 'var(--text-muted)';
                }
            }
        };

        // Phone Task
        const hasPhone = !!fields.phone;
        toggleTask('task-phone', hasPhone);
        if (hasPhone) completed++;

        // Photo Task
        const hasPhoto = !!fields.photoURL;
        toggleTask('task-photo', hasPhoto);
        if (hasPhoto) completed++;

        // Mentor Type Task
        const hasType = !!fields.mentorType;
        toggleTask('task-type', hasType);
        if (hasType) completed++;

        // Field Task
        const hasField = !!fields.field;
        toggleTask('task-field', hasField);
        if (hasField) completed++;

        // Org Task
        const hasOrg = !!fields.universityOrCompany;
        toggleTask('task-org', hasOrg);
        if (hasOrg) completed++;

        // Experience Task
        const hasExp = !!fields.experience;
        toggleTask('task-exp', hasExp);
        if (hasExp) completed++;

        // Bio Task
        const hasBio = !!fields.bio;
        toggleTask('task-bio', hasBio);
        if (hasBio) completed++;

        // Time Task
        const hasTime = !!fields.availableTime;
        toggleTask('task-time', hasTime);
        if (hasTime) completed++;

        // Others counted towards overall completion calculation
        if (fields.fullName) completed++;
        if (fields.email) completed++;

        // Approved Task (guided checklist only)
        const isApproved = mentorData.status === 'approved';
        toggleTask('task-approved', isApproved);

        // Computation
        const percentage = Math.round((completed / total) * 100);

        // Save to Database
        update(ref(database, 'mentors/' + uid), { profileCompletion: percentage });

        // Update UI Progress Display
        const progressBar = document.getElementById('dynamic-profile-progress-bar');
        const progressBadge = document.getElementById('profile-strength-badge');
        const statProfileCompletion = document.getElementById('stat-profile-completion');
        const heroProfileCompletion = document.getElementById('mentor-hero-profile-completion');
        const progressMsg = document.getElementById('profile-strength-message');

        if (progressBar) progressBar.style.width = `${percentage}%`;
        if (statProfileCompletion) {
            statProfileCompletion.textContent = `${percentage}%`;
            statProfileCompletion.parentElement?.style.setProperty('--profile-progress', `${percentage * 3.6}deg`);
        }
        if (heroProfileCompletion) {
            heroProfileCompletion.textContent = `${percentage}%`;
            heroProfileCompletion.parentElement?.style.setProperty('--profile-progress', `${percentage * 3.6}deg`);
        }
        if (progressBadge) {
            progressBadge.textContent = `${percentage}% Strength`;
            if (percentage < 80) {
                progressBadge.style.backgroundColor = 'rgba(245, 158, 11, 0.1)';
                progressBadge.style.color = '#f59e0b';
            } else {
                progressBadge.style.backgroundColor = 'rgba(16, 185, 129, 0.1)';
                progressBadge.style.color = '#10b981';
            }
        }

        if (progressMsg) {
            if (percentage < 80) {
                progressMsg.textContent = "⚠️ Please complete your profile to at least 80% strength to ensure your application gets approved quickly by our admins!";
                progressMsg.style.color = '#f59e0b';
            } else {
                progressMsg.textContent = "🎉 Excellent! Your profile strength is optimized for immediate admin approval and student matching.";
                progressMsg.style.color = '#10b981';
            }
        }
    }



    function listenForRequests(uid, mentorName) {
        const reqRef = query(ref(database, 'mentorRequests'), orderByChild('mentorUid'), equalTo(uid));
        onValue(reqRef, async (snapshot) => {
            const requestsGrid = document.getElementById('requests-grid');
            const rejectedGrid = document.getElementById('rejected-grid');
            if (requestsGrid) requestsGrid.innerHTML = '';
            if (rejectedGrid) rejectedGrid.innerHTML = '';

            let pendingCount = 0;
            let rejectedCount = 0;
            const pendingRows = [];
            const rejectedRows = [];
            currentRequestRows = [];
            requestDetailCache = {};

            if (snapshot.exists()) {
                const data = snapshot.val();
                const filtered = Object.entries(data || {}).filter(([, req]) => req && req.mentorUid === uid);

                const rows = await Promise.all(filtered.map(async ([reqId, req]) => {
                    const studentUid = req.studentUid || '';
                    const [studentSnap, userSnap, pathwaySnap] = await Promise.all([
                        studentUid ? safeGet(ref(database, `students/${studentUid}`)) : Promise.resolve(null),
                        studentUid ? safeGet(ref(database, `users/${studentUid}`)) : Promise.resolve(null),
                        studentUid ? safeGet(ref(database, `pathwayResults/${studentUid}`)) : Promise.resolve(null),
                    ]);

                    const studentData = studentSnap?.exists() ? studentSnap.val() : {};
                    const userData = userSnap?.exists() ? userSnap.val() : {};
                    const pathwayData = pathwaySnap?.exists() ? pathwaySnap.val() : null;
                    const latestResult = req.pathwaySnapshot || getLatestPathwayResult(pathwayData);

                    return { reqId, req, studentData, userData, latestResult };
                }));

                rows.forEach((row) => {
                    const req = row.req;
                    const cardData = {
                        reqId: row.reqId,
                        request: req,
                        studentData: row.studentData,
                        userData: row.userData,
                        latestResult: row.latestResult,
                    };
                    requestDetailCache[row.reqId] = cardData;
                    currentRequestRows.push(cardData);

                    const status = String(req.status || 'pending').toLowerCase();
                    if (status === 'pending') {
                        pendingCount++;
                        pendingRows.push(cardData);
                    } else if (['rejected', 'closed', 'cancelled'].includes(status)) {
                        rejectedCount++;
                        rejectedRows.push(cardData);
                    }
                });
            }

            renderRequestTable(requestsGrid, pendingRows, 'pending');
            renderRequestTable(rejectedGrid, rejectedRows, 'closed');
            const statRequests = document.getElementById('stat-requests');
            const reqCount = document.getElementById('req-count');

            if (statRequests) statRequests.textContent = pendingCount;
            if (reqCount) reqCount.textContent = pendingCount;
            const overviewCount = document.getElementById('overview-requests-count');
            if (overviewCount) overviewCount.textContent = pendingCount;
            renderOverviewRequests();

            attachRequestListeners();
        });
    }

    function listenForConnectedStudents(uid) {
        onValue(ref(database, `mentorStudents/${uid}`), async (snapshot) => {
            const rawConnections = snapshot.val() || {};
            connectedStudents = rawConnections;
            renderConnectedStudentsTable();

            const enrichedEntries = await Promise.all(Object.entries(rawConnections).map(async ([studentUid, item]) => {
                const enriched = await enrichConnectedStudent(uid, studentUid, item || {});
                return [studentUid, enriched];
            }));
            connectedStudents = Object.fromEntries(enrichedEntries);
            syncConversationListeners(uid);
            renderConnectedStudentsTable();
        });
    }

    function listenForAppointments(uid) {
        const appointmentsRef = query(ref(database, 'mentorAppointments'), orderByChild('mentorUid'), equalTo(uid));
        onValue(appointmentsRef, (snapshot) => {
            mentorAppointments = snapshot.val() || {};
            renderMentorAppointments();
        });
    }

    function renderMentorAppointments() {
        const entries = Object.entries(mentorAppointments || {});
        const pending = entries.filter(([, item]) => String(item.status || '').toLowerCase() === 'pending')
            .sort(([, a], [, b]) => appointmentSortTime(a) - appointmentSortTime(b));
        const upcoming = entries.filter(([, item]) => String(item.status || '').toLowerCase() === 'accepted')
            .sort(([, a], [, b]) => appointmentSortTime(a) - appointmentSortTime(b));
        const completed = entries.filter(([, item]) => String(item.status || '').toLowerCase() === 'completed')
            .sort(([, a], [, b]) => appointmentSortTime(b) - appointmentSortTime(a));
        const closed = entries.filter(([, item]) => ['rejected', 'cancelled'].includes(String(item.status || '').toLowerCase()))
            .sort(([, a], [, b]) => appointmentSortTime(b) - appointmentSortTime(a));
        renderAppointmentList('mentor-pending-appointments', pending, 'pending');
        renderAppointmentList('mentor-upcoming-appointments', upcoming, 'accepted');
        renderAppointmentList('mentor-completed-appointments', completed, 'completed');
        renderAppointmentList('mentor-closed-appointments', closed, 'closed');
        renderMonthlyAppointmentCalendar(entries);
        renderSelectedDayAgenda(entries);
        renderOverviewAppointments(upcoming);
        updateAppointmentSummaries({ pending, upcoming, completed, closed });
        const completedStat = document.getElementById('stat-completed-sessions');
        if (completedStat) completedStat.textContent = completed.length;
        const upcomingStat = document.getElementById('stat-upcoming-sessions');
        if (upcomingStat) upcomingStat.textContent = upcoming.length;
        const nextSession = document.getElementById('mentor-next-session');
        if (nextSession) nextSession.textContent = upcoming[0] ? `${upcoming[0][1].date}, ${formatTimeLabel(upcoming[0][1].startTime)}` : 'No upcoming sessions';
    }

    function renderAppointmentList(containerId, rows, mode) {
        const container = document.getElementById(containerId);
        if (!container) return;
        if (!rows.length) {
            container.innerHTML = appointmentEmptyState(mode);
            return;
        }
        container.innerHTML = rows.map(([id, item]) => appointmentCard(id, item, mode)).join('');
        container.querySelectorAll('[data-accept-appointment]').forEach((button) => button.addEventListener('click', () => acceptAppointment(button.dataset.acceptAppointment)));
        container.querySelectorAll('[data-reject-appointment]').forEach((button) => button.addEventListener('click', () => rejectAppointment(button.dataset.rejectAppointment)));
        container.querySelectorAll('[data-complete-appointment]').forEach((button) => button.addEventListener('click', () => completeAppointment(button.dataset.completeAppointment)));
        container.querySelectorAll('[data-message-student]').forEach((button) => button.addEventListener('click', () => openConversation(button.dataset.messageStudent)));
        container.querySelectorAll('[data-view-appointment]').forEach((button) => button.addEventListener('click', () => openAppointmentDetail(button.dataset.viewAppointment)));
    }

    function appointmentCard(id, item, mode) {
        const status = String(item.status || 'pending').toLowerCase();
        const student = connectedStudents[item.studentUid] || {};
        const avatar = item.studentPhotoURL || student.studentPhotoURL || student.photoURL || '';
        const requested = item.createdAt ? formatRelativeTime(item.createdAt) : 'Recently requested';
        const date = appointmentDateLabel(item.date);
        const day = item.date ? new Date(`${item.date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long' }) : '';
        const time = formatTimeLabel(item.startTime);
        const duration = appointmentDurationLabel(item);
        const modeLabel = item.mode || 'Online Session';
        const actions = mode === 'pending' ? `
            <button class="btn btn-success btn-sm" data-accept-appointment="${escapeHtml(id)}"><i class="fas fa-check"></i> Accept</button>
            <button class="btn btn-danger btn-sm" data-reject-appointment="${escapeHtml(id)}"><i class="fas fa-xmark"></i> Reject</button>
            <button class="btn btn-outline btn-sm full-action" data-view-appointment="${escapeHtml(id)}"><i class="fas fa-eye"></i> View Details</button>
        ` : mode === 'accepted' ? `
            ${item.meetingLink || item.joinLink ? `<a class="btn btn-primary btn-sm" href="${escapeHtml(item.meetingLink || item.joinLink)}" target="_blank" rel="noopener"><i class="fas fa-video"></i> Join</a>` : ''}
            <button class="btn btn-primary btn-sm" data-message-student="${escapeHtml(item.studentUid || '')}"><i class="fas fa-message"></i> Message</button>
            <button class="btn btn-secondary btn-sm" data-complete-appointment="${escapeHtml(id)}">Complete</button>
        ` : mode === 'completed' ? `
            <button class="btn btn-outline btn-sm" data-view-appointment="${escapeHtml(id)}"><i class="fas fa-eye"></i> View Details</button>
            <button class="btn btn-primary btn-sm" data-message-student="${escapeHtml(item.studentUid || '')}">Message</button>
        ` : mode === 'closed' ? `
            <button class="btn btn-outline btn-sm" data-view-appointment="${escapeHtml(id)}"><i class="fas fa-eye"></i> View Details</button>
        ` : '';
        return `
            <article class="appointment-card mentor-appointment-row ${escapeHtml(status)}">
                <div class="appointment-student-cell">
                    ${avatar ? `<img src="${escapeHtml(avatar)}" alt="">` : `<span class="mentor-table-avatar">${escapeHtml(getInitials(item.studentName || 'Student'))}</span>`}
                    <div>
                        <h4>${escapeHtml(item.studentName || 'Student')}</h4>
                        <p>${escapeHtml(student.educationLevel || item.studentLevel || 'Student')}</p>
                        <span><i class="far fa-clock"></i> ${escapeHtml(requested)}</span>
                    </div>
                </div>
                <div class="appointment-topic-cell">
                    <h4>${escapeHtml(item.topic || 'Mentoring Session')}</h4>
                    ${status === 'pending' ? '<span class="new-pill">New</span>' : `<span class="appointment-status ${escapeHtml(status)}">${escapeHtml(formatStatus(status))}</span>`}
                    ${item.message ? `<p>${escapeHtml(item.message)}</p>` : ''}
                    ${item.rejectionReason ? `<p><strong>Reason:</strong> ${escapeHtml(item.rejectionReason)}</p>` : ''}
                </div>
                <div class="appointment-date-cell">
                    <strong><i class="far fa-calendar"></i> ${escapeHtml(date)}</strong>
                    <span>${escapeHtml(day)}</span>
                </div>
                <div class="appointment-time-cell">
                    <strong><i class="far fa-clock"></i> ${escapeHtml(time)}</strong>
                    <span>${escapeHtml(duration)}</span>
                </div>
                <div class="appointment-mode-cell">
                    <strong><i class="fas ${/zoom/i.test(modeLabel) ? 'fa-video' : 'fa-video-camera'}"></i> ${escapeHtml(modeLabel)}</strong>
                </div>
                <div class="appointment-actions">
                    ${actions}
                </div>
            </article>
        `;
    }

    function appointmentEmptyState(mode) {
        const copy = {
            pending: ['fa-hourglass-half', 'No pending session requests.', 'New requests from your mentees will appear here.'],
            accepted: ['fa-calendar-check', 'No upcoming mentoring sessions.', 'Accepted appointments will appear here.'],
            completed: ['fa-check-double', 'No completed sessions yet.', 'Completed mentoring sessions will be saved here.'],
            closed: ['fa-ban', 'No closed appointments.', 'Rejected or cancelled sessions will appear here.']
        }[mode] || ['fa-inbox', 'No appointments yet.', ''];
        return `<div class="empty-state"><i class="fas ${copy[0]}"></i><p>${copy[1]}</p><span>${copy[2]}</span></div>`;
    }

    function appointmentDateLabel(value = '') {
        const date = new Date(`${value}T00:00:00`);
        if (Number.isNaN(date.getTime())) return 'Date pending';
        return date.toLocaleDateString(undefined, { month: 'long', day: '2-digit', year: 'numeric' });
    }

    function appointmentDurationLabel(item = {}) {
        if (item.duration) return item.duration;
        const start = timeToMinutes(item.startTime || '00:00');
        const end = timeToMinutes(item.endTime || item.startTime || '00:00');
        const minutes = Math.max(0, end - start) || 45;
        return `${minutes} min`;
    }

    function totalAppointmentTime(rows = []) {
        const minutes = rows.reduce((sum, [, item]) => {
            const start = timeToMinutes(item.startTime || '00:00');
            const end = timeToMinutes(item.endTime || item.startTime || '00:00');
            return sum + Math.max(0, end - start);
        }, 0);
        if (!minutes) return '0h';
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return `${hours ? `${hours}h` : ''}${hours && mins ? ' ' : ''}${mins ? `${mins}m` : ''}`;
    }

    function formatRelativeTime(value) {
        const time = getTimeValue(value);
        if (!time) return 'Recently requested';
        const diff = Math.max(0, Date.now() - time);
        const hours = Math.floor(diff / 3600000);
        if (hours < 1) return 'Requested just now';
        if (hours < 24) return `Requested ${hours} hour${hours === 1 ? '' : 's'} ago`;
        const days = Math.floor(hours / 24);
        return `Requested ${days} day${days === 1 ? '' : 's'} ago`;
    }

    function openAppointmentDetail(appointmentId) {
        const item = mentorAppointments[appointmentId];
        if (!item) return showToast('Appointment details are unavailable.', 'error');
        let modal = document.getElementById('mentor-appointment-detail-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'mentor-appointment-detail-modal';
            modal.className = 'modal-overlay hidden';
            document.body.appendChild(modal);
        }
        modal.innerHTML = `
            <div class="modal-card appointment-detail-modal">
                <div class="modal-header">
                    <div>
                        <h3>Appointment Details</h3>
                        <p class="text-muted">${escapeHtml(item.studentName || 'Student')} - ${escapeHtml(formatStatus(item.status || 'pending'))}</p>
                    </div>
                    <button type="button" class="modal-close" id="mentor-appointment-detail-close" aria-label="Close">&times;</button>
                </div>
                <div class="detail-grid recommendation-detail-grid">
                    <div><span>Student</span><strong>${escapeHtml(item.studentName || 'Student')}</strong></div>
                    <div><span>Topic</span><strong>${escapeHtml(item.topic || 'Mentoring Session')}</strong></div>
                    <div><span>Date</span><strong>${escapeHtml(appointmentDateLabel(item.date))}</strong></div>
                    <div><span>Time</span><strong>${escapeHtml(formatTimeLabel(item.startTime))} - ${escapeHtml(formatTimeLabel(item.endTime))}</strong></div>
                    <div><span>Mode</span><strong>${escapeHtml(item.mode || 'Online Session')}</strong></div>
                    <div><span>Duration</span><strong>${escapeHtml(appointmentDurationLabel(item))}</strong></div>
                    <div class="full-width"><span>Message</span><strong>${escapeHtml(item.message || 'No message added.')}</strong></div>
                    ${item.rejectionReason ? `<div class="full-width"><span>Rejection Reason</span><strong>${escapeHtml(item.rejectionReason)}</strong></div>` : ''}
                    ${item.completedNote ? `<div class="full-width"><span>Completed Note</span><strong>${escapeHtml(item.completedNote)}</strong></div>` : ''}
                </div>
            </div>
        `;
        modal.classList.remove('hidden');
        document.getElementById('mentor-appointment-detail-close')?.addEventListener('click', () => modal.classList.add('hidden'));
        modal.addEventListener('click', (event) => {
            if (event.target === modal) modal.classList.add('hidden');
        }, { once: true });
    }

    function updateAppointmentSummaries(groups) {
        setTextSafe('appointment-summary-pending', groups.pending.length);
        setTextSafe('appointment-summary-upcoming', groups.upcoming.length);
        setTextSafe('appointment-summary-completed', groups.completed.length);
        setTextSafe('appointment-summary-closed', groups.closed.length);
        const today = dateKeyLocal(new Date());
        const todayRows = [...groups.pending, ...groups.upcoming, ...groups.completed, ...groups.closed].filter(([, item]) => item.date === today);
        const todayStudents = new Set(todayRows.map(([, item]) => item.studentUid).filter(Boolean));
        setTextSafe('appointment-today-count', todayRows.length);
        setTextSafe('appointment-today-students', todayStudents.size);
        setTextSafe('appointment-today-time', totalAppointmentTime(todayRows));
    }

    function renderMonthlyAppointmentCalendar(entries) {
        const container = document.getElementById('mentor-month-calendar');
        if (!container) return;
        const year = appointmentCalendarDate.getFullYear();
        const month = appointmentCalendarDate.getMonth();
        const first = new Date(year, month, 1);
        const start = new Date(first);
        start.setDate(first.getDate() - first.getDay());
        const title = document.getElementById('appointment-calendar-title');
        if (title) title.textContent = first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
        const byDate = groupAppointmentsByDate(entries);
        const today = dateKeyLocal(new Date());
        const availability = normalizeAvailability(mentorAvailability);
        container.innerHTML = Array.from({ length: 42 }, (_, index) => {
            const date = new Date(start);
            date.setDate(start.getDate() + index);
            const value = dateKeyLocal(date);
            const rows = byDate[value] || [];
            const inMonth = date.getMonth() === month;
            const weekday = weekDays[date.getDay() === 0 ? 6 : date.getDay() - 1];
            const available = availability.availableDays?.[weekday] === true && availability.unavailableDates?.[value] !== true;
            const classes = ['mentor-calendar-cell', inMonth ? '' : 'muted', value === today ? 'today' : '', value === selectedAppointmentDate ? 'selected' : '', available ? 'available' : 'unavailable'].filter(Boolean).join(' ');
            const dots = rows.slice(0, 3).map((item) => `<span class="status-dot ${escapeHtml(item.status || 'pending')}"></span>`).join('');
            return `<button type="button" class="${classes}" data-calendar-date="${value}">
                <span class="day-number">${date.getDate()}</span>
                <span class="calendar-dots">${dots}</span>
                ${rows.length ? `<small>${rows.length}</small>` : ''}
            </button>`;
        }).join('');
        container.querySelectorAll('[data-calendar-date]').forEach((button) => {
            button.addEventListener('click', () => {
                selectedAppointmentDate = button.dataset.calendarDate;
                renderMonthlyAppointmentCalendar(Object.entries(mentorAppointments || {}));
                renderSelectedDayAgenda(Object.entries(mentorAppointments || {}));
            });
        });
    }

    function renderSelectedDayAgenda(entries) {
        const container = document.getElementById('selected-day-agenda-list');
        const title = document.getElementById('selected-agenda-title');
        if (!container) return;
        const date = new Date(`${selectedAppointmentDate}T00:00:00`);
        if (title) title.textContent = Number.isNaN(date.getTime()) ? 'Selected Day' : date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
        const rows = entries.filter(([, item]) => item.date === selectedAppointmentDate).sort(([, a], [, b]) => appointmentSortTime(a) - appointmentSortTime(b));
        setTextSafe('selected-agenda-count', `${rows.length} ${rows.length === 1 ? 'session' : 'sessions'}`);
        container.innerHTML = rows.length ? rows.map(([id, item]) => {
            const status = String(item.status || 'pending').toLowerCase();
            const mode = ['rejected', 'cancelled'].includes(status) ? 'closed' : status === 'accepted' ? 'accepted' : status;
            return appointmentCard(id, item, mode);
        }).join('') : '<div class="empty-state"><i class="fas fa-calendar"></i><p>No appointments for this date.</p></div>';
        container.querySelectorAll('[data-accept-appointment]').forEach((button) => button.addEventListener('click', () => acceptAppointment(button.dataset.acceptAppointment)));
        container.querySelectorAll('[data-reject-appointment]').forEach((button) => button.addEventListener('click', () => rejectAppointment(button.dataset.rejectAppointment)));
        container.querySelectorAll('[data-complete-appointment]').forEach((button) => button.addEventListener('click', () => completeAppointment(button.dataset.completeAppointment)));
        container.querySelectorAll('[data-message-student]').forEach((button) => button.addEventListener('click', () => openConversation(button.dataset.messageStudent)));
        container.querySelectorAll('[data-view-appointment]').forEach((button) => button.addEventListener('click', () => openAppointmentDetail(button.dataset.viewAppointment)));
    }

    function groupAppointmentsByDate(entries) {
        return entries.reduce((groups, [, item]) => {
            if (!item.date) return groups;
            groups[item.date] = [...(groups[item.date] || []), item];
            return groups;
        }, {});
    }

    function renderOverviewAppointments(upcoming) {
        const container = document.getElementById('overview-appointments-list');
        if (!container) return;
        const rows = upcoming.slice(0, 3);
        container.innerHTML = rows.length ? rows.map(([, item]) => `
            <div class="overview-row">
                <span class="date-tile">${escapeHtml(formatDay(item.date))}</span>
                <div><strong>${escapeHtml(item.studentName || 'Student')}</strong><span>${escapeHtml(formatTimeLabel(item.startTime))} - ${escapeHtml(item.topic || 'Session')}</span></div>
                <span class="status-pill">Accepted</span>
            </div>
        `).join('') : '<div class="empty-state compact"><i class="fas fa-calendar-check"></i><p>No upcoming sessions.</p></div>';
    }

    function setTextSafe(id, value) {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    }

    async function acceptAppointment(appointmentId) {
        const appointment = mentorAppointments[appointmentId];
        if (!appointment) return;
        const latestSnap = await get(query(ref(database, 'mentorAppointments'), orderByChild('mentorUid'), equalTo(currentUid)));
        const latestAppointments = latestSnap.val() || {};
        const conflict = Object.entries(latestAppointments || {}).some(([id, item]) => id !== appointmentId
            && item.mentorUid === currentUid
            && item.date === appointment.date
            && ['accepted'].includes(String(item.status || '').toLowerCase())
            && intervalsOverlap(appointment.startTime, appointment.endTime, item.startTime, item.endTime));
        if (conflict) return showToast('This slot is already reserved.', 'error');
        const notificationRef = push(ref(database, `notifications/${appointment.studentUid}`));
        const updates = {};
        updates[`mentorAppointments/${appointmentId}/status`] = 'accepted';
        updates[`mentorAppointments/${appointmentId}/acceptedAt`] = serverTimestamp();
        updates[`mentorAppointments/${appointmentId}/updatedAt`] = serverTimestamp();
        updates[`notifications/${appointment.studentUid}/${notificationRef.key}`] = {
            notificationId: notificationRef.key,
            type: 'appointment_accepted',
            title: 'Your mentoring session was accepted',
            messagePreview: `${currentUserData.fullName || 'Your mentor'} accepted your session for ${appointment.date} at ${formatTimeLabel(appointment.startTime)}.`,
            relatedAppointmentId: appointmentId,
            mentorUid: currentUid,
            read: false,
            status: 'unread',
            createdAt: serverTimestamp()
        };
        await update(ref(database), updates);
        showToast('Appointment accepted.', 'success');
    }

    async function rejectAppointment(appointmentId) {
        const appointment = mentorAppointments[appointmentId];
        if (!appointment) return;
        const reason = prompt('Optional rejection reason:') || '';
        const notificationRef = push(ref(database, `notifications/${appointment.studentUid}`));
        const updates = {};
        updates[`mentorAppointments/${appointmentId}/status`] = 'rejected';
        updates[`mentorAppointments/${appointmentId}/rejectionReason`] = reason;
        updates[`mentorAppointments/${appointmentId}/rejectedAt`] = serverTimestamp();
        updates[`mentorAppointments/${appointmentId}/updatedAt`] = serverTimestamp();
        updates[`notifications/${appointment.studentUid}/${notificationRef.key}`] = {
            notificationId: notificationRef.key,
            type: 'appointment_rejected',
            title: 'Your mentoring session request was rejected',
            messagePreview: reason || `${currentUserData.fullName || 'Your mentor'} rejected your session request.`,
            relatedAppointmentId: appointmentId,
            mentorUid: currentUid,
            read: false,
            status: 'unread',
            createdAt: serverTimestamp()
        };
        await update(ref(database), updates);
        showToast('Appointment rejected.', 'success');
    }

    async function completeAppointment(appointmentId) {
        const appointment = mentorAppointments[appointmentId];
        if (!appointment) return;
        const sessionStart = new Date(`${appointment.date}T${appointment.startTime || '00:00'}`).getTime();
        if (Date.now() < sessionStart) return showToast('You can mark the session completed after it starts.', 'error');
        const completedNote = prompt('Completion note optional:') || '';
        const notificationRef = push(ref(database, `notifications/${appointment.studentUid}`));
        const updates = {};
        updates[`mentorAppointments/${appointmentId}/status`] = 'completed';
        updates[`mentorAppointments/${appointmentId}/completedAt`] = serverTimestamp();
        updates[`mentorAppointments/${appointmentId}/completedNote`] = completedNote;
        updates[`mentorAppointments/${appointmentId}/updatedAt`] = serverTimestamp();
        updates[`notifications/${appointment.studentUid}/${notificationRef.key}`] = {
            notificationId: notificationRef.key,
            type: 'appointment_completed',
            title: 'Mentoring session marked as completed',
            messagePreview: completedNote || 'Your mentor marked the session as completed.',
            relatedAppointmentId: appointmentId,
            mentorUid: currentUid,
            read: false,
            status: 'unread',
            createdAt: serverTimestamp()
        };
        await update(ref(database), updates);
        showToast('Session marked completed.', 'success');
    }

    async function enrichConnectedStudent(mentorUid, studentUid, item) {
        const [requestSnap, pathwaySnap] = await Promise.all([
            item.requestId ? safeGet(ref(database, `mentorRequests/${item.requestId}`)) : Promise.resolve(null),
            safeGet(ref(database, `pathwayResults/${studentUid}`))
        ]);
        const request = requestSnap?.exists() ? requestSnap.val() : {};
        const latestPathway = request.pathwaySnapshot || getLatestPathwayResult(pathwaySnap?.exists() ? pathwaySnap.val() : null) || {};
        const enriched = {
            ...item,
            studentUid,
            studentName: firstMeaningful(item.studentName, request.studentName, 'Student'),
            studentEmail: firstMeaningful(item.studentEmail, request.studentEmail, 'No email'),
            studentPhone: firstMeaningful(item.studentPhone, request.studentPhone, ''),
            educationLevel: firstMeaningful(item.educationLevel, request.educationLevel, latestPathway.educationLevel, latestPathway.basicProfile?.currentEducationLevel, ''),
            interestArea: firstMeaningful(item.interestArea, request.interestArea, latestPathway.interestArea, latestPathway.interests?.interestAreas?.[0], ''),
            futureGoal: firstMeaningful(item.futureGoal, request.futureGoal, latestPathway.futureGoal, latestPathway.goals?.dreamCareer, ''),
            learningMode: firstMeaningful(item.learningMode, request.learningMode, latestPathway.learningMode, latestPathway.learningPreferences?.learningMode, ''),
            skills: firstMeaningful(item.skills, request.skills, latestPathway.skills, latestPathway.skillsAndStrengths?.skills, []),
            pathwayResultId: firstMeaningful(item.pathwayResultId, request.pathwayResultId, latestPathway.resultId, ''),
            recommendedPathway: firstMeaningful(item.recommendedPathway, latestPathway.pathway, latestPathway.recommendedPathway, ''),
            pathwayScore: firstMeaningful(item.pathwayScore, latestPathway.pathwayScore, latestPathway.score, ''),
            pathwaySummary: firstMeaningful(item.pathwaySummary, latestPathway.recommendationSummary, latestPathway.summary, latestPathway.futureGoal, 'Pathway details available'),
            pathwaySnapshot: latestPathway
        };
        const updates = {};
        ['studentName', 'studentEmail', 'studentPhone', 'educationLevel', 'interestArea', 'futureGoal', 'learningMode', 'skills', 'pathwayResultId', 'recommendedPathway', 'pathwayScore', 'pathwaySummary'].forEach((field) => {
            const oldValue = normalizeComparable(item[field]);
            const newValue = normalizeComparable(enriched[field]);
            if (newValue && oldValue !== newValue) {
                updates[field] = enriched[field];
            }
        });
        if (Object.keys(updates).length) {
            updates.updatedAt = serverTimestamp();
            update(ref(database, `mentorStudents/${mentorUid}/${studentUid}`), updates).catch(console.error);
        }
        return enriched;
    }

    function syncConversationListeners(uid) {
        const activeIds = new Set(Object.keys(connectedStudents || {}).map((studentUid) => conversationId(uid, studentUid)));
        Object.entries(mentorConversationRefs).forEach(([id, conversationRef]) => {
            if (!activeIds.has(id)) {
                off(conversationRef);
                delete mentorConversationRefs[id];
                delete mentorConversations[id];
            }
        });
        Object.keys(connectedStudents || {}).forEach((studentUid) => {
            const id = conversationId(uid, studentUid);
            if (mentorConversationRefs[id]) return;
            const conversationRef = ref(database, `mentorConversations/${id}`);
            mentorConversationRefs[id] = conversationRef;
            onValue(conversationRef, (snap) => {
                if (snap.exists()) mentorConversations[id] = snap.val();
                else delete mentorConversations[id];
                renderConnectedStudentsTable();
                renderConversationList();
                renderOverviewMentees();
                renderOverviewMessages();
                renderActiveConversation();
            });
        });
        renderConversationList();
        renderOverviewMentees();
        renderOverviewMessages();
    }

    function renderConnectedStudents() {
        const acceptedGrid = document.getElementById('accepted-grid');
        if (!acceptedGrid) return;
        const rows = Object.entries(connectedStudents || {}).filter(([, item]) => (item.status || '').toLowerCase() === 'connected');
        const statAccepted = document.getElementById('stat-accepted');
        if (statAccepted) statAccepted.textContent = rows.length;
        const impactCount = document.getElementById('mentor-impact-count');
        if (impactCount) impactCount.textContent = rows.length;
        renderOverviewMentees();
        if (!rows.length) {
            acceptedGrid.innerHTML = '<div class="text-muted p-4 full-width text-center">No connected students yet. Accepted students will appear here.</div>';
            return;
        }
        acceptedGrid.innerHTML = rows.map(([studentUid, item]) => {
            const id = conversationId(currentUid, studentUid);
            const unread = Number(mentorConversations[id]?.unreadByMentor || 0);
            return `
                <div class="student-card glass">
                    <h4><i class="fas fa-user-graduate text-primary"></i> ${escapeHtml(item.studentName || 'Student')}</h4>
                    <p class="text-muted" style="margin:0 0 0.75rem; font-size:0.95rem;">${escapeHtml(item.studentEmail || 'No email')} • Connected ${formatSupportDate(item.connectedAt)}</p>
                    <div class="request-card-meta">
                        <span>${escapeHtml(item.educationLevel || 'Education unavailable')}</span>
                        <span>${escapeHtml(item.interestArea || 'Interest unavailable')}</span>
                    </div>
                    <p class="text-sm"><strong>Future goal:</strong> ${escapeHtml(item.futureGoal || 'N/A')}</p>
                    <p class="text-sm"><strong>Summary:</strong> ${escapeHtml(item.pathwaySummary || 'No pathway summary available.')}</p>
                    <div class="request-card-actions">
                        <button class="btn btn-primary btn-sm" data-message-student="${escapeHtml(studentUid)}">Message Student${unread ? ` (${unread})` : ''}</button>
                        <button class="btn btn-secondary btn-sm" data-view-connected="${escapeHtml(studentUid)}">View Pathway</button>
                    </div>
                </div>
            `;
        }).join('');
        acceptedGrid.querySelectorAll('[data-message-student]').forEach((button) => {
            button.addEventListener('click', () => openConversation(button.dataset.messageStudent));
        });
        acceptedGrid.querySelectorAll('[data-view-connected]').forEach((button) => {
            button.addEventListener('click', () => openConnectedStudentDetail(button.dataset.viewConnected));
        });
    }

    function renderConnectedStudentsTable() {
        const acceptedGrid = document.getElementById('accepted-grid');
        if (!acceptedGrid) return;
        const rows = Object.entries(connectedStudents || {}).filter(([, item]) => (item.status || '').toLowerCase() === 'connected');
        const statAccepted = document.getElementById('stat-accepted');
        if (statAccepted) statAccepted.textContent = rows.length;
        const impactCount = document.getElementById('mentor-impact-count');
        if (impactCount) impactCount.textContent = rows.length;
        renderOverviewMentees();
        if (!rows.length) {
            acceptedGrid.innerHTML = '<div class="text-muted p-4 full-width text-center">No connected students yet. Accepted students will appear here.</div>';
            return;
        }
        acceptedGrid.innerHTML = `
            <div class="student-table-card glass">
                <table class="student-data-table">
                    <thead>
                        <tr>
                            <th>Student</th>
                            <th>Education</th>
                            <th>Interest</th>
                            <th>Future Goal</th>
                            <th>Connected</th>
                            <th>Messages</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows.map(([studentUid, item]) => {
                            const id = conversationId(currentUid, studentUid);
                            const unread = Number(mentorConversations[id]?.unreadByMentor || 0);
                            return `
                                <tr>
                                    <td>
                                        <div class="student-cell">
                                            <span class="mini-avatar">${escapeHtml(getInitials(item.studentName || 'Student'))}</span>
                                            <div><strong>${escapeHtml(item.studentName || 'Student')}</strong><span>${escapeHtml(item.studentEmail || 'No email')}</span></div>
                                        </div>
                                    </td>
                                    <td>${escapeHtml(firstMeaningful(item.educationLevel, 'N/A'))}</td>
                                    <td>${escapeHtml(firstMeaningful(item.interestArea, 'N/A'))}</td>
                                    <td class="table-message">${escapeHtml(firstMeaningful(item.futureGoal, item.pathwaySummary, 'N/A'))}</td>
                                    <td>${escapeHtml(formatSupportDate(item.connectedAt))}</td>
                                    <td>${unread ? `<span class="badge badge-warning">${unread} unread</span>` : '<span class="badge badge-approved">Read</span>'}</td>
                                    <td>
                                        <div class="table-actions">
                                            <button class="btn btn-primary btn-sm" data-message-student="${escapeHtml(studentUid)}">Message${unread ? ` (${unread})` : ''}</button>
                                            <button class="btn btn-secondary btn-sm" data-view-connected="${escapeHtml(studentUid)}">View Pathway</button>
                                        </div>
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
        acceptedGrid.querySelectorAll('[data-message-student]').forEach((button) => {
            button.addEventListener('click', () => openConversation(button.dataset.messageStudent));
        });
        acceptedGrid.querySelectorAll('[data-view-connected]').forEach((button) => {
            button.addEventListener('click', () => openConnectedStudentDetail(button.dataset.viewConnected));
        });
    }

    function renderRequestTable(container, rows = [], mode = 'pending') {
        if (!container) return;
        if (!rows.length) {
            container.innerHTML = `<div class="text-muted p-4 full-width text-center">${mode === 'pending' ? 'No pending requests found.' : 'No closed requests yet.'}</div>`;
            return;
        }
        const showDecisionActions = mode === 'pending';
        container.innerHTML = `
            <div class="student-table-card glass">
                <table class="student-data-table">
                    <thead>
                        <tr>
                            <th>Student</th>
                            <th>Education</th>
                            <th>Interest</th>
                            <th>Message</th>
                            <th>Requested</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows.map((data) => {
                            const req = data.request || {};
                            const latest = data.latestResult || req.pathwaySnapshot || {};
                            const status = String(req.status || 'pending').toLowerCase();
                            const badge = status === 'pending' ? 'badge-warning' : status === 'accepted' ? 'badge-approved' : 'badge-rejected';
                            const studentName = req.studentName || data.userData?.fullName || 'Student';
                            const studentEmail = req.studentEmail || data.userData?.email || 'No email';
                            const education = req.educationLevel || data.studentData?.educationLevel || data.studentData?.education || data.userData?.educationLevel || latest.educationLevel || latest.basicProfile?.currentEducationLevel || 'N/A';
                            const interest = req.interestArea || data.studentData?.interestArea || data.studentData?.interest || data.userData?.interestArea || latest.interestArea || latest.interests?.interestAreas?.[0] || 'N/A';
                            return `
                                <tr>
                                    <td>
                                        <div class="student-cell">
                                            <span class="mini-avatar">${escapeHtml(getInitials(studentName))}</span>
                                            <div><strong>${escapeHtml(studentName)}</strong><span>${escapeHtml(studentEmail)}</span></div>
                                        </div>
                                    </td>
                                    <td>${escapeHtml(education)}</td>
                                    <td>${escapeHtml(interest)}</td>
                                    <td class="table-message">${escapeHtml(req.message || 'No message')}</td>
                                    <td>${escapeHtml(formatSupportDate(req.createdAt))}</td>
                                    <td><span class="badge ${badge}">${escapeHtml(status.toUpperCase())}</span></td>
                                    <td>
                                        <div class="table-actions">
                                            <button class="btn btn-secondary btn-sm view-request-btn" data-id="${escapeHtml(data.reqId)}">View</button>
                                            ${showDecisionActions ? `
                                                <button class="btn btn-success btn-sm acc-btn" data-id="${escapeHtml(data.reqId)}">Accept</button>
                                                <button class="btn btn-danger btn-sm rej-btn" data-id="${escapeHtml(data.reqId)}">Reject</button>
                                            ` : ''}
                                        </div>
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    function renderConversationList() {
        const container = document.getElementById('mentor-conversation-list');
        if (!container) return;
        const rows = Object.entries(connectedStudents || {})
            .filter(([, item]) => (item.status || '').toLowerCase() === 'connected')
            .map(([studentUid, item]) => {
                const id = conversationId(currentUid, studentUid);
                const conversation = mentorConversations[id] || {};
                return { studentUid, item, conversation, unread: Number(conversation.unreadByMentor || 0), lastTime: getTimeValue(conversation.lastMessageAt || item.connectedAt) };
            })
            .sort((a, b) => b.lastTime - a.lastTime);
        if (!rows.length) {
            container.innerHTML = '<div class="text-muted p-4 full-width text-center">No active conversations yet. Accept a student request to start messaging.</div>';
            updateUnreadMessageCount(rows);
            return;
        }
        updateUnreadMessageCount(rows);
        container.innerHTML = rows.map(({ studentUid, item, conversation, unread }) => `
            <article class="student-card glass conversation-card">
                <div class="request-card-header">
                    <div>
                        <h4><i class="fas fa-comments text-primary"></i> ${escapeHtml(item.studentName || 'Student')}</h4>
                        <p class="text-muted" style="margin:0;">${escapeHtml([item.educationLevel, item.interestArea].filter(Boolean).join(' - ') || item.studentEmail || 'Connected student')}</p>
                    </div>
                    ${unread ? `<span class="badge badge-warning">${unread} unread</span>` : '<span class="badge badge-approved">Active</span>'}
                </div>
                <p class="text-sm"><strong>Last message:</strong> ${escapeHtml(conversation.lastMessage || 'No messages yet.')}</p>
                <p class="text-sm text-muted">${escapeHtml(formatSupportDate(conversation.lastMessageAt || item.connectedAt))}</p>
                <div class="request-card-actions">
                    <button class="btn btn-primary btn-sm" data-message-student="${escapeHtml(studentUid)}">Open Chat</button>
                    <button class="btn btn-secondary btn-sm" data-view-connected="${escapeHtml(studentUid)}">View Pathway</button>
                </div>
            </article>
        `).join('');
        container.querySelectorAll('[data-message-student]').forEach((button) => {
            button.addEventListener('click', () => openConversation(button.dataset.messageStudent));
        });
        container.querySelectorAll('[data-view-connected]').forEach((button) => {
            button.addEventListener('click', () => openConnectedStudentDetail(button.dataset.viewConnected));
        });
    }

    function renderOverviewRequests() {
        const container = document.getElementById('overview-requests-list');
        if (!container) return;
        const rows = currentRequestRows
            .filter((item) => String(item.request?.status || 'pending').toLowerCase() === 'pending')
            .slice(0, 3);
        if (!rows.length) {
            container.innerHTML = '<div class="empty-state compact"><i class="fas fa-user-clock"></i><p>No pending requests yet.</p></div>';
            return;
        }
        container.innerHTML = rows.map((item) => {
            const name = item.request.studentName || item.userData?.fullName || 'Student';
            const initials = getInitials(name);
            return `
                <div class="overview-row">
                    <span class="mini-avatar">${escapeHtml(initials)}</span>
                    <div><strong>${escapeHtml(name)}</strong><span>${escapeHtml(item.request.interestArea || item.latestResult?.interestArea || 'Student request')} - ${escapeHtml(formatSupportDate(item.request.createdAt))}</span></div>
                    <button class="mini-action view-request-btn" data-id="${escapeHtml(item.reqId)}">View Profile</button>
                </div>
            `;
        }).join('');
        container.querySelectorAll('.view-request-btn').forEach((button) => {
            button.addEventListener('click', () => {
                const reqId = button.dataset.id;
                if (reqId && requestDetailCache[reqId]) openRequestModal(requestDetailCache[reqId]);
            });
        });
    }

    function renderOverviewMentees() {
        const container = document.getElementById('overview-mentees-list');
        if (!container) return;
        const rows = Object.entries(connectedStudents || {})
            .filter(([, item]) => (item.status || '').toLowerCase() === 'connected')
            .slice(0, 4);
        if (!rows.length) {
            container.innerHTML = '<div class="empty-state compact"><i class="fas fa-user-graduate"></i><p>No mentees connected yet.</p></div>';
            return;
        }
        container.innerHTML = rows.map(([studentUid, item], index) => `
            <div class="overview-row">
                <span class="mini-avatar avatar-${index % 4}">${escapeHtml(getInitials(item.studentName || 'Student'))}</span>
                <div><strong>${escapeHtml(item.studentName || 'Student')}</strong><span>${escapeHtml(item.interestArea || item.educationLevel || 'Connected mentee')}</span></div>
                <button class="mini-action" data-message-student="${escapeHtml(studentUid)}">Message</button>
            </div>
        `).join('');
        container.querySelectorAll('[data-message-student]').forEach((button) => {
            button.addEventListener('click', () => openConversation(button.dataset.messageStudent));
        });
    }

    function renderOverviewMessages() {
        const container = document.getElementById('overview-messages-list');
        if (!container) return;
        const rows = Object.entries(connectedStudents || {})
            .map(([studentUid, item]) => {
                const id = conversationId(currentUid, studentUid);
                const conversation = mentorConversations[id] || {};
                return { studentUid, item, conversation, lastTime: getTimeValue(conversation.lastMessageAt || item.connectedAt) };
            })
            .filter((row) => row.conversation.lastMessage)
            .sort((a, b) => b.lastTime - a.lastTime)
            .slice(0, 3);
        if (!rows.length) {
            container.innerHTML = '<div class="empty-state compact"><i class="fas fa-comments"></i><p>No recent messages.</p></div>';
            return;
        }
        container.innerHTML = rows.map(({ studentUid, item, conversation }) => `
            <div class="overview-row message-row" data-message-student="${escapeHtml(studentUid)}">
                <span class="mini-avatar">${escapeHtml(getInitials(item.studentName || 'Student'))}</span>
                <div><strong>${escapeHtml(item.studentName || 'Student')}</strong><span>${escapeHtml(conversation.lastMessage || '')}</span></div>
                <small>${escapeHtml(formatSupportDate(conversation.lastMessageAt))}</small>
            </div>
        `).join('');
        container.querySelectorAll('[data-message-student]').forEach((row) => {
            row.addEventListener('click', () => openConversation(row.dataset.messageStudent));
        });
    }

    function updateUnreadMessageCount(rows = []) {
        const totalUnread = rows.reduce((sum, row) => sum + Number(row.unread || 0), 0);
        const statUnread = document.getElementById('stat-unread');
        if (statUnread) statUnread.textContent = totalUnread;
    }

    function getInitials(name = '') {
        return String(name || 'Student')
            .trim()
            .split(/\s+/)
            .slice(0, 2)
            .map((part) => part.charAt(0).toUpperCase())
            .join('') || 'ST';
    }

    function attachRequestListeners() {
        document.querySelectorAll('.acc-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const reqId = e.target.getAttribute('data-id');
                updateReqStatus(reqId, 'accepted');
            });
        });

        document.querySelectorAll('.rej-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                if (confirm("Are you sure you want to reject this request?")) {
                    const reqId = e.target.getAttribute('data-id');
                    updateReqStatus(reqId, 'rejected');
                }
            });
        });

        document.querySelectorAll('.view-request-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const reqId = e.target.getAttribute('data-id');
                if (reqId && requestDetailCache[reqId]) {
                    openRequestModal(requestDetailCache[reqId]);
                }
            });
        });
    }

    function getLatestPathwayResult(data) {
        if (!data || typeof data !== 'object') return null;
        const results = Object.values(data).filter((item) => item && typeof item === 'object');
        if (results.length === 0) return null;
        return results.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0] || null;
    }

    function buildRequestCard(data) {
        const req = data.request;
        const latest = data.latestResult || req.pathwaySnapshot || {};
        const studentName = req.studentName || data.userData.fullName || 'Student';
        const studentEmail = req.studentEmail || data.userData.email || 'N/A';
        const createdAt = formatSupportDate(req.createdAt);
        const status = (req.status || 'pending').toLowerCase();
        const badge = status === 'pending' ? 'badge-warning' : status === 'accepted' ? 'badge-approved' : 'badge-rejected';

        const card = document.createElement('div');
        card.className = 'student-card request-card glass';
        card.innerHTML = `
            <div class="request-card-header">
                <div>
                    <h4>${escapeHtml(studentName)}</h4>
                    <div class="text-sm text-muted">${escapeHtml(studentEmail)}</div>
                </div>
                <span class="badge ${badge}">${escapeHtml(status.toUpperCase())}</span>
            </div>
            <p class="text-sm"><strong>Requested:</strong> ${escapeHtml(createdAt)}</p>
            <p class="text-sm"><strong>Message:</strong> ${escapeHtml(req.message || 'No message')}</p>
            <div class="request-card-meta">
                <span>${escapeHtml(req.educationLevel || data.studentData.educationLevel || data.studentData.education || data.userData.educationLevel || latest.educationLevel || latest.basicProfile?.currentEducationLevel || 'Education unavailable')}</span>
                <span>${escapeHtml(req.interestArea || data.studentData.interestArea || data.studentData.interest || data.userData.interestArea || latest.interestArea || latest.interests?.interestAreas?.[0] || 'Interest unavailable')}</span>
            </div>
            <div class="request-card-actions">
                <button class="btn btn-secondary btn-sm view-request-btn" data-id="${escapeHtml(data.reqId)}">View Details</button>
                ${status === 'pending' ? `
                    <button class="btn btn-success btn-sm acc-btn" data-id="${escapeHtml(data.reqId)}">Accept</button>
                    <button class="btn btn-danger btn-sm rej-btn" data-id="${escapeHtml(data.reqId)}">Reject</button>
                ` : ''}
            </div>
        `;
        return card;
    }

    function buildAcceptedCard(data) {
        const req = data.request;
        const studentName = req.studentName || data.userData.fullName || 'Student';
        const acceptedAt = req.updatedAt ? new Date(req.updatedAt).toLocaleDateString() : req.createdAt ? new Date(req.createdAt).toLocaleDateString() : 'N/A';
        const latestPathway = data.latestResult ? `${escapeHtml(data.latestResult.pathway || data.latestResult.recommendedPathway || 'Recommended pathway unavailable')} (${escapeHtml(displayVal(data.latestResult.pathwayScore || data.latestResult.score || 'N/A'))})` : 'No pathway match yet';

        const card = document.createElement('div');
        card.className = 'student-card glass';
        card.innerHTML = `
            <h4><i class="fas fa-user-graduate text-primary"></i> ${escapeHtml(studentName)}</h4>
            <p class="text-muted" style="margin:0 0 0.75rem; font-size:0.95rem;">Accepted on ${escapeHtml(acceptedAt)}</p>
            <p class="text-sm"><strong>Latest Pathway:</strong> ${latestPathway}</p>
            <div class="request-card-actions">
                <button class="btn btn-secondary btn-sm view-request-btn" data-id="${escapeHtml(data.reqId)}">View Details</button>
            </div>
        `;
        return card;
    }

    function openRequestModal(data) {
        const req = data.request;
        const studentData = data.studentData || {};
        const userData = data.userData || {};
        const latestResult = data.latestResult || req.pathwaySnapshot || {};
        const body = document.getElementById('modal-request-body');
        if (body && !document.getElementById('modal-status')) {
            body.innerHTML = `
                <div class="modal-row"><strong>Status:</strong> <span id="modal-status"></span></div>
                <div class="modal-row"><strong>Student:</strong> <span id="modal-student-name"></span></div>
                <div class="modal-row"><strong>Email:</strong> <span id="modal-student-email"></span></div>
                <div class="modal-row"><strong>Phone:</strong> <span id="modal-student-phone"></span></div>
                <div class="modal-row"><strong>Education Level:</strong> <span id="modal-education"></span></div>
                <div class="modal-row"><strong>Interest Area:</strong> <span id="modal-interest"></span></div>
                <div class="modal-row"><strong>Future Goal:</strong> <span id="modal-goal"></span></div>
                <div class="modal-row"><strong>Learning Mode:</strong> <span id="modal-learning-mode"></span></div>
                <div class="modal-row"><strong>Skills:</strong> <span id="modal-skills"></span></div>
                <div class="modal-row"><strong>Request Message:</strong> <span id="modal-message"></span></div>
                <div class="modal-row"><strong>Latest Pathway Match:</strong> <span id="modal-pathway-result"></span></div>
                <div class="modal-row"><strong>Requested On:</strong> <span id="modal-requested-at"></span></div>
            `;
        }

        document.getElementById('modal-request-title').textContent = `${escapeHtml(req.studentName || userData.fullName || 'Student')} Request Details`;
        document.getElementById('modal-status').textContent = (req.status || 'pending').toUpperCase();
        document.getElementById('modal-student-name').textContent = req.studentName || userData.fullName || 'N/A';
        document.getElementById('modal-student-email').textContent = req.studentEmail || userData.email || 'N/A';
        document.getElementById('modal-student-phone').textContent = req.studentPhone || studentData.phone || userData.phone || 'N/A';
        document.getElementById('modal-education').textContent = req.educationLevel || studentData.educationLevel || studentData.education || userData.educationLevel || latestResult.educationLevel || latestResult.basicProfile?.currentEducationLevel || 'N/A';
        document.getElementById('modal-interest').textContent = req.interestArea || studentData.interestArea || studentData.interest || userData.interestArea || latestResult.interestArea || latestResult.interests?.interestAreas?.[0] || 'N/A';
        document.getElementById('modal-goal').textContent = req.futureGoal || studentData.futureGoal || studentData.goal || userData.futureGoal || latestResult.futureGoal || latestResult.goals?.dreamCareer || 'N/A';
        document.getElementById('modal-learning-mode').textContent = studentData.learningMode || userData.learningMode || latestResult.learningMode || latestResult.learningPreferences?.learningMode || 'N/A';
        document.getElementById('modal-skills').textContent = displayVal(req.skills || studentData.skills || userData.skills || latestResult.skills || latestResult.skillsAndStrengths?.skills || 'N/A');
        document.getElementById('modal-message').textContent = req.message || 'N/A';
        document.getElementById('modal-pathway-result').textContent = Object.keys(latestResult || {}).length ? `${latestResult.pathway || latestResult.recommendedPathway || 'Recommended pathway unavailable'} (${displayVal(latestResult.pathwayScore || latestResult.score || 'N/A')})` : 'No pathway result available yet.';
        document.getElementById('modal-requested-at').textContent = formatSupportDate(req.createdAt);

        const overlay = document.getElementById('student-request-modal');
        if (overlay) overlay.classList.remove('hidden');
    }

    document.getElementById('modal-close-btn')?.addEventListener('click', () => {
        document.getElementById('student-request-modal')?.classList.add('hidden');
    });

    async function updateReqStatus(reqId, newStatus) {
        const cached = requestDetailCache[reqId];
        if (!cached) return showToast('Request details are still loading. Try again.', 'error');
        const req = cached.request || {};
        const studentUid = req.studentUid;
        if (!studentUid || req.mentorUid !== currentUid) return showToast('This request is not assigned to you.', 'error');

        const reason = newStatus === 'rejected' ? (window.prompt('Optional rejection reason:', '') || '') : '';
        const conversation = conversationId(currentUid, studentUid);
        const notificationRef = push(ref(database, `notifications/${studentUid}`));
        const logRef = push(ref(database, 'activityLogs'));
        const connectionLogRef = newStatus === 'accepted' ? push(ref(database, 'activityLogs')) : null;
        const mentorSnap = await get(ref(database, `mentors/${currentUid}`));
        const mentor = mentorSnap.val() || {};
        const mentorUserSnap = await get(ref(database, `users/${currentUid}`));
        const mentorUser = mentorUserSnap.val() || {};
        const latest = req.pathwaySnapshot || cached.latestResult || {};
        const studentName = req.studentName || cached.userData?.fullName || 'Student';
        const mentorName = mentor.fullName || mentorUser.fullName || req.mentorName || 'Mentor';
        const updates = {};

        updates[`mentorRequests/${reqId}/status`] = newStatus;
        updates[`mentorRequests/${reqId}/updatedAt`] = serverTimestamp();

        if (newStatus === 'accepted') {
            updates[`mentorRequests/${reqId}/acceptedAt`] = serverTimestamp();
            updates[`studentMentors/${studentUid}/${currentUid}`] = {
                studentUid,
                mentorUid: currentUid,
                requestId: reqId,
                status: 'connected',
                connectedAt: serverTimestamp(),
                mentorName,
                mentorField: mentor.field || mentor.mentoringField || req.mentorField || '',
                mentorOrganization: mentor.universityOrCompany || mentor.organization || mentor.currentOrganization || req.mentorOrganization || '',
                mentorPhotoURL: mentor.photoURL || mentorUser.photoURL || ''
            };
            updates[`mentorStudents/${currentUid}/${studentUid}`] = {
                studentUid,
                mentorUid: currentUid,
                requestId: reqId,
                status: 'connected',
                connectedAt: serverTimestamp(),
                studentName,
                studentEmail: req.studentEmail || cached.userData?.email || '',
                studentPhone: req.studentPhone || cached.studentData?.phone || cached.userData?.phone || '',
                educationLevel: latest.educationLevel || cached.studentData?.educationLevel || '',
                interestArea: latest.interestArea || cached.studentData?.interestArea || '',
                futureGoal: latest.futureGoal || cached.studentData?.futureGoal || '',
                skills: latest.skills || cached.studentData?.skills || [],
                pathwayResultId: req.pathwayResultId || latest.resultId || '',
                pathwaySummary: latest.recommendationSummary || latest.futureGoal || 'Pathway details available'
            };
            updates[`mentorConversations/${conversation}/conversationId`] = conversation;
            updates[`mentorConversations/${conversation}/type`] = 'mentor-student';
            updates[`mentorConversations/${conversation}/mentorUid`] = currentUid;
            updates[`mentorConversations/${conversation}/studentUid`] = studentUid;
            updates[`mentorConversations/${conversation}/participantIds/${currentUid}`] = true;
            updates[`mentorConversations/${conversation}/participantIds/${studentUid}`] = true;
            updates[`mentorConversations/${conversation}/participantRoles/${currentUid}`] = 'mentor';
            updates[`mentorConversations/${conversation}/participantRoles/${studentUid}`] = 'student';
            updates[`mentorConversations/${conversation}/participantNames/${currentUid}`] = mentorName;
            updates[`mentorConversations/${conversation}/participantNames/${studentUid}`] = studentName;
            updates[`mentorConversations/${conversation}/status`] = 'active';
            updates[`mentorConversations/${conversation}/requestId`] = reqId;
            updates[`mentorConversations/${conversation}/createdAt`] = serverTimestamp();
            updates[`mentorConversations/${conversation}/updatedAt`] = serverTimestamp();
            updates[`mentorConversations/${conversation}/lastMessage`] = '';
            updates[`mentorConversations/${conversation}/lastMessageAt`] = serverTimestamp();
            updates[`mentorConversations/${conversation}/unreadByMentor`] = 0;
            updates[`mentorConversations/${conversation}/unreadByStudent`] = 0;
            updates[`notifications/${studentUid}/${notificationRef.key}`] = {
                notificationId: notificationRef.key,
                type: 'mentor_request_accepted',
                title: 'Your mentor request was accepted',
                message: `${mentorName} accepted your mentor request.`,
                messagePreview: `${mentorName} accepted your mentor request.`,
                relatedRequestId: reqId,
                mentorUid: currentUid,
                read: false,
                status: 'unread',
                createdAt: serverTimestamp()
            };
            updates[`activityLogs/${connectionLogRef.key}`] = {
                logId: connectionLogRef.key,
                uid: currentUid,
                userName: mentorName,
                userRole: 'mentor',
                actionType: 'mentor_connection_created',
                description: `${mentorName} connected with ${studentName}`,
                relatedEntityType: 'mentorConversation',
                relatedEntityId: conversation,
                createdAt: serverTimestamp()
            };
        } else {
            updates[`mentorRequests/${reqId}/rejectedAt`] = serverTimestamp();
            updates[`mentorRequests/${reqId}/rejectionReason`] = reason;
            updates[`notifications/${studentUid}/${notificationRef.key}`] = {
                notificationId: notificationRef.key,
                type: 'mentor_request_rejected',
                title: 'Mentor request update',
                message: reason || `${mentorName} could not accept your mentor request at this time.`,
                messagePreview: reason || 'Your mentor request was rejected.',
                relatedRequestId: reqId,
                mentorUid: currentUid,
                read: false,
                status: 'unread',
                createdAt: serverTimestamp()
            };
        }

        updates[`activityLogs/${logRef.key}`] = {
            logId: logRef.key,
            uid: currentUid,
            userName: mentorName,
            userRole: 'mentor',
            actionType: newStatus === 'accepted' ? 'mentor_request_accepted' : 'mentor_request_rejected',
            description: `${mentorName} ${newStatus} ${studentName}'s mentor request`,
            relatedEntityType: 'mentorRequest',
            relatedEntityId: reqId,
            createdAt: serverTimestamp()
        };

        update(ref(database), updates)
            .then(() => showToast(`Request ${newStatus} successfully!`, newStatus === 'accepted' ? 'success' : 'warning'))
            .catch(err => {
                console.error("Error updating request status:", err);
                showToast("Failed to process request.", "error");
            });
    }

    function openConnectedStudentDetail(studentUid) {
        const item = connectedStudents[studentUid] || {};
        const pathway = item.pathwaySnapshot || {};
        const body = document.getElementById('modal-request-body');
        const title = document.getElementById('modal-request-title');
        if (!body || !title) return;
        title.textContent = `${item.studentName || 'Student'} - Pathway Details`;
        body.innerHTML = `
            ${detailRow('Student', item.studentName)}
            ${detailRow('Email', item.studentEmail)}
            ${detailRow('Phone', item.studentPhone)}
            ${detailRow('Education Level', item.educationLevel || pathway.educationLevel || pathway.basicProfile?.currentEducationLevel)}
            ${detailRow('Interest Area', item.interestArea || pathway.interestArea || pathway.interests?.interestAreas?.[0])}
            ${detailRow('Future Goal', item.futureGoal || pathway.futureGoal || pathway.goals?.dreamCareer)}
            ${detailRow('Learning Mode', item.learningMode || pathway.learningMode || pathway.learningPreferences?.learningMode)}
            ${detailRow('Skills', item.skills || pathway.skills || pathway.skillsAndStrengths?.skills)}
            ${detailRow('Recommended Pathway', item.recommendedPathway || pathway.pathway || pathway.recommendedPathway)}
            ${detailRow('Pathway Score', item.pathwayScore || pathway.pathwayScore || pathway.score)}
            ${detailRow('Pathway Summary', item.pathwaySummary || pathway.recommendationSummary || pathway.summary)}
            ${detailRow('Connected On', formatSupportDate(item.connectedAt))}
            ${detailRow('Request ID', item.requestId)}
        `;
        document.getElementById('student-request-modal')?.classList.remove('hidden');
    }

    function openConversation(studentUid) {
        const connection = connectedStudents[studentUid];
        if (!connection || (connection.status || '').toLowerCase() !== 'connected') {
            showToast('You can message only connected students.', 'error');
            return;
        }
        activeConversationId = conversationId(currentUid, studentUid);
        ensureChatModal();
        renderActiveConversation();
        document.getElementById('mentor-student-chat-modal')?.classList.remove('hidden');
        markConversationRead(activeConversationId);
    }

    function ensureChatModal() {
        if (document.getElementById('mentor-student-chat-modal')) return;
        document.body.insertAdjacentHTML('beforeend', `
            <div id="mentor-student-chat-modal" class="modal-overlay hidden" aria-hidden="true">
                <div class="modal-card mentor-chat-card">
                    <div class="modal-header">
                        <div>
                            <h3 id="mentor-student-chat-title">Student Messages</h3>
                            <p id="mentor-student-chat-subtitle" class="text-muted"></p>
                        </div>
                        <button type="button" class="modal-close" id="mentor-student-chat-close" aria-label="Close">&times;</button>
                    </div>
                    <div id="mentor-student-chat-thread" class="chat-thread"></div>
                    <form id="mentor-student-chat-form" class="chat-form">
                        <textarea id="mentor-student-chat-input" rows="2" placeholder="Write your message..." required></textarea>
                        <button class="btn btn-primary" type="submit"><i class="fas fa-paper-plane"></i> Send</button>
                    </form>
                </div>
            </div>
        `);
        document.getElementById('mentor-student-chat-close')?.addEventListener('click', () => document.getElementById('mentor-student-chat-modal')?.classList.add('hidden'));
        document.getElementById('mentor-student-chat-form')?.addEventListener('submit', sendStudentMessage);
    }

    function renderActiveConversation() {
        if (!activeConversationId) return;
        const modal = document.getElementById('mentor-student-chat-modal');
        if (!modal) return;
        const conversation = mentorConversations[activeConversationId] || {};
        const studentUid = conversation.studentUid || activeConversationId.replace(`mentor_${currentUid}_`, '');
        const student = connectedStudents[studentUid] || {};
        document.getElementById('mentor-student-chat-title').textContent = student.studentName || 'Student Messages';
        document.getElementById('mentor-student-chat-subtitle').textContent = [student.educationLevel, student.interestArea].filter(Boolean).join(' • ');
        const thread = document.getElementById('mentor-student-chat-thread');
        if (!thread) return;
        const messages = Object.values(conversation.messages || {}).sort((a, b) => getTimeValue(a.createdAt) - getTimeValue(b.createdAt));
        thread.innerHTML = messages.length ? messages.map((message) => `
            <div class="chat-bubble ${message.senderUid === currentUid ? 'is-self' : 'is-other'}">
                <p>${escapeHtml(message.message || '')}</p>
                <span>${formatSupportDate(message.createdAt)}</span>
            </div>
        `).join('') : '<div class="empty-state"><i class="fas fa-comments"></i><p>No messages yet. Start the conversation with your student.</p></div>';
        thread.scrollTop = thread.scrollHeight;
    }

    async function sendStudentMessage(event) {
        event.preventDefault();
        if (!isAccountActive(currentUserData)) {
            showToast('Your account is not active. Please contact EduPath Support.', 'error');
            return;
        }
        const conversationIdValue = activeConversationId;
        const conversation = mentorConversations[conversationIdValue];
        const input = document.getElementById('mentor-student-chat-input');
        const message = input?.value.trim();
        if (!conversation || !message) return;
        const studentUid = conversation.studentUid;
        const userSnap = await get(ref(database, `users/${currentUid}`));
        const senderName = userSnap.val()?.fullName || 'Mentor';
        const messageRef = push(ref(database, `mentorConversations/${conversationIdValue}/messages`));
        const notificationRef = push(ref(database, `notifications/${studentUid}`));
        const logRef = push(ref(database, 'activityLogs'));
        const updates = {};
        updates[`mentorConversations/${conversationIdValue}/messages/${messageRef.key}`] = {
            messageId: messageRef.key,
            conversationId: conversationIdValue,
            senderUid: currentUid,
            senderName,
            senderRole: 'mentor',
            receiverUid: studentUid,
            receiverRole: 'student',
            message,
            status: 'sent',
            createdAt: serverTimestamp(),
            readAt: null
        };
        updates[`mentorConversations/${conversationIdValue}/lastMessage`] = message;
        updates[`mentorConversations/${conversationIdValue}/lastMessageAt`] = serverTimestamp();
        updates[`mentorConversations/${conversationIdValue}/lastSenderUid`] = currentUid;
        updates[`mentorConversations/${conversationIdValue}/unreadByStudent`] = Number(conversation.unreadByStudent || 0) + 1;
        updates[`mentorConversations/${conversationIdValue}/updatedAt`] = serverTimestamp();
        updates[`notifications/${studentUid}/${notificationRef.key}`] = {
            notificationId: notificationRef.key,
            type: 'mentor_message',
            title: 'New message from your mentor',
            message: `${senderName}: ${message.slice(0, 80)}`,
            messagePreview: message.slice(0, 140),
            conversationId: conversationIdValue,
            relatedConversationId: conversationIdValue,
            mentorUid: currentUid,
            read: false,
            status: 'unread',
            createdAt: serverTimestamp()
        };
        updates[`activityLogs/${logRef.key}`] = {
            logId: logRef.key,
            uid: currentUid,
            userName: senderName,
            userRole: 'mentor',
            actionType: 'mentor_message_sent',
            description: `${senderName} sent a message to a connected student`,
            relatedEntityType: 'mentorConversation',
            relatedEntityId: conversationIdValue,
            createdAt: serverTimestamp()
        };
        await update(ref(database), updates);
        input.value = '';
    }

    async function markConversationRead(conversationIdValue) {
        const conversation = mentorConversations[conversationIdValue];
        if (!conversation) return;
        const updates = {
            [`mentorConversations/${conversationIdValue}/unreadByMentor`]: 0,
            [`mentorConversations/${conversationIdValue}/updatedAt`]: serverTimestamp()
        };
        Object.entries(conversation.messages || {}).forEach(([messageId, message]) => {
            if (message.senderUid !== currentUid && (message.status || '').toLowerCase() !== 'read') {
                updates[`mentorConversations/${conversationIdValue}/messages/${messageId}/status`] = 'read';
                updates[`mentorConversations/${conversationIdValue}/messages/${messageId}/readAt`] = serverTimestamp();
            }
        });
        await update(ref(database), updates).catch(console.error);
    }

    function conversationId(mentorUid, studentUid) {
        return `mentor_${mentorUid}_${studentUid}`;
    }

    function isAccountActive(user = {}) {
        return !['suspended', 'disabled', 'rejected'].includes(String(user.accountStatus || 'active').trim().toLowerCase());
    }

    // --- Settings Change Password Submit ---
    const changePasswordForm = document.getElementById('change-password-form');
    changePasswordForm?.addEventListener('submit', (e) => {
        e.preventDefault();
        const user = auth.currentUser;
        if (!user) return;

        const newPwd = document.getElementById('settings-new-password').value;
        const confirmPwd = document.getElementById('settings-confirm-password').value;
        const errorEl = document.getElementById('password-match-error');

        if (newPwd.length < 8) {
            showToast("Password must be at least 8 characters long.", "error");
            return;
        }

        if (newPwd !== confirmPwd) {
            errorEl.classList.remove('hidden');
            return;
        }
        errorEl.classList.add('hidden');

        const saveBtn = document.getElementById('save-password-btn');
        const originalBtnText = saveBtn.textContent;
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Updating...';
        saveBtn.disabled = true;

        updatePassword(user, newPwd)
            .then(() => {
                showToast("Password updated successfully!", "success");
                closeAllModals();
            })
            .catch(err => {
                console.error("Password update error:", err);
                if (err.code === 'auth/requires-recent-login') {
                    showToast("For security, please logout and login again before changing your password.", "error");
                } else {
                    showToast(err.message || "Failed to update password.", "error");
                }
            })
            .finally(() => {
                saveBtn.textContent = originalBtnText;
                saveBtn.disabled = false;
            });
    });
});
