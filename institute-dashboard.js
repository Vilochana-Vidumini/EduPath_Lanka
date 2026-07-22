import { auth, database } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { ref, get, set, push, onValue, update, remove, serverTimestamp, query, orderByChild, equalTo } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
import { ensureDashboardTopbarLayout, initDashboardNotifications, updateDashboardGreetingName } from "./dashboard-topbar.js";
import { initDashboardSidebar, updateSidebarUser } from "./sidebar.js";

const normalize = (value) => String(value || "").trim().toLowerCase();

const state = {
    uid: "",
    user: {},
    institute: {},
    courses: {},
    inquiries: {},
    scholarships: {},
    events: {},
    applications: {},
    notifications: {},
    supportConversation: {},
    courseSearch: "",
    courseStatus: "all",
    courseLevel: "all",
    inquiryStatus: "all",
    scholSearch: "",
    scholStatus: "all",
    appSearch: "",
    appStatus: "all"
};

// Colombo districts to Province mapping for Sri Lanka student distribution chart
const DISTRICT_PROVINCES = {
    "colombo": "Western", "gampaha": "Western", "kalutara": "Western",
    "kandy": "Central", "matale": "Central", "nuwara eliya": "Central",
    "galle": "Southern", "matara": "Southern", "hambantota": "Southern",
    "jaffna": "Northern", "kilinochchi": "Northern", "mannar": "Northern", "vavuniya": "Northern", "mullaitivu": "Northern",
    "batticaloa": "Eastern", "ampara": "Eastern", "trincomalee": "Eastern",
    "kurunegala": "North Western", "puttalam": "North Western",
    "anuradhapura": "North Central", "polonnaruwa": "North Central",
    "badulla": "Uva", "moneragala": "Uva",
    "ratnapura": "Sabaragamuwa", "kegalle": "Sabaragamuwa"
};

const normalizedImageValue = (id) => {
    let val = value(id);
    if (window.EduPathImageUtils) {
        val = window.EduPathImageUtils.normalizeImageUrl(val);
    }
    return val;
};

document.addEventListener("DOMContentLoaded", () => {
    initDashboardSidebar();
    
    if (window.EduPathImageUtils) {
        ['profileLogo', 'courseImage', 'schol-image-url', 'event-image-url'].forEach(id => {
            const input = document.getElementById(id);
            const container = input ? input.closest('.image-input-container') : null;
            const errorElement = container ? container.querySelector('.image-url-error') : null;
            if (input && container) {
                window.EduPathImageUtils.previewImageFromUrl(input, container, errorElement);
            }
        });
    }

    wireUi();
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

    if (!state.user.instituteId) {
        const institutesSnap = await get(ref(database, 'institutes'));
        const allInstitutes = institutesSnap.val() || {};
        let foundInstitute = null;
        
        for (const [id, inst] of Object.entries(allInstitutes)) {
            if (inst.ownerUid === state.uid || inst.representativeUid === state.uid || inst.uid === state.uid || id === state.uid) {
                foundInstitute = { id, ...inst };
                break;
            }
        }
        
        if (foundInstitute) {
            state.user.instituteId = foundInstitute.id;
            state.user.instituteName = foundInstitute.instituteName || foundInstitute.name || foundInstitute.title || "";
            state.user.instituteOnboardingCompleted = true;
            
            await update(ref(database, `users/${state.uid}`), {
                instituteId: state.user.instituteId,
                instituteName: state.user.instituteName,
                instituteOnboardingCompleted: true
            });
        }
    }

    // Initialize clock, notifications, and theme settings from shared dashboard layout
    ensureDashboardTopbarLayout();
    initDashboardNotifications(user.uid, "institute");

    bindRealtimeData();
}

function wireUi() {
    // Navigation
    document.querySelectorAll("[data-section]").forEach((button) => {
        button.addEventListener("click", (e) => {
            e.preventDefault();
            const section = button.dataset.section || button.getAttribute("href").replace("#", "");
            showSection(section);
        });
    });
    document.querySelectorAll("[data-section-jump]").forEach((button) => {
        button.addEventListener("click", () => showSection(button.dataset.sectionJump));
    });

    // Auth & Profile
    document.getElementById("logout-btn-sidebar")?.addEventListener("click", logout);
    document.getElementById("profile-form")?.addEventListener("submit", saveProfile);

    // Courses Action Handles
    document.getElementById("open-add-course-btn")?.addEventListener("click", () => {
        resetCourseForm();
        showSection("add-course-section");
    });
    document.getElementById("quick-add-course-btn")?.addEventListener("click", () => {
        resetCourseForm();
        showSection("add-course-section");
    });
    document.getElementById("action-create-course")?.addEventListener("click", () => {
        resetCourseForm();
        showSection("add-course-section");
    });
    document.getElementById("course-form")?.addEventListener("submit", saveCourse);
    document.getElementById("cancel-edit-btn")?.addEventListener("click", () => {
        resetCourseForm();
        showSection("courses-section");
    });
    document.getElementById("course-search")?.addEventListener("input", (e) => {
        state.courseSearch = e.target.value.toLowerCase();
        renderCourses();
    });
    document.getElementById("course-status-filter")?.addEventListener("change", (e) => {
        state.courseStatus = e.target.value;
        renderCourses();
    });
    document.getElementById("course-level-filter")?.addEventListener("change", (e) => {
        state.courseLevel = e.target.value;
        renderCourses();
    });



    // Support Chat
    document.getElementById("institute-support-form")?.addEventListener("submit", sendInstituteSupportMessage);

    // Scholarships
    document.getElementById("open-add-schol-btn")?.addEventListener("click", () => openScholModal());
    document.getElementById("quick-add-schol-btn")?.addEventListener("click", () => openScholModal());
    document.getElementById("action-create-schol")?.addEventListener("click", () => openScholModal());
    document.getElementById("close-schol-modal")?.addEventListener("click", () => closeScholModal());
    document.getElementById("btn-cancel-schol")?.addEventListener("click", () => closeScholModal());
    document.getElementById("schol-form")?.addEventListener("submit", saveScholarship);
    document.getElementById("schol-search")?.addEventListener("input", (e) => {
        state.scholSearch = e.target.value.toLowerCase();
        renderScholarships();
    });
    document.getElementById("schol-status-filter")?.addEventListener("change", (e) => {
        state.scholStatus = e.target.value;
        renderScholarships();
    });

    // Profile View/Edit Toggle
    document.getElementById("edit-institute-profile-btn")?.addEventListener("click", () => {
        document.getElementById("profile-section")?.setAttribute("data-editing-profile", "true");
        document.getElementById("edit-institute-profile-btn").style.display = "none";
    });
    document.getElementById("cancel-profile-btn")?.addEventListener("click", () => {
        document.getElementById("profile-section")?.removeAttribute("data-editing-profile");
        document.getElementById("edit-institute-profile-btn").style.display = "inline-block";
        renderProfile();
    });

    // Events
    document.getElementById("open-add-event-btn")?.addEventListener("click", () => openEventModal());
    document.getElementById("quick-add-event-btn")?.addEventListener("click", () => openEventModal());
    document.getElementById("action-create-event")?.addEventListener("click", () => openEventModal());
    document.getElementById("close-event-modal")?.addEventListener("click", () => closeEventModal());
    document.getElementById("btn-cancel-event")?.addEventListener("click", () => closeEventModal());
    document.getElementById("event-form")?.addEventListener("submit", saveEvent);



    // Notifications Center
    document.getElementById("clear-notifications-btn")?.addEventListener("click", clearAllNotifications);

    // Course Performance Tabs
    document.querySelectorAll(".perf-tab-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".perf-tab-btn").forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
            renderCoursePerformance(btn.dataset.tab);
        });
    });

    // Global Search Header
    document.getElementById("global-dashboard-search")?.addEventListener("input", (e) => {
        const query = e.target.value.toLowerCase();
        // Redirect searches to sections dynamically
        if (query) {
            state.courseSearch = query;
            state.scholSearch = query;
            renderCourses();
            renderScholarships();
        }
    });
}

