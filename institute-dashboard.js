import { auth, database } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { ref, get, set, push, onValue, update, remove, serverTimestamp, query, orderByChild, equalTo } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

const normalize = (value) => String(value || "").trim().toLowerCase();
const state = { uid: "", user: {}, institute: {}, courses: {}, inquiries: {}, supportConversation: {}, courseSearch: "", courseStatus: "all", inquiryStatus: "all" };
let clockTimer = null;
let greetingName = "Institute";
const MOBILE_BP = 860;
const SIDEBAR_STORAGE_KEY = "sidebarCollapsed";

document.addEventListener("DOMContentLoaded", () => {
    syncSidebarState();
    wireUi();
    startClock();
    onAuthStateChanged(auth, initDashboard);
    window.addEventListener("resize", syncSidebarState);
});

async function initDashboard(user) {
    if (!user) {
        window.location.href = "login.html?redirect=institute-dashboard.html";
        return;
    }
    state.uid = user.uid;
    const userSnap = await get(ref(database, `users/${user.uid}`));
    state.user = userSnap.val() || {};
    if (normalize(state.user.userType || state.user.role) !== "institute") {
        window.location.href = "index.html";
        return;
    }
    bindRealtimeData();
}

function wireUi() {
    document.querySelectorAll("[data-section]").forEach((button) => button.addEventListener("click", () => showSection(button.dataset.section)));
    document.querySelectorAll("[data-section-jump]").forEach((button) => button.addEventListener("click", () => showSection(button.dataset.sectionJump)));
    document.querySelectorAll("[data-menu-toggle], #menu-toggle").forEach((button) => {
        button.addEventListener("click", () => toggleSidebar());
    });
    document.getElementById("logout-btn")?.addEventListener("click", logout);
    document.getElementById("course-form")?.addEventListener("submit", saveCourse);
    document.getElementById("profile-form")?.addEventListener("submit", saveProfile);
    document.getElementById("institute-support-form")?.addEventListener("submit", sendInstituteSupportMessage);
    document.getElementById("cancel-edit-btn")?.addEventListener("click", resetCourseForm);
    document.getElementById("course-search")?.addEventListener("input", (e) => { state.courseSearch = e.target.value.toLowerCase(); renderCourses(); });
    document.getElementById("course-status-filter")?.addEventListener("change", (e) => { state.courseStatus = e.target.value; renderCourses(); });
    document.getElementById("inquiry-status-filter")?.addEventListener("change", (e) => { state.inquiryStatus = e.target.value; renderInquiries(); });
}

function isMobileLayout() {
    return window.innerWidth <= MOBILE_BP;
}

function toggleSidebar() {
    const sidebar = document.getElementById("sidebar");
    if (!sidebar) return;
    if (isMobileLayout()) {
        sidebar.classList.toggle("open");
        sidebar.classList.toggle("mobile-open", sidebar.classList.contains("open"));
        return;
    }
    const collapsed = !document.documentElement.classList.contains("sidebar-collapsed");
    document.documentElement.classList.toggle("sidebar-collapsed", collapsed);
    localStorage.setItem(SIDEBAR_STORAGE_KEY, collapsed ? "true" : "false");
}

function syncSidebarState() {
    const sidebar = document.getElementById("sidebar");
    if (isMobileLayout()) {
        document.documentElement.classList.remove("sidebar-collapsed");
        sidebar?.classList.remove("open", "mobile-open");
        return;
    }
    document.documentElement.classList.toggle("sidebar-collapsed", localStorage.getItem(SIDEBAR_STORAGE_KEY) === "true");
}

function bindRealtimeData() {
    onValue(ref(database, `institutes/${state.uid}`), (snapshot) => {
        state.institute = snapshot.val() || {};
        renderProfile();
        renderIdentity();
        renderStats();
        enforceInstituteApproval();
    });
    onValue(query(ref(database, "courses"), orderByChild("instituteUid"), equalTo(state.uid)), (snapshot) => {
        state.courses = snapshot.val() || {};
        renderCourses();
        renderStats();
    });
    onValue(query(ref(database, "courseInquiries"), orderByChild("instituteUid"), equalTo(state.uid)), (snapshot) => {
        state.inquiries = snapshot.val() || {};
        renderInquiries();
        renderRecentInquiries();
        renderStats();
    });
    onValue(ref(database, `conversations/${supportConversationId(state.uid)}`), (snapshot) => {
        state.supportConversation = snapshot.val() || {};
        renderInstituteSupportMessages();
    });
}

