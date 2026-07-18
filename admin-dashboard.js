import { auth, database } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { ref, get, set, update, push, remove, onValue, onDisconnect, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
import { showToast, preserveThemeOnClear } from "./auth-nav.js?v=20260614-brand";
import { initDashboardSidebar, updateSidebarUser } from "./sidebar.js";
import { ensureDashboardTopbarLayout, initDashboardNotifications, updateDashboardGreetingName } from "./dashboard-topbar.js";
import { calculateMentorRatingSummary, normalizeRatingStatus } from "./ratings.js";

const adminState = {
    users: {},
    students: {},
    mentors: {},
    institutes: {},
    courses: {},
    scholarships: {},
    pathwayResults: {},
    mentorRequests: {},
    mentorRatings: {},
    publicMentorReviews: {},
    reviewReports: {},
    mentorProfileChanges: {},
    mentorStudents: {},
    guestMessages: {},
    contactMessages: {},
    conversations: {},
    activityLogs: {},
    presence: {},
    loginHistory: {},
    notifications: {},
    savedCourses: {},
    savedScholarships: {},
    systemConnected: false,
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
        reviewSearch: "",
        reviewStatus: "",
        reviewStar: "",
        requestStatus: "all",
        activityRole: "",
        activityType: "",
        activitySearch: "",
        activityPreview: "all",
        supportTab: "guest"
    },
    pagination: {
        students: { page: 1, pageSize: 10 },
        mentors: { page: 1, pageSize: 10 },
        institutes: { page: 1, pageSize: 10 },
        admins: { page: 1, pageSize: 10 },
        mentorApprovals: { page: 1, pageSize: 10 },
        mentorReviews: { page: 1, pageSize: 10 },
        courses: { page: 1, pageSize: 10 },
        scholarships: { page: 1, pageSize: 10 },
        mentorRequests: { page: 1, pageSize: 10 },
        pathwayResults: { page: 1, pageSize: 10 },
        messages: { page: 1, pageSize: 10 },
        notifications: { page: 1, pageSize: 10 },
        loginHistory: { page: 1, pageSize: 20 },
        onlineUsers: { page: 1, pageSize: 20 }
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

const adminSections = {
    overview: { title: "Admin Dashboard" },
    "manage-students": { title: "Manage Students" },
    "manage-mentors": { title: "Manage Mentors" },
    "manage-institutes": { title: "Manage Institutes" },
    "manage-admins": { title: "Manage Admins" },
    "manage-courses": { title: "Manage Courses" },
    "manage-scholarships": { title: "Manage Scholarships" },
    "pathway-results": { title: "Pathway Results" },
    "manage-talent-categories": { title: "Talent Categories" },
    "manage-talent-opportunities": { title: "Talent Opportunities" },
    "achievement-verifications": { title: "Achievement Verifications" },
    "mentor-approvals": { title: "Mentor Approvals" },
    "mentor-profile-updates": { title: "Mentor Profile Updates" },
    "mentor-requests": { title: "Mentor Requests" },
    "mentor-reviews": { title: "Mentor Reviews" },
    "support-inbox": { title: "Support Inbox" },
    "admin-messages": { title: "Messages" },
    "admin-notifications": { title: "Notifications" },
    reports: { title: "Reports & Insights" },
    "user-activity": { title: "Activity Logs" },
    "system-settings": { title: "System Settings" },
    "system-status": { title: "System Status" }
};

document.addEventListener("DOMContentLoaded", () => {
    initDashboardSidebar();
    bindNavigation();
    bindFormsAndFilters();
    bindAdminCommandSearch();
    startAdminClock();
    validateAdminNavigation();

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
        const role = normalize(userData.userType || userData.role);
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

    document.addEventListener("click", (event) => {
        const trigger = event.target.closest("[data-section], [data-kpi-section]");
        if (!trigger) return;
        const section = trigger.dataset.section || trigger.dataset.kpiSection;
        if (!adminSections[section]) {
            console.error("[Admin Navigation] No configuration for:", section);
            return;
        }
        event.preventDefault();
        if (trigger.dataset.kpiSupportFolder) {
            supportState.activeFolder = trigger.dataset.kpiSupportFolder;
            supportState.selectedItemId = null;
            closeSupportDetail();
        }
        if (section === "support-inbox" && !trigger.dataset.kpiSupportFolder) {
            supportState.activeFolder = "guest";
            supportState.selectedItemId = null;
            closeSupportDetail();
        }
        const opened = showAdminSection(section);
        if (!opened) return;
        runSectionRender(section);
        if (trigger.dataset.quickAction === "add-course") openCourseFormForAdd();
        if (trigger.dataset.quickAction === "add-scholarship") openScholarshipFormForAdd();
    });

    document.querySelectorAll("[data-activity-preview-filter]").forEach((button) => {
        button.addEventListener("click", () => {
            adminState.filters.activityPreview = button.dataset.activityPreviewFilter || "all";
            setActiveButton("[data-activity-preview-filter]", button);
            renderRecentActivity();
        });
    });
}

function bindAdminCommandSearch() {
    const input = document.getElementById("admin-command-search");
    const list = document.getElementById("admin-command-list");
    if (!input) return;
    const commands = [
        ["Students", "manage-students"],
        ["Mentors", "manage-mentors"],
        ["Institutes", "manage-institutes"],
        ["Admins", "manage-admins"],
        ["Courses", "manage-courses"],
        ["Scholarships", "manage-scholarships"],
        ["Mentor Approvals", "mentor-approvals"],
        ["Mentor Requests", "mentor-requests"],
        ["Mentor Reviews", "mentor-reviews"],
        ["Pathway Results", "pathway-results"],
        ["Support Inbox", "support-inbox"],
        ["Messages", "admin-messages"],
        ["Notifications", "admin-notifications"],
        ["Activity Logs", "user-activity"],
        ["Reports", "reports"],
        ["Settings", "system-settings"],
        ["System Status", "system-status"]
    ];
    if (list) list.innerHTML = commands.map(([label]) => `<option value="${escapeAttr(label)}"></option>`).join("");
    input.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") return;
        const query = normalize(input.value);
        const match = commands.find(([label]) => normalize(label).includes(query) || query.includes(normalize(label)));
        if (match) {
            if (showAdminSection(match[1])) runSectionRender(match[1]);
            input.value = "";
        }
    });
    window.addEventListener("keydown", (event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === "/") {
            event.preventDefault();
            input.focus();
        }
    });
}

function runSectionRender(sectionId) {
    if (sectionId === "support-inbox") renderSupportInbox();
    if (sectionId === "admin-messages") {
        supportState.activeFolder = "conversations";
        supportState.selectedItemId = null;
        renderAdminMessages();
    }
    if (sectionId === "admin-notifications") renderAdminNotifications();
    if (sectionId === "manage-admins") renderAdmins();
    if (sectionId === "mentor-reviews") renderMentorReviews();
    if (sectionId === "mentor-profile-updates") renderMentorProfileUpdates();
    if (sectionId === "system-status") renderSystemStatus();
    if (sectionId === "manage-talent-categories") renderTalentCategories();
    if (sectionId === "manage-talent-opportunities") renderTalentOpportunities();
    if (sectionId === "achievement-verifications") renderAchievementVerifications();
}

function startAdminClock() {
    updateAdminClock();
    setInterval(updateAdminClock, 1000);
}