function bindRealtimeData() {
    // Keep the user and institute approval records synchronized in the UI.
    onValue(ref(database, `users/${state.uid}`), (snapshot) => {
        state.user = { ...state.user, ...(snapshot.val() || {}) };
        renderIdentity();
        enforceInstituteApproval();
    });
    // 1. Institute Info
    const instKey = state.user.instituteId || state.uid;
    onValue(ref(database, `institutes/${instKey}`), (snapshot) => {
        state.institute = snapshot.val() || {};
        renderProfile();
        renderIdentity();
        renderStats();
        enforceInstituteApproval();
        renderProfileProgressRing();
    });

    // 2. Courses
    onValue(ref(database, "courses"), (snapshot) => {
        const all = snapshot.val() || {};
        const filtered = {};
        Object.entries(all).forEach(([id, item]) => {
            if (item.instituteId === state.uid || item.instituteUid === state.uid) {
                filtered[id] = item;
            }
        });
        state.courses = filtered;
        renderCourses();
        renderStats();
        renderCoursePerformance();
    });



    // 4. Chat support with admin
    onValue(ref(database, `conversations/${supportConversationId(state.uid)}`), (snapshot) => {
        state.supportConversation = snapshot.val() || {};
        renderInstituteSupportMessages();
        renderMessageBadges();
    });

    // 5. Scholarships
    onValue(ref(database, "scholarships"), (snapshot) => {
        const all = snapshot.val() || {};
        const filtered = {};
        Object.entries(all).forEach(([id, item]) => {
            if (item.instituteId === state.uid || item.instituteUid === state.uid) {
                filtered[id] = item;
            }
        });
        state.scholarships = filtered;
        renderScholarships();
        renderStats();
    });

    // 6. Events
    onValue(ref(database, "events"), (snapshot) => {
        const all = snapshot.val() || {};
        const filtered = {};
        Object.entries(all).forEach(([id, item]) => {
            if (item.instituteId === state.uid || item.instituteUid === state.uid) {
                filtered[id] = item;
            }
        });
        state.events = filtered;
        renderEvents();
        renderStats();
    });



    // 8. Notifications
    onValue(ref(database, `notifications/${state.uid}`), (snapshot) => {
        state.notifications = snapshot.val() || {};
        renderNotificationsList();
    });
}