function showSection(sectionId) {
    if (!isInstituteApproved() && !["dashboard-section", "support-section", "settings-section"].includes(sectionId)) {
        toast("Your institute must be approved by admin before using this section.");
        sectionId = "dashboard-section";
    }
    document.querySelectorAll(".dash-section").forEach((section) => section.classList.toggle("active", section.id === sectionId));
    document.querySelectorAll(".dash-menu [data-section]").forEach((button) => button.classList.toggle("active", button.dataset.section === sectionId));
    const titles = {
        "dashboard-section": ["Dashboard", "Manage your courses and student inquiries."],
        "courses-section": ["My Courses", "Search, edit, publish, unpublish, or delete your courses."],
        "add-course-section": ["Add Course", "Create a course that appears on public course pages when published."],
        "inquiries-section": ["Student Inquiries", "Track and update student inquiry status."],
        "profile-section": ["Institute Profile", "Keep your public institute information up to date."],
        "support-section": ["Chat with Admin", "Ask about approval, account setup, or course publishing."],
        "settings-section": ["Settings", "Manage account preferences."]
    };
    const [title, subtitle] = titles[sectionId] || titles["dashboard-section"];
    text("page-title", title);
    text("page-subtitle", subtitle);
    document.getElementById("sidebar")?.classList.remove("open", "mobile-open");
}

function renderIdentity() {
    const name = state.institute.instituteName || state.user.fullName || "Institute";
    const initials = name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
    greetingName = name.split(" ")[0] || "Institute";
    text("welcome-name", name);
    text("sidebar-name", name);
    text("sidebar-email", state.institute.email || state.user.email || "");
    text("mini-logo", initials || "IN");
    updateClock();
}

function enforceInstituteApproval() {
    const approved = isInstituteApproved();
    document.getElementById("approval-notice")?.classList.toggle("hidden", approved);
    document.querySelectorAll('[data-section="courses-section"], [data-section="add-course-section"], [data-section="inquiries-section"], [data-section="profile-section"]').forEach((button) => {
        button.disabled = !approved;
        button.classList.toggle("disabled", !approved);
        button.title = approved ? "" : "Waiting for admin approval";
    });
    document.querySelectorAll('[data-section-jump="add-course-section"]').forEach((button) => {
        button.disabled = !approved;
        button.classList.toggle("disabled", !approved);
    });
    const status = normalize(state.institute.approvalStatus || state.institute.verificationStatus || state.institute.status || state.user.accountStatus || "pending");
    text("page-subtitle", approved ? "Manage your courses and student inquiries." : `Institute approval status: ${status}`);
}

function isInstituteApproved() {
    const status = normalize(state.institute.approvalStatus || state.institute.verificationStatus || state.institute.status || state.user.instituteStatus || state.user.accountStatus);
    return status === "approved" || status === "active";
}

function renderStats() {
    const courses = Object.values(state.courses);
    const inquiries = Object.values(state.inquiries);
    text("stat-total-courses", courses.length);
    text("stat-active-courses", courses.filter((course) => normalize(course.status) === "active").length);
    text("stat-pending-courses", courses.filter((course) => normalize(course.status) === "pending").length);
    text("stat-inquiries", inquiries.length);
    text("stat-profile", `${calculateProfileCompletion()}%`);
}

function renderProfile() {
    setValue("profileInstituteName", state.institute.instituteName || state.user.fullName || "");
    setValue("profilePhone", state.institute.phone || state.user.phone || "");
    setValue("profileAddress", state.institute.address || "");
    setValue("profileDistrict", state.institute.district || "");
    setValue("profileWebsite", state.institute.websiteURL || state.institute.facebookPage || "");
    setValue("profileLogo", state.institute.logoURL || state.user.photoURL || "");
    setValue("profileDescription", state.institute.description || "");
}

