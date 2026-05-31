import { auth, database } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { ref, get, set, update, push, onValue, remove } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
import { showToast, preserveThemeOnClear } from "./auth-nav.js";
import { initDashboardSidebar, updateSidebarUser } from "./sidebar.js";
import { ensureDashboardTopbarLayout, initDashboardNotifications } from "./dashboard-topbar.js";

// --- Helpers ---
function countObjectChildren(data) {
    if (!data || typeof data !== 'object') return 0;
    return Object.keys(data).length;
}

function countByStatus(data, status) {
    if (!data || typeof data !== 'object') return 0;
    const target = String(status).toLowerCase();
    return Object.values(data).filter((item) => {
        const s = (item?.status || '').toString().toLowerCase();
        return s === target;
    }).length;
}

function countNestedPathwayResults(data) {
    if (!data || typeof data !== 'object') return 0;
    let count = 0;
    Object.values(data).forEach((userResults) => {
        if (userResults && typeof userResults === 'object' && !Array.isArray(userResults)) {
            count += Object.keys(userResults).length;
        }
    });
    return count;
}

function updateTile(elementId, value) {
    const el = document.getElementById(elementId);
    if (el) el.textContent = value ?? 0;
}

function displayVal(value) {
    if (value === null || value === undefined || value === '') return 'N/A';
    if (typeof value === 'object') return 'N/A';
    return String(value);
}

