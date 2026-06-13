import { auth, database } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { ref, get, set, push, onValue, update, remove, serverTimestamp, query, orderByChild, equalTo } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

const normalize = (value) => String(value || "").trim().toLowerCase();
const state = { uid: "", user: {}, institute: {}, courses: {}, inquiries: {}, courseSearch: "", courseStatus: "all", inquiryStatus: "all" };
let clockTimer = null;
let greetingName = "Institute";

document.addEventListener("DOMContentLoaded", () => {
    wireUi();
    startClock();
    onAuthStateChanged(auth, initDashboard);
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
    document.getElementById("menu-toggle")?.addEventListener("click", () => document.getElementById("sidebar")?.classList.toggle("open"));
    document.getElementById("logout-btn")?.addEventListener("click", logout);
    document.getElementById("course-form")?.addEventListener("submit", saveCourse);
    document.getElementById("profile-form")?.addEventListener("submit", saveProfile);
    document.getElementById("cancel-edit-btn")?.addEventListener("click", resetCourseForm);
    document.getElementById("course-search")?.addEventListener("input", (e) => { state.courseSearch = e.target.value.toLowerCase(); renderCourses(); });
    document.getElementById("course-status-filter")?.addEventListener("change", (e) => { state.courseStatus = e.target.value; renderCourses(); });
    document.getElementById("inquiry-status-filter")?.addEventListener("change", (e) => { state.inquiryStatus = e.target.value; renderInquiries(); });
}

function bindRealtimeData() {
    onValue(ref(database, `institutes/${state.uid}`), (snapshot) => {
        state.institute = snapshot.val() || {};
        renderProfile();
        renderIdentity();
        renderStats();
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
}

function showSection(sectionId) {
    document.querySelectorAll(".dash-section").forEach((section) => section.classList.toggle("active", section.id === sectionId));
    document.querySelectorAll(".dash-menu [data-section]").forEach((button) => button.classList.toggle("active", button.dataset.section === sectionId));
    const titles = {
        "dashboard-section": ["Dashboard", "Manage your courses and student inquiries."],
        "courses-section": ["My Courses", "Search, edit, publish, unpublish, or delete your courses."],
        "add-course-section": ["Add Course", "Create a course that appears on public course pages when published."],
        "inquiries-section": ["Student Inquiries", "Track and update student inquiry status."],
        "profile-section": ["Institute Profile", "Keep your public institute information up to date."],
        "settings-section": ["Settings", "Manage account preferences."]
    };
    const [title, subtitle] = titles[sectionId] || titles["dashboard-section"];
    text("page-title", title);
    text("page-subtitle", subtitle);
    document.getElementById("sidebar")?.classList.remove("open");
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
                        <button class="btn btn-green" data-toggle="${escAttr(course.courseId)}">${normalize(course.status) === "active" ? "Unpublish" : "Publish"}</button>
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
    const course = state.courses[courseId];
    if (!course) return;
    const nextStatus = normalize(course.status) === "active" ? "inactive" : "active";
    await update(ref(database, `courses/${courseId}`), { status: nextStatus, updatedAt: serverTimestamp() });
    await logActivity(nextStatus === "active" ? "course_published" : "course_unpublished", `${nextStatus} ${course.courseTitle || course.courseName}`, courseId);
    toast(`Course ${nextStatus === "active" ? "published" : "unpublished"}.`);
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
    const clockEl = document.getElementById("institute-live-clock");
    if (greetingEl) greetingEl.textContent = `${timeGreeting(now.getHours())}, ${greetingName}`;
    if (clockEl) {
        clockEl.textContent = now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
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