function renderCourses() {
    const container = document.getElementById("courses-table");
    let rows = Object.values(state.courses);
    rows = rows.filter((course) => {
        const haystack = [course.courseTitle, course.courseName, course.category, course.location, course.district].join(" ").toLowerCase();
        const status = normalize(course.status || "pending");
        return haystack.includes(state.courseSearch) && (state.courseStatus === "all" || status === state.courseStatus);
    });
    if (!rows.length) {
        container.innerHTML = `<div class="list-item">No courses found.</div>`;
        return;
    }
    container.innerHTML = `
        <table>
            <thead><tr><th>Course</th><th>Type</th><th>Fee</th><th>Location</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>${rows.map((course) => `
                <tr>
                    <td><strong>${esc(course.courseTitle || course.courseName)}</strong><br><span class="muted">${esc(course.category)} · ${esc(course.level || course.qualificationLevel)}</span></td>
                    <td>${esc(course.type || course.mode)}</td>
                    <td>${esc(course.fee || course.feeAmount)}</td>
                    <td>${esc(course.location || "-")}<br><span class="muted">${esc(course.district || "-")}</span></td>
                    <td><span class="badge badge-${normalize(course.status || "pending")}">${esc(course.status || "pending")}</span></td>
                    <td><div class="table-actions">
                        <button class="btn btn-light" data-edit="${escAttr(course.courseId)}">Edit</button>
                        <button class="btn ${normalize(course.status) === "active" ? "btn-green" : "btn-light"}" data-toggle="${escAttr(course.courseId)}">${normalize(course.status) === "active" ? "Unpublish" : "Awaiting Admin"}</button>
                        <button class="btn btn-danger" data-delete="${escAttr(course.courseId)}">Delete</button>
                    </div></td>
                </tr>
            `).join("")}</tbody>
        </table>
    `;
    container.querySelectorAll("[data-edit]").forEach((btn) => btn.addEventListener("click", () => editCourse(btn.dataset.edit)));
    container.querySelectorAll("[data-toggle]").forEach((btn) => btn.addEventListener("click", () => toggleCourse(btn.dataset.toggle)));
    container.querySelectorAll("[data-delete]").forEach((btn) => btn.addEventListener("click", () => deleteCourse(btn.dataset.delete)));
}

async function saveCourse(event) {
    event.preventDefault();
    if (!isInstituteApproved()) return toast("Admin approval is required before adding courses.");
    const editingId = value("editing-course-id");
    const courseId = editingId || push(ref(database, "courses")).key;
    const course = {
        courseId,
        instituteUid: state.uid,
        instituteName: state.institute.instituteName || state.user.fullName || "Institute",
        courseTitle: value("courseTitle"),
        courseName: value("courseTitle"),
        category: value("courseCategory"),
        level: value("courseLevel"),
        qualificationLevel: value("courseLevel"),
        duration: value("courseDuration"),
        fee: value("courseFee"),
        feeAmount: value("courseFee"),
        type: value("courseType"),
        mode: value("courseType"),
        location: value("location"),
        district: value("district"),
        startDate: value("startDate"),
        description: value("courseDescription"),
        eligibility: value("entryRequirements"),
        entryRequirements: value("entryRequirements"),
        contactPhone: value("contactNumber"),
        contactNumber: value("contactNumber"),
        imageURL: value("courseImage"),
        sourceType: "institute",
        status: editingId ? (state.courses[editingId]?.status || "pending") : "pending",
        updatedAt: serverTimestamp()
    };
    if (!course.courseTitle || !course.category || !course.duration || !course.fee || !course.type || !course.location || !course.district || !course.description || !course.entryRequirements || !course.contactNumber) {
        toast("Please complete all required course fields.");
        return;
    }
    if (!editingId) course.createdAt = serverTimestamp();
    await set(ref(database, `courses/${courseId}`), course);
    await logActivity(editingId ? "course_updated" : "course_created", `${editingId ? "Updated" : "Created"} course ${course.courseTitle}`, courseId);
    resetCourseForm();
    showSection("courses-section");
    toast("Course saved successfully.");
}

