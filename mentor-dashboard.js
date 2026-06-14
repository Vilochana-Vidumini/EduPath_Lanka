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
        const days = document.getElementById('availableDays');
        const time = document.getElementById('availableTime');
        const mode = document.getElementById('mentoringMode');
        const status = document.getElementById('availabilityStatus');
        const maxStudents = document.getElementById('maxStudents');
        if (days) days.value = mentorData.availableDays || mentorData.availabilityDays || '';
        if (time) time.value = mentorData.availableTime || mentorData.availabilityTime || '';
        if (mode) mode.value = mentorData.mentoringMode || mentorData.mode || 'Online (Zoom/Meet)';
        if (status) status.value = mentorData.availabilityStatus || mentorData.currentStatus || 'available';
        if (maxStudents) maxStudents.value = mentorData.maxStudents || mentorData.maxActiveStudents || '';
        renderOverviewAvailability(mentorData);
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
            const maxStudentsValue = Number(document.getElementById('maxStudents')?.value || 0);
            await update(ref(database, `mentors/${currentUid}`), {
                availableDays: document.getElementById('availableDays')?.value.trim() || '',
                availableTime: document.getElementById('availableTime')?.value.trim() || '',
                mentoringMode: document.getElementById('mentoringMode')?.value || 'Online (Zoom/Meet)',
                availabilityStatus: document.getElementById('availabilityStatus')?.value || 'available',
                maxStudents: maxStudentsValue > 0 ? maxStudentsValue : '',
                availabilityUpdatedAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });
            renderOverviewAvailability({
                availableDays: document.getElementById('availableDays')?.value.trim() || '',
                availableTime: document.getElementById('availableTime')?.value.trim() || '',
                mentoringMode: document.getElementById('mentoringMode')?.value || 'Online (Zoom/Meet)',
                availabilityStatus: document.getElementById('availabilityStatus')?.value || 'available'
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
        if (!container) return;
        const days = mentorData.availableDays || mentorData.availabilityDays || 'Set days';
        const time = mentorData.availableTime || mentorData.availabilityTime || 'Set mentoring hours';
        const status = mentorData.availabilityStatus || mentorData.currentStatus || 'available';
        container.innerHTML = `
            <div class="overview-row">
                <span class="date-tile">${escapeHtml(String(days).slice(0, 3).toUpperCase())}</span>
                <div><strong>${escapeHtml(days)}</strong><span>${escapeHtml(time)}</span></div>
                <span class="status-pill ${status === 'unavailable' ? 'is-muted' : ''}">${escapeHtml(status === 'unavailable' ? 'Unavailable' : 'Available')}</span>
            </div>
        `;
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
