import { auth, database } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { ref, get, set, update, push, remove, onValue, onDisconnect, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
import { showToast, preserveThemeOnClear } from "./auth-nav.js?v=20260614-brand";
import { initDashboardSidebar, updateSidebarUser } from "./sidebar.js";
import { ensureDashboardTopbarLayout, initDashboardNotifications, updateDashboardGreetingName } from "./dashboard-topbar.js";

const adminState = {
    users: {},
    students: {},
    mentors: {},
    institutes: {},
    courses: {},
    scholarships: {},
    pathwayResults: {},
    mentorRequests: {},
    guestMessages: {},
    contactMessages: {},
    conversations: {},
    activityLogs: {},
    presence: {},
    loginHistory: {},
    notifications: {},
    savedCourses: {},
    savedScholarships: {},
    adminUid: "",
    adminUser: {},
    filters: {
        studentSearch: "",
        studentDistrict: "",
        studentInterest: "",
        studentEducation: "",
        studentProfile: "",
        studentOnline: "",
        studentStatus: "",
        mentorSearch: "",
        instituteSearch: "",
        requestStatus: "all",
        activityRole: "",
        activityType: "",
        activitySearch: "",
        supportTab: "guest"
    },
    editingCourseId: null,
    editingScholarshipId: null,
    selectedConversationId: null
};

const supportState = {
    activeFolder: "guest",
    selectedItemId: null,
    searchTerm: "",
    filter: "all",
    sort: "newest",
    pendingDelete: null
};

const sectionTitles = {
    overview: "Admin Dashboard",
    "manage-students": "Manage Students",
    "manage-mentors": "Manage Mentors",
    "manage-institutes": "Manage Institutes",
    "mentor-approvals": "Mentor Approvals",
    "manage-courses": "Manage Courses",
    "manage-scholarships": "Manage Scholarships",
    "mentor-requests": "Mentor Requests",
    "pathway-results": "Pathway Results",
    "support-inbox": "Support Inbox",
    "user-activity": "User Activity",
    reports: "Reports & Insights",
    "system-settings": "System Settings"
};

document.addEventListener("DOMContentLoaded", () => {
    initDashboardSidebar();
    bindNavigation();
    bindFormsAndFilters();

    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            window.location.href = "login.html";
            return;
        }

        const snap = await get(ref(database, `users/${user.uid}`));
        if (!snap.exists()) {
            showToast("Access denied. Admin role not found.", "error");
            window.location.href = "login.html";
            return;
        }

        const userData = snap.val();
        const role = normalize(userData.userType);
        const status = normalize(userData.accountStatus || "active");

        if (status === "suspended" || status === "disabled") {
            showToast("Your admin account is not active.", "error");
            await signOut(auth);
            window.location.href = "login.html";
            return;
        }

        if (role !== "admin") {
            showToast("Access denied. Directing to your dashboard...", "error");
            window.location.href = role === "student" ? "student-dashboard.html" : role === "mentor" ? "mentor-dashboard.html" : role === "institute" ? "institute-dashboard.html" : "login.html";
            return;
        }

        adminState.adminUid = user.uid;
        adminState.adminUser = { ...userData, userType: "admin", accountStatus: status || "active" };
        await update(ref(database, `users/${user.uid}`), {
            userType: "admin",
            accountStatus: status || "active",
            updatedAt: serverTimestamp()
        });
        ensureDashboardTopbarLayout();
        initDashboardNotifications(user.uid);
        renderAdminIdentity();
        setupPresence(user.uid);
        await trackLoginSession(user.uid, userData);
        initRealtimeListeners();
        showAdminSection(getHashSection());
    });
});

function bindNavigation() {
    document.querySelectorAll(".sidebar-links a[data-section]").forEach((link) => {
        link.addEventListener("click", (event) => {
            event.preventDefault();
            showAdminSection(link.dataset.section);
        });
    });

    window.addEventListener("hashchange", () => showAdminSection(getHashSection(), false));

    document.getElementById("logout-btn-sidebar")?.addEventListener("click", async (event) => {
        event.preventDefault();
        await updateLogoutState();
        await signOut(auth);
        preserveThemeOnClear();
        sessionStorage.clear();
        window.location.href = "login.html";
    });

    document.getElementById("complete-profile-card-btn")?.addEventListener("click", () => {
        window.location.href = "profile.html";
    });

    document.querySelectorAll("[data-kpi-section]").forEach((button) => {
        button.addEventListener("click", () => {
            if (button.dataset.kpiSupportFolder) {
                supportState.activeFolder = button.dataset.kpiSupportFolder;
                supportState.selectedItemId = null;
                closeSupportDetail();
            }
            showAdminSection(button.dataset.kpiSection);
            if (button.dataset.kpiSection === "support-inbox") renderSupportInbox();
        });
    });
}

function bindFormsAndFilters() {
    const filterBindings = [
        ["student-search", "studentSearch", "input", renderStudents],
        ["student-filter-district", "studentDistrict", "change", renderStudents],
        ["student-filter-interest", "studentInterest", "change", renderStudents],
        ["student-filter-education", "studentEducation", "change", renderStudents],
        ["student-filter-profile", "studentProfile", "change", renderStudents],
        ["student-filter-online", "studentOnline", "change", renderStudents],
        ["student-filter-status", "studentStatus", "change", renderStudents],
        ["mentor-search", "mentorSearch", "input", renderMentors],
        ["institute-search", "instituteSearch", "input", renderInstitutes],
        ["activity-role-filter", "activityRole", "change", renderActivity],
        ["activity-type-filter", "activityType", "change", renderActivity],
        ["activity-search", "activitySearch", "input", renderActivity]
    ];

    filterBindings.forEach(([id, key, eventName, render]) => {
        document.getElementById(id)?.addEventListener(eventName, (event) => {
            adminState.filters[key] = event.target.value.trim();
            render();
        });
    });

    document.querySelectorAll("#request-filter-tabs .btn-filter").forEach((button) => {
        button.addEventListener("click", () => {
            setActiveButton("#request-filter-tabs .btn-filter", button);
            adminState.filters.requestStatus = button.dataset.filter || "all";
            renderMentorRequests();
        });
    });

    document.querySelectorAll("#support-tabs .btn-filter").forEach((button) => {
        button.addEventListener("click", () => {
            setActiveButton("#support-tabs .btn-filter", button);
            adminState.filters.supportTab = button.dataset.tab || "conversations";
            renderSupportInbox();
        });
    });

    document.getElementById("course-form")?.addEventListener("submit", saveCourse);
    document.getElementById("show-course-form")?.addEventListener("click", openCourseFormForAdd);
    document.getElementById("course-cancel-edit")?.addEventListener("click", closeCourseForm);
    document.getElementById("scholarship-form")?.addEventListener("submit", saveScholarship);
    document.getElementById("show-scholarship-form")?.addEventListener("click", openScholarshipFormForAdd);
    document.getElementById("scholarship-cancel-edit")?.addEventListener("click", closeScholarshipForm);
    document.getElementById("compose-message-form")?.addEventListener("submit", sendAdminMessage);
    bindSupportInboxControls();
}

function bindSupportInboxControls() {
    document.querySelectorAll("[data-support-folder]").forEach((button) => {
        button.addEventListener("click", () => {
            supportState.activeFolder = button.dataset.supportFolder || "guest";
            supportState.selectedItemId = null;
            closeSupportDetail();
            renderSupportInbox();
        });
    });
    document.getElementById("support-search")?.addEventListener("input", (event) => {
        supportState.searchTerm = event.target.value.trim();
        renderSupportInbox();
    });
    document.getElementById("support-filter")?.addEventListener("change", (event) => {
        supportState.filter = event.target.value || "all";
        renderSupportInbox();
    });
    document.getElementById("support-sort")?.addEventListener("change", (event) => {
        supportState.sort = event.target.value || "newest";
        renderSupportInbox();
    });
    document.getElementById("support-compose-open")?.addEventListener("click", () => openSupportCompose());
    document.getElementById("support-compose-close")?.addEventListener("click", closeSupportCompose);
    document.getElementById("support-back-list")?.addEventListener("click", () => {
        closeSupportDetail();
    });
    document.getElementById("support-confirm-cancel")?.addEventListener("click", closeSupportConfirm);
    document.getElementById("support-confirm-delete")?.addEventListener("click", permanentlyDeleteSupportItem);
}

function initRealtimeListeners() {
    const listeners = [
        ["users", "users", () => { renderAdminIdentity(); renderOverview(); renderStudents(); renderMentors(); renderInstitutes(); renderUserDirectory(); renderPathwayResults(); renderReports(); renderActivity(); }],
        ["students", "students", () => { renderOverview(); renderStudents(); renderPathwayResults(); renderReports(); }],
        ["mentors", "mentors", () => { renderOverview(); renderMentors(); renderMentorApprovals(); renderReports(); updateSidebarBadges(); }],
        ["institutes", "institutes", () => { renderOverview(); renderInstitutes(); renderReports(); }],
        ["courses", "courses", () => { renderOverview(); renderCourses(); renderReports(); }],
        ["scholarships", "scholarships", () => { renderOverview(); renderScholarships(); renderReports(); }],
        ["pathwayResults", "pathwayResults", () => { renderOverview(); renderStudents(); renderPathwayResults(); renderReports(); }],
        ["mentorRequests", "mentorRequests", () => { renderOverview(); renderStudents(); renderMentorRequests(); renderReports(); updateSidebarBadges(); }],
        ["guestMessages", "guestMessages", () => { renderOverview(); renderSupportInbox(); updateSupportCounts(); updateSidebarBadges(); }],
        ["contactMessages", "contactMessages", () => { renderOverview(); renderSupportInbox(); updateSidebarBadges(); }],
        ["conversations", "conversations", () => { renderOverview(); renderSupportInbox(); renderUserDirectory(); updateSidebarBadges(); }],
        ["activityLogs", "activityLogs", () => { renderOverview(); renderActivity(); }],
        ["presence", "presence", () => { renderOverview(); renderStudents(); renderMentors(); renderActivity(); }],
        ["loginHistory", "loginHistory", () => { renderActivity(); renderReports(); }],
        ["notifications", "notifications", () => { updateSidebarBadges(); }],
        ["savedCourses", "savedCourses", () => { renderStudents(); renderOverview(); }],
        ["savedScholarships", "savedScholarships", () => { renderStudents(); renderOverview(); }]
    ];

    listeners.forEach(([path, key, render]) => {
        onValue(ref(database, path), (snapshot) => {
            adminState[key] = snapshot.val() || {};
            render();
            setLastSynced();
        }, (error) => {
            console.error(error);
            showErrorForPath(path, `Unable to load ${path}.`);
        });
    });
}

function renderAdminIdentity() {
    const admin = adminState.users[adminState.adminUid] || adminState.adminUser || {};
    const fullName = admin.fullName || "EduPath Admin";
    setText("top-user-name", fullName.split(" ")[0] || "Admin");
    setText("sidebar-user-name", fullName);
    setText("welcome-name", `Admin Panel - ${fullName}`);
    updateSidebarUser({ fullName, role: "admin", photoURL: admin.photoURL || "" });
    updateDashboardGreetingName(fullName);
    renderProfileStrength(admin);
}

function renderProfileStrength(admin = {}) {
    const fields = [
        ["Full Name", admin.fullName],
        ["Email", admin.email],
        ["Phone", admin.phone],
        ["Profile Photo", admin.photoURL]
    ];
    const completed = fields.filter(([, value]) => hasValue(value));
    const percent = Math.round((completed.length / fields.length) * 100);

    setText("profile-strength-badge", `${percent}%`);
    const bar = document.getElementById("dynamic-profile-progress-bar");
    if (bar) bar.style.width = `${percent}%`;
}

function renderOverview() {
    const stats = calculateStats();
    Object.entries(stats).forEach(([id, value]) => animateTile(id, value));
    renderProfileStrength(adminState.users[adminState.adminUid] || adminState.adminUser);
    renderPendingActions();
    renderQuickActions();
    renderRecentActivity();
    updateSidebarBadges();
}