function editCourse(courseId) {
    const course = state.courses[courseId];
    if (!course) return;
    setValue("editing-course-id", courseId);
    setValue("courseTitle", course.courseTitle || course.courseName || "");
    setValue("courseCategory", course.category || "");
    setValue("courseLevel", course.level || course.qualificationLevel || "");
    setValue("courseDuration", course.duration || "");
    setValue("courseFee", course.fee || course.feeAmount || "");
    setValue("courseType", course.type || course.mode || "");
    setValue("location", course.location || "");
    setValue("district", course.district || "");
    setValue("startDate", course.startDate || "");
    setValue("courseDescription", course.description || "");
    setValue("entryRequirements", course.entryRequirements || course.eligibility || "");
    setValue("contactNumber", course.contactNumber || course.contactPhone || "");
    setValue("courseImage", course.imageURL || "");
    text("course-form-title", "Edit Course");
    document.getElementById("cancel-edit-btn").classList.remove("hidden");
    showSection("add-course-section");
}

async function toggleCourse(courseId) {
    if (!isInstituteApproved()) return toast("Admin approval is required before managing courses.");
    const course = state.courses[courseId];
    if (!course) return;
    if (normalize(course.status) !== "active") {
        toast("Admin approval is required before this course becomes public.");
        return;
    }
    const nextStatus = "inactive";
    await update(ref(database, `courses/${courseId}`), { status: nextStatus, updatedAt: serverTimestamp() });
    await logActivity("course_unpublished", `${nextStatus} ${course.courseTitle || course.courseName}`, courseId);
    toast("Course unpublished. Admin activation is required before it becomes public again.");
}

async function deleteCourse(courseId) {
    const course = state.courses[courseId];
    if (!course || !confirm(`Delete "${course.courseTitle || course.courseName}"? This cannot be undone.`)) return;
    await remove(ref(database, `courses/${courseId}`));
    await logActivity("course_deleted", `Deleted course ${course.courseTitle || course.courseName}`, courseId);
    toast("Course deleted.");
}

function resetCourseForm() {
    document.getElementById("course-form").reset();
    setValue("editing-course-id", "");
    text("course-form-title", "Add Course");
    document.getElementById("cancel-edit-btn").classList.add("hidden");
}

function renderInquiries() {
    const container = document.getElementById("inquiries-table");
    let rows = Object.values(state.inquiries).sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
    rows = rows.filter((row) => state.inquiryStatus === "all" || row.status === state.inquiryStatus);
    if (!rows.length) {
        container.innerHTML = `<div class="list-item">No inquiries found.</div>`;
        return;
    }
    container.innerHTML = `
        <table>
            <thead><tr><th>Student</th><th>Course</th><th>Message</th><th>Date</th><th>Status</th></tr></thead>
            <tbody>${rows.map((row) => `
                <tr>
                    <td><strong>${esc(row.studentName)}</strong><br><span class="muted">${esc(row.email || "-")} / ${esc(row.phone || "-")}</span></td>
                    <td>${esc(row.courseName)}</td>
                    <td>${esc(row.message)}</td>
                    <td>${formatDate(row.createdAt)}</td>
                    <td><select data-inquiry-status="${escAttr(row.inquiryId)}"><option ${row.status === "New" ? "selected" : ""}>New</option><option ${row.status === "Contacted" ? "selected" : ""}>Contacted</option><option ${row.status === "Closed" ? "selected" : ""}>Closed</option></select></td>
                </tr>
            `).join("")}</tbody>
        </table>
    `;
    container.querySelectorAll("[data-inquiry-status]").forEach((select) => select.addEventListener("change", () => updateInquiryStatus(select.dataset.inquiryStatus, select.value)));
}