function showSection(sectionId) {
    if (!isInstituteApproved() && !["dashboard-section", "support-section", "settings-section", "profile-section", "add-course-section"].includes(sectionId)) {
        toast("Your institute profile is pending review. This section is locked until approved.");
        sectionId = "dashboard-section";
    }

    document.querySelectorAll(".dashboard-section").forEach((section) => {
        section.classList.toggle("active", section.id === sectionId);
    });

    document.querySelectorAll(".sidebar-links li a").forEach((button) => {
        const target = button.dataset.section || button.getAttribute("href").replace("#", "");
        button.classList.toggle("active", target === sectionId);
    });

    const titles = {
        "dashboard-section": ["Dashboard Workspace", "Manage your courses, scholarship lists, events and enquiries."],
        "courses-section": ["My Courses Catalog", "Configure, edit, publish, or suspend courses from public searches."],
        "add-course-section": ["Course Setup Spec", "Add detailed course modules, criteria, intake schedules, and images."],
        "scholarships-section": ["Scholarships Registry", "Promote institution funding scopes, full tuitions, and criteria."],
        "events-section": ["Upcoming Campus Events", "Host Open Days, webinars, local career seminars, and workshops."],
        "notifications-section": ["Notification Center", "View alerts regarding course approvals and student messages."],
        "support-section": ["Chat with Admin", "Direct contact chat channel to EduPath Lanka platform support admins."],
        "settings-section": ["Workspace Preferences", "Adjust platform displays, styling variables, and account info."]
    };

    const [title, subtitle] = titles[sectionId] || titles["dashboard-section"];
    text("page-title", title);
    text("page-subtitle", subtitle);

    window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderIdentity() {
    const isCompleted = state.user.instituteOnboardingCompleted;
    const name = state.institute.instituteName || state.user.instituteName || (isCompleted ? "Institute" : "Institute Setup Required");

    updateDashboardGreetingName(name);
    text("welcome-name", isCompleted ? name : "Complete Your Institute Profile");
    
    if (!isCompleted) {
        text("welcome-subtitle", "Add your official institute details to submit your profile for admin review.");
    }

    text("top-user-name", name.split(" ")[0]);

    updateSidebarUser({
        fullName: name,
        role: "Institute",
        photoURL: state.institute.logoURL || ""
    });

    const repName = state.user.fullName || "";
    const repSpan = document.getElementById("sidebar-user-rep");
    if (repSpan && repName) {
        repSpan.textContent = `Representative: ${repName}`;
        repSpan.classList.remove("hidden");
    }

    const initials = name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
    const logoCircle = document.getElementById("welcome-logo-circle");
    if (logoCircle) {
        if (state.institute.logoURL) {
            logoCircle.style.background = `url('${state.institute.logoURL}') center/cover no-repeat`;
            logoCircle.textContent = "";
        } else {
            logoCircle.style.background = "";
            logoCircle.textContent = initials || "IN";
        }
    }

    const topbarAvatar = document.getElementById("topbar-avatar");
    if (topbarAvatar) {
        if (state.institute.logoURL) {
            topbarAvatar.innerHTML = `<img src="${state.institute.logoURL}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
        } else {
            topbarAvatar.innerHTML = `<i class="fas fa-user"></i>`;
        }
    }
}

function enforceInstituteApproval() {
    const isCompleted = state.user.instituteOnboardingCompleted;
    document.getElementById("onboarding-notice")?.classList.toggle("hidden", isCompleted);

    const approved = isInstituteApproved();
    document.getElementById("approval-notice")?.classList.toggle("hidden", approved || !isCompleted);

    const actionBtns = ["quick-add-course-btn", "quick-add-schol-btn", "quick-add-event-btn", "open-add-course-btn", "open-add-schol-btn", "open-add-event-btn", "action-create-course", "action-create-schol", "action-create-event"];
    actionBtns.forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.disabled = !isCompleted;
    });

    const statuses = [state.institute.verificationStatus, state.institute.approvalStatus, state.institute.status, state.user.instituteStatus].map(normalize).filter(Boolean); if (!statuses.length && state.user.accountStatus) statuses.push(normalize(state.user.accountStatus));
    const statusText = statuses.includes("approved") || statuses.includes("active") ? "Approved" : statuses[0] || "Pending";
    const badge = document.getElementById("approval-badge");
    if (badge) {
        badge.textContent = statusText;
        badge.className = `badge badge-${approved ? "success" : "warning"}`;
    }

    document.querySelectorAll('.sidebar-links li a[data-section]').forEach((link) => {
        const sec = link.dataset.section;
        if (!["dashboard-section", "support-section", "settings-section", "profile-section"].includes(sec)) {
            if (!approved) {
                link.classList.add("disabled");
                link.style.opacity = "0.5";
                link.style.pointerEvents = "none";
                link.setAttribute("title", "Waiting for admin approval");
            } else {
                link.classList.remove("disabled");
                link.style.opacity = "";
                link.style.pointerEvents = "";
                link.setAttribute("title", "");
            }
        }
    });
}

function isInstituteApproved() {
    const statuses = [state.institute.verificationStatus, state.institute.approvalStatus, state.institute.status, state.user.instituteStatus].map(normalize).filter(Boolean); if (!statuses.length && state.user.accountStatus) statuses.push(normalize(state.user.accountStatus));
    return statuses.includes("approved") || statuses.includes("active");
}

function renderStats() {
    const courses = Object.values(state.courses);
    const scholarships = Object.values(state.scholarships);
    const events = Object.values(state.events);

    text("stat-total-courses", courses.length);
    text("stat-active-courses", courses.filter((c) => normalize(c.status) === "active").length);
    text("stat-pending-courses", courses.filter((c) => normalize(c.status) === "pending").length);
    text("stat-scholarships", scholarships.length);
    text("stat-events", events.length);

    // Monthly views pseudo-render or from institute data
    text("stat-profile-views", state.institute.monthlyViews || state.institute.profileViews || "180");
}

function renderProfileProgressRing() {
    const percentage = calculateProfileCompletion();
    const fillCircle = document.getElementById("dashboard-progress-fill");

    text("dashboard-progress-percent", `${percentage}%`);
    text("profile-completion-header", `${percentage}% Complete`);

    const badge = document.getElementById("completion-badge");
    if (badge) badge.textContent = `${percentage}% Profile Completed`;

    if (fillCircle) {
        // SVG dash-array circumference is 314.15 (radius 50)
        const circumference = 2 * Math.PI * 50;
        const offset = circumference - (percentage / 100) * circumference;
        fillCircle.style.strokeDashoffset = offset;
    }

    // Populate checklist items
    const missing = getMissingProfileFields();
    const list = document.getElementById("missing-info-list");
    if (list) {
        if (!missing.length) {
            list.innerHTML = `<li class="completed"><i class="fas fa-check-circle"></i> Profile completed! Keep it updated.</li>`;
        } else {
            list.innerHTML = missing.map((item) => `<li class="todo"><i class="far fa-circle"></i> Add ${item}</li>`).join("");
        }
    }
}

function calculateProfileCompletion() {
    const fields = [
        state.institute.instituteName || state.user.fullName,
        state.institute.logoURL,
        state.institute.instituteType,
        state.institute.regNumber,
        state.institute.description,
        state.institute.address,
        state.institute.district,
        state.institute.province,
        state.institute.phone,
        state.institute.websiteURL,
        state.institute.facebookPage,
        state.institute.linkedinPage,
        state.institute.establishedYear,
        state.institute.accreditation,
        state.institute.facilities
    ];
    const completed = fields.filter(Boolean).length;
    return Math.round((completed / fields.length) * 100);
}

function getMissingProfileFields() {
    const missing = [];
    if (!state.institute.logoURL) missing.push("Brand Logo");
    if (!state.institute.instituteType) missing.push("Institute Type");
    if (!state.institute.regNumber) missing.push("Govt Registration No");
    if (!state.institute.description) missing.push("Description Profile");
    if (!state.institute.websiteURL) missing.push("Website URL");
    if (!state.institute.facebookPage && !state.institute.linkedinPage) missing.push("Social Links");
    if (!state.institute.establishedYear) missing.push("Established Year");
    if (!state.institute.accreditation) missing.push("Accreditations");
    if (!state.institute.facilities) missing.push("Campus Facilities");
    return missing;
}

// ----------------- PROFILE -----------------
function renderProfile() {
    if (state.user.instituteOnboardingCompleted && !document.getElementById("profile-section")?.hasAttribute("data-editing-profile")) {
        document.getElementById("profile-section")?.removeAttribute("data-editing-profile");
        const editBtn = document.getElementById("edit-institute-profile-btn");
        if (editBtn) editBtn.style.display = "inline-block";
    } else if (!state.user.instituteOnboardingCompleted) {
        document.getElementById("profile-section")?.setAttribute("data-editing-profile", "true");
        const editBtn = document.getElementById("edit-institute-profile-btn");
        if (editBtn) editBtn.style.display = "none";
    }

    setValue("repName", state.user.fullName || "");
    setValue("repEmail", state.user.email || "");
    setValue("repPhone", state.user.phone || "");
    setValue("repDesignation", state.institute.representativeDesignation || state.user.designation || "");

    setValue("profileInstituteName", state.institute.instituteName || state.institute.name || "");
    setValue("profileType", state.institute.instituteType || "");
    setValue("profilePhone", state.institute.contactPhone || state.institute.phone || "");
    setValue("profileAddress", state.institute.streetAddress || state.institute.address || "");
    setValue("profileDistrict", state.institute.district || "");
    setValue("profileProvince", state.institute.province || "");
    setValue("profileWebsite", state.institute.websiteUrl || state.institute.websiteURL || "");
    setValue("profileFacebook", state.institute.facebookPage || "");
    setValue("profileLinkedIn", state.institute.linkedInPage || state.institute.linkedinPage || "");
    setValue("profileLogo", state.institute.instituteLogoUrl || state.institute.logoURL || "");
    setValue("profileDescription", state.institute.instituteDescription || state.institute.description || "");
    setValue("profileRegNumber", state.institute.governmentRegistrationNumber || state.institute.regNumber || "");
    setValue("profileEstablished", state.institute.establishedYear || "");
    setValue("profileAccreditation", state.institute.accreditationDetails || state.institute.accreditation || "");
    
    let facilities = state.institute.facilitiesAvailable || state.institute.facilities || [];
    if (Array.isArray(facilities)) facilities = facilities.join(", ");
    setValue("profileFacilities", facilities);
    
    setValue("profileEmail", state.institute.officialEmail || state.institute.email || "");
}

async function saveProfile(event) {
    event.preventDefault();
    const btn = document.getElementById("save-profile-btn") || event.submitter;
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Saving Profile...`;
    }

    const instKey = state.user.instituteId || state.uid;

    let facilities = value("profileFacilities").split(',').map(f => f.trim()).filter(Boolean);

    const instituteData = {
        instituteName: value("profileInstituteName"),
        instituteType: value("profileType"),
        contactPhone: value("profilePhone"),
        streetAddress: value("profileAddress"),
        district: value("profileDistrict"),
        province: value("profileProvince"),
        websiteUrl: value("profileWebsite"),
        facebookPage: value("profileFacebook"),
        linkedInPage: value("profileLinkedIn"),
        instituteLogoUrl: normalizedImageValue("profileLogo"),
        instituteDescription: value("profileDescription"),
        governmentRegistrationNumber: value("profileRegNumber"),
        establishedYear: value("profileEstablished"),
        accreditationDetails: value("profileAccreditation"),
        facilitiesAvailable: facilities.length > 0 ? facilities : null,
        officialEmail: value("profileEmail"),
        
        representativeName: value("repName"),
        representativeEmail: value("repEmail"),
        representativePhone: value("repPhone"),
        representativeDesignation: value("repDesignation"),

        approvalStatus: "pending",
        status: "pending",
        publicVisibility: false,
        ownerUid: state.uid,
        updatedAt: serverTimestamp()
    };
    
    // Fallbacks for older dashboard usages
    instituteData.name = instituteData.instituteName;
    instituteData.phone = instituteData.contactPhone;
    instituteData.address = instituteData.streetAddress;
    instituteData.description = instituteData.instituteDescription;
    instituteData.logoURL = instituteData.instituteLogoUrl;
    instituteData.facilities = facilities.length > 0 ? facilities : null;

    const repData = {
        representativeName: value("repName"),
        representativeEmail: value("repEmail"),
        representativePhone: value("repPhone"),
        representativeDesignation: value("repDesignation"),
        instituteId: instKey,
        onboardingCompleted: true,
        updatedAt: serverTimestamp()
    };

    const userData = {
        fullName: value("repName"),
        phone: value("repPhone"),
        instituteName: instituteData.instituteName,
        instituteId: instKey,
        instituteOnboardingCompleted: true,
        approvalStatus: "pending",
        accountStatus: "pending",
        updatedAt: serverTimestamp()
    };

    try {
        const notifRef = push(ref(database, 'notifications/admin'));
        const notificationPayload = {
            title: 'New Institute Approval Request',
            body: `${userData.instituteName} has submitted their profile for admin approval.`,
            type: 'INSTITUTE_APPROVAL',
            relatedId: instKey,
            createdAt: serverTimestamp(),
            isRead: false
        };

        await Promise.all([
            update(ref(database, `institutes/${instKey}`), instituteData),
            update(ref(database, `users/${state.uid}`), userData),
            update(ref(database, `instituteRepresentatives/${state.uid}`), repData),
            update(notifRef, notificationPayload)
        ]);
        toast("Institute profile submitted for admin approval.", "success");
        state.user.instituteOnboardingCompleted = true;
        enforceInstituteApproval();
        renderIdentity();
        document.getElementById("profile-section")?.removeAttribute("data-editing-profile");
        const editBtn = document.getElementById("edit-institute-profile-btn");
        if (editBtn) editBtn.style.display = "inline-block";
    } catch (e) {
        toast("Could not submit institute profile. Please try again.", "error");
        console.error(e);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `<i class="fas fa-save"></i> Save & Submit for Admin Approval`;
        }
    }
}

// ----------------- COURSES -----------------
function renderCourses() {
    const container = document.getElementById("courses-table-body");
    if (!container) return;

    let rows = Object.values(state.courses);
    rows = rows.filter((course) => {
        const haystack = [course.courseTitle, course.courseName, course.category, course.location, course.district].join(" ").toLowerCase();
        const matchesSearch = haystack.includes(state.courseSearch);
        const matchesStatus = state.courseStatus === "all" || normalize(course.status || "pending") === state.courseStatus;
        const matchesLevel = state.courseLevel === "all" || course.level === state.courseLevel || course.qualificationLevel === state.courseLevel;
        return matchesSearch && matchesStatus && matchesLevel;
    });

    if (!rows.length) {
        container.innerHTML = `<tr><td colspan="7" class="text-center muted">No courses have been added yet.</td></tr>`;
        return;
    }

    container.innerHTML = rows.map((course) => {
        return `
            <tr>
                <td>
                    <div style="display:flex;align-items:center;gap:10px;">
                        <div class="list-thumb"><img src="${escapeAttr(course.imageURL || 'images/course-placeholder.png')}" onerror="this.src='images/course-placeholder.png'"></div>
                        <div>
                            <strong>${esc(course.courseTitle || course.courseName)}</strong>
                            <br><span class="muted">${esc(course.location || "-")}, ${esc(course.district || "-")}</span>
                        </div>
                    </div>
                </td>
                <td><strong>${esc(course.level || "-")}</strong><br><span class="muted">${esc(course.category)}</span></td>
                <td><span class="badge badge-primary">${esc(course.type || course.mode)}</span></td>
                <td><strong>${esc(course.fee || "-")}</strong></td>
                <td>${getStatusBadge(course.status)}</td>
                <td>${formatDate(course.createdAt)}</td>
                <td>${getTableActions("course", course.courseId, course.status)}</td>
            </tr>
        `;
    }).join("");

    container.querySelectorAll("[data-edit-course]").forEach((btn) => btn.addEventListener("click", () => editCourse(btn.dataset.editCourse)));
    container.querySelectorAll("[data-delete-course]").forEach((btn) => btn.addEventListener("click", () => deleteCourse(btn.dataset.deleteCourse)));
    container.querySelectorAll("[data-view-course]").forEach((btn) => btn.addEventListener("click", () => viewCourseDetails(btn.dataset.viewCourse)));
    container.querySelectorAll("[data-view-reason-course]").forEach((btn) => btn.addEventListener("click", () => viewRejectionReason("course", btn.dataset.viewReasonCourse)));
}

async function saveCourse(event) {
    event.preventDefault();
    if (!state.uid) return toast("You must be logged in to save courses.");

    const editingId = value("editing-course-id");
    const courseId = editingId || push(ref(database, "courses")).key;

    const course = {
        courseId,
        instituteUid: state.uid,
        instituteId: state.uid,
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
        startDate: value("startDate") || "",
        description: value("courseDescription"),
        eligibility: value("entryRequirements"),
        entryRequirements: value("entryRequirements"),
        contactPhone: value("contactNumber"),
        contactNumber: value("contactNumber"),
        imageURL: normalizedImageValue("courseImage") || "images/course-placeholder.png",
        sourceType: "institute",
        status: editingId ? (
            ["active", "rejected"].includes(normalize(state.courses[editingId]?.status)) ? "pending" : (state.courses[editingId]?.status || "pending")
        ) : "pending",
        updatedAt: serverTimestamp()
    };

    if (!editingId) course.createdAt = serverTimestamp();

    await set(ref(database, `courses/${courseId}`), course);
    await logActivity(editingId ? "course_updated" : "course_created", `${editingId ? "Updated" : "Created"} course ${course.courseTitle}`, courseId);

    resetCourseForm();
    showSection("courses-section");
    toast("Course specifications saved. Pending admin validation.");
}

function editCourse(courseId) {
    const c = state.courses[courseId];
    if (!c) return;

    setValue("editing-course-id", courseId);
    setValue("courseTitle", c.courseTitle || c.courseName || "");
    setValue("courseCategory", c.category || "");
    setValue("courseLevel", c.level || c.qualificationLevel || "");
    setValue("courseDuration", c.duration || "");
    setValue("courseFee", c.fee || c.feeAmount || "");
    setValue("courseType", c.type || c.mode || "");
    setValue("location", c.location || "");
    setValue("district", c.district || "");
    setValue("startDate", c.startDate || "");
    setValue("courseDescription", c.description || "");
    setValue("entryRequirements", c.entryRequirements || c.eligibility || "");
    setValue("contactNumber", c.contactNumber || c.contactPhone || "");
    setValue("courseImage", c.imageURL || "");

    text("course-form-title", "Modify Course Details");
    document.getElementById("cancel-edit-btn")?.classList.remove("hidden");
    showSection("add-course-section");
}

async function toggleCourse(courseId) {
    const c = state.courses[courseId];
    if (!c) return;
    const current = normalize(c.status || "pending");
    const nextStatus = current === "active" ? "inactive" : "pending";

    await update(ref(database, `courses/${courseId}`), {
        status: nextStatus,
        updatedAt: serverTimestamp()
    });

    await logActivity(
        nextStatus === "pending" ? "course_republished" : "course_suspended",
        `${nextStatus === "pending" ? "Submitted approval request for" : "Suspended"} course ${c.courseTitle}`,
        courseId
    );

    toast(nextStatus === "pending" ? "Submitted to admin for approval." : "Course suspended from search catalogs.");
}

async function deleteCourse(courseId) {
    const c = state.courses[courseId];
    if (!c || !confirm(`Permanently remove "${c.courseTitle}" course spec?`)) return;

    await remove(ref(database, `courses/${courseId}`));
    await logActivity("course_deleted", `Deleted course ${c.courseTitle}`, courseId);
    toast("Course catalogue entry removed.");
}

function resetCourseForm() {
    document.getElementById("course-form").reset();
    setValue("editing-course-id", "");
    text("course-form-title", "Create New Course");
}

// ----------------- SCHOLARSHIPS -----------------
function openScholModal(scholId = "") {
    const modal = document.getElementById("schol-modal");
    if (!modal) return;
    modal.classList.remove("hidden");

    const form = document.getElementById("schol-form");
    form.reset();
    setValue("editing-schol-id", "");
    text("schol-modal-title", "Publish Scholarship Scheme");

    if (scholId) {
        const s = state.scholarships[scholId];
        if (!s) return;
        text("schol-modal-title", "Edit Scholarship Scheme");
        setValue("editing-schol-id", scholId);
        setValue("schol-name", s.scholarshipName || s.name || "");
        setValue("schol-provider", s.provider || "");
        setValue("schol-provider-type", s.providerType || "");
        setValue("schol-category", s.category || "");
        setValue("schol-support-type", s.supportType || "");
        setValue("schol-amount", s.amount || "");
        setValue("schol-deadline", s.deadline || "");
        setValue("schol-district", s.district || "");
        setValue("schol-qualification", s.qualificationLevel || "");
        setValue("schol-apply-link", s.applyLink || "");
        setValue("schol-contact-email", s.contactEmail || "");
        setValue("schol-contact-phone", s.contactPhone || "");
        setValue("schol-image-url", s.imageURL || "");
        setValue("schol-description", s.description || "");
        setValue("schol-eligibility", s.eligibility || "");
    }
}

function closeScholModal() {
    document.getElementById("schol-modal").classList.add("hidden");
}

async function saveScholarship(event) {
    event.preventDefault();
    if (!state.uid) return toast("You must be logged in to list scholarships.");

    const editingId = value("editing-schol-id");
    const id = editingId || push(ref(database, "scholarships")).key;

    const payload = {
        scholarshipId: id,
        instituteUid: state.uid,
        instituteId: state.uid,
        scholarshipName: value("schol-name"),
        name: value("schol-name"),
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
        applyLink: value("schol-apply-link") || "",
        contactEmail: value("schol-contact-email") || "",
        contactPhone: value("schol-contact-phone") || "",
        imageURL: normalizedImageValue("schol-image-url") || "images/schol-placeholder.png",
        status: editingId ? (
            ["active", "rejected"].includes(normalize(state.scholarships[editingId]?.status)) ? "pending" : (state.scholarships[editingId]?.status || "pending")
        ) : "pending",
        updatedAt: serverTimestamp()
    };

    if (!editingId) payload.createdAt = serverTimestamp();

    await set(ref(database, `scholarships/${id}`), payload);
    await logActivity(editingId ? "scholarship_updated" : "scholarship_created", `${editingId ? "Updated" : "Created"} scholarship ${payload.scholarshipName}`, id);

    closeScholModal();
    toast("Scholarship scheme saved successfully. Awaiting Admin activation.");
}

function renderScholarships() {
    const container = document.getElementById("scholarships-table-body");
    if (!container) return;

    let rows = Object.values(state.scholarships);
    rows = rows.filter((s) => {
        const haystack = [s.scholarshipName, s.provider, s.category, s.description].join(" ").toLowerCase();
        const matchesSearch = haystack.includes(state.scholSearch);
        const matchesStatus = state.scholStatus === "all" || normalize(s.status || "pending") === state.scholStatus;
        return matchesSearch && matchesStatus;
    });

    if (!rows.length) {
        container.innerHTML = `<tr><td colspan="6" class="text-center muted">No scholarships have been added yet.</td></tr>`;
        return;
    }

    container.innerHTML = rows.map((s) => {
        return `
            <tr>
                <td><strong>${esc(s.scholarshipName)}</strong><br><span class="muted">${esc(s.provider)}</span></td>
                <td><span class="badge badge-cyan">${esc(s.supportType)}</span></td>
                <td><strong>${esc(s.amount)}</strong></td>
                <td>${esc(s.deadline || "-")}</td>
                <td>${getStatusBadge(s.status)}</td>
                <td>${getTableActions("schol", s.scholarshipId, s.status)}</td>
            </tr>
        `;
    }).join("");

    container.querySelectorAll("[data-edit-schol]").forEach((btn) => btn.addEventListener("click", () => openScholModal(btn.dataset.editSchol)));
    container.querySelectorAll("[data-delete-schol]").forEach((btn) => btn.addEventListener("click", () => deleteScholarship(btn.dataset.deleteSchol)));
    container.querySelectorAll("[data-view-schol]").forEach((btn) => btn.addEventListener("click", () => viewScholarshipDetails(btn.dataset.viewSchol)));
    container.querySelectorAll("[data-view-reason-schol]").forEach((btn) => btn.addEventListener("click", () => viewRejectionReason("scholarship", btn.dataset.viewReasonSchol)));
}

async function deleteScholarship(id) {
    const s = state.scholarships[id];
    if (!s || !confirm(`Remove scholarship "${s.scholarshipName}"?`)) return;
    await remove(ref(database, `scholarships/${id}`));
    await logActivity("scholarship_deleted", `Deleted scholarship ${s.scholarshipName}`, id);
    toast("Scholarship removed.");
}


// ----------------- EVENTS -----------------
function openEventModal(eventId = "") {
    const modal = document.getElementById("event-modal");
    if (!modal) return;
    modal.classList.remove("hidden");

    const form = document.getElementById("event-form");
    form.reset();
    setValue("editing-event-id", "");
    text("event-modal-title", "Schedule Educational Event");

    if (eventId) {
        const e = state.events[eventId];
        if (!e) return;
        text("event-modal-title", "Edit Scheduled Event");
        setValue("editing-event-id", eventId);
        setValue("event-title", e.title || "");
        setValue("event-type", e.type || "");
        setValue("event-date", e.date || "");
        setValue("event-time", e.time || "");
        setValue("event-location", e.location || "");
        setValue("event-registration-link", e.registrationLink || "");
        setValue("event-image-url", e.imageURL || "");
        setValue("event-description", e.description || "");
    }
}

function closeEventModal() {
    document.getElementById("event-modal").classList.add("hidden");
}

async function saveEvent(event) {
    event.preventDefault();
    if (!state.uid) return toast("You must be logged in to schedule campus events.");

    const editingId = value("editing-event-id");
    const id = editingId || push(ref(database, "events")).key;

    const payload = {
        eventId: id,
        instituteUid: state.uid,
        instituteId: state.uid,
        instituteName: state.institute.instituteName || state.user.fullName || "Institute",
        title: value("event-title"),
        type: value("event-type"),
        date: value("event-date"),
        time: value("event-time"),
        location: value("event-location"),
        registrationLink: value("event-registration-link") || "",
        imageURL: normalizedImageValue("event-image-url") || "images/event-placeholder.png",
        description: value("event-description"),
        status: "active",
        updatedAt: serverTimestamp()
    };

    if (!editingId) payload.createdAt = serverTimestamp();

    await set(ref(database, `events/${id}`), payload);
    await logActivity(editingId ? "event_updated" : "event_created", `${editingId ? "Updated" : "Scheduled"} event: ${payload.title}`, id);

    closeEventModal();
    toast("Event scheduled and live for student calendars.");
}

function renderEvents() {
    const container = document.getElementById("events-table-body");
    if (!container) return;

    const items = Object.values(state.events);
    if (!items.length) {
        container.innerHTML = `<tr><td colspan="5" class="text-center muted">No events have been added yet.</td></tr>`;
        return;
    }

    container.innerHTML = items.map((e) => {
        return `
            <tr>
                <td><strong>${esc(e.title)}</strong><br><span class="muted">${esc(e.type)}</span></td>
                <td>${esc(e.date)} at ${esc(e.time)}</td>
                <td>${esc(e.location)}</td>
                <td>${getStatusBadge(e.status)}</td>
                <td>${getTableActions("event", e.eventId, e.status)}</td>
            </tr>
        `;
    }).join("");

    container.querySelectorAll("[data-edit-event]").forEach((btn) => btn.addEventListener("click", () => openEventModal(btn.dataset.editEvent)));
    container.querySelectorAll("[data-delete-event]").forEach((btn) => btn.addEventListener("click", () => deleteEvent(btn.dataset.deleteEvent)));
    container.querySelectorAll("[data-view-event]").forEach((btn) => btn.addEventListener("click", () => viewEventDetails(btn.dataset.viewEvent)));
    container.querySelectorAll("[data-view-reason-event]").forEach((btn) => btn.addEventListener("click", () => viewRejectionReason("event", btn.dataset.viewReasonEvent)));
}

async function deleteEvent(id) {
    const e = state.events[id];
    if (!e || !confirm(`Cancel scheduled event "${e.title}"?`)) return;
    await remove(ref(database, `events/${id}`));
    await logActivity("event_deleted", `Cancelled event ${e.title}`, id);
    toast("Event cancelled.");
}





// ----------------- CHAT WITH ADMIN -----------------
async function sendInstituteSupportMessage(event) {
    event.preventDefault();
    const subject = value("institute-support-subject") || "Institute Inquiry";
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

        if (!state.supportConversation.createdAt) {
            updates[`conversations/${conversationId}/createdAt`] = serverTimestamp();
        }

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
        event.target.reset();
        toast("Message sent to EduPath Lanka Admins.");
    } catch (error) {
        console.error(error);
        toast("Failed to send message: " + error.message);
    } finally {
        if (button) {
            button.disabled = false;
            button.innerHTML = original || '<i class="fas fa-paper-plane"></i> Send Ticket Message';
        }
    }
}

