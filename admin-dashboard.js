import { auth, database } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { ref, get, set, update, push, remove, onValue, onDisconnect, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
import { showToast, preserveThemeOnClear } from "./auth-nav.js?v=20260614-brand";
import { initDashboardSidebar, updateSidebarUser } from "./sidebar.js";
import { ensureDashboardTopbarLayout, initDashboardNotifications, updateDashboardGreetingName } from "./dashboard-topbar.js";
import { calculateMentorRatingSummary, normalizeRatingStatus } from "./ratings.js";
import { runRecommendationTestSuite, testCombinedBusinessDancingStudent, testTalentOnlyDancingStudent, testAcademicBusinessStudent, testAcademicEngineeringStudent, testUndecidedStudent } from "./recommendation-test-helper.js";

const adminState = {
    users: {},
    students: {},
    mentors: {},
    institutes: {},
    courses: {},
    scholarships: {},
    academicCategories: {},
    courseCategories: {},
    scholarshipCategories: {},
    mentorExpertiseCategories: {},
    talentCategories: {},
    opportunityCategories: {},
    providerCategories: {},
    talentOpportunities: {},
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
    editingCategoryCmsId: null,
    editingTalentCategoryId: null,
    editingTalentOpportunityId: null,
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
    "manage-category-cms": { title: "Category Management" },
    "category-review": { title: "Category Review" },
    "recommendation-testing": { title: "Recommendation Testing" },
    "manage-courses": { title: "Manage Courses" },
    "manage-scholarships": { title: "Manage Scholarships" },
    "pathway-results": { title: "Pathway Results" },
    "manage-talent-categories": { title: "Talent Categories" },
    "manage-talent-opportunities": { title: "Talent Opportunities" },
    "achievement-verifications": { title: "Achievement Verifications" },
    "institute-approvals": { title: "Institute Approvals" },
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
    bindRecommendationTesting();
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
    if (sectionId === "institute-approvals") renderInstituteApprovals();
    if (sectionId === "mentor-reviews") renderMentorReviews();
    if (sectionId === "mentor-profile-updates") renderMentorProfileUpdates();
    if (sectionId === "system-status") renderSystemStatus();
    if (sectionId === "manage-category-cms") { renderCategoryCms(); populateMasterCategorySelects(); }
    if (sectionId === "category-review") renderCategoryReview();
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
    document.getElementById("btn-add-talent-category")?.addEventListener("click", () => toggleTalentForm("talent-category-form-card", "talent-category-title"));
    document.getElementById("talent-category-cancel")?.addEventListener("click", () => closeTalentForm("talent-category-form-card", "talent-category-form"));
    document.getElementById("talent-category-form")?.addEventListener("submit", saveTalentCategory);
    document.getElementById("btn-add-talent-opportunity")?.addEventListener("click", () => toggleTalentForm("talent-opportunity-form-card", "talent-opportunity-title"));
    document.getElementById("talent-opportunity-cancel")?.addEventListener("click", () => closeTalentForm("talent-opportunity-form-card", "talent-opportunity-form"));
    document.getElementById("talent-opportunity-form")?.addEventListener("submit", saveTalentOpportunity);
    document.getElementById("talent-opportunity-category")?.addEventListener("change", updateTalentOpportunityDependencies);
    document.getElementById("category-cms-path")?.addEventListener("change", () => { resetCategoryCmsForm(); renderCategoryCms(); });
    document.getElementById("category-cms-search")?.addEventListener("input", renderCategoryCms);
    document.getElementById("category-cms-add")?.addEventListener("click", () => { resetCategoryCmsForm(); openCategoryCmsForm(); });
    document.getElementById("category-cms-cancel")?.addEventListener("click", resetCategoryCmsForm);
    document.getElementById("category-cms-form")?.addEventListener("submit", saveCategoryCms);
    document.getElementById("category-review-filter")?.addEventListener("change", renderCategoryReview);
    document.getElementById("category-review-search")?.addEventListener("input", renderCategoryReview);
    document.getElementById("category-review-form")?.addEventListener("submit", saveCategoryReviewAssignment);
    document.getElementById("category-review-cancel")?.addEventListener("click", closeCategoryReviewEditor);
    document.getElementById("course-academic-category")?.addEventListener("change", populateCourseCategorySelect);
    document.getElementById("show-manual-mentor-form")?.addEventListener("click", () => document.getElementById("manual-mentor-form-card")?.classList.remove("hidden"));
    document.getElementById("manual-mentor-cancel")?.addEventListener("click", () => { document.getElementById("manual-mentor-form")?.reset(); document.getElementById("manual-mentor-form-card")?.classList.add("hidden"); });
    document.getElementById("manual-mentor-form")?.addEventListener("submit", saveManualMentor);
    document.getElementById("show-admin-institute-form")?.addEventListener("click", () => { populateMasterCategorySelects(); document.getElementById("admin-institute-form-card")?.classList.remove("hidden"); });
    document.getElementById("admin-institute-cancel")?.addEventListener("click", () => { document.getElementById("admin-institute-form")?.reset(); document.getElementById("admin-institute-form-card")?.classList.add("hidden"); });
    document.getElementById("admin-institute-form")?.addEventListener("submit", saveAdminInstitute);
    document.addEventListener("click", (event) => {
        const categoryEdit = event.target.closest("[data-edit-talent-category]");
        const opportunityEdit = event.target.closest("[data-edit-talent-opportunity]");
        const opportunityArchive = event.target.closest("[data-archive-talent-opportunity]");
        if (categoryEdit) editTalentCategory(categoryEdit.dataset.editTalentCategory);
        if (opportunityEdit) editTalentOpportunity(opportunityEdit.dataset.editTalentOpportunity);
        if (opportunityArchive) archiveTalentOpportunity(opportunityArchive.dataset.archiveTalentOpportunity);
    });
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
        ["institutes", "institutes", () => { renderOverview(); renderInstitutes(); renderInstituteApprovals(); renderReports(); updateSidebarBadges(); }],
        ["courses", "courses", () => { renderOverview(); renderCourses(); renderInstitutes(); renderReports(); renderSystemStatus(); }],
        ["scholarships", "scholarships", () => { renderOverview(); renderScholarships(); renderReports(); renderSystemStatus(); }],
        ["academicCategories", "academicCategories", () => { renderCategoryCms(); populateMasterCategorySelects(); }],
        ["courseCategories", "courseCategories", () => { renderCategoryCms(); populateMasterCategorySelects(); }],
        ["scholarshipCategories", "scholarshipCategories", () => { renderCategoryCms(); populateMasterCategorySelects(); }],
        ["mentorExpertiseCategories", "mentorExpertiseCategories", () => { renderCategoryCms(); populateMasterCategorySelects(); }],
        ["talentCategories", "talentCategories", () => { renderTalentCategories(); populateTalentCategoryOptions(); renderCategoryCms(); populateMasterCategorySelects(); }],
        ["opportunityCategories", "opportunityCategories", () => { renderCategoryCms(); populateMasterCategorySelects(); }],
        ["providerCategories", "providerCategories", () => { renderCategoryCms(); populateMasterCategorySelects(); }],
        ["talentOpportunities", "talentOpportunities", () => { renderTalentOpportunities(); }],
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
    const pendingInstitutes = countWhere(adminState.institutes, (i) => normalize(i.approvalStatus || i.status || "pending") === "pending");
    const acceptedMentorConnections = flattenMentorConnections().length;
    const unreadSupport = getUnreadSupportCount();
    const guestInquiries = Object.keys({ ...adminState.contactMessages, ...adminState.guestMessages }).length;
    return {
        "kpi-total-users-summary": students + mentors + institutes + admins,
        "kpi-active-content-summary": activeCourses + activeScholarships,
        "kpi-pending-actions-summary": pendingMentors + pendingMentorRequests + pendingInstitutes,
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
        "admin-hero-pending-approvals": pendingMentors + pendingInstitutes,
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
    let rows = getInstituteRows().filter((institute) => !["rejected", "suspended", "disabled"].includes(normalize(institute.accountStatus)) && !["rejected", "suspended"].includes(normalize(institute.verificationStatus || institute.approvalStatus || institute.status)));
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
            <td>${Object.values(adminState.courses).filter((c) => c.instituteUid === i.uid || c.instituteId === i.uid || normalize(c.instituteName || c.institute) === normalize(i.instituteName || i.name)).length}</td>
            <td><span class="badge ${accountBadgeClass(i.accountStatus || i.status || "active")}">${escapeHtml(normalize(i.accountStatus || i.status || "active"))}</span></td>
            <td class="action-btns">
                <button class="btn btn-sm btn-info" data-view-institute="${i.uid}">View</button>
                ${["approved", "active"].includes(normalize(i.verificationStatus || i.approvalStatus || i.status)) ? "" : `<button class="btn btn-sm btn-success" data-approve-institute="${i.uid}">Approve</button>`}
                ${normalize(i.verificationStatus || i.approvalStatus || i.status) === "rejected" ? "" : `<button class="btn btn-sm btn-warning" data-reject-institute="${i.uid}">Reject</button>`}
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
    const ids = new Set([...Object.entries(adminState.users).filter(([, user]) => userRole(user) === "institute").map(([uid]) => uid), ...Object.keys(adminState.institutes).filter((uid) => adminState.institutes[uid]?.isAdminManaged)]);
    return [...ids]
        .filter((uid) => !isHiddenAdminUser(uid, adminState.users[uid] || {}))
        .map((uid) => {
            const user = adminState.users[uid] || {};
            const institute = adminState.institutes[uid] || {};
            return { uid, ...user, ...institute, fullName: user.fullName || institute.instituteName, instituteName: institute.instituteName || user.fullName, email: user.email || institute.email, phone: user.phone || institute.phone, photoURL: user.photoURL || institute.logoURL, accountStatus: user.accountStatus || institute.accountStatus || institute.status || "active" };
        })
        .sort((a, b) => getTime(b.createdAt) - getTime(a.createdAt));
}

function renderInstituteApprovals() {
    const tbody = document.getElementById("admin-institute-approvals-tbody");
    if (!tbody) return;
    const rows = getInstituteRows().filter((i) => ["pending", "under_review", "submitted"].includes(normalize(i.verificationStatus || i.approvalStatus || i.status || "pending")));
    const result = paginateRows(rows, "instituteApprovals");
    renderTablePagination("instituteApprovals", result, tbody);
    if (!rows.length) return showTableEmpty(tbody, 6, "No pending institute approvals.");

    tbody.innerHTML = result.rows.map((i) => `
        <tr>
            <td>${avatarCell({ ...i, fullName: i.instituteName || i.fullName }, "IN")}</td>
            <td>${escapeHtml(display(i.instituteType || "Institute"))}</td>
            <td>${contactCell(i.email, i.phone)}<br><small>${escapeHtml(display(i.district))}</small></td>
            <td><span class="badge ${statusBadgeClass(i.verificationStatus || i.approvalStatus || i.status || "pending")}">${escapeHtml(normalize(i.verificationStatus || i.approvalStatus || i.status || "pending"))}</span></td>
            <td>${progressMini(i.profileCompletion || 100)}</td>
            <td class="action-btns">
                <button class="btn btn-sm btn-info" data-view-institute="${i.uid}">View</button>
                <button class="btn btn-sm btn-success" data-approve-institute="${i.uid}">Approve</button>
                <button class="btn btn-sm btn-danger" data-reject-institute="${i.uid}">Reject</button>
            </td>
        </tr>
    `).join("");
    bindRowActions(tbody);
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
                ${normalize(c.status) === "active" 
                    ? `<button class="btn btn-sm btn-warning" data-course-status="${c.id}" data-status="inactive">Deactivate</button>`
                    : `<button class="btn btn-sm btn-success" data-course-status="${c.id}" data-status="active">Activate</button>`
                }
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
        academicCategoryId: value("course-academic-category"),
        academicCategoryTitle: adminState.academicCategories[value("course-academic-category")]?.title || "",
        courseCategoryId: value("course-category"),
        courseCategoryTitle: adminState.courseCategories[value("course-category")]?.title || "",
        category: adminState.courseCategories[value("course-category")]?.title || value("course-category"),
        matchingKeywords: talentList(value("course-keywords")),
        suitablePathways: selectedValues("course-pathways"),
        eligibleEducationLevels: talentList(value("course-education-levels")),
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
    setValue("course-academic-category", c.academicCategoryId || "");
    populateCourseCategorySelect();
    setValue("course-category", c.courseCategoryId || Object.entries(adminState.courseCategories).find(([,x]) => normalize(x.title) === normalize(c.courseCategoryTitle || c.category))?.[0] || "");
    setValue("course-keywords", talentList(c.matchingKeywords).join(", "));
    setSelectedValues("course-pathways", c.suitablePathways);
    setValue("course-education-levels", talentList(c.eligibleEducationLevels).join(", "));
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
                <button class="btn btn-sm btn-primary" data-edit-scholarship="${s.id}">Edit</button>
                ${normalize(s.status) === "active" 
                    ? `<button class="btn btn-sm btn-warning" data-scholarship-status="${s.id}" data-status="inactive">Deactivate</button>`
                    : `<button class="btn btn-sm btn-success" data-scholarship-status="${s.id}" data-status="active">Activate</button>`
                }
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
        scholarshipCategoryId: value("schol-category"),
        scholarshipCategoryTitle: adminState.scholarshipCategories[value("schol-category")]?.title || "",
        category: adminState.scholarshipCategories[value("schol-category")]?.title || value("schol-category"),
        relatedAcademicCategoryIds: selectedValues("schol-academic-categories"),
        relatedTalentCategoryIds: selectedValues("schol-talent-categories"),
        eligiblePathways: selectedValues("schol-pathways"),
        eligibleEducationLevels: talentList(value("schol-education-levels")),
        requiresFinancialNeed: checked("schol-financial-required"),
        requiresAcademicResults: checked("schol-results-required"),
        requiresTalentProfile: checked("schol-talent-required"),
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
    setValue("schol-category", s.scholarshipCategoryId || Object.entries(adminState.scholarshipCategories).find(([,x]) => normalize(x.title) === normalize(s.scholarshipCategoryTitle || s.category))?.[0] || "");
    setSelectedValues("schol-academic-categories", s.relatedAcademicCategoryIds);
    setSelectedValues("schol-talent-categories", s.relatedTalentCategoryIds);
    setSelectedValues("schol-pathways", s.eligiblePathways);
    setValue("schol-education-levels", talentList(s.eligibleEducationLevels).join(", "));
    setChecked("schol-financial-required", s.requiresFinancialNeed);
    setChecked("schol-results-required", s.requiresAcademicResults);
    setChecked("schol-talent-required", s.requiresTalentProfile);
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
    root.querySelectorAll("[data-view-student]").forEach((btn) => btn.addEventListener("click", () => openStudentDetailModal(btn.dataset.viewStudent)));
    root.querySelectorAll("[data-view-mentor]").forEach((btn) => btn.addEventListener("click", () => openMentorDetailModal(btn.dataset.viewMentor)));
    root.querySelectorAll("[data-view-institute]").forEach((btn) => btn.addEventListener("click", () => openInstituteDetailModal(btn.dataset.viewInstitute)));
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
    root.querySelectorAll("[data-view-course]").forEach((btn) => btn.addEventListener("click", () => openCourseDetailModal(adminState.courses[btn.dataset.viewCourse])));
    root.querySelectorAll("[data-course-status]").forEach((btn) => btn.addEventListener("click", () => updateCourseStatus(btn.dataset.courseStatus, btn.dataset.status)));
    root.querySelectorAll("[data-edit-scholarship]").forEach((btn) => btn.addEventListener("click", () => editScholarship(btn.dataset.editScholarship)));
    root.querySelectorAll("[data-view-scholarship]").forEach((btn) => btn.addEventListener("click", () => openScholarshipDetailModal(adminState.scholarships[btn.dataset.viewScholarship])));
    root.querySelectorAll("[data-scholarship-status]").forEach((btn) => btn.addEventListener("click", () => updateScholarshipStatus(btn.dataset.scholarshipStatus, btn.dataset.status)));
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
        [`institutes/${uid}/publicVisibility`]: approved,
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
    setText("badge-institute-approvals", countWhere(adminState.institutes, (i) => ["pending", "under_review", "submitted"].includes(normalize(i.verificationStatus || i.approvalStatus || i.status || "pending"))) || "");
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
    let val = document.getElementById(id)?.value.trim() || "";
    if (typeof val === 'string' && val.includes('github.com') && val.includes('/blob/')) {
        val = val.replace('github.com', 'raw.githubusercontent.com').replace('/blob/', '/');
    }
    return val;
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

// --- Category Migration Review ---
const categoryReviewDefinitions={courses:{label:"Course",required:["academic","course"],fields:{academic:"academicCategoryId",course:"courseCategoryId"}},scholarships:{label:"Scholarship",required:["scholarship"],fields:{scholarship:"scholarshipCategoryId",academic:"relatedAcademicCategoryIds",talent:"relatedTalentCategoryIds"}},mentors:{label:"Mentor",required:["mentor"],fields:{mentor:"expertiseCategoryIds",academic:"relatedAcademicCategoryIds",talent:"relatedTalentCategoryIds"}},institutes:{label:"Institute",required:["provider"],fields:{provider:"providerCategoryId",academic:"relatedAcademicCategoryIds",course:"relatedCourseCategoryIds",talent:"relatedTalentCategoryIds",opportunity:"relatedOpportunityCategoryIds"}},talentOpportunities:{label:"Talent Opportunity",required:["talent","opportunity"],fields:{talent:"categoryId",opportunity:"opportunityCategoryId"}}};
const categoryReviewPaths={academic:"academicCategories",course:"courseCategories",scholarship:"scholarshipCategories",mentor:"mentorExpertiseCategories",talent:"talentCategories",opportunity:"opportunityCategories",provider:"providerCategories"};
function reviewRecordTitle(path,item,id){return item.courseName||item.scholarshipName||item.fullName||item.instituteName||item.title||item.name||id;}
function reviewFieldMissing(item,field){const value=item[field];return value==null||value===""||Array.isArray(value)&&!value.length||typeof value==="object"&&!Array.isArray(value)&&!Object.keys(value).length;}
function categoryReviewRows(){const rows=[];for(const [path,definition] of Object.entries(categoryReviewDefinitions)){for(const [id,item] of Object.entries(adminState[path]||{})){const missing=definition.required.filter(type=>reviewFieldMissing(item,definition.fields[type]));rows.push({path,id,item,definition,missing,title:reviewRecordTitle(path,item,id)});}}return rows;}
function categoryReviewMatchesFilter(row,filter){if(filter==="all")return true;if(filter==="needs-review")return row.item.needsCategoryReview===true||row.missing.length>0;if(filter==="missing-academic")return row.path==="courses"&&reviewFieldMissing(row.item,"academicCategoryId");if(filter==="missing-course")return row.path==="courses"&&reviewFieldMissing(row.item,"courseCategoryId");if(filter==="missing-scholarship")return row.path==="scholarships"&&reviewFieldMissing(row.item,"scholarshipCategoryId");if(filter==="missing-mentor")return row.path==="mentors"&&reviewFieldMissing(row.item,"expertiseCategoryIds");if(filter==="missing-talent")return row.path==="talentOpportunities"&&reviewFieldMissing(row.item,"categoryId");if(filter==="missing-opportunity")return row.path==="talentOpportunities"&&reviewFieldMissing(row.item,"opportunityCategoryId");return false;}
function renderCategoryReview(){const tbody=document.getElementById("category-review-tbody");if(!tbody)return;const filter=value("category-review-filter")||"needs-review",q=normalize(value("category-review-search"));const all=categoryReviewRows(),rows=all.filter(row=>categoryReviewMatchesFilter(row,filter)&&(!q||normalize(`${row.title} ${row.path} ${row.item.category} ${row.item.field}`).includes(q)));const count=all.filter(row=>row.item.needsCategoryReview===true||row.missing.length).length;setText("badge-category-review",count||"");tbody.innerHTML=rows.length?rows.map(row=>{const assigned=Object.entries(row.definition.fields).map(([type,field])=>{const ids=talentList(row.item[field]);return ids.map(id=>adminState[categoryReviewPaths[type]]?.[id]?.title||id).join(", ");}).filter(Boolean).join(" / ")||row.item.category||row.item.field||"Unassigned";const reason=row.item.needsCategoryReview?"Low-confidence migration":row.missing.length?`Missing ${row.missing.join(" and ")} category`:"Categorized";return `<tr><td>${escapeHtml(row.definition.label)}</td><td><strong>${escapeHtml(row.title)}</strong><small>${escapeHtml(row.id)}</small></td><td>${escapeHtml(assigned)}</td><td>${escapeHtml(reason)}</td><td><button class="btn btn-primary btn-sm" data-review-assign="${escapeAttr(row.path)}:${escapeAttr(row.id)}">Assign Categories</button></td></tr>`;}).join(""):'<tr><td colspan="5" class="text-center p-4">No records match this review filter.</td></tr>';tbody.querySelectorAll("[data-review-assign]").forEach(button=>button.onclick=()=>{const [path,id]=button.dataset.reviewAssign.split(":");openCategoryReviewEditor(path,id);});}
function fillReviewSelect(type,value){const select=document.getElementById(`category-review-${type}`),path=categoryReviewPaths[type];if(!select)return;select.innerHTML=categoryOptions(path,"",true);select.value=talentList(value)[0]||"";}
function openCategoryReviewEditor(path,id){const definition=categoryReviewDefinitions[path],item=adminState[path]?.[id];if(!definition||!item)return;setValue("category-review-path",path);setValue("category-review-id",id);setText("category-review-editor-title",`Assign Categories - ${reviewRecordTitle(path,item,id)}`);for(const type of Object.keys(categoryReviewPaths)){const group=document.querySelector(`[data-review-field="${type}"]`),field=definition.fields[type];group?.classList.toggle("hidden",!field);if(field)fillReviewSelect(type,item[field]);}document.getElementById("category-review-editor")?.classList.remove("hidden");document.getElementById("category-review-editor")?.scrollIntoView({behavior:"smooth",block:"start"});}
function closeCategoryReviewEditor(){document.getElementById("category-review-form")?.reset();document.getElementById("category-review-editor")?.classList.add("hidden");}
async function saveCategoryReviewAssignment(event){event.preventDefault();const path=value("category-review-path"),id=value("category-review-id"),definition=categoryReviewDefinitions[path],item=adminState[path]?.[id];if(!definition||!item)return;const changes={};for(const [type,field] of Object.entries(definition.fields)){const selected=value(`category-review-${type}`);if(!selected)continue;const category=adminState[categoryReviewPaths[type]]?.[selected],isArray=field.endsWith("Ids");changes[field]=isArray?[selected]:selected;const titleField={academic:isArray?"relatedAcademicCategoryTitles":"academicCategoryTitle",course:isArray?"relatedCourseCategoryTitles":"courseCategoryTitle",scholarship:"scholarshipCategoryTitle",mentor:"expertiseCategoryTitles",talent:isArray?"relatedTalentCategoryTitles":path==="talentOpportunities"?"categoryTitle":"talentCategoryTitle",opportunity:isArray?"relatedOpportunityCategoryTitles":"opportunityCategoryTitle",provider:"providerCategoryTitle"}[type];if(titleField)changes[titleField]=isArray?[category?.title||selected]:category?.title||selected;if(path==="talentOpportunities"&&type==="talent"){changes.talentCategoryId=selected;changes.talentCategoryTitle=category?.title||selected;changes.mainType=category?.mainType||item.mainType||"";}if(path==="talentOpportunities"&&type==="opportunity")changes.opportunityType=category?.title||selected;}
 const stillMissing=definition.required.some(type=>!changes[definition.fields[type]]&&reviewFieldMissing(item,definition.fields[type]));if(stillMissing)return showToast("Assign every required category before saving.","error");changes.needsCategoryReview=false;changes.categoryMigration={...(item.categoryMigration||{}),manuallyReviewed:true,reviewedAt:serverTimestamp(),reviewedBy:adminState.adminUid,migrationVersion:"category-backfill-v1"};changes.updatedAt=serverTimestamp();try{await update(ref(database,`${path}/${id}`),changes);closeCategoryReviewEditor();showToast("Category assignment saved.","success");}catch(error){console.error(error);showToast("Category assignment failed.","error");}}
// --- Reusable Category CMS ---
const categoryCmsConfig = {
    academicCategories:{label:"Academic",prefix:"academic"},courseCategories:{label:"Course",prefix:"course"},scholarshipCategories:{label:"Scholarship",prefix:"scholarship"},mentorExpertiseCategories:{label:"Mentor Expertise",prefix:"mentor"},talentCategories:{label:"Talent",prefix:"talent"},opportunityCategories:{label:"Opportunity",prefix:"opportunity"},providerCategories:{label:"Provider",prefix:"provider"}
};
function currentCategoryPath(){return value("category-cms-path")||"academicCategories";}
function categorySlug(text){return String(text||"").trim().toLowerCase().replace(/&/g," and ").replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"");}
function categoryOptions(path,selected="",includeHidden=false){return '<option value="">Select category</option>'+Object.entries(adminState[path]||{}).filter(([,c])=>includeHidden||(normalize(c.status)==="active"&&c.publicVisibility!==false)).sort(([,a],[,b])=>(Number(a.sortOrder)||100)-(Number(b.sortOrder)||100)||display(a.title).localeCompare(display(b.title))).map(([id,c])=>`<option value="${escapeAttr(c.categoryId||id)}" ${(c.categoryId||id)===selected?"selected":""}>${escapeHtml(c.title||c.name||id)}</option>`).join("");}
function fillSelect(id,path,multiple=false){const el=document.getElementById(id);if(!el)return;const old=multiple?selectedValues(id):el.value;el.innerHTML=(multiple?"":'<option value="">Select category</option>')+Object.entries(adminState[path]||{}).filter(([,c])=>normalize(c.status)==="active"&&c.publicVisibility!==false).sort(([,a],[,b])=>(Number(a.sortOrder)||100)-(Number(b.sortOrder)||100)).map(([key,c])=>`<option value="${escapeAttr(c.categoryId||key)}">${escapeHtml(c.title||c.name||key)}</option>`).join("");if(multiple)setSelectedValues(id,old);else el.value=old;}
function populateMasterCategorySelects(){fillSelect("course-academic-category","academicCategories");populateCourseCategorySelect();fillSelect("schol-category","scholarshipCategories");fillSelect("schol-academic-categories","academicCategories",true);fillSelect("schol-talent-categories","talentCategories",true);fillSelect("manual-mentor-expertise","mentorExpertiseCategories",true);fillSelect("manual-mentor-academic","academicCategories",true);fillSelect("manual-mentor-talent","talentCategories",true);fillSelect("admin-institute-provider-category","providerCategories");fillSelect("admin-institute-course-categories","courseCategories",true);fillSelect("admin-institute-talent-categories","talentCategories",true);fillSelect("admin-institute-opportunity-categories","opportunityCategories",true);const parent=document.getElementById("category-cms-parent");if(parent)parent.innerHTML=categoryOptions("academicCategories");const type=document.getElementById("talent-opportunity-type");if(type&&Object.keys(adminState.opportunityCategories).length){const old=type.value;type.innerHTML=categoryOptions("opportunityCategories").replace("Select category","Select opportunity type");type.value=old;}}
function populateCourseCategorySelect(){const select=document.getElementById("course-category");if(!select)return;const academicId=value("course-academic-category"),old=select.value;select.innerHTML='<option value="">Select course category</option>'+Object.entries(adminState.courseCategories||{}).filter(([,c])=>normalize(c.status)==="active"&&c.publicVisibility!==false&&(!academicId||!c.academicCategoryId||c.academicCategoryId===academicId)).map(([id,c])=>`<option value="${escapeAttr(c.categoryId||id)}">${escapeHtml(c.title||c.name||id)}</option>`).join("");select.value=old;}
function resetCategoryCmsForm(){adminState.editingCategoryCmsId=null;document.getElementById("category-cms-form")?.reset();setChecked("category-cms-public",true);setValue("category-cms-sort","100");document.getElementById("category-cms-id")?.removeAttribute("readonly");document.getElementById("category-cms-form-card")?.classList.add("hidden");setText("category-cms-form-title","Add Category");}
function openCategoryCmsForm(){populateMasterCategorySelects();document.getElementById("category-cms-form-card")?.classList.remove("hidden");document.getElementById("category-cms-title")?.focus();}
function categoryCmsPayload(){let metadata={};const raw=value("category-cms-metadata");if(raw){try{metadata=JSON.parse(raw);}catch(_){throw new Error("Advanced metadata must be valid JSON.");}}const path=currentCategoryPath(),prefix=categoryCmsConfig[path].prefix,title=value("category-cms-title"),id=adminState.editingCategoryCmsId||categorySlug(value("category-cms-id"))||`${prefix}_${categorySlug(title)}`;return{id,payload:{...metadata,categoryId:id,title,slug:categorySlug(title),description:value("category-cms-description"),mainField:value("category-cms-main-field"),mainType:metadata.mainType||value("category-cms-main-field"),academicCategoryId:value("category-cms-parent")||metadata.academicCategoryId||"",matchingKeywords:talentList(value("category-cms-keywords")),status:value("category-cms-status")||"active",publicVisibility:checked("category-cms-public"),sortOrder:Number(value("category-cms-sort"))||100}};}
async function saveCategoryCms(event){event.preventDefault();try{const path=currentCategoryPath(),{id,payload}=categoryCmsPayload(),existing=adminState[path]?.[id];if(!payload.title)return showToast("Category title is required.","error");if(!adminState.editingCategoryCmsId&&existing)return showToast("Duplicate category ID is not allowed.","error");await set(ref(database,`${path}/${id}`),{...(existing||{}),...payload,createdAt:existing?.createdAt||serverTimestamp(),updatedAt:serverTimestamp(),createdBy:existing?.createdBy||adminState.adminUid});resetCategoryCmsForm();showToast("Category saved.","success");}catch(error){console.error(error);showToast(error.message||"Category save failed.","error");}}
function renderCategoryCms(){const tbody=document.getElementById("category-cms-tbody");if(!tbody)return;const path=currentCategoryPath(),q=normalize(value("category-cms-search"));const rows=Object.entries(adminState[path]||{}).filter(([id,c])=>!q||normalize(`${id} ${c.title} ${c.mainField} ${c.mainType}`).includes(q)).sort(([,a],[,b])=>(Number(a.sortOrder)||100)-(Number(b.sortOrder)||100));tbody.innerHTML=rows.length?rows.map(([id,c])=>`<tr><td>${Number(c.sortOrder)||100}</td><td><strong>${escapeHtml(c.title||c.name||id)}</strong></td><td>${escapeHtml(c.categoryId||id)}</td><td>${escapeHtml(c.mainField||c.mainType||c.scholarshipType||c.mentorType||"—")}</td><td><span class="badge ${normalize(c.status)==="active"?"badge-active":"badge-pending"}">${escapeHtml(c.status||"inactive")}</span></td><td>${c.publicVisibility===false?"Hidden":"Public"}</td><td><button class="btn btn-primary btn-sm" data-cms-edit="${escapeAttr(id)}">Edit</button> <button class="btn btn-danger btn-sm" data-cms-archive="${escapeAttr(id)}">Archive</button></td></tr>`).join(""):'<tr><td colspan="7" class="text-center p-4">No categories found.</td></tr>';tbody.querySelectorAll("[data-cms-edit]").forEach(b=>b.onclick=()=>editCategoryCms(b.dataset.cmsEdit));tbody.querySelectorAll("[data-cms-archive]").forEach(b=>b.onclick=()=>archiveCategoryCms(b.dataset.cmsArchive));}
function editCategoryCms(id){const path=currentCategoryPath(),c=adminState[path]?.[id];if(!c)return;adminState.editingCategoryCmsId=id;setValue("category-cms-title",c.title||c.name);setValue("category-cms-id",c.categoryId||id);document.getElementById("category-cms-id")?.setAttribute("readonly","");setValue("category-cms-main-field",c.mainField||c.mainType||c.scholarshipType||c.mentorType);setValue("category-cms-parent",c.academicCategoryId);setValue("category-cms-description",c.description);setValue("category-cms-keywords",talentList(c.matchingKeywords).join(", "));const common=new Set(["categoryId","title","name","slug","description","mainField","mainType","academicCategoryId","matchingKeywords","status","publicVisibility","sortOrder","createdAt","updatedAt","createdBy"]);const metadata=Object.fromEntries(Object.entries(c).filter(([key])=>!common.has(key)));setValue("category-cms-metadata",Object.keys(metadata).length?JSON.stringify(metadata,null,2):"");setValue("category-cms-sort",c.sortOrder||100);setValue("category-cms-status",c.status||"active");setChecked("category-cms-public",c.publicVisibility!==false);setText("category-cms-form-title","Edit Category");openCategoryCmsForm();}
async function archiveCategoryCms(id){if(!confirm("Archive this category? Existing content will remain unchanged."))return;try{await update(ref(database,`${currentCategoryPath()}/${id}`),{status:"archived",publicVisibility:false,updatedAt:serverTimestamp()});showToast("Category archived.","success");}catch(error){console.error(error);showToast("Category archive failed.","error");}}
async function saveAdminInstitute(event){event.preventDefault();const name=value("admin-institute-name"),providerCategoryId=value("admin-institute-provider-category");if(!name||!providerCategoryId)return showToast("Institute name and provider category are required.","error");const base=`institute_${categorySlug(name)}`,id=adminState.institutes[base]?`${base}_${Date.now()}`:base;try{await set(ref(database,`institutes/${id}`),{uid:id,instituteId:id,isAdminManaged:true,loginEnabled:false,instituteName:name,name,email:value("admin-institute-email"),phone:value("admin-institute-phone"),district:value("admin-institute-district"),location:value("admin-institute-district"),providerCategoryId,providerCategoryTitle:adminState.providerCategories[providerCategoryId]?.title||providerCategoryId,relatedCourseCategoryIds:selectedValues("admin-institute-course-categories"),relatedTalentCategoryIds:selectedValues("admin-institute-talent-categories"),relatedOpportunityCategoryIds:selectedValues("admin-institute-opportunity-categories"),description:value("admin-institute-description"),status:value("admin-institute-status")||"active",approvalStatus:"approved",verificationStatus:"approved",accountStatus:"active",publicVisibility:checked("admin-institute-public"),featured:checked("admin-institute-featured"),showOnHomePage:checked("admin-institute-home"),createdByAdminUid:adminState.adminUid,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});event.currentTarget.reset();document.getElementById("admin-institute-form-card")?.classList.add("hidden");showToast("Institute profile created.","success");}catch(error){console.error(error);showToast("Institute save failed.","error");}}
async function saveManualMentor(event){event.preventDefault();const name=value("manual-mentor-name"),expertiseIds=selectedValues("manual-mentor-expertise");if(!name||!value("manual-mentor-type")||!expertiseIds.length)return showToast("Name, mentor type, and expertise category are required.","error");const base=`mentor_${categorySlug(value("manual-mentor-field")||value("manual-mentor-type"))}`,numbers=Object.keys(adminState.mentors).filter(id=>id.startsWith(base)).map(id=>Number(id.match(/_(\d+)$/)?.[1])||0),mentorId=`${base}_${String(Math.max(0,...numbers)+1).padStart(3,"0")}`;const titles=expertiseIds.map(id=>adminState.mentorExpertiseCategories[id]?.title||id);try{await set(ref(database,`mentors/${mentorId}`),{uid:mentorId,mentorId,isManualProfile:true,loginEnabled:false,fullName:name,displayName:name,email:value("manual-mentor-email"),phone:value("manual-mentor-phone"),status:"approved",approvalStatus:"approved",accountStatus:"active",publicVisibility:true,mentoringEnabled:true,mentorType:value("manual-mentor-type"),expertiseCategoryIds:expertiseIds,expertiseCategoryTitles:titles,relatedAcademicCategoryIds:selectedValues("manual-mentor-academic"),relatedTalentCategoryIds:selectedValues("manual-mentor-talent"),field:value("manual-mentor-field")||titles.join(", "),expertise:titles,role:value("manual-mentor-role"),organization:value("manual-mentor-organization"),guidanceAreas:talentList(value("manual-mentor-guidance")),supportedStudentLevels:talentList(value("manual-mentor-student-levels")),supportedSkillLevels:talentList(value("manual-mentor-skill-levels")),languages:talentList(value("manual-mentor-languages")),mentoringModes:talentList(value("manual-mentor-modes")),location:value("manual-mentor-location"),district:value("manual-mentor-location"),availability:"Contact admin to arrange guidance",experienceYears:Number(value("manual-mentor-experience"))||0,rating:0,capacity:10,bio:value("manual-mentor-bio"),createdByAdminUid:adminState.adminUid,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});event.currentTarget.reset();document.getElementById("manual-mentor-form-card")?.classList.add("hidden");showToast("Manual mentor profile created.","success");}catch(error){console.error(error);showToast("Manual mentor creation failed.","error");}}
// --- Talent & Opportunities System ---
const talentList = (value) => Array.isArray(value) ? value.filter(Boolean) : value && typeof value === "object" ? Object.values(value).filter(Boolean) : String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
const selectedValues = (id) => [...(document.getElementById(id)?.selectedOptions || [])].map((option) => option.value).filter(Boolean);
const checked = (id) => Boolean(document.getElementById(id)?.checked);
function setChecked(id, state) { const element = document.getElementById(id); if (element) element.checked = Boolean(state); }
function setSelectedValues(id, values) { const selected = new Set(talentList(values)); [...(document.getElementById(id)?.options || [])].forEach((option) => { option.selected = selected.has(option.value); }); }
function talentCategoryId(title) { return String(title || "").trim().toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""); }
function activeTalentCategories() { return Object.entries(adminState.talentCategories || {}).filter(([, category]) => normalize(category.status) === "active" && category.publicVisibility === true && category.showInOpportunityFilters !== false); }
function openTalentForm(cardId, focusId) { document.getElementById(cardId)?.classList.remove("hidden"); document.getElementById(cardId)?.scrollIntoView({behavior:"smooth",block:"start"}); setTimeout(() => document.getElementById(focusId)?.focus(), 200); }
function closeTalentForm(cardId, formId) { document.getElementById(formId)?.reset(); document.getElementById(cardId)?.classList.add("hidden"); if (formId === "talent-category-form") adminState.editingTalentCategoryId = null; if (formId === "talent-opportunity-form") adminState.editingTalentOpportunityId = null; }
function toggleTalentForm(cardId, focusId) { if (cardId === "talent-category-form-card") resetTalentCategoryForm(); else resetTalentOpportunityForm(); openTalentForm(cardId, focusId); }
function populateTalentCategoryOptions(selectedId = "") {
    const select = document.getElementById("talent-opportunity-category"); if (!select) return;
    select.innerHTML = '<option value="">Select an active category</option>' + activeTalentCategories().sort(([,a],[,b]) => display(a.title||a.name).localeCompare(display(b.title||b.name))).map(([id, category]) => `<option value="${escapeAttr(category.categoryId || id)}">${escapeHtml(category.title || category.name || id)}</option>`).join("");
    select.value = selectedId; updateTalentOpportunityDependencies();
}
function updateTalentOpportunityDependencies() {
    const id = value("talent-opportunity-category"); const category = adminState.talentCategories[id] || Object.values(adminState.talentCategories).find((item) => item.categoryId === id) || {};
    const subs = talentList(category.subCategories || category.subcategories); const subSelect = document.getElementById("talent-opportunity-subcategory"); const manual = document.getElementById("talent-opportunity-subcategory-manual");
    if (subSelect) { subSelect.innerHTML = subs.length ? '<option value="">Select subcategory</option>' + subs.map((item) => `<option>${escapeHtml(item)}</option>`).join("") : '<option value="">No defined subcategories</option>'; subSelect.disabled = !subs.length; }
    manual?.classList.toggle("hidden", subs.length > 0); if (!value("talent-opportunity-talent-types")) setValue("talent-opportunity-talent-types", subs.join(", "));
    const mentorSelect = document.getElementById("talent-opportunity-mentors"); if (mentorSelect) mentorSelect.innerHTML = Object.entries(adminState.mentors).filter(([,m]) => normalize(m.approvalStatus || m.status) === "approved" && (!id || [m.supportedTalentCategories,m.talentCategories,m.expertise,m.field].some((field) => normalize(display(field)).includes(normalize(category.title || category.name || id))))).map(([uid,m]) => `<option value="${escapeAttr(uid)}">${escapeHtml(m.fullName || adminState.users[uid]?.fullName || "Mentor")}</option>`).join("");
    const instituteSelect = document.getElementById("talent-opportunity-institute"); if (instituteSelect && instituteSelect.options.length <= 1) instituteSelect.innerHTML = '<option value="">None</option>' + Object.entries(adminState.institutes).filter(([,i]) => ["active","approved"].includes(normalize(i.status || i.approvalStatus))).map(([uid,i]) => `<option value="${escapeAttr(uid)}">${escapeHtml(i.name || i.instituteName || adminState.users[uid]?.fullName || "Institute")}</option>`).join("");
}
function resetTalentCategoryForm() { adminState.editingTalentCategoryId=null; document.getElementById("talent-category-form")?.reset(); setChecked("talent-category-public",true); setChecked("talent-category-filter",true); setText("talent-category-form-title","Add Talent Category"); setText("talent-category-submit-label","Save Category"); document.getElementById("talent-category-id")?.removeAttribute("readonly"); }
function resetTalentOpportunityForm() { adminState.editingTalentOpportunityId=null; document.getElementById("talent-opportunity-form")?.reset(); setChecked("talent-opportunity-public",true); setChecked("talent-opportunity-home",true); setChecked("talent-opportunity-dashboard",true); setText("talent-opportunity-form-title","Add Talent Opportunity"); setText("talent-opportunity-submit-label","Save Opportunity"); populateTalentCategoryOptions(); }
async function saveTalentCategory(event) {
    event.preventDefault(); const title=value("talent-category-title"), id=adminState.editingTalentCategoryId || talentCategoryId(value("talent-category-id") || title); if(!title||!id||!value("talent-category-main-type")) return showToast("Title and main type are required.","error");
    const existing=adminState.talentCategories[id]; if(!adminState.editingTalentCategoryId && existing) return showToast("That category ID already exists.","error");
    try { await set(ref(database,`talentCategories/${id}`),{...(existing||{}),categoryId:id,title,name:title,mainType:value("talent-category-main-type"),subCategories:talentList(value("talent-category-subcategories")),description:value("talent-category-description"),status:value("talent-category-status")||"active",publicVisibility:checked("talent-category-public"),showInOpportunityFilters:checked("talent-category-filter"),createdBy:existing?.createdBy||adminState.adminUid,createdAt:existing?.createdAt||serverTimestamp(),updatedAt:serverTimestamp()}); closeTalentForm("talent-category-form-card","talent-category-form"); showToast("Talent category saved.","success"); } catch(error){console.error(error);showToast("Talent category save failed. Deploy the updated Firebase rules if permission is denied.","error");}
}
function editTalentCategory(id) { const c=adminState.talentCategories[id]; if(!c)return; adminState.editingTalentCategoryId=id; setValue("talent-category-id",c.categoryId||id); document.getElementById("talent-category-id")?.setAttribute("readonly",""); setValue("talent-category-title",c.title||c.name); setValue("talent-category-main-type",c.mainType); setValue("talent-category-subcategories",talentList(c.subCategories||c.subcategories).join(", ")); setValue("talent-category-description",c.description); setValue("talent-category-status",c.status||"active"); setChecked("talent-category-public",c.publicVisibility===true); setChecked("talent-category-filter",c.showInOpportunityFilters!==false); setText("talent-category-form-title","Edit Talent Category"); setText("talent-category-submit-label","Save Changes"); openTalentForm("talent-category-form-card","talent-category-title"); }
function opportunityPayload(existing={}) { const categoryId=value("talent-opportunity-category"), category=adminState.talentCategories[categoryId]||{}, categoryTitle=category.title||category.name||existing.categoryTitle||existing.category||""; const subSelect=document.getElementById("talent-opportunity-subcategory"); const subCategory=subSelect&&!subSelect.disabled?subSelect.value:value("talent-opportunity-subcategory-manual"); return {title:value("talent-opportunity-title"),provider:value("talent-opportunity-provider"),organizer:value("talent-opportunity-organizer")||value("talent-opportunity-provider"),categoryId,categoryTitle,category:categoryTitle,mainType:category.mainType||existing.mainType||"",subCategory,talentTypes:talentList(value("talent-opportunity-talent-types")),opportunityCategoryId:value("talent-opportunity-type"),opportunityCategoryTitle:adminState.opportunityCategories[value("talent-opportunity-type")]?.title||value("talent-opportunity-type"),opportunityType:adminState.opportunityCategories[value("talent-opportunity-type")]?.title||value("talent-opportunity-type"),type:adminState.opportunityCategories[value("talent-opportunity-type")]?.title||value("talent-opportunity-type"),description:value("talent-opportunity-description"),eligibleSkillLevels:selectedValues("talent-opportunity-skill-levels"),eligibleEducationLevels:selectedValues("talent-opportunity-education-levels"),eligibleAgeMin:Number(value("talent-opportunity-age-min"))||null,eligibleAgeMax:Number(value("talent-opportunity-age-max"))||null,location:value("talent-opportunity-location"),district:value("talent-opportunity-district"),mode:value("talent-opportunity-mode"),feeType:value("talent-opportunity-fee-type"),fee:Number(value("talent-opportunity-fee"))||0,deadline:value("talent-opportunity-deadline"),eventDate:value("talent-opportunity-event-date"),eligibility:value("talent-opportunity-eligibility"),requirements:value("talent-opportunity-requirements"),applicationUrl:value("talent-opportunity-link"),applicationLink:value("talent-opportunity-link"),applyLink:value("talent-opportunity-link"),imageURL:sanitizeImageURL(value("talent-opportunity-image"),"","images"),relatedMentorIds:selectedValues("talent-opportunity-mentors"),linkedInstituteId:value("talent-opportunity-institute"),matchingKeywords:talentList(value("talent-opportunity-keywords")),publicVisibility:checked("talent-opportunity-public"),featured:checked("talent-opportunity-featured"),showOnHomePage:checked("talent-opportunity-home"),showOnStudentDashboard:checked("talent-opportunity-dashboard"),ongoing:checked("talent-opportunity-ongoing"),status:value("talent-opportunity-status")||"draft"}; }
async function saveTalentOpportunity(event) { event.preventDefault(); const id=adminState.editingTalentOpportunityId, existing=id?adminState.talentOpportunities[id]||{}:{}, payload=opportunityPayload(existing); if(!payload.title||!payload.provider||!payload.categoryId||!payload.opportunityType)return showToast("Title, provider, category, and opportunity type are required.","error"); if(payload.eligibleAgeMin&&payload.eligibleAgeMax&&payload.eligibleAgeMin>payload.eligibleAgeMax)return showToast("Minimum age cannot exceed maximum age.","error"); try{const target=id?ref(database,`talentOpportunities/${id}`):push(ref(database,"talentOpportunities")); const opportunityId=id||target.key; await set(target,{...existing,...payload,opportunityId,createdBy:existing.createdBy||adminState.adminUid,createdAt:existing.createdAt||serverTimestamp(),updatedAt:serverTimestamp()}); closeTalentForm("talent-opportunity-form-card","talent-opportunity-form");showToast("Talent opportunity saved.","success");}catch(error){console.error(error);showToast("Talent opportunity save failed.","error");} }
function editTalentOpportunity(id) { const o=adminState.talentOpportunities[id];if(!o)return;adminState.editingTalentOpportunityId=id; const fields={"talent-opportunity-title":o.title,"talent-opportunity-provider":o.provider,"talent-opportunity-organizer":o.organizer,"talent-opportunity-type":o.opportunityCategoryId||Object.entries(adminState.opportunityCategories).find(([,x])=>normalize(x.title)===normalize(o.opportunityCategoryTitle||o.opportunityType||o.type))?.[0]||o.opportunityType||o.type,"talent-opportunity-description":o.description,"talent-opportunity-age-min":o.eligibleAgeMin,"talent-opportunity-age-max":o.eligibleAgeMax,"talent-opportunity-mode":o.mode,"talent-opportunity-fee-type":o.feeType,"talent-opportunity-fee":o.fee,"talent-opportunity-location":o.location,"talent-opportunity-district":o.district,"talent-opportunity-deadline":o.deadline,"talent-opportunity-event-date":o.eventDate,"talent-opportunity-eligibility":o.eligibility,"talent-opportunity-requirements":o.requirements,"talent-opportunity-keywords":talentList(o.matchingKeywords).join(", "),"talent-opportunity-talent-types":talentList(o.talentTypes).join(", "),"talent-opportunity-link":o.applicationUrl||o.applicationLink||o.applyLink,"talent-opportunity-image":o.imageURL||o.imagePath,"talent-opportunity-status":o.status||"draft"};Object.entries(fields).forEach(([key,val])=>setValue(key,val)); populateTalentCategoryOptions(o.categoryId||Object.entries(adminState.talentCategories).find(([,c])=>normalize(c.title||c.name)===normalize(o.categoryTitle||o.category))?.[0]||""); updateTalentOpportunityDependencies(); const sub=document.getElementById("talent-opportunity-subcategory");if(sub&&[...sub.options].some(x=>x.value===o.subCategory))sub.value=o.subCategory;else setValue("talent-opportunity-subcategory-manual",o.subCategory);setSelectedValues("talent-opportunity-skill-levels",o.eligibleSkillLevels);setSelectedValues("talent-opportunity-education-levels",o.eligibleEducationLevels);setSelectedValues("talent-opportunity-mentors",o.relatedMentorIds);setValue("talent-opportunity-institute",o.linkedInstituteId);setChecked("talent-opportunity-public",o.publicVisibility!==false);setChecked("talent-opportunity-featured",o.featured);setChecked("talent-opportunity-home",o.showOnHomePage!==false);setChecked("talent-opportunity-dashboard",o.showOnStudentDashboard!==false);setChecked("talent-opportunity-ongoing",o.ongoing);setText("talent-opportunity-form-title","Edit Talent Opportunity");setText("talent-opportunity-submit-label","Save Changes");openTalentForm("talent-opportunity-form-card","talent-opportunity-title"); }
async function archiveTalentOpportunity(id) { if(!confirm("Archive this talent opportunity?"))return;try{await update(ref(database,`talentOpportunities/${id}`),{status:"archived",publicVisibility:false,updatedAt:serverTimestamp()});showToast("Opportunity archived.","success");}catch(error){console.error(error);showToast("Opportunity could not be archived.","error");} }
function renderTalentCategories() { const tbody=document.getElementById("admin-talent-categories-tbody");if(!tbody)return;const rows=Object.entries(adminState.talentCategories||{});tbody.innerHTML=rows.length?rows.map(([id,c])=>`<tr><td>${escapeHtml(c.categoryId||id)}</td><td>${escapeHtml(c.title||c.name||id)}</td><td>${escapeHtml(c.mainType||"Other")}</td><td>${escapeHtml(talentList(c.subCategories||c.subcategories).join(", ")||"—")}</td><td><span class="badge ${normalize(c.status)==="active"?"badge-active":"badge-pending"}">${escapeHtml(c.status||"inactive")}</span></td><td><button class="btn btn-primary btn-sm" data-edit-talent-category="${escapeAttr(id)}">Edit</button></td></tr>`).join(""):'<tr><td colspan="6" class="text-center p-4">No talent categories found.</td></tr>'; }
function renderTalentOpportunities() { const tbody=document.getElementById("admin-talent-opportunities-tbody");if(!tbody)return;const rows=Object.entries(adminState.talentOpportunities||{}).sort(([,a],[,b])=>getTime(b.updatedAt||b.createdAt)-getTime(a.updatedAt||a.createdAt));tbody.innerHTML=rows.length?rows.map(([id,o])=>`<tr><td><strong>${escapeHtml(o.title||"Untitled")}</strong>${o.featured?'<span class="badge badge-info">Featured</span>':""}</td><td>${escapeHtml(o.provider||o.organization||"Unknown")}</td><td>${escapeHtml(o.categoryTitle||o.category||"General")}</td><td>${escapeHtml(o.subCategory||"—")}</td><td>${escapeHtml(o.opportunityType||o.type||"General")}</td><td>${escapeHtml(o.ongoing?"Ongoing":o.deadline||"—")}</td><td>${escapeHtml(o.location||o.district||"—")}</td><td>${escapeHtml(o.mode||"—")}</td><td><span class="badge ${normalize(o.status)==="active"?"badge-active":"badge-pending"}">${escapeHtml(o.status||"draft")}</span></td><td>${o.publicVisibility===false?"Hidden":"Public"}</td><td><button class="btn btn-primary btn-sm" data-edit-talent-opportunity="${escapeAttr(id)}">Edit</button> <button class="btn btn-danger btn-sm" data-archive-talent-opportunity="${escapeAttr(id)}">Archive</button></td></tr>`).join(""):'<tr><td colspan="11" class="text-center p-4">No talent opportunities found.</td></tr>'; }
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

function updateRecommendationDebugStatus(){const enabled=localStorage.getItem("debugRecommendations")==="true";const status=document.getElementById("recommendation-debug-status");if(status){status.textContent=`Debug Mode: ${enabled?"Enabled":"Disabled"}`;status.classList.toggle("text-success",enabled);}}
function bindRecommendationTesting() {
    updateRecommendationDebugStatus();
    document.getElementById("run-all-recommendation-tests")?.addEventListener("click", () => renderRecommendationTestResults(runRecommendationTestSuite()));
    document.querySelectorAll("[data-recommendation-test]").forEach((button) => button.addEventListener("click", () => {
        const tests = {
            combined_business_dancing: testCombinedBusinessDancingStudent,
            talent_only_dancing: testTalentOnlyDancingStudent,
            academic_business: testAcademicBusinessStudent,
            academic_engineering: testAcademicEngineeringStudent,
            undecided: testUndecidedStudent
        };
        const testName = button.dataset.recommendationTest;
        document.querySelectorAll("[data-recommendation-test]").forEach((item) => item.classList.toggle("active", item === button));
        const loading = document.getElementById("recommendation-test-loading");
        const root = document.getElementById("recommendation-test-results");
        loading?.classList.remove("hidden");
        if (root) root.innerHTML = "";
        const results = testName === "all" ? runRecommendationTestSuite() : tests[testName] ? [tests[testName]()] : [];
        loading?.classList.add("hidden");
        if (results.length) { const status=results.every(test=>test.pass)?"PASS":"FAIL"; document.querySelectorAll("[data-scenario-status]").forEach(label=>{if(testName==="all"||label.dataset.scenarioStatus===testName){label.textContent=status;label.className=status.toLowerCase();}}); renderRecommendationTestResults(results); root?.scrollIntoView({ behavior: "smooth", block: "start" }); }
    }));
    document.getElementById("enable-recommendation-debug")?.addEventListener("click",()=>{localStorage.setItem("debugRecommendations","true");updateRecommendationDebugStatus();showToast("Debug mode enabled. Run tests again to view detailed console logs.","success");});
    document.getElementById("disable-recommendation-debug")?.addEventListener("click",()=>{localStorage.removeItem("debugRecommendations");updateRecommendationDebugStatus();showToast("Debug mode disabled.","success");});
    document.addEventListener("click",(event)=>{const button=event.target.closest("[data-recommendation-debug-key]");if(!button)return;const row=recommendationDebugRows[button.dataset.recommendationDebugKey];if(!row)return;console.group("[Recommendation Debug] "+recommendationItemTitle(row));console.log(row);console.groupEnd();showToast("Debug score written to the browser console.","success");});
document.addEventListener("click",(event)=>{const add=event.target.closest("[data-add-recommendation-record]");if(add)setTimeout(()=>document.getElementById(add.dataset.addRecommendationRecord)?.click(),0);const review=event.target.closest("[data-category-review-record]");if(review){event.preventDefault();event.stopImmediatePropagation();showAdminSection("category-review");setValue("category-review-filter","all");setValue("category-review-search",review.dataset.categoryReviewTitle||review.dataset.categoryReviewRecord);renderCategoryReview();const row=categoryReviewRows().find(x=>x.id===review.dataset.categoryReviewRecord);if(row)openCategoryReviewEditor(row.path,row.id);}const focus=event.target.closest("[data-focus-recommendation-record]");if(focus){const id=focus.dataset.focusRecommendationRecord,type=focus.dataset.recommendationRecordType;sessionStorage.setItem("adminRecommendationFocusRecord",id);setTimeout(()=>{if(type==="courses")editCourse(id);else if(type==="scholarships")editScholarship(id);else if(type==="opportunities")editTalentOpportunity(id);else showToast("Opened the related "+type+" record: "+id+".","info");},0);}});
}

function recommendationDataIssues() {
    const issues = [];
    Object.entries(adminState.courses || {}).forEach(([id, item]) => {
        if (!item.academicCategoryId) issues.push({ type: "Course", id, issue: "Missing academicCategoryId" });
        if (!item.courseCategoryId) issues.push({ type: "Course", id, issue: "Missing courseCategoryId" });
    });
    Object.entries(adminState.mentors || {}).forEach(([id, item]) => {
        if (!Array.isArray(item.expertiseCategoryIds) || !item.expertiseCategoryIds.length) issues.push({ type: "Mentor", id, issue: "Missing expertiseCategoryIds" });
        if ((!item.relatedAcademicCategoryIds?.length) && (!item.relatedTalentCategoryIds?.length)) issues.push({ type: "Mentor", id, issue: "Missing related academic/talent categories" });
    });
    Object.entries(adminState.scholarships || {}).forEach(([id, item]) => {
        if (!item.scholarshipCategoryId) issues.push({ type: "Scholarship", id, issue: "Missing scholarshipCategoryId" });
    });
    Object.entries(adminState.institutes || {}).forEach(([id, item]) => {
        if ((!item.relatedAcademicCategoryIds?.length) && (!item.relatedTalentCategoryIds?.length) && (!item.relatedCourseCategoryIds?.length)) issues.push({ type: "Institute", id, issue: "Missing related categories" });
    });
    Object.entries(adminState.talentOpportunities || {}).forEach(([id, item]) => {
        if (!item.categoryId) issues.push({ type: "Opportunity", id, issue: "Missing categoryId" });
        if (!item.opportunityCategoryId) issues.push({ type: "Opportunity", id, issue: "Missing opportunityCategoryId" });
    });
    return issues;
}

const recommendationTypeConfig = { courses:{label:"Courses",section:"manage-courses",fix:"Assign Academic Category and Course Category."}, scholarships:{label:"Scholarships",section:"manage-scholarships",fix:"Assign Scholarship Category and related Academic/Talent Categories."}, mentors:{label:"Mentors",section:"manage-mentors",fix:"Assign Mentor Expertise and related Academic/Talent Categories."}, institutes:{label:"Institutes",section:"manage-institutes",fix:"Assign Provider and related Academic/Talent/Course Categories."}, opportunities:{label:"Talent Opportunities",section:"manage-talent-opportunities",fix:"Assign Talent Category and Opportunity Category."} };
let recommendationDebugRows={};
let lastRecommendationTests=[];
function recommendationItemTitle(row){return row?.courseName||row?.scholarshipName||row?.mentorName||row?.instituteName||row?.name||row?.opportunityName||"Untitled";}
function recommendationProfileSummary(p){const academic=p.academicCategoryTitles?.join(", ")||p.academicInterests?.join(", ")||"None",talent=p.talentCategoryTitles?.join(", ")||p.talentInterests?.join(", ")||"None",interest=p.preferredFields?.slice(0,3).join(", ")||p.discovery?.interests?.join(", ")||"None";return '<div class="recommendation-profile-summary"><div class="qa-profile-heading"><h4>Active Test Scenario</h4><span>'+escapeHtml(p.pathwayPreference||"undecided")+'</span></div><dl><div><dt>Pathway</dt><dd>'+escapeHtml(p.pathwayPreference||"undecided")+'</dd></div><div><dt>Academic category</dt><dd>'+escapeHtml(academic)+'</dd></div><div><dt>Interest</dt><dd>'+escapeHtml(interest)+'</dd></div><div><dt>Talent</dt><dd>'+escapeHtml(talent)+'</dd></div><div><dt>Education</dt><dd>'+escapeHtml(p.educationLevel||"Not provided")+'</dd></div></dl></div>';}
const recommendationRecordSources={courses:{state:"courses",section:"manage-courses",add:"show-course-form"},scholarships:{state:"scholarships",section:"manage-scholarships",add:"show-scholarship-form"},mentors:{state:"mentors",section:"manage-mentors",add:"show-manual-mentor-form"},institutes:{state:"institutes",section:"manage-institutes",add:"show-admin-institute-form"},opportunities:{state:"talentOpportunities",section:"manage-talent-opportunities",add:"btn-add-talent-opportunity"}};
function recommendationRecordCorpus(item){return JSON.stringify(item||{}).toLowerCase();}
function findExpectedRecommendationRecord(keyword,preferredType){const order=[preferredType,...Object.keys(recommendationRecordSources).filter(x=>x!==preferredType)];for(const type of order){const source=recommendationRecordSources[type];for(const [id,item] of Object.entries(adminState[source.state]||{})){if(recommendationRecordCorpus(item).includes(String(keyword).toLowerCase()))return{type,id,item,source};}}return null;}
function diagnoseExpectedRecommendation(keyword,preferredType,profile){const match=findExpectedRecommendationRecord(keyword,preferredType);if(!match)return{exists:false,message:"No matching record found. Add a new scholarship/opportunity/course containing this keyword.",source:recommendationRecordSources[preferredType]};const {type,item}=match,reasons=[];const status=String(item.status||item.approvalStatus||"").toLowerCase(),active=["active","approved","published","open"];if(status&&!active.includes(status))reasons.push("inactive status ("+status+")");if(item.publicVisibility===false)reasons.push("publicVisibility is false");const missing=[];if(type==="courses"){if(!item.academicCategoryId)missing.push("Academic Category ID");if(!item.courseCategoryId)missing.push("Course Category ID");}if(type==="scholarships"){if(!item.scholarshipCategoryId)missing.push("Scholarship Category ID");if(!(item.relatedAcademicCategoryIds?.length||item.relatedTalentCategoryIds?.length))missing.push("related Academic/Talent Category");}if(type==="mentors"){if(!item.expertiseCategoryIds?.length)missing.push("Mentor Expertise Category");if(!(item.relatedAcademicCategoryIds?.length||item.relatedTalentCategoryIds?.length))missing.push("related Academic/Talent Category");}if(type==="institutes"){if(!item.providerCategoryId)missing.push("Provider Category");if(!(item.relatedAcademicCategoryIds?.length||item.relatedTalentCategoryIds?.length||item.relatedCourseCategoryIds?.length))missing.push("related Academic/Talent Category");}if(type==="opportunities"){if(!item.categoryId)missing.push("Talent Category");if(!item.opportunityCategoryId)missing.push("Opportunity Category");}if(missing.length)reasons.push("missing "+missing.join(", "));const keywords=[item.matchingKeywords,item.keywords,item.tags].flat().filter(Boolean).join(" ").toLowerCase();if(!keywords.includes(String(keyword).toLowerCase()))reasons.push("missing matching keyword ‘"+keyword+"’");const eligible=[item.eligiblePathways,item.suitablePathways,item.supportedPathways].flat().filter(Boolean).map(x=>String(x).toLowerCase()),path=String(profile?.pathwayPreference||"undecided").toLowerCase();if(eligible.length&&!eligible.includes(path))reasons.push("unsuitable pathway (requires "+eligible.join(", ")+")");const deadline=item.deadline||item.applicationDeadline||item.closingDate;if(deadline&&new Date(deadline)<new Date())reasons.push("expired deadline ("+deadline+")");if(!reasons.length)reasons.push("score below the recommendation threshold");return{exists:true,match,missingCategories:missing.length>0,message:reasons.join("; ")+"."};}
function recommendationIssueButtons(d,key=""){const s=d.match?.source||d.source,id=d.match?.id||"",title=d.match?recommendationItemTitle(d.match.item):"";let html='<div class="recommendation-test-actions">';if(d.exists)html+='<button class="btn btn-sm btn-info" data-section="'+s.section+'" data-focus-recommendation-record="'+escapeAttr(id)+'" data-recommendation-record-type="'+escapeAttr(d.match.type)+'">Open Record</button>';else html+='<button class="btn btn-sm btn-info" data-add-recommendation-record="'+escapeAttr(s.add)+'" data-section="'+s.section+'">Open Add New</button>';if(d.exists&&d.missingCategories)html+='<button class="btn btn-sm btn-secondary" data-category-review-record="'+escapeAttr(id)+'" data-category-review-title="'+escapeAttr(title)+'">Assign Categories</button><button class="btn btn-sm btn-secondary" data-category-review-record="'+escapeAttr(id)+'" data-category-review-title="'+escapeAttr(title)+'">Open Category Review</button>';if(key)html+='<button class="btn btn-sm btn-primary" data-recommendation-debug-key="'+escapeAttr(key)+'">View Debug Score</button>';return html+'</div>';}
function recommendationButtons(c,key=""){return '<div class="recommendation-test-actions"><button class="btn btn-sm btn-info" data-section="'+c.section+'">Open Record</button>'+(key?'<button class="btn btn-sm btn-primary" data-recommendation-debug-key="'+escapeAttr(key)+'">View Debug Score</button>':'')+'</div>';}
function renderRecommendationType(ti,type,rows,note,profile){const c=recommendationTypeConfig[type],expected=note?.expected?.length?note.expected:["No primary result required"],missing=[...new Set(note?.missingExpected||[])],wrong=note?.wrongRecommendations||[],pass=note?note.pass:true;const actual=rows.length?'<ol class="recommendation-actual-list">'+rows.slice(0,10).map((row,ri)=>{const key=ti+"-"+type+"-"+ri;recommendationDebugRows[key]=row;return '<li><div><strong>'+escapeHtml(recommendationItemTitle(row))+'</strong> <span class="badge badge-info">'+Number(row.matchScore||0)+'%</span></div><p>'+escapeHtml(row.recommendationReason||row.matchReasons?.[0]||"No explanation available")+'</p><small>Matched fields: '+escapeHtml((row.matchedFields||[]).join(", ")||"Text/category fallback")+'</small>'+recommendationButtons(c,key)+'</li>';}).join("")+'</ol>':'<p class="muted">No recommendations returned.</p>';const wrongHtml=wrong.length?'<div class="recommendation-warning"><h5>Wrong recommendations found</h5>'+wrong.map(r=>'<p><strong>'+escapeHtml(recommendationItemTitle(r))+'</strong>: no valid category relevance.</p>').join("")+'<p><strong>Suggested fix:</strong> '+escapeHtml(c.fix)+' Prevent generic fields from scoring alone.</p></div>':'';const missingHtml=missing.map(keyword=>{const d=diagnoseExpectedRecommendation(keyword,type,profile);return '<div class="recommendation-warning" data-problem-key="missing-'+escapeAttr(type+'-'+keyword)+'"><h5>Missing expected recommendation: '+escapeHtml(keyword)+'</h5><p><strong>'+(d.exists?'Record found but excluded:':'No record found:')+'</strong> '+escapeHtml(d.message)+'</p>'+(d.exists?'<p><strong>Matched record:</strong> '+escapeHtml(recommendationItemTitle(d.match.item))+' ('+escapeHtml(d.match.type)+')</p>':'')+'<p><strong>Suggested fix:</strong> '+escapeHtml(d.exists?c.fix:d.message)+'</p>'+recommendationIssueButtons(d)+'</div>';}).join("");return '<section class="recommendation-type-result '+(pass?"test-pass":"test-fail")+'"><header><h4>'+c.label+'</h4><span class="badge '+(pass?"badge-active":"badge-rejected")+'">'+(pass?"PASS":"FAIL")+'</span></header><div class="recommendation-compare-grid"><div><h5>Expected</h5><ul>'+expected.map(x=>'<li>'+escapeHtml(x)+'</li>').join("")+'</ul></div><div><h5>Actual</h5>'+actual+'</div></div>'+wrongHtml+missingHtml+(!pass?'<div class="recommendation-fix"><strong>What admin should fix:</strong> '+escapeHtml(c.fix)+'</div>':'')+'</section>';}

function renderRecommendationTestResults(results){const root=document.getElementById("recommendation-test-results");if(!root)return;lastRecommendationTests=results;recommendationDebugRows={};const issues=recommendationDataIssues(),warnings=results.reduce((a,t)=>a+t.notes.reduce((b,n)=>b+(n.missingExpected?.length||0)+(n.wrongRecommendations?.length||0),0),0),passed=results.filter(t=>t.pass).length;const summary='<article class="panel-card glass recommendation-test-summary"><h3>Recommendation Testing Summary</h3><div class="recommendation-summary-grid"><div><strong>'+results.length+'</strong><span>Tests run</span></div><div><strong>'+passed+'</strong><span>Passed</span></div><div><strong>'+(results.length-passed)+'</strong><span>Failed</span></div><div><strong>'+warnings+'</strong><span>Warnings</span></div><div><strong>'+issues.length+'</strong><span>Records need review</span></div></div></article>';const tests=results.map((t,ti)=>{const notes=Object.fromEntries(t.notes.map(n=>[n.type,n]));return '<article class="panel-card glass recommendation-test-case"><header class="recommendation-test-case-header"><div><small>Test scenario</small><h3>'+escapeHtml(t.name)+'</h3></div><span class="badge '+(t.pass?"badge-active":"badge-rejected")+'">'+(t.pass?"PASS":"FAIL")+'</span></header>'+recommendationProfileSummary(t.results.profile)+Object.keys(recommendationTypeConfig).map(type=>renderRecommendationType(ti,type,t.results[type]||[],notes[type],t.results.profile)).join("")+'</article>';}).join("");const review='<article class="panel-card glass"><h3>Records needing category review ('+issues.length+')</h3>'+(issues.length?'<ul class="recommendation-issue-list">'+issues.slice(0,100).map(i=>'<li><div><strong>'+escapeHtml(i.type)+'</strong> '+escapeHtml(i.id)+'<p>'+escapeHtml(i.issue)+'</p></div><button class="btn btn-sm btn-secondary" data-section="category-review">Assign Categories</button></li>').join("")+'</ul>':'<p>No missing category fields detected.</p>')+'</article>';root.innerHTML=summary+tests+review;enhanceRecommendationQaView(root);}

function enhanceRecommendationQaView(root){
 root.querySelectorAll(".recommendation-test-case").forEach((card)=>{
  const sections=[...card.querySelectorAll(".recommendation-type-result")];
  if(!sections.length)return;
  const tabs=document.createElement("div");tabs.className="recommendation-result-tabs";
  sections.forEach((section,index)=>{
   const title=section.querySelector("h4")?.textContent||"Results",status=section.classList.contains("test-fail")?"FAIL":section.querySelector(".recommendation-warning")?"WARN":"PASS";
   const button=document.createElement("button");button.type="button";button.className=index===0?"active":"";const count=section.querySelectorAll(".recommendation-actual-list li").length,scores=[...section.querySelectorAll(".badge-info")].map(x=>Number(x.textContent.replace("%",""))||0),top=Math.max(0,...scores);button.innerHTML="<span>"+title+"</span><small class="+status.toLowerCase()+">"+status+" · "+count+" results · "+top+"%</small>";
   section.classList.toggle("active",index===0);
   button.addEventListener("click",()=>{tabs.querySelectorAll("button").forEach(x=>x.classList.remove("active"));button.classList.add("active");sections.forEach(x=>x.classList.remove("active"));section.classList.add("active");});
   tabs.appendChild(button);
  });
  card.querySelector(".recommendation-profile-summary")?.after(tabs);
 });
 const seenProblems=new Set(),warnings=[...root.querySelectorAll(".recommendation-warning")].filter((warning)=>{const key=warning.dataset.problemKey||warning.textContent.replace(/\s+/g," ").trim();if(seenProblems.has(key))return false;seenProblems.add(key);return true;});
 const problems=document.createElement("article");problems.className="panel-card glass qa-problems";problems.innerHTML="<h3>Problems Found</h3>"+(warnings.length?warnings.map((x,i)=>"<div class=qa-problem><strong>Problem "+(i+1)+"</strong>"+x.innerHTML+"</div>").join(""):"<p class=text-success>No recommendation problems were found in the selected tests.</p>");
 root.querySelectorAll(".recommendation-warning").forEach((warning)=>warning.remove());
 const review=[...root.querySelectorAll(".panel-card")].find(x=>x.querySelector("h3")?.textContent.startsWith("Records needing"));
 if(review)review.before(problems);else root.appendChild(problems);
 root.querySelectorAll(".recommendation-actual-list li").forEach((li)=>{
  const debug=li.querySelector("[data-recommendation-debug-key]"),row=debug?recommendationDebugRows[debug.dataset.recommendationDebugKey]:null;
  const categoryValues=row?[row.academicCategoryId,row.courseCategoryId,row.scholarshipCategoryId,row.expertiseCategoryIds,row.providerCategoryId,row.categoryId,row.opportunityCategoryId]:[];
  const needs=row&&(row.needsCategoryReview===true||(row.categoryConfidence!=null&&row.categoryConfidence<.6)||!categoryValues.some(v=>Array.isArray(v)?v.length:Boolean(v)));
  if(!needs)li.querySelectorAll('[data-section="category-review"]').forEach(x=>x.remove());
  if(debug)debug.textContent="View Score Details";
 });
}

function openCourseDetailModal(course) {
    if (!course) return;
    let modal = document.getElementById('admin-course-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'admin-course-modal';
        modal.className = 'admin-course-modal-overlay';
        document.body.appendChild(modal);
    }

    const courseId = course.courseId || course.id || '';
    const name = course.courseName || 'Unknown Course';
    const status = course.approvalStatus || 'pending';
    const categoryName = course.academicCategoryName || course.category || 'N/A';
    const subcategory = course.courseCategoryName || course.subcategory || 'N/A';
    const eduLevels = Array.isArray(course.eligibleEducationLevels) ? course.eligibleEducationLevels.join(', ') : (course.eligibleEducationLevels || course.educationLevels || 'N/A');
    
    let keywordsHtml = '';
    const kwds = course.matchingKeywords || course.keywords || [];
    if (Array.isArray(kwds) && kwds.length > 0) {
        keywordsHtml = kwds.map(k => '<span class=\"acm-pill\">' + escapeHtml(k) + '</span>').join('');
    } else {
        keywordsHtml = '<span style=\"color:#94a3b8;font-size:0.8rem;\">No keywords</span>';
    }

    const createdBy = course.createdBy || course.provider || 'System Admin';
    const role = course.creatorRole || 'admin';
    const createdAt = course.createdAt || Date.now();
    const adminUid = course.adminUid || course.creatorUid || 'seed_admin';

    const categoryBackfill = escapeHtml(JSON.stringify({ backfilled: true, source: 'safe-course-scholarship-backfill-v1' }, null, 2));
    const isSeed = typeof course.isSeed !== 'undefined' ? course.isSeed : true;
    const dispStatus = status ? status.charAt(0).toUpperCase() + status.slice(1) : '';

    modal.innerHTML = `
    <div class=\"admin-course-modal-card\">
        <div class=\"acm-header\">
            <div class=\"icon-wrap\"><i class=\"fas fa-book-open\"></i></div>
            <h2>Course Details</h2>
            <span class=\"acm-badge ${status === 'approved' ? 'approved' : status === 'rejected' ? 'rejected' : 'pending'}\">
                <i class=\"fas ${status === 'approved' ? 'fa-check-circle' : status === 'rejected' ? 'fa-times-circle' : 'fa-clock'}\"></i> 
                ${dispStatus}
            </span>
            <button class=\"acm-close\" id=\"acm-close-top\"><i class=\"fas fa-times\"></i></button>
        </div>
        
        <div class=\"acm-body\">
            <div class=\"acm-main-card\">
                <div class=\"lbl\">Course Name</div>
                <h1>${escapeHtml(name)}</h1>
                <div class=\"acm-meta-row\">
                    <div class=\"acm-meta-item\">
                        <i class=\"fas fa-folder acm-meta-icon\"></i>
                        <div class=\"acm-meta-text\"><span>Category</span><strong>${escapeHtml(categoryName)}</strong></div>
                    </div>
                    <div class=\"acm-divider\"></div>
                    <div class=\"acm-meta-item\">
                        <i class=\"fas fa-tags acm-meta-icon\"></i>
                        <div class=\"acm-meta-text\"><span>Subcategory</span><strong>${escapeHtml(subcategory)}</strong></div>
                    </div>
                    <div class=\"acm-divider\"></div>
                    <div class=\"acm-meta-item\">
                        <i class=\"fas fa-graduation-cap acm-meta-icon\"></i>
                        <div class=\"acm-meta-text\"><span>Education Levels</span><strong>${escapeHtml(eduLevels)}</strong></div>
                    </div>
                </div>
                <div class=\"acm-keywords\">
                    <span class=\"lbl\">Keywords</span>
                    <div class=\"acm-pills\">${keywordsHtml}</div>
                </div>
            </div>

            <div class=\"acm-stats-strip\">
                <div class=\"acm-stat\">
                    <div class=\"acm-stat-icon blue\"><i class=\"fas fa-hashtag\"></i></div>
                    <div class=\"acm-stat-info\"><span>Course ID</span><strong>${escapeHtml(courseId)}</strong></div>
                </div>
                <div class=\"acm-stat\">
                    <div class=\"acm-stat-icon green\"><i class=\"fas fa-shield-check\"></i></div>
                    <div class=\"acm-stat-info\"><span>Approval Status</span><span class=\"acm-stat-badge\" style=\"${status === 'approved' ? '' : 'color:#d97706;background:#fffbeb;'}\">${dispStatus}</span></div>
                </div>
                <div class=\"acm-stat\">
                    <div class=\"acm-stat-icon purple\"><i class=\"fas fa-user\"></i></div>
                    <div class=\"acm-stat-info\"><span>Created By</span><strong>${escapeHtml(createdBy)}</strong></div>
                </div>
                <div class=\"acm-stat\">
                    <div class=\"acm-stat-icon orange\"><i class=\"fas fa-shield-alt\"></i></div>
                    <div class=\"acm-stat-info\"><span>Created Role</span><strong>${escapeHtml(role)}</strong></div>
                </div>
                <div class=\"acm-stat\">
                    <div class=\"acm-stat-icon blue\"><i class=\"fas fa-calendar-alt\"></i></div>
                    <div class=\"acm-stat-info\"><span>Created At</span><strong>${createdAt}</strong></div>
                </div>
            </div>

            <div class=\"acm-section\">
                <div class=\"acm-section-header\">
                    <div class=\"acm-section-icon blue\"><i class=\"fas fa-info-circle\"></i></div>
                    <h3>1. Basic Information</h3>
                </div>
                <div class=\"acm-grid\">
                    <div class=\"acm-field\"><span>Course Name</span><strong>${escapeHtml(name)}</strong></div>
                    <div class=\"acm-field\"><span>Approval Status</span><span class=\"acm-stat-badge\" style=\"width:fit-content;${status === 'approved' ? '' : 'color:#d97706;background:#fffbeb;'}\"><i class=\"fas ${status === 'approved' ? 'fa-check-circle' : 'fa-clock'}\" style=\"margin-right:4px;\"></i>${dispStatus}</span></div>
                    <div class=\"acm-field\"><span>Course ID</span><strong>${escapeHtml(courseId)}</strong></div>
                    <div class=\"acm-field\"><span>Created At (Timestamp)</span><strong>${createdAt}</strong></div>
                </div>
            </div>

            <div class=\"acm-section\">
                <div class=\"acm-section-header\">
                    <div class=\"acm-section-icon slate\"><i class=\"fas fa-folder\"></i></div>
                    <h3>2. Category Information</h3>
                </div>
                <div class=\"acm-grid\">
                    <div class=\"acm-field\"><span>Academic Category (Title)</span><strong>${escapeHtml(categoryName)}</strong></div>
                    <div class=\"acm-field\"><span>Course Category (Title)</span><strong>${escapeHtml(subcategory)}</strong></div>
                    <div class=\"acm-field\"><span>Academic Category ID</span><strong>${escapeHtml(course.academicCategory || 'academic_foundation_information_technology')}</strong></div>
                    <div class=\"acm-field\"><span>Course Category ID</span><strong>${escapeHtml(course.courseCategory || 'course_foundation_software_development')}</strong></div>
                </div>
            </div>

            <div class=\"acm-section\">
                <div class=\"acm-section-header\">
                    <div class=\"acm-section-icon blue\"><i class=\"fas fa-graduation-cap\"></i></div>
                    <h3>3. Eligibility</h3>
                </div>
                <div class=\"acm-grid\">
                    <div class=\"acm-field\"><span>Eligible Education Levels</span><strong>${escapeHtml(eduLevels)}</strong></div>
                    <div class=\"acm-field\">
                        <span>Matching Keywords</span>
                        <div class=\"acm-pills\" style=\"margin-top:6px;\">${keywordsHtml}</div>
                    </div>
                </div>
            </div>

            <div class=\"acm-section\">
                <div class=\"acm-section-header\">
                    <div class=\"acm-section-icon slate\"><i class=\"fas fa-shield-alt\"></i></div>
                    <h3>4. Admin / System Metadata</h3>
                </div>
                <div class=\"acm-grid\">
                    <div class=\"acm-field\"><span>Created By (Name)</span><strong>${escapeHtml(createdBy)}</strong></div>
                    <div class=\"acm-field\" style=\"grid-row: span 4;\">
                        <span>Category Backfill (JSON)</span>
                        <div class=\"acm-code-block\">${categoryBackfill}
                            <button class=\"acm-code-copy\" onclick=\"navigator.clipboard.writeText(this.parentElement.textContent.replace('Copy',''))\"><i class=\"far fa-copy\"></i></button>
                        </div>
                    </div>
                    <div class=\"acm-field\"><span>Created By (Admin UID)</span><strong>${escapeHtml(adminUid)}</strong></div>
                    <div class=\"acm-field\"><span>Created By (Role)</span><strong>${escapeHtml(role)}</strong></div>
                    <div class=\"acm-field\"><span>Is Seed Data</span><span class=\"acm-stat-badge\" style=\"width:fit-content;\"><i class=\"fas fa-check-circle\" style=\"margin-right:4px;\"></i>${isSeed ? 'True' : 'False'}</span></div>
                </div>
            </div>
        </div>
        <div class=\"acm-footer\">
            <button id=\"acm-close-btn\">Close</button>
        </div>
    </div>
    `;

    setTimeout(() => {
        modal.classList.add('show');
    }, 10);

    const closeModal = () => {
        modal.classList.remove('show');
        setTimeout(() => {
            if (modal.parentElement) modal.parentElement.removeChild(modal);
        }, 300);
    };

    document.getElementById('acm-close-top')?.addEventListener('click', closeModal);
    document.getElementById('acm-close-btn')?.addEventListener('click', closeModal);
}

function openRecommendationScoreDetails(row){
 if(!row)return;let modal=document.getElementById("recommendation-score-details");
 if(!modal){modal=document.createElement("div");modal.id="recommendation-score-details";modal.className="modal-overlay hidden";document.body.appendChild(modal);}
 modal.innerHTML='<div class="modal-card"><div class="modal-header"><h3>Score Details: '+escapeHtml(recommendationItemTitle(row))+'</h3><button class="modal-close" data-close-score-details>&times;</button></div><div class="modal-body"><p><strong>Final score:</strong> '+Number(row.matchScore||0)+'%</p><p><strong>Included:</strong> '+escapeHtml(String(row.included??row.matchScore>=40))+'</p><p><strong>Matched fields:</strong> '+escapeHtml((row.matchedFields||[]).join(", ")||"None")+'</p><p><strong>Missing fields:</strong> '+escapeHtml((row.missingRequirements||[]).join(", ")||"None")+'</p><p><strong>Exclusion reason:</strong> '+escapeHtml(row.exclusionReason||"None")+'</p><pre>'+escapeHtml(JSON.stringify(row.debugBreakdown||{},null,2))+'</pre></div></div>';
 modal.classList.remove("hidden");
}
document.addEventListener("click",(event)=>{const button=event.target.closest("[data-recommendation-debug-key]");if(button){event.stopImmediatePropagation();openRecommendationScoreDetails(recommendationDebugRows[button.dataset.recommendationDebugKey]);}if(event.target.closest("[data-close-score-details]"))document.getElementById("recommendation-score-details")?.classList.add("hidden");});function openScholarshipDetailModal(scholarship) {
    if (!scholarship) return;
    let modal = document.getElementById('admin-course-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'admin-course-modal';
        modal.className = 'admin-course-modal-overlay';
        document.body.appendChild(modal);
    }

    const id = scholarship.scholarshipId || scholarship.id || '';
    const name = scholarship.scholarshipName || scholarship.title || 'Unknown Scholarship';
    const status = scholarship.approvalStatus || scholarship.status || 'pending';
    const provider = scholarship.provider || scholarship.organization || 'N/A';
    const amountBenefit = scholarship.amountBenefit || scholarship.amount || 'N/A';
    const eduLevels = Array.isArray(scholarship.eligibleEducationLevels) ? scholarship.eligibleEducationLevels.join(', ') : (scholarship.eligibleEducationLevels || scholarship.educationLevels || 'N/A');
    
    let keywordsHtml = '';
    const kwds = scholarship.matchingKeywords || scholarship.keywords || [];
    if (Array.isArray(kwds) && kwds.length > 0) {
        keywordsHtml = kwds.map(k => '<span class="acm-pill">' + escapeHtml(k) + '</span>').join('');
    } else {
        keywordsHtml = '<span style="color:#94a3b8;font-size:0.8rem;">No keywords</span>';
    }

    const createdBy = scholarship.createdBy || 'System Admin';
    const role = scholarship.creatorRole || 'admin';
    const createdAt = scholarship.createdAt || Date.now();
    const adminUid = scholarship.adminUid || scholarship.creatorUid || 'seed_admin';

    const dispStatus = status ? status.charAt(0).toUpperCase() + status.slice(1) : '';

    modal.innerHTML = `
    <div class="admin-course-modal-card">
        <div class="acm-header">
            <div class="icon-wrap"><i class="fas fa-award"></i></div>
            <h2>Scholarship Details</h2>
            <span class="acm-badge ${status === 'approved' || status === 'active' ? 'approved' : status === 'rejected' ? 'rejected' : 'pending'}">
                <i class="fas ${status === 'approved' || status === 'active' ? 'fa-check-circle' : status === 'rejected' ? 'fa-times-circle' : 'fa-clock'}"></i> 
                ${dispStatus}
            </span>
            <button class="acm-close" id="acm-close-top"><i class="fas fa-times"></i></button>
        </div>
        
        <div class="acm-body">
            <div class="acm-main-card">
                <div class="lbl">Scholarship Name</div>
                <h1>${escapeHtml(name)}</h1>
                <div class="acm-meta-row">
                    <div class="acm-meta-item">
                        <i class="fas fa-building acm-meta-icon"></i>
                        <div class="acm-meta-text"><span>Provider</span><strong>${escapeHtml(provider)}</strong></div>
                    </div>
                    <div class="acm-divider"></div>
                    <div class="acm-meta-item">
                        <i class="fas fa-gift acm-meta-icon"></i>
                        <div class="acm-meta-text"><span>Benefit</span><strong>${escapeHtml(amountBenefit)}</strong></div>
                    </div>
                    <div class="acm-divider"></div>
                    <div class="acm-meta-item">
                        <i class="fas fa-graduation-cap acm-meta-icon"></i>
                        <div class="acm-meta-text"><span>Education Levels</span><strong>${escapeHtml(eduLevels)}</strong></div>
                    </div>
                </div>
                <div class="acm-keywords">
                    <span class="lbl">Keywords</span>
                    <div class="acm-pills">${keywordsHtml}</div>
                </div>
            </div>

            <div class="acm-stats-strip">
                <div class="acm-stat">
                    <div class="acm-stat-icon blue"><i class="fas fa-hashtag"></i></div>
                    <div class="acm-stat-info"><span>Scholarship ID</span><strong>${escapeHtml(id)}</strong></div>
                </div>
                <div class="acm-stat">
                    <div class="acm-stat-icon green"><i class="fas fa-shield-check"></i></div>
                    <div class="acm-stat-info"><span>Approval Status</span><span class="acm-stat-badge" style="${status === 'approved' || status === 'active' ? '' : 'color:#d97706;background:#fffbeb;'}">${dispStatus}</span></div>
                </div>
                <div class="acm-stat">
                    <div class="acm-stat-icon purple"><i class="fas fa-user"></i></div>
                    <div class="acm-stat-info"><span>Created By</span><strong>${escapeHtml(createdBy)}</strong></div>
                </div>
            </div>

            <div class="acm-section">
                <div class="acm-section-header">
                    <div class="acm-section-icon blue"><i class="fas fa-info-circle"></i></div>
                    <h3>Information</h3>
                </div>
                <div class="acm-grid">
                    <div class="acm-field"><span>Deadline</span><strong>${escapeHtml(scholarship.deadline || 'N/A')}</strong></div>
                    <div class="acm-field"><span>Eligibility</span><strong>${escapeHtml(scholarship.eligibility || 'N/A')}</strong></div>
                </div>
            </div>
        </div>
        <div class="acm-footer">
            <button id="acm-close-btn">Close</button>
        </div>
    </div>
    `;

    setTimeout(() => modal.classList.add('show'), 10);
    const closeModal = () => {
        modal.classList.remove('show');
        setTimeout(() => {
            if (modal.parentElement) modal.parentElement.removeChild(modal);
        }, 300);
    };

    document.getElementById('acm-close-top')?.addEventListener('click', closeModal);
    document.getElementById('acm-close-btn')?.addEventListener('click', closeModal);
}

function openInstituteDetailModal(instituteId) {
    const institute = adminState.institutes[instituteId];
    if (!institute) return;
    let modal = document.getElementById('admin-course-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'admin-course-modal';
        modal.className = 'admin-course-modal-overlay';
        document.body.appendChild(modal);
    }

    const name = institute.name || institute.instituteName || 'Unknown Institute';
    const status = institute.approvalStatus || institute.status || 'pending';
    const district = institute.district || 'N/A';
    const type = institute.instituteType || institute.type || 'N/A';
    const dispStatus = status ? status.charAt(0).toUpperCase() + status.slice(1) : '';

    modal.innerHTML = `
    <div class="admin-course-modal-card">
        <div class="acm-header">
            <div class="icon-wrap"><i class="fas fa-building-columns"></i></div>
            <h2>Institute Details</h2>
            <span class="acm-badge ${status === 'approved' || status === 'active' ? 'approved' : status === 'rejected' ? 'rejected' : 'pending'}">
                ${dispStatus}
            </span>
            <button class="acm-close" id="acm-close-top"><i class="fas fa-times"></i></button>
        </div>
        
        <div class="acm-body">
            <div class="acm-main-card">
                <div class="lbl">Institute Name</div>
                <h1>${escapeHtml(name)}</h1>
                <div class="acm-meta-row">
                    <div class="acm-meta-item">
                        <i class="fas fa-map-marker-alt acm-meta-icon"></i>
                        <div class="acm-meta-text"><span>District</span><strong>${escapeHtml(district)}</strong></div>
                    </div>
                    <div class="acm-divider"></div>
                    <div class="acm-meta-item">
                        <i class="fas fa-building acm-meta-icon"></i>
                        <div class="acm-meta-text"><span>Type</span><strong>${escapeHtml(type)}</strong></div>
                    </div>
                </div>
            </div>

            <div class="acm-section">
                <div class="acm-section-header">
                    <div class="acm-section-icon blue"><i class="fas fa-info-circle"></i></div>
                    <h3>Contact & Info</h3>
                </div>
                <div class="acm-grid">
                    <div class="acm-field"><span>Address</span><strong>${escapeHtml(institute.address || institute.streetAddress || 'N/A')}</strong></div>
                    <div class="acm-field"><span>Email</span><strong>${escapeHtml(institute.email || institute.officialEmail || 'N/A')}</strong></div>
                    <div class="acm-field"><span>Phone</span><strong>${escapeHtml(institute.phone || 'N/A')}</strong></div>
                    <div class="acm-field"><span>Website</span><strong>${escapeHtml(institute.website || 'N/A')}</strong></div>
                </div>
            </div>

            <div class="acm-section">
                <div class="acm-section-header">
                    <div class="acm-section-icon green"><i class="fas fa-building"></i></div>
                    <h3>Institute Details</h3>
                </div>
                <div class="acm-grid">
                    <div class="acm-field" style="grid-column: span 2;"><span>Description</span><strong>${escapeHtml(institute.description || institute.instituteDescription || 'N/A')}</strong></div>
                    <div class="acm-field"><span>Established Year</span><strong>${escapeHtml(institute.establishedYear || 'N/A')}</strong></div>
                    <div class="acm-field"><span>Reg No.</span><strong>${escapeHtml(institute.governmentRegistrationNumber || 'N/A')}</strong></div>
                    <div class="acm-field"><span>Accreditation</span><strong>${escapeHtml(institute.accreditationDetails || 'N/A')}</strong></div>
                    <div class="acm-field" style="grid-column: span 2;"><span>Facilities</span><strong>${escapeHtml(Array.isArray(institute.facilities || institute.facilitiesAvailable) ? (institute.facilities || institute.facilitiesAvailable).join(', ') : (institute.facilities || institute.facilitiesAvailable || 'N/A'))}</strong></div>
                </div>
            </div>

            <div class="acm-section">
                <div class="acm-section-header">
                    <div class="acm-section-icon purple"><i class="fas fa-user-tie"></i></div>
                    <h3>Representative</h3>
                </div>
                <div class="acm-grid">
                    <div class="acm-field"><span>Name</span><strong>${escapeHtml(institute.representativeName || 'N/A')}</strong></div>
                    <div class="acm-field"><span>Designation</span><strong>${escapeHtml(institute.representativeDesignation || 'N/A')}</strong></div>
                    <div class="acm-field"><span>Email</span><strong>${escapeHtml(institute.representativeEmail || 'N/A')}</strong></div>
                    <div class="acm-field"><span>Phone</span><strong>${escapeHtml(institute.representativePhone || 'N/A')}</strong></div>
                </div>
            </div>
        </div>
        <div class="acm-footer">
            <button id="acm-close-btn">Close</button>
        </div>
    </div>
    `;

    setTimeout(() => modal.classList.add('show'), 10);
    const closeModal = () => {
        modal.classList.remove('show');
        setTimeout(() => {
            if (modal.parentElement) modal.parentElement.removeChild(modal);
        }, 300);
    };

    document.getElementById('acm-close-top')?.addEventListener('click', closeModal);
    document.getElementById('acm-close-btn')?.addEventListener('click', closeModal);
}
function openStudentDetailModal(uid) {
    const student = getStudentRows().find((row) => row.uid === uid) || {};
    let modal = document.getElementById('admin-course-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'admin-course-modal';
        modal.className = 'admin-course-modal-overlay';
        document.body.appendChild(modal);
    }

    const name = student.fullName || 'Unknown Student';
    const email = student.email || 'N/A';
    const district = student.district || 'N/A';
    const status = student.accountStatus || 'active';
    const photo = student.photoURL || 'images/default-avatar.png';
    const dispStatus = status ? status.charAt(0).toUpperCase() + status.slice(1) : '';

    modal.innerHTML = `
    <div class="admin-course-modal-card">
        <div class="acm-header">
            <div class="icon-wrap"><i class="fas fa-user-graduate"></i></div>
            <h2>Student Details</h2>
            <span class="acm-badge ${status === 'active' ? 'approved' : status === 'suspended' ? 'rejected' : 'pending'}">
                ${dispStatus}
            </span>
            <button class="acm-close" id="acm-close-top"><i class="fas fa-times"></i></button>
        </div>
        
        <div class="acm-body">
            <div class="acm-main-card">
                <div class="lbl">Student Name</div>
                <div style="display: flex; align-items: center; gap: 1rem; margin-top: 0.5rem; margin-bottom: 1rem;">
                    <img src="${escapeAttr(photo)}" alt="${escapeAttr(name)}" style="width: 60px; height: 60px; border-radius: 50%; object-fit: cover; border: 2px solid var(--border-color);">
                    <h1 style="margin: 0;">${escapeHtml(name)}</h1>
                </div>
                <div class="acm-meta-row">
                    <div class="acm-meta-item">
                        <i class="fas fa-envelope acm-meta-icon"></i>
                        <div class="acm-meta-text"><span>Email</span><strong>${escapeHtml(email)}</strong></div>
                    </div>
                    <div class="acm-divider"></div>
                    <div class="acm-meta-item">
                        <i class="fas fa-map-marker-alt acm-meta-icon"></i>
                        <div class="acm-meta-text"><span>District</span><strong>${escapeHtml(district)}</strong></div>
                    </div>
                </div>
            </div>

            <div class="acm-section">
                <div class="acm-section-header">
                    <div class="acm-section-icon blue"><i class="fas fa-info-circle"></i></div>
                    <h3>Personal Information</h3>
                </div>
                <div class="acm-grid">
                    <div class="acm-field"><span>Phone</span><strong>${escapeHtml(student.phone || 'N/A')}</strong></div>
                    <div class="acm-field"><span>Account Status</span><span class="acm-stat-badge" style="width:fit-content;${status === 'active' ? '' : 'color:#d97706;background:#fffbeb;'}">${dispStatus}</span></div>
                    <div class="acm-field"><span>Created At</span><strong>${escapeHtml(display(student.createdAt))}</strong></div>
                    <div class="acm-field"><span>Last Active At</span><strong>${escapeHtml(display(student.lastActiveAt))}</strong></div>
                </div>
            </div>

            <div class="acm-section">
                <div class="acm-section-header">
                    <div class="acm-section-icon slate"><i class="fas fa-graduation-cap"></i></div>
                    <h3>Education Information</h3>
                </div>
                <div class="acm-grid">
                    <div class="acm-field"><span>Education Level</span><strong>${escapeHtml(display(student.educationLevel))}</strong></div>
                    <div class="acm-field"><span>Exam Stream</span><strong>${escapeHtml(display(student.examStream))}</strong></div>
                    <div class="acm-field"><span>Result Status</span><strong>${escapeHtml(display(student.resultStatus))}</strong></div>
                </div>
            </div>

            <div class="acm-section">
                <div class="acm-section-header">
                    <div class="acm-section-icon purple"><i class="fas fa-bullseye"></i></div>
                    <h3>Guidance & Goals</h3>
                </div>
                <div class="acm-grid">
                    <div class="acm-field"><span>Interest Area</span><strong>${escapeHtml(display(student.interestArea))}</strong></div>
                    <div class="acm-field"><span>Skills</span><strong>${escapeHtml(display(student.skills))}</strong></div>
                    <div class="acm-field"><span>Future Goal</span><strong>${escapeHtml(display(student.futureGoal))}</strong></div>
                    <div class="acm-field"><span>Financial Support</span><strong>${escapeHtml(display(student.financialSupport))}</strong></div>
                    <div class="acm-field"><span>Learning Mode</span><strong>${escapeHtml(display(student.learningMode))}</strong></div>
                </div>
            </div>
            
            <div class="acm-section">
                <div class="acm-section-header">
                    <div class="acm-section-icon green"><i class="fas fa-chart-line"></i></div>
                    <h3>Platform Progress</h3>
                </div>
                <div class="acm-grid">
                    <div class="acm-field"><span>Profile Completion</span><strong>${escapeHtml(display(student.profileCompletion))}</strong></div>
                    <div class="acm-field"><span>Pathway Completed</span><strong>${escapeHtml(display(student.pathwayCompleted))}</strong></div>
                    <div class="acm-field"><span>Saved Courses</span><strong>${escapeHtml(display(student.savedCoursesCount))}</strong></div>
                    <div class="acm-field"><span>Saved Scholarships</span><strong>${escapeHtml(display(student.savedScholarshipsCount))}</strong></div>
                    <div class="acm-field"><span>Mentor Requests</span><strong>${escapeHtml(display(student.mentorRequestsCount))}</strong></div>
                </div>
            </div>
        </div>
        <div class="acm-footer">
            <button id="acm-close-btn">Close</button>
        </div>
    </div>
    `;

    setTimeout(() => modal.classList.add('show'), 10);
    const closeModal = () => {
        modal.classList.remove('show');
        setTimeout(() => {
            if (modal.parentElement) modal.parentElement.removeChild(modal);
        }, 300);
    };

    document.getElementById('acm-close-top')?.addEventListener('click', closeModal);
    document.getElementById('acm-close-btn')?.addEventListener('click', closeModal);
}

function openMentorDetailModal(uid) {
    const m = getMentorRows().find((row) => row.uid === uid) || {};
    const requests = Object.values(adminState.mentorRequests).filter((r) => r.mentorUid === uid);
    const pendingRequestsCount = requests.filter((r) => normalize(r.status) === "pending").length;
    const acceptedRequestsCount = requests.filter((r) => normalize(r.status) === "accepted").length;

    let modal = document.getElementById('admin-course-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'admin-course-modal';
        modal.className = 'admin-course-modal-overlay';
        document.body.appendChild(modal);
    }

    const name = m.fullName || 'Unknown Mentor';
    const email = m.email || 'N/A';
    const role = m.currentRole || 'N/A';
    const status = m.status || m.approvalStatus || 'pending';
    const photo = m.photoURL || 'images/default-avatar.png';
    const dispStatus = status ? status.charAt(0).toUpperCase() + status.slice(1) : '';

    modal.innerHTML = `
    <div class="admin-course-modal-card">
        <div class="acm-header">
            <div class="icon-wrap"><i class="fas fa-chalkboard-teacher"></i></div>
            <h2>Mentor Details</h2>
            <span class="acm-badge ${status === 'approved' || status === 'active' ? 'approved' : status === 'rejected' ? 'rejected' : 'pending'}">
                <i class="fas ${status === 'approved' || status === 'active' ? 'fa-check-circle' : status === 'rejected' ? 'fa-times-circle' : 'fa-clock'}"></i> 
                ${dispStatus}
            </span>
            <button class="acm-close" id="acm-close-top"><i class="fas fa-times"></i></button>
        </div>
        
        <div class="acm-body">
            <div class="acm-main-card">
                <div class="lbl">Mentor Name</div>
                <div style="display: flex; align-items: center; gap: 1rem; margin-top: 0.5rem; margin-bottom: 1rem;">
                    <img src="${escapeAttr(photo)}" alt="${escapeAttr(name)}" style="width: 60px; height: 60px; border-radius: 50%; object-fit: cover; border: 2px solid var(--border-color);">
                    <h1 style="margin: 0;">${escapeHtml(name)}</h1>
                </div>
                <div class="acm-meta-row">
                    <div class="acm-meta-item">
                        <i class="fas fa-envelope acm-meta-icon"></i>
                        <div class="acm-meta-text"><span>Email</span><strong>${escapeHtml(email)}</strong></div>
                    </div>
                    <div class="acm-divider"></div>
                    <div class="acm-meta-item">
                        <i class="fas fa-briefcase acm-meta-icon"></i>
                        <div class="acm-meta-text"><span>Role</span><strong>${escapeHtml(role)}</strong></div>
                    </div>
                </div>
            </div>

            <div class="acm-section">
                <div class="acm-section-header">
                    <div class="acm-section-icon blue"><i class="fas fa-info-circle"></i></div>
                    <h3>Personal Information</h3>
                </div>
                <div class="acm-grid">
                    <div class="acm-field"><span>Phone</span><strong>${escapeHtml(display(m.phone))}</strong></div>
                    <div class="acm-field"><span>District</span><strong>${escapeHtml(display(m.district))}</strong></div>
                    <div class="acm-field"><span>City</span><strong>${escapeHtml(display(m.city))}</strong></div>
                    <div class="acm-field"><span>Languages</span><strong>${escapeHtml(display(m.preferredLanguages))}</strong></div>
                </div>
            </div>

            <div class="acm-section">
                <div class="acm-section-header">
                    <div class="acm-section-icon slate"><i class="fas fa-briefcase"></i></div>
                    <h3>Professional Information</h3>
                </div>
                <div class="acm-grid">
                    <div class="acm-field"><span>Mentor Type</span><strong>${escapeHtml(display(m.mentorType))}</strong></div>
                    <div class="acm-field"><span>Field</span><strong>${escapeHtml(display(m.field))}</strong></div>
                    <div class="acm-field"><span>Current Role</span><strong>${escapeHtml(display(m.currentRole))}</strong></div>
                    <div class="acm-field"><span>University / Company</span><strong>${escapeHtml(display(m.universityOrCompany))}</strong></div>
                    <div class="acm-field"><span>Highest Qualification</span><strong>${escapeHtml(display(m.highestQualification))}</strong></div>
                    <div class="acm-field"><span>Degree Area</span><strong>${escapeHtml(display(m.degreeArea))}</strong></div>
                    <div class="acm-field"><span>Experience</span><strong>${escapeHtml(display(m.experience))}</strong></div>
                    <div class="acm-field" style="grid-column: span 2;"><span>Bio</span><strong>${escapeHtml(display(m.bio))}</strong></div>
                </div>
            </div>

            <div class="acm-section">
                <div class="acm-section-header">
                    <div class="acm-section-icon purple"><i class="fas fa-hands-helping"></i></div>
                    <h3>Guidance Details</h3>
                </div>
                <div class="acm-grid">
                    <div class="acm-field"><span>Guidance Areas</span><strong>${escapeHtml(display(m.guidanceAreas))}</strong></div>
                    <div class="acm-field"><span>Student Levels</span><strong>${escapeHtml(display(m.studentLevelsSupported))}</strong></div>
                    <div class="acm-field"><span>Available Days</span><strong>${escapeHtml(display(m.availableDays))}</strong></div>
                    <div class="acm-field"><span>Available Time</span><strong>${escapeHtml(display(m.availableTime))}</strong></div>
                    <div class="acm-field"><span>Mentoring Mode</span><strong>${escapeHtml(display(m.mentoringMode))}</strong></div>
                    <div class="acm-field"><span>Max Students/Week</span><strong>${escapeHtml(display(m.maximumStudentsPerWeek))}</strong></div>
                </div>
            </div>

            <div class="acm-section">
                <div class="acm-section-header">
                    <div class="acm-section-icon green"><i class="fas fa-check-circle"></i></div>
                    <h3>Approval & Platform Stats</h3>
                </div>
                <div class="acm-grid">
                    <div class="acm-field"><span>Status</span><span class="acm-stat-badge" style="width:fit-content;${status === 'approved' || status === 'active' ? '' : 'color:#d97706;background:#fffbeb;'}">${dispStatus}</span></div>
                    <div class="acm-field"><span>Approved At</span><strong>${escapeHtml(display(m.approvedAt))}</strong></div>
                    <div class="acm-field"><span>Approved By</span><strong>${escapeHtml(display(m.approvedBy))}</strong></div>
                    <div class="acm-field"><span>Profile Completion</span><strong>${escapeHtml(display(m.profileCompletion))}</strong></div>
                    <div class="acm-field"><span>Pending Requests</span><strong>${escapeHtml(display(pendingRequestsCount))}</strong></div>
                    <div class="acm-field"><span>Accepted Requests</span><strong>${escapeHtml(display(acceptedRequestsCount))}</strong></div>
                    <div class="acm-field"><span>Last Active At</span><strong>${escapeHtml(display(m.lastActiveAt))}</strong></div>
                </div>
            </div>
        </div>
        <div class="acm-footer">
            <button id="acm-close-btn">Close</button>
        </div>
    </div>
    `;

    setTimeout(() => modal.classList.add('show'), 10);
    const closeModal = () => {
        modal.classList.remove('show');
        setTimeout(() => {
            if (modal.parentElement) modal.parentElement.removeChild(modal);
        }, 300);
    };

    document.getElementById('acm-close-top')?.addEventListener('click', closeModal);
    document.getElementById('acm-close-btn')?.addEventListener('click', closeModal);
}