function renderRecentInquiries() {
    const rows = Object.values(state.inquiries).slice(-5).reverse();
    const list = document.getElementById("recent-inquiries");
    list.innerHTML = rows.length ? rows.map((row) => `<div class="list-item"><strong>${esc(row.studentName)} asked about ${esc(row.courseName)}</strong><span class="muted">${esc(row.message || "")}</span></div>`).join("") : `<div class="list-item">No recent inquiries.</div>`;
}

async function updateInquiryStatus(inquiryId, status) {
    await update(ref(database, `courseInquiries/${inquiryId}`), { status, updatedAt: serverTimestamp() });
    toast("Inquiry status updated.");
}

async function saveProfile(event) {
    event.preventDefault();
    if (!isInstituteApproved()) return toast("Admin approval is required before editing your institute profile.");
    const data = {
        instituteName: value("profileInstituteName"),
        phone: value("profilePhone"),
        address: value("profileAddress"),
        district: value("profileDistrict"),
        websiteURL: value("profileWebsite"),
        facebookPage: value("profileWebsite"),
        logoURL: value("profileLogo"),
        description: value("profileDescription"),
        profileCompletion: calculateProfileCompletionFromForm(),
        updatedAt: serverTimestamp()
    };
    await Promise.all([
        update(ref(database, `institutes/${state.uid}`), data),
        update(ref(database, `users/${state.uid}`), { fullName: data.instituteName, phone: data.phone, photoURL: data.logoURL, updatedAt: serverTimestamp() })
    ]);
    toast("Institute profile updated.");
}

async function sendInstituteSupportMessage(event) {
    event.preventDefault();
    const subject = value("institute-support-subject") || "Institute Support";
    const message = value("institute-support-message");
    if (!message) return;
    const button = event.currentTarget.querySelector("button[type='submit']");
    const original = button?.innerHTML;
    if (button) {
        button.disabled = true;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
    }
    try {
        const conversationId = supportConversationId(state.uid);
        const messageRef = push(ref(database, `conversations/${conversationId}/messages`));
        const currentUnread = Number(state.supportConversation.unreadByAdmin || 0);
        const senderName = state.institute.instituteName || state.user.fullName || "Institute";
        const updates = {};
        updates[`conversations/${conversationId}/conversationId`] = conversationId;
        updates[`conversations/${conversationId}/type`] = "admin-support";
        updates[`conversations/${conversationId}/studentUid`] = state.uid;
        updates[`conversations/${conversationId}/userUid`] = state.uid;
        updates[`conversations/${conversationId}/participantIds/${state.uid}`] = true;
        updates[`conversations/${conversationId}/participantRoles/${state.uid}`] = "institute";
        updates[`conversations/${conversationId}/participantNames/${state.uid}`] = senderName;
        updates[`conversations/${conversationId}/lastMessage`] = message;
        updates[`conversations/${conversationId}/lastMessageAt`] = serverTimestamp();
        updates[`conversations/${conversationId}/lastSenderUid`] = state.uid;
        updates[`conversations/${conversationId}/unreadByAdmin`] = currentUnread + 1;
        updates[`conversations/${conversationId}/unreadByUser`] = 0;
        updates[`conversations/${conversationId}/status`] = "open";
        updates[`conversations/${conversationId}/updatedAt`] = serverTimestamp();
        if (!state.supportConversation.createdAt) updates[`conversations/${conversationId}/createdAt`] = serverTimestamp();
        updates[`conversations/${conversationId}/messages/${messageRef.key}`] = {
            messageId: messageRef.key,
            conversationId,
            senderUid: state.uid,
            senderName,
            senderEmail: state.user.email || state.institute.email || "",
            senderRole: "institute",
            receiverRole: "admin",
            subject,
            message,
            status: "sent",
            createdAt: serverTimestamp(),
            readAt: null
        };
        await update(ref(database), updates);
        event.currentTarget.reset();
        toast("Your message was sent to EduPath Admin.");
    } catch (error) {
        console.error(error);
        toast(error?.message || "Message could not be sent.");
    } finally {
        if (button) {
            button.disabled = false;
            button.innerHTML = original || '<i class="fas fa-paper-plane"></i> Send Message';
        }
    }
}