function calculateStats() {
    const users = Object.entries(adminState.users).filter(([uid, user]) => !isAntigravityStudent(uid, user)).map(([, user]) => user);
    const courses = Object.values(adminState.courses).filter((c) => normalize(c.status) !== "deleted" && normalize(c.status) !== "archived");
    const scholarships = Object.values(adminState.scholarships).filter((s) => normalize(s.status) !== "deleted" && normalize(s.status) !== "archived");
    const students = users.filter((u) => normalize(u.userType) === "student").length;
    const mentors = users.filter((u) => normalize(u.userType) === "mentor").length;
    const institutes = users.filter((u) => normalize(u.userType) === "institute").length;
    const admins = users.filter((u) => normalize(u.userType) === "admin").length;
    const pendingMentors = countWhere(adminState.mentors, (m) => normalize(m.status || "pending") === "pending");
    const approvedMentors = countWhere(adminState.mentors, (m) => normalize(m.status) === "approved");
    const onlineUsers = countWhere(adminState.presence, (p) => normalize(p.state) === "online");
    const activeCourses = courses.filter((c) => normalize(c.status) === "active").length;
    const activeScholarships = scholarships.filter((s) => normalize(s.status) === "active").length;
    const pathwayResults = flattenPathwayResults().length;
    const mentorRequests = Object.keys(adminState.mentorRequests).length;
    const pendingMentorRequests = countWhere(adminState.mentorRequests, (r) => normalize(r.status || "pending") === "pending");
    const unreadSupport = getUnreadSupportCount();
    const guestInquiries = Object.keys({ ...adminState.contactMessages, ...adminState.guestMessages }).length;
    return {
        "kpi-total-users-summary": students + mentors + institutes + admins,
        "kpi-active-content-summary": activeCourses + activeScholarships,
        "kpi-pending-actions-summary": pendingMentors + pendingMentorRequests,
        "kpi-support-summary": unreadSupport + guestInquiries,
        "kpi-students": students,
        "kpi-mentors": mentors,
        "kpi-institutes": institutes,
        "kpi-admins": admins,
        "kpi-online-users": onlineUsers,
        "kpi-total-courses": courses.length,
        "kpi-active-courses": activeCourses,
        "kpi-total-scholarships": scholarships.length,
        "kpi-active-scholarships": activeScholarships,
        "kpi-pathway-results": pathwayResults,
        "kpi-mentor-requests": mentorRequests,
        "kpi-pending-mentor-requests": pendingMentorRequests,
        "kpi-pending-mentors": pendingMentors,
        "kpi-approved-mentors": approvedMentors,
        "kpi-unread-support": unreadSupport,
        "kpi-guest-inquiries": guestInquiries
    };
}

function renderStudents() {
    const tbody = document.getElementById("admin-students-tbody");
    if (!tbody) return;
    const rows = getStudentRows().filter(matchesStudentFilters);
    updateStudentFilterOptions(getStudentRows());
    if (!rows.length) return showTableEmpty(tbody, 13, "No students match the current filters.");

    tbody.innerHTML = rows.map((s) => `
        <tr>
            <td>${avatarCell(s, "ST")}</td>
            <td>${escapeHtml(display(s.email))}</td>
            <td>${escapeHtml(display(s.phone))}</td>
            <td>${escapeHtml(display(s.district))}</td>
            <td>${escapeHtml(display(s.educationLevel))}</td>
            <td>${escapeHtml(display(s.interestArea))}</td>
            <td>${progressMini(s.profileCompletion)}</td>
            <td><span class="badge ${s.pathwayCompleted ? "badge-success" : "badge-warning"}">${s.pathwayCompleted ? "Completed" : "Not Started"}</span></td>
            <td>${onlineBadge(s.uid)}</td>
            <td>${formatDate(s.lastActiveAt || adminState.presence[s.uid]?.lastChanged)}</td>
            <td>${formatDate(s.createdAt)}</td>
            <td><span class="badge ${accountBadgeClass(s.accountStatus)}">${escapeHtml(normalize(s.accountStatus || "active"))}</span></td>
            <td class="action-btns">
                <button class="btn btn-sm btn-info" data-view-student="${s.uid}">View</button>
                <button class="btn btn-sm btn-primary" data-message-user="${s.uid}">Message</button>
                <button class="btn btn-sm ${normalize(s.accountStatus) === "suspended" ? "btn-success" : "btn-danger"}" data-toggle-account="${s.uid}">${normalize(s.accountStatus) === "suspended" ? "Reactivate" : "Suspend"}</button>
            </td>
        </tr>
    `).join("");
    bindRowActions(tbody);
}

function getStudentRows() {
    return Object.entries(adminState.users)
        .filter(([, user]) => normalize(user.userType) === "student")
        .filter(([uid, user]) => !isAntigravityStudent(uid, user))
        .map(([uid, user]) => {
            const student = adminState.students[uid] || {};
            const results = Object.keys(adminState.pathwayResults[uid] || {});
            return {
                uid,
                ...user,
                ...student,
                email: user.email || student.email,
                fullName: user.fullName || student.fullName,
                phone: user.phone || student.phone,
                photoURL: user.photoURL || student.photoURL,
                accountStatus: user.accountStatus || "active",
                pathwayHistoryCount: results.length,
                savedCoursesCount: Object.keys(adminState.savedCourses[uid] || {}).length,
                savedScholarshipsCount: Object.keys(adminState.savedScholarships[uid] || {}).length,
                mentorRequestsCount: Object.values(adminState.mentorRequests).filter((r) => r.studentUid === uid).length
            };
        })
        .sort((a, b) => getTime(b.createdAt) - getTime(a.createdAt));
}

function isAntigravityStudent(uid, user = {}) {
    const student = adminState.students[uid] || {};
    return normalize(`${user.fullName || ""} ${student.fullName || ""} ${user.email || ""}`).includes("antigravity student");
}

function matchesStudentFilters(s) {
    const f = adminState.filters;
    const q = normalize(f.studentSearch);
    if (q && !normalize(`${s.fullName} ${s.email} ${s.phone}`).includes(q)) return false;
    if (f.studentDistrict && s.district !== f.studentDistrict) return false;
    if (f.studentInterest && s.interestArea !== f.studentInterest) return false;
    if (f.studentEducation && s.educationLevel !== f.studentEducation) return false;
    if (f.studentOnline && (f.studentOnline === "online") !== isOnline(s.uid)) return false;
    if (f.studentStatus && normalize(s.accountStatus || "active") !== f.studentStatus) return false;
    if (f.studentProfile) {
        const pct = Number(s.profileCompletion || 0);
        if (f.studentProfile === "low" && pct >= 50) return false;
        if (f.studentProfile === "medium" && (pct < 50 || pct >= 80)) return false;
        if (f.studentProfile === "high" && pct < 80) return false;
    }
    return true;
}

function renderMentors() {
    const tbody = document.getElementById("admin-mentors-tbody");
    if (!tbody) return;
    let rows = getMentorRows();
    const q = normalize(adminState.filters.mentorSearch);
    if (q) rows = rows.filter((m) => normalize(`${m.fullName} ${m.email} ${m.field} ${m.universityOrCompany}`).includes(q));
    if (!rows.length) return showTableEmpty(tbody, 11, "No mentors found.");

    tbody.innerHTML = rows.map((m) => `
        <tr>
            <td>${avatarCell(m, "MT")}</td>
            <td>${escapeHtml(display(m.email))}</td>
            <td>${escapeHtml(display(m.mentorType))}</td>
            <td>${escapeHtml(display(m.field || m.mentoringField))}</td>
            <td>${escapeHtml(display(m.universityOrCompany || m.organization))}</td>
            <td><span class="badge ${statusBadgeClass(m.status || "pending")}">${escapeHtml(normalize(m.status || "pending"))}</span></td>
            <td>${escapeHtml(display(m.availability || m.availableTime || m.availabilityStatus))}</td>
            <td>${progressMini(m.profileCompletion)}</td>
            <td>${onlineBadge(m.uid)}</td>
            <td>${formatDate(m.lastActiveAt || adminState.presence[m.uid]?.lastChanged)}</td>
            <td class="action-btns">
                <button class="btn btn-sm btn-info" data-view-mentor="${m.uid}">View</button>
                <button class="btn btn-sm btn-success" data-approve-mentor="${m.uid}">Approve</button>
                <button class="btn btn-sm btn-danger" data-reject-mentor="${m.uid}">Reject</button>
                <button class="btn btn-sm btn-primary" data-message-user="${m.uid}">Message</button>
            </td>
        </tr>
    `).join("");
    bindRowActions(tbody);
}

function getMentorRows() {
    return Object.entries(adminState.users)
        .filter(([, user]) => normalize(user.userType) === "mentor")
        .map(([uid, user]) => ({ uid, ...user, ...(adminState.mentors[uid] || {}), email: user.email, fullName: user.fullName, photoURL: user.photoURL || adminState.mentors[uid]?.photoURL }))
        .sort((a, b) => getTime(b.createdAt) - getTime(a.createdAt));
}

function renderInstitutes() {
    const tbody = document.getElementById("admin-institutes-tbody");
    if (!tbody) return;
    let rows = getInstituteRows();
    const q = normalize(adminState.filters.instituteSearch);
    if (q) rows = rows.filter((i) => normalize(`${i.instituteName} ${i.fullName} ${i.email} ${i.phone} ${i.district}`).includes(q));
    if (!rows.length) return showTableEmpty(tbody, 10, "No institutes found.");

    tbody.innerHTML = rows.map((i) => `
        <tr>
            <td>${avatarCell({ ...i, fullName: i.instituteName || i.fullName }, "IN")}</td>
            <td><strong>${escapeHtml(display(i.instituteName || i.fullName))}</strong><br><span class="text-muted">${escapeHtml(display(i.websiteURL || i.facebookPage))}</span></td>
            <td>${escapeHtml(display(i.email))}</td>
            <td>${escapeHtml(display(i.phone))}</td>
            <td>${escapeHtml(display(i.district))}</td>
            <td><span class="badge ${accountBadgeClass(i.accountStatus || i.status || "active")}">${escapeHtml(normalize(i.accountStatus || i.status || "active"))}</span></td>
            <td>${progressMini(i.profileCompletion)}</td>
            <td>${Object.values(adminState.courses).filter((c) => c.instituteUid === i.uid).length}</td>
            <td>${formatDate(i.createdAt)}</td>
            <td class="action-btns">
                <button class="btn btn-sm btn-info" data-view-institute="${i.uid}">View</button>
                <button class="btn btn-sm btn-primary" data-message-user="${i.uid}">Message</button>
                <button class="btn btn-sm ${normalize(i.accountStatus) === "suspended" ? "btn-success" : "btn-danger"}" data-toggle-account="${i.uid}">${normalize(i.accountStatus) === "suspended" ? "Reactivate" : "Suspend"}</button>
            </td>
        </tr>
    `).join("");
    bindRowActions(tbody);
}

function getInstituteRows() {
    return Object.entries(adminState.users)
        .filter(([, user]) => normalize(user.userType) === "institute")
        .map(([uid, user]) => {
            const institute = adminState.institutes[uid] || {};
            return {
                uid,
                ...user,
                ...institute,
                fullName: user.fullName || institute.instituteName,
                instituteName: institute.instituteName || user.fullName,
                email: user.email || institute.email,
                phone: user.phone || institute.phone,
                photoURL: user.photoURL || institute.logoURL,
                accountStatus: user.accountStatus || institute.status || "active"
            };
        })
        .sort((a, b) => getTime(b.createdAt) - getTime(a.createdAt));
}

function renderMentorApprovals() {
    const tbody = document.getElementById("admin-approvals-tbody");
    if (!tbody) return;
    const rows = getMentorRows().filter((m) => normalize(m.status || "pending") === "pending");
    if (!rows.length) return showTableEmpty(tbody, 10, "No pending mentor approvals.");

    tbody.innerHTML = rows.map((m) => `
        <tr>
            <td>${avatarCell(m, "MT")}</td>
            <td>${escapeHtml(display(m.field || m.mentoringField))}</td>
            <td>${escapeHtml(display(m.highestQualification || m.qualification))}</td>
            <td>${escapeHtml(display(m.experience))}</td>
            <td>${escapeHtml(display(m.universityOrCompany || m.organization))}</td>
            <td>${escapeHtml(display(m.preferredLanguages || m.language))}</td>
            <td>${escapeHtml(display(m.guidanceAreas))}</td>
            <td>${escapeHtml(display(m.availableTime || m.availability))}</td>
            <td>${progressMini(m.profileCompletion)}</td>
            <td class="action-btns">
                <button class="btn btn-sm btn-info" data-view-mentor="${m.uid}">View Full Application</button>
                <button class="btn btn-sm btn-success" data-approve-mentor="${m.uid}">Approve</button>
                <button class="btn btn-sm btn-danger" data-reject-mentor="${m.uid}">Reject</button>
            </td>
        </tr>
    `).join("");
    bindRowActions(tbody);
}

