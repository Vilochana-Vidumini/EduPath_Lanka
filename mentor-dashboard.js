import { auth, database } from "./firebase-config.js";
import { EmailAuthProvider, onAuthStateChanged, reauthenticateWithCredential, signOut, updatePassword } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { ref, get, set, update, push, onValue, off, serverTimestamp, query, orderByChild, equalTo } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
import { showToast, preserveThemeOnClear } from "./auth-nav.js?v=20260614-brand";
import { initDashboardSidebar, updateSidebarUser } from "./sidebar.js";
import { ensureDashboardTopbarLayout, initDashboardNotifications, updateDashboardGreetingName } from "./dashboard-topbar.js";
import { calculateMentorRatingSummary, normalizeRatingStatus, publicReviewRows } from "./ratings.js?v=20260705-rating-breakdown-fix";

document.addEventListener('DOMContentLoaded', () => {
    initDashboardSidebar();
    normalizeMentorApplicationSection();

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
    let currentMentorData = {};
    let mentorAccessApproved = false;
    let mentorAppointments = {};
    let mentorRatings = {};
    let mentorPublicReviews = {};
    let mentorRatingSummary = {};
    let appointmentCalendarDate = new Date();
    let selectedAppointmentDate = dateKeyLocal(new Date());
    let activeAppointmentTab = 'pending';
    let mentorDateTimer = null;
    const weekDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

    function normalizeMentorApplicationSection() {
        const container = document.querySelector('.dashboard-container');
        const application = document.getElementById('complete-profile');
        const requests = document.getElementById('requests');
        if (!container || !application || application.parentElement === container) return;
        container.insertBefore(application, requests || null);
    }

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
    document.getElementById('mentor-application-form')?.addEventListener('submit', submitMentorApplication);
    document.getElementById('save-mentor-draft-btn')?.addEventListener('click', saveMentorApplicationDraft);
    document.addEventListener('click', handleApprovedProfileClick);
    document.addEventListener('change', handleApprovedProfileChange);
    document.addEventListener('submit', handleApprovedProfileSubmit);
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
        updateMentorHeroName(userData.fullName || 'Mentor');

        // Load Mentor Specific Data from /mentors/{uid}
        get(ref(database, 'mentors/' + uid)).then((snapshot) => {
            let mentorData = { status: "pending" };
            if (snapshot.exists()) {
                mentorData = snapshot.val();
            }
            currentMentorData = { ...mentorData, email: mentorData.email || userData.email, fullName: mentorData.fullName || userData.fullName, phone: mentorData.phone || userData.phone };
            mentorAccessApproved = isApprovedMentor(currentMentorData, userData);
            updateStatusUI(mentorApprovalStatus(currentMentorData));
            calculateProfileCompletion(uid, userData, mentorData);
            renderAvailability(mentorData);
            populateMentorApplicationForm(currentMentorData, userData);
            renderMentorApplicationStatus(currentMentorData);
            applyMentorAccessGate();
            listenForAvailability(uid);
            renderMentorHero();

            if (mentorAccessApproved) {
                listenForRequests(uid, userData.fullName);
                listenForConnectedStudents(uid);
                listenForAppointments(uid);
                listenForRatings(uid);
            } else {
                showApplicationFirst();
            }
        }).catch((error) => {
            console.error('Mentor profile load failed:', error);
            const root = document.getElementById('approved-mentor-profile-root');
            if (root) {
                root.innerHTML = `<div class="mentor-profile-readonly-card glass"><h3>Profile could not load</h3><p>${escapeHtml(friendlyFirebaseError(error))}</p></div>`;
            }
            showToast(friendlyFirebaseError(error), 'error');
        });
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

    function displayVal(value) {
        if (Array.isArray(value)) return value.length ? value.join(', ') : 'N/A';
        if (value && typeof value === 'object') return JSON.stringify(value);
        const text = String(value ?? '').trim();
        return text || 'N/A';
    }

    function formatDateTime(value) {
        const time = getTimestamp(value);
        if (!time) return 'Not recorded';
        return new Date(time).toLocaleString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    function getTimestamp(value) {
        if (!value) return 0;
        if (typeof value === 'number') return value;
        if (typeof value === 'object' && typeof value.seconds === 'number') return value.seconds * 1000;
        const parsed = Date.parse(value);
        return Number.isNaN(parsed) ? 0 : parsed;
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
        updateHeroAvailabilityMetric();
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
        if (!mentorDateTimer) mentorDateTimer = setInterval(updateMentorDateTime, 60000);
    }

    function updateMentorDateTime() {
        const now = new Date();
        const dateText = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        const timeText = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
        const dateEl = document.getElementById('mentor-dashboard-date');
        const timeEl = document.getElementById('mentor-dashboard-time');
        const timeTextEl = document.getElementById('mentor-dashboard-time-text');
        if (dateEl) dateEl.textContent = dateText;
        if (timeTextEl) timeTextEl.textContent = timeText;
        if (timeEl) timeEl.dateTime = now.toISOString();
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

    function mentorApprovalStatus(mentor = currentMentorData) {
        return normalizeStatus(mentor.approvalStatus || mentor.applicationStatus || mentor.status || 'draft');
    }

    function normalizeStatus(value) {
        return String(value || '').trim().toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_');
    }

    function isApprovedMentor(mentor = {}, user = currentUserData) {
        return mentorApprovalStatus(mentor) === 'approved'
            && normalizeStatus(user.accountStatus || mentor.accountStatus || 'active') !== 'suspended';
    }

    function canAccessMentorSection(sectionId) {
        if (mentorAccessApproved && sectionId === 'complete-profile') return false;
        if (mentorAccessApproved) return true;
        return ['dashboard-overview', 'my-profile', 'complete-profile', 'availability', 'support'].includes(sectionId);
    }

    function showApplicationFirst() {
        const sectionId = ['submitted', 'under_review'].includes(mentorApprovalStatus()) ? 'dashboard-overview' : 'complete-profile';
        document.querySelectorAll('.dashboard-section').forEach((section) => {
            section.classList.toggle('active', section.id === sectionId);
            section.style.display = section.id === sectionId ? '' : 'none';
        });
        document.querySelectorAll('.sidebar-links a[data-section]').forEach((link) => link.classList.toggle('active', link.dataset.section === sectionId));
        localStorage.setItem('mentorActiveSection', sectionId);
    }

    function applyMentorAccessGate() {
        document.body.classList.toggle('mentor-unapproved', !mentorAccessApproved);
        document.body.classList.toggle('mentor-approved', mentorAccessApproved);
        document.querySelector('.mentor-complete-profile-nav')?.classList.toggle('hidden', mentorAccessApproved);
        document.querySelector('.mentor-application-status-link')?.classList.toggle('hidden', mentorAccessApproved);
        document.querySelectorAll('[data-approved-section-jump]').forEach((button) => {
            button.dataset.sectionJump = mentorAccessApproved ? button.dataset.approvedSectionJump : (button.dataset.unapprovedSectionJump || button.dataset.sectionJump);
        });
        if (mentorAccessApproved && window.location.hash === '#complete-profile') {
            history.replaceState(null, '', '#my-profile');
        }
        if (mentorAccessApproved && document.querySelector('.dashboard-section.active')?.id === 'complete-profile') {
            document.querySelectorAll('.dashboard-section').forEach((section) => {
                const active = section.id === 'my-profile';
                section.classList.toggle('active', active);
                section.style.display = active ? '' : 'none';
            });
            document.querySelectorAll('.sidebar-links a[data-section]').forEach((link) => {
                link.classList.toggle('active', link.dataset.section === 'my-profile');
            });
            localStorage.setItem('mentorActiveSection', 'my-profile');
        }
        document.querySelectorAll('.sidebar-links a[data-section]').forEach((link) => {
            const locked = !canAccessMentorSection(link.dataset.section);
            link.classList.toggle('locked-section', locked);
            if (locked) link.title = 'Available after admin approval';
        });
        const approvedOverview = document.getElementById("approved-mentor-overview");
        if (approvedOverview) {
            approvedOverview.hidden = !mentorAccessApproved;
        }
        renderApprovedMentorProfile();
        renderMentorHero();
    }

    function updateMentorHeroName(fullName) {
        const welcomeNameEl = document.getElementById('mentor-home-name');
        if (!welcomeNameEl) return;
        welcomeNameEl.innerHTML = `${escapeHtml(fullName || 'Mentor')} <span class="mentor-home-wave" aria-hidden="true">👋</span>`;
        
        const len = (fullName || '').length;
        welcomeNameEl.classList.toggle('is-long-name', len > 15 && len <= 25);
        welcomeNameEl.classList.toggle('is-very-long-name', len > 25);
    }

    function renderMentorHero() {
        const mentor = currentMentorData || {};
        const user = currentUserData || {};
        const status = mentorApprovalStatus(mentor).replace(/\s+/g, '_');
        const statusInfo = getMentorHeroStatusInfo(status);
        const fullName = mentor.fullName || user.fullName || 'Mentor';
        const photo = mentor.photoURL || user.photoURL || 'images/mentor-dashboard-illustration.png';
        const field = mentor.field || mentor.expertise || mentor.mentoringField || 'Field not set';
        const type = mentor.mentorType || 'Complete your mentor details';
        const approved = mentorAccessApproved;

        updateMentorHeroName(fullName);
        setTextSafe('mentor-home-message', statusInfo.heroMessage);
        setTextSafe('mentor-home-expertise', field);
        const typeEl = document.getElementById('mentor-home-type');
        if (typeEl) {
            const label = typeEl.querySelector('span');
            if (label) label.textContent = type;
            else typeEl.textContent = type;
        }
        setTextSafe('mentor-modern-status-title', statusInfo.title);
        setTextSafe('mentor-modern-status-description', statusInfo.description);
        setTextSafe('mentor-modern-access', approved ? 'Active' : 'Locked');
        setTextSafe('mentor-modern-access-note', approved ? `${connectedStudentCount()} connected students or pending requests` : 'Your mentoring features will be available after admin approval.');
        toggleElementHidden('mentor-modern-access-action', !approved);
        setTextSafe('mentor-info-banner-title', statusInfo.bannerTitle);
        setTextSafe('mentor-info-banner-text', statusInfo.bannerText);
        setTextSafe('mentor-application-card-notice-text', statusInfo.notice);

        const modernAvatar = document.getElementById('mentor-home-photo');
        if (modernAvatar) {
            modernAvatar.src = photo;
            modernAvatar.alt = `${fullName} profile`;
            modernAvatar.onerror = () => {
                modernAvatar.onerror = null;
                modernAvatar.src = 'images/mentor-dashboard-illustration.png';
            };
        }

        const modernBadge = document.getElementById('mentor-modern-status-badge');
        if (modernBadge) {
            modernBadge.textContent = statusInfo.badge;
            modernBadge.className = `status-badge status-${status}`;
        }

        renderMentorHomeActions(status);
        updateHeroAvailabilityMetric();
        updateHeroNextSessionMetric();
    }

    function getMentorHeroStatusInfo(status) {
        const approved = mentorAccessApproved;
        const map = {
            draft: {
                title: 'Complete your mentor profile',
                description: 'Add the missing professional details and submit your application.',
                badge: 'Draft',
                heroMessage: 'Your guidance can shape a student\'s future.',
                notice: 'Complete your profile to begin the review process.',
                bannerTitle: 'Complete your mentor profile to submit for review.',
                bannerText: 'Add the required professional details, documents, and declarations before sending it to admin.',
                primary: { label: 'Complete Profile', icon: 'fa-user-check', section: 'complete-profile' }
            },
            incomplete: {
                title: 'Complete your mentor profile',
                description: 'Add the missing professional details and submit your application.',
                badge: 'Draft',
                heroMessage: 'Finish your profile so students can find the right guidance.',
                notice: 'Required details are still missing.',
                bannerTitle: 'Your mentor profile needs a few more details.',
                bannerText: 'Finish the required information so the admin team can review your application.',
                primary: { label: 'Complete Profile', icon: 'fa-user-check', section: 'complete-profile' }
            },
            submitted: {
                title: 'Application submitted',
                description: 'Your mentor profile is waiting for admin review.',
                badge: 'Submitted',
                heroMessage: 'Your application is with the EduPath Lanka admin team.',
                notice: 'You will be notified when the review begins.',
                bannerTitle: 'Your mentor profile was submitted successfully.',
                bannerText: 'Our admin team is reviewing your profile. You will be notified when there is an update.',
                primary: { label: 'View Submitted Profile', icon: 'fa-file-lines', section: 'complete-profile' }
            },
            under_review: {
                title: 'Application under review',
                description: 'Your mentor profile is waiting for admin review.',
                badge: 'Under Review',
                heroMessage: 'You are almost ready to start guiding students.',
                notice: 'You will be notified when the review begins.',
                bannerTitle: 'Your mentor profile was submitted successfully.',
                bannerText: 'Our admin team is reviewing your profile. You will receive a notification when there is an update.',
                primary: { label: 'View Application', icon: 'fa-file-lines', section: 'complete-profile' }
            },
            changes_requested: {
                title: 'Updates required',
                description: mentorAdminFeedbackText() || 'Review the admin feedback, update your profile, and resubmit.',
                badge: 'Changes Requested',
                heroMessage: 'Update the requested details and send your profile back for review.',
                notice: mentorAdminFeedbackText() || 'Update the requested information and resubmit.',
                bannerTitle: 'Admin requested profile updates.',
                bannerText: mentorAdminFeedbackText() || 'Review the feedback, update your mentor profile, and resubmit for review.',
                primary: { label: 'Update Profile', icon: 'fa-pen-to-square', section: 'complete-profile' }
            },
            approved: {
                title: 'Approved mentor',
                description: 'Your profile is visible to students and mentoring features are active.',
                badge: 'Approved',
                heroMessage: 'Your guidance can shape a student\'s future.',
                notice: 'Students can now discover your mentor profile.',
                bannerTitle: 'Your mentoring access is active.',
                bannerText: 'Review new student requests and keep your availability up to date.',
                primary: { label: 'View Student Requests', icon: 'fa-user-clock', section: 'requests' }
            },
            rejected: {
                title: 'Application requires attention',
                description: mentorAdminFeedbackText() || 'View the admin decision and available next steps.',
                badge: 'Rejected',
                heroMessage: 'Review the decision and contact admin if you need help.',
                notice: mentorAdminFeedbackText() || 'Contact admin if you need clarification.',
                bannerTitle: 'Your application needs attention.',
                bannerText: mentorAdminFeedbackText() || 'Review the admin decision and available next steps.',
                primary: { label: 'View Decision', icon: 'fa-circle-exclamation', section: 'complete-profile' }
            },
            suspended: {
                title: 'Mentoring temporarily unavailable',
                description: 'Your mentoring access is currently suspended.',
                badge: 'Suspended',
                heroMessage: 'Please contact EduPath Lanka support for assistance.',
                notice: 'Contact admin to resolve your account status.',
                bannerTitle: 'Mentoring access is suspended.',
                bannerText: 'Please contact EduPath Lanka support for assistance.',
                primary: { label: 'Contact Admin', icon: 'fa-headset', section: 'support' }
            }
        };
        return map[status] || (approved ? map.approved : map.draft);
    }

    function getProfileCompletionMessage(completion, approvalStatus, missingCount) {
        if (completion >= 100 && approvalStatus === 'approved') {
            return { title: 'Profile complete', description: 'Your approved profile is visible to students.' };
        }
        if (completion >= 100 && ['submitted', 'under_review'].includes(approvalStatus)) {
            return { title: 'Profile submitted', description: 'Your profile is currently being reviewed.' };
        }
        if (completion >= 100) {
            return { title: 'Profile complete', description: 'Submit your completed profile for admin review.' };
        }
        return {
            title: 'Complete your profile',
            description: `${missingCount} required ${missingCount === 1 ? 'detail is' : 'details are'} still missing.`
        };
    }

    function configureHeroAction(id, config = {}) {
        const button = document.getElementById(id);
        if (!button) return;
        button.classList.toggle('hidden', config.hidden === true);
        button.dataset.sectionJump = config.section || 'dashboard-overview';
        button.innerHTML = `<i class="fas ${config.icon || 'fa-arrow-right'}"></i> ${escapeHtml(config.label || 'Open')}`;
    }

    function renderMentorHomeActions(status) {
        const actionsByStatus = {
            draft: [
                { label: 'Complete Profile', icon: 'fa-user-check', section: 'complete-profile' },
                { label: 'Prepare Availability', icon: 'fa-calendar-plus', section: 'availability' }
            ],
            incomplete: [
                { label: 'Complete Profile', icon: 'fa-user-check', section: 'complete-profile' },
                { label: 'Prepare Availability', icon: 'fa-calendar-plus', section: 'availability' }
            ],
            submitted: [
                { label: 'View Submitted Profile', icon: 'fa-file-lines', section: 'complete-profile' },
                { label: 'Prepare Availability', icon: 'fa-calendar-plus', section: 'availability' }
            ],
            under_review: [
                { label: 'View Submitted Profile', icon: 'fa-file-lines', section: 'complete-profile' },
                { label: 'Prepare Availability', icon: 'fa-calendar-plus', section: 'availability' }
            ],
            changes_requested: [
                { label: 'Update Profile', icon: 'fa-pen-to-square', section: 'complete-profile' },
                { label: 'View Admin Feedback', icon: 'fa-comment-dots', section: 'complete-profile' }
            ],
            approved: [
                { label: 'View Student Requests', icon: 'fa-user-plus', section: 'requests' },
                { label: 'View Appointments', icon: 'fa-calendar-days', section: 'appointments' },
                { label: 'Update Availability', icon: 'fa-calendar-plus', section: 'availability' }
            ],
            rejected: [
                { label: 'View Decision', icon: 'fa-circle-exclamation', section: 'complete-profile' },
                { label: 'Contact Admin', icon: 'fa-headset', section: 'support' }
            ],
            suspended: [
                { label: 'Contact Admin', icon: 'fa-headset', section: 'support' }
            ]
        };
        const actions = actionsByStatus[status] || actionsByStatus.draft;
        ['mentor-home-primary-action', 'mentor-home-secondary-action', 'mentor-home-tertiary-action'].forEach((id, index) => {
            configureHeroAction(id, actions[index] || { hidden: true });
        });
    }

    function updateHeroAvailabilityMetric() {
        const normalized = normalizeAvailability(mentorAvailability || currentMentorData || {});
        const enabledDays = weekDays.filter((day) => normalized.availableDays[day]);
        const labels = enabledDays.map(dayLabel);
        setTextSafe('mentor-modern-availability', enabledDays.length ? `${enabledDays.length} ${enabledDays.length === 1 ? 'day' : 'days'} this week` : 'Set availability');
        setTextSafe('mentor-modern-availability-note', labels.length ? labels.join(', ') : 'For when your profile is approved');
    }

    function updateHeroNextSessionMetric() {
        const upcoming = Object.values(mentorAppointments || {})
            .filter((item) => String(item.status || '').toLowerCase() === 'accepted')
            .sort((a, b) => appointmentSortTime(a) - appointmentSortTime(b));
        if (!mentorAccessApproved) {
            setTextSafe('mentor-modern-next-session', 'Locked until approval');
            setTextSafe('mentor-modern-next-session-note', 'Appointments open after approval');
            toggleElementHidden('mentor-modern-session-action', true);
            return;
        }
        if (!upcoming.length) {
            setTextSafe('mentor-modern-next-session', 'No upcoming sessions');
            setTextSafe('mentor-modern-next-session-note', 'Nothing scheduled yet');
            toggleElementHidden('mentor-modern-session-action', false);
            return;
        }
        setTextSafe('mentor-modern-next-session', `${upcoming[0].date || 'Next date'}, ${formatTimeLabel(upcoming[0].startTime)}`);
        setTextSafe('mentor-modern-next-session-note', upcoming[0].studentName || 'Accepted session');
        toggleElementHidden('mentor-modern-session-action', false);
    }

    function toggleElementHidden(id, hidden) {
        document.getElementById(id)?.classList.toggle('hidden', hidden);
    }

    function connectedStudentCount() {
        return Object.values(connectedStudents || {}).filter((item) => String(item.status || '').toLowerCase() === 'connected').length;
    }

    function mentorAdminFeedbackText() {
        return currentMentorData.adminRequestedChanges || currentMentorData.adminReviewReason || currentMentorData.rejectionReason || '';
    }

    function arrayValue(value) {
        return Array.isArray(value) ? value : String(value || '').split(',').map((item) => item.trim()).filter(Boolean);
    }

    const mentorRequiredFields = [
        'photoURL', 'fullName', 'phone', 'district', 'preferredLanguages', 'mentorType', 'field',
        'currentPosition', 'universityOrCompany', 'highestQualification', 'studyArea', 'yearsOfExperience',
        'guidanceAreas', 'studentLevelsSupported', 'streamsSupported', 'mentoringMode', 'bio', 'whyMentor',
        'qualificationDocumentURL', 'informationConfirmed', 'mentorGuidelinesAccepted', 'publicationConsent'
    ];

    function collectMentorApplicationPayload() {
        const payload = {
            photoURL: appValue('photoURL'),
            fullName: appValue('fullName'),
            email: appValue('email'),
            phone: appValue('phone'),
            district: appValue('district'),
            city: appValue('city'),
            preferredLanguages: checkedValues('preferredLanguages'),
            mentorType: appValue('mentorType'),
            field: appValue('field'),
            expertise: appValue('field'),
            currentPosition: appValue('currentPosition'),
            currentRole: appValue('currentPosition'),
            universityOrCompany: appValue('universityOrCompany'),
            organization: appValue('universityOrCompany'),
            highestQualification: appValue('highestQualification'),
            studyArea: appValue('studyArea'),
            yearsOfExperience: appValue('yearsOfExperience'),
            experience: appValue('yearsOfExperience'),
            professionalMembership: appValue('professionalMembership'),
            linkedInURL: appValue('linkedInURL'),
            portfolioURL: appValue('portfolioURL'),
            guidanceAreas: checkedValues('guidanceAreas'),
            studentLevelsSupported: checkedValues('studentLevelsSupported'),
            streamsSupported: checkedValues('streamsSupported'),
            mentoringMode: appValue('mentoringMode'),
            maxStudents: appValue('maxStudents'),
            bio: appValue('bio'),
            whyMentor: appValue('whyMentor'),
            studentExpectation: appValue('studentExpectation'),
            cvURL: appValue('cvURL'),
            qualificationDocumentURL: appValue('qualificationDocumentURL'),
            experienceProofURL: appValue('experienceProofURL'),
            professionalCertificateURL: appValue('professionalCertificateURL'),
            informationConfirmed: document.getElementById('mentor-app-informationConfirmed')?.checked === true,
            mentorGuidelinesAccepted: document.getElementById('mentor-app-mentorGuidelinesAccepted')?.checked === true,
            publicationConsent: document.getElementById('mentor-app-publicationConsent')?.checked === true
        };
        payload.profileCompletion = calculateMentorApplicationCompletion(payload).percentage;
        return payload;
    }

    function calculateMentorApplicationCompletion(payload = collectMentorApplicationPayload()) {
        const missing = mentorRequiredFields.filter((key) => {
            const value = payload[key];
            return Array.isArray(value) ? !value.length : value !== true && !String(value || '').trim();
        });
        return { percentage: Math.round(((mentorRequiredFields.length - missing.length) / mentorRequiredFields.length) * 100), missing };
    }

    function renderMentorApplicationStatus(mentor = currentMentorData) {
        const status = mentorApprovalStatus(mentor);
        const completion = calculateMentorApplicationCompletion({ ...mentor, preferredLanguages: mentor.preferredLanguages || [], guidanceAreas: mentor.guidanceAreas || [], studentLevelsSupported: mentor.studentLevelsSupported || [], streamsSupported: mentor.streamsSupported || [] });
        setTextSafe('mentor-application-completion', `${mentor.profileCompletion || completion.percentage || 0}%`);
        setTextSafe('mentor-application-status-title', status.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase()));
        const messages = {
            draft: 'Complete your professional mentor profile and submit it for review.',
            incomplete: 'Complete your professional mentor profile and submit it for review.',
            submitted: 'Your mentor application is under review. You will be notified when a decision is made.',
            under_review: 'EduPath Lanka admin is currently reviewing your mentor application.',
            changes_requested: 'Admin requested changes to your mentor application. Update the requested fields and resubmit.',
            rejected: 'Your mentor application was rejected. Review the reason and contact admin if needed.',
            approved: 'Your mentor profile is approved. You can now mentor students.'
        };
        setTextSafe('mentor-application-status-message', messages[status] || messages.draft);
        const feedback = document.getElementById('mentor-admin-feedback');
        if (feedback) {
            const note = mentor.adminRequestedChanges || mentor.adminReviewReason || mentor.rejectionReason || '';
            feedback.classList.toggle('hidden', !note);
            feedback.innerHTML = note ? `<strong>Admin feedback</strong><p>${escapeHtml(note)}</p>` : '';
        }
        renderApplicationMissingFields();
    }

    function populateMentorApplicationForm(mentor = {}, user = {}) {
        const data = { ...user, ...mentor, email: mentor.email || user.email, fullName: mentor.fullName || user.fullName, phone: mentor.phone || user.phone };
        ['photoURL', 'fullName', 'email', 'phone', 'district', 'city', 'mentorType', 'field', 'currentPosition', 'universityOrCompany', 'highestQualification', 'studyArea', 'yearsOfExperience', 'professionalMembership', 'linkedInURL', 'portfolioURL', 'mentoringMode', 'maxStudents', 'bio', 'whyMentor', 'studentExpectation', 'cvURL', 'qualificationDocumentURL', 'experienceProofURL', 'professionalCertificateURL'].forEach((key) => setAppValue(key, data[key] || data[aliasKey(key)] || ''));
        ['preferredLanguages', 'guidanceAreas', 'studentLevelsSupported', 'streamsSupported'].forEach((key) => setCheckedValues(key, data[key] || []));
        ['informationConfirmed', 'mentorGuidelinesAccepted', 'publicationConsent'].forEach((key) => {
            const el = document.getElementById(`mentor-app-${key}`);
            if (el) el.checked = data[key] === true;
        });
    }

    function aliasKey(key) {
        return { currentPosition: 'currentRole', universityOrCompany: 'organization', yearsOfExperience: 'experience' }[key] || key;
    }

    async function saveMentorApplicationDraft() {
        if (!currentUid) return showToast('Your session has expired. Please log in again.', 'error');
        const payload = collectMentorApplicationPayload();
        const updates = {
            ...payload,
            profileStatus: payload.profileCompletion >= 100 ? 'completed' : 'incomplete',
            approvalStatus: 'draft',
            applicationStatus: 'draft',
            status: 'draft',
            publicVisibility: false,
            mentoringEnabled: false,
            updatedAt: serverTimestamp()
        };
        const button = document.getElementById('save-mentor-draft-btn');
        const originalText = button?.innerHTML;
        if (button) {
            button.disabled = true;
            button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
        }
        try {
            const batchUpdates = {};
            Object.entries(updates).forEach(([key, value]) => {
                if (value !== undefined && value !== null) batchUpdates[`mentors/${currentUid}/${key}`] = value;
            });
            Object.entries({
                mentorUid: currentUid,
                ...payload,
                profileStatus: updates.profileStatus,
                approvalStatus: 'draft',
                applicationStatus: 'draft',
                updatedAt: serverTimestamp()
            }).forEach(([key, value]) => {
                if (value !== undefined && value !== null) batchUpdates[`mentorApplications/${currentUid}/${key}`] = value;
            });
            ['cvURL', 'qualificationDocumentURL', 'experienceProofURL', 'professionalCertificateURL'].forEach((key) => {
                batchUpdates[`mentorPrivate/${currentUid}/${key}`] = payload[key] || '';
            });
            batchUpdates[`mentorPrivate/${currentUid}/mentorUid`] = currentUid;
            batchUpdates[`mentorPrivate/${currentUid}/updatedAt`] = serverTimestamp();
            await update(ref(database), batchUpdates);
            currentMentorData = { ...currentMentorData, ...updates };
            renderMentorApplicationStatus(currentMentorData);
            renderMentorHero();
            showMentorApplicationFeedback('Your mentor profile draft has been saved.', 'success');
            showToast('Your mentor profile draft has been saved.', 'success');
        } catch (error) {
            console.error('Mentor draft save failed:', error);
            showMentorApplicationFeedback(friendlyFirebaseError(error), 'error');
            showToast(friendlyFirebaseError(error), 'error');
        } finally {
            if (button) {
                button.disabled = false;
                button.innerHTML = originalText;
            }
        }
    }

    async function submitMentorApplication(event) {
        event.preventDefault();
        const submitButton = document.getElementById('submit-mentor-application-btn');
        if (submitButton?.dataset.submitting === 'true') return;
        const originalText = submitButton?.innerHTML;
        if (submitButton) {
            submitButton.dataset.submitting = 'true';
            submitButton.disabled = true;
            submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
        }
        try {
        const user = auth.currentUser;
        if (!currentUid || !user) throw new Error('Your session has expired. Please log in again.');
        const payload = collectMentorApplicationPayload();
        const result = calculateMentorApplicationCompletion(payload);
        if (result.missing.length) {
            renderApplicationMissingFields(result.missing);
            focusFirstMentorApplicationField(result.missing[0]);
            showMentorApplicationFeedback('Please complete all required mentor profile details before submitting.', 'error');
            showToast('Complete all required mentor application fields before submitting.', 'error');
            return;
        }
        const notificationRef = push(ref(database, 'notifications/admin'));
        const historyRef = push(ref(database, `mentorApplicationHistory/${currentUid}`));
        const updates = {};
        const submittedAt = currentMentorData.submittedAt || serverTimestamp();
        const resubmittedAt = currentMentorData.submittedAt ? serverTimestamp() : null;
        const mentorUpdates = {
            ...payload,
            profileStatus: 'completed',
            approvalStatus: 'submitted',
            applicationStatus: 'submitted',
            status: 'pending',
            publicVisibility: false,
            mentoringEnabled: false,
            submittedAt,
            resubmittedAt,
            adminReviewReason: '',
            adminRequestedChanges: '',
            updatedAt: serverTimestamp()
        };
        Object.entries(mentorUpdates).forEach(([key, value]) => {
            if (value !== undefined && value !== null) updates[`mentors/${currentUid}/${key}`] = value;
        });
        Object.entries({
            mentorUid: currentUid,
            ...payload,
            profileStatus: 'completed',
            approvalStatus: 'submitted',
            applicationStatus: 'submitted',
            submittedAt,
            resubmittedAt,
            updatedAt: serverTimestamp()
        }).forEach(([key, value]) => {
            if (value !== undefined && value !== null) updates[`mentorApplications/${currentUid}/${key}`] = value;
        });
        ['cvURL', 'qualificationDocumentURL', 'experienceProofURL', 'professionalCertificateURL'].forEach((key) => {
            updates[`mentorPrivate/${currentUid}/${key}`] = payload[key] || '';
        });
        updates[`mentorPrivate/${currentUid}/mentorUid`] = currentUid;
        updates[`mentorPrivate/${currentUid}/updatedAt`] = serverTimestamp();
        updates[`users/${currentUid}/fullName`] = payload.fullName;
        updates[`users/${currentUid}/phone`] = payload.phone;
        updates[`users/${currentUid}/photoURL`] = payload.photoURL;
        updates[`users/${currentUid}/mentorStatus`] = 'submitted';
        updates[`users/${currentUid}/updatedAt`] = serverTimestamp();
        updates[`notifications/admin/${notificationRef.key}`] = {
            notificationId: notificationRef.key,
            targetUserUid: 'admin',
            targetRole: 'admin',
            senderUid: currentUid,
            senderRole: 'mentor',
            type: 'mentor_application_submitted',
            title: 'New mentor application',
            message: `${payload.fullName || 'A mentor'} submitted a mentor profile for review.`,
            relatedEntityType: 'mentorApplication',
            relatedEntityId: currentUid,
            mentorUid: currentUid,
            targetPage: 'admin-dashboard.html',
            targetSection: 'mentor-approvals',
            targetQuery: { mentorUid: currentUid },
            read: false,
            status: 'unread',
            createdAt: serverTimestamp()
        };
        updates[`mentorApplicationHistory/${currentUid}/${historyRef.key}`] = {
            historyId: historyRef.key,
            action: currentMentorData.submittedAt ? 'resubmitted' : 'submitted',
            previousStatus: mentorApprovalStatus(),
            newStatus: 'submitted',
            message: 'Mentor submitted application for admin review.',
            performedBy: currentUid,
            performedByRole: 'mentor',
            createdAt: serverTimestamp()
        };
        await update(ref(database), updates);
        currentMentorData = { ...currentMentorData, ...mentorUpdates };
        mentorAccessApproved = false;
        renderMentorApplicationStatus(currentMentorData);
        applyMentorAccessGate();
        renderMentorHero();
        showApplicationFirst();
        showMentorApplicationFeedback('Your mentor application was submitted successfully. You will be notified after admin review.', 'success');
        showToast('Your mentor application was submitted successfully. The EduPath Lanka admin team will review it.', 'success');
        } catch (error) {
            console.error('Mentor application submission failed:', error);
            const message = friendlyFirebaseError(error);
            showMentorApplicationFeedback(message, 'error');
            showToast(message, 'error');
        } finally {
            if (submitButton) {
                submitButton.dataset.submitting = 'false';
                submitButton.disabled = false;
                submitButton.innerHTML = originalText;
            }
        }
    }

    function renderApplicationMissingFields(missing = calculateMentorApplicationCompletion().missing) {
        const target = document.getElementById('mentor-application-missing');
        if (!target) return;
        target.innerHTML = missing.length ? `<strong>Missing required fields:</strong><span>${missing.map((key) => escapeHtml(key.replace(/([A-Z])/g, ' $1'))).join(', ')}</span>` : '<span class="text-success">All required fields are complete.</span>';
    }

    function showMentorApplicationFeedback(message, type = 'info') {
        const target = document.getElementById('mentor-application-missing');
        if (!target) return;
        target.innerHTML = `<div class="mentor-form-feedback ${escapeHtml(type)}">${escapeHtml(message)}</div>`;
        target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function friendlyFirebaseError(error) {
        const message = String(error?.message || error || '');
        if (message.includes('PERMISSION_DENIED') || message.includes('permission_denied')) {
            return 'Firebase permissions blocked one submit path. Refresh the page and try again after the updated rules are deployed.';
        }
        if (message.includes('session has expired')) return message;
        if (message.includes('network')) return 'Network connection failed. Please check your internet and try again.';
        return message || 'Something went wrong. Please try again.';
    }

    function focusFirstMentorApplicationField(key) {
        const groupMap = {
            preferredLanguages: 'preferredLanguages',
            guidanceAreas: 'guidanceAreas',
            studentLevelsSupported: 'studentLevelsSupported',
            streamsSupported: 'streamsSupported'
        };
        const checkboxGroup = groupMap[key] ? document.querySelector(`[data-checkbox-group="${groupMap[key]}"]`) : null;
        const field = document.getElementById(`mentor-app-${key}`) || checkboxGroup;
        field?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        field?.querySelector?.('input')?.focus?.();
        field?.focus?.();
    }

    function appValue(key) {
        return document.getElementById(`mentor-app-${key}`)?.value.trim() || '';
    }

    function setAppValue(key, value) {
        const el = document.getElementById(`mentor-app-${key}`);
        if (el) el.value = value || '';
    }

    function checkedValues(group) {
        return [...document.querySelectorAll(`[data-checkbox-group="${group}"] input:checked`)].map((input) => input.value);
    }

    function setCheckedValues(group, values) {
        const selected = new Set(Array.isArray(values) ? values : String(values || '').split(',').map((item) => item.trim()).filter(Boolean));
        document.querySelectorAll(`[data-checkbox-group="${group}"] input`).forEach((input) => { input.checked = selected.has(input.value); });
    }

    const approvedProfileArrayFields = ['preferredLanguages', 'guidanceAreas', 'studentLevelsSupported', 'streamsSupported'];
    const approvedProfileEditableFields = [
        'fullName', 'phone', 'district', 'city', 'preferredLanguages',
        'mentorType', 'field', 'currentPosition', 'organization', 'highestQualification', 'studyArea',
        'yearsOfExperience', 'professionalMembership', 'linkedInURL', 'portfolioURL',
        'guidanceAreas', 'studentLevelsSupported', 'streamsSupported', 'mentoringMode', 'maxStudents',
        'bio', 'whyMentor', 'studentExpectation', 'photoURL'
    ];
    const criticalProfileFields = [
        'mentorType', 'field', 'expertise', 'currentPosition', 'organization', 'highestQualification',
        'studyArea', 'yearsOfExperience', 'qualificationDocumentURL', 'experienceProofURL',
        'professionalCertificateURL'
    ];

    function handleApprovedProfileClick(event) {
        const button = event.target.closest('[data-approved-profile-action]');
        if (!button) return;
        const action = button.dataset.approvedProfileAction;
        if (action === 'edit') renderApprovedMentorProfile(true);
        if (action === 'cancel') renderApprovedMentorProfile(false);
        if (action === 'photo') document.getElementById('approved-profile-photo-file')?.click();
        if (action === 'password') renderApprovedPasswordModal();
        if (action === 'public') window.open(`mentor-profile.html?mentorUid=${encodeURIComponent(currentUid || '')}`, '_blank', 'noopener');
    }

    function handleApprovedProfileChange(event) {
        if (event.target?.id !== 'approved-profile-photo-file') return;
        validateApprovedProfilePhoto(event.target.files?.[0]);
    }

    function handleApprovedProfileSubmit(event) {
        if (event.target?.id === 'approved-profile-form') {
            event.preventDefault();
            saveApprovedMentorProfile(event.target);
        }
        if (event.target?.id === 'approved-password-form') {
            event.preventDefault();
            changeApprovedMentorPassword(event.target);
        }
    }

    function approvedProfileData() {
        return {
            ...currentUserData,
            ...currentMentorData,
            email: currentMentorData.email || currentUserData.email || auth.currentUser?.email || '',
            fullName: currentMentorData.fullName || currentUserData.fullName || '',
            phone: currentMentorData.phone || currentUserData.phone || '',
            photoURL: currentMentorData.photoURL || currentUserData.photoURL || ''
        };
    }

    function renderApprovedMentorProfile(editing = false) {
        const root = document.getElementById('approved-mentor-profile-root');
        if (!root) return;
        const data = approvedProfileData();
        if (!mentorAccessApproved) {
            root.innerHTML = `
                <div class="section-header">
                    <h2>My Profile</h2>
                    <p class="section-desc">Complete your mentor application before your approved profile becomes active.</p>
                </div>
                <div class="mentor-profile-readonly-card glass">
                    <h3>Profile Application</h3>
                    <p>Your editable application is available in Complete Profile until admin approval.</p>
                    <button class="btn btn-primary" type="button" data-section-jump="complete-profile"><i class="fas fa-clipboard-check"></i> Complete Profile</button>
                </div>`;
            return;
        }
        root.innerHTML = editing ? approvedProfileEditHtml(data) : approvedProfileReadOnlyHtml(data);
    }

    function approvedProfileReadOnlyHtml(data) {
        return `
            <header class="approved-profile-header glass">
                <div class="approved-profile-photo">
                    <img src="${escapeHtml(data.photoURL || 'images/mentor-dashboard-illustration.png')}" alt="${escapeHtml(data.fullName || 'Mentor')} profile" onerror="this.src='images/mentor-dashboard-illustration.png'">
                </div>
                <div class="approved-profile-identity">
                    <span class="status-badge status-approved">Approved Mentor</span>
                    <h2>${escapeHtml(data.fullName || 'Mentor')}</h2>
                    <p>${escapeHtml(data.field || data.expertise || 'Field not set')}</p>
                    <small>${escapeHtml(data.currentPosition || data.currentRole || 'Position not set')}${data.organization || data.universityOrCompany ? ` at ${escapeHtml(data.organization || data.universityOrCompany)}` : ''}</small>
                </div>
                <div class="approved-profile-actions">
                    <button class="btn btn-primary" type="button" data-approved-profile-action="edit"><i class="fas fa-pen"></i> Edit Profile</button>
                    <button class="btn btn-outline" type="button" data-approved-profile-action="public"><i class="fas fa-eye"></i> View Public Profile</button>
                </div>
            </header>
            <div class="approved-profile-grid">
                <main class="approved-profile-main">
                    ${approvedProfileCard('Personal Information', [
                        ['Full Name', data.fullName], ['Email', data.email], ['Phone', data.phone], ['District', data.district], ['City', data.city]
                    ], [['Preferred Languages', data.preferredLanguages]])}
                    ${approvedProfileCard('Professional Background', [
                        ['Mentor Type', data.mentorType], ['Field / Expertise', data.field || data.expertise], ['Current Position', data.currentPosition || data.currentRole],
                        ['Organization', data.organization || data.universityOrCompany], ['Highest Qualification', data.highestQualification], ['Study Area', data.studyArea],
                        ['Years of Experience', data.yearsOfExperience || data.experience], ['Professional Membership', data.professionalMembership],
                        ['LinkedIn', data.linkedInURL], ['Portfolio', data.portfolioURL]
                    ])}
                    ${approvedProfileCard('Mentoring Preferences', [
                        ['Mentoring Mode', data.mentoringMode], ['Maximum Students', data.maxStudents]
                    ], [
                        ['Guidance Areas', data.guidanceAreas], ['Student Levels', data.studentLevelsSupported], ['Streams', data.streamsSupported]
                    ])}
                    ${approvedProfileCard('Biography and Expectations', [
                        ['Biography', data.bio], ['Why Mentor', data.whyMentor], ['Student Expectations', data.studentExpectation]
                    ])}
                </main>
                <aside class="approved-profile-side">
                    <section class="mentor-profile-readonly-card glass">
                        <h3>Account and Security</h3>
                        ${profileDetail('Email', data.email)}
                        ${profileDetail('Password Updated', data.passwordUpdatedAt ? formatDateTime(data.passwordUpdatedAt) : 'Not recorded')}
                        <button class="btn btn-outline" type="button" data-approved-profile-action="password"><i class="fas fa-lock"></i> Change Password</button>
                    </section>
                    <section class="mentor-profile-readonly-card glass">
                        <h3>Profile Photo</h3>
                        <p>Use Edit Profile to update your public mentor photo URL.</p>
                        <button class="btn btn-outline" type="button" data-approved-profile-action="edit"><i class="fas fa-image"></i> Change Profile Photo</button>
                    </section>
                    <section class="mentor-profile-readonly-card glass">
                        <h3>Verification Status</h3>
                        ${profileDetail('Status', 'Approved')}
                        ${profileDetail('Visibility', data.publicVisibility === false ? 'Hidden' : 'Visible to students')}
                        ${profileDetail('Last Updated', data.profileUpdatedAt || data.updatedAt ? formatDateTime(data.profileUpdatedAt || data.updatedAt) : 'Not recorded')}
                    </section>
                    <section class="mentor-profile-readonly-card glass">
                        <h3>Documents</h3>
                        ${documentStatusRow('CV', data.cvURL)}
                        ${documentStatusRow('Qualification Document', data.qualificationDocumentURL)}
                        ${documentStatusRow('Experience Proof', data.experienceProofURL)}
                        ${documentStatusRow('Professional Certificate', data.professionalCertificateURL)}
                    </section>
                </aside>
            </div>`;
    }

    function approvedProfileCard(title, details = [], tagRows = []) {
        return `<section class="mentor-profile-readonly-card glass"><h3>${escapeHtml(title)}</h3><div class="approved-detail-grid">${details.map(([label, value]) => profileDetail(label, value)).join('')}</div>${tagRows.map(([label, values]) => profileTagRow(label, values)).join('')}</section>`;
    }

    function profileDetail(label, value) {
        return `<div class="mentor-profile-detail"><span class="detail-label">${escapeHtml(label)}</span><strong class="detail-value">${escapeHtml(displayVal(value || 'Not provided'))}</strong></div>`;
    }

    function profileTagRow(label, values) {
        const rows = arrayValue(values);
        return `<div class="mentor-profile-tags-row"><span class="detail-label">${escapeHtml(label)}</span><div class="mentor-profile-tags">${rows.length ? rows.map((item) => `<span>${escapeHtml(item)}</span>`).join('') : '<span>Not provided</span>'}</div></div>`;
    }

    function documentStatusRow(label, url) {
        return `<div class="mentor-doc-status"><span>${escapeHtml(label)}</span><strong>${url ? 'Submitted' : 'Not submitted'}</strong>${url ? `<a class="btn btn-outline btn-sm" href="${escapeHtml(url)}" target="_blank" rel="noopener">View</a>` : ''}</div>`;
    }

    function approvedProfileEditHtml(data) {
        const languageOptions = ['Sinhala', 'English', 'Tamil'];
        const guidanceOptions = ['Course Selection', 'Career Planning', 'Skill Development', 'CV Preparation', 'Interview Preparation', 'Scholarship Guidance', 'Industry Knowledge'];
        const levelOptions = ['After O/L', 'After A/L', 'Diploma Students', 'Undergraduates', 'Graduates', 'Career Changers'];
        const streamOptions = ['Information Technology', 'Engineering', 'Science', 'Commerce', 'Arts', 'Health Sciences', 'Entrepreneurship'];
        return `
            <form id="approved-profile-form" class="approved-profile-edit glass" novalidate>
                <div class="approved-profile-edit-head">
                    <div>
                        <h2>Edit My Profile</h2>
                        <p>Update approved profile details without submitting a new mentor application.</p>
                    </div>
                    <div class="form-actions">
                        <button class="btn btn-outline" type="button" data-approved-profile-action="cancel">Cancel</button>
                        <button class="btn btn-primary" type="submit"><i class="fas fa-save"></i> Save Changes</button>
                    </div>
                </div>
                <div id="approved-profile-errors" class="missing-fields"></div>
                <fieldset><legend>Personal Information</legend><div class="grid-form">
                    ${profileInput('fullName', 'Full Name *', data.fullName)}
                    ${profileInput('email', 'Email', data.email, 'email', true)}
                    ${profileInput('phone', 'Phone *', data.phone)}
                    ${profileInput('district', 'District *', data.district)}
                    ${profileInput('city', 'City', data.city)}
                    ${profileInput('photoURL', 'Profile Photo URL', data.photoURL)}
                    <div class="form-group full-width"><label>Preferred Languages *</label>${profileCheckboxes('preferredLanguages', languageOptions, data.preferredLanguages)}</div>
                    <div class="form-group full-width"><button class="btn btn-outline btn-sm" type="button" data-approved-profile-action="photo"><i class="fas fa-image"></i> Preview Image File</button><input id="approved-profile-photo-file" type="file" accept="image/jpeg,image/png,image/webp" hidden><small id="approved-profile-photo-feedback">JPEG, PNG, or WebP. Maximum 5 MB. File preview does not upload until storage is configured.</small></div>
                </div></fieldset>
                <fieldset><legend>Professional Background</legend><div class="grid-form">
                    ${profileSelect('mentorType', 'Mentor Type *', ['Industry Professional', 'Academic', 'Engineer', 'Healthcare Professional', 'Entrepreneur', 'Career Counselor', 'Skilled Professional', 'Other'], data.mentorType)}
                    ${profileInput('field', 'Field / Expertise *', data.field || data.expertise)}
                    ${profileInput('currentPosition', 'Current Position *', data.currentPosition || data.currentRole)}
                    ${profileInput('organization', 'Organization *', data.organization || data.universityOrCompany)}
                    ${profileInput('highestQualification', 'Highest Qualification *', data.highestQualification)}
                    ${profileInput('studyArea', 'Study Area *', data.studyArea)}
                    ${profileInput('yearsOfExperience', 'Years of Experience *', data.yearsOfExperience || data.experience, 'number')}
                    ${profileInput('professionalMembership', 'Professional Membership', data.professionalMembership)}
                    ${profileInput('linkedInURL', 'LinkedIn URL', data.linkedInURL, 'url')}
                    ${profileInput('portfolioURL', 'Portfolio URL', data.portfolioURL, 'url')}
                </div></fieldset>
                <fieldset><legend>Mentoring Preferences</legend><div class="grid-form">
                    <div class="form-group full-width"><label>Guidance Areas *</label>${profileCheckboxes('guidanceAreas', guidanceOptions, data.guidanceAreas)}</div>
                    <div class="form-group full-width"><label>Student Levels Supported *</label>${profileCheckboxes('studentLevelsSupported', levelOptions, data.studentLevelsSupported)}</div>
                    <div class="form-group full-width"><label>Streams Supported *</label>${profileCheckboxes('streamsSupported', streamOptions, data.streamsSupported)}</div>
                    ${profileSelect('mentoringMode', 'Mentoring Mode *', ['Online', 'Physical', 'Hybrid'], data.mentoringMode)}
                    ${profileInput('maxStudents', 'Maximum Students *', data.maxStudents, 'number')}
                    ${profileTextarea('bio', 'Short Biography *', data.bio, 4)}
                    ${profileTextarea('whyMentor', 'Why Mentor *', data.whyMentor, 3)}
                    ${profileTextarea('studentExpectation', 'Student Expectations *', data.studentExpectation, 3)}
                </div></fieldset>
            </form>`;
    }

    function profileInput(name, label, value = '', type = 'text', readonly = false) {
        return `<div class="form-group"><label for="approved-profile-${name}">${escapeHtml(label)}</label><input id="approved-profile-${name}" name="${escapeHtml(name)}" class="form-control" type="${escapeHtml(type)}" value="${escapeHtml(value || '')}" ${readonly ? 'readonly' : ''}></div>`;
    }

    function profileTextarea(name, label, value = '', rows = 3) {
        return `<div class="form-group full-width"><label for="approved-profile-${name}">${escapeHtml(label)}</label><textarea id="approved-profile-${name}" name="${escapeHtml(name)}" class="form-control" rows="${rows}">${escapeHtml(value || '')}</textarea></div>`;
    }

    function profileSelect(name, label, options, value = '') {
        return `<div class="form-group"><label for="approved-profile-${name}">${escapeHtml(label)}</label><select id="approved-profile-${name}" name="${escapeHtml(name)}" class="form-control"><option value="">Select</option>${options.map((option) => `<option value="${escapeHtml(option)}" ${String(value || '') === option ? 'selected' : ''}>${escapeHtml(option)}</option>`).join('')}</select></div>`;
    }

    function profileCheckboxes(name, options, values = []) {
        const selected = new Set(arrayValue(values));
        return `<div class="check-grid" data-approved-checkbox-group="${escapeHtml(name)}">${options.map((option) => `<label><input type="checkbox" value="${escapeHtml(option)}" ${selected.has(option) ? 'checked' : ''}> ${escapeHtml(option)}</label>`).join('')}</div>`;
    }

    function collectApprovedProfileForm(form) {
        const data = {};
        approvedProfileEditableFields.forEach((field) => {
            if (approvedProfileArrayFields.includes(field)) {
                data[field] = [...form.querySelectorAll(`[data-approved-checkbox-group="${field}"] input:checked`)].map((input) => input.value);
            } else {
                data[field] = String(form.elements[field]?.value || '').trim();
            }
        });
        data.expertise = data.field;
        data.currentRole = data.currentPosition;
        data.universityOrCompany = data.organization;
        data.experience = data.yearsOfExperience;
        return data;
    }

    function validateApprovedProfile(data) {
        const errors = [];
        const textLength = (key, label, min, max) => {
            const length = String(data[key] || '').trim().length;
            if (length < min || length > max) errors.push(`${label} must be ${min}-${max} characters.`);
        };
        textLength('fullName', 'Full name', 2, 100);
        if (!/^(\+94|0)?7\d{8}$/.test(data.phone.replace(/\s+/g, ''))) errors.push('Phone must be a valid Sri Lankan mobile number.');
        ['district', 'field', 'currentPosition', 'organization', 'highestQualification', 'studyArea', 'mentoringMode'].forEach((key) => {
            if (!String(data[key] || '').trim()) errors.push(`${formatCategoryLabel(key)} is required.`);
        });
        if (!data.preferredLanguages.length) errors.push('Select at least one preferred language.');
        if (!data.guidanceAreas.length) errors.push('Select at least one guidance area.');
        if (!data.studentLevelsSupported.length) errors.push('Select at least one student level.');
        if (!data.streamsSupported.length) errors.push('Select at least one stream.');
        const years = Number(data.yearsOfExperience);
        if (!Number.isFinite(years) || years < 0 || years > 60) errors.push('Years of experience must be between 0 and 60.');
        const maxStudents = Number(data.maxStudents);
        if (!Number.isFinite(maxStudents) || maxStudents < 1 || maxStudents > 100) errors.push('Maximum students must be between 1 and 100.');
        textLength('bio', 'Biography', 30, 1500);
        textLength('whyMentor', 'Why mentor', 20, 1000);
        textLength('studentExpectation', 'Student expectations', 20, 1000);
        ['linkedInURL', 'portfolioURL'].forEach((key) => {
            if (data[key] && !/^https:\/\/\S+\.\S+/.test(data[key])) errors.push(`${formatCategoryLabel(key)} must be a valid HTTPS URL.`);
        });
        if (data.photoURL && !/^(https?:\/\/|images\/|\.\/|\/)/.test(data.photoURL)) errors.push('Profile photo must be a valid URL or project image path.');
        return errors;
    }

    function buildProfileChanges(oldData, newData) {
        const changedFields = {};
        const previousValues = {};
        const newValues = {};
        approvedProfileEditableFields.forEach((field) => {
            const previous = oldData[field] ?? oldData[aliasKey(field)] ?? '';
            const next = newData[field] ?? '';
            if (normalizeComparable(previous) !== normalizeComparable(next)) {
                changedFields[field] = true;
                previousValues[field] = previous;
                newValues[field] = next;
            }
        });
        return { changedFields, previousValues, newValues };
    }

    async function saveApprovedMentorProfile(form) {
        if (!currentUid || !mentorAccessApproved) return showToast('Approved profile updates are available after admin approval.', 'error');
        const sanitized = collectApprovedProfileForm(form);
        const errors = validateApprovedProfile(sanitized);
        const errorBox = document.getElementById('approved-profile-errors');
        if (errors.length) {
            if (errorBox) errorBox.innerHTML = `<div class="mentor-form-feedback error">${errors.map(escapeHtml).join('<br>')}</div>`;
            const firstField = form.querySelector('.form-control:not([readonly])');
            firstField?.focus();
            showToast('Please fix the highlighted profile fields.', 'error');
            return;
        }
        const previous = approvedProfileData();
        const { changedFields, previousValues, newValues } = buildProfileChanges(previous, sanitized);
        if (!Object.keys(changedFields).length) {
            showToast('No profile changes to save.', 'info');
            renderApprovedMentorProfile(false);
            return;
        }
        const requiresAdminReview = Object.keys(changedFields).some((field) => criticalProfileFields.includes(field));
        const changeRef = push(ref(database, `mentorProfileChanges/${currentUid}`));
        const notificationRef = push(ref(database, 'notifications/admin'));
        const logRef = push(ref(database, 'activityLogs'));
        const mentorRecord = {
            ...currentMentorData,
            ...sanitized,
            approvalStatus: 'approved',
            applicationStatus: 'approved',
            status: 'approved',
            accountStatus: 'active',
            publicVisibility: currentMentorData.publicVisibility !== false,
            mentoringEnabled: currentMentorData.mentoringEnabled !== false,
            profileUpdatedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            updatedBy: currentUid
        };
        const updates = {
            [`users/${currentUid}/fullName`]: sanitized.fullName,
            [`users/${currentUid}/phone`]: sanitized.phone,
            [`users/${currentUid}/photoURL`]: sanitized.photoURL,
            [`users/${currentUid}/updatedAt`]: serverTimestamp(),
            [`mentors/${currentUid}`]: mentorRecord,
            [`mentorProfileChanges/${currentUid}/${changeRef.key}`]: {
                changeId: changeRef.key,
                mentorUid: currentUid,
                mentorName: sanitized.fullName,
                changedFields,
                previousValues,
                newValues,
                requiresAdminReview,
                status: 'recorded',
                createdAt: serverTimestamp()
            },
            [`notifications/admin/${notificationRef.key}`]: {
                notificationId: notificationRef.key,
                type: 'approved_mentor_profile_updated',
                title: 'Approved Mentor Updated Profile',
                message: `${sanitized.fullName || 'A mentor'} updated mentor profile details.`,
                targetUserUid: 'admin',
                targetRole: 'admin',
                senderUid: currentUid,
                senderRole: 'mentor',
                relatedEntityType: 'mentor_profile_update',
                relatedEntityId: changeRef.key,
                mentorUid: currentUid,
                changeId: changeRef.key,
                targetPage: 'admin-dashboard.html',
                targetSection: 'mentor-profile-updates',
                targetQuery: { mentorUid: currentUid, changeId: changeRef.key },
                read: false,
                status: 'unread',
                createdAt: serverTimestamp()
            },
            [`activityLogs/${logRef.key}`]: {
                logId: logRef.key,
                action: 'approved_mentor_profile_updated',
                entityType: 'mentor',
                entityId: currentUid,
                actorUid: currentUid,
                actorRole: 'mentor',
                changedFields,
                requiresAdminReview,
                createdAt: serverTimestamp()
            }
        };
        try {
            await update(ref(database), updates);
            currentUserData = { ...currentUserData, fullName: sanitized.fullName, phone: sanitized.phone, photoURL: sanitized.photoURL };
            currentMentorData = { ...currentMentorData, ...mentorRecord };
            updateSidebarUser({ fullName: sanitized.fullName, role: 'mentor', photoURL: sanitized.photoURL });
            renderMentorHero();
            renderApprovedMentorProfile(false);
            showToast(requiresAdminReview ? 'Profile saved. Admin was notified about critical changes.' : 'Profile saved successfully.', 'success');
        } catch (error) {
            console.error('Approved mentor profile update failed:', error);
            if (errorBox) errorBox.innerHTML = `<div class="mentor-form-feedback error">${escapeHtml(friendlyFirebaseError(error))}</div>`;
            showToast(friendlyFirebaseError(error), 'error');
        }
    }

    function validateApprovedProfilePhoto(file) {
        const feedback = document.getElementById('approved-profile-photo-feedback');
        if (!file) return;
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
            if (feedback) feedback.textContent = 'Invalid image type. Use JPEG, PNG, or WebP.';
            showToast('Invalid image type. Use JPEG, PNG, or WebP.', 'error');
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            if (feedback) feedback.textContent = 'Image is too large. Maximum size is 5 MB.';
            showToast('Image is too large. Maximum size is 5 MB.', 'error');
            return;
        }
        if (feedback) feedback.textContent = `${file.name} selected for preview. Add the uploaded image URL in Profile Photo URL to save it.`;
        showToast('Image validated. Upload storage is not configured in this project, so save the uploaded URL.', 'info');
    }

    function renderApprovedPasswordModal() {
        const isPasswordUser = auth.currentUser?.providerData?.some((provider) => provider.providerId === 'password');
        let modal = document.getElementById('approved-password-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'approved-password-modal';
            modal.className = 'modal-overlay';
            document.body.appendChild(modal);
        }
        modal.innerHTML = `
            <div class="modal-card appointment-detail-modal">
                <div class="modal-header">
                    <h3>Change Password</h3>
                    <button type="button" class="modal-close" aria-label="Close">&times;</button>
                </div>
                ${isPasswordUser ? `
                    <form id="approved-password-form" class="modal-body">
                        <div id="approved-password-errors" class="missing-fields"></div>
                        <div class="form-group"><label>Current Password</label><input name="currentPassword" class="form-control" type="password" autocomplete="current-password" required></div>
                        <div class="form-group"><label>New Password</label><input name="newPassword" class="form-control" type="password" autocomplete="new-password" required></div>
                        <div class="form-group"><label>Confirm New Password</label><input name="confirmPassword" class="form-control" type="password" autocomplete="new-password" required></div>
                        <div class="form-actions"><button class="btn btn-outline" type="button" data-modal-close>Cancel</button><button class="btn btn-primary" type="submit">Update Password</button></div>
                    </form>` : `<p>Password changes are managed by your sign-in provider.</p>`}
            </div>`;
        modal.classList.remove('hidden');
        modal.querySelector('.modal-close')?.addEventListener('click', () => modal.classList.add('hidden'));
        modal.querySelector('[data-modal-close]')?.addEventListener('click', () => modal.classList.add('hidden'));
    }

    async function changeApprovedMentorPassword(form) {
        const currentPassword = form.elements.currentPassword?.value || '';
        const newPassword = form.elements.newPassword?.value || '';
        const confirmPassword = form.elements.confirmPassword?.value || '';
        const errors = [];
        if (!currentPassword) errors.push('Current password is required.');
        if (newPassword.length < 8 || !/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/\d/.test(newPassword) || !/[^A-Za-z0-9]/.test(newPassword)) errors.push('New password must be at least 8 characters and include uppercase, lowercase, number, and special character.');
        if (newPassword !== confirmPassword) errors.push('Confirm password must match.');
        if (currentPassword && newPassword && currentPassword === newPassword) errors.push('New password must be different from current password.');
        const errorBox = document.getElementById('approved-password-errors');
        if (errors.length) {
            if (errorBox) errorBox.innerHTML = `<div class="mentor-form-feedback error">${errors.map(escapeHtml).join('<br>')}</div>`;
            return;
        }
        try {
            const user = auth.currentUser;
            const credential = EmailAuthProvider.credential(user.email, currentPassword);
            await reauthenticateWithCredential(user, credential);
            await updatePassword(user, newPassword);
            await update(ref(database), {
                [`users/${currentUid}/passwordUpdatedAt`]: serverTimestamp(),
                [`mentors/${currentUid}/passwordUpdatedAt`]: serverTimestamp()
            });
            document.getElementById('approved-password-modal')?.classList.add('hidden');
            showToast('Password updated successfully.', 'success');
        } catch (error) {
            console.error('Password update failed:', error);
            if (errorBox) errorBox.innerHTML = `<div class="mentor-form-feedback error">${escapeHtml(friendlyFirebaseError(error))}</div>`;
        }
    }

    function setupSectionNavigation() {
        const navLinks = document.querySelectorAll('.sidebar-links a[data-section]');
        const sections = document.querySelectorAll('.dashboard-section');

        function showSection(sectionId) {
            if (!sectionId) return;
            if (mentorAccessApproved && sectionId === 'complete-profile') {
                sectionId = 'my-profile';
                if (window.location.hash === '#complete-profile') {
                    history.replaceState(null, '', '#my-profile');
                }
            }
            if (!canAccessMentorSection(sectionId)) {
                showToast('This mentor function becomes available after admin approval.', 'warning');
                sectionId = mentorAccessApproved ? 'my-profile' : 'complete-profile';
            }

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
            const sectionId = window.location.hash ? window.location.hash.replace('#', '') : 'dashboard-overview';
            showSection(document.getElementById(sectionId) ? sectionId : 'dashboard-overview');
        });

        const urlSection = new URLSearchParams(window.location.search).get('section') || '';
        const hashSection = window.location.hash ? window.location.hash.replace('#', '') : urlSection;
        const savedSection = localStorage.getItem('mentorActiveSection');
        const defaultSection = 'dashboard-overview';
        const initialSection = document.getElementById(hashSection)
            ? hashSection
            : document.getElementById(savedSection)
                ? savedSection
                : defaultSection;

        showSection(mentorAccessApproved && initialSection === 'complete-profile' ? 'my-profile' : initialSection);
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
        const clean = String(status || 'draft').toLowerCase();
        const label = clean.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
        statEl.textContent = label;
        
        if (['draft', 'incomplete'].includes(clean)) {
            statEl.className = 'text-warning';
            if (alertEl) {
                alertEl.textContent = 'Complete your professional mentor profile and submit it for review.';
                alertEl.className = 'alert alert-warning';
                alertEl.classList.remove('hidden');
            }
        } else if (['pending', 'submitted', 'under_review'].includes(clean)) {
            statEl.className = 'text-warning';
            if (alertEl) {
                alertEl.textContent = "Your mentor application is under review. You will be notified when a decision is made.";
                alertEl.className = "alert alert-warning";
                alertEl.classList.remove('hidden');
            }
        } else if (clean === 'approved') {
            statEl.className = 'text-success';
            if (alertEl) alertEl.classList.add('hidden');
        } else if (clean === 'changes_requested') {
            statEl.className = 'text-warning';
            if (alertEl) {
                alertEl.textContent = 'Admin requested changes to your mentor application.';
                alertEl.className = 'alert alert-warning';
                alertEl.classList.remove('hidden');
            }
        } else if (clean === 'rejected') {
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
        currentMentorData = { ...currentMentorData, profileCompletion: percentage };

        // Save to Database
        update(ref(database, 'mentors/' + uid), { profileCompletion: percentage });

        // Update UI Progress Display
        const progressBar = document.getElementById('dynamic-profile-progress-bar');
        const progressBadge = document.getElementById('profile-strength-badge');
        const statProfileCompletion = document.getElementById('stat-profile-completion');
        const progressMsg = document.getElementById('profile-strength-message');

        if (progressBar) progressBar.style.width = `${percentage}%`;
        if (statProfileCompletion) {
            statProfileCompletion.textContent = `${percentage}%`;
            statProfileCompletion.parentElement?.style.setProperty('--profile-progress', `${percentage * 3.6}deg`);
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
        if (progressMsg) {
            const status = mentorApprovalStatus(currentMentorData);
            const completion = calculateMentorApplicationCompletion({
                ...currentMentorData,
                preferredLanguages: arrayValue(currentMentorData.preferredLanguages),
                guidanceAreas: arrayValue(currentMentorData.guidanceAreas),
                studentLevelsSupported: arrayValue(currentMentorData.studentLevelsSupported),
                streamsSupported: arrayValue(currentMentorData.streamsSupported)
            });
            const copy = getProfileCompletionMessage(percentage, status, completion.missing.length);
            progressMsg.textContent = `${copy.title}: ${copy.description}`;
            progressMsg.style.color = percentage < 100 ? '#f59e0b' : ['submitted', 'under_review'].includes(status) ? '#2563eb' : '#10b981';
        }
        renderMentorHero();
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
            renderMentorHero();
        });
    }

    function listenForAppointments(uid) {
        const appointmentsRef = query(ref(database, 'mentorAppointments'), orderByChild('mentorUid'), equalTo(uid));
        onValue(appointmentsRef, (snapshot) => {
            mentorAppointments = snapshot.val() || {};
            renderMentorAppointments();
        });
    }

    function listenForRatings(uid) {
        onValue(ref(database, `mentorRatings/${uid}`), (snapshot) => {
            mentorRatings = snapshot.val() || {};
            mentorRatingSummary = calculateMentorRatingSummary(getMergedMentorRatings());
            renderMentorRatings();
        });
        onValue(ref(database, `publicMentorReviews/${uid}`), (snapshot) => {
            mentorPublicReviews = snapshot.val() || {};
            mentorRatingSummary = calculateMentorRatingSummary(getMergedMentorRatings());
            renderMentorRatings();
        });
        onValue(ref(database, `mentorRatingSummaries/${uid}`), (snapshot) => {
            mentorRatingSummary = snapshot.val() || mentorRatingSummary || {};
            renderMentorRatings();
        });
    }

    function getMergedMentorRatings() {
        const merged = { ...(mentorRatings || {}) };
        Object.entries(mentorPublicReviews || {}).forEach(([appointmentId, publicReview]) => {
            const privateReview = merged[appointmentId] || {};
            merged[appointmentId] = {
                ...privateReview,
                ...publicReview,
                appointmentId: publicReview.appointmentId || privateReview.appointmentId || appointmentId,
                ratingId: publicReview.ratingId || privateReview.ratingId || appointmentId,
                reviewStatus: normalizeRatingStatus(publicReview.reviewStatus || privateReview.reviewStatus || "published"),
                isVerified: Boolean(publicReview) || publicReview.isVerified === true || privateReview.isVerified === true
            };
        });
        return merged;
    }

    function renderMentorRatingsLegacy() {
        const averageEl = document.getElementById('mentor-rating-average');
        if (!averageEl) return;
        const summary = mentorRatingSummary?.totalRatings !== undefined ? mentorRatingSummary : calculateMentorRatingSummary(mentorRatings);
        const total = Number(summary.totalRatings || 0);
        averageEl.textContent = total ? `★ ${Number(summary.averageRating || 0).toFixed(1)}` : 'New Mentor';
        setTextSafe('mentor-rating-total', total ? `${total} verified review${total === 1 ? '' : 's'}` : 'No verified ratings yet');
        setTextSafe('mentor-rating-recommend', total ? `${Number(summary.recommendationPercentage || 0)}%` : '--');
        setTextSafe('mentor-rating-top-category', topRatingCategory(summary.categoryAverages));
        renderRatingBreakdownLegacy(summary);
        renderMentorReviewList();
    }

    function renderRatingBreakdownLegacy(summary = {}) {
        const container = document.getElementById('mentor-rating-breakdown');
        if (!container) return;
        const total = Number(summary.totalRatings || 0);
        const dist = summary.ratingDistribution || {};
        const categories = summary.categoryAverages || {};
        container.innerHTML = `
            <div class="rating-bars">
                ${[5, 4, 3, 2, 1].map((star) => {
                    const count = Number(dist[star] || 0);
                    const width = total ? Math.round((count / total) * 100) : 0;
                    return `<div class="rating-bar-row"><span>${star} ★</span><div class="rating-bar-track"><div class="rating-bar-fill" style="width:${width}%"></div></div><strong>${count}</strong></div>`;
                }).join('')}
            </div>
            <div class="detail-grid recommendation-detail-grid mt-3">
                <div><span>Communication</span><strong>${ratingAverageLabel(categories.communication)}</strong></div>
                <div><span>Knowledge</span><strong>${ratingAverageLabel(categories.knowledge)}</strong></div>
                <div><span>Helpfulness</span><strong>${ratingAverageLabel(categories.helpfulness)}</strong></div>
                <div><span>Professionalism</span><strong>${ratingAverageLabel(categories.professionalism)}</strong></div>
            </div>
        `;
    }

    function renderMentorReviewListLegacy() {
        const container = document.getElementById('mentor-reviews-list');
        if (!container) return;
        const reviews = publicReviewRows(mentorRatings).slice(0, 12);
        if (!reviews.length) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-star"></i><p>No written reviews yet.</p></div>';
            return;
        }
        container.innerHTML = reviews.map((review) => `
            <article class="review-card">
                <div class="review-card-head">
                    <div>
                        <strong>${escapeHtml(review.displayPreference === 'anonymous' ? 'Verified Student' : 'Student Review')}</strong>
                        <button type="button" class="verified-review-badge review-detail-trigger" data-view-review-rating="${escapeHtml(review.appointmentId || '')}"><i class="fas fa-circle-check"></i> Verified Mentoring Session</button>
                    </div>
                    <span class="review-stars">${'★'.repeat(Number(review.overallRating || 0))}</span>
                </div>
                <p>${escapeHtml(review.review || '')}</p>
                <small class="text-muted">${escapeHtml(formatDateTime(review.createdAt || review.updatedAt))}</small>
                <div class="mt-3"><button type="button" class="btn btn-outline btn-sm" data-report-review="${escapeHtml(review.appointmentId || '')}">Report Review</button></div>
            </article>
        `).join('');
        container.querySelectorAll('[data-report-review]').forEach((button) => {
            button.addEventListener('click', () => reportReview(button.dataset.reportReview));
        });
        container.querySelectorAll('[data-view-review-rating]').forEach((button) => {
            button.addEventListener('click', () => openReviewRatingDetail(button.dataset.viewReviewRating));
        });
    }

    function openReviewRatingDetail(appointmentId) {
        const review = getMergedMentorRatings()?.[appointmentId];
        if (!review) return showToast('Rating details are unavailable. Please refresh and try again.', 'error');
        let modal = document.getElementById('mentor-review-rating-detail-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'mentor-review-rating-detail-modal';
            modal.className = 'modal-overlay hidden';
            document.body.appendChild(modal);
        }
        modal.innerHTML = `
            <div class="modal-card appointment-detail-modal">
                <div class="modal-header">
                    <div>
                        <h3>Student Rating Details</h3>
                        <p class="text-muted">${escapeHtml(review.studentDisplayName || 'Verified Student')} - ${escapeHtml(formatDateTime(review.createdAt || review.updatedAt))}</p>
                    </div>
                    <button type="button" class="modal-close" id="mentor-review-rating-detail-close" aria-label="Close">&times;</button>
                </div>
                <div class="detail-grid recommendation-detail-grid">
                    <div><span>Overall</span><strong>${escapeHtml(review.overallRating || 'N/A')} / 5</strong></div>
                    <div><span>Communication</span><strong>${escapeHtml(review.communicationRating || 'Not rated')}</strong></div>
                    <div><span>Knowledge</span><strong>${escapeHtml(review.knowledgeRating || 'Not rated')}</strong></div>
                    <div><span>Helpfulness</span><strong>${escapeHtml(review.helpfulnessRating || 'Not rated')}</strong></div>
                    <div><span>Professionalism</span><strong>${escapeHtml(review.professionalismRating || 'Not rated')}</strong></div>
                    <div><span>Would Recommend</span><strong>${review.wouldRecommend === true ? 'Yes' : 'No'}</strong></div>
                    <div><span>Status</span><strong>${escapeHtml(review.reviewStatus || 'published')}</strong></div>
                    <div><span>Verified</span><strong>${review.isVerified === true ? 'Yes' : 'No'}</strong></div>
                    <div class="full-width"><span>Written Review</span><strong>${escapeHtml(review.review || 'No written review submitted.')}</strong></div>
                </div>
            </div>
        `;
        modal.classList.remove('hidden');
        document.getElementById('mentor-review-rating-detail-close')?.addEventListener('click', () => modal.classList.add('hidden'));
        modal.addEventListener('click', (event) => {
            if (event.target === modal) modal.classList.add('hidden');
        });
    }

    function renderMentorRatings() {
        const averageEl = document.getElementById('mentor-rating-average');
        if (!averageEl) return;
        const mergedRatings = getMergedMentorRatings();
        const summary = calculateMentorRatingSummary(mergedRatings);
        mentorRatingSummary = summary;
        const reviews = publicReviewRows(mergedRatings);
        const total = Number(summary.totalRatings || 0);
        const average = Number(summary.averageRating || 0);
        averageEl.textContent = total ? average.toFixed(1) : 'New Mentor';
        setTextSafe('mentor-rating-total', total ? `${total} verified review${total === 1 ? '' : 's'}` : 'No verified ratings yet');
        setTextSafe('mentor-rating-recommend', total ? `${Number(summary.recommendationPercentage || 0)}%` : '--');
        setTextSafe('mentor-rating-top-category', topRatingCategoryName(summary.categoryAverages));
        setTextSafe('mentor-rating-count', total);
        setTextSafe('mentor-rating-stars', total ? ratingStars(average) : '☆☆☆☆☆');
        renderMentorReviewList(reviews);
        renderRatingTrends(reviews);
        renderCommonPraise(reviews);
        renderImprovementPanel(summary);
        const viewAllButton = document.getElementById('mentor-view-all-reviews');
        if (viewAllButton) viewAllButton.onclick = () => renderMentorReviewList(reviews, Math.max(reviews.length, 4));
    }

    function renderRatingBreakdown(summary = {}) {
        const container = document.getElementById('mentor-rating-breakdown');
        if (!container) return;
        const total = Number(summary.totalRatings || 0);
        const dist = summary.ratingDistribution || {};
        const categories = summary.categoryAverages || {};
        const categoryRows = [
            ['Communication', 'communication', 'fa-comments', '#2563eb'],
            ['Knowledge', 'knowledge', 'fa-book-open', '#16a34a'],
            ['Helpfulness', 'helpfulness', 'fa-heart', '#f59e0b'],
            ['Professionalism', 'professionalism', 'fa-briefcase', '#7c3aed']
        ];
        container.innerHTML = `
            <div class="modern-rating-breakdown">
                <div class="rating-bars">
                    ${[5, 4, 3, 2, 1].map((star) => {
                        const count = Number(dist[star] || 0);
                        const width = total ? Math.round((count / total) * 100) : 0;
                        return `<div class="rating-bar-row"><span>${star} ★</span><div class="rating-bar-track"><div class="rating-bar-fill" style="width:${width}%"></div></div><strong>${count}</strong></div>`;
                    }).join('')}
                </div>
                <div class="category-rating-list">
                    <h4>Category Ratings</h4>
                    ${categoryRows.map(([label, key, icon, color]) => {
                        const value = Number(categories[key] || 0);
                        const width = value ? (value / 5) * 100 : 0;
                        return `<div class="category-rating-row">
                            <span class="category-icon" style="--cat-color:${color}"><i class="fas ${icon}"></i></span>
                            <div>
                                <div class="category-rating-meta"><span>${escapeHtml(label)}</span><strong>${value ? `${value.toFixed(1)} / 5` : '--'}</strong></div>
                                <div class="category-track"><span style="width:${width}%; background:${color};"></span></div>
                            </div>
                        </div>`;
                    }).join('')}
                </div>
            </div>
        `;
    }

    function renderMentorReviewList(reviews = publicReviewRows(getMergedMentorRatings()), limit = 4) {
        const container = document.getElementById('mentor-reviews-list');
        if (!container) return;
        if (!reviews.length) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-star"></i><p>No written reviews yet.</p></div>';
            return;
        }
        container.innerHTML = reviews.slice(0, limit).map((review, index) => {
            const name = review.studentDisplayName || (review.displayPreference === 'anonymous' ? 'Verified Student' : 'Student Review');
            const topic = review.topic || review.guidanceArea || review.sessionTopic || review.appointmentTopic || 'Mentoring Session';
            return `
                <article class="review-card modern-review-card">
                    <span class="review-avatar tone-${(index % 4) + 1}">${escapeHtml(getInitials(name))}</span>
                    <div class="review-student-meta">
                        <strong>${escapeHtml(name)}</strong>
                        <small>${escapeHtml(formatShortReviewDate(review.createdAt || review.updatedAt))}</small>
                    </div>
                    <div class="review-rating-meta">
                        <span class="review-stars">${ratingStars(Number(review.overallRating || 0))}</span>
                        <strong>${Number(review.overallRating || 0).toFixed(1)}</strong>
                        <button type="button" class="verified-review-badge review-detail-trigger" data-view-review-rating="${escapeHtml(review.appointmentId || '')}">${escapeHtml(topic)}</button>
                    </div>
                    <p>${escapeHtml(review.review || 'No written review submitted.')}</p>
                    <button type="button" class="btn btn-outline btn-sm review-report-btn" data-report-review="${escapeHtml(review.appointmentId || '')}">Report</button>
                </article>
            `;
        }).join('');
        container.querySelectorAll('[data-report-review]').forEach((button) => {
            button.addEventListener('click', () => reportReview(button.dataset.reportReview));
        });
        container.querySelectorAll('[data-view-review-rating]').forEach((button) => {
            button.addEventListener('click', () => openReviewRatingDetail(button.dataset.viewReviewRating));
        });
    }

    function renderRatingTrends(reviews = []) {
        const container = document.getElementById('mentor-rating-trends');
        if (!container) return;
        const months = lastMonthBuckets(6);
        reviews.forEach((review) => {
            const time = ratingTime(review.createdAt || review.updatedAt);
            if (!time) return;
            const bucket = months.find((item) => item.key === monthKey(new Date(time)));
            if (!bucket) return;
            bucket.sum += Number(review.overallRating || 0);
            bucket.count += 1;
        });
        const values = months.map((item) => item.count ? Math.round((item.sum / item.count) * 10) / 10 : 0);
        const points = values.map((value, index) => {
            const x = 24 + index * (276 / Math.max(1, values.length - 1));
            const normalized = value ? (value - 3) / 2 : 0;
            const y = 120 - Math.max(0, Math.min(1, normalized)) * 78;
            return [x, y, value];
        });
        const path = points.map(([x, y], index) => `${index ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
        const area = `${path} L300 132 L24 132 Z`;
        container.innerHTML = `
            <svg viewBox="0 0 324 150" role="img" aria-label="Average rating trend">
                <path d="${area}" fill="#bfdbfe" opacity="0.45"></path>
                <path d="${path}" fill="none" stroke="#2563eb" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"></path>
                ${points.map(([x, y, value]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5" fill="#2563eb"></circle><text x="${x.toFixed(1)}" y="${(y - 12).toFixed(1)}" text-anchor="middle">${value ? value.toFixed(1) : '-'}</text>`).join('')}
                ${months.map((item, index) => `<text x="${(24 + index * (276 / Math.max(1, months.length - 1))).toFixed(1)}" y="146" text-anchor="middle">${escapeHtml(item.label)}</text>`).join('')}
            </svg>
        `;
    }

    function renderCommonPraise(reviews = []) {
        const container = document.getElementById('mentor-common-praise');
        if (!container) return;
        const praise = [
            ['Communication', 'fa-comments', /communicat|explain|clear|listen/i],
            ['Friendly', 'fa-face-smile', /friend|kind|support|patient/i],
            ['Helpful', 'fa-thumbs-up', /help|useful|practical|guid/i],
            ['Clear Guidance', 'fa-lightbulb', /clarity|clear guidance|direction|path/i],
            ['Knowledgeable', 'fa-graduation-cap', /knowledge|expert|understand|concept/i],
            ['Patient', 'fa-heart', /patient|calm|encourag/i]
        ].map(([label, icon, pattern]) => ({
            label,
            icon,
            count: reviews.filter((review) => pattern.test(`${review.review || ''} ${review.topic || ''}`)).length
        }));
        const visible = praise.filter((item) => item.count > 0).sort((a, b) => b.count - a.count).slice(0, 6);
        const rows = visible.length ? visible : praise.slice(0, 4).map((item) => ({ ...item, count: 0 }));
        container.innerHTML = rows.map((item) => `
            <div class="praise-chip">
                <i class="fas ${item.icon}"></i>
                <span>${escapeHtml(item.label)}</span>
                <strong>${item.count}</strong>
            </div>
        `).join('');
    }

    function renderImprovementPanel(summary = {}) {
        const container = document.getElementById('mentor-improvement-panel');
        if (!container) return;
        const categories = summary.categoryAverages || {};
        const low = Object.entries(categories)
            .filter(([, value]) => Number(value) > 0 && Number(value) < 4.5)
            .sort(([, a], [, b]) => Number(a) - Number(b));
        if (!Number(summary.totalRatings || 0)) {
            container.innerHTML = `<div class="improvement-empty"><i class="fas fa-circle-info"></i><strong>No reviews yet</strong><p>Completed session reviews will appear here after admin approval.</p></div>`;
            return;
        }
        if (!low.length) {
            container.innerHTML = `<div class="improvement-empty success"><i class="fas fa-circle-info"></i><strong>Great job!</strong><p>You're doing excellent across all rated areas. Keep up the amazing work.</p><span class="trend-arrow"><i class="fas fa-arrow-trend-up"></i></span></div>`;
            return;
        }
        container.innerHTML = low.map(([key, value]) => `<div class="improvement-item"><strong>${escapeHtml(formatCategoryLabel(key))}</strong><span>${Number(value).toFixed(1)} / 5</span><p>Review recent student feedback and focus this area in upcoming sessions.</p></div>`).join('');
    }

    async function reportReview(appointmentId) {
        if (!appointmentId) return;
        const reason = prompt('Why are you reporting this review? abusive language, false information, privacy concern, unrelated content, or other');
        if (!reason?.trim()) return;
        const updates = {};
        updates[`reviewReports/${currentUid}/${appointmentId}`] = {
            mentorUid: currentUid,
            appointmentId,
            reason: reason.trim(),
            status: 'open',
            createdAt: serverTimestamp()
        };
        await update(ref(database), updates);
        showToast('Review report submitted for admin review.', 'success');
    }

    function topRatingCategory(categories = {}) {
        const rows = Object.entries(categories || {}).filter(([, value]) => Number(value) > 0);
        if (!rows.length) return '--';
        rows.sort(([, a], [, b]) => Number(b) - Number(a));
        return `${rows[0][0][0].toUpperCase()}${rows[0][0].slice(1)} ${Number(rows[0][1]).toFixed(1)}`;
    }

    function topRatingCategoryName(categories = {}) {
        const rows = Object.entries(categories || {}).filter(([, value]) => Number(value) > 0);
        if (!rows.length) return '--';
        rows.sort(([, a], [, b]) => Number(b) - Number(a));
        return formatCategoryLabel(rows[0][0]);
    }

    function formatCategoryLabel(value = '') {
        return String(value || '').replace(/([A-Z])/g, ' $1').replace(/^./, (char) => char.toUpperCase());
    }

    function ratingStars(value = 0) {
        const rounded = Math.round(Number(value || 0));
        return `${'★'.repeat(Math.max(0, Math.min(5, rounded)))}${'☆'.repeat(Math.max(0, 5 - rounded))}`;
    }

    function ratingTime(value) {
        if (!value) return 0;
        if (typeof value === 'number') return value;
        if (typeof value === 'object' && typeof value.seconds === 'number') return value.seconds * 1000;
        const parsed = Date.parse(value);
        return Number.isNaN(parsed) ? 0 : parsed;
    }

    function formatShortReviewDate(value) {
        const time = ratingTime(value);
        return time ? new Date(time).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recent';
    }

    function monthKey(date) {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    }

    function lastMonthBuckets(count = 6) {
        const now = new Date();
        return Array.from({ length: count }, (_, index) => {
            const date = new Date(now.getFullYear(), now.getMonth() - (count - 1 - index), 1);
            return {
                key: monthKey(date),
                label: date.toLocaleDateString(undefined, { month: 'short' }),
                sum: 0,
                count: 0
            };
        });
    }

    function ratingAverageLabel(value) {
        return Number(value || 0) ? `${Number(value).toFixed(1)} / 5` : '--';
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
        updateHeroNextSessionMetric();
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
            targetUserUid: appointment.studentUid,
            targetRole: 'student',
            senderUid: currentUid,
            senderRole: 'mentor',
            type: 'appointment_accepted',
            title: 'Your mentoring session was accepted',
            messagePreview: `${currentUserData.fullName || 'Your mentor'} accepted your session for ${appointment.date} at ${formatTimeLabel(appointment.startTime)}.`,
            relatedEntityType: 'mentorAppointment',
            relatedEntityId: appointmentId,
            appointmentId,
            mentorUid: currentUid,
            targetPage: 'student-dashboard.html',
            targetSection: 'mentor-sessions-section',
            targetQuery: { appointmentId },
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
            targetUserUid: appointment.studentUid,
            targetRole: 'student',
            senderUid: currentUid,
            senderRole: 'mentor',
            type: 'appointment_rejected',
            title: 'Your mentoring session request was rejected',
            messagePreview: reason || `${currentUserData.fullName || 'Your mentor'} rejected your session request.`,
            relatedEntityType: 'mentorAppointment',
            relatedEntityId: appointmentId,
            appointmentId,
            mentorUid: currentUid,
            targetPage: 'student-dashboard.html',
            targetSection: 'mentor-sessions-section',
            targetQuery: { appointmentId },
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
            targetUserUid: appointment.studentUid,
            targetRole: 'student',
            senderUid: currentUid,
            senderRole: 'mentor',
            type: 'mentor_rating_required',
            title: 'Rate Your Mentor',
            message: 'Your mentoring session is complete. Share your experience.',
            messagePreview: completedNote || 'Your mentoring session is complete. Share your experience.',
            relatedEntityType: 'mentorAppointment',
            relatedEntityId: appointmentId,
            appointmentId,
            mentorUid: currentUid,
            targetPage: 'student-dashboard.html',
            targetSection: 'mentor-sessions-section',
            targetQuery: { appointmentId },
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
<<<<<<< HEAD
                    <div class="modal-row"><strong>Pathway Preference:</strong> <span><span style="text-transform: capitalize;">${escapeHtml(req.pathwayPreference || 'N/A')}</span></span></div>
                    ${req.enjoyedActivities ? `<div class="modal-row full-width"><strong>Enjoyed Activities:</strong> <div style="margin-top:0.25rem;">${escapeHtml(req.enjoyedActivities)}</div></div>` : ''}
                    ${req.talentsList ? `<div class="modal-row full-width"><strong>Talents:</strong> <div style="margin-top:0.25rem;">${escapeHtml(req.talentsList)}</div></div>` : ''}
=======
>>>>>>> origin/Sewmini
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
                targetUserUid: studentUid,
                targetRole: 'student',
                senderUid: currentUid,
                senderRole: 'mentor',
                type: 'mentorship_request_accepted',
                title: 'Your mentor request was accepted',
                message: `${mentorName} accepted your mentor request.`,
                messagePreview: `${mentorName} accepted your mentor request.`,
                relatedEntityType: 'mentorRequest',
                relatedEntityId: reqId,
                requestId: reqId,
                conversationId: conversation,
                mentorUid: currentUid,
                targetPage: 'student-dashboard.html',
                targetSection: 'mentor-requests-section',
                targetQuery: { requestId: reqId, conversationId: conversation },
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
                targetUserUid: studentUid,
                targetRole: 'student',
                senderUid: currentUid,
                senderRole: 'mentor',
                type: 'mentorship_request_rejected',
                title: 'Mentor request update',
                message: reason || `${mentorName} could not accept your mentor request at this time.`,
                messagePreview: reason || 'Your mentor request was rejected.',
                relatedEntityType: 'mentorRequest',
                relatedEntityId: reqId,
                requestId: reqId,
                mentorUid: currentUid,
                targetPage: 'student-dashboard.html',
                targetSection: 'mentor-requests-section',
                targetQuery: { requestId: reqId },
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
            targetUserUid: studentUid,
            targetRole: 'student',
            senderUid: currentUid,
            senderRole: 'mentor',
            type: 'new_message',
            title: 'New message from your mentor',
            message: `${senderName}: ${message.slice(0, 80)}`,
            messagePreview: message.slice(0, 140),
            conversationId: conversationIdValue,
            relatedEntityType: 'mentorConversation',
            relatedEntityId: conversationIdValue,
            mentorUid: currentUid,
            targetPage: 'student-dashboard.html',
            targetSection: 'mentor-messages-section',
            targetQuery: { conversationId: conversationIdValue },
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