function renderInstituteSupportMessages() {
    const container = document.getElementById("institute-support-replies");
    if (!container) return;

    const messages = Object.values(state.supportConversation.messages || {}).sort((a, b) => getTimeValue(a.createdAt) - getTimeValue(b.createdAt));
    if (!messages.length) {
        container.innerHTML = '<div class="list-item text-center muted">No message history yet. Initiate a chat session.</div>';
        return;
    }

    container.innerHTML = messages.map((m) => {
        const isSelf = m.senderUid === state.uid;
        return `
            <div class="list-item" style="border-left: 4px solid ${isSelf ? 'var(--primary)' : 'var(--secondary)'}; background: ${isSelf ? 'var(--theme-surface)' : 'rgba(20, 184, 166, 0.02)'};">
                <div class="list-content">
                    <strong>${esc(m.subject || "EduPath Support")} <span class="badge ${isSelf ? "badge-primary" : "badge-cyan"}">${isSelf ? "Institute" : "Admin Support"}</span></strong>
                    <p>${esc(m.message)}</p>
                    <span class="muted" style="font-size:0.68rem;margin-top:4px;">${formatDateTime(m.createdAt)} - ${esc(m.status || "sent")}</span>
                </div>
            </div>
        `;
    }).join("");

    container.scrollTop = container.scrollHeight;
}