function updateAdminClock() {
    const now = new Date();
    const dateText = now.toLocaleDateString("en-LK", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    const timeText = now.toLocaleTimeString("en-LK", { hour: "2-digit", minute: "2-digit", hour12: true });
    setText("admin-live-date", dateText);
    setText("admin-live-time", timeText);
    setText("admin-dashboard-date", dateText);
    setText("admin-dashboard-time", timeText);
    setText("admin-greeting", adminGreeting());
    const footer = document.getElementById("admin-last-synced");
    if (footer) footer.textContent = `Last synced ${timeText}`;
}

function bindFormsAndFilters() {
    const filterBindings = [
        ["student-search", "studentSearch", "input", renderStudents, "students"],
        ["student-filter-district", "studentDistrict", "change", renderStudents, "students"],
        ["student-filter-interest", "studentInterest", "change", renderStudents, "students"],
        ["student-filter-education", "studentEducation", "change", renderStudents, "students"],
        ["student-filter-profile", "studentProfile", "change", renderStudents, "students"],
        ["student-filter-online", "studentOnline", "change", renderStudents, "students"],
        ["student-filter-status", "studentStatus", "change", renderStudents, "students"],
        ["mentor-search", "mentorSearch", "input", renderMentors, "mentors"],
        ["institute-search", "instituteSearch", "input", renderInstitutes, "institutes"],
        ["review-search", "reviewSearch", "input", renderMentorReviews, "mentorReviews"],
        ["review-status-filter", "reviewStatus", "change", renderMentorReviews, "mentorReviews"],
        ["review-star-filter", "reviewStar", "change", renderMentorReviews, "mentorReviews"],
        ["activity-role-filter", "activityRole", "change", renderActivity, "loginHistory"],
        ["activity-type-filter", "activityType", "change", renderActivity, "loginHistory"],
        ["activity-search", "activitySearch", "input", renderActivity, "loginHistory"]
    ];

    filterBindings.forEach(([id, key, eventName, render, tableKey]) => {
        document.getElementById(id)?.addEventListener(eventName, (event) => {
            adminState.filters[key] = event.target.value.trim();
            resetTablePage(tableKey);
            render();
        });
    });

    document.querySelectorAll("#request-filter-tabs .btn-filter").forEach((button) => {
        button.addEventListener("click", () => {
            setActiveButton("#request-filter-tabs .btn-filter", button);
            adminState.filters.requestStatus = button.dataset.filter || "all";
            resetTablePage("mentorRequests");
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
    document.getElementById("admin-mark-all-notifications-read")?.addEventListener("click", markAllAdminNotificationsRead);
    bindSupportInboxControls();
    bindTablePaginationControls();
    bindReviewTableActions();
    bindImagePreview("course-image-url", "course-image-preview", "images/course-placeholder.png", "Course image preview", "images");
    bindImagePreview("schol-image-url", "scholarship-image-preview", "images/scholarship-placeholder.png", "Scholarship image preview", "images");
}

function bindReviewTableActions() {
    if (document.body.dataset.reviewActionsBound === "true") return;
    document.body.dataset.reviewActionsBound = "true";
    document.addEventListener("click", (event) => {
        const detailButton = event.target.closest("[data-review-detail]");
        if (detailButton) {
            event.preventDefault();
            const [mentorUid, appointmentId] = detailButton.dataset.reviewDetail.split(":");
            openReviewDetail(mentorUid, appointmentId);
            return;
        }

        const mentorButton = event.target.closest("[data-review-mentor-detail]");
        if (mentorButton) {
            event.preventDefault();
            openDetailDrawer("Mentor Details", mentorDetails(mentorButton.dataset.reviewMentorDetail));
            return;
        }

        const statusButton = event.target.closest("[data-review-status]");
        if (statusButton) {
            event.preventDefault();
            const [mentorUid, appointmentId] = statusButton.dataset.reviewStatus.split(":");
            moderateMentorReview(mentorUid, appointmentId, statusButton.dataset.status);
        }
    });
}

function bindTablePaginationControls() {
    document.addEventListener("click", (event) => {
        const button = event.target.closest("[data-table-page]");
        if (!button) return;
        const tableKey = button.dataset.tablePage;
        const direction = button.dataset.pageDirection;
        const config = adminState.pagination[tableKey];
        if (!config) return;
        event.preventDefault();
        config.page += direction === "next" ? 1 : -1;
        rerenderPaginatedTable(tableKey);
        button.closest(".table-card")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });

    document.addEventListener("change", (event) => {
        const select = event.target.closest("[data-page-size-table]");
        if (!select) return;
        const tableKey = select.dataset.pageSizeTable;
        const config = adminState.pagination[tableKey];
        if (!config) return;
        config.pageSize = Number(select.value) || 10;
        resetTablePage(tableKey);
        rerenderPaginatedTable(tableKey);
    });
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
        ["users", "users", () => { renderAdminIdentity(); renderOverview(); renderStudents(); renderMentors(); renderInstitutes(); renderAdmins(); renderUserDirectory(); renderPathwayResults(); renderReports(); renderActivity(); renderSystemStatus(); }],
        ["students", "students", () => { renderOverview(); renderStudents(); renderPathwayResults(); renderReports(); }],
        ["mentors", "mentors", () => { renderOverview(); renderMentors(); renderMentorApprovals(); renderReports(); updateSidebarBadges(); }],
        ["institutes", "institutes", () => { renderOverview(); renderInstitutes(); renderReports(); }],
        ["courses", "courses", () => { renderOverview(); renderCourses(); renderReports(); renderSystemStatus(); }],
        ["scholarships", "scholarships", () => { renderOverview(); renderScholarships(); renderReports(); renderSystemStatus(); }],
        ["pathwayResults", "pathwayResults", () => { renderOverview(); renderStudents(); renderPathwayResults(); renderReports(); }],
        ["mentorRequests", "mentorRequests", () => { renderOverview(); renderStudents(); renderMentorRequests(); renderReports(); updateSidebarBadges(); }],
        ["mentorRatings", "mentorRatings", () => { renderOverview(); renderMentorReviews(); renderReports(); updateSidebarBadges(); }],
        ["publicMentorReviews", "publicMentorReviews", () => { renderMentorReviews(); updateSidebarBadges(); }],
        ["reviewReports", "reviewReports", () => { renderMentorReviews(); }],
        ["mentorProfileChanges", "mentorProfileChanges", () => { renderMentorProfileUpdates(); updateSidebarBadges(); }],
        ["mentorStudents", "mentorStudents", () => { renderOverview(); renderMentorRequests(); renderReports(); }],
        ["guestMessages", "guestMessages", () => { renderOverview(); renderSupportInbox(); updateSupportCounts(); updateSidebarBadges(); renderSystemStatus(); }],
        ["contactMessages", "contactMessages", () => { renderOverview(); renderSupportInbox(); updateSidebarBadges(); renderSystemStatus(); }],
        ["conversations", "conversations", () => { renderOverview(); renderSupportInbox(); renderAdminMessages(); renderUserDirectory(); updateSidebarBadges(); renderSystemStatus(); }],
        ["activityLogs", "activityLogs", () => { renderOverview(); renderActivity(); }],
        ["presence", "presence", () => { renderOverview(); renderStudents(); renderMentors(); renderAdmins(); renderActivity(); renderSystemStatus(); }],
        ["loginHistory", "loginHistory", () => { renderActivity(); renderReports(); }],
        ["notifications", "notifications", () => { updateSidebarBadges(); renderAdminNotifications(); }],
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

    onValue(ref(database, ".info/connected"), (snapshot) => {
        adminState.systemConnected = snapshot.val() === true;
        renderSystemStatus();
    });
}

function renderAdminIdentity() {
    const admin = adminState.users[adminState.adminUid] || adminState.adminUser || {};
    const fullName = admin.fullName || "EduPath Admin";
    const adminFirstName = fullName.split(" ")[0] || "Admin";
    setText("top-user-name", adminFirstName);
    setText("sidebar-user-name", fullName);
    setText("admin-first-name", adminFirstName);
    setText("admin-greeting", adminGreeting());
    setText("welcome-name", `${adminGreeting()}, ${adminFirstName}!`);
    updateSidebarUser({ fullName, role: "admin", photoURL: admin.photoURL || "" });
    updateDashboardGreetingName(fullName);
    renderProfileStrength(admin);
}

function adminGreeting() {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return "Good Morning";
    if (hour >= 12 && hour < 17) return "Good Afternoon";
    if (hour >= 17 && hour < 21) return "Good Evening";
    return "Good Night";
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
    renderAdminIdentity();
    renderPendingActions();
    renderQuickActions();
    renderAnalyticsCharts();
    renderRecentActivity();
    updateSidebarBadges();
}

function calculateStats() {
    const users = Object.entries(adminState.users).filter(([uid, user]) => !isHiddenAdminUser(uid, user)).map(([, user]) => user);
    const courses = Object.values(adminState.courses).filter((c) => normalize(c.status) !== "deleted" && normalize(c.status) !== "archived");
    const scholarships = Object.values(adminState.scholarships).filter((s) => normalize(s.status) !== "deleted" && normalize(s.status) !== "archived");
    const students = users.filter((u) => userRole(u) === "student").length;
    const mentors = users.filter((u) => userRole(u) === "mentor").length;
    const institutes = users.filter((u) => userRole(u) === "institute").length;
    const admins = users.filter((u) => userRole(u) === "admin").length;
    const pendingMentors = countWhere(adminState.mentors, (m) => normalize(m.status || "pending") === "pending");
    const approvedMentors = countWhere(adminState.mentors, (m) => normalize(m.status) === "approved");
    const onlineUsers = Object.entries(adminState.presence || {}).filter(([uid, p]) => normalize(p.state) === "online" && !isHiddenAdminUser(uid)).length;
    const activeCourses = courses.filter((c) => normalize(c.status) === "active").length;
    const activeScholarships = scholarships.filter((s) => normalize(s.status) === "active").length;
    const pathwayResults = flattenPathwayResults().length;
    const mentorRequests = Object.keys(adminState.mentorRequests).length;
    const pendingMentorRequests = countWhere(adminState.mentorRequests, (r) => normalize(r.status || "pending") === "pending");
    const acceptedMentorConnections = flattenMentorConnections().length;
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
        "kpi-online-users-card": onlineUsers,
        "kpi-total-courses": courses.length,
        "kpi-total-courses-group": courses.length,
        "kpi-active-courses": activeCourses,
        "kpi-total-scholarships": scholarships.length,
        "kpi-total-scholarships-group": scholarships.length,
        "kpi-active-scholarships": activeScholarships,
        "kpi-pathway-results": pathwayResults,
        "kpi-mentor-requests": mentorRequests,
        "kpi-pending-mentor-requests": pendingMentorRequests,
        "kpi-accepted-mentor-connections": acceptedMentorConnections,
        "kpi-pending-mentors": pendingMentors,
        "kpi-approved-mentors": approvedMentors,
        "kpi-unread-support": unreadSupport,
        "kpi-unread-support-group": unreadSupport,
        "kpi-guest-inquiries": guestInquiries,
        "admin-open-conversations": Object.keys(adminState.conversations || {}).length,
        "admin-hero-pending": pendingMentors,
        "admin-hero-pending-approvals": pendingMentors,
        "admin-notification-count": unreadSupport
    };
}

function paginateRows(rows, tableKey) {
    const config = adminState.pagination[tableKey];
    if (!config) {
        return { rows, totalRows: rows.length, totalPages: 1, currentPage: 1, startIndex: rows.length ? 1 : 0, endIndex: rows.length };
    }
    const totalRows = rows.length;
    const totalPages = Math.max(1, Math.ceil(totalRows / config.pageSize));
    config.page = Math.min(Math.max(1, config.page), totalPages);
    const start = (config.page - 1) * config.pageSize;
    const end = start + config.pageSize;
    return {
        rows: rows.slice(start, end),
        totalRows,
        totalPages,
        currentPage: config.page,
        startIndex: totalRows ? start + 1 : 0,
        endIndex: Math.min(end, totalRows)
    };
}

function resetTablePage(tableKey) {
    if (adminState.pagination[tableKey]) adminState.pagination[tableKey].page = 1;
}

function renderTablePagination(tableKey, result, tbody) {
    const tableCard = tbody?.closest(".table-card");
    if (!tableCard) return;
    let footer = tableCard.querySelector(`[data-table-footer="${tableKey}"]`);
    if (!footer) {
        footer = document.createElement("div");
        footer.className = "table-footer";
        footer.dataset.tableFooter = tableKey;
        const listActions = tableCard.querySelector(".course-list-actions");
        if (listActions) tableCard.insertBefore(footer, listActions);
        else tableCard.appendChild(footer);
    }
    const config = adminState.pagination[tableKey] || { pageSize: result.rows.length || 10 };
    footer.innerHTML = `
        <div class="table-result-summary">Showing ${result.startIndex}-${result.endIndex} of ${result.totalRows} records</div>
        <label class="table-page-size">Rows
            <select data-page-size-table="${escapeAttr(tableKey)}">
                ${[10, 20, 50].map((size) => `<option value="${size}" ${Number(config.pageSize) === size ? "selected" : ""}>${size}</option>`).join("")}
            </select>
        </label>
        <div class="table-pagination" aria-label="Table pagination">
            <button type="button" data-table-page="${escapeAttr(tableKey)}" data-page-direction="previous" ${result.currentPage <= 1 ? "disabled" : ""}>Previous</button>
            <span aria-live="polite">Page ${result.currentPage} of ${result.totalPages}</span>
            <button type="button" data-table-page="${escapeAttr(tableKey)}" data-page-direction="next" ${result.currentPage >= result.totalPages ? "disabled" : ""}>Next</button>
        </div>`;
}

function rerenderPaginatedTable(tableKey) {
    const renderers = {
        students: renderStudents,
        mentors: renderMentors,
        institutes: renderInstitutes,
        admins: renderAdmins,
        mentorApprovals: renderMentorApprovals,
        mentorReviews: renderMentorReviews,
        courses: renderCourses,
        scholarships: renderScholarships,
        mentorRequests: renderMentorRequests,
        pathwayResults: renderPathwayResults,
        messages: renderAdminMessages,
        notifications: renderAdminNotifications,
        loginHistory: renderLoginHistory,
        onlineUsers: renderOnlineUsers
    };
    renderers[tableKey]?.();
}

function contactCell(email, phone) {
    return `<div class="table-contact-cell"><strong title="${escapeAttr(display(email))}">${escapeHtml(display(email))}</strong><small title="${escapeAttr(display(phone))}">${escapeHtml(display(phone))}</small></div>`;
}

function ellipsisCell(value, maxWidth = 190) {
    return `<span class="table-cell-ellipsis" style="max-width:${maxWidth}px" title="${escapeAttr(display(value))}">${escapeHtml(display(value))}</span>`;
}

function sanitizeImageURL(value, fallback = "", defaultLocalFolder = "") {
    const raw = String(value || "").trim();
    let url = raw.replace(/\\/g, "/");
    const imagesIndex = url.toLowerCase().lastIndexOf("/images/");
    if (imagesIndex >= 0) url = url.slice(imagesIndex + 1);
    if (/^[a-z]:\/images\//i.test(url)) url = url.replace(/^[a-z]:\//i, "");
    if (!url) return fallback;
    if (url.startsWith("images/") || url.startsWith("./images/") || url.startsWith("../images/")) return url;
    if (defaultLocalFolder && /^[\w./ -]+\.(png|jpe?g|webp|gif|svg)$/i.test(url) && !/^[a-z][a-z0-9+.-]*:/i.test(url)) {
        const normalized = url.replace(/^\.?\//, "");
        return normalized.includes("/") ? `images/${normalized.replace(/^images\//, "")}` : `${defaultLocalFolder.replace(/\/$/, "")}/${normalized}`;
    }
    try {
        const parsed = new URL(url);
        if (parsed.protocol === "https:" || parsed.protocol === "http:") return parsed.href;
    } catch (error) {
        console.warn("Invalid image URL:", url);
    }
    return fallback;
}

function bindImagePreview(inputId, previewId, fallbackImage, emptyLabel = "Image preview", defaultLocalFolder = "") {
    const input = document.getElementById(inputId);
    const preview = document.getElementById(previewId);
    if (!input || !preview) return;

    function updatePreview() {
        const raw = input.value.trim();
        const imageURL = sanitizeImageURL(raw, fallbackImage, defaultLocalFolder);
        preview.classList.remove("has-error");
        if (!raw) {
            preview.classList.add("empty");
            preview.innerHTML = `<span class="admin-image-preview-placeholder">${escapeHtml(emptyLabel)}</span>`;
            return;
        }
        preview.classList.remove("empty");
        preview.innerHTML = `<img src="${escapeAttr(imageURL)}" alt="${escapeAttr(emptyLabel)}" loading="lazy">`;
        preview.querySelector("img")?.addEventListener("error", () => {
            preview.classList.add("has-error");
            preview.innerHTML = `<div class="image-preview-error"><i class="fas fa-triangle-exclamation"></i><span>Image could not be loaded.</span></div>`;
        });
    }

    input.addEventListener("input", updatePreview);
    input.addEventListener("change", updatePreview);
    input.updateImagePreview = updatePreview;
    updatePreview();
}

function refreshImagePreview(inputId) {
    document.getElementById(inputId)?.updateImagePreview?.();
}

function renderStudents() {
    const tbody = document.getElementById("admin-students-tbody");
    if (!tbody) return;
    const rows = getStudentRows().filter(matchesStudentFilters);
    updateStudentFilterOptions(getStudentRows());
    const result = paginateRows(rows, "students");
    renderTablePagination("students", result, tbody);
    if (!rows.length) return showTableEmpty(tbody, 9, "No students match the current filters.");

    tbody.innerHTML = result.rows.map((s) => `
        <tr>
            <td>${avatarCell(s, "ST")}</td>
            <td>${contactCell(s.email, s.phone)}</td>
            <td>${escapeHtml(display(s.educationLevel))}</td>
            <td>${ellipsisCell(s.interestArea, 150)}</td>
            <td>${progressMini(s.profileCompletion)}</td>
            <td><span class="badge ${s.pathwayCompleted ? "badge-success" : "badge-warning"}">${s.pathwayCompleted ? "Completed" : "Not Started"}</span></td>
            <td>${onlineBadge(s.uid)}</td>
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
        .filter(([, user]) => userRole(user) === "student")
        .filter(([uid, user]) => !isHiddenAdminUser(uid, user))
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

function isHiddenAdminUser(uid, user = adminState.users[uid] || {}) {
    const student = adminState.students[uid] || {};
    const role = normalize(user.userType || user.role || student.userType || student.role || "");
    const searchable = normalize([
        uid,
        user.fullName,
        student.fullName,
        user.email,
        student.email,
        user.phone,
        student.phone
    ].filter(Boolean).join(" "));
    const knownRole = ["student", "mentor", "institute", "admin"].includes(role);
    const testAccount = searchable.includes("test student") || searchable.includes("antigravity");
    return !knownRole || testAccount;
}

function isAntigravityStudent(uid, user = {}) {
    return isHiddenAdminUser(uid, user);
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
    const result = paginateRows(rows, "mentors");
    renderTablePagination("mentors", result, tbody);
    if (!rows.length) return showTableEmpty(tbody, 8, "No mentors found.");

    tbody.innerHTML = result.rows.map((m) => `
        <tr>
            <td>${avatarCell(m, "MT")}</td>
            <td>${ellipsisCell(m.field || m.mentoringField || m.mentorType, 150)}</td>
            <td>${ellipsisCell(m.universityOrCompany || m.organization, 160)}</td>
            <td><span class="badge ${statusBadgeClass(m.status || "pending")}">${escapeHtml(normalize(m.status || "pending"))}</span></td>
            <td>${ellipsisCell(m.availability || m.availableTime || m.availabilityStatus, 140)}</td>
            <td>${progressMini(m.profileCompletion)}</td>
            <td>${onlineBadge(m.uid)}</td>
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
        .filter(([, user]) => userRole(user) === "mentor")
        .filter(([uid, user]) => !isHiddenAdminUser(uid, user))
        .map(([uid, user]) => ({ uid, ...user, ...(adminState.mentors[uid] || {}), email: user.email, fullName: user.fullName, photoURL: user.photoURL || adminState.mentors[uid]?.photoURL }))
        .sort((a, b) => getTime(b.createdAt) - getTime(a.createdAt));
}

function renderInstitutes() {
    const tbody = document.getElementById("admin-institutes-tbody");
    if (!tbody) return;
    let rows = getInstituteRows();
    const q = normalize(adminState.filters.instituteSearch);
    if (q) rows = rows.filter((i) => normalize(`${i.instituteName} ${i.fullName} ${i.email} ${i.phone} ${i.district}`).includes(q));
    const result = paginateRows(rows, "institutes");
    renderTablePagination("institutes", result, tbody);
    if (!rows.length) return showTableEmpty(tbody, 7, "No institutes found.");

    tbody.innerHTML = result.rows.map((i) => `
        <tr>
            <td>${avatarCell({ ...i, fullName: i.instituteName || i.fullName }, "IN")}</td>
            <td>${contactCell(i.email, i.phone)}</td>
            <td>${escapeHtml(display(i.district))}</td>
            <td><span class="badge ${statusBadgeClass(i.verificationStatus || i.status || "pending")}">${escapeHtml(normalize(i.verificationStatus || i.status || "pending"))}</span></td>
            <td>${Object.values(adminState.courses).filter((c) => c.instituteUid === i.uid).length}</td>
            <td><span class="badge ${accountBadgeClass(i.accountStatus || i.status || "active")}">${escapeHtml(normalize(i.accountStatus || i.status || "active"))}</span></td>
            <td class="action-btns">
                <button class="btn btn-sm btn-info" data-view-institute="${i.uid}">View</button>
                <button class="btn btn-sm btn-success" data-approve-institute="${i.uid}">Approve</button>
                <button class="btn btn-sm btn-warning" data-reject-institute="${i.uid}">Reject</button>
                <button class="btn btn-sm btn-primary" data-message-user="${i.uid}">Message</button>
                <button class="btn btn-sm ${normalize(i.accountStatus) === "suspended" ? "btn-success" : "btn-danger"}" data-toggle-account="${i.uid}">${normalize(i.accountStatus) === "suspended" ? "Reactivate" : "Suspend"}</button>
            </td>
        </tr>
    `).join("");
    bindRowActions(tbody);
}

function renderAdmins() {
    const tbody = document.getElementById("admin-admins-tbody");
    if (!tbody) return;
    const rows = Object.entries(adminState.users)
        .filter(([, user]) => userRole(user) === "admin")
        .filter(([uid, user]) => !isHiddenAdminUser(uid, user) || uid === adminState.adminUid)
        .map(([uid, user]) => ({ uid, ...user }))
        .sort((a, b) => String(a.fullName || a.email || "").localeCompare(String(b.fullName || b.email || "")));
    const result = paginateRows(rows, "admins");
    renderTablePagination("admins", result, tbody);
    if (!rows.length) return showTableEmpty(tbody, 6, "No admin accounts found.");
    tbody.innerHTML = result.rows.map((admin) => `
        <tr>
            <td>${avatarCell(admin, "AD")}</td>
            <td>${contactCell(admin.email, admin.phone)}</td>
            <td><span class="badge ${accountBadgeClass(admin.accountStatus)}">${escapeHtml(normalize(admin.accountStatus || "active"))}</span></td>
            <td>${onlineBadge(admin.uid)}</td>
            <td>${formatDate(admin.createdAt)}</td>
            <td class="action-btns"><button class="btn btn-sm btn-info" data-view-admin="${admin.uid}">View</button></td>
        </tr>
    `).join("");
    tbody.querySelectorAll("[data-view-admin]").forEach((btn) => btn.addEventListener("click", () => openDetailDrawer("Admin Details", adminDetails(btn.dataset.viewAdmin))));
}

function getInstituteRows() {
    return Object.entries(adminState.users)
        .filter(([, user]) => userRole(user) === "institute")
        .filter(([uid, user]) => !isHiddenAdminUser(uid, user))
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
    const rows = getMentorRows().filter((m) => ["submitted", "under_review", "pending"].includes(normalize(m.approvalStatus || m.applicationStatus || m.status || "pending")));
    const result = paginateRows(rows, "mentorApprovals");
    renderTablePagination("mentorApprovals", result, tbody);
    if (!rows.length) return showTableEmpty(tbody, 7, "No pending mentor approvals.");

    tbody.innerHTML = result.rows.map((m) => `
        <tr>
            <td>${avatarCell(m, "MT")}</td>
            <td>${ellipsisCell(m.field || m.mentoringField, 150)}</td>
            <td>${ellipsisCell(m.universityOrCompany || m.organization, 160)}</td>
            <td><span class="badge ${statusBadgeClass(m.approvalStatus || m.status || "pending")}">${escapeHtml((m.approvalStatus || m.status || "pending").replace(/_/g, " "))}</span></td>
            <td>${ellipsisCell(m.availableTime || m.availability, 150)}</td>
            <td>${progressMini(m.profileCompletion)}</td>
            <td class="action-btns">
                <button class="btn btn-sm btn-info" data-view-mentor="${m.uid}">View</button>
                <button class="btn btn-sm btn-primary" data-review-mentor="${m.uid}">Start Review</button>
                <button class="btn btn-sm btn-success" data-approve-mentor="${m.uid}">Approve</button>
                <button class="btn btn-sm btn-warning" data-changes-mentor="${m.uid}">Request Changes</button>
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
    const result = paginateRows(rows, "courses");
    renderTablePagination("courses", result, tbody);
    if (!rows.length) return showTableEmpty(tbody, 7, "No courses added yet.");

    tbody.innerHTML = result.rows.map((c) => `
        <tr>
            <td><strong>${ellipsisCell(c.courseName || c.name, 190)}</strong></td>
            <td>${ellipsisCell(c.instituteName || c.institute, 170)}</td>
            <td>${ellipsisCell(c.category, 130)}</td>
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
        imageURL: sanitizeImageURL(value("course-image-url"), "", "images"),
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
    refreshImagePreview("course-image-url");
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
    refreshImagePreview("course-image-url");
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
    const result = paginateRows(rows, "scholarships");
    renderTablePagination("scholarships", result, tbody);
    if (!rows.length) return showTableEmpty(tbody, 7, "No scholarships added yet.");

    tbody.innerHTML = result.rows.map((s) => `
        <tr>
            <td><strong>${ellipsisCell(s.scholarshipName || s.name, 190)}</strong></td>
            <td>${ellipsisCell(s.provider, 160)}</td>
            <td>${ellipsisCell(s.category, 130)}</td>
            <td>${escapeHtml(display(s.deadline))}</td>
            <td>${ellipsisCell(s.supportType || s.amount, 130)}</td>
            <td><span class="badge ${statusBadgeClass(s.status)}">${escapeHtml(normalize(s.status || "draft"))}</span></td>
            <td class="action-btns">
                <button class="btn btn-sm btn-info" data-view-scholarship="${s.id}">View</button>
                ${(normalize(s.status) === "pending" || normalize(s.status) === "pending approval" || normalize(s.status) === "pending_approval") ? `
                    <button class="btn btn-sm btn-success" data-scholarship-status="${s.id}" data-status="active">Approve</button>
                    <button class="btn btn-sm btn-danger" data-scholarship-reject="${s.id}">Reject</button>
                ` : `
                    <button class="btn btn-sm btn-primary" data-edit-scholarship="${s.id}">Edit</button>
                    ${normalize(s.status) === "active" ? `
                        <button class="btn btn-sm btn-warning" data-scholarship-status="${s.id}" data-status="inactive">Deactivate</button>
                    ` : `
                        <button class="btn btn-sm btn-success" data-scholarship-status="${s.id}" data-status="active">Activate</button>
                    `}
                    <button class="btn btn-sm btn-danger" data-scholarship-status="${s.id}" data-status="archived">Archive</button>
                `}
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
        imageURL: sanitizeImageURL(value("schol-image-url"), "", "images"),
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
    refreshImagePreview("schol-image-url");
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
    refreshImagePreview("schol-image-url");
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
    const result = paginateRows(rows, "pathwayResults");
    renderTablePagination("pathwayResults", result, tbody);
    if (!rows.length) return showTableEmpty(tbody, 8, "No pathway results submitted yet.");
    tbody.innerHTML = result.rows.map((r) => {
        const user = adminState.users[r.uid] || {};
        const student = adminState.students[r.uid] || {};
        return `
            <tr>
                <td>${avatarCell({ fullName: user.fullName || r.studentName, photoURL: user.photoURL || student.photoURL }, "ST")}</td>
                <td>${escapeHtml(display(r.educationLevel || r.basicProfile?.currentEducationLevel || student.educationLevel))}</td>
                <td>${ellipsisCell(r.interestArea || r.interests?.interestAreas?.[0], 150)}</td>
                <td>${ellipsisCell(r.recommendedPathway || r.futureGoal || r.goals?.dreamCareer || r.goals?.futurePreference?.[0], 190)}</td>
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
    const result = paginateRows(rows, "mentorRequests");
    renderTablePagination("mentorRequests", result, tbody);
    if (!rows.length) return showTableEmpty(tbody, 6, "No mentor requests found.");

    tbody.innerHTML = result.rows.map((r) => `
        <tr>
            <td>${escapeHtml(display(r.studentName || adminState.users[r.studentUid]?.fullName))}</td>
            <td>${escapeHtml(display(r.mentorName || adminState.users[r.mentorUid]?.fullName))}</td>
            <td>${formatDate(r.createdAt)}</td>
            <td><span class="badge ${statusBadgeClass(r.status)}">${escapeHtml(normalize(r.status || "pending"))}</span></td>
            <td>${formatDate(r.acceptedAt || r.rejectedAt || r.updatedAt)}</td>
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

function renderMentorReviews() {
    const tbody = document.getElementById("admin-reviews-tbody");
    if (!tbody) return;
    let rows = flattenMentorReviews();
    const filters = adminState.filters;
    const queryText = normalize(filters.reviewSearch);
    if (queryText) {
        rows = rows.filter((row) => normalize(`${row.mentorName} ${row.studentName} ${row.review}`).includes(queryText));
    }
    if (filters.reviewStatus) {
        rows = rows.filter((row) => normalizeRatingStatus(row.reviewStatus) === normalizeRatingStatus(filters.reviewStatus));
    }
    if (filters.reviewStar) {
        rows = rows.filter((row) => Number(row.overallRating) === Number(filters.reviewStar));
    }
    rows.sort((a, b) => getTime(b.createdAt || b.updatedAt, b.appointmentId) - getTime(a.createdAt || a.updatedAt, a.appointmentId));
    const result = paginateRows(rows, "mentorReviews");
    renderTablePagination("mentorReviews", result, tbody);
    if (!rows.length) return showTableEmpty(tbody, 6, "No mentor reviews found.");

    tbody.innerHTML = result.rows.map((row) => {
        const status = normalizeRatingStatus(row.reviewStatus || "pending");
        const isPublished = status === "published";
        const isHidden = status === "hidden";
        const statusLabel = isPublished ? "Approved" : status.replace(/_/g, " ");
        return `
            <tr>
                <td>${avatarCell({ fullName: row.mentorName, email: row.mentorEmail || row.mentorUid, photoURL: adminState.users[row.mentorUid]?.photoURL || adminState.mentors[row.mentorUid]?.photoURL || "" }, "Mentor")}</td>
                <td><button type="button" class="table-link-button" data-review-detail="${escapeAttr(row.mentorUid)}:${escapeAttr(row.appointmentId)}"><strong>${escapeHtml(display(row.overallRating))}/5</strong><small>${row.isVerified ? "Verified session" : "Unverified"}</small></button></td>
                <td>${ellipsisCell(row.review || "No written review", 300)}<br><small class="text-muted">By ${escapeHtml(display(row.studentName))}</small></td>
                <td><span class="badge ${statusBadgeClass(status)}">${escapeHtml(statusLabel)}</span></td>
                <td>${formatDate(row.createdAt || row.updatedAt)}</td>
                <td class="action-btns">
                    <button class="btn btn-sm btn-info" data-review-mentor-detail="${escapeAttr(row.mentorUid)}">Mentor</button>
                    ${isPublished ? "" : `<button class="btn btn-sm btn-primary" data-review-status="${escapeAttr(row.mentorUid)}:${escapeAttr(row.appointmentId)}" data-status="published">Approve</button>`}
                    <button class="btn btn-sm btn-warning" data-review-status="${escapeAttr(row.mentorUid)}:${escapeAttr(row.appointmentId)}" data-status="hidden" ${isHidden ? "disabled" : ""}>Hide</button>
                    <button class="btn btn-sm btn-danger" data-review-status="${escapeAttr(row.mentorUid)}:${escapeAttr(row.appointmentId)}" data-status="rejected">Reject</button>
                </td>
            </tr>
        `;
    }).join("");
    bindRowActions(tbody);
}

function flattenMentorReviews() {
    return Object.entries(adminState.mentorRatings || {}).flatMap(([mentorUid, ratings]) =>
        Object.entries(ratings || {}).map(([appointmentId, rating]) => {
            const mentor = adminState.users[mentorUid] || adminState.mentors[mentorUid] || {};
            const student = adminState.users[rating.studentUid] || adminState.students[rating.studentUid] || {};
            const report = adminState.reviewReports?.[mentorUid]?.[appointmentId] || adminState.reviewReports?.[rating.studentUid]?.[appointmentId] || null;
            return {
                mentorUid,
                appointmentId,
                ...rating,
                reviewStatus: report && normalizeRatingStatus(rating.reviewStatus) === "published" ? "reported" : (rating.reviewStatus || "pending"),
                mentorName: rating.mentorName || mentor.fullName || "Mentor",
                mentorEmail: mentor.email || "",
                studentName: rating.studentName || student.fullName || "Student"
            };
        })
    );
}

function getReviewRow(mentorUid, appointmentId) {
    return flattenMentorReviews().find((row) => row.mentorUid === mentorUid && row.appointmentId === appointmentId) || null;
}

function flattenMentorProfileUpdates() {
    return Object.entries(adminState.mentorProfileChanges || {}).flatMap(([mentorUid, changes]) =>
        Object.entries(changes || {}).map(([changeId, change]) => {
            const mentor = adminState.users[mentorUid] || adminState.mentors[mentorUid] || {};
            return { mentorUid, changeId, mentorName: mentor.fullName || change.mentorName || "Mentor", mentorEmail: mentor.email || "", mentorPhoto: mentor.photoURL || adminState.mentors[mentorUid]?.photoURL || "", ...change };
        })
    ).sort((a, b) => getTime(b.createdAt) - getTime(a.createdAt));
}

function renderMentorProfileUpdates() {
    const tbody = document.getElementById("admin-profile-updates-tbody");
    if (!tbody) return;
    const rows = flattenMentorProfileUpdates();
    if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4">No mentor profile updates recorded.</td></tr>`;
        return;
    }
    tbody.innerHTML = rows.map((row) => {
        const changedCount = Object.keys(row.changedFields || {}).length;
        return `<tr>
            <td>${avatarCell({ fullName: row.mentorName, email: row.mentorEmail || row.mentorUid, photoURL: row.mentorPhoto }, "Mentor")}</td>
            <td><strong>${changedCount}</strong><small>${Object.keys(row.changedFields || {}).slice(0, 3).map(display).join(", ")}</small></td>
            <td><span class="badge ${row.requiresAdminReview ? "badge-warning" : "badge-success"}">${row.requiresAdminReview ? "Critical" : "Normal"}</span></td>
            <td>${escapeHtml(formatDate(row.createdAt))}</td>
            <td><span class="badge badge-info">${escapeHtml(display(row.status || "recorded"))}</span></td>
            <td><div class="action-btns">
                <button class="btn btn-sm btn-primary" data-view-profile-update="${escapeAttr(row.mentorUid)}:${escapeAttr(row.changeId)}">View Changes</button>
                <button class="btn btn-sm btn-success" data-profile-update-reviewed="${escapeAttr(row.mentorUid)}:${escapeAttr(row.changeId)}">Mark Reviewed</button>
                <button class="btn btn-sm btn-outline" data-view-mentor="${escapeAttr(row.mentorUid)}">Mentor</button>
                <button class="btn btn-sm btn-outline" data-message-user="${escapeAttr(row.mentorUid)}">Contact</button>
            </div></td>
        </tr>`;
    }).join("");
    bindRowActions(tbody);
}

function viewMentorProfileUpdate(value = "") {
    const [mentorUid, changeId] = value.split(":");
    const change = adminState.mentorProfileChanges?.[mentorUid]?.[changeId];
    if (!change) return showToast("Profile update record not found.", "error");
    const fieldRows = Object.keys(change.changedFields || {}).map((field) => ({
        Field: display(field),
        Previous: displayVal(change.previousValues?.[field] || "Not provided"),
        New: displayVal(change.newValues?.[field] || "Not provided")
    }));
    openDetailDrawer("Mentor Profile Update", objectDetails({
        mentorName: change.mentorName || adminState.users[mentorUid]?.fullName || "Mentor",
        mentorUid,
        changeId,
        requiresAdminReview: change.requiresAdminReview === true ? "Yes" : "No",
        status: change.status || "recorded",
        createdAt: formatDate(change.createdAt),
        changedFields: fieldRows
    }));
}

async function markMentorProfileUpdateReviewed(value = "") {
    const [mentorUid, changeId] = value.split(":");
    if (!mentorUid || !changeId) return;
    await update(ref(database), {
        [`mentorProfileChanges/${mentorUid}/${changeId}/status`]: "reviewed",
        [`mentorProfileChanges/${mentorUid}/${changeId}/reviewedAt`]: serverTimestamp(),
        [`mentorProfileChanges/${mentorUid}/${changeId}/reviewedBy`]: adminState.adminUid
    });
    showToast("Mentor profile update marked reviewed.", "success");
}

function openReviewDetail(mentorUid, appointmentId) {
    const review = getReviewRow(mentorUid, appointmentId);
    if (!review) return showToast("Review details are unavailable. Please refresh and try again.", "error");
    const status = normalizeRatingStatus(review.reviewStatus || "pending").replace(/_/g, " ");
    openDetailDrawer("Mentor Review Details", `
        ${groupedDetails({
            Session: ["mentorName", "studentName", "appointmentId", "reviewStatus", "createdAt", "updatedAt"],
            Ratings: ["overallRating", "communicationRating", "knowledgeRating", "helpfulnessRating", "professionalismRating", "wouldRecommend"],
            Moderation: ["isVerified", "displayPreference", "studentDisplayName", "moderatedAt", "moderatedBy"]
        }, { ...review, reviewStatus: status })}
        <section class="drawer-group">
            <h3>Written Review</h3>
            <p>${escapeHtml(review.review || "No written review was submitted.")}</p>
        </section>
    `);
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
        .filter(([uid, user]) => !isHiddenAdminUser(uid, user))
        .sort(([, a], [, b]) => display(a.fullName).localeCompare(display(b.fullName)))
        .map(([uid, user]) => `<option value="${escapeAttr(uid)}">${escapeHtml(display(user.fullName))} - ${escapeHtml(display(user.email))} (${escapeHtml(display(user.userType))})</option>`)
        .join("");
    select.innerHTML = `<option value="">Select registered user...</option>${options}`;
    select.value = current;
}

async function sendAdminMessage(event) {
    event.preventDefault();
    const selectedConversation = adminState.conversations[adminState.selectedConversationId] || {};
    const receiverUid = value("message-recipient") || selectedConversation.studentUid || selectedConversation.userUid;
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
    updates[`conversations/${conversationId}/userUid`] = receiverUid;
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
        targetUserUid: receiverUid,
        targetRole: normalize(receiver.userType || "student") || "student",
        senderUid: adminState.adminUid,
        senderRole: "admin",
        type: "admin_support_reply",
        title: "New message from EduPath Admin",
        message: subject,
        messagePreview: message.slice(0, 140),
        relatedEntityType: "conversation",
        relatedEntityId: conversationId,
        conversationId,
        targetPage: `${normalize(receiver.userType || "student") || "student"}-dashboard.html`,
        targetSection: normalize(receiver.userType || "student") === "mentor" ? "support" : "support-section",
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
    if (isHiddenAdminUser(uid, user)) return null;
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
    const preview = document.getElementById("recent-activity-list");
    const full = document.getElementById("full-activity-list");
    let rows = Object.entries(adminState.activityLogs)
        .map(([id, log]) => ({ id, ...log }))
        .filter((log) => !isHiddenActivityLog(log))
        .sort((a, b) => getTime(b.createdAt) - getTime(a.createdAt));
    updateActivityTypeOptions(rows);
    const q = normalize(adminState.filters.activitySearch);
    const fullRows = rows
        .filter((log) => !q || normalize(`${log.userName} ${log.actionType} ${log.description}`).includes(q))
        .filter((log) => !adminState.filters.activityRole || normalize(log.userRole) === adminState.filters.activityRole)
        .filter((log) => !adminState.filters.activityType || normalize(log.actionType) === adminState.filters.activityType);
    if (full) {
        if (!fullRows.length) showEmpty(full, "No meaningful activity has been logged yet.");
        else full.innerHTML = fullRows.slice(0, 80).map(activityItem).join("");
    }
    if (!preview) return;
    const previewFilter = adminState.filters.activityPreview || "all";
    const previewRows = rows.filter((log) => matchesActivityPreviewFilter(log, previewFilter)).slice(0, 8);
    if (!previewRows.length) {
        preview.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-muted">No recent platform activity.</td></tr>`;
        return;
    }
    preview.innerHTML = previewRows.map(activityTableRow).join("");
}

function matchesActivityPreviewFilter(log = {}, filter = "all") {
    if (filter === "all") return true;
    const text = normalize(`${log.actionType || ""} ${log.description || ""} ${log.status || ""}`);
    if (filter === "login") return text.includes("login") || text.includes("logout");
    if (filter === "signup") return text.includes("signup") || text.includes("registered") || text.includes("sign up");
    if (filter === "request") return text.includes("request");
    if (filter === "message") return text.includes("message") || text.includes("support");
    if (filter === "approval") return text.includes("approval") || text.includes("approved") || text.includes("rejected");
    return true;
}

function activityTableRow(log = {}) {
    const status = activityStatus(log);
    return `<tr>
        <td><span class="activity-title"><i class="fas ${activityIcon(log)}"></i>${escapeHtml(display(log.actionType || "Activity"))}</span></td>
        <td>${escapeHtml(display(log.userName || "System"))}</td>
        <td>${escapeHtml(display(log.userRole || "system"))}</td>
        <td>${ellipsisCell(log.description || "Updated platform data", 220)}</td>
        <td>${formatDateTime(log.createdAt)}</td>
        <td><span class="status-chip ${status}">${escapeHtml(labelize(status))}</span></td>
    </tr>`;
}

function activityIcon(log = {}) {
    const text = normalize(`${log.actionType || ""} ${log.description || ""}`);
    if (text.includes("login")) return "fa-right-to-bracket";
    if (text.includes("signup") || text.includes("register")) return "fa-user-plus";
    if (text.includes("message") || text.includes("support")) return "fa-message";
    if (text.includes("approve")) return "fa-circle-check";
    if (text.includes("request")) return "fa-user-clock";
    return "fa-bolt";
}

function activityStatus(log = {}) {
    const text = normalize(`${log.status || ""} ${log.actionType || ""} ${log.description || ""}`);
    if (text.includes("reject") || text.includes("error") || text.includes("fail")) return "rejected";
    if (text.includes("pending")) return "pending";
    if (text.includes("open") || text.includes("new")) return "open";
    if (text.includes("logout")) return "logout";
    if (text.includes("approve") || text.includes("success") || text.includes("login") || text.includes("complete")) return "success";
    return "open";
}

function isHiddenActivityLog(log = {}) {
    const uid = log.userUid || log.uid || log.actorUid;
    if (uid && isHiddenAdminUser(uid)) return true;
    const role = normalize(log.userRole);
    const searchable = normalize(`${log.userName || ""} ${log.description || ""}`);
    const knownRole = ["student", "mentor", "institute", "admin", "guest"].includes(role);
    return !knownRole || searchable.includes("test student") || searchable.includes("antigravity") || searchable.includes("unknown user");
}

function renderLoginHistory() {
    const tbody = document.getElementById("login-history-tbody");
    if (!tbody) return;
    const rows = Object.entries(adminState.loginHistory)
        .filter(([uid]) => !isHiddenAdminUser(uid))
        .flatMap(([uid, records]) => Object.entries(records || {}).map(([id, item]) => ({ uid, id, ...item })))
        .sort((a, b) => getTime(b.loginAt) - getTime(a.loginAt));
    const result = paginateRows(rows, "loginHistory");
    renderTablePagination("loginHistory", result, tbody);
    if (!rows.length) return showTableEmpty(tbody, 6, "No login history yet.");
    tbody.innerHTML = result.rows.map((r) => {
        const user = adminState.users[r.uid] || {};
        return `<tr><td>${escapeHtml(display(user.fullName))}</td><td>${escapeHtml(display(user.userType))}</td><td>${formatDateTime(r.loginAt)}</td><td>${formatDateTime(r.logoutAt)}</td><td><span class="badge ${statusBadgeClass(r.sessionStatus)}">${escapeHtml(display(r.sessionStatus))}</span></td><td>${ellipsisCell(`${display(r.deviceType)} / ${display(r.browserName)}`, 190)}</td></tr>`;
    }).join("");
}

function renderOnlineUsers() {
    const tbody = document.getElementById("online-users-tbody");
    if (!tbody) return;
    const rows = Object.entries(adminState.presence).filter(([uid, p]) => normalize(p.state) === "online" && !isHiddenAdminUser(uid));
    const result = paginateRows(rows, "onlineUsers");
    renderTablePagination("onlineUsers", result, tbody);
    if (!rows.length) return showTableEmpty(tbody, 4, "No users online right now.");
    tbody.innerHTML = result.rows.map(([uid, p]) => {
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
    const visibleUsers = Object.entries(adminState.users).filter(([uid, user]) => !isHiddenAdminUser(uid, user)).map(([, user]) => user);
    const reports = [
        ["Users by Role", countBy(visibleUsers, (u) => normalize(u.userType))],
        ["Students by District", countBy(students, (s) => s.district || "N/A")],
        ["Students by Interest Area", countBy(students, (s) => s.interestArea || "N/A")],
        ["Popular Future Goals", countBy(students, (s) => s.futureGoal || "N/A")],
        ["Popular Course Categories", countBy(Object.values(adminState.courses), (c) => c.category || "N/A")],
        ["Mentor Approval Status", countBy(mentors, (m) => normalize(m.status || "pending"))],
        ["Mentor Request Status", countBy(Object.values(adminState.mentorRequests), (r) => normalize(r.status || "pending"))],
        ["Mentor Request Summary", {
            Total: Object.keys(adminState.mentorRequests || {}).length,
            Pending: countWhere(adminState.mentorRequests, (r) => normalize(r.status || "pending") === "pending"),
            Accepted: countWhere(adminState.mentorRequests, (r) => normalize(r.status) === "accepted"),
            Rejected: countWhere(adminState.mentorRequests, (r) => normalize(r.status) === "rejected"),
            Connections: flattenMentorConnections().length
        }],
        ["Mentor Connections", countBy(flattenMentorConnections(), (connection) => connection.mentorName || adminState.users[connection.mentorUid]?.fullName || "Mentor")],
        ["Active vs Inactive Courses", countBy(Object.values(adminState.courses), (c) => normalize(c.status || "draft"))],
        ["Scholarship Deadline Summary", summarizeDeadlines(Object.values(adminState.scholarships))],
        ["Support Message Volume", { Conversations: Object.keys(adminState.conversations).length, Guests: Object.keys({ ...adminState.contactMessages, ...adminState.guestMessages }).length }]
    ];
    const avgProfile = students.length ? Math.round(students.reduce((sum, s) => sum + Number(s.profileCompletion || 0), 0) / students.length) : 0;
    reports.push(["Profile Completion Average", { Average: avgProfile }]);
    reports.push(["Students Needing Scholarships", { Students: students.filter((s) => /scholarship|free|low.?cost|financial/i.test(s.financialSupport || "")).length }]);
    reports.push(["Pathway Score Distribution", scoreDistribution(flattenPathwayResults())]);
    reports.push(["Login Activity Trend", { Sessions: Object.entries(adminState.loginHistory).filter(([uid]) => !isHiddenAdminUser(uid)).reduce((sum, [, records]) => sum + Object.keys(records || {}).length, 0) }]);
    container.innerHTML = reports.map(([title, data]) => reportCard(title, data)).join("");
}

function renderAnalyticsCharts() {
    const days = recentDayKeys(7);
    const users = Object.entries(adminState.users)
        .filter(([uid, user]) => !isHiddenAdminUser(uid, user))
        .map(([, user]) => user);
    const userSeries = countRowsByDay(users, days, (item) => item.createdAt || item.registeredAt || item.lastLoginAt);
    const courseEvents = [
        ...Object.values(adminState.courses || {}),
        ...Object.values(adminState.savedCourses || {}).flatMap((records) => Object.values(records || {}))
    ];
    const courseSeries = countRowsByDay(courseEvents, days, (item) => item.savedAt || item.createdAt || item.updatedAt);
    const supportEvents = [
        ...Object.values(adminState.guestMessages || {}),
        ...Object.values(adminState.contactMessages || {}),
        ...Object.values(adminState.conversations || {}),
        ...Object.values(adminState.conversations || {}).flatMap((conversation) => Object.values(conversation.messages || {}))
    ];
    const supportSeries = countRowsByDay(supportEvents, days, (item) => item.createdAt || item.lastMessageAt || item.updatedAt);
    renderMiniChart("chart-users", "chart-users-total", days, userSeries, "#2563eb");
    renderMiniChart("chart-courses", "chart-courses-total", days, courseSeries, "#16a34a");
    renderMiniChart("chart-support", "chart-support-total", days, supportSeries, "#ef4444");
}

function recentDayKeys(count = 7) {
    return Array.from({ length: count }, (_, index) => {
        const date = new Date();
        date.setDate(date.getDate() - (count - 1 - index));
        return date.toISOString().slice(0, 10);
    });
}

function countRowsByDay(rows, days, getter) {
    const counts = Object.fromEntries(days.map((day) => [day, 0]));
    rows.forEach((row) => {
        const time = getTime(getter(row));
        if (!time) return;
        const key = new Date(time).toISOString().slice(0, 10);
        if (key in counts) counts[key] += 1;
    });
    return days.map((day) => counts[day] || 0);
}

function renderMiniChart(containerId, totalId, days, values, color) {
    const container = document.getElementById(containerId);
    const total = values.reduce((sum, value) => sum + value, 0);
    setText(totalId, formatNumber(total));
    if (!container) return;
    const max = Math.max(1, ...values);
    const points = values.map((value, index) => {
        const x = 12 + index * (276 / Math.max(1, values.length - 1));
        const y = 112 - (value / max) * 82;
        return [x, y];
    });
    const path = points.map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
    const area = `${path} L288 120 L12 120 Z`;
    container.innerHTML = `<svg viewBox="0 0 300 140" role="img" aria-label="Last 7 days chart">
        <path d="${area}" fill="${color}" opacity="0.1"></path>
        <path d="${path}" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"></path>
        ${points.map(([x, y]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="${color}"></circle>`).join("")}
        ${days.map((day, index) => `<text x="${(12 + index * (276 / Math.max(1, days.length - 1))).toFixed(1)}" y="136" text-anchor="middle">${escapeHtml(new Date(`${day}T00:00:00`).toLocaleDateString(undefined, { weekday: "short" }).slice(0, 3))}</text>`).join("")}
    </svg>`;
}

function bindRowActions(root) {
    root.querySelectorAll("[data-view-student]").forEach((btn) => btn.addEventListener("click", () => openDetailDrawer("Student Details", studentDetails(btn.dataset.viewStudent))));
    root.querySelectorAll("[data-view-mentor]").forEach((btn) => btn.addEventListener("click", () => openDetailDrawer("Mentor Details", mentorDetails(btn.dataset.viewMentor))));
    root.querySelectorAll("[data-view-institute]").forEach((btn) => btn.addEventListener("click", () => openDetailDrawer("Institute Details", instituteDetails(btn.dataset.viewInstitute))));
    root.querySelectorAll("[data-approve-institute]").forEach((btn) => btn.addEventListener("click", () => updateInstituteApproval(btn.dataset.approveInstitute, "approved")));
    root.querySelectorAll("[data-reject-institute]").forEach((btn) => btn.addEventListener("click", () => updateInstituteApproval(btn.dataset.rejectInstitute, "rejected")));
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
    root.querySelectorAll("[data-review-mentor]").forEach((btn) => btn.addEventListener("click", () => startMentorReview(btn.dataset.reviewMentor)));
    root.querySelectorAll("[data-view-profile-update]").forEach((btn) => btn.addEventListener("click", () => viewMentorProfileUpdate(btn.dataset.viewProfileUpdate)));
    root.querySelectorAll("[data-profile-update-reviewed]").forEach((btn) => btn.addEventListener("click", () => markMentorProfileUpdateReviewed(btn.dataset.profileUpdateReviewed)));
    root.querySelectorAll("[data-changes-mentor]").forEach((btn) => btn.addEventListener("click", () => requestMentorChanges(btn.dataset.changesMentor)));
    root.querySelectorAll("[data-reject-mentor]").forEach((btn) => btn.addEventListener("click", () => rejectMentor(btn.dataset.rejectMentor)));
    root.querySelectorAll("[data-edit-course]").forEach((btn) => btn.addEventListener("click", () => editCourse(btn.dataset.editCourse)));
    root.querySelectorAll("[data-view-course]").forEach((btn) => btn.addEventListener("click", () => openDetailDrawer("Course Details", objectDetails(adminState.courses[btn.dataset.viewCourse]))));
    root.querySelectorAll("[data-course-status]").forEach((btn) => btn.addEventListener("click", () => updateCourseStatus(btn.dataset.courseStatus, btn.dataset.status)));
    root.querySelectorAll("[data-edit-scholarship]").forEach((btn) => btn.addEventListener("click", () => editScholarship(btn.dataset.editScholarship)));
    root.querySelectorAll("[data-view-scholarship]").forEach((btn) => btn.addEventListener("click", () => openDetailDrawer("Scholarship Details", objectDetails(adminState.scholarships[btn.dataset.viewScholarship]))));
    root.querySelectorAll("[data-scholarship-status]").forEach((btn) => btn.addEventListener("click", () => updateScholarshipStatus(btn.dataset.scholarshipStatus, btn.dataset.status)));
    root.querySelectorAll("[data-scholarship-reject]").forEach((btn) => btn.addEventListener("click", () => rejectScholarship(btn.dataset.scholarshipReject)));
    root.querySelectorAll("[data-request-status]").forEach((btn) => btn.addEventListener("click", () => updateRequestStatus(btn.dataset.requestStatus, btn.dataset.status)));
    root.querySelectorAll("[data-view-guest]").forEach((btn) => btn.addEventListener("click", () => viewGuestInquiry(btn.dataset.viewGuest)));
    root.querySelectorAll("[data-guest-status]").forEach((btn) => btn.addEventListener("click", () => updateGuestStatus(btn.dataset.guestStatus, btn.dataset.status)));
    root.querySelectorAll("[data-guest-reply]").forEach((btn) => btn.addEventListener("click", () => addGuestReply(btn.dataset.guestReply)));
}

async function moderateMentorReview(mentorUid, appointmentId, status) {
    const rating = adminState.mentorRatings?.[mentorUid]?.[appointmentId];
    if (!rating) return showToast("Review not found.", "error");
    const nextStatus = normalizeRatingStatus(status);
    if (!["published", "hidden", "rejected"].includes(nextStatus)) return showToast("Unsupported review status.", "error");
    const studentUid = rating.studentUid;
    const nextRatings = {
        ...(adminState.mentorRatings?.[mentorUid] || {}),
        [appointmentId]: {
            ...rating,
            reviewStatus: nextStatus
        }
    };
    const summary = calculateMentorRatingSummary(nextRatings);
    const publicReview = nextStatus === "published"
        ? {
            appointmentId,
            mentorUid,
            ratingId: rating.ratingId || appointmentId,
            overallRating: rating.overallRating,
            communicationRating: rating.communicationRating || 0,
            knowledgeRating: rating.knowledgeRating || 0,
            helpfulnessRating: rating.helpfulnessRating || 0,
            professionalismRating: rating.professionalismRating || 0,
            wouldRecommend: rating.wouldRecommend === true,
            review: rating.review || "",
            studentDisplayName: rating.studentDisplayName || "Verified Student",
            reviewStatus: "published",
            isVerified: rating.isVerified === true,
            createdAt: rating.createdAt || rating.updatedAt || serverTimestamp(),
            updatedAt: serverTimestamp()
        }
        : null;

    const updates = {
        [`mentorRatings/${mentorUid}/${appointmentId}/reviewStatus`]: nextStatus,
        [`mentorRatings/${mentorUid}/${appointmentId}/moderatedAt`]: serverTimestamp(),
        [`mentorRatings/${mentorUid}/${appointmentId}/moderatedBy`]: adminState.adminUid,
        [`mentorRatings/${mentorUid}/${appointmentId}/updatedAt`]: serverTimestamp(),
        [`mentorRatingSummaries/${mentorUid}`]: { ...summary, mentorUid, updatedAt: serverTimestamp() },
        [`publicMentorReviews/${mentorUid}/${appointmentId}`]: publicReview
    };
    if (studentUid) {
        updates[`studentRatings/${studentUid}/${appointmentId}/reviewStatus`] = nextStatus;
        updates[`studentRatings/${studentUid}/${appointmentId}/moderatedAt`] = serverTimestamp();
        updates[`studentRatings/${studentUid}/${appointmentId}/moderatedBy`] = adminState.adminUid;
    }
    await update(ref(database), updates);
    await logActivity("mentor_review_moderated", `Marked mentor review ${appointmentId} as ${nextStatus}`, "mentor", mentorUid);
    showToast(`Review marked ${nextStatus}.`, "success");
}

async function approveMentor(uid) {
    if (!confirm("Approve this mentor application?")) return;
    const mentor = adminState.mentors[uid] || {};
    const status = normalize(mentor.approvalStatus || mentor.applicationStatus || mentor.status);
    if (!["submitted", "under_review", "pending"].includes(status)) return showToast("Only submitted mentor applications can be approved.", "error");
    await update(ref(database), {
        [`mentors/${uid}/profileStatus`]: "completed",
        [`mentors/${uid}/approvalStatus`]: "approved",
        [`mentors/${uid}/applicationStatus`]: "approved",
        [`mentors/${uid}/status`]: "approved",
        [`mentors/${uid}/publicVisibility`]: true,
        [`mentors/${uid}/mentoringEnabled`]: true,
        [`mentors/${uid}/userType`]: "mentor",
        [`mentors/${uid}/accountStatus`]: "active",
        [`mentors/${uid}/approvedAt`]: serverTimestamp(),
        [`mentors/${uid}/approvedBy`]: adminState.adminUid,
        [`mentors/${uid}/adminReviewReason`]: "",
        [`mentors/${uid}/adminRequestedChanges`]: "",
        [`mentors/${uid}/updatedAt`]: serverTimestamp(),
        [`mentorApplications/${uid}/profileStatus`]: "completed",
        [`mentorApplications/${uid}/approvalStatus`]: "approved",
        [`mentorApplications/${uid}/applicationStatus`]: "approved",
        [`mentorApplications/${uid}/approvedAt`]: serverTimestamp(),
        [`mentorApplications/${uid}/approvedBy`]: adminState.adminUid,
        [`mentorApplications/${uid}/adminReviewReason`]: "",
        [`mentorApplications/${uid}/adminRequestedChanges`]: "",
        [`mentorApplications/${uid}/updatedAt`]: serverTimestamp(),
        [`users/${uid}/mentorStatus`]: "approved",
        [`users/${uid}/accountStatus`]: "active",
        [`users/${uid}/updatedAt`]: serverTimestamp(),
        [`notifications/${uid}/${Date.now()}`]: notification("Mentor approved", "Your mentor application has been approved.")
    });
    await logActivity("mentor_approved", `Approved mentor ${mentor.fullName || uid}`, "mentor", uid);
    showToast("Mentor approved.", "success");
}

async function startMentorReview(uid) {
    const mentor = adminState.mentors[uid] || {};
    await update(ref(database), {
        [`mentors/${uid}/approvalStatus`]: "under_review",
        [`mentors/${uid}/applicationStatus`]: "under_review",
        [`mentors/${uid}/reviewStartedAt`]: serverTimestamp(),
        [`mentors/${uid}/reviewedBy`]: adminState.adminUid,
        [`mentors/${uid}/updatedAt`]: serverTimestamp(),
        [`mentorApplications/${uid}/approvalStatus`]: "under_review",
        [`mentorApplications/${uid}/applicationStatus`]: "under_review",
        [`mentorApplications/${uid}/reviewStartedAt`]: serverTimestamp(),
        [`mentorApplications/${uid}/reviewedBy`]: adminState.adminUid,
        [`mentorApplications/${uid}/updatedAt`]: serverTimestamp(),
        [`notifications/${uid}/${Date.now()}`]: notification("Application under review", "Your mentor application is now under review.")
    });
    await logActivity("mentor_review_started", `Started review for mentor ${mentor.fullName || uid}`, "mentor", uid);
    showToast("Mentor application marked under review.", "success");
}

async function requestMentorChanges(uid) {
    const message = prompt("Enter requested changes for this mentor:");
    if (!message?.trim()) return;
    const mentor = adminState.mentors[uid] || {};
    await update(ref(database), {
        [`mentors/${uid}/approvalStatus`]: "changes_requested",
        [`mentors/${uid}/applicationStatus`]: "changes_requested",
        [`mentors/${uid}/status`]: "pending",
        [`mentors/${uid}/publicVisibility`]: false,
        [`mentors/${uid}/mentoringEnabled`]: false,
        [`mentors/${uid}/adminReviewReason`]: message.trim(),
        [`mentors/${uid}/adminRequestedChanges`]: message.trim(),
        [`mentors/${uid}/changesRequestedAt`]: serverTimestamp(),
        [`mentors/${uid}/reviewedBy`]: adminState.adminUid,
        [`mentors/${uid}/updatedAt`]: serverTimestamp(),
        [`mentorApplications/${uid}/approvalStatus`]: "changes_requested",
        [`mentorApplications/${uid}/applicationStatus`]: "changes_requested",
        [`mentorApplications/${uid}/adminReviewReason`]: message.trim(),
        [`mentorApplications/${uid}/adminRequestedChanges`]: message.trim(),
        [`mentorApplications/${uid}/changesRequestedAt`]: serverTimestamp(),
        [`mentorApplications/${uid}/reviewedBy`]: adminState.adminUid,
        [`mentorApplications/${uid}/updatedAt`]: serverTimestamp(),
        [`users/${uid}/mentorStatus`]: "changes_requested",
        [`notifications/${uid}/${Date.now()}`]: notification("Mentor application changes requested", message.trim())
    });
    await logActivity("mentor_changes_requested", `Requested changes for mentor ${mentor.fullName || uid}`, "mentor", uid);
    showToast("Requested changes sent to mentor.", "success");
}

async function rejectMentor(uid) {
    const reason = prompt("Enter rejection reason:");
    if (!reason) return;
    const mentor = adminState.mentors[uid] || {};
    await update(ref(database), {
        [`mentors/${uid}/approvalStatus`]: "rejected",
        [`mentors/${uid}/applicationStatus`]: "rejected",
        [`mentors/${uid}/status`]: "rejected",
        [`mentors/${uid}/publicVisibility`]: false,
        [`mentors/${uid}/mentoringEnabled`]: false,
        [`mentors/${uid}/accountStatus`]: "rejected",
        [`mentors/${uid}/adminReviewReason`]: reason,
        [`mentors/${uid}/rejectionReason`]: reason,
        [`mentors/${uid}/rejectedAt`]: serverTimestamp(),
        [`mentors/${uid}/rejectedBy`]: adminState.adminUid,
        [`mentorApplications/${uid}/approvalStatus`]: "rejected",
        [`mentorApplications/${uid}/applicationStatus`]: "rejected",
        [`mentorApplications/${uid}/adminReviewReason`]: reason,
        [`mentorApplications/${uid}/rejectionReason`]: reason,
        [`mentorApplications/${uid}/rejectedAt`]: serverTimestamp(),
        [`mentorApplications/${uid}/rejectedBy`]: adminState.adminUid,
        [`mentorApplications/${uid}/updatedAt`]: serverTimestamp(),
        [`users/${uid}/mentorStatus`]: "rejected",
        [`notifications/${uid}/${Date.now()}`]: notification("Mentor application update", `Your mentor application was rejected. Reason: ${reason}`)
    });
    await logActivity("mentor_rejected", `Rejected mentor ${mentor.fullName || uid}`, "mentor", uid);
    showToast("Mentor rejected.", "success");
}

async function updateInstituteApproval(uid, status) {
    const approved = status === "approved";
    const institute = adminState.institutes[uid] || {};
    const name = institute.instituteName || adminState.users[uid]?.fullName || uid;
    if (!confirm(`${approved ? "Approve" : "Reject"} this institute registration?`)) return;
    const updates = {
        [`institutes/${uid}/status`]: status,
        [`institutes/${uid}/verificationStatus`]: status,
        [`institutes/${uid}/approvalStatus`]: status,
        [`institutes/${uid}/updatedAt`]: serverTimestamp(),
        [`users/${uid}/accountStatus`]: approved ? "active" : "rejected",
        [`users/${uid}/instituteStatus`]: status,
        [`users/${uid}/updatedAt`]: serverTimestamp(),
        [`notifications/${uid}/${Date.now()}`]: notification(
            approved ? "Institute approved" : "Institute registration update",
            approved ? "Your institute account has been approved. You can now complete your profile and publish courses." : "Your institute registration was rejected. Please contact EduPath Support for details."
        )
    };
    updates[`institutes/${uid}/${approved ? "approvedAt" : "rejectedAt"}`] = serverTimestamp();
    updates[`institutes/${uid}/${approved ? "approvedBy" : "rejectedBy"}`] = adminState.adminUid;
    await update(ref(database), updates);
    await logActivity(approved ? "institute_approved" : "institute_rejected", `${approved ? "Approved" : "Rejected"} institute ${name}`, "institute", uid);
    showToast(`Institute ${status}.`, "success");
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

async function rejectScholarship(id) {
    const reason = prompt("Enter the rejection reason for this scholarship (optional):") || "Does not meet requirements";
    try {
        await update(ref(database, `scholarships/${id}`), {
            status: "rejected",
            rejectionReason: reason,
            updatedAt: serverTimestamp()
        });
        await logActivity("scholarship_rejected", `Rejected scholarship. Reason: ${reason}`, "scholarship", id);
        showToast("Scholarship rejected.", "warning");
    } catch (e) {
        console.error(e);
        showToast("Action failed.", "error");
    }
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
    if (select && (convo.studentUid || convo.userUid)) select.value = convo.studentUid || convo.userUid;
    if (rerender) renderSupportInbox();
}

async function sendConversationReply(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const conversationId = form.dataset.replyConversation;
    const convo = adminState.conversations[conversationId] || {};
    const receiverUid = convo.studentUid || convo.userUid || Object.keys(convo.participantIds || {}).find((uid) => uid !== adminState.adminUid);
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
    updates[`conversations/${conversationId}/userUid`] = receiverUid;
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
        targetUserUid: receiverUid,
        targetRole: normalize(receiver.userType || "student") || "student",
        senderUid: adminState.adminUid,
        senderRole: "admin",
        type: "admin_support_reply",
        title: "New message from EduPath Support",
        message: subject,
        messagePreview: message.slice(0, 140),
        relatedEntityType: "conversation",
        relatedEntityId: conversationId,
        conversationId,
        targetPage: `${normalize(receiver.userType || "student") || "student"}-dashboard.html`,
        targetSection: normalize(receiver.userType || "student") === "mentor" ? "support" : "support-section",
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
    return `<div class="detail-grid">${Object.entries(obj).map(([key, value]) => {
        if (key === "imageURL") {
            const fallback = obj.scholarshipName || obj.provider ? "images/scholarship-placeholder.png" : "images/course-placeholder.png";
            const src = sanitizeImageURL(value, fallback);
            return `<div class="detail-image-field full-width"><span>Image</span><img src="${escapeAttr(src)}" alt="${escapeAttr(obj.courseName || obj.scholarshipName || "Record image")}" loading="lazy" onerror="this.onerror=null;this.src='${escapeAttr(fallback)}';"></div>`;
        }
        return `<div><span>${escapeHtml(key)}</span><strong>${escapeHtml(display(value))}</strong></div>`;
    }).join("")}</div>`;
}

function groupedDetails(groups, data) {
    return Object.entries(groups).map(([title, keys]) => `
        <section class="drawer-group"><h3>${escapeHtml(title)}</h3><div class="detail-grid">${keys.map((key) => `<div><span>${escapeHtml(labelize(key))}</span><strong>${escapeHtml(display(data[key]))}</strong></div>`).join("")}</div></section>
    `).join("");
}

function adminDetails(uid) {
    const admin = adminState.users[uid] || {};
    return groupedDetails({
        "Admin Account": ["fullName", "email", "phone", "userType", "accountStatus", "createdAt", "lastActiveAt", "lastLoginAt"]
    }, admin);
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

function renderAdminMessages() {
    const tbody = document.getElementById("admin-messages-tbody");
    if (!tbody) return;
    const rows = Object.entries(adminState.conversations || {})
        .map(([id, conversation]) => ({ id, ...conversation }))
        .filter(isSupportConversation)
        .sort((a, b) => getTime(b.lastMessageAt || b.updatedAt || b.createdAt) - getTime(a.lastMessageAt || a.updatedAt || a.createdAt));
    const result = paginateRows(rows, "messages");
    renderTablePagination("messages", result, tbody);
    if (!rows.length) return showTableEmpty(tbody, 7, "No authenticated user conversations yet.");
    tbody.innerHTML = result.rows.map((row) => {
        const userUid = row.studentUid || row.userUid || Object.keys(row.participantIds || {}).find((uid) => uid !== adminState.adminUid) || "";
        const user = adminState.users[userUid] || {};
        const userName = row.participantNames?.[userUid] || user.fullName || row.studentName || "User";
        const role = row.participantRoles?.[userUid] || userRole(user) || row.userRole || "user";
        return `<tr>
            <td>${escapeHtml(display(userName))}</td>
            <td>${escapeHtml(display(role))}</td>
            <td>${ellipsisCell(row.lastMessage || row.subject || "Conversation", 240)}</td>
            <td><span class="badge ${statusBadgeClass(row.status || "open")}">${escapeHtml(display(row.status || "open"))}</span></td>
            <td>${formatNumber(row.unreadByAdmin || 0)}</td>
            <td>${formatDateTime(row.lastMessageAt || row.updatedAt || row.createdAt)}</td>
            <td><button class="btn btn-sm btn-primary" data-open-admin-conversation="${escapeAttr(row.id)}">Open</button></td>
        </tr>`;
    }).join("");
    tbody.querySelectorAll("[data-open-admin-conversation]").forEach((btn) => btn.addEventListener("click", () => {
        supportState.activeFolder = "conversations";
        supportState.selectedItemId = `conversation:${btn.dataset.openAdminConversation}`;
        showAdminSection("support-inbox");
        renderSupportInbox();
    }));
}

function getAdminNotificationRows() {
    const personal = Object.entries(adminState.notifications?.[adminState.adminUid] || {}).map(([id, notification]) => ({
        id,
        source: "personal",
        path: `notifications/${adminState.adminUid}/${id}`,
        ...notification
    }));
    const shared = Object.entries(adminState.notifications?.admin || {}).map(([id, notification]) => ({
        id,
        source: "admin",
        path: `notifications/admin/${id}`,
        ...notification
    }));
    return [...personal, ...shared].sort((a, b) => getTime(b.createdAt || b.updatedAt) - getTime(a.createdAt || a.updatedAt));
}

function renderAdminNotifications() {
    const tbody = document.getElementById("admin-notifications-tbody");
    if (!tbody) return;
    const rows = getAdminNotificationRows();
    const result = paginateRows(rows, "notifications");
    renderTablePagination("notifications", result, tbody);
    if (!rows.length) return showTableEmpty(tbody, 6, "No admin notifications yet.");
    tbody.innerHTML = result.rows.map((notification) => {
        const unread = isAdminNotificationUnread(notification);
        return `<tr>
            <td><strong>${ellipsisCell(notification.title || notification.type || "Notification", 180)}</strong></td>
            <td>${ellipsisCell(notification.message || notification.messagePreview || notification.body, 260)}</td>
            <td>${escapeHtml(display(notification.type || notification.category || "general"))}</td>
            <td>${formatDateTime(notification.createdAt || notification.updatedAt)}</td>
            <td><span class="badge ${unread ? "badge-warning" : "badge-success"}">${unread ? "Unread" : "Read"}</span></td>
            <td class="action-btns">
                ${notification.relatedSection ? `<button class="btn btn-sm btn-info" data-section="${escapeAttr(notification.relatedSection)}">Open</button>` : ""}
                ${unread ? `<button class="btn btn-sm btn-primary" data-mark-notification-read="${escapeAttr(notification.path)}" data-notification-source="${escapeAttr(notification.source)}">Mark Read</button>` : ""}
            </td>
        </tr>`;
    }).join("");
    tbody.querySelectorAll("[data-mark-notification-read]").forEach((btn) => btn.addEventListener("click", () => markAdminNotificationRead(btn.dataset.markNotificationRead, btn.dataset.notificationSource)));
}

function isAdminNotificationUnread(notification = {}) {
    if (notification.source === "admin") return notification.readBy?.[adminState.adminUid] !== true;
    return notification.isRead === false || notification.read === false || notification.status === "unread" || (notification.isRead === undefined && notification.read === undefined && notification.status === undefined);
}

async function markAdminNotificationRead(path, source = "personal") {
    if (!path) return;
    const payload = source === "admin"
        ? { [`readBy/${adminState.adminUid}`]: true, updatedAt: serverTimestamp() }
        : { read: true, isRead: true, status: "read", updatedAt: serverTimestamp() };
    await update(ref(database, path), payload);
    renderAdminNotifications();
}

async function markAllAdminNotificationsRead() {
    const rows = getAdminNotificationRows().filter(isAdminNotificationUnread);
    if (!rows.length) return showToast("No unread notifications.", "success");
    const updates = {};
    rows.forEach((notification) => {
        if (notification.source === "admin") {
            updates[`${notification.path}/readBy/${adminState.adminUid}`] = true;
            updates[`${notification.path}/updatedAt`] = serverTimestamp();
        } else {
            updates[`${notification.path}/read`] = true;
            updates[`${notification.path}/isRead`] = true;
            updates[`${notification.path}/status`] = "read";
            updates[`${notification.path}/updatedAt`] = serverTimestamp();
        }
    });
    await update(ref(database), updates);
    showToast("Notifications marked as read.", "success");
}

function renderSystemStatus() {
    const container = document.getElementById("system-status-grid");
    if (!container) return;
    const stats = calculateStats();
    const items = [
        ["Firebase Connection", adminState.systemConnected ? "Connected" : "Disconnected", adminState.systemConnected ? "badge-success" : "badge-danger", "fa-plug"],
        ["Admin Presence", isOnline(adminState.adminUid) ? "Online" : "Offline", isOnline(adminState.adminUid) ? "badge-success" : "badge-warning", "fa-user-shield"],
        ["Online Users", stats["kpi-online-users"], "badge-info", "fa-signal"],
        ["Active Courses", stats["kpi-active-courses"], "badge-success", "fa-book-open"],
        ["Active Scholarships", stats["kpi-active-scholarships"], "badge-success", "fa-graduation-cap"],
        ["Unread Support", stats["kpi-unread-support"], stats["kpi-unread-support"] ? "badge-warning" : "badge-success", "fa-headset"],
        ["Realtime Listeners", "16 active paths", "badge-info", "fa-wave-square"],
        ["Last Synced", new Date().toLocaleTimeString(), "badge-info", "fa-clock"]
    ];
    container.innerHTML = items.map(([label, value, badgeClass, icon]) => `
        <article class="panel-card glass system-status-card">
            <i class="fas ${icon} text-primary"></i>
            <div><h3>${escapeHtml(label)}</h3><span class="badge ${badgeClass}">${escapeHtml(String(value))}</span></div>
        </article>
    `).join("");
}

function renderPendingActions() {
    const container = document.getElementById("pending-actions-list");
    if (!container) return;
    const pendingReviews = flattenMentorReviews().filter((review) => normalizeRatingStatus(review.reviewStatus || "pending") === "pending").length;
    const actions = [
        { title: "Pending Mentor Approvals", desc: "Mentors waiting for approval", count: countWhere(adminState.mentors, (m) => normalize(m.status || "pending") === "pending"), section: "mentor-approvals", icon: "fa-user-check", tone: "orange" },
        { title: "Unread Support Messages", desc: "Messages waiting for response", count: getUnreadSupportCount(), section: "support-inbox", icon: "fa-envelope", tone: "red" },
        { title: "Pending Mentor Requests", desc: "Student mentoring requests", count: countWhere(adminState.mentorRequests, (r) => normalize(r.status || "pending") === "pending"), section: "mentor-requests", icon: "fa-user-clock", tone: "blue" },
        { title: "Pending Mentor Reviews", desc: "Student reviews awaiting approval", count: pendingReviews, section: "mentor-reviews", icon: "fa-star-half-stroke", tone: "purple" },
        { title: "Scholarships Near Deadline", desc: "Scholarships requiring attention", count: nearDeadlineScholarships().length, section: "manage-scholarships", icon: "fa-graduation-cap", tone: "green" },
        { title: "Draft Courses", desc: "Courses waiting for admin review", count: countWhere(adminState.courses, (c) => normalize(c.status) === "draft"), section: "manage-courses", icon: "fa-book", tone: "purple" }
    ];
    const visible = actions.filter((item) => item.count > 0);
    if (!visible.length) {
        container.innerHTML = `<div class="empty-state compact"><i class="fas fa-check-circle text-success"></i><p>You're all caught up.</p><span>No admin actions require review.</span></div>`;
        return;
    }
    container.innerHTML = visible.map((item) => `<button class="pending-action tone-${item.tone}" data-section="${item.section}">
        <span class="pending-icon"><i class="fas ${item.icon}"></i></span>
        <span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.desc)}</small></span>
        <b>${formatNumber(item.count)}</b>
        <em>Review</em>
    </button>`).join("");
}

function renderQuickActions() {
    const container = document.getElementById("quick-actions-list");
    if (!container) return;
    container.innerHTML = [
        ["Approve Mentors", "mentor-approvals", "fa-user-check", "blue", ""],
        ["Add Scholarship", "manage-scholarships", "fa-graduation-cap", "green", "add-scholarship"],
        ["Add Course", "manage-courses", "fa-book-open", "purple", "add-course"],
        ["View Reports", "reports", "fa-chart-column", "orange", ""],
        ["Open Support Inbox", "support-inbox", "fa-headset", "red", ""],
        ["Manage Users", "manage-students", "fa-users", "cyan", ""]
    ].map(([label, section, icon, tone, action]) => `<button class="quick-action tone-${tone}" data-section="${section}" ${action ? `data-quick-action="${action}"` : ""}><i class="fas ${icon}"></i><span>${label}</span></button>`).join("");
}

function showAdminSection(sectionId = "overview", updateHash = true) {
    const config = adminSections[sectionId];
    const target = document.getElementById(sectionId);
    if (!config || !target) {
        console.error("[Admin Navigation] Invalid or missing section:", sectionId);
        showToast("This dashboard section is not available yet.", "error");
        return false;
    }
    document.querySelectorAll(".dashboard-section").forEach((section) => {
        const isActive = section.id === sectionId;
        section.classList.toggle("active", isActive);
        section.hidden = !isActive;
        section.setAttribute("aria-hidden", String(!isActive));
    });
    document.querySelectorAll(".sidebar-links a[data-section]").forEach((link) => {
        const isActive = link.dataset.section === sectionId;
        link.classList.toggle("active", isActive);
        if (isActive) link.setAttribute("aria-current", "page");
        else link.removeAttribute("aria-current");
    });
    document.querySelector(".page-title") && (document.querySelector(".page-title").textContent = config.title);
    if (updateHash && window.location.hash !== `#${sectionId}`) window.history.replaceState(null, "", `#${sectionId}`);
    const heading = target.querySelector("h1, h2");
    if (heading) {
        heading.setAttribute("tabindex", "-1");
        heading.focus({ preventScroll: true });
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
    const sidebar = document.getElementById("sidebar");
    const overlay = document.getElementById("sidebar-overlay");
    if (sidebar && window.innerWidth <= 768) {
        sidebar.classList.remove("active");
        document.body.classList.remove("sidebar-mobile-open");
        overlay?.classList.remove("show");
    }
    return true;
}

function getHashSection() {
    const sectionId = decodeURIComponent(window.location.hash.replace(/^#/, ""));
    if (!sectionId) return "overview";
    if (adminSections[sectionId] && document.getElementById(sectionId)) return sectionId;
    console.warn("[Admin Navigation] Unknown hash:", sectionId);
    return "overview";
}

function validateAdminNavigation() {
    const errors = [];
    document.querySelectorAll("[data-section], [data-kpi-section]").forEach((element) => {
        const sectionId = element.dataset.section || element.dataset.kpiSection;
        if (!adminSections[sectionId]) errors.push(`Missing config for data-section="${sectionId}"`);
        if (!document.getElementById(sectionId)) errors.push(`Missing HTML section id="${sectionId}"`);
    });
    Object.keys(adminSections).forEach((sectionId) => {
        if (!document.getElementById(sectionId)) errors.push(`Configured section has no HTML: "${sectionId}"`);
    });
    const ids = [...document.querySelectorAll("[id]")].map((element) => element.id);
    const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
    [...new Set(duplicates)].forEach((id) => errors.push(`Duplicate HTML id="${id}"`));
    if (errors.length) {
        console.group("[Admin Navigation] Validation errors");
        errors.forEach((error) => console.error(error));
        console.groupEnd();
    } else {
        console.log("[Admin Navigation] All menu mappings are valid.");
    }
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
    setText("badge-mentor-reviews", flattenMentorReviews().filter((review) => normalizeRatingStatus(review.reviewStatus || "pending") === "pending").length || "");
    setText("badge-profile-updates", flattenMentorProfileUpdates().filter((change) => normalize(change.status || "recorded") === "recorded").length || "");
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
    return Object.entries(adminState.pathwayResults).filter(([uid]) => !isHiddenAdminUser(uid)).flatMap(([uid, results]) =>
        Object.entries(results || {}).map(([resultId, result]) => ({ uid, resultId, ...result }))
    ).sort((a, b) => getTime(b.createdAt, b.resultId) - getTime(a.createdAt, a.resultId));
}

function flattenMentorConnections() {
    return Object.entries(adminState.mentorStudents || {}).flatMap(([mentorUid, students]) =>
        Object.entries(students || {}).map(([studentUid, connection]) => ({ mentorUid, studentUid, ...connection }))
    ).filter((connection) => normalize(connection.status || "connected") === "connected");
}

function notification(title, message) {
    const lower = `${title} ${message}`.toLowerCase();
    let type = "admin_support_reply";
    let targetPage = "student-dashboard.html";
    let targetSection = "support-section";

    if (lower.includes("mentor approved")) {
        type = "mentor_application_approved";
        targetPage = "mentor-dashboard.html";
        targetSection = "dashboard-overview";
    } else if (lower.includes("under review") || lower.includes("changes requested")) {
        type = lower.includes("changes requested") ? "mentor_changes_requested" : "mentor_application_submitted";
        targetPage = "mentor-dashboard.html";
        targetSection = "complete-profile";
    } else if (lower.includes("rejected")) {
        type = "mentor_application_rejected";
        targetPage = "mentor-dashboard.html";
        targetSection = "complete-profile";
    } else if (lower.includes("institute")) {
        targetPage = "institute-dashboard.html";
        targetSection = "profile";
    }

    return {
        title,
        message,
        type,
        targetPage,
        targetSection,
        targetRole: targetPage.includes("mentor") ? "mentor" : targetPage.includes("admin") ? "admin" : targetPage.includes("institute") ? "institute" : "student",
        status: "unread",
        read: false,
        createdAt: serverTimestamp()
    };
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
    return `<span class="presence-cell"><span class="presence-dot ${isOnline(uid) ? "online" : ""}"></span><span>${isOnline(uid) ? "Online" : "Offline"}</span></span>`;
}

function isOnline(uid) {
    return normalize(adminState.presence[uid]?.state) === "online" || adminState.users[uid]?.isOnline === true;
}

function userRole(user = {}) {
    return normalize(user.userType || user.role || "");
}

function avatarCell(row, fallback) {
    const name = row.fullName || row.name || fallback;
    const secondary = row.email || row.websiteURL || row.facebookPage || row.mentorType || row.userType || "";
    const avatar = row.photoURL ? `<span class="table-avatar"><img src="${escapeAttr(row.photoURL)}" alt=""></span>` : `<span class="table-avatar">${escapeHtml(initials(name))}</span>`;
    return `<div class="table-person-cell">${avatar}<div class="table-person-copy"><strong class="table-text-ellipsis" title="${escapeAttr(display(name))}">${escapeHtml(display(name))}</strong>${secondary ? `<small class="table-text-ellipsis" title="${escapeAttr(display(secondary))}">${escapeHtml(display(secondary))}</small>` : ""}</div></div>`;
}

function progressMini(value) {
    const pct = Number(value || 0);
    const safePct = Math.max(0, Math.min(100, pct));
    return `<div class="table-progress-cell"><div class="table-progress-header"><strong>${safePct}%</strong></div><div class="table-progress-track"><span style="width:${safePct}%"></span></div></div>`;
}

function accountBadgeClass(status) {
    const s = normalize(status || "active");
    if (s === "suspended" || s === "disabled") return "badge-danger";
    return "badge-success";
}

function statusBadgeClass(status) {
    const s = normalize(status || "draft");
    if (["approved", "accepted", "active", "completed", "read", "replied", "closed"].includes(s)) return "badge-success";
    if (["pending", "new", "unread", "draft", "in-progress", "reported"].includes(s)) return "badge-warning";
    if (["rejected", "hidden", "inactive", "archived", "cancelled", "disabled", "suspended"].includes(s)) return "badge-danger";
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
    const uid = convo.studentUid || convo.userUid || Object.keys(convo.participantIds || {}).find((id) => id !== adminState.adminUid);
    return adminState.users[uid]?.email || "";
}

function getConversationRole(convo = {}) {
    const uid = convo.studentUid || convo.userUid || Object.keys(convo.participantIds || {}).find((id) => id !== adminState.adminUid);
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

function displayVal(value) {
    return display(value);
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

// --- Talent & Opportunities System ---
async function renderTalentCategories() {
    const tbody = document.getElementById('admin-talent-categories-tbody');
    if (!tbody) return;
    try {
        const snap = await get(ref(database, 'talentCategories'));
        if (!snap.exists()) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted p-4">No talent categories found.</td></tr>';
            return;
        }
        const data = snap.val();
        tbody.innerHTML = Object.keys(data).map(key => {
            const cat = data[key];
            return `<tr><td>${escapeHtml(key)}</td><td>${escapeHtml(cat.title || cat.name || key)}</td><td>${escapeHtml(cat.description || '')}</td><td><button class="btn btn-secondary btn-sm" disabled>Edit</button></td></tr>`;
        }).join('');
    } catch(e) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-danger">Error loading categories.</td></tr>';
    }
}

async function renderTalentOpportunities() {
    const tbody = document.getElementById('admin-talent-opportunities-tbody');
    if (!tbody) return;
    try {
        const snap = await get(ref(database, 'talentOpportunities'));
        if (!snap.exists()) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted p-4">No talent opportunities found.</td></tr>';
            return;
        }
        const data = snap.val();
        tbody.innerHTML = Object.keys(data).map(key => {
            const opp = data[key];
            return `<tr><td>${escapeHtml(opp.title || 'Untitled')}</td><td>${escapeHtml(opp.provider || opp.organization || 'Unknown')}</td><td>${escapeHtml(opp.type || opp.category || 'General')}</td><td><span class="badge ${opp.status === 'active' ? 'badge-active' : 'badge-pending'}">${escapeHtml((opp.status || 'pending').toUpperCase())}</span></td><td><button class="btn btn-secondary btn-sm" disabled>Manage</button></td></tr>`;
        }).join('');
    } catch(e) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-danger">Error loading opportunities.</td></tr>';
    }
}

async function renderAchievementVerifications() {
    const tbody = document.getElementById('admin-achievement-verifications-tbody');
    if (!tbody) return;
    try {
        const snap = await get(ref(database, 'achievementVerifications'));
        if (!snap.exists()) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted p-4">No verifications pending.</td></tr>';
            return;
        }
        const data = snap.val();
        tbody.innerHTML = Object.keys(data).map(key => {
            const ver = data[key];
            return `<tr><td>${escapeHtml(ver.studentName || ver.studentUid || 'Unknown')}</td><td>${escapeHtml(ver.achievementTitle || ver.title || 'Unknown')}</td><td><a href="#" class="text-primary">View Proof</a></td><td><span class="badge ${ver.status === 'verified' ? 'badge-active' : 'badge-pending'}">${escapeHtml((ver.status || 'pending').toUpperCase())}</span></td><td><button class="btn btn-success btn-sm" disabled>Verify</button> <button class="btn btn-danger btn-sm" disabled>Reject</button></td></tr>`;
        }).join('');
    } catch(e) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-danger">Error loading verifications.</td></tr>';
    }
}