function renderCourses() {
    const tbody = document.getElementById("admin-courses-tbody");
    if (!tbody) return;
    const rows = Object.entries(adminState.courses)
        .map(([id, c]) => ({ id, ...c }))
        .filter((c) => normalize(c.status) !== "deleted")
        .sort((a, b) => getTime(b.updatedAt || b.createdAt) - getTime(a.updatedAt || a.createdAt));
    if (!rows.length) return showTableEmpty(tbody, 7, "No courses added yet.");

    tbody.innerHTML = rows.map((c) => `
        <tr>
            <td><strong>${escapeHtml(display(c.courseName || c.name))}</strong></td>
            <td>${escapeHtml(display(c.instituteName || c.institute))}</td>
            <td>${escapeHtml(display(c.category))}</td>
            <td>${escapeHtml(display(c.mode))}</td>
            <td>${escapeHtml(display(c.feeType))}</td>
            <td><span class="badge ${statusBadgeClass(c.status)}">${escapeHtml(normalize(c.status || "draft"))}</span></td>
            <td class="action-btns">
                <button class="btn btn-sm btn-info" data-view-course="${c.id}">View</button>
                <button class="btn btn-sm btn-primary" data-edit-course="${c.id}">Edit</button>
                <button class="btn btn-sm btn-success" data-course-status="${c.id}" data-status="active">Activate</button>
                <button class="btn btn-sm btn-warning" data-course-status="${c.id}" data-status="inactive">Deactivate</button>
                <button class="btn btn-sm btn-danger" data-course-status="${c.id}" data-status="archived">Archive</button>
            </td>
        </tr>
    `).join("");
    bindRowActions(tbody);
}

async function saveCourse(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const id = adminState.editingCourseId;
    const payload = getCoursePayload();
    const path = id ? `courses/${id}` : "courses";
    try {
        if (id) {
            await update(ref(database, path), { ...payload, updatedAt: serverTimestamp() });
            await logActivity("course_updated", `Updated course ${payload.courseName}`, "course", id);
            showToast("Course updated.", "success");
        } else {
            const newRef = push(ref(database, path));
            await set(newRef, { ...payload, courseId: newRef.key, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), createdBy: adminState.adminUid });
            await logActivity("course_created", `Created course ${payload.courseName}`, "course", newRef.key);
            showToast("Course created.", "success");
        }
        form.reset();
        resetCourseForm();
        hideCourseForm();
    } catch (error) {
        console.error(error);
        showToast("Course save failed.", "error");
    }
}

function getCoursePayload() {
    return {
        courseName: value("course-name"),
        instituteName: value("course-institute"),
        instituteType: value("course-institute-type"),
        category: value("course-category"),
        description: value("course-description"),
        duration: value("course-duration"),
        mode: value("course-mode"),
        feeType: value("course-fee"),
        feeAmount: value("course-fee-amount"),
        district: value("course-district"),
        qualificationLevel: value("course-qualification"),
        eligibility: value("course-eligibility"),
        skillsCovered: value("course-skills"),
        careerOpportunities: value("course-careers"),
        applicationDeadline: value("course-deadline"),
        applyLink: value("course-apply-link"),
        contactEmail: value("course-contact-email"),
        contactPhone: value("course-contact-phone"),
        imageURL: value("course-image-url"),
        status: value("course-status") || "draft"
    };
}

function editCourse(id) {
    const c = adminState.courses[id];
    if (!c) return;
    adminState.editingCourseId = id;
    setValue("course-name", c.courseName || c.name);
    setValue("course-institute", c.instituteName || c.institute);
    setValue("course-institute-type", c.instituteType);
    setValue("course-category", c.category);
    setValue("course-description", c.description);
    setValue("course-duration", c.duration);
    setValue("course-mode", c.mode);
    setValue("course-fee", c.feeType);
    setValue("course-fee-amount", c.feeAmount);
    setValue("course-district", c.district);
    setValue("course-qualification", c.qualificationLevel);
    setValue("course-eligibility", c.eligibility);
    setValue("course-skills", c.skillsCovered);
    setValue("course-careers", c.careerOpportunities);
    setValue("course-deadline", c.applicationDeadline);
    setValue("course-apply-link", c.applyLink);
    setValue("course-contact-email", c.contactEmail);
    setValue("course-contact-phone", c.contactPhone);
    setValue("course-image-url", c.imageURL);
    setValue("course-status", c.status || "draft");
    setText("course-form-title", "Edit Course");
    setText("course-submit-label", "Save Changes");
    document.getElementById("course-cancel-edit")?.classList.remove("hidden");
    showAdminSection("manage-courses");
    showCourseForm();
}

function resetCourseForm() {
    adminState.editingCourseId = null;
    document.getElementById("course-form")?.reset();
    setText("course-form-title", "Add Course");
    setText("course-submit-label", "Add Course");
    document.getElementById("course-cancel-edit")?.classList.add("hidden");
}

function openCourseFormForAdd() {
    resetCourseForm();
    showCourseForm();
}

function closeCourseForm() {
    resetCourseForm();
    hideCourseForm();
}

function showCourseForm() {
    const card = document.getElementById("course-form-card");
    if (!card) return;
    card.classList.remove("hidden");
    card.scrollIntoView({ behavior: "smooth", block: "start" });
    setTimeout(() => document.getElementById("course-name")?.focus(), 250);
}

function hideCourseForm() {
    document.getElementById("course-form-card")?.classList.add("hidden");
}

function renderScholarships() {
    const tbody = document.getElementById("admin-schol-tbody");
    if (!tbody) return;
    const rows = Object.entries(adminState.scholarships)
        .map(([id, s]) => ({ id, ...s }))
        .filter((s) => normalize(s.status) !== "deleted")
        .sort((a, b) => getTime(b.updatedAt || b.createdAt) - getTime(a.updatedAt || a.createdAt));
    if (!rows.length) return showTableEmpty(tbody, 6, "No scholarships added yet.");

    tbody.innerHTML = rows.map((s) => `
        <tr>
            <td><strong>${escapeHtml(display(s.scholarshipName || s.name))}</strong></td>
            <td>${escapeHtml(display(s.provider))}</td>
            <td>${escapeHtml(display(s.category || s.supportType))}</td>
            <td>${escapeHtml(display(s.deadline))}</td>
            <td><span class="badge ${statusBadgeClass(s.status)}">${escapeHtml(normalize(s.status || "draft"))}</span></td>
            <td class="action-btns">
                <button class="btn btn-sm btn-info" data-view-scholarship="${s.id}">View</button>
                <button class="btn btn-sm btn-primary" data-edit-scholarship="${s.id}">Edit</button>
                <button class="btn btn-sm btn-success" data-scholarship-status="${s.id}" data-status="active">Activate</button>
                <button class="btn btn-sm btn-warning" data-scholarship-status="${s.id}" data-status="inactive">Deactivate</button>
                <button class="btn btn-sm btn-danger" data-scholarship-status="${s.id}" data-status="archived">Archive</button>
            </td>
        </tr>
    `).join("");
    bindRowActions(tbody);
}