function renderMessageBadges() {
    const count = Number(state.supportConversation.unreadByUser || 0);
    const badge = document.getElementById("topbar-message-badge");
    if (badge) {
        if (count > 0) {
            badge.textContent = count;
            badge.classList.remove("hidden");
        } else {
            badge.classList.add("hidden");
        }
    }
}


// ----------------- NOTIFICATIONS CENTER -----------------
function renderNotificationsList() {
    const container = document.getElementById("notifications-detailed-list");
    if (!container) return;

    const items = Object.values(state.notifications).sort((a, b) => getTimeValue(b.createdAt) - getTimeValue(a.createdAt));

    // Sync sidebar notification badge
    const unread = items.filter((n) => !n.isRead && n.readByUser !== true).length;
    const badge = document.getElementById("sidebar-notification-count");
    if (badge) {
        if (unread > 0) {
            badge.textContent = unread;
            badge.classList.remove("hidden");
        } else {
            badge.classList.add("hidden");
        }
    }

    if (!items.length) {
        container.innerHTML = `<div class="list-item text-center muted">No notifications found in catalog.</div>`;
        return;
    }

    container.innerHTML = items.map((n) => `
        <div class="list-item" style="border-left: 3px solid ${n.isRead ? 'var(--theme-border)' : 'var(--primary)'}">
            <div class="list-content">
                <strong>${esc(n.title)} ${n.isRead ? "" : '<span class="badge badge-warning">New</span>'}</strong>
                <p class="muted">${esc(n.message || n.body || "")}</p>
                <span class="muted" style="font-size:0.68rem;margin-top:2px;">${formatDateTime(n.createdAt)}</span>
            </div>
            <div style="display:flex;gap:6px;">
                ${n.isRead ? "" : `<button class="btn btn-sm btn-light" data-read-notif="${escAttr(n.notificationId)}">Read</button>`}
                <button class="btn btn-sm btn-outline text-danger" data-delete-notif="${escAttr(n.notificationId)}"><i class="fas fa-trash"></i></button>
            </div>
        </div>
    `).join("");

    container.querySelectorAll("[data-read-notif]").forEach((btn) => {
        btn.addEventListener("click", () => updateNotificationReadState(btn.dataset.readNotif));
    });
    container.querySelectorAll("[data-delete-notif]").forEach((btn) => {
        btn.addEventListener("click", () => deleteNotification(btn.dataset.deleteNotif));
    });
}