function formatDate(ts) {
    if (!ts) return 'N/A';
    const d = new Date(typeof ts === 'number' ? ts : Date.parse(ts));
    if (Number.isNaN(d.getTime())) return 'N/A';
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function statusBadgeClass(status) {
    const s = (status || 'pending').toString().toLowerCase();
    if (s === 'approved' || s === 'accepted') return 'badge-approved';
    if (s === 'rejected' || s === 'declined') return 'badge-rejected';
    if (s === 'completed') return 'badge-completed';
    if (s === 'pending') return 'badge-pending';
    return 'badge-info';
}

function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function flattenPathwayResults(data) {
    const rows = [];
    if (!data || typeof data !== 'object') return rows;
    Object.entries(data).forEach(([uid, userResults]) => {
        if (!userResults || typeof userResults !== 'object' || Array.isArray(userResults)) return;
        Object.entries(userResults).forEach(([resultId, result]) => {
            rows.push({ uid, resultId, ...(typeof result === 'object' ? result : {}) });
        });
    });
    return rows.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

document.addEventListener('DOMContentLoaded', () => {
    initDashboardSidebar();
    initSidebarNavigation();

    document.getElementById('complete-profile-card-btn')?.addEventListener('click', () => {
        window.location.href = 'profile.html';
    });

    let tasksCompleted = {
        phone: false,
        photo: false,
        reviewMentors: false,
        addCourse: false,
        addScholarship: false,
    };

    let studentsCache = null;
    let usersCache = null;
    let mentorsCache = null;
    let requestsCache = null;
    let requestFilter = 'all';
    let studentSearchTerm = '';
    let studentDistrictFilter = '';
    let studentInterestFilter = '';
    let mentorSearchTerm = '';

    onAuthStateChanged(auth, (user) => {
        if (!user) {
            window.location.href = 'login.html';
            return;
        }

        get(ref(database, 'users/' + user.uid)).then((snapshot) => {
            if (snapshot.exists()) {
                const userData = snapshot.val();
                const userType = (userData.userType || userData.role || '').toString().toLowerCase();
                if (userType !== 'admin') {
                    showToast('Access denied. Directing to correct dashboard...', 'error');
                    setTimeout(() => {
                        if (userType === 'student') window.location.href = 'student-dashboard.html';
                        else if (userType === 'mentor') window.location.href = 'mentor-dashboard.html';
                        else window.location.href = 'login.html';
                    }, 1500);
                    return;
                }
                initAdminDashboard(user.uid, userData);
                ensureDashboardTopbarLayout();
                initDashboardNotifications(user.uid);
            } else if (user.email && (user.email.includes('admin') || user.email === 'admin@edupath.lk')) {
                const defaultAdmin = {
                    uid: user.uid,
                    fullName: user.displayName || 'EduPath Admin',
                    email: user.email,
                    userType: 'admin',
                    createdAt: Date.now(),
                };
                set(ref(database, 'users/' + user.uid), defaultAdmin).then(() => {
                    initAdminDashboard(user.uid, defaultAdmin);
                    ensureDashboardTopbarLayout();
                    initDashboardNotifications(user.uid);
                }).catch(() => {
                    window.location.href = 'login.html';
                });
            } else {
                window.location.href = 'login.html';
            }
        }).catch(() => {
            showToast('Failed to verify admin status.', 'error');
        });
    });

    document.getElementById('logout-btn-sidebar')?.addEventListener('click', (e) => {
        e.preventDefault();
        signOut(auth).then(() => {
            preserveThemeOnClear();
            sessionStorage.clear();
            window.location.href = 'login.html';
        });
    });

    function initSidebarNavigation() {
        document.querySelectorAll('.sidebar-links a[data-section]').forEach((link) => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const sectionId = link.getAttribute('data-section');
                if (sectionId) showSection(sectionId);
            });
        });
    }

    function showSection(sectionId) {
        document.querySelectorAll('.dashboard-section').forEach((section) => {
            section.classList.remove('active');
        });
        const target = document.getElementById(sectionId);
        if (target) target.classList.add('active');

        document.querySelectorAll('.sidebar-links a[data-section]').forEach((link) => {
            link.classList.toggle('active', link.getAttribute('data-section') === sectionId);
        });

        const titles = {
            overview: 'Admin Dashboard',
            'manage-students': 'Manage Students',
            'manage-mentors': 'Manage Mentors',
            'mentor-approvals': 'Mentor Approvals',
            'manage-courses': 'Manage Courses',
            'manage-scholarships': 'Manage Scholarships',
            'mentor-requests': 'Mentor Requests',
            'pathway-results': 'Pathway Results',
            reports: 'Platform Reports',
            'contact-messages': 'Contact Messages',
        };
        const pageTitle = document.querySelector('.page-title');
        if (pageTitle && titles[sectionId]) pageTitle.textContent = titles[sectionId];

        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function refreshStudentCount() {
        const uids = new Set();
        if (studentsCache) Object.keys(studentsCache).forEach((id) => uids.add(id));
        if (usersCache) {
            Object.entries(usersCache).forEach(([id, u]) => {
                const type = (u.userType || u.role || '').toString().toLowerCase();
                if (type === 'student') uids.add(id);
            });
        }
        updateTile('stat-students', uids.size);
    }

    function mergeStudentRecords() {
        const merged = {};
        if (usersCache) {
            Object.entries(usersCache).forEach(([uid, u]) => {
                const type = (u.userType || u.role || '').toString().toLowerCase();
                if (type === 'student') {
                    merged[uid] = { uid, ...u };
                }
            });
        }
        if (studentsCache) {
            Object.entries(studentsCache).forEach(([uid, s]) => {
                merged[uid] = { uid, ...merged[uid], ...s };
            });
        }
        return merged;
    }

    function renderStudentsTable() {
        const tbody = document.getElementById('admin-students-tbody');
        if (!tbody) return;

        const merged = mergeStudentRecords();
        let rows = Object.entries(merged).map(([uid, s]) => ({ uid, ...s }));

        if (studentSearchTerm) {
            const q = studentSearchTerm.toLowerCase();
            rows = rows.filter((s) =>
                (s.fullName || '').toLowerCase().includes(q) ||
                (s.email || '').toLowerCase().includes(q)
            );
        }
        if (studentDistrictFilter) {
            rows = rows.filter((s) => (s.district || '') === studentDistrictFilter);
        }
        if (studentInterestFilter) {
            rows = rows.filter((s) => (s.interestArea || s.interest || '') === studentInterestFilter);
        }

        tbody.innerHTML = '';
        if (rows.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center py-4 text-muted">No students registered yet.</td></tr>';
            return;
        }

        rows.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

        rows.forEach((s) => {
            const initials = (s.fullName || 'ST').split(' ').map((n) => n[0]).join('').substring(0, 2).toUpperCase();
            const avatar = s.photoURL
                ? `<img src="${escapeHtml(s.photoURL)}" alt="">`
                : `<span class="avatar-mini">${initials}</span>`;
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><div class="student-avatar-cell">${avatar}<strong>${escapeHtml(s.fullName)}</strong></div></td>
                <td>${escapeHtml(displayVal(s.email))}</td>
                <td>${escapeHtml(displayVal(s.phone))}</td>
                <td>${escapeHtml(displayVal(s.district))}</td>
                <td>${escapeHtml(displayVal(s.educationLevel || s.education))}</td>
                <td>${escapeHtml(displayVal(s.interestArea || s.interest))}</td>
                <td>${displayVal(s.profileCompletion)}${typeof s.profileCompletion === 'number' ? '%' : ''}</td>
                <td>${formatDate(s.createdAt)}</td>
            `;
            tbody.appendChild(tr);
        });

        updateStudentFilterOptions(rows);
    }

    function updateStudentFilterOptions(rows) {
        const districtSel = document.getElementById('student-filter-district');
        const interestSel = document.getElementById('student-filter-interest');
        if (!districtSel || !interestSel) return;

        const districts = [...new Set(rows.map((s) => s.district).filter(Boolean))].sort();
        const interests = [...new Set(rows.map((s) => s.interestArea || s.interest).filter(Boolean))].sort();

        const dVal = districtSel.value;
        const iVal = interestSel.value;
        districtSel.innerHTML = '<option value="">All Districts</option>' +
            districts.map((d) => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join('');
        interestSel.innerHTML = '<option value="">All Interest Areas</option>' +
            interests.map((i) => `<option value="${escapeHtml(i)}">${escapeHtml(i)}</option>`).join('');
        districtSel.value = dVal;
        interestSel.value = iVal;
    }

    function initAdminDashboard(uid, userData) {
        const topUserName = document.getElementById('top-user-name') || document.querySelector('.ep-avatar-name');
        if (topUserName) topUserName.textContent = userData.fullName || 'Admin';

        updateSidebarUser({
            fullName: userData.fullName || 'Admin',
            role: 'admin',
            photoURL: userData.photoURL || '',
        });

        const welcomeName = document.getElementById('welcome-name');
        if (welcomeName) welcomeName.textContent = `Admin Panel - ${userData.fullName || 'Admin'}`;

        listenForStats();
        listenForStudents();
        listenForMentors();
        listenForCourses();
        listenForScholarships();
        listenForPathwayResults();
        listenForMentorRequests();
        listenForContactMessages();

        setupCourseForm();
        setupScholForm();
        setupStudentFilters();
        setupMentorSearch();
        setupRequestFilters();
        trackAdminProfileStrength(uid, userData);

        applyHashSection();
        if (!(window.location.hash || '').replace('#', '')) {
            showSection('overview');
        }
    }

    function applyHashSection() {
        const hash = (window.location.hash || '').replace('#', '');
        const map = {
            students: 'manage-students',
            mentors: 'manage-mentors',
            'mentor-approvals': 'mentor-approvals',
            courses: 'manage-courses',
            scholarships: 'manage-scholarships',
            requests: 'mentor-requests',
            pathway: 'pathway-results',
            messages: 'contact-messages',
            reports: 'reports',
        };
        if (map[hash]) showSection(map[hash]);
    }

    window.addEventListener('hashchange', applyHashSection);

    function setupStudentFilters() {
        document.getElementById('student-search')?.addEventListener('input', (e) => {
            studentSearchTerm = e.target.value.trim();
            renderStudentsTable();
        });
        document.getElementById('student-filter-district')?.addEventListener('change', (e) => {
            studentDistrictFilter = e.target.value;
            renderStudentsTable();
        });
        document.getElementById('student-filter-interest')?.addEventListener('change', (e) => {
            studentInterestFilter = e.target.value;
            renderStudentsTable();
        });
    }

    function setupMentorSearch() {
        document.getElementById('mentor-search')?.addEventListener('input', (e) => {
            mentorSearchTerm = e.target.value.trim().toLowerCase();
            renderMentorsTables();
        });
    }

    function setupRequestFilters() {
        document.querySelectorAll('#request-filter-tabs .btn-filter').forEach((btn) => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('#request-filter-tabs .btn-filter').forEach((b) => b.classList.remove('active'));
                btn.classList.add('active');
                requestFilter = btn.getAttribute('data-filter') || 'all';
                renderMentorRequestsTable();
            });
        });
    }

    function listenForStats() {
        onValue(ref(database, 'students'), (snapshot) => {
            studentsCache = snapshot.exists() ? snapshot.val() : null;
            refreshStudentCount();
            renderStudentsTable();
        });

        onValue(ref(database, 'users'), (snapshot) => {
            usersCache = snapshot.exists() ? snapshot.val() : null;
            refreshStudentCount();
            renderStudentsTable();
            renderMentorsTables();
            renderPathwayTable();
        });

        onValue(ref(database, 'mentors'), (snapshot) => {
            mentorsCache = snapshot.exists() ? snapshot.val() : null;
            const data = mentorsCache;
            const total = countObjectChildren(data);
            const pending = countByStatus(data, 'pending');
            updateTile('stat-mentors', total);
            updateTile('stat-pending-mentors', pending);
            tasksCompleted.reviewMentors = pending === 0;
            updateChecklistUI();
            renderMentorsTables();
        });

        onValue(ref(database, 'courses'), (snapshot) => {
            const count = snapshot.exists() ? countObjectChildren(snapshot.val()) : 0;
            updateTile('stat-courses', count);
            tasksCompleted.addCourse = count > 0;
            updateChecklistUI();
        });

        onValue(ref(database, 'scholarships'), (snapshot) => {
            const count = snapshot.exists() ? countObjectChildren(snapshot.val()) : 0;
            updateTile('stat-scholarships', count);
            tasksCompleted.addScholarship = count > 0;
            updateChecklistUI();
        });

        onValue(ref(database, 'pathwayResults'), (snapshot) => {
            const count = snapshot.exists() ? countNestedPathwayResults(snapshot.val()) : 0;
            updateTile('stat-results', count);
            renderPathwayRows(snapshot.exists() ? snapshot.val() : null);
        });

        onValue(ref(database, 'mentorRequests'), (snapshot) => {
            requestsCache = snapshot.exists() ? snapshot.val() : null;
            updateTile('stat-requests', countObjectChildren(requestsCache));
            const pending = countByStatus(requestsCache, 'pending');
            renderMentorRequestsTable();
        });

        onValue(ref(database, 'contactMessages'), (snapshot) => {
            updateTile('stat-messages', snapshot.exists() ? countObjectChildren(snapshot.val()) : 0);
            renderContactMessages(snapshot.val());
        });
    }

    function listenForStudents() {
        onValue(ref(database, 'students'), (snapshot) => {
            studentsCache = snapshot.exists() ? snapshot.val() : null;
            renderStudentsTable();
        });
        onValue(ref(database, 'users'), () => {
            renderStudentsTable();
        });
    }

    function getUserName(uid) {
        if (usersCache && usersCache[uid]) {
            return usersCache[uid].fullName || usersCache[uid].email || 'Unknown';
        }
        return 'Unknown';
    }

    function renderMentorsTables() {
        const tbody = document.getElementById('admin-mentors-tbody');
        const approvalsTbody = document.getElementById('admin-approvals-tbody');
        if (!tbody && !approvalsTbody) return;

        if (!mentorsCache) {
            if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-muted">No mentors found.</td></tr>';
            if (approvalsTbody) approvalsTbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-muted">No pending mentor approvals.</td></tr>';
            return;
        }

        let entries = Object.entries(mentorsCache).map(([id, m]) => ({
            id,
            ...m,
            fullName: m.fullName || getUserName(id),
            email: m.email || (usersCache?.[id]?.email) || 'N/A',
        }));

        if (mentorSearchTerm) {
            entries = entries.filter((m) =>
                (m.fullName || '').toLowerCase().includes(mentorSearchTerm) ||
                (m.email || '').toLowerCase().includes(mentorSearchTerm) ||
                (m.field || m.mentoringField || '').toLowerCase().includes(mentorSearchTerm)
            );
        }

        if (tbody) {
            tbody.innerHTML = '';
            if (entries.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-muted">No mentors found.</td></tr>';
            } else {
                entries.forEach((m) => {
                    tbody.appendChild(buildMentorRow(m, true));
                });
                attachMentorActionListeners();
            }
        }

        if (approvalsTbody) {
            const pending = entries.filter((m) => (m.status || 'pending').toLowerCase() === 'pending');
            approvalsTbody.innerHTML = '';
            if (pending.length === 0) {
                approvalsTbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-muted">No pending mentor approvals.</td></tr>';
            } else {
                pending.forEach((m) => {
                    approvalsTbody.appendChild(buildMentorRow(m, false));
                });
                attachMentorActionListeners();
            }
        }
    }

    function buildMentorRow(m, showOrg) {
        const tr = document.createElement('tr');
        const status = (m.status || 'pending').toLowerCase();
        const badge = statusBadgeClass(status);
        const isPending = status === 'pending';
        tr.innerHTML = `
            <td><strong>${escapeHtml(m.fullName)}</strong></td>
            <td>${escapeHtml(displayVal(m.email))}</td>
            ${showOrg ? `<td>${escapeHtml(displayVal(m.field || m.mentoringField))}</td><td>${escapeHtml(displayVal(m.universityOrCompany || m.organization))}</td>` : `<td>${escapeHtml(displayVal(m.field || m.mentoringField))}</td>`}
            <td><span class="badge ${badge}">${status.toUpperCase()}</span></td>
            <td class="action-btns">
                ${isPending ? `
                    <button class="btn btn-success btn-sm acc-mentor-btn" data-id="${m.id}">Approve</button>
                    <button class="btn btn-danger btn-sm rej-mentor-btn" data-id="${m.id}">Reject</button>
                ` : ''}
            </td>
        `;
        return tr;
    }

    function listenForMentors() {
        onValue(ref(database, 'mentors'), (snapshot) => {
            mentorsCache = snapshot.exists() ? snapshot.val() : null;
            renderMentorsTables();
        });
    }

    function attachMentorActionListeners() {
        document.querySelectorAll('.acc-mentor-btn').forEach((btn) => {
            const id = btn.getAttribute('data-id');
            const clone = btn.cloneNode(true);
            btn.replaceWith(clone);
            clone.addEventListener('click', () => {
                Promise.all([
                    update(ref(database, `mentors/${id}`), { status: 'approved', updatedAt: Date.now() }),
                    update(ref(database, `users/${id}`), { mentorStatus: 'approved', updatedAt: Date.now() }),
                ])
                    .then(() => showToast('Mentor approved successfully!', 'success'))
                    .catch(() => showToast('Approval failed.', 'error'));
            });
        });

        document.querySelectorAll('.rej-mentor-btn').forEach((btn) => {
            const id = btn.getAttribute('data-id');
            const clone = btn.cloneNode(true);
            btn.replaceWith(clone);
            clone.addEventListener('click', () => {
                if (!confirm('Reject this mentor application?')) return;
                Promise.all([
                    update(ref(database, `mentors/${id}`), { status: 'rejected', updatedAt: Date.now() }),
                    update(ref(database, `users/${id}`), { mentorStatus: 'rejected', updatedAt: Date.now() }),
                ])
                    .then(() => showToast('Mentor application rejected.', 'warning'))
                    .catch(() => showToast('Failed to reject.', 'error'));
            });
        });
    }

    function renderPathwayRows(data) {
        const tbody = document.getElementById('admin-pathway-tbody');
        if (!tbody) return;

        const rows = flattenPathwayResults(data);
        tbody.innerHTML = '';

        if (rows.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-muted">No pathway results yet.</td></tr>';
            return;
        }

        rows.forEach((r) => {
            const name = r.studentName || r.fullName || getUserName(r.uid);
            const email = r.email || usersCache?.[r.uid]?.email || 'N/A';
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${escapeHtml(displayVal(name))}</strong></td>
                <td>${escapeHtml(displayVal(email))}</td>
                <td>${escapeHtml(displayVal(r.educationLevel || r.education))}</td>
                <td>${escapeHtml(displayVal(r.interestArea || r.interest))}</td>
                <td>${escapeHtml(displayVal(r.futureGoal || r.goal))}</td>
                <td>${escapeHtml(displayVal(r.pathwayScore || r.score))}</td>
                <td>${formatDate(r.createdAt)}</td>
            `;
            tbody.appendChild(tr);
        });
    }

    function listenForPathwayResults() {
        onValue(ref(database, 'pathwayResults'), (snapshot) => {
            renderPathwayRows(snapshot.exists() ? snapshot.val() : null);
        });
    }

    function renderMentorRequestsTable() {
        const tbody = document.getElementById('admin-requests-tbody');
        if (!tbody) return;
        tbody.innerHTML = '';

        if (!requestsCache) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-muted">No student mentor requests found.</td></tr>';
            return;
        }

        let entries = Object.entries(requestsCache).map(([id, r]) => ({ id, ...r }));

        if (requestFilter !== 'all') {
            entries = entries.filter((r) => (r.status || 'pending').toLowerCase() === requestFilter);
        }

        if (entries.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-muted">No requests match this filter.</td></tr>';
            return;
        }

        entries.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

        entries.forEach((r) => {
            const status = (r.status || 'pending').toLowerCase();
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${escapeHtml(displayVal(r.studentName))}</strong><div class="text-sm text-muted">${escapeHtml(displayVal(r.studentEmail))}</div></td>
                <td><strong>${escapeHtml(displayVal(r.mentorName))}</strong><div class="text-sm text-muted">${escapeHtml(displayVal(r.mentorField))}</div></td>
                <td><p class="text-sm" style="max-width:280px;margin:0;white-space:normal;">${escapeHtml(displayVal(r.message))}</p></td>
                <td><span class="badge ${statusBadgeClass(status)}">${status.toUpperCase()}</span></td>
                <td>
                    <button class="btn btn-danger btn-sm delete-request-btn" data-id="${r.id}"><i class="fas fa-trash"></i> Delete</button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        tbody.querySelectorAll('.delete-request-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-id');
                if (confirm('Delete this mentor request?')) {
                    remove(ref(database, `mentorRequests/${id}`))
                        .then(() => showToast('Request deleted.', 'success'))
                        .catch(() => showToast('Failed to delete request.', 'error'));
                }
            });
        });
    }

    function listenForMentorRequests() {
        onValue(ref(database, 'mentorRequests'), (snapshot) => {
            requestsCache = snapshot.exists() ? snapshot.val() : null;
            renderMentorRequestsTable();
        });
    }

    function renderContactMessages(messages) {
        const tbody = document.getElementById('admin-messages-tbody');
        if (!tbody) return;
        tbody.innerHTML = '';

        if (!messages) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-muted">No contact messages received yet.</td></tr>';
            return;
        }

        Object.entries(messages).forEach(([key, m]) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${escapeHtml(displayVal(m.name || m.fullName))}</strong></td>
                <td>${escapeHtml(displayVal(m.email))}</td>
                <td><strong>${escapeHtml(displayVal(m.subject || m.title))}</strong></td>
                <td><p class="text-sm" style="max-width:300px;margin:0;white-space:normal;">${escapeHtml(displayVal(m.message))}</p></td>
                <td>
                    <button class="btn btn-primary btn-sm mark-read-btn" data-id="${key}">Mark Read</button>
                    <button class="btn btn-danger btn-sm delete-message-btn" data-id="${key}"><i class="fas fa-trash"></i></button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        tbody.querySelectorAll('.mark-read-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-id');
                update(ref(database, `contactMessages/${id}`), { status: 'read', readAt: Date.now() })
                    .then(() => showToast('Marked as read.', 'success'))
                    .catch(() => showToast('Update failed.', 'error'));
            });
        });

        tbody.querySelectorAll('.delete-message-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-id');
                if (confirm('Delete this message?')) {
                    remove(ref(database, `contactMessages/${id}`))
                        .then(() => showToast('Message deleted.', 'success'))
                        .catch(() => showToast('Failed to delete.', 'error'));
                }
            });
        });
    }

    function listenForContactMessages() {
        onValue(ref(database, 'contactMessages'), (snapshot) => {
            renderContactMessages(snapshot.exists() ? snapshot.val() : null);
        });
    }

    function setupCourseForm() {
        const form = document.getElementById('add-course-form');
        if (!form) return;
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const btn = document.getElementById('add-course-btn');
            const originalText = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Adding...';
            btn.disabled = true;

            const courseData = {
                name: document.getElementById('course-name').value,
                institute: document.getElementById('course-institute').value,
                category: document.getElementById('course-category').value,
                duration: document.getElementById('course-duration').value,
                mode: document.getElementById('course-mode').value,
                feeType: document.getElementById('course-fee').value,
                createdAt: Date.now(),
            };

            push(ref(database, 'courses'), courseData)
                .then(() => {
                    form.reset();
                    showToast('Course added successfully!', 'success');
                })
                .catch(() => showToast('Error adding course.', 'error'))
                .finally(() => {
                    btn.innerHTML = originalText;
                    btn.disabled = false;
                });
        });
    }

    function listenForCourses() {
        onValue(ref(database, 'courses'), (snapshot) => {
            const tbody = document.getElementById('admin-courses-tbody');
            if (!tbody) return;
            tbody.innerHTML = '';

            if (!snapshot.exists()) {
                tbody.innerHTML = '<tr><td colspan="3" class="text-center py-4 text-muted">No courses added yet.</td></tr>';
                return;
            }

            Object.entries(snapshot.val()).forEach(([key, c]) => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><strong>${escapeHtml(c.name)}</strong><br><span class="text-muted text-sm">${escapeHtml(displayVal(c.institute))}</span></td>
                    <td>${escapeHtml(displayVal(c.category))}</td>
                    <td><span class="badge ${c.feeType === 'Free' ? 'badge-success' : 'badge-warning'}">${escapeHtml(displayVal(c.feeType))}</span></td>
                `;
                tbody.appendChild(tr);
            });
        });
    }

    function setupScholForm() {
        const form = document.getElementById('add-schol-form');
        if (!form) return;
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const btn = document.getElementById('add-schol-btn');
            const originalText = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Adding...';
            btn.disabled = true;

            const scholData = {
                name: document.getElementById('schol-name').value,
                provider: document.getElementById('schol-provider').value,
                category: document.getElementById('schol-category').value,
                createdAt: Date.now(),
            };

            push(ref(database, 'scholarships'), scholData)
                .then(() => {
                    form.reset();
                    showToast('Scholarship added successfully!', 'success');
                })
                .catch(() => showToast('Error adding scholarship.', 'error'))
                .finally(() => {
                    btn.innerHTML = originalText;
                    btn.disabled = false;
                });
        });
    }

    function listenForScholarships() {
        onValue(ref(database, 'scholarships'), (snapshot) => {
            const tbody = document.getElementById('admin-schol-tbody');
            if (!tbody) return;
            tbody.innerHTML = '';

            if (!snapshot.exists()) {
                tbody.innerHTML = '<tr><td colspan="3" class="text-center py-4 text-muted">No scholarships added yet.</td></tr>';
                return;
            }

            Object.entries(snapshot.val()).forEach(([key, s]) => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><strong>${escapeHtml(s.name)}</strong></td>
                    <td>${escapeHtml(displayVal(s.provider))}</td>
                    <td>${escapeHtml(displayVal(s.category))}</td>
                `;
                tbody.appendChild(tr);
            });
        });
    }

    function trackAdminProfileStrength(uid, userData) {
        onValue(ref(database, 'users/' + uid), (snapshot) => {
            if (!snapshot.exists()) return;
            const data = snapshot.val();
            const hasPhone = !!data.phone;
            const hasPhoto = !!data.photoURL;

            tasksCompleted.phone = hasPhone;
            tasksCompleted.photo = hasPhoto;
            updateChecklistUI();

            let completed = 0;
            if (data.fullName) completed++;
            if (data.email) completed++;
            if (hasPhone) completed++;
            if (hasPhoto) completed++;

            const percentage = Math.round((completed / 4) * 100);
            const progressBar = document.getElementById('dynamic-profile-progress-bar');
            const progressBadge = document.getElementById('profile-strength-badge');
            const progressMsg = document.getElementById('profile-strength-message');

            if (progressBar) progressBar.style.width = `${percentage}%`;
            if (progressBadge) progressBadge.textContent = `${percentage}% Strength`;
            if (progressMsg) {
                progressMsg.textContent = percentage < 100
                    ? 'Fill in contact phone and profile photo for a complete admin profile.'
                    : 'Your admin profile is complete.';
            }
        });
    }

    function updateChecklistUI() {
        const toggleTask = (id, condition, label) => {
            const el = document.getElementById(id);
            if (!el) return;
            const text = label || el.textContent.replace(/^[\s\S]*?\s/, '').trim();
            if (condition) {
                el.innerHTML = `<i class="fas fa-check-circle text-success" style="margin-right:8px;"></i> ${text}`;
                el.style.color = 'var(--success)';
            } else {
                el.innerHTML = `<i class="far fa-circle text-muted" style="margin-right:8px;"></i> ${text}`;
                el.style.color = 'var(--text-muted)';
            }
        };
        toggleTask('task-phone', tasksCompleted.phone, 'Add phone number');
        toggleTask('task-photo', tasksCompleted.photo, 'Add profile photo');
        toggleTask('task-review-mentors', tasksCompleted.reviewMentors, 'Review pending mentors');
        toggleTask('task-add-course', tasksCompleted.addCourse, 'Add first course');
        toggleTask('task-add-scholarship', tasksCompleted.addScholarship, 'Add first scholarship');
    }
});