async function saveScholarship(event) {
    event.preventDefault();
    const id = adminState.editingScholarshipId;
    const payload = getScholarshipPayload();
    try {
        if (id) {
            await update(ref(database, `scholarships/${id}`), { ...payload, updatedAt: serverTimestamp() });
            await logActivity("scholarship_updated", `Updated scholarship ${payload.scholarshipName}`, "scholarship", id);
            showToast("Scholarship updated.", "success");
        } else {
            const newRef = push(ref(database, "scholarships"));
            await set(newRef, { ...payload, scholarshipId: newRef.key, createdBy: adminState.adminUid, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
            await logActivity("scholarship_created", `Created scholarship ${payload.scholarshipName}`, "scholarship", newRef.key);
            showToast("Scholarship created.", "success");
        }
        resetScholarshipForm();
        hideScholarshipForm();
    } catch (error) {
        console.error(error);
        showToast("Scholarship save failed.", "error");
    }
}

function getScholarshipPayload() {
    return {
        scholarshipName: value("schol-name"),
        provider: value("schol-provider"),
        providerType: value("schol-provider-type"),
        category: value("schol-category"),
        description: value("schol-description"),
        eligibility: value("schol-eligibility"),
        supportType: value("schol-support-type"),
        amount: value("schol-amount"),
        deadline: value("schol-deadline"),
        district: value("schol-district"),
        qualificationLevel: value("schol-qualification"),
        applyLink: value("schol-apply-link"),
        contactEmail: value("schol-contact-email"),
        contactPhone: value("schol-contact-phone"),
        imageURL: value("schol-image-url"),
        status: value("schol-status") || "draft"
    };
}

function editScholarship(id) {
    const s = adminState.scholarships[id];
    if (!s) return;
    adminState.editingScholarshipId = id;
    setValue("schol-name", s.scholarshipName || s.name);
    setValue("schol-provider", s.provider);
    setValue("schol-provider-type", s.providerType);
    setValue("schol-category", s.category);
    setValue("schol-description", s.description);
    setValue("schol-eligibility", s.eligibility);
    setValue("schol-support-type", s.supportType);
    setValue("schol-amount", s.amount);
    setValue("schol-deadline", s.deadline);
    setValue("schol-district", s.district);
    setValue("schol-qualification", s.qualificationLevel);
    setValue("schol-apply-link", s.applyLink);
    setValue("schol-contact-email", s.contactEmail);
    setValue("schol-contact-phone", s.contactPhone);
    setValue("schol-image-url", s.imageURL);
    setValue("schol-status", s.status || "draft");
    setText("scholarship-form-title", "Edit Scholarship");
    setText("scholarship-submit-label", "Save Changes");
    document.getElementById("scholarship-cancel-edit")?.classList.remove("hidden");
    showAdminSection("manage-scholarships");
    showScholarshipForm();
}

function resetScholarshipForm() {
    adminState.editingScholarshipId = null;
    document.getElementById("scholarship-form")?.reset();
    setText("scholarship-form-title", "Add Scholarship");
    setText("scholarship-submit-label", "Add Scholarship");
    document.getElementById("scholarship-cancel-edit")?.classList.add("hidden");
}

function openScholarshipFormForAdd() {
    resetScholarshipForm();
    showScholarshipForm();
}

function closeScholarshipForm() {
    resetScholarshipForm();
    hideScholarshipForm();
}

function showScholarshipForm() {
    const card = document.getElementById("scholarship-form-card");
    if (!card) return;
    card.classList.remove("hidden");
    card.scrollIntoView({ behavior: "smooth", block: "start" });
    setTimeout(() => document.getElementById("schol-name")?.focus(), 250);
}

function hideScholarshipForm() {
    document.getElementById("scholarship-form-card")?.classList.add("hidden");
}

function renderPathwayResults() {
    const tbody = document.getElementById("admin-pathway-tbody");
    if (!tbody) return;
    const rows = flattenPathwayResults();
    if (!rows.length) return showTableEmpty(tbody, 9, "No pathway results submitted yet.");
    tbody.innerHTML = rows.map((r) => {
        const user = adminState.users[r.uid] || {};
        const student = adminState.students[r.uid] || {};
        return `
            <tr>
                <td>${escapeHtml(display(user.fullName || r.studentName))}</td>
                <td>${escapeHtml(display(user.email || r.email))}</td>
                <td>${escapeHtml(display(r.educationLevel || student.educationLevel))}</td>
                <td>${escapeHtml(display(r.interestArea))}</td>
                <td>${escapeHtml(display(r.futureGoal))}</td>
                <td>${escapeHtml(display(r.pathwayScore))}%</td>
                <td>${formatDate(r.createdAt)}</td>
                <td><span class="badge ${student.currentPathwayResultId === r.resultId ? "badge-success" : "badge-info"}">${student.currentPathwayResultId === r.resultId ? "Current" : "Previous"}</span></td>
                <td class="action-btns">
                    <button class="btn btn-sm btn-info" data-view-result="${r.uid}:${r.resultId}">View</button>
                    <button class="btn btn-sm btn-primary" data-message-user="${r.uid}">Message</button>
                </td>
            </tr>
        `;
    }).join("");
    bindRowActions(tbody);
}

function renderMentorRequests() {
    const tbody = document.getElementById("admin-requests-tbody");
    if (!tbody) return;
    let rows = Object.entries(adminState.mentorRequests).map(([id, r]) => ({ id, ...r }));
    if (adminState.filters.requestStatus !== "all") rows = rows.filter((r) => normalize(r.status || "pending") === adminState.filters.requestStatus);
    rows.sort((a, b) => getTime(b.createdAt) - getTime(a.createdAt));
    if (!rows.length) return showTableEmpty(tbody, 7, "No mentor requests found.");

    tbody.innerHTML = rows.map((r) => `
        <tr>
            <td>${escapeHtml(display(r.studentName || adminState.users[r.studentUid]?.fullName))}</td>
            <td>${escapeHtml(display(r.mentorName || adminState.users[r.mentorUid]?.fullName))}</td>
            <td class="wrap-cell">${escapeHtml(display(r.message))}</td>
            <td><span class="badge ${statusBadgeClass(r.status)}">${escapeHtml(normalize(r.status || "pending"))}</span></td>
            <td>${formatDate(r.createdAt)}</td>
            <td>${formatDate(r.updatedAt)}</td>
            <td class="action-btns">
                <button class="btn btn-sm btn-info" data-view-student="${r.studentUid}">Student</button>
                <button class="btn btn-sm btn-info" data-view-mentor="${r.mentorUid}">Mentor</button>
                <button class="btn btn-sm btn-primary" data-message-user="${r.studentUid}">Message</button>
                <button class="btn btn-sm btn-success" data-request-status="${r.id}" data-status="completed">Complete</button>
                <button class="btn btn-sm btn-warning" data-request-status="${r.id}" data-status="archived">Archive</button>
            </td>
        </tr>
    `).join("");
    bindRowActions(tbody);
}

function renderSupportInbox() {
    updateSupportCounts();
    document.querySelectorAll("[data-support-folder]").forEach((button) => {
        button.classList.toggle("active", button.dataset.supportFolder === supportState.activeFolder);
    });
    const rows = getSupportRows();
    renderSupportList(rows);
    renderSupportDetail(rows);
    renderUserDirectory();
}

function renderUserDirectory() {
    const select = document.getElementById("message-recipient");
    if (!select) return;
    const current = select.value;
    const options = Object.entries(adminState.users)
        .filter(([uid, user]) => uid !== adminState.adminUid && normalize(user.accountStatus || "active") !== "disabled")
        .sort(([, a], [, b]) => display(a.fullName).localeCompare(display(b.fullName)))
        .map(([uid, user]) => `<option value="${escapeAttr(uid)}">${escapeHtml(display(user.fullName))} - ${escapeHtml(display(user.email))} (${escapeHtml(display(user.userType))})</option>`)
        .join("");
    select.innerHTML = `<option value="">Select registered user...</option>${options}`;
    select.value = current;
}

async function sendAdminMessage(event) {
    event.preventDefault();
    const selectedConversation = adminState.conversations[adminState.selectedConversationId] || {};
    const receiverUid = value("message-recipient") || selectedConversation.studentUid;
    const subject = value("message-subject") || "EduPath Support";
    const message = value("message-body");
    const priority = value("message-priority") || "normal";
    if (!receiverUid || !message) return showToast("Choose a recipient and write a message.", "error");

    const receiver = adminState.users[receiverUid] || {};
    const conversationId = `admin_${receiverUid}`;
    const messageRef = push(ref(database, `conversations/${conversationId}/messages`));
    const existing = adminState.conversations[conversationId] || {};
    const currentUnreadByUser = Number(existing.unreadByUser || 0);
    const payload = {
        messageId: messageRef.key,
        conversationId,
        senderUid: adminState.adminUid,
        senderName: adminState.adminUser.fullName || "EduPath Admin",
        senderRole: "admin",
        receiverUid,
        receiverRole: normalize(receiver.userType || "student") || "student",
        subject,
        message,
        priority,
        status: "sent",
        createdAt: serverTimestamp()
    };
    const updates = {};
    updates[`conversations/${conversationId}/conversationId`] = conversationId;
    updates[`conversations/${conversationId}/type`] = "admin-support";
    updates[`conversations/${conversationId}/studentUid`] = receiverUid;
    updates[`conversations/${conversationId}/adminUid`] = adminState.adminUid;
    updates[`conversations/${conversationId}/participantIds/${adminState.adminUid}`] = true;
    updates[`conversations/${conversationId}/participantIds/${receiverUid}`] = true;
    updates[`conversations/${conversationId}/participantNames/${adminState.adminUid}`] = adminState.adminUser.fullName || "EduPath Admin";
    updates[`conversations/${conversationId}/participantNames/${receiverUid}`] = receiver.fullName || receiver.email || "Student";
    updates[`conversations/${conversationId}/participantRoles/${adminState.adminUid}`] = "admin";
    updates[`conversations/${conversationId}/participantRoles/${receiverUid}`] = normalize(receiver.userType || "student") || "student";
    updates[`conversations/${conversationId}/lastMessage`] = message;
    updates[`conversations/${conversationId}/lastMessageAt`] = serverTimestamp();
    updates[`conversations/${conversationId}/lastSenderUid`] = adminState.adminUid;
    updates[`conversations/${conversationId}/unreadByAdmin`] = 0;
    updates[`conversations/${conversationId}/unreadByUser`] = currentUnreadByUser + 1;
    updates[`conversations/${conversationId}/status`] = "open";
    updates[`conversations/${conversationId}/updatedAt`] = serverTimestamp();
    if (!existing.createdAt) updates[`conversations/${conversationId}/createdAt`] = serverTimestamp();
    updates[`conversations/${conversationId}/messages/${messageRef.key}`] = payload;
    const notificationRef = push(ref(database, `notifications/${receiverUid}`));
    updates[`notifications/${receiverUid}/${notificationRef.key}`] = {
        notificationId: notificationRef.key,
        type: "admin_message",
        title: "New message from EduPath Admin",
        message: subject,
        messagePreview: message.slice(0, 140),
        relatedConversationId: conversationId,
        read: false,
        status: "unread",
        createdAt: serverTimestamp()
    };
    await update(ref(database), updates);
    await logActivity("support_message_replied", `Sent message to ${receiver.fullName || receiver.email}`, "conversation", conversationId);
    event.currentTarget.reset();
    adminState.selectedConversationId = conversationId;
    supportState.activeFolder = "sent";
    closeSupportCompose();
    renderSupportInbox();
    showToast("Message sent.", "success");
}

function getSupportRows() {
    let rows = [];
    const folder = supportState.activeFolder;
    const guestRows = Object.entries({ ...adminState.contactMessages, ...adminState.guestMessages }).map(([id, item]) => supportGuestRow(id, item));
    const convoRows = Object.entries(adminState.conversations || {}).map(([id, item]) => supportConversationRow(id, item)).filter(Boolean);
    const sentRows = convoRows.flatMap((row) => Object.values(row.raw.messages || {})
        .filter((msg) => msg.senderUid === adminState.adminUid || normalize(msg.senderRole) === "admin")
        .map((msg) => supportSentRow(row, msg)));

    if (folder === "guest") rows = guestRows.filter((row) => !isArchived(row.raw) && !isTrashed(row.raw));
    if (folder === "conversations") rows = convoRows.filter((row) => !isArchived(row.raw) && !isTrashed(row.raw));
    if (folder === "sent") rows = sentRows.filter((row) => !isArchived(row.raw) && !isTrashed(row.raw));
    if (folder === "archived") rows = [...guestRows, ...convoRows].filter((row) => isArchived(row.raw) && !isTrashed(row.raw));
    if (folder === "trash") rows = [...guestRows, ...convoRows].filter((row) => isTrashed(row.raw));

    rows = applySupportSearchFilter(rows);
    return sortSupportRows(rows);
}

function supportGuestRow(id, item = {}) {
    const status = normalize(item.status || "new");
    const sourcePath = adminState.guestMessages?.[id] ? "guestMessages" : "contactMessages";
    return {
        id: `guest:${id}`,
        type: "guest",
        sourceId: id,
        sourcePath,
        raw: item,
        sender: item.fullName || item.name || "Guest",
        role: "guest",
        email: item.email || "",
        phone: item.contactNumber || item.phone || "",
        subject: item.subject || "Guest Inquiry",
        message: item.message || "",
        date: item.createdAt || item.updatedAt,
        status,
        unread: status === "new",
        priority: item.priority || "normal"
    };
}

function supportConversationRow(id, item = {}) {
    if (!isSupportConversation(item)) return null;
    const uid = item.studentUid || item.userUid || Object.keys(item.participantIds || {}).find((key) => key !== adminState.adminUid);
    const user = adminState.users[uid] || {};
    const unread = Number(item.unreadByAdmin || 0);
    return {
        id: `conversation:${id}`,
        type: "conversation",
        sourceId: id,
        raw: item,
        sender: item.participantNames?.[uid] || user.fullName || user.email || "User",
        role: item.participantRoles?.[uid] || user.userType || "user",
        email: user.email || "",
        phone: user.phone || "",
        subject: "Support Conversation",
        message: item.lastMessage || "",
        date: item.lastMessageAt || item.updatedAt || item.createdAt,
        status: normalize(item.status || "open"),
        unread,
        priority: item.priority || "normal"
    };
}

function supportSentRow(conversationRow, message = {}) {
    const receiverUid = message.receiverUid || conversationRow.raw.studentUid || conversationRow.raw.userUid;
    const receiver = adminState.users[receiverUid] || {};
    return {
        id: `sent:${conversationRow.sourceId}:${message.messageId || getTime(message.createdAt)}`,
        type: "sent",
        sourceId: conversationRow.sourceId,
        raw: conversationRow.raw,
        messageRaw: message,
        sender: receiver.fullName || receiver.email || conversationRow.sender,
        role: receiver.userType || message.receiverRole || conversationRow.role,
        email: receiver.email || conversationRow.email,
        subject: message.subject || "EduPath Support",
        message: message.message || "",
        date: message.createdAt,
        status: message.status || "sent",
        unread: false,
        priority: message.priority || "normal"
    };
}

function applySupportSearchFilter(rows) {
    const q = normalize(supportState.searchTerm);
    return rows.filter((row) => {
        if (q && !normalize(`${row.sender} ${row.email} ${row.phone} ${row.subject} ${row.message} ${row.role}`).includes(q)) return false;
        const filter = supportState.filter;
        if (filter === "all") return true;
        if (filter === "unread") return !!row.unread;
        if (filter === "read") return !row.unread;
        if (filter === "important") return normalize(row.priority) === "important";
        return normalize(row.status) === filter;
    });
}

function sortSupportRows(rows) {
    return [...rows].sort((a, b) => {
        if (supportState.sort === "oldest") return getTime(a.date, a.id) - getTime(b.date, b.id);
        if (supportState.sort === "sender") return display(a.sender).localeCompare(display(b.sender));
        if (supportState.sort === "unread") return Number(!!b.unread) - Number(!!a.unread) || getTime(b.date, b.id) - getTime(a.date, a.id);
        return getTime(b.date, b.id) - getTime(a.date, a.id);
    });
}

function renderSupportList(rows) {
    const list = document.getElementById("support-message-list");
    if (!list) return;
    const titles = { guest: "Guest Inquiries", conversations: "User Conversations", sent: "Sent Messages", archived: "Archived", trash: "Trash" };
    const empty = { guest: "No guest inquiries yet.", conversations: "No user conversations yet.", sent: "No sent messages yet.", archived: "No archived messages.", trash: "Trash is empty." };
    setText("support-list-title", titles[supportState.activeFolder] || "Inbox");
    setText("support-list-subtitle", `${rows.length} item${rows.length === 1 ? "" : "s"}`);
    if (!rows.length) return showEmpty(list, empty[supportState.activeFolder] || "No messages.");
    list.innerHTML = rows.map((row) => `
        <button type="button" class="support-row support-message-row ${row.unread ? "unread" : "read"} ${supportState.selectedItemId === row.id ? "active" : ""}" data-support-item="${escapeAttr(row.id)}">
            <span class="support-avatar">${escapeHtml(initials(row.sender))}</span>
            <span class="message-sender-block">
                <span class="message-sender-line"><strong class="message-sender-name">${escapeHtml(display(row.sender))}</strong><span class="badge ${roleBadgeClass(row.role)}">${escapeHtml(display(row.role))}</span></span>
            </span>
            <span class="message-content-block">
                <strong class="message-subject">${escapeHtml(display(row.subject))}</strong>
                <span class="message-preview">${escapeHtml(truncate(row.message, 180))}</span>
            </span>
            <span class="message-meta-block"><span class="message-date">${formatDateTime(row.date)}</span><span class="message-meta-badges">${row.unread ? '<i class="unread-dot"></i>' : ""}<span class="badge ${statusBadgeClass(row.status)}">${escapeHtml(display(row.status))}</span></span></span>
        </button>
    `).join("");
    list.querySelectorAll("[data-support-item]").forEach((item) => item.addEventListener("click", () => openSupportItem(item.dataset.supportItem)));
}

function renderSupportDetail(rows = getSupportRows()) {
    const detail = document.getElementById("support-detail-panel");
    if (!detail) return;
    const row = rows.find((item) => item.id === supportState.selectedItemId) || findSupportRowById(supportState.selectedItemId);
    if (!row) {
        detail.innerHTML = "";
        detail.classList.remove("open");
        detail.setAttribute("aria-hidden", "true");
        return;
    }
    if (row.type === "guest") detail.innerHTML = guestSupportDetail(row);
    if (row.type === "conversation" || row.type === "sent") detail.innerHTML = conversationSupportDetail(row);
    detail.classList.add("open");
    detail.setAttribute("aria-hidden", "false");
    bindSupportDetailActions(detail);
}

function findSupportRowById(id) {
    if (!id) return null;
    return getSupportRows().find((row) => row.id === id) || [...Object.entries(adminState.guestMessages || {}).map(([gid, m]) => supportGuestRow(gid, m)), ...Object.entries(adminState.conversations || {}).map(([cid, c]) => supportConversationRow(cid, c)).filter(Boolean)].find((row) => row.id === id);
}

async function openSupportItem(id) {
    supportState.selectedItemId = id;
    const row = findSupportRowById(id);
    if (row?.type === "guest" && row.unread) await updateGuestStatus(row.sourceId, "read", false);
    if ((row?.type === "conversation" || row?.type === "sent") && row.sourceId) await openConversation(row.sourceId, false);
    renderSupportInbox();
}

function guestSupportDetail(row) {
    const item = row.raw;
    const lifecycleActions = isTrashed(item)
        ? `<button class="btn btn-sm btn-success" data-support-restore="${row.id}">Restore</button><button class="btn btn-sm btn-danger" data-support-delete="${row.id}">Permanently Delete</button>`
        : `<button class="btn btn-sm btn-warning" data-support-archive="${row.id}">Archive</button><button class="btn btn-sm btn-danger" data-support-trash="${row.id}">Delete</button>`;
    return `
        <article class="support-detail">
            <div class="support-detail-header">
                <button type="button" class="btn btn-sm btn-info" data-close-support-detail><i class="fas fa-arrow-left"></i> Back to Inbox</button>
                <span class="badge badge-info">Guest</span><span class="badge ${statusBadgeClass(row.status)}">${escapeHtml(row.status)}</span>
                <h3>${escapeHtml(row.subject)}</h3>
                <p>${escapeHtml(row.sender)} ${row.email ? `- ${escapeHtml(row.email)}` : ""} ${row.phone ? `- ${escapeHtml(row.phone)}` : ""}</p>
                <p class="text-sm text-muted">Source: ${escapeHtml(display(item.sourcePage))} - ${formatDateTime(row.date)}</p>
                <div class="support-actions">
                    <button class="btn btn-sm btn-info" data-guest-status="${row.sourceId}" data-status="read">Mark Read</button>
                    <button class="btn btn-sm btn-warning" data-guest-status="${row.sourceId}" data-status="new">Mark Unread</button>
                    <button class="btn btn-sm btn-primary" data-guest-status="${row.sourceId}" data-status="in-progress">In Progress</button>
                    <button class="btn btn-sm btn-success" data-guest-reply="${row.sourceId}">Reply Note</button>
                    <button class="btn btn-sm btn-info" data-guest-status="${row.sourceId}" data-status="closed">Close</button>
                    ${lifecycleActions}
                </div>
            </div>
            <div class="support-message-body">${escapeHtml(display(row.message))}</div>
            <section><h4>Reply Note</h4><p class="guest-reply-note">${escapeHtml(display(item.replyText))}</p><p class="text-sm text-muted">${escapeHtml(display(item.replyMethod))} ${formatDateTime(item.repliedAt)}</p></section>
        </article>
    `;
}

function conversationSupportDetail(row) {
    const convo = row.raw;
    const messages = Object.values(convo.messages || {}).sort((a, b) => getTime(a.createdAt) - getTime(b.createdAt));
    const lifecycleActions = isTrashed(convo)
        ? `<button class="btn btn-sm btn-success" data-support-restore="${row.id}">Restore</button><button class="btn btn-sm btn-danger" data-support-delete="${row.id}">Permanently Delete</button>`
        : `<button class="btn btn-sm btn-warning" data-support-archive="${row.id}">Archive</button><button class="btn btn-sm btn-danger" data-support-trash="${row.id}">Delete</button>`;
    return `
        <article class="support-detail">
            <div class="support-detail-header">
                <button type="button" class="btn btn-sm btn-info" data-close-support-detail><i class="fas fa-arrow-left"></i> Back to Inbox</button>
                <span class="badge ${roleBadgeClass(row.role)}">${escapeHtml(display(row.role))}</span><span class="badge ${statusBadgeClass(row.status)}">${escapeHtml(display(row.status))}</span>
                <h3>${escapeHtml(display(row.sender))}</h3>
                <p>${escapeHtml(display(row.email))}</p>
                <p class="text-sm text-muted">${formatDateTime(row.date)} - ${Number(convo.unreadByAdmin || 0)} unread</p>
                <div class="support-actions">
                    <button class="btn btn-sm btn-primary" data-focus-reply="true">Reply</button>
                    <button class="btn btn-sm btn-warning" data-conversation-unread="${row.sourceId}">Mark Unread</button>
                    ${lifecycleActions}
                </div>
            </div>
            <div class="support-thread">${messages.map((msg) => `
                <div class="support-bubble ${normalize(msg.senderRole) === "admin" ? "admin" : "user"}">
                    <strong>${escapeHtml(display(msg.senderName))} <span class="badge ${roleBadgeClass(msg.senderRole)}">${escapeHtml(display(msg.senderRole))}</span></strong>
                    <p>${escapeHtml(display(msg.message))}</p>
                    <span class="text-sm text-muted">${formatDateTime(msg.createdAt)} - ${escapeHtml(display(msg.status || "sent"))}</span>
                </div>
            `).join("")}</div>
            <form class="support-reply-form" data-reply-conversation="${escapeAttr(row.sourceId)}">
                <input class="form-control" name="subject" placeholder="Subject (optional)" value="${escapeAttr(messages[messages.length - 1]?.subject || "EduPath Support")}">
                <textarea class="form-control" name="message" rows="4" placeholder="Write a reply..." required></textarea>
                <button class="btn btn-primary" type="submit"><i class="fas fa-reply"></i> Send Reply</button>
            </form>
        </article>
    `;
}

function bindSupportDetailActions(root) {
    root.querySelectorAll("[data-close-support-detail]").forEach((btn) => btn.addEventListener("click", closeSupportDetail));
    root.querySelectorAll("[data-guest-status]").forEach((btn) => btn.addEventListener("click", () => updateGuestStatus(btn.dataset.guestStatus, btn.dataset.status)));
    root.querySelectorAll("[data-guest-reply]").forEach((btn) => btn.addEventListener("click", () => addGuestReply(btn.dataset.guestReply)));
    root.querySelectorAll("[data-support-archive]").forEach((btn) => btn.addEventListener("click", () => archiveSupportItem(btn.dataset.supportArchive)));
    root.querySelectorAll("[data-support-trash]").forEach((btn) => btn.addEventListener("click", () => trashSupportItem(btn.dataset.supportTrash)));
    root.querySelectorAll("[data-support-restore]").forEach((btn) => btn.addEventListener("click", () => restoreSupportItem(btn.dataset.supportRestore)));
    root.querySelectorAll("[data-support-delete]").forEach((btn) => btn.addEventListener("click", () => requestPermanentDelete(btn.dataset.supportDelete)));
    root.querySelectorAll("[data-conversation-unread]").forEach((btn) => btn.addEventListener("click", () => markConversationUnread(btn.dataset.conversationUnread)));
    root.querySelectorAll("[data-focus-reply]").forEach((btn) => btn.addEventListener("click", () => root.querySelector(".support-reply-form textarea")?.focus()));
    root.querySelectorAll("[data-reply-conversation]").forEach((form) => form.addEventListener("submit", sendConversationReply));
}

function closeSupportDetail() {
    supportState.selectedItemId = null;
    const detail = document.getElementById("support-detail-panel");
    if (detail) {
        detail.classList.remove("open");
        detail.setAttribute("aria-hidden", "true");
        detail.innerHTML = "";
    }
}

function updateSupportCounts() {
    const guestRows = Object.entries({ ...adminState.contactMessages, ...adminState.guestMessages }).map(([id, item]) => supportGuestRow(id, item));
    const convoRows = Object.entries(adminState.conversations || {}).map(([id, item]) => supportConversationRow(id, item)).filter(Boolean);
    const sentCount = convoRows.reduce((sum, row) => sum + Object.values(row.raw.messages || {}).filter((msg) => msg.senderUid === adminState.adminUid || normalize(msg.senderRole) === "admin").length, 0);
    const archivedCount = [...guestRows, ...convoRows].filter((row) => isArchived(row.raw) && !isTrashed(row.raw)).length;
    const trashCount = [...guestRows, ...convoRows].filter((row) => isTrashed(row.raw)).length;
    setCount("support-count-guest", guestRows.filter((row) => !isArchived(row.raw) && !isTrashed(row.raw)).length);
    setCount("support-count-conversations", convoRows.filter((row) => !isArchived(row.raw) && !isTrashed(row.raw)).length);
    setCount("support-count-sent", sentCount);
    setCount("support-count-archived", archivedCount);
    setCount("support-count-trash", trashCount);
}

function setCount(id, count) {
    const element = document.getElementById(id);
    if (element) element.textContent = String(count || 0);
}

function isSupportConversation(conversation = {}) {
    const type = normalize(conversation.type);
    return type === "admin-support" || Boolean(conversation.studentUid) || Boolean(conversation.userUid) || Boolean(conversation.participantIds);
}

function isArchived(item = {}) {
    return item.archived === true || normalize(item.status) === "archived";
}

function isTrashed(item = {}) {
    return item.trashed === true || normalize(item.status) === "trashed";
}

function roleBadgeClass(role) {
    const value = normalize(role);
    if (value === "guest") return "badge-warning";
    if (value === "admin") return "badge-info";
    if (value === "mentor") return "badge-danger";
    return "badge-success";
}

function renderActivity() {
    renderRecentActivity();
    renderLoginHistory();
    renderOnlineUsers();
    renderAdminActions();
}

function renderRecentActivity() {
    const container = document.getElementById("recent-activity-list");
    if (!container) return;
    let rows = Object.entries(adminState.activityLogs).map(([id, log]) => ({ id, ...log })).sort((a, b) => getTime(b.createdAt) - getTime(a.createdAt));
    const q = normalize(adminState.filters.activitySearch);
    if (q) rows = rows.filter((log) => normalize(`${log.userName} ${log.actionType} ${log.description}`).includes(q));
    if (adminState.filters.activityRole) rows = rows.filter((log) => normalize(log.userRole) === adminState.filters.activityRole);
    if (adminState.filters.activityType) rows = rows.filter((log) => normalize(log.actionType) === adminState.filters.activityType);
    if (!rows.length) return showEmpty(container, "No meaningful activity has been logged yet.");
    container.innerHTML = rows.slice(0, 50).map(activityItem).join("");
    updateActivityTypeOptions(rows);
}

function renderLoginHistory() {
    const tbody = document.getElementById("login-history-tbody");
    if (!tbody) return;
    const rows = Object.entries(adminState.loginHistory).flatMap(([uid, records]) => Object.entries(records || {}).map(([id, item]) => ({ uid, id, ...item }))).sort((a, b) => getTime(b.loginAt) - getTime(a.loginAt));
    if (!rows.length) return showTableEmpty(tbody, 6, "No login history yet.");
    tbody.innerHTML = rows.slice(0, 100).map((r) => {
        const user = adminState.users[r.uid] || {};
        return `<tr><td>${escapeHtml(display(user.fullName))}</td><td>${escapeHtml(display(user.userType))}</td><td>${formatDateTime(r.loginAt)}</td><td>${formatDateTime(r.logoutAt)}</td><td>${escapeHtml(display(r.sessionStatus))}</td><td>${escapeHtml(display(r.deviceType))} / ${escapeHtml(display(r.browserName))}</td></tr>`;
    }).join("");
}

function renderOnlineUsers() {
    const tbody = document.getElementById("online-users-tbody");
    if (!tbody) return;
    const rows = Object.entries(adminState.presence).filter(([, p]) => normalize(p.state) === "online");
    if (!rows.length) return showTableEmpty(tbody, 4, "No users online right now.");
    tbody.innerHTML = rows.map(([uid, p]) => {
        const user = adminState.users[uid] || {};
        return `<tr><td>${escapeHtml(display(user.fullName))}</td><td>${escapeHtml(display(user.userType))}</td><td>${formatDateTime(p.lastChanged)}</td><td>${formatDateTime(user.lastActiveAt)}</td></tr>`;
    }).join("");
}

function renderAdminActions() {
    const container = document.getElementById("admin-actions-list");
    if (!container) return;
    const rows = Object.values(adminState.activityLogs).filter((log) => normalize(log.userRole) === "admin").sort((a, b) => getTime(b.createdAt) - getTime(a.createdAt));
    if (!rows.length) return showEmpty(container, "No admin actions logged yet.");
    container.innerHTML = rows.slice(0, 50).map(activityItem).join("");
}

function renderReports() {
    const container = document.getElementById("reports-grid");
    if (!container) return;
    const students = getStudentRows();
    const mentors = getMentorRows();
    const reports = [
        ["Users by Role", countBy(Object.values(adminState.users), (u) => normalize(u.userType) || "unknown")],
        ["Students by District", countBy(students, (s) => s.district || "N/A")],
        ["Students by Interest Area", countBy(students, (s) => s.interestArea || "N/A")],
        ["Popular Future Goals", countBy(students, (s) => s.futureGoal || "N/A")],
        ["Popular Course Categories", countBy(Object.values(adminState.courses), (c) => c.category || "N/A")],
        ["Mentor Approval Status", countBy(mentors, (m) => normalize(m.status || "pending"))],
        ["Mentor Request Status", countBy(Object.values(adminState.mentorRequests), (r) => normalize(r.status || "pending"))],
        ["Active vs Inactive Courses", countBy(Object.values(adminState.courses), (c) => normalize(c.status || "draft"))],
        ["Scholarship Deadline Summary", summarizeDeadlines(Object.values(adminState.scholarships))],
        ["Support Message Volume", { Conversations: Object.keys(adminState.conversations).length, Guests: Object.keys({ ...adminState.contactMessages, ...adminState.guestMessages }).length }]
    ];
    const avgProfile = students.length ? Math.round(students.reduce((sum, s) => sum + Number(s.profileCompletion || 0), 0) / students.length) : 0;
    reports.push(["Profile Completion Average", { Average: avgProfile }]);
    reports.push(["Students Needing Scholarships", { Students: students.filter((s) => /scholarship|free|low.?cost|financial/i.test(s.financialSupport || "")).length }]);
    reports.push(["Pathway Score Distribution", scoreDistribution(flattenPathwayResults())]);
    reports.push(["Login Activity Trend", { Sessions: Object.values(adminState.loginHistory).reduce((sum, records) => sum + Object.keys(records || {}).length, 0) }]);
    container.innerHTML = reports.map(([title, data]) => reportCard(title, data)).join("");
}

function bindRowActions(root) {
    root.querySelectorAll("[data-view-student]").forEach((btn) => btn.addEventListener("click", () => openDetailDrawer("Student Details", studentDetails(btn.dataset.viewStudent))));
    root.querySelectorAll("[data-view-mentor]").forEach((btn) => btn.addEventListener("click", () => openDetailDrawer("Mentor Details", mentorDetails(btn.dataset.viewMentor))));
    root.querySelectorAll("[data-view-institute]").forEach((btn) => btn.addEventListener("click", () => openDetailDrawer("Institute Details", instituteDetails(btn.dataset.viewInstitute))));
    root.querySelectorAll("[data-view-result]").forEach((btn) => btn.addEventListener("click", () => {
        const [uid, resultId] = btn.dataset.viewResult.split(":");
        openDetailDrawer("Pathway Result", pathwayDetails(uid, resultId));
    }));
    root.querySelectorAll("[data-message-user]").forEach((btn) => btn.addEventListener("click", () => {
        setValue("message-recipient", btn.dataset.messageUser);
        showAdminSection("support-inbox");
        supportState.activeFolder = "conversations";
        openSupportCompose();
        renderSupportInbox();
    }));
    root.querySelectorAll("[data-toggle-account]").forEach((btn) => btn.addEventListener("click", () => toggleAccount(btn.dataset.toggleAccount)));
    root.querySelectorAll("[data-approve-mentor]").forEach((btn) => btn.addEventListener("click", () => approveMentor(btn.dataset.approveMentor)));
    root.querySelectorAll("[data-reject-mentor]").forEach((btn) => btn.addEventListener("click", () => rejectMentor(btn.dataset.rejectMentor)));
    root.querySelectorAll("[data-edit-course]").forEach((btn) => btn.addEventListener("click", () => editCourse(btn.dataset.editCourse)));
    root.querySelectorAll("[data-view-course]").forEach((btn) => btn.addEventListener("click", () => openDetailDrawer("Course Details", objectDetails(adminState.courses[btn.dataset.viewCourse]))));
    root.querySelectorAll("[data-course-status]").forEach((btn) => btn.addEventListener("click", () => updateCourseStatus(btn.dataset.courseStatus, btn.dataset.status)));
    root.querySelectorAll("[data-edit-scholarship]").forEach((btn) => btn.addEventListener("click", () => editScholarship(btn.dataset.editScholarship)));
    root.querySelectorAll("[data-view-scholarship]").forEach((btn) => btn.addEventListener("click", () => openDetailDrawer("Scholarship Details", objectDetails(adminState.scholarships[btn.dataset.viewScholarship]))));
    root.querySelectorAll("[data-scholarship-status]").forEach((btn) => btn.addEventListener("click", () => updateScholarshipStatus(btn.dataset.scholarshipStatus, btn.dataset.status)));
    root.querySelectorAll("[data-request-status]").forEach((btn) => btn.addEventListener("click", () => updateRequestStatus(btn.dataset.requestStatus, btn.dataset.status)));
    root.querySelectorAll("[data-view-guest]").forEach((btn) => btn.addEventListener("click", () => viewGuestInquiry(btn.dataset.viewGuest)));
    root.querySelectorAll("[data-guest-status]").forEach((btn) => btn.addEventListener("click", () => updateGuestStatus(btn.dataset.guestStatus, btn.dataset.status)));
    root.querySelectorAll("[data-guest-reply]").forEach((btn) => btn.addEventListener("click", () => addGuestReply(btn.dataset.guestReply)));
}

async function approveMentor(uid) {
    if (!confirm("Approve this mentor application?")) return;
    const mentor = adminState.mentors[uid] || {};
    await update(ref(database), {
        [`mentors/${uid}/status`]: "approved",
        [`mentors/${uid}/approvedAt`]: serverTimestamp(),
        [`mentors/${uid}/approvedBy`]: adminState.adminUid,
        [`users/${uid}/mentorStatus`]: "approved",
        [`notifications/${uid}/${Date.now()}`]: notification("Mentor approved", "Your mentor application has been approved.")
    });
    await logActivity("mentor_approved", `Approved mentor ${mentor.fullName || uid}`, "mentor", uid);
    showToast("Mentor approved.", "success");
}

async function rejectMentor(uid) {
    const reason = prompt("Enter rejection reason:");
    if (!reason) return;
    const mentor = adminState.mentors[uid] || {};
    await update(ref(database), {
        [`mentors/${uid}/status`]: "rejected",
        [`mentors/${uid}/rejectionReason`]: reason,
        [`mentors/${uid}/rejectedAt`]: serverTimestamp(),
        [`mentors/${uid}/rejectedBy`]: adminState.adminUid,
        [`users/${uid}/mentorStatus`]: "rejected",
        [`notifications/${uid}/${Date.now()}`]: notification("Mentor application update", `Your mentor application was rejected. Reason: ${reason}`)
    });
    await logActivity("mentor_rejected", `Rejected mentor ${mentor.fullName || uid}`, "mentor", uid);
    showToast("Mentor rejected.", "success");
}

async function updateCourseStatus(id, status) {
    await update(ref(database, `courses/${id}`), { status, updatedAt: serverTimestamp() });
    await logActivity(`course_${status === "active" ? "activated" : status === "inactive" ? "deactivated" : "updated"}`, `Set course status to ${status}`, "course", id);
    showToast(`Course ${status}.`, "success");
}

async function updateScholarshipStatus(id, status) {
    await update(ref(database, `scholarships/${id}`), { status, updatedAt: serverTimestamp() });
    await logActivity(`scholarship_${status === "active" ? "activated" : status === "inactive" ? "deactivated" : "updated"}`, `Set scholarship status to ${status}`, "scholarship", id);
    showToast(`Scholarship ${status}.`, "success");
}

async function updateRequestStatus(id, status) {
    await update(ref(database, `mentorRequests/${id}`), { status, updatedAt: serverTimestamp() });
    showToast(`Request marked ${status}.`, "success");
}

async function updateGuestStatus(id, status) {
    const payload = { status, updatedAt: serverTimestamp() };
    if (status === "read") payload.readAt = serverTimestamp();
    const path = adminState.guestMessages?.[id] ? "guestMessages" : "contactMessages";
    await update(ref(database, `${path}/${id}`), payload);
    showToast(`Inquiry marked ${status}.`, "success");
    renderSupportInbox();
}

async function addGuestReply(id) {
    const replyText = prompt("Record reply note. This does not send email or SMS:");
    if (!replyText) return;
    const replyMethod = prompt("Contact method used: Phone, Email, WhatsApp, or Other", "Phone") || "Other";
    const path = adminState.guestMessages?.[id] ? "guestMessages" : "contactMessages";
    await update(ref(database, `${path}/${id}`), {
        status: "replied",
        replyText,
        replyMethod,
        repliedAt: serverTimestamp(),
        repliedBy: adminState.adminUid,
        updatedAt: serverTimestamp()
    });
    showToast("Guest inquiry marked as replied.", "success");
    renderSupportInbox();
}

function viewGuestInquiry(id) {
    supportState.activeFolder = "guest";
    supportState.selectedItemId = `guest:${id}`;
    renderSupportInbox();
}

async function openConversation(id, rerender = true) {
    adminState.selectedConversationId = id;
    const convo = adminState.conversations[id] || {};
    const updates = {
        [`conversations/${id}/unreadByAdmin`]: 0,
        [`conversations/${id}/updatedAt`]: serverTimestamp()
    };
    Object.entries(convo.messages || {}).forEach(([messageId, message]) => {
        if (normalize(message.senderRole) !== "admin" && normalize(message.status) !== "read") {
            updates[`conversations/${id}/messages/${messageId}/status`] = "read";
            updates[`conversations/${id}/messages/${messageId}/readAt`] = serverTimestamp();
        }
    });
    await update(ref(database), updates);
    const select = document.getElementById("message-recipient");
    if (select && convo.studentUid) select.value = convo.studentUid;
    if (rerender) renderSupportInbox();
}

async function sendConversationReply(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const conversationId = form.dataset.replyConversation;
    const convo = adminState.conversations[conversationId] || {};
    const receiverUid = convo.studentUid || Object.keys(convo.participantIds || {}).find((uid) => uid !== adminState.adminUid);
    const subject = form.elements.subject?.value.trim() || "EduPath Support";
    const message = form.elements.message?.value.trim();
    if (!receiverUid || !message) return showToast("Write a reply first.", "error");
    await sendSupportMessageToUser(receiverUid, subject, message, valueFromForm(form, "priority") || "normal", conversationId);
    form.reset();
    showToast("Reply sent.", "success");
}

async function sendSupportMessageToUser(receiverUid, subject, message, priority = "normal", conversationId = `admin_${receiverUid}`) {
    const receiver = adminState.users[receiverUid] || {};
    const existing = adminState.conversations[conversationId] || {};
    const messageRef = push(ref(database, `conversations/${conversationId}/messages`));
    const notificationRef = push(ref(database, `notifications/${receiverUid}`));
    const currentUnreadByUser = Number(existing.unreadByUser || 0);
    const updates = {};
    updates[`conversations/${conversationId}/conversationId`] = conversationId;
    updates[`conversations/${conversationId}/type`] = "admin-support";
    updates[`conversations/${conversationId}/studentUid`] = receiverUid;
    updates[`conversations/${conversationId}/adminUid`] = adminState.adminUid;
    updates[`conversations/${conversationId}/participantIds/${adminState.adminUid}`] = true;
    updates[`conversations/${conversationId}/participantIds/${receiverUid}`] = true;
    updates[`conversations/${conversationId}/participantNames/${adminState.adminUid}`] = adminState.adminUser.fullName || "EduPath Admin";
    updates[`conversations/${conversationId}/participantNames/${receiverUid}`] = receiver.fullName || receiver.email || "User";
    updates[`conversations/${conversationId}/participantRoles/${adminState.adminUid}`] = "admin";
    updates[`conversations/${conversationId}/participantRoles/${receiverUid}`] = normalize(receiver.userType || "student") || "student";
    updates[`conversations/${conversationId}/lastMessage`] = message;
    updates[`conversations/${conversationId}/lastMessageAt`] = serverTimestamp();
    updates[`conversations/${conversationId}/lastSenderUid`] = adminState.adminUid;
    updates[`conversations/${conversationId}/unreadByAdmin`] = 0;
    updates[`conversations/${conversationId}/unreadByUser`] = currentUnreadByUser + 1;
    updates[`conversations/${conversationId}/status`] = "open";
    updates[`conversations/${conversationId}/updatedAt`] = serverTimestamp();
    if (!existing.createdAt) updates[`conversations/${conversationId}/createdAt`] = serverTimestamp();
    updates[`conversations/${conversationId}/messages/${messageRef.key}`] = {
        messageId: messageRef.key,
        conversationId,
        senderUid: adminState.adminUid,
        senderName: adminState.adminUser.fullName || "EduPath Admin",
        senderRole: "admin",
        receiverUid,
        receiverRole: normalize(receiver.userType || "student") || "student",
        subject,
        message,
        priority,
        status: "sent",
        createdAt: serverTimestamp()
    };
    updates[`notifications/${receiverUid}/${notificationRef.key}`] = {
        notificationId: notificationRef.key,
        type: "admin_message",
        title: "New message from EduPath Support",
        message: subject,
        messagePreview: message.slice(0, 140),
        relatedConversationId: conversationId,
        read: false,
        status: "unread",
        createdAt: serverTimestamp()
    };
    await update(ref(database), updates);
    adminState.selectedConversationId = conversationId;
    supportState.selectedItemId = `conversation:${conversationId}`;
    renderSupportInbox();
}

async function archiveSupportItem(id) {
    const row = findSupportRowById(id);
    if (!row) return;
    await updateSupportItem(row, { status: "archived", archived: true, archivedAt: serverTimestamp(), archivedBy: adminState.adminUid, updatedAt: serverTimestamp() });
    supportState.selectedItemId = null;
    showToast("Moved to archive.", "success");
}

async function trashSupportItem(id) {
    const row = findSupportRowById(id);
    if (!row) return;
    await updateSupportItem(row, { status: "trashed", trashed: true, trashedAt: serverTimestamp(), trashedBy: adminState.adminUid, updatedAt: serverTimestamp() });
    supportState.selectedItemId = null;
    showToast("Moved to trash.", "success");
}

async function restoreSupportItem(id) {
    const row = findSupportRowById(id);
    if (!row) return;
    await updateSupportItem(row, { status: row.type === "guest" ? "read" : "open", archived: false, trashed: false, restoredAt: serverTimestamp(), updatedAt: serverTimestamp() });
    supportState.selectedItemId = null;
    showToast("Restored to inbox.", "success");
}

function requestPermanentDelete(id) {
    supportState.pendingDelete = id;
    document.getElementById("support-confirm-modal")?.classList.add("open");
}

async function permanentlyDeleteSupportItem() {
    const row = findSupportRowById(supportState.pendingDelete);
    if (!row) return closeSupportConfirm();
    if (row.type === "guest") await remove(ref(database, `${row.sourcePath || "guestMessages"}/${row.sourceId}`));
    if (row.type === "conversation") await remove(ref(database, `conversations/${row.sourceId}`));
    supportState.pendingDelete = null;
    supportState.selectedItemId = null;
    closeSupportConfirm();
    showToast("Item permanently deleted.", "success");
}

function closeSupportConfirm() {
    supportState.pendingDelete = null;
    document.getElementById("support-confirm-modal")?.classList.remove("open");
}

async function markConversationUnread(id) {
    await update(ref(database, `conversations/${id}`), { unreadByAdmin: 1, updatedAt: serverTimestamp() });
    renderSupportInbox();
}

async function updateSupportItem(row, payload) {
    if (row.type === "guest") return update(ref(database, `${row.sourcePath || "guestMessages"}/${row.sourceId}`), payload);
    if (row.type === "conversation") return update(ref(database, `conversations/${row.sourceId}`), payload);
}

function openSupportCompose() {
    renderUserDirectory();
    document.getElementById("support-compose-modal")?.classList.add("open");
}

function closeSupportCompose() {
    document.getElementById("support-compose-modal")?.classList.remove("open");
}

function valueFromForm(form, name) {
    return form.elements?.[name]?.value?.trim?.() || "";
}

async function toggleAccount(uid) {
    const user = adminState.users[uid] || {};
    const next = normalize(user.accountStatus) === "suspended" ? "active" : "suspended";
    const note = prompt(`Optional internal note for ${next === "suspended" ? "suspending" : "reactivating"} this account:`) || "";
    const updates = {
        [`users/${uid}/accountStatus`]: next,
        [`users/${uid}/updatedAt`]: serverTimestamp(),
        [`notifications/${uid}/${Date.now()}`]: notification("Account status updated", `Your account status is now ${next}.`)
    };
    if (note) {
        const noteRef = push(ref(database, `adminNotes/${uid}`));
        updates[`adminNotes/${uid}/${noteRef.key}`] = { noteId: noteRef.key, adminUid: adminState.adminUid, adminName: adminState.adminUser.fullName || "Admin", note, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
    }
    await update(ref(database), updates);
    await logActivity(next === "suspended" ? "user_suspended" : "user_reactivated", `${next} account ${user.fullName || uid}`, "user", uid);
    showToast(`Account ${next}.`, "success");
}

function studentDetails(uid) {
    const s = getStudentRows().find((row) => row.uid === uid) || {};
    return groupedDetails({
        Personal: ["fullName", "email", "phone", "photoURL", "accountStatus", "createdAt", "lastLoginAt", "lastActiveAt"],
        Education: ["district", "educationLevel", "examStream", "resultStatus", "olData", "alData"],
        Guidance: ["interestArea", "skills", "futureGoal", "financialSupport", "learningMode"],
        Progress: ["profileCompletion", "pathwayCompleted", "currentPathwayResultId", "pathwayHistoryCount", "savedCoursesCount", "savedScholarshipsCount", "mentorRequestsCount"]
    }, s);
}

function mentorDetails(uid) {
    const m = getMentorRows().find((row) => row.uid === uid) || {};
    const requests = Object.values(adminState.mentorRequests).filter((r) => r.mentorUid === uid);
    return groupedDetails({
        Personal: ["fullName", "email", "phone", "photoURL", "district", "city", "preferredLanguages"],
        Professional: ["mentorType", "field", "currentRole", "universityOrCompany", "highestQualification", "degreeArea", "experience", "linkedInURL", "portfolioURL", "bio"],
        Guidance: ["guidanceAreas", "studentLevelsSupported", "availableDays", "availableTime", "mentoringMode", "maximumStudentsPerWeek", "availabilityStatus", "motivation", "messageToStudents", "agreementAccepted"],
        Approval: ["status", "approvedAt", "approvedBy", "rejectionReason", "profileCompletion", "lastLoginAt", "lastActiveAt"]
    }, { ...m, pendingRequestsCount: requests.filter((r) => normalize(r.status) === "pending").length, acceptedRequestsCount: requests.filter((r) => normalize(r.status) === "accepted").length });
}

function instituteDetails(uid) {
    const i = getInstituteRows().find((row) => row.uid === uid) || {};
    const courses = Object.values(adminState.courses).filter((course) => course.instituteUid === uid);
    return groupedDetails({
        Profile: ["instituteName", "email", "phone", "address", "district", "websiteURL", "facebookPage", "logoURL"],
        Details: ["description", "status", "verificationStatus", "accountStatus", "profileCompletion"],
        Activity: ["createdAt", "updatedAt", "lastLoginAt", "lastActiveAt", "courseCount", "activeCourseCount"]
    }, { ...i, courseCount: courses.length, activeCourseCount: courses.filter((course) => normalize(course.status) === "active").length });
}

function pathwayDetails(uid, resultId) {
    return objectDetails(adminState.pathwayResults[uid]?.[resultId] || {});
}

function objectDetails(obj = {}) {
    return `<div class="detail-grid">${Object.entries(obj).map(([key, value]) => `<div><span>${escapeHtml(key)}</span><strong>${escapeHtml(display(value))}</strong></div>`).join("")}</div>`;
}

function groupedDetails(groups, data) {
    return Object.entries(groups).map(([title, keys]) => `
        <section class="drawer-group"><h3>${escapeHtml(title)}</h3><div class="detail-grid">${keys.map((key) => `<div><span>${escapeHtml(labelize(key))}</span><strong>${escapeHtml(display(data[key]))}</strong></div>`).join("")}</div></section>
    `).join("");
}

function openDetailDrawer(title, bodyHtml) {
    let drawer = document.getElementById("admin-detail-drawer");
    if (!drawer) {
        drawer = document.createElement("aside");
        drawer.id = "admin-detail-drawer";
        drawer.className = "detail-drawer";
        document.body.appendChild(drawer);
    }
    drawer.innerHTML = `<div class="drawer-header"><h2>${escapeHtml(title)}</h2><button class="btn btn-sm btn-danger" id="close-admin-drawer">Close</button></div><div class="drawer-body">${bodyHtml}</div>`;
    drawer.classList.add("open");
    document.getElementById("close-admin-drawer")?.addEventListener("click", () => drawer.classList.remove("open"));
}

function renderPendingActions() {
    const container = document.getElementById("pending-actions-list");
    if (!container) return;
    const actions = [
        ["Pending mentor approvals", countWhere(adminState.mentors, (m) => normalize(m.status || "pending") === "pending"), "mentor-approvals"],
        ["Unread support messages", getUnreadSupportCount(), "support-inbox"],
        ["Pending mentor requests", countWhere(adminState.mentorRequests, (r) => normalize(r.status || "pending") === "pending"), "mentor-requests"],
        ["Scholarships near deadline", nearDeadlineScholarships().length, "manage-scholarships"],
        ["Draft courses", countWhere(adminState.courses, (c) => normalize(c.status) === "draft"), "manage-courses"]
    ];
    container.innerHTML = actions.map(([label, count, section]) => `<button class="pending-action" data-section="${section}"><strong>${count}</strong><span>${label}</span></button>`).join("");
    container.querySelectorAll("[data-section]").forEach((btn) => btn.addEventListener("click", () => showAdminSection(btn.dataset.section)));
}

function renderQuickActions() {
    const container = document.getElementById("quick-actions-list");
    if (!container) return;
    container.innerHTML = [
        ["Approve Mentors", "mentor-approvals", "fa-user-check"],
        ["Add Course", "manage-courses", "fa-book"],
        ["Add Scholarship", "manage-scholarships", "fa-hand-holding-usd"],
        ["Send Message", "support-inbox", "fa-paper-plane"],
        ["View Reports", "reports", "fa-chart-bar"]
    ].map(([label, section, icon]) => `<button class="quick-action btn btn-primary" data-section="${section}"><i class="fas ${icon}"></i>${label}</button>`).join("");
    container.querySelectorAll("[data-section]").forEach((btn) => btn.addEventListener("click", () => showAdminSection(btn.dataset.section)));
}

function showAdminSection(sectionId = "overview", updateHash = true) {
    const targetId = sectionTitles[sectionId] ? sectionId : "overview";
    document.querySelectorAll(".dashboard-section").forEach((section) => section.classList.toggle("active", section.id === targetId));
    document.querySelectorAll(".sidebar-links a[data-section]").forEach((link) => link.classList.toggle("active", link.dataset.section === targetId));
    document.querySelector(".page-title") && (document.querySelector(".page-title").textContent = sectionTitles[targetId]);
    if (updateHash && window.location.hash !== `#${targetId}`) window.history.replaceState(null, "", `#${targetId}`);
    const heading = document.querySelector(`#${CSS.escape(targetId)} h2, #${CSS.escape(targetId)} h1`);
    if (heading) {
        heading.setAttribute("tabindex", "-1");
        heading.focus({ preventScroll: true });
    }
    const sidebar = document.getElementById("sidebar");
    const overlay = document.getElementById("sidebar-overlay");
    if (sidebar && window.innerWidth <= 768) {
        sidebar.classList.remove("active");
        document.body.classList.remove("sidebar-mobile-open");
        overlay?.classList.remove("show");
    }
}

function getHashSection() {
    const hash = window.location.hash.replace("#", "");
    return sectionTitles[hash] ? hash : "overview";
}

function setupPresence(uid) {
    const presenceRef = ref(database, `presence/${uid}`);
    onValue(ref(database, ".info/connected"), (snapshot) => {
        if (snapshot.val() !== true) return;
        onDisconnect(presenceRef).set({ state: "offline", lastChanged: serverTimestamp() });
        set(presenceRef, { state: "online", lastChanged: serverTimestamp() });
        update(ref(database, `users/${uid}`), { isOnline: true, lastActiveAt: serverTimestamp() });
    });
}

async function trackLoginSession(uid, userData) {
    if (sessionStorage.getItem("edupathLoginRecordId")) return;
    const recordRef = push(ref(database, `loginHistory/${uid}`));
    sessionStorage.setItem("edupathLoginRecordId", recordRef.key);
    await update(ref(database), {
        [`users/${uid}/lastLoginAt`]: serverTimestamp(),
        [`users/${uid}/lastActiveAt`]: serverTimestamp(),
        [`users/${uid}/isOnline`]: true,
        [`loginHistory/${uid}/${recordRef.key}`]: {
            recordId: recordRef.key,
            loginAt: serverTimestamp(),
            sessionStatus: "active",
            deviceType: getDeviceType(),
            browserName: getBrowserName()
        }
    });
    await logActivity("login", `${userData.fullName || "Admin"} logged in`, "user", uid);
}

async function updateLogoutState() {
    const uid = adminState.adminUid;
    const recordId = sessionStorage.getItem("edupathLoginRecordId");
    const updates = {
        [`users/${uid}/isOnline`]: false,
        [`users/${uid}/lastLogoutAt`]: serverTimestamp(),
        [`presence/${uid}`]: { state: "offline", lastChanged: serverTimestamp() }
    };
    if (recordId) {
        updates[`loginHistory/${uid}/${recordId}/sessionStatus`] = "completed";
        updates[`loginHistory/${uid}/${recordId}/logoutAt`] = serverTimestamp();
    }
    await update(ref(database), updates);
    await logActivity("logout", `${adminState.adminUser.fullName || "Admin"} logged out`, "user", uid);
}

async function logActivity(actionType, description, relatedEntityType = "", relatedEntityId = "") {
    if (!adminState.adminUid) return;
    const logRef = push(ref(database, "activityLogs"));
    await set(logRef, {
        logId: logRef.key,
        uid: adminState.adminUid,
        userName: adminState.adminUser.fullName || "EduPath Admin",
        userRole: "admin",
        actionType,
        description,
        relatedEntityType,
        relatedEntityId,
        createdAt: serverTimestamp()
    });
}

function updateSidebarBadges() {
    setText("badge-mentor-approvals", countWhere(adminState.mentors, (m) => normalize(m.status || "pending") === "pending") || "");
    setText("badge-support", getUnreadSupportCount() || "");
    setText("badge-mentor-requests", countWhere(adminState.mentorRequests, (r) => normalize(r.status || "pending") === "pending") || "");
}

function getUnreadSupportCount() {
    const guestUnread = getNewGuestInquiryCount();
    const convoUnread = Object.values(adminState.conversations || {})
        .filter((c) => isSupportConversation(c))
        .reduce((sum, c) => sum + Number(c.unreadByAdmin || 0), 0);
    return guestUnread + convoUnread;
}

function getNewGuestInquiryCount() {
    return countWhere(adminState.guestMessages, (m) => normalize(m.status || "new") === "new");
}

function flattenPathwayResults() {
    return Object.entries(adminState.pathwayResults).flatMap(([uid, results]) =>
        Object.entries(results || {}).map(([resultId, result]) => ({ uid, resultId, ...result }))
    ).sort((a, b) => getTime(b.createdAt, b.resultId) - getTime(a.createdAt, a.resultId));
}

function notification(title, message) {
    return { title, message, status: "unread", createdAt: serverTimestamp() };
}

function countWhere(obj, predicate) {
    return Object.values(obj || {}).filter(predicate).length;
}

function countBy(rows, getter) {
    return rows.reduce((acc, row) => {
        const key = getter(row);
        acc[key] = (acc[key] || 0) + 1;
        return acc;
    }, {});
}

function animateTile(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.textContent !== String(value)) {
        el.textContent = value;
        el.classList.remove("tile-bump");
        void el.offsetWidth;
        el.classList.add("tile-bump");
    }
}

function setLastSynced() {
    setText("last-synced-time", new Date().toLocaleTimeString());
}

function renderChecklist(id, items, complete) {
    const container = document.getElementById(id);
    if (!container) return;
    if (!items.length) {
        container.innerHTML = `<li><i class="fas fa-check-circle text-success"></i> None</li>`;
        return;
    }
    const icon = complete ? "fas fa-check-circle text-success" : "far fa-circle text-muted";
    container.innerHTML = items.map((item) => `<li><i class="${icon}"></i> ${escapeHtml(item)}</li>`).join("");
}

function updateStudentFilterOptions(rows) {
    fillOptions("student-filter-district", rows.map((s) => s.district), "All Districts");
    fillOptions("student-filter-interest", rows.map((s) => s.interestArea), "All Interest Areas");
    fillOptions("student-filter-education", rows.map((s) => s.educationLevel), "All Education Levels");
}

function fillOptions(id, values, label) {
    const select = document.getElementById(id);
    if (!select) return;
    const current = select.value;
    const unique = [...new Set(values.filter(Boolean))].sort();
    select.innerHTML = `<option value="">${label}</option>${unique.map((value) => `<option value="${escapeAttr(value)}">${escapeHtml(value)}</option>`).join("")}`;
    select.value = current;
}

function updateActivityTypeOptions(rows) {
    fillOptions("activity-type-filter", rows.map((r) => r.actionType), "All Actions");
}

function activityItem(log) {
    return `<article class="list-row"><strong>${escapeHtml(display(log.actionType))}</strong><p>${escapeHtml(display(log.description))}</p><span>${escapeHtml(display(log.userName))} • ${formatDateTime(log.createdAt)}</span></article>`;
}

function reportCard(title, data) {
    const rows = Object.entries(data).map(([label, value]) => ({
        label,
        value: Number(value) || 0
    })).sort((a, b) => b.value - a.value);
    const max = Math.max(1, ...rows.map((row) => row.value));
    const bars = rows.map((row, index) => {
        const width = row.value > 0 ? Math.max(6, (row.value / max) * 100) : 0;
        return `<div class="report-bar-row">
            <div class="report-bar-meta">
                <span class="report-bar-label">${escapeHtml(row.label)}</span>
                <strong>${formatNumber(row.value)}</strong>
            </div>
            <div class="report-bar-track" aria-label="${escapeAttr(`${row.label}: ${row.value}`)}">
                <div class="report-bar-fill bar-tone-${(index % 4) + 1}" style="width:${width}%;"></div>
            </div>
        </div>`;
    }).join("");
    return `<article class="report-card glass"><h4>${escapeHtml(title)}</h4><div class="report-bar-chart">${bars}</div></article>`;
}

function formatNumber(value) {
    return Number(value || 0).toLocaleString();
}

function summarizeDeadlines(items) {
    const now = Date.now();
    return {
        Upcoming: items.filter((s) => getTime(s.deadline) >= now).length,
        Expired: items.filter((s) => s.deadline && getTime(s.deadline) < now).length,
        Missing: items.filter((s) => !s.deadline).length
    };
}

function scoreDistribution(results) {
    return {
        "0-49": results.filter((r) => Number(r.pathwayScore || 0) < 50).length,
        "50-79": results.filter((r) => Number(r.pathwayScore || 0) >= 50 && Number(r.pathwayScore || 0) < 80).length,
        "80-100": results.filter((r) => Number(r.pathwayScore || 0) >= 80).length
    };
}

function nearDeadlineScholarships() {
    const now = Date.now();
    const soon = now + 14 * 24 * 60 * 60 * 1000;
    return Object.values(adminState.scholarships).filter((s) => {
        const time = getTime(s.deadline);
        return time >= now && time <= soon;
    });
}

function onlineBadge(uid) {
    return `<span class="presence-dot ${isOnline(uid) ? "online" : ""}"></span>${isOnline(uid) ? "Online" : "Offline"}`;
}

function isOnline(uid) {
    return normalize(adminState.presence[uid]?.state) === "online" || adminState.users[uid]?.isOnline === true;
}

function avatarCell(row, fallback) {
    const name = row.fullName || row.name || fallback;
    const avatar = row.photoURL ? `<img src="${escapeAttr(row.photoURL)}" alt="">` : `<span class="avatar-mini">${escapeHtml(initials(name))}</span>`;
    return `<div class="student-avatar-cell">${avatar}<strong>${escapeHtml(display(name))}</strong></div>`;
}

function progressMini(value) {
    const pct = Number(value || 0);
    return `<div class="mini-progress"><span>${pct}%</span><div class="progress-bar-container"><div class="progress-bar bg-primary" style="width:${pct}%"></div></div></div>`;
}

function accountBadgeClass(status) {
    const s = normalize(status || "active");
    if (s === "suspended" || s === "disabled") return "badge-danger";
    return "badge-success";
}

function statusBadgeClass(status) {
    const s = normalize(status || "draft");
    if (["approved", "accepted", "active", "completed", "read", "replied", "closed"].includes(s)) return "badge-success";
    if (["pending", "new", "unread", "draft", "in-progress"].includes(s)) return "badge-warning";
    if (["rejected", "inactive", "archived", "cancelled", "disabled", "suspended"].includes(s)) return "badge-danger";
    return "badge-info";
}

function showTableEmpty(tbody, colspan, message) {
    tbody.innerHTML = `<tr><td colspan="${colspan}" class="text-center py-4 text-muted">${escapeHtml(message)}</td></tr>`;
}

function showEmpty(container, message) {
    container.innerHTML = `<div class="empty-state"><i class="fas fa-inbox"></i><p>${escapeHtml(message)}</p></div>`;
}

function showErrorForPath(path, message) {
    const map = {
        users: "admin-students-tbody",
        mentors: "admin-mentors-tbody",
        courses: "admin-courses-tbody",
        scholarships: "admin-schol-tbody",
        pathwayResults: "admin-pathway-tbody",
        mentorRequests: "admin-requests-tbody",
        guestMessages: "support-message-list",
        conversations: "support-message-list"
    };
    const target = document.getElementById(map[path]);
    if (target?.tagName === "TBODY") showTableEmpty(target, path === "guestMessages" ? 9 : 6, message);
    else if (target) target.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle text-danger"></i><p>${escapeHtml(message)}</p><button type="button" class="btn btn-sm btn-primary" onclick="window.location.reload()">Retry</button></div>`;
}

function setActiveButton(selector, active) {
    document.querySelectorAll(selector).forEach((button) => button.classList.toggle("active", button === active));
}

function getConversationName(convo = {}) {
    const names = convo.participantNames || {};
    return Object.entries(names).find(([uid]) => uid !== adminState.adminUid)?.[1] || "Conversation";
}

function getConversationEmail(convo = {}) {
    const uid = convo.studentUid || Object.keys(convo.participantIds || {}).find((id) => id !== adminState.adminUid);
    return adminState.users[uid]?.email || "";
}

function getConversationRole(convo = {}) {
    const uid = convo.studentUid || Object.keys(convo.participantIds || {}).find((id) => id !== adminState.adminUid);
    return convo.participantRoles?.[uid] || adminState.users[uid]?.userType || "student";
}

function value(id) {
    return document.getElementById(id)?.value.trim() || "";
}

function setValue(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val || "";
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value ?? "";
}

function normalize(value) {
    return String(value || "").trim().toLowerCase();
}

function hasValue(value) {
    return Array.isArray(value) ? value.length > 0 : String(value || "").trim() !== "";
}

function display(value) {
    if (!hasValue(value)) return "N/A";
    if (Array.isArray(value)) return value.join(", ");
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
}

function truncate(value, max = 120) {
    const text = display(value);
    if (text === "N/A" || text.length <= max) return text;
    return `${text.slice(0, max - 1)}...`;
}

function getTime(value, fallbackKey = "") {
    if (typeof value === "number") return value;
    const parsed = Date.parse(value || "");
    if (!Number.isNaN(parsed)) return parsed;
    return fallbackKey.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

function formatDate(value) {
    const time = getTime(value);
    return time ? new Date(time).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "N/A";
}

function formatDateTime(value) {
    const time = getTime(value);
    return time ? new Date(time).toLocaleString() : "N/A";
}

function labelize(key) {
    return key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
}

function initials(name) {
    return String(name || "NA").split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

function getDeviceType() {
    return /mobile|android|iphone/i.test(navigator.userAgent) ? "mobile" : "desktop";
}

function getBrowserName() {
    const ua = navigator.userAgent;
    if (ua.includes("Edg")) return "Edge";
    if (ua.includes("Chrome")) return "Chrome";
    if (ua.includes("Firefox")) return "Firefox";
    if (ua.includes("Safari")) return "Safari";
    return "Browser";
}

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
}

function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, "&#096;");
}