async function updateNotificationReadState(id) {
    await update(ref(database, `notifications/${state.uid}/${id}`), { isRead: true });
}

async function deleteNotification(id) {
    await remove(ref(database, `notifications/${state.uid}/${id}`));
}

async function clearAllNotifications() {
    if (confirm("Dismiss all workspace alerts?")) {
        await remove(ref(database, `notifications/${state.uid}`));
    }
}


// ----------------- COURSE PERFORMANCE -----------------
function renderCoursePerformance(tab = "views") {
    const container = document.getElementById("perf-tab-views-content");
    if (!container) return;

    const courses = Object.values(state.courses);

    let rowsHtml = "";

    if (tab === "views") {
        // Most Viewed: sort by course views (using local Views stat, mock-trend if views key is missing)
        const sorted = [...courses].sort((a, b) => Number(b.profileViews || b.views || 0) - Number(a.profileViews || a.views || 0)).slice(0, 5);
        if (!sorted.length) {
            rowsHtml = `<div class="list-item text-center muted">No course view logs recorded.</div>`;
        } else {
            rowsHtml = sorted.map((c) => `
                <div class="list-item">
                    <div class="list-content">
                        <h4>${esc(c.courseTitle)}</h4>
                        <p class="muted">${esc(c.level)} · ${esc(c.category)}</p>
                    </div>
                    <div style="font-weight: 850; font-size:1.1rem; color:var(--primary);">${Number(c.profileViews || c.views || 0).toLocaleString()} <span style="font-size:0.75rem;font-weight:600;color:var(--theme-muted)">Views</span></div>
                </div>
            `).join("");
        }
    } else if (tab === "recent") {
        const sorted = [...courses].sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0)).slice(0, 5);
        if (!sorted.length) {
            rowsHtml = `<div class="list-item text-center muted">No courses published.</div>`;
        } else {
            rowsHtml = sorted.map((c) => {
                const status = normalize(c.status || "pending");
                return `
                    <div class="list-item">
                        <div class="list-content">
                            <h4>${esc(c.courseTitle)}</h4>
                            <p class="muted">${formatDate(c.createdAt)} · ${esc(c.level)}</p>
                        </div>
                        <span class="badge badge-${status}">${esc(c.status || "pending")}</span>
                    </div>
                `;
            }).join("");
        }
    }

    container.innerHTML = rowsHtml;
}