function renderInstituteSupportMessages() {
    const container = document.getElementById("institute-support-replies");
    if (!container) return;
    const messages = Object.values(state.supportConversation.messages || {}).sort((a, b) => getTimeValue(a.createdAt) - getTimeValue(b.createdAt));
    if (!messages.length) {
        container.innerHTML = '<div class="list-item">No messages yet. Ask admin a question.</div>';
        return;
    }
    container.innerHTML = messages.map((message) => `
        <div class="list-item">
            <strong>${esc(message.subject || "EduPath Support")} <span class="badge ${message.senderUid === state.uid ? "badge-pending" : "badge-active"}">${esc(message.senderRole || "support")}</span></strong>
            <span class="muted">${esc(message.message || "")}</span>
            <span class="muted">${formatDateTime(message.createdAt)} - ${esc(message.status || "sent")}</span>
        </div>
    `).join("");
}

function calculateProfileCompletion() {
    const fields = ["instituteName", "email", "phone", "address", "district", "websiteURL", "description", "logoURL"];
    return Math.round((fields.filter((field) => state.institute[field] || state.user[field]).length / fields.length) * 100);
}

function calculateProfileCompletionFromForm() {
    const fields = ["profileInstituteName", "profilePhone", "profileAddress", "profileDistrict", "profileWebsite", "profileLogo", "profileDescription"];
    return Math.round((fields.filter((id) => value(id)).length / fields.length) * 100);
}

async function logout() {
    await signOut(auth);
    localStorage.removeItem("uid");
    localStorage.removeItem("email");
    localStorage.removeItem("fullName");
    localStorage.removeItem("userType");
    window.location.href = "login.html";
}

function value(id) { return document.getElementById(id)?.value.trim() || ""; }
function setValue(id, val) { const el = document.getElementById(id); if (el) el.value = val || ""; }
function text(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }
function esc(value) { return String(value || "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[ch])); }
function escAttr(value) { return esc(value).replace(/`/g, "&#096;"); }
function startClock() {
    updateClock();
    if (!clockTimer) clockTimer = setInterval(updateClock, 1000);
}
function updateClock() {
    const now = new Date();
    const greetingEl = document.getElementById("institute-time-greeting");
    const dateEl = document.getElementById("institute-live-date");
    const clockEl = document.getElementById("institute-live-clock");
    if (greetingEl) greetingEl.textContent = `${timeGreeting(now.getHours())}, ${greetingName}`;
    if (dateEl) dateEl.textContent = now.toLocaleDateString(undefined, { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
    if (clockEl) {
        clockEl.textContent = now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
        clockEl.setAttribute("datetime", now.toISOString());
    }
}
function timeGreeting(hour) {
    if (hour < 12) return "Good Morning";
    if (hour < 17) return "Good Afternoon";
    return "Good Evening";
}
function formatDate(value) {
    if (!value) return "-";
    if (typeof value === "number") return new Date(value).toLocaleDateString();
    if (typeof value === "object" && value.seconds) return new Date(value.seconds * 1000).toLocaleDateString();
    return "-";
}
function formatDateTime(value) {
    const time = getTimeValue(value);
    return time ? new Date(time).toLocaleString() : "Just now";
}
function getTimeValue(value) {
    if (!value) return 0;
    if (typeof value === "number") return value;
    if (typeof value === "object" && value.seconds) return value.seconds * 1000;
    return new Date(value).getTime() || 0;
}
function supportConversationId(uid) { return `admin_${uid}`; }
function toast(message) {
    const el = document.getElementById("toast");
    el.textContent = message;
    el.classList.add("show");
    setTimeout(() => el.classList.remove("show"), 2600);
}
function logActivity(actionType, description, relatedEntityId = state.uid) {
    const logRef = push(ref(database, "activityLogs"));
    return set(logRef, { logId: logRef.key, uid: state.uid, userName: state.institute.instituteName || state.user.fullName || "Institute", userRole: "institute", actionType, description, relatedEntityType: "course", relatedEntityId, createdAt: serverTimestamp() });
}