// ----------------- AUXILIARY LOGS & UTILS -----------------
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
function escapeAttr(value) { return escAttr(value); }

function formatDate(value) {
    if (!value) return "-";
    if (typeof value === "number") return new Date(value).toLocaleDateString();
    if (typeof value === "object" && value.seconds) return new Date(value.seconds * 1000).toLocaleDateString();
    return String(value);
}

function formatDateTime(value) {
    const time = getTimeValue(value);
    return time ? new Date(time).toLocaleString() : "Just now";
}

function getTimeValue(value) {
    if (!value) return 0;
    if (typeof value === "number") return value;
    if (typeof value === "object" && value.seconds) return value.seconds * 1000;
    const parsed = new Date(value).getTime();
    return Number.isNaN(parsed) ? 0 : parsed;
}

function supportConversationId(uid) { return `admin_${uid}`; }

function toast(message) {
    const el = document.getElementById("toast");
    if (!el) return;
    el.textContent = message;
    el.classList.add("show");
    setTimeout(() => el.classList.remove("show"), 3000);
}

function logActivity(actionType, description, relatedEntityId = state.uid) {
    const logRef = push(ref(database, "activityLogs"));
    return set(logRef, {
        logId: logRef.key,
        uid: state.uid,
        userName: state.institute.instituteName || state.user.fullName || "Institute",
        userRole: "institute",
        actionType,
        description,
        relatedEntityType: "course",
        relatedEntityId,
        createdAt: serverTimestamp()
    });
}

// ----------------- CUSTOM HELPERS FOR STATUS & DETAILS DRAWER -----------------
function getStatusBadge(status) {
    const s = normalize(status || "pending");
    if (s === "approved" || s === "active") {
        return `<span class="badge badge-success">Approved</span>`;
    } else if (s === "rejected") {
        return `<span class="badge badge-danger">Rejected</span>`;
    } else {
        return `<span class="badge badge-warning">Pending Approval</span>`;
    }
}

function getTableActions(type, id, status) {
    const s = normalize(status || "pending");
    if (s === "approved" || s === "active") {
        return `
            <div class="table-actions">
                <button class="btn btn-sm btn-light" data-view-${type}="${escAttr(id)}"><i class="fas fa-eye"></i> View</button>
                <button class="btn btn-sm btn-light" data-edit-${type}="${escAttr(id)}"><i class="fas fa-edit"></i> Edit</button>
            </div>
        `;
    } else if (s === "rejected") {
        return `
            <div class="table-actions">
                <button class="btn btn-sm btn-light" data-view-reason-${type}="${escAttr(id)}"><i class="fas fa-circle-exclamation text-danger"></i> View Reason</button>
                <button class="btn btn-sm btn-light" data-edit-${type}="${escAttr(id)}"><i class="fas fa-repeat"></i> Edit & Resubmit</button>
            </div>
        `;
    } else {
        return `
            <div class="table-actions">
                <button class="btn btn-sm btn-light" data-edit-${type}="${escAttr(id)}"><i class="fas fa-edit"></i> Edit</button>
                <button class="btn btn-sm btn-outline text-danger" data-delete-${type}="${escAttr(id)}"><i class="fas fa-trash"></i> Delete</button>
            </div>
        `;
    }
}

function viewCourseDetails(courseId) {
    const course = state.courses[courseId];
    if (!course) return;
    
    document.querySelector("#details-drawer .modal-header h3").textContent = "Course Details";
    const content = document.getElementById("details-drawer-content");
    const footer = document.getElementById("details-drawer-footer");
    
    content.innerHTML = `
        <div class="drawer-detail-section">
            <h4>Course Title / Degree Name</h4>
            <p>${esc(course.courseTitle || course.courseName || "-")}</p>
        </div>
        <div class="drawer-detail-section">
            <h4>Category (Field of Study)</h4>
            <p>${esc(course.category || "-")}</p>
        </div>
        <div class="drawer-detail-section">
            <h4>Qualification Level</h4>
            <p>${esc(course.level || course.qualificationLevel || "-")}</p>
        </div>
        <div class="drawer-detail-section">
            <h4>Duration</h4>
            <p>${esc(course.duration || "-")}</p>
        </div>
        <div class="drawer-detail-section">
            <h4>Course Fee (LKR)</h4>
            <p>${esc(course.fee || course.feeAmount || "-")}</p>
        </div>
        <div class="drawer-detail-section">
            <h4>Learning Mode</h4>
            <p><span class="badge badge-primary">${esc(course.type || course.mode || "-")}</span></p>
        </div>
        <div class="drawer-detail-section">
            <h4>Campus Location & District</h4>
            <p>${esc(course.location || "-")}, ${esc(course.district || "-")}</p>
        </div>
        <div class="drawer-detail-section">
            <h4>Intake Start Date</h4>
            <p>${esc(course.startDate || "-")}</p>
        </div>
        <div class="drawer-detail-section">
            <h4>Inquiry Contact Number</h4>
            <p>${esc(course.contactNumber || course.contactPhone || "-")}</p>
        </div>
        <div class="drawer-detail-section">
            <h4>Detailed Course Description</h4>
            <div class="message-block">${esc(course.description || "No description provided.")}</div>
        </div>
        <div class="drawer-detail-section">
            <h4>Minimum Entry Requirements</h4>
            <div class="message-block">${esc(course.entryRequirements || course.eligibility || "No requirements specified.")}</div>
        </div>
        <div class="drawer-detail-section">
            <h4>Status</h4>
            <p>${getStatusBadge(course.status)}</p>
        </div>
    `;
    
    footer.innerHTML = `
        <button class="btn btn-light" id="drawer-close-btn">Close</button>
        <button class="btn btn-primary" id="drawer-edit-btn">Edit Course</button>
    `;
    
    document.getElementById("details-drawer").classList.remove("hidden");
    
    document.getElementById("drawer-close-btn")?.addEventListener("click", () => {
        document.getElementById("details-drawer").classList.add("hidden");
    });
    document.getElementById("drawer-edit-btn")?.addEventListener("click", () => {
        document.getElementById("details-drawer").classList.add("hidden");
        editCourse(courseId);
    });
}

function viewScholarshipDetails(scholId) {
    const s = state.scholarships[scholId];
    if (!s) return;
    
    document.querySelector("#details-drawer .modal-header h3").textContent = "Scholarship Details";
    const content = document.getElementById("details-drawer-content");
    const footer = document.getElementById("details-drawer-footer");
    
    content.innerHTML = `
        <div class="drawer-detail-section">
            <h4>Scholarship Name</h4>
            <p>${esc(s.scholarshipName || s.name || "-")}</p>
        </div>
        <div class="drawer-detail-section">
            <h4>Provider (Authority)</h4>
            <p>${esc(s.provider || "-")} (${esc(s.providerType || "-")})</p>
        </div>
        <div class="drawer-detail-section">
            <h4>Category (Field)</h4>
            <p>${esc(s.category || "-")}</p>
        </div>
        <div class="drawer-detail-section">
            <h4>Funding Cover Type</h4>
            <p><span class="badge badge-cyan">${esc(s.supportType || "-")}</span></p>
        </div>
        <div class="drawer-detail-section">
            <h4>Scholarship Value / Amount</h4>
            <p>${esc(s.amount || "-")}</p>
        </div>
        <div class="drawer-detail-section">
            <h4>Application Deadline</h4>
            <p>${esc(s.deadline || "-")}</p>
        </div>
        <div class="drawer-detail-section">
            <h4>District Preference</h4>
            <p>${esc(s.district || "-")}</p>
        </div>
        <div class="drawer-detail-section">
            <h4>Minimum Qualification Level</h4>
            <p>${esc(s.qualificationLevel || "-")}</p>
        </div>
        <div class="drawer-detail-section">
            <h4>External Apply Link</h4>
            <p>${s.applyLink ? `<a href="${escAttr(s.applyLink)}" target="_blank">${esc(s.applyLink)}</a>` : "-"}</p>
        </div>
        <div class="drawer-detail-section">
            <h4>Contact Info</h4>
            <p>${esc(s.contactEmail || "-")} / ${esc(s.contactPhone || "-")}</p>
        </div>
        <div class="drawer-detail-section">
            <h4>Scholarship Description</h4>
            <div class="message-block">${esc(s.description || "No description provided.")}</div>
        </div>
        <div class="drawer-detail-section">
            <h4>Eligibility & Selection Criteria</h4>
            <div class="message-block">${esc(s.eligibility || "No eligibility criteria provided.")}</div>
        </div>
        <div class="drawer-detail-section">
            <h4>Status</h4>
            <p>${getStatusBadge(s.status)}</p>
        </div>
    `;
    
    footer.innerHTML = `
        <button class="btn btn-light" id="drawer-close-btn">Close</button>
        <button class="btn btn-primary" id="drawer-edit-btn">Edit Scholarship</button>
    `;
    
    document.getElementById("details-drawer").classList.remove("hidden");
    
    document.getElementById("drawer-close-btn")?.addEventListener("click", () => {
        document.getElementById("details-drawer").classList.add("hidden");
    });
    document.getElementById("drawer-edit-btn")?.addEventListener("click", () => {
        document.getElementById("details-drawer").classList.add("hidden");
        openScholModal(scholId);
    });
}

function viewEventDetails(eventId) {
    const e = state.events[eventId];
    if (!e) return;
    
    document.querySelector("#details-drawer .modal-header h3").textContent = "Event Details";
    const content = document.getElementById("details-drawer-content");
    const footer = document.getElementById("details-drawer-footer");
    
    content.innerHTML = `
        <div class="drawer-detail-section">
            <h4>Event Name / Title</h4>
            <p>${esc(e.title || "-")}</p>
        </div>
        <div class="drawer-detail-section">
            <h4>Event Category</h4>
            <p><span class="badge badge-cyan">${esc(e.type || "-")}</span></p>
        </div>
        <div class="drawer-detail-section">
            <h4>Date & Time</h4>
            <p>${esc(e.date || "-")} at ${esc(e.time || "-")}</p>
        </div>
        <div class="drawer-detail-section">
            <h4>Venue Location / Stream URL</h4>
            <p>${esc(e.location || "-")}</p>
        </div>
        <div class="drawer-detail-section">
            <h4>Registration URL Link</h4>
            <p>${e.registrationLink ? `<a href="${escAttr(e.registrationLink)}" target="_blank">${esc(e.registrationLink)}</a>` : "-"}</p>
        </div>
        <div class="drawer-detail-section">
            <h4>Event Overview & Key Outcomes</h4>
            <div class="message-block">${esc(e.description || "No overview provided.")}</div>
        </div>
        <div class="drawer-detail-section">
            <h4>Status</h4>
            <p>${getStatusBadge(e.status)}</p>
        </div>
    `;
    
    footer.innerHTML = `
        <button class="btn btn-light" id="drawer-close-btn">Close</button>
        <button class="btn btn-primary" id="drawer-edit-btn">Edit Event</button>
    `;
    
    document.getElementById("details-drawer").classList.remove("hidden");
    
    document.getElementById("drawer-close-btn")?.addEventListener("click", () => {
        document.getElementById("details-drawer").classList.add("hidden");
    });
    document.getElementById("drawer-edit-btn")?.addEventListener("click", () => {
        document.getElementById("details-drawer").classList.add("hidden");
        openEventModal(eventId);
    });
}

function viewRejectionReason(type, id) {
    const item = type === 'course' ? state.courses[id] : (type === 'scholarship' ? state.scholarships[id] : state.events[id]);
    if (!item) return;
    const reason = item.rejectionReason || item.adminReviewReason || item.reason || "No rejection reason provided by admin.";
    const displayType = type.charAt(0).toUpperCase() + type.slice(1);
    
    document.querySelector("#details-drawer .modal-header h3").textContent = displayType + " Rejection Reason";
    const content = document.getElementById("details-drawer-content");
    const footer = document.getElementById("details-drawer-footer");
    
    content.innerHTML = `
        <div class="drawer-detail-section">
            <h4>Item</h4>
            <p>${esc(item.courseTitle || item.scholarshipName || item.title)}</p>
        </div>
        <div class="drawer-detail-section">
            <h4>Rejection Reason</h4>
            <div class="message-block text-danger" style="background: rgba(220, 38, 38, 0.05); border-left: 4px solid var(--danger); padding: 1rem; border-radius: 4px;">
                <strong>Reason:</strong>
                <p style="margin-top: 0.5rem; color: #dc2626;">${esc(reason)}</p>
            </div>
        </div>
    `;
    
    footer.innerHTML = `
        <button class="btn btn-light" id="drawer-close-btn">Close</button>
        <button class="btn btn-primary" id="drawer-edit-btn">Edit & Resubmit</button>
    `;
    
    document.getElementById("details-drawer").classList.remove("hidden");
    
    document.getElementById("drawer-close-btn")?.addEventListener("click", () => {
        document.getElementById("details-drawer").classList.add("hidden");
    });
    
    document.getElementById("drawer-edit-btn")?.addEventListener("click", () => {
        document.getElementById("details-drawer").classList.add("hidden");
        if (type === 'course') {
            editCourse(id);
        } else if (type === 'scholarship') {
            openScholModal(id);
        } else if (type === 'event') {
            openEventModal(id);
        }
    });
}
