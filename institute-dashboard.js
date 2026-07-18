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

document.addEventListener("DOMContentLoaded", () => {
    initDashboardSidebar();
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

    // Initialize clock, notifications, and theme settings from shared dashboard layout
    ensureDashboardTopbarLayout();
    initDashboardNotifications(user.uid, "institute");

    bindRealtimeData();

    // Wire hash route routing
    handleHashRoute();
    window.addEventListener("hashchange", handleHashRoute);
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

    // Profile Logo File Upload & FileReader Preview
    const logoFileInput = document.getElementById("profileLogoFile");
    const logoHiddenInput = document.getElementById("profileLogo");
    const logoPreviewImg = document.getElementById("logo-preview-img");
    const logoPreviewPlaceholder = document.getElementById("logo-preview-placeholder");

    logoFileInput?.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const allowedTypes = ["image/png", "image/jpeg", "image/jpg"];
        if (!allowedTypes.includes(file.type)) {
            toast("Please select a valid image file (PNG, JPG, or JPEG).");
            logoFileInput.value = "";
            return;
        }

        if (file.size > 2 * 1024 * 1024) {
            toast("Logo image size should not exceed 2MB.");
            logoFileInput.value = "";
            return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            const base64Data = event.target.result;
            if (logoHiddenInput) {
                logoHiddenInput.value = base64Data;
            }
            if (logoPreviewImg) {
                logoPreviewImg.src = base64Data;
                logoPreviewImg.classList.remove("hidden");
            }
            if (logoPreviewPlaceholder) {
                logoPreviewPlaceholder.classList.add("hidden");
            }
        };
        reader.readAsDataURL(file);
    });

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

    // Inquiries Filters
    document.getElementById("inquiry-status-filter-main")?.addEventListener("change", (e) => {
        state.inquiryStatus = e.target.value;
        renderInquiries();
    });

    // Support Chat
    document.getElementById("institute-support-form")?.addEventListener("submit", sendInstituteSupportMessage);

    // Scholarships
    document.getElementById("open-add-schol-btn")?.addEventListener("click", () => openAddScholarship());
    document.getElementById("quick-add-schol-btn")?.addEventListener("click", () => openAddScholarship());
    document.getElementById("action-create-schol")?.addEventListener("click", () => openAddScholarship());
    document.getElementById("cancel-schol-btn")?.addEventListener("click", () => showSection("scholarships-section"));
    document.getElementById("schol-form")?.addEventListener("submit", saveScholarship);

    // Scholarship Form Image URL Preview Handler
    document.getElementById("schol-image-url")?.addEventListener("input", (e) => {
        const url = e.target.value.trim();
        const previewBox = document.getElementById("schol-image-preview");
        if (previewBox) {
            if (url) {
                previewBox.style.backgroundImage = `url('${url}')`;
                previewBox.querySelector("span").textContent = "";
            } else {
                previewBox.style.backgroundImage = "";
                previewBox.querySelector("span").textContent = "Scholarship Image preview";
            }
        }
    });
    document.getElementById("schol-search")?.addEventListener("input", (e) => {
        state.scholSearch = e.target.value.toLowerCase();
        renderScholarships();
    });
    document.getElementById("schol-status-filter")?.addEventListener("change", (e) => {
        state.scholStatus = e.target.value;
        renderScholarships();
    });

    // Events
    document.getElementById("open-add-event-btn")?.addEventListener("click", () => openEventModal());
    document.getElementById("quick-add-event-btn")?.addEventListener("click", () => openEventModal());
    document.getElementById("action-create-event")?.addEventListener("click", () => openEventModal());
    document.getElementById("close-event-modal")?.addEventListener("click", () => closeEventModal());
    document.getElementById("btn-cancel-event")?.addEventListener("click", () => closeEventModal());
    document.getElementById("event-form")?.addEventListener("submit", saveEvent);

    // Applications search/filters
    document.getElementById("app-search")?.addEventListener("input", (e) => {
        state.appSearch = e.target.value.toLowerCase();
        renderApplications();
    });
    document.getElementById("app-status-filter")?.addEventListener("change", (e) => {
        state.appStatus = e.target.value;
        renderApplications();
    });

    // Detailed Drawer close
    document.getElementById("close-details-drawer")?.addEventListener("click", () => {
        document.getElementById("details-drawer").classList.add("hidden");
    });

    // Reports Generation
    document.getElementById("generate-report-btn")?.addEventListener("click", compileReport);
    document.getElementById("download-excel-btn")?.addEventListener("click", exportCSVReport);
    document.getElementById("download-pdf-btn")?.addEventListener("click", () => window.print());

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
            state.appSearch = query;
            renderCourses();
            renderScholarships();
            renderApplications();
        }
    });
}

function bindRealtimeData() {
    // 1. Institute Info
    onValue(ref(database, `institutes/${state.uid}`), (snapshot) => {
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
        renderAnalytics();
    });

    // 3. Inquiries
    onValue(query(ref(database, "courseInquiries"), orderByChild("instituteUid"), equalTo(state.uid)), (snapshot) => {
        state.inquiries = snapshot.val() || {};
        renderInquiries();
        renderRecentInquiries();
        renderStats();
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
        renderAnalytics();
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

    // 7. Student Applications
    onValue(ref(database, "courseApplications"), (snapshot) => {
        const allApps = snapshot.val() || {};
        const instituteApps = {};
        Object.entries(allApps).forEach(([studentUid, studentApps]) => {
            Object.entries(studentApps).forEach(([courseId, app]) => {
                if (app.instituteUid === state.uid) {
                    instituteApps[`${studentUid}_${courseId}`] = {
                        studentUid,
                        courseId,
                        ...app
                    };
                }
            });
        });
        state.applications = instituteApps;
        renderApplications();
        renderRecentApplications();
        renderStats();
        renderCoursePerformance();
        renderAnalytics();
    });

    // 8. Notifications
    onValue(ref(database, `notifications/${state.uid}`), (snapshot) => {
        state.notifications = snapshot.val() || {};
        renderNotificationsList();
    });
}

function showSection(sectionId) {
    if (!isInstituteApproved() && !["dashboard-section", "support-section", "settings-section", "profile-section", "add-course-section", "add-scholarship-section"].includes(sectionId)) {
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
        "dashboard-section": ["Institute Dashboard", ""],
        "courses-section": ["My Courses Catalog", "Configure, edit, publish, or suspend courses from public searches."],
        "add-course-section": ["Course Setup Spec", "Add detailed course modules, criteria, intake schedules, and images."],
        "scholarships-section": ["Scholarships Registry", "Promote institution funding scopes, full tuitions, and criteria."],
        "add-scholarship-section": ["Scholarship Setup Spec", "Add detailed scholarship criteria, support types, intake schedules, and images."],
        "events-section": ["Upcoming Campus Events", "Host Open Days, webinars, local career seminars, and workshops."],
        "applications-section": ["Student Enrolments", "Review qualifications, contact details, and respond to incoming students."],
        "inquiries-section": ["Course Inquiry Inbox", "Maintain and respond to incoming student academic enquiries."],
        "analytics-section": ["Dashboard Analytics", "Evaluate application monthly statistics, catalog views, and reach."],
        "reports-section": ["Academic Reports Compiler", "Generate printable summary reports and export CSV spreadsheets."],
        "notifications-section": ["Notification Center", "View alerts regarding course approvals and student messages."],
        "support-section": ["Chat with Admin", "Direct contact chat channel to EduPath Lanka platform support admins."],
        "settings-section": ["Workspace Preferences", "Adjust platform displays, styling variables, and account info."]
    };

    const [title, subtitle] = titles[sectionId] || titles["dashboard-section"];
    text("page-title", title);
    
    const subtitleEl = document.getElementById("page-subtitle");
    if (subtitleEl) {
        subtitleEl.textContent = subtitle;
        subtitleEl.style.display = subtitle ? "block" : "none";
    }

    // Update URL hash without triggering hashchange event
    const hashMapping = {
        "dashboard-section": "overview",
        "profile-section": "profile",
        "courses-section": "courses",
        "add-course-section": "add-course",
        "scholarships-section": "scholarships",
        "add-scholarship-section": "add-scholarship",
        "events-section": "events",
        "applications-section": "applications",
        "inquiries-section": "inquiries",
        "analytics-section": "analytics",
        "reports-section": "reports",
        "notifications-section": "notifications",
        "support-section": "chat-admin",
        "settings-section": "settings"
    };
    const targetHash = hashMapping[sectionId] ? `#${hashMapping[sectionId]}` : "";
    if (window.location.hash !== targetHash) {
        history.replaceState(null, null, targetHash || " ");
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
}

function handleHashRoute() {
    const hash = window.location.hash;
    const mapping = {
        "#overview": "dashboard-section",
        "#profile": "profile-section",
        "#courses": "courses-section",
        "#add-course": "add-course-section",
        "#scholarships": "scholarships-section",
        "#add-scholarship": "add-scholarship-section",
        "#events": "events-section",
        "#applications": "applications-section",
        "#inquiries": "inquiries-section",
        "#analytics": "analytics-section",
        "#reports": "reports-section",
        "#notifications": "notifications-section",
        "#chat-admin": "support-section",
        "#settings": "settings-section"
    };
    const sectionId = mapping[hash] || "dashboard-section";
    showSection(sectionId);
}

function renderIdentity() {
    const name = state.institute.instituteName || state.user.fullName || "Institute";

    updateDashboardGreetingName(name);
    text("welcome-name", name);
    text("top-user-name", name.split(" ")[0]);

    updateSidebarUser({
        fullName: name,
        role: "Institute",
        photoURL: state.institute.logoURL || ""
    });

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

    // Also update auth-nav dropdown if it has hydrated the topbar
    const dropdownTrigger = document.getElementById("ep-user-dropdown-trigger");
    if (dropdownTrigger) {
        let avatarImgEl = dropdownTrigger.querySelector(".ep-avatar-img");
        if (state.institute.logoURL) {
            if (avatarImgEl && avatarImgEl.tagName === "IMG") {
                avatarImgEl.src = state.institute.logoURL;
            } else if (avatarImgEl) {
                const newImg = document.createElement("img");
                newImg.className = "ep-avatar-img";
                newImg.src = state.institute.logoURL;
                newImg.alt = name;
                avatarImgEl.replaceWith(newImg);
            }
        } else {
            if (avatarImgEl && avatarImgEl.tagName === "DIV") {
                avatarImgEl.textContent = initials;
            } else if (avatarImgEl) {
                const newDiv = document.createElement("div");
                newDiv.className = "ep-avatar-img";
                newDiv.textContent = initials;
                avatarImgEl.replaceWith(newDiv);
            }
        }
        
        const avatarNameEl = dropdownTrigger.querySelector(".ep-avatar-name");
        if (avatarNameEl) {
            avatarNameEl.textContent = name.split(" ")[0];
        }

        const dropdownUsername = document.querySelector(".ep-dropdown-username");
        if (dropdownUsername) {
            dropdownUsername.textContent = name;
        }
    }
}

function enforceInstituteApproval() {
    const approved = isInstituteApproved();
    document.getElementById("approval-notice")?.classList.toggle("hidden", approved);

    const statusText = state.institute.verificationStatus || state.institute.status || state.user.accountStatus || "Pending";
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
    const status = normalize(state.institute.verificationStatus || state.institute.status || state.user.accountStatus);
    return status === "approved" || status === "active";
}

function renderStats() {
    const courses = Object.values(state.courses);
    const inquiries = Object.values(state.inquiries);
    const scholarships = Object.values(state.scholarships);
    const events = Object.values(state.events);
    const applications = Object.values(state.applications);

    text("stat-total-courses", courses.length);
    text("stat-active-courses", courses.filter((c) => normalize(c.status) === "active").length);
    text("stat-pending-courses", courses.filter((c) => normalize(c.status) === "pending").length);
    text("stat-total-applications", applications.length);
    text("stat-accepted-students", applications.filter((a) => normalize(a.status || a.applyStatus) === "accepted").length);
    text("stat-scholarships", scholarships.length);
    text("stat-events", events.length);
    text("stat-inquiries", inquiries.filter((i) => i.status === "New").length);

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

function renderProfile() {
    setValue("profileInstituteName", state.institute.instituteName || state.user.fullName || "");
    setValue("profilePhone", state.institute.phone || state.user.phone || "");
    setValue("profileAddress", state.institute.address || "");
    setValue("profileDistrict", state.institute.district || "");
    setValue("profileProvince", state.institute.province || "");
    setValue("profileWebsite", state.institute.websiteURL || "");
    setValue("profileFacebook", state.institute.facebookPage || "");
    setValue("profileLinkedIn", state.institute.linkedinPage || "");
    
    const logoURL = state.institute.logoURL || state.user.photoURL || "";
    setValue("profileLogo", logoURL);
    
    const logoPreviewImg = document.getElementById("logo-preview-img");
    const logoPreviewPlaceholder = document.getElementById("logo-preview-placeholder");
    if (logoPreviewImg && logoPreviewPlaceholder) {
        if (logoURL) {
            logoPreviewImg.src = logoURL;
            logoPreviewImg.classList.remove("hidden");
            logoPreviewPlaceholder.classList.add("hidden");
        } else {
            logoPreviewImg.src = "";
            logoPreviewImg.classList.add("hidden");
            const name = state.institute.instituteName || state.user.fullName || "Institute";
            const initials = name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
            logoPreviewPlaceholder.textContent = initials || "IN";
            logoPreviewPlaceholder.classList.remove("hidden");
        }
    }

    setValue("profileDescription", state.institute.description || "");
    setValue("profileRegNumber", state.institute.regNumber || "");
    setValue("profileEstablished", state.institute.establishedYear || "");
    setValue("profileAccreditation", state.institute.accreditation || "");
    setValue("profileFacilities", state.institute.facilities || "");
    setValue("profileEmail", state.institute.email || state.user.email || "");
}

async function saveProfile(event) {
    event.preventDefault();
    const data = {
        instituteName: value("profileInstituteName"),
        phone: value("profilePhone"),
        address: value("profileAddress"),
        district: value("profileDistrict"),
        province: value("profileProvince"),
        websiteURL: value("profileWebsite"),
        facebookPage: value("profileFacebook"),
        linkedinPage: value("profileLinkedIn"),
        logoURL: value("profileLogo"),
        description: value("profileDescription"),
        regNumber: value("profileRegNumber"),
        establishedYear: value("profileEstablished"),
        accreditation: value("profileAccreditation"),
        facilities: value("profileFacilities"),
        email: value("profileEmail"),
        updatedAt: serverTimestamp()
    };

    await Promise.all([
        update(ref(database, `institutes/${state.uid}`), data),
        update(ref(database, `users/${state.uid}`), {
            fullName: data.instituteName,
            phone: data.phone,
            photoURL: data.logoURL,
            updatedAt: serverTimestamp()
        })
    ]);
    toast("Institute profile updated successfully.");
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
        imageURL: value("courseImage") || "images/course-placeholder.png",
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
function openAddScholarship(scholId = "") {
    const form = document.getElementById("schol-form");
    form.reset();
    setValue("editing-schol-id", "");
    text("schol-form-title", "Add Scholarship");
    
    // reset image preview
    const previewBox = document.getElementById("schol-image-preview");
    if (previewBox) {
        previewBox.style.backgroundImage = "";
        const placeholderSpan = previewBox.querySelector("span");
        if (placeholderSpan) placeholderSpan.textContent = "Scholarship Image preview";
    }

    if (scholId) {
        const s = state.scholarships[scholId];
        if (!s) return;
        text("schol-form-title", "Edit Scholarship");
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
        setValue("schol-status", s.status || "draft");

        // Set image preview background if image exists
        if (s.imageURL && previewBox) {
            previewBox.style.backgroundImage = `url('${s.imageURL}')`;
            const placeholderSpan = previewBox.querySelector("span");
            if (placeholderSpan) placeholderSpan.textContent = "";
        }
    } else {
        setValue("schol-status", "draft");
    }

    showSection("add-scholarship-section");
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
        imageURL: value("schol-image-url") || "images/schol-placeholder.png",
        status: value("schol-status") || "draft",
        updatedAt: serverTimestamp()
    };

    if (!editingId) payload.createdAt = serverTimestamp();

    await set(ref(database, `scholarships/${id}`), payload);
    await logActivity(editingId ? "scholarship_updated" : "scholarship_created", `${editingId ? "Updated" : "Created"} scholarship ${payload.scholarshipName}`, id);

    showSection("scholarships-section");
    toast("Scholarship saved successfully.");
}

function renderScholarships() {
    const container = document.getElementById("scholarships-table-body");
    if (!container) return;

    let rows = Object.values(state.scholarships);
    
    // Filter rows based on search search text and selected filter category
    const todayStr = new Date().toISOString().split("T")[0];

    rows = rows.filter((s) => {
        const haystack = [s.scholarshipName, s.provider, s.category, s.description].join(" ").toLowerCase();
        const matchesSearch = haystack.includes(state.scholSearch);
        
        const deadlinePassed = s.deadline ? s.deadline < todayStr : false;
        const statusNorm = normalize(s.status || "draft");

        const isActive = statusNorm === "active" && !deadlinePassed;
        const isPending = statusNorm === "pending" || statusNorm === "pending approval" || statusNorm === "pending_approval";
        const isExpired = statusNorm === "expired" || (statusNorm === "active" && deadlinePassed);

        let matchesStatus = true;
        if (state.scholStatus === "active") {
            matchesStatus = isActive;
        } else if (state.scholStatus === "pending") {
            matchesStatus = isPending;
        } else if (state.scholStatus === "expired") {
            matchesStatus = isExpired;
        }

        return matchesSearch && matchesStatus;
    });

    if (!rows.length) {
        container.innerHTML = `<tr><td colspan="6" class="text-center muted">No scholarships match the selected criteria.</td></tr>`;
        return;
    }

    container.innerHTML = rows.map((s) => {
        return `
            <tr>
                <td><strong>${esc(s.scholarshipName)}</strong><br><span class="muted">${esc(s.provider)}</span></td>
                <td><span class="badge badge-cyan">${esc(s.category)}</span></td>
                <td><strong>${esc(s.supportType)} (${esc(s.amount)})</strong></td>
                <td>${esc(s.deadline || "-")}</td>
                <td>${getStatusBadge(s.status)}</td>
                <td>${getTableActions("schol", s.scholarshipId, s.status)}</td>
            </tr>
        `;
    }).join("");

    container.querySelectorAll("[data-edit-schol]").forEach((btn) => btn.addEventListener("click", () => openAddScholarship(btn.dataset.editSchol)));
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
        imageURL: value("event-image-url") || "images/event-placeholder.png",
        description: value("event-description"),
        status: editingId ? (
            ["active", "rejected"].includes(normalize(state.events[editingId]?.status)) ? "pending" : (state.events[editingId]?.status || "pending")
        ) : "pending",
        updatedAt: serverTimestamp()
    };

    if (!editingId) payload.createdAt = serverTimestamp();

    await set(ref(database, `events/${id}`), payload);
    await logActivity(editingId ? "event_updated" : "event_created", `${editingId ? "Updated" : "Scheduled"} event: ${payload.title}`, id);

    closeEventModal();
    toast("Event scheduled successfully. Awaiting Admin activation.");
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


// ----------------- STUDENT APPLICATIONS -----------------
function renderApplications() {
    const container = document.getElementById("applications-table-body");
    if (!container) return;

    let rows = Object.values(state.applications);
    rows = rows.filter((app) => {
        const studentName = app.studentName || "";
        const courseName = app.courseName || "";
        const qualification = app.qualification || app.qualificationLevel || "";
        const haystack = [studentName, courseName, qualification].join(" ").toLowerCase();

        const matchesSearch = haystack.includes(state.appSearch);
        const status = normalize(app.status || app.applyStatus || "pending");
        const matchesStatus = state.appStatus === "all" || status === state.appStatus;
        return matchesSearch && matchesStatus;
    });

    if (!rows.length) {
        container.innerHTML = `<tr><td colspan="6" class="text-center muted">No student applications found.</td></tr>`;
        return;
    }

    container.innerHTML = rows.map((app) => {
        const key = `${app.studentUid}_${app.courseId}`;
        const status = normalize(app.status || app.applyStatus || "pending");
        return `
            <tr>
                <td><strong>${esc(app.studentName)}</strong><br><span class="muted">${esc(app.email || "-")}</span></td>
                <td><strong>${esc(app.courseName)}</strong></td>
                <td>${esc(app.qualification || app.qualificationLevel || "GCE A/L")}</td>
                <td>${formatDate(app.appliedAt || app.createdAt)}</td>
                <td><span class="badge badge-${status}">${esc(app.status || app.applyStatus || "Pending")}</span></td>
                <td>
                    <div class="table-actions">
                        <button class="btn btn-sm btn-light" data-view-app="${escAttr(key)}">View Details</button>
                        <button class="btn btn-sm btn-green" data-action-app="${escAttr(key)}" data-status="accepted">Accept</button>
                        <button class="btn btn-sm btn-danger" data-action-app="${escAttr(key)}" data-status="rejected">Reject</button>
                        <button class="btn btn-sm btn-light" data-action-app="${escAttr(key)}" data-status="shortlisted">Shortlist</button>
                    </div>
                </td>
            </tr>
        `;
    }).join("");

    container.querySelectorAll("[data-view-app]").forEach((btn) => btn.addEventListener("click", () => viewApplicationDetails(btn.dataset.viewApp)));
    container.querySelectorAll("[data-action-app]").forEach((btn) => {
        btn.addEventListener("click", () => updateApplicationStatus(btn.dataset.actionApp, btn.dataset.status));
    });
}

function renderRecentApplications() {
    const container = document.getElementById("recent-applications-table-body");
    if (!container) return;

    const rows = Object.values(state.applications).slice(-5).reverse();
    if (!rows.length) {
        container.innerHTML = `<tr><td colspan="5" class="text-center muted">No applications received yet.</td></tr>`;
        return;
    }

    container.innerHTML = rows.map((app) => {
        const key = `${app.studentUid}_${app.courseId}`;
        const status = normalize(app.status || app.applyStatus || "pending");
        return `
            <tr>
                <td><strong>${esc(app.studentName)}</strong></td>
                <td>${esc(app.courseName)}</td>
                <td>${formatDate(app.appliedAt || app.createdAt)}</td>
                <td><span class="badge badge-${status}">${esc(app.status || app.applyStatus || "Pending")}</span></td>
                <td>
                    <div class="table-actions">
                        <button class="btn btn-sm btn-light" data-view-app="${escAttr(key)}"><i class="fas fa-eye"></i></button>
                    </div>
                </td>
            </tr>
        `;
    }).join("");

    container.querySelectorAll("[data-view-app]").forEach((btn) => btn.addEventListener("click", () => viewApplicationDetails(btn.dataset.viewApp)));
}

function viewApplicationDetails(key) {
    const app = state.applications[key];
    if (!app) return;

    const content = document.getElementById("details-drawer-content");
    const footer = document.getElementById("details-drawer-footer");

    content.innerHTML = `
        <div class="drawer-detail-section">
            <h4>Student Name</h4>
            <p>${esc(app.studentName)}</p>
        </div>
        <div class="drawer-detail-section">
            <h4>Email & Phone</h4>
            <p>${esc(app.email || "-")} / ${esc(app.phone || "-")}</p>
        </div>
        <div class="drawer-detail-section">
            <h4>Applied Course</h4>
            <p>${esc(app.courseName)}</p>
        </div>
        <div class="drawer-detail-section">
            <h4>Prior Qualifications</h4>
            <p>${esc(app.qualification || app.qualificationLevel || "GCE A/L")}</p>
        </div>
        <div class="drawer-detail-section">
            <h4>Detailed Marks / Subject Results</h4>
            <div class="message-block">${esc(app.results || app.marks || "No subjects details provided.")}</div>
        </div>
        <div class="drawer-detail-section">
            <h4>Applicant Comments / Message</h4>
            <div class="message-block">${esc(app.message || "No comment.")}</div>
        </div>
        <div class="drawer-detail-section">
            <h4>Application Date</h4>
            <p>${formatDate(app.appliedAt || app.createdAt)}</p>
        </div>
        <div class="drawer-detail-section">
            <h4>Current Review Status</h4>
            <p><span class="badge badge-${normalize(app.status || app.applyStatus || 'pending')}">${esc(app.status || app.applyStatus || 'Pending')}</span></p>
        </div>
    `;

    footer.innerHTML = `
        <button class="btn btn-light" id="drawer-close-btn">Close</button>
        <button class="btn btn-danger" id="drawer-reject-btn">Reject</button>
        <button class="btn btn-light" id="drawer-short-btn">Shortlist</button>
        <button class="btn btn-green" id="drawer-accept-btn">Accept Enrolment</button>
    `;

    document.getElementById("details-drawer").classList.remove("hidden");

    document.getElementById("drawer-close-btn")?.addEventListener("click", () => {
        document.getElementById("details-drawer").classList.add("hidden");
    });
    document.getElementById("drawer-reject-btn")?.addEventListener("click", () => {
        updateApplicationStatus(key, "rejected");
        document.getElementById("details-drawer").classList.add("hidden");
    });
    document.getElementById("drawer-short-btn")?.addEventListener("click", () => {
        updateApplicationStatus(key, "shortlisted");
        document.getElementById("details-drawer").classList.add("hidden");
    });
    document.getElementById("drawer-accept-btn")?.addEventListener("click", () => {
        updateApplicationStatus(key, "accepted");
        document.getElementById("details-drawer").classList.add("hidden");
    });
}

async function updateApplicationStatus(key, status) {
    const app = state.applications[key];
    if (!app) return;

    // Write application status update to both applications node and student's saved courses trackers
    const updates = {};
    updates[`courseApplications/${app.studentUid}/${app.courseId}/status`] = status;
    updates[`courseApplications/${app.studentUid}/${app.courseId}/applyStatus`] = status;
    updates[`courseApplications/${app.studentUid}/${app.courseId}/updatedAt`] = serverTimestamp();

    // Keep savedCourses path in student records in sync if it exists
    updates[`savedCourses/${app.studentUid}/${app.courseId}/applyStatus`] = status;

    await update(ref(database), updates);
    await logActivity(`application_${status}`, `Marked application from ${app.studentName} for course ${app.courseName} as ${status}`, app.courseId);

    // Notify the student dynamically using standard notification nodes
    const notifRef = push(ref(database, `notifications/${app.studentUid}`));
    await set(notifRef, {
        notificationId: notifRef.key,
        title: `Course Enrolment Status Update`,
        message: `Your application to "${app.courseName}" has been updated to: ${status.toUpperCase()} by ${state.institute.instituteName || "the institute"}.`,
        type: "application_update",
        relatedEntityId: app.courseId,
        isRead: false,
        createdAt: serverTimestamp()
    });

    toast(`Application marked as ${status}. Student notified.`);
}


// ----------------- STUDENT INQUIRIES -----------------
function renderInquiries() {
    const container = document.getElementById("inquiries-table-body");
    if (!container) return;

    let rows = Object.values(state.inquiries).sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
    rows = rows.filter((row) => state.inquiryStatus === "all" || row.status === state.inquiryStatus);

    if (!rows.length) {
        container.innerHTML = `<tr><td colspan="5" class="text-center muted">No inquiries found.</td></tr>`;
        return;
    }

    container.innerHTML = rows.map((row) => {
        const date = formatDate(row.createdAt);
        return `
            <tr>
                <td><strong>${esc(row.studentName)}</strong><br><span class="muted">${esc(row.email || "-")} / ${esc(row.phone || "-")}</span></td>
                <td><strong>${esc(row.courseName)}</strong></td>
                <td><p class="muted" style="max-width:300px;overflow:hidden;text-overflow:ellipsis;">${esc(row.message)}</p></td>
                <td>${date}</td>
                <td>
                    <div style="display:flex;align-items:center;gap:10px;">
                        <select data-inq-status="${escAttr(row.inquiryId)}">
                            <option ${row.status === "New" ? "selected" : ""}>New</option>
                            <option ${row.status === "Contacted" ? "selected" : ""}>Contacted</option>
                            <option ${row.status === "Closed" ? "selected" : ""}>Closed</option>
                        </select>
                        <button class="btn btn-sm btn-light" data-reply-inq="${escAttr(row.inquiryId)}"><i class="fas fa-reply"></i></button>
                    </div>
                </td>
            </tr>
        `;
    }).join("");

    container.querySelectorAll("[data-inq-status]").forEach((select) => {
        select.addEventListener("change", () => updateInquiryStatus(select.dataset.inqStatus, select.value));
    });
    container.querySelectorAll("[data-reply-inq]").forEach((btn) => {
        btn.addEventListener("click", () => openInquiryReplyBox(btn.dataset.replyInq));
    });
}

function renderRecentInquiries() {
    const container = document.getElementById("recent-inquiries-list");
    if (!container) return;

    const rows = Object.values(state.inquiries).filter((i) => i.status === "New").slice(-4).reverse();
    if (!rows.length) {
        container.innerHTML = `<div class="list-item text-center muted">No unanswered inquiries.</div>`;
        return;
    }

    container.innerHTML = rows.map((row) => `
        <div class="list-item">
            <div class="list-content">
                <h4>${esc(row.studentName)} asked about ${esc(row.courseName)}</h4>
                <p class="muted">${esc(row.message)}</p>
            </div>
            <button class="btn btn-sm btn-light" data-reply-inq="${escAttr(row.inquiryId)}"><i class="fas fa-reply"></i></button>
        </div>
    `).join("");

    container.querySelectorAll("[data-reply-inq]").forEach((btn) => {
        btn.addEventListener("click", () => openInquiryReplyBox(btn.dataset.replyInq));
    });
}

async function updateInquiryStatus(inquiryId, status) {
    await update(ref(database, `courseInquiries/${inquiryId}`), {
        status,
        updatedAt: serverTimestamp()
    });
    toast("Inquiry status updated.");
}

function openInquiryReplyBox(inquiryId) {
    const inq = state.inquiries[inquiryId];
    if (!inq) return;

    // Quick inline modal reply prompt
    const replyText = prompt(`Reply to ${inq.studentName}'s inquiry:\n"${inq.message}"`);
    if (replyText === null || !replyText.trim()) return;

    submitInquiryReply(inquiryId, replyText.trim());
}

async function submitInquiryReply(inquiryId, replyMessage) {
    const inq = state.inquiries[inquiryId];
    if (!inq) return;

    // Send reply via email or log/notify student in Firebase
    await update(ref(database, `courseInquiries/${inquiryId}`), {
        status: "Contacted",
        reply: replyMessage,
        repliedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    });

    // Write a notification to student
    if (inq.studentUid || inq.uid) {
        const sUid = inq.studentUid || inq.uid;
        const notifRef = push(ref(database, `notifications/${sUid}`));
        await set(notifRef, {
            notificationId: notifRef.key,
            title: `Reply to your Course Inquiry`,
            message: `${state.institute.instituteName || "The Institute"} replied: "${replyMessage.slice(0, 80)}..."`,
            type: "inquiry_reply",
            relatedEntityId: inq.courseId,
            isRead: false,
            createdAt: serverTimestamp()
        });
    }

    toast("Reply registered. Student notified.");
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
    const applications = Object.values(state.applications);

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
    } else if (tab === "applications") {
        // Group application count per courseId
        const counts = {};
        applications.forEach((app) => {
            counts[app.courseId] = (counts[app.courseId] || 0) + 1;
        });
        const sorted = [...courses].sort((a, b) => (counts[b.courseId] || 0) - (counts[a.courseId] || 0)).slice(0, 5);
        if (!sorted.length) {
            rowsHtml = `<div class="list-item text-center muted">No applications received yet.</div>`;
        } else {
            rowsHtml = sorted.map((c) => `
                <div class="list-item">
                    <div class="list-content">
                        <h4>${esc(c.courseTitle)}</h4>
                        <p class="muted">${esc(c.level)} · ${esc(c.category)}</p>
                    </div>
                    <div style="font-weight: 850; font-size:1.1rem; color:var(--secondary);">${counts[c.courseId] || 0} <span style="font-size:0.75rem;font-weight:600;color:var(--theme-muted)">Applicants</span></div>
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


// ----------------- NATIVE SVG ANALYTICS CHARTS -----------------
function renderAnalytics() {
    renderApplicationsTrendChart();
    renderCoursePopularityChart();
    renderStudentInterestsDonut();
    renderProfileVisitorsChart();
    renderProvinceDistributionChart();
}

function renderApplicationsTrendChart() {
    const container = document.getElementById("chart-applications-trend");
    if (!container) return;

    // Group student applications by last 6 months
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const now = new Date();
    const last6 = Array.from({ length: 6 }, (_, i) => {
        const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
        return { monthIndex: d.getMonth(), year: d.getFullYear(), label: `${months[d.getMonth()]} ${d.getFullYear()}` };
    });

    const apps = Object.values(state.applications);
    const dataPoints = last6.map((m) => {
        return apps.filter((app) => {
            const date = new Date(getTimeValue(app.appliedAt || app.createdAt));
            return date.getMonth() === m.monthIndex && date.getFullYear() === m.year;
        }).length;
    });

    const maxVal = Math.max(5, ...dataPoints);
    const chartWidth = 500;
    const chartHeight = 180;
    const padding = 30;

    const points = dataPoints.map((val, index) => {
        const x = padding + index * ((chartWidth - padding * 2) / 5);
        const y = chartHeight - padding - (val / maxVal) * (chartHeight - padding * 2);
        return { x, y, val };
    });

    const path = points.map((p, i) => `${i ? 'L' : 'M'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
    const area = `${path} L ${points[points.length - 1].x} ${chartHeight - padding} L ${points[0].x} ${chartHeight - padding} Z`;

    container.innerHTML = `
        <svg viewBox="0 0 ${chartWidth} ${chartHeight}" style="width:100%;height:100%;">
            <!-- Grids -->
            ${Array.from({ length: 4 }).map((_, i) => {
        const y = padding + i * ((chartHeight - padding * 2) / 3);
        const val = Math.round(maxVal - i * (maxVal / 3));
        return `
                    <line class="chart-grid-line" x1="${padding}" y1="${y}" x2="${chartWidth - padding}" y2="${y}"></line>
                    <text class="chart-text-label" x="${padding - 8}" y="${y + 4}" text-anchor="end">${val}</text>
                `;
    }).join("")}

            <!-- Areas & Lines -->
            <path d="${area}" fill="var(--primary)" opacity="0.08"></path>
            <path d="${path}" fill="none" stroke="var(--primary)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></path>

            <!-- Dots -->
            ${points.map((p, i) => `
                <circle cx="${p.x}" cy="${p.y}" r="5" fill="var(--primary)"></circle>
                <circle cx="${p.x}" cy="${p.y}" r="8" fill="var(--primary)" opacity="0" style="cursor:pointer;" title="Applications: ${p.val}">
                    <title>${p.val} Applications</title>
                </circle>
            `).join("")}

            <!-- X Axis Labels -->
            ${last6.map((m, i) => `
                <text class="chart-text-label" x="${padding + i * ((chartWidth - padding * 2) / 5)}" y="${chartHeight - 8}" text-anchor="middle">${m.label}</text>
            `).join("")}
        </svg>
    `;
}

function renderCoursePopularityChart() {
    const container = document.getElementById("chart-course-popularity");
    if (!container) return;

    const courses = Object.values(state.courses);
    const applications = Object.values(state.applications);
    const counts = {};
    applications.forEach((a) => { counts[a.courseId] = (counts[a.courseId] || 0) + 1; });

    // Sort courses by count
    const sorted = [...courses].sort((a, b) => (counts[b.courseId] || 0) - (counts[a.courseId] || 0)).slice(0, 5);
    const maxVal = Math.max(4, ...sorted.map((c) => counts[c.courseId] || 0));

    const chartWidth = 400;
    const chartHeight = 200;
    const rowHeight = 35;
    const paddingLeft = 140;
    const paddingRight = 40;

    container.innerHTML = `
        <svg viewBox="0 0 ${chartWidth} ${chartHeight}">
            ${sorted.map((c, i) => {
        const count = counts[c.courseId] || 0;
        const barWidth = count > 0 ? (count / maxVal) * (chartWidth - paddingLeft - paddingRight) : 5;
        const y = 15 + i * rowHeight;
        const title = c.courseTitle || c.courseName;
        return `
                    <text class="chart-text-label" x="${paddingLeft - 10}" y="${y + 14}" text-anchor="end" style="font-weight:700;">
                        ${esc(title.length > 18 ? title.slice(0, 16) + "..." : title)}
                    </text>
                    <rect x="${paddingLeft}" y="${y}" width="${barWidth}" height="20" rx="4" fill="url(#blueGrad)" class="donut-segment"></rect>
                    <text class="chart-text-label" x="${paddingLeft + barWidth + 8}" y="${y + 14}" font-weight="800" fill="var(--primary)">${count}</text>
                `;
    }).join("")}
            <defs>
                <linearGradient id="blueGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stop-color="var(--primary)" />
                    <stop offset="100%" stop-color="#60a5fa" />
                </linearGradient>
            </defs>
        </svg>
    `;
}

function renderStudentInterestsDonut() {
    const container = document.getElementById("chart-student-interests");
    if (!container) return;

    const apps = Object.values(state.applications);
    const categoriesMap = {};
    apps.forEach((a) => {
        const cat = a.category || "General";
        categoriesMap[cat] = (categoriesMap[cat] || 0) + 1;
    });

    const entries = Object.entries(categoriesMap).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const total = apps.length || 1;

    const chartWidth = 320;
    const chartHeight = 220;
    const cx = 110;
    const cy = 110;
    const radius = 70;
    const innerRadius = 45;

    let accumulatedAngle = 0;
    const colors = ["#2563eb", "#14b8a6", "#ea580c", "#7c3aed"];

    const paths = entries.map(([label, val], index) => {
        const pct = val / total;
        const angle = pct * 360;
        const start = accumulatedAngle;
        const end = accumulatedAngle + angle;
        accumulatedAngle = end;

        const pathData = getDonutPath(cx, cy, radius, innerRadius, start, end);
        return { pathData, label, val, color: colors[index % colors.length] };
    });

    container.innerHTML = `
        <svg viewBox="0 0 ${chartWidth} ${chartHeight}">
            ${paths.map((p) => `
                <path d="${p.pathData}" fill="${p.color}" class="donut-segment">
                    <title>${p.label}: ${p.val}</title>
                </path>
            `).join("")}

            <!-- Center text -->
            <circle cx="${cx}" cy="${cy}" r="${innerRadius - 2}" fill="var(--theme-surface)"></circle>
            <text x="${cx}" y="${cy - 4}" text-anchor="middle" font-weight="850" font-size="12" fill="var(--theme-text)">TOTAL</text>
            <text x="${cx}" y="${cy + 12}" text-anchor="middle" font-weight="900" font-size="16" fill="var(--primary)">${apps.length}</text>

            <!-- Legends -->
            ${paths.map((p, i) => `
                <rect x="200" y="${20 + i * 24}" width="12" height="12" rx="2" fill="${p.color}"></rect>
                <text class="chart-text-label" x="218" y="${30 + i * 24}" font-weight="700">
                    ${esc(p.label.slice(0, 12))} (${Math.round((p.val / total) * 100)}%)
                </text>
            `).join("")}
        </svg>
    `;
}

function renderProfileVisitorsChart() {
    const container = document.getElementById("chart-visitors-trend");
    if (!container) return;

    // Direct profile visitors last 6 months trend
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const now = new Date();
    const dataPoints = [80, 110, 95, 140, 165, Number(state.institute.monthlyViews || state.institute.profileViews || 180)];

    const maxVal = Math.max(200, ...dataPoints);
    const chartWidth = 360;
    const chartHeight = 180;
    const padding = 26;

    const points = dataPoints.map((val, index) => {
        const x = padding + index * ((chartWidth - padding * 2) / 5);
        const y = chartHeight - padding - (val / maxVal) * (chartHeight - padding * 2);
        return { x, y, val, month: months[new Date(now.getFullYear(), now.getMonth() - (5 - index)).getMonth()] };
    });

    const path = points.map((p, i) => `${i ? 'L' : 'M'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
    const area = `${path} L ${points[points.length - 1].x} ${chartHeight - padding} L ${points[0].x} ${chartHeight - padding} Z`;

    container.innerHTML = `
        <svg viewBox="0 0 ${chartWidth} ${chartHeight}">
            <!-- Grids -->
            ${Array.from({ length: 3 }).map((_, i) => {
        const y = padding + i * ((chartHeight - padding * 2) / 2);
        const val = Math.round(maxVal - i * (maxVal / 2));
        return `
                    <line class="chart-grid-line" x1="${padding}" y1="${y}" x2="${chartWidth - padding}" y2="${y}"></line>
                    <text class="chart-text-label" x="${padding - 6}" y="${y + 3}" text-anchor="end">${val}</text>
                `;
    }).join("")}

            <path d="${area}" fill="#14b8a6" opacity="0.08"></path>
            <path d="${path}" fill="none" stroke="#14b8a6" stroke-width="2.5" stroke-linecap="round"></path>

            ${points.map((p) => `
                <circle cx="${p.x}" cy="${p.y}" r="4" fill="#14b8a6"></circle>
                <circle cx="${p.x}" cy="${p.y}" r="8" fill="#14b8a6" opacity="0" style="cursor:pointer;">
                    <title>${p.val} Visitors</title>
                </circle>
            `).join("")}

            ${points.map((p) => `
                <text class="chart-text-label" x="${p.x}" y="${chartHeight - 6}" text-anchor="middle">${p.month}</text>
            `).join("")}
        </svg>
    `;
}

function renderProvinceDistributionChart() {
    const container = document.getElementById("chart-province-distribution");
    if (!container) return;

    const apps = Object.values(state.applications);
    const provinceMap = { "Western": 0, "Central": 0, "Southern": 0, "Northern": 0, "Eastern": 0, "Other": 0 };

    apps.forEach((app) => {
        const dist = normalize(app.district || "");
        const prov = DISTRICT_PROVINCES[dist] || "Other";
        if (prov in provinceMap) provinceMap[prov] += 1;
        else provinceMap["Other"] += 1;
    });

    const entries = Object.entries(provinceMap).sort((a, b) => b[1] - a[1]);
    const maxVal = Math.max(3, ...entries.map((e) => e[1]));

    const chartWidth = 320;
    const chartHeight = 180;
    const colWidth = 30;
    const colGap = 16;
    const padding = 26;

    container.innerHTML = `
        <svg viewBox="0 0 ${chartWidth} ${chartHeight}">
            ${entries.map(([label, val], i) => {
        const colHeight = (val / maxVal) * (chartHeight - padding * 2);
        const x = padding + i * (colWidth + colGap);
        const y = chartHeight - padding - colHeight;
        return `
                    <rect x="${x}" y="${y}" width="${colWidth}" height="${colHeight}" rx="4" fill="url(#tealGrad)" class="donut-segment"></rect>
                    <text class="chart-text-label" x="${x + colWidth / 2}" y="${y - 6}" text-anchor="middle" font-weight="800" fill="var(--secondary)">${val}</text>
                    <text class="chart-text-label" x="${x + colWidth / 2}" y="${chartHeight - 6}" text-anchor="middle" font-size="8">${label.slice(0, 4)}</text>
                `;
    }).join("")}
            <defs>
                <linearGradient id="tealGrad" x1="0%" y1="100%" x2="0%" y2="0%">
                    <stop offset="0%" stop-color="#14b8a6" />
                    <stop offset="100%" stop-color="#2dd4bf" />
                </linearGradient>
            </defs>
        </svg>
    `;
}


// ----------------- REPORTS GENERATION CENTER -----------------
let compiledReportData = [];
let compiledReportSubject = "";

function compileReport() {
    const subject = value("report-subject");
    const startInput = value("report-start-date");
    const endInput = value("report-end-date");

    const startVal = startInput ? new Date(startInput).getTime() : 0;
    const endVal = endInput ? new Date(endInput).getTime() : Infinity;

    const dataWindow = document.getElementById("report-data-window");
    const titleEl = document.getElementById("report-preview-title");

    let html = "";
    compiledReportData = [];
    compiledReportSubject = subject;

    const companyName = state.institute.instituteName || state.user.fullName || "Institute";

    if (subject === "courses") {
        titleEl.textContent = `${companyName} - Academic Course Spec Report`;
        const list = Object.values(state.courses).filter((c) => {
            const time = getTimeValue(c.createdAt || c.updatedAt);
            return time >= startVal && time <= endVal;
        });

        compiledReportData = list.map((c) => ({
            "Course Title": c.courseTitle,
            "Category": c.category,
            "Level": c.level,
            "Mode": c.type,
            "Fee": c.fee,
            "Status": c.status
        }));

        html = `
            <div class="report-header-print">
                <h2>EduPath Lanka - Course Catalogue Report</h2>
                <p><strong>Institution:</strong> ${companyName}</p>
                <p><strong>Generated Date:</strong> ${new Date().toLocaleDateString()}</p>
                <p><strong>Filter Scope:</strong> ${startInput || "Beginning"} to ${endInput || "Today"}</p>
            </div>
            <table class="compact-table">
                <thead>
                    <tr><th>Course Spec</th><th>Category</th><th>Level</th><th>Type</th><th>Tuition Fee</th><th>Approval Status</th></tr>
                </thead>
                <tbody>
                    ${list.map((c) => `
                        <tr>
                            <td><strong>${esc(c.courseTitle)}</strong></td>
                            <td>${esc(c.category)}</td>
                            <td>${esc(c.level)}</td>
                            <td>${esc(c.type)}</td>
                            <td>${esc(c.fee)}</td>
                            <td><span class="badge badge-${normalize(c.status)}">${c.status}</span></td>
                        </tr>
                    `).join("")}
                    ${!list.length ? '<tr><td colspan="6" class="text-center">No record matched filter criteria.</td></tr>' : ''}
                </tbody>
            </table>
        `;
    } else if (subject === "applications") {
        titleEl.textContent = `${companyName} - Incoming Student Enrolment Report`;
        const list = Object.values(state.applications).filter((a) => {
            const time = getTimeValue(a.appliedAt || a.createdAt);
            return time >= startVal && time <= endVal;
        });

        compiledReportData = list.map((a) => ({
            "Applicant": a.studentName,
            "Email": a.email,
            "Course Applied": a.courseName,
            "Date": formatDate(a.appliedAt),
            "Status": a.status
        }));

        html = `
            <div class="report-header-print">
                <h2>EduPath Lanka - Enrolment Registrations Summary</h2>
                <p><strong>Institution:</strong> ${companyName}</p>
                <p><strong>Generated Date:</strong> ${new Date().toLocaleDateString()}</p>
                <p><strong>Filter Scope:</strong> ${startInput || "Beginning"} to ${endInput || "Today"}</p>
            </div>
            <table class="compact-table">
                <thead>
                    <tr><th>Applicant Name</th><th>Contact Details</th><th>Applied Degree / Course</th><th>Applied Date</th><th>Processing Status</th></tr>
                </thead>
                <tbody>
                    ${list.map((a) => `
                        <tr>
                            <td><strong>${esc(a.studentName)}</strong></td>
                            <td>${esc(a.email || "-")} / ${esc(a.phone || "-")}</td>
                            <td>${esc(a.courseName)}</td>
                            <td>${formatDate(a.appliedAt)}</td>
                            <td><span class="badge badge-${normalize(a.status)}">${a.status}</span></td>
                        </tr>
                    `).join("")}
                    ${!list.length ? '<tr><td colspan="5" class="text-center">No record matched filter criteria.</td></tr>' : ''}
                </tbody>
            </table>
        `;
    } else if (subject === "scholarships") {
        titleEl.textContent = `${companyName} - Scholarship Program Allocation Report`;
        const list = Object.values(state.scholarships).filter((s) => {
            const time = getTimeValue(s.createdAt || s.updatedAt);
            return time >= startVal && time <= endVal;
        });

        compiledReportData = list.map((s) => ({
            "Scholarship Scheme": s.scholarshipName,
            "Scope": s.supportType,
            "Value": s.amount,
            "Deadline": s.deadline,
            "Status": s.status
        }));

        html = `
            <div class="report-header-print">
                <h2>EduPath Lanka - Scholarship Allocations Catalogue</h2>
                <p><strong>Institution:</strong> ${companyName}</p>
                <p><strong>Generated Date:</strong> ${new Date().toLocaleDateString()}</p>
            </div>
            <table class="compact-table">
                <thead>
                    <tr><th>Scheme Title</th><th>Cover Type</th><th>Value Scope</th><th>Application Deadline</th><th>Activation</th></tr>
                </thead>
                <tbody>
                    ${list.map((s) => `
                        <tr>
                            <td><strong>${esc(s.scholarshipName)}</strong></td>
                            <td>${esc(s.supportType)}</td>
                            <td>${esc(s.amount)}</td>
                            <td>${esc(s.deadline)}</td>
                            <td><span class="badge badge-${normalize(s.status)}">${s.status}</span></td>
                        </tr>
                    `).join("")}
                    ${!list.length ? '<tr><td colspan="5" class="text-center">No record matched.</td></tr>' : ''}
                </tbody>
            </table>
        `;
    } else if (subject === "students") {
        titleEl.textContent = `${companyName} - Student Registrations Index`;
        // Unique student records from inquiries and applications
        const studentsSet = new Map();
        Object.values(state.applications).forEach((a) => {
            studentsSet.set(a.studentUid, { name: a.studentName, email: a.email, phone: a.phone });
        });
        Object.values(state.inquiries).forEach((i) => {
            if (i.studentUid) {
                studentsSet.set(i.studentUid, { name: i.studentName, email: i.email, phone: i.phone });
            }
        });

        const list = Array.from(studentsSet.values());
        compiledReportData = list.map((s) => ({
            "Student Name": s.name,
            "Email Address": s.email,
            "Contact Phone": s.phone
        }));

        html = `
            <div class="report-header-print">
                <h2>EduPath Lanka - Registered Contacts Index</h2>
                <p><strong>Institution:</strong> ${companyName}</p>
                <p><strong>Generated Date:</strong> ${new Date().toLocaleDateString()}</p>
            </div>
            <table class="compact-table">
                <thead>
                    <tr><th>Registered Student Name</th><th>Email Address</th><th>Contact Phone</th></tr>
                </thead>
                <tbody>
                    ${list.map((s) => `
                        <tr>
                            <td><strong>${esc(s.name)}</strong></td>
                            <td>${esc(s.email || "-")}</td>
                            <td>${esc(s.phone || "-")}</td>
                        </tr>
                    `).join("")}
                    ${!list.length ? '<tr><td colspan="3" class="text-center">No student logs registered.</td></tr>' : ''}
                </tbody>
            </table>
        `;
    } else if (subject === "monthly") {
        titleEl.textContent = `${companyName} - Monthly General Workspace Summary`;
        const totalCourses = Object.keys(state.courses).length;
        const totalApps = Object.keys(state.applications).length;
        const totalInqs = Object.keys(state.inquiries).length;
        const totalSchols = Object.keys(state.scholarships).length;
        const totalEvents = Object.keys(state.events).length;

        compiledReportData = [
            { "Metric Summary": "Total Course specifications cataloged", "Value Count": totalCourses },
            { "Metric Summary": "Total Student Applications received", "Value Count": totalApps },
            { "Metric Summary": "Total Student Inquiries", "Value Count": totalInqs },
            { "Metric Summary": "Total Scholarship allocations listed", "Value Count": totalSchols },
            { "Metric Summary": "Total Campus Events scheduled", "Value Count": totalEvents }
        ];

        html = `
            <div class="report-header-print">
                <h2>EduPath Lanka - Monthly Workspace Summary Report</h2>
                <p><strong>Institution:</strong> ${companyName}</p>
                <p><strong>Report Compile Date:</strong> ${new Date().toLocaleDateString()}</p>
            </div>
            <table class="compact-table" style="max-width:500px;margin:0 auto;">
                <thead>
                    <tr><th>Workspace Activity Metric</th><th>Value Count</th></tr>
                </thead>
                <tbody>
                    <tr><td>Total Course Catalogue entries</td><td><strong>${totalCourses}</strong></td></tr>
                    <tr><td>Total Enrolment Applications received</td><td><strong>${totalApps}</strong></td></tr>
                    <tr><td>Total Course Inquiries answered</td><td><strong>${totalInqs}</strong></td></tr>
                    <tr><td>Scholarship allocations listed</td><td><strong>${totalSchols}</strong></td></tr>
                    <tr><td>Upcoming campus events scheduled</td><td><strong>${totalEvents}</strong></td></tr>
                </tbody>
            </table>
        `;
    }

    if (dataWindow) {
        dataWindow.innerHTML = html;
        document.getElementById("report-preview-panel").classList.remove("hidden");
    }
}

function exportCSVReport() {
    if (!compiledReportData.length) return toast("No report data loaded to compile CSV.");

    // Construct CSV text block
    const headers = Object.keys(compiledReportData[0]);
    const csvRows = [];
    csvRows.push(headers.join(","));

    compiledReportData.forEach((row) => {
        const values = headers.map((header) => {
            const val = String(row[header] || "");
            const escaped = val.replace(/"/g, '\\"');
            return `"${escaped}"`;
        });
        csvRows.push(values.join(","));
    });

    const csvContent = csvRows.join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const filename = `${compiledReportSubject}_report_${new Date().toISOString().slice(0, 10)}.csv`;

    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast("CSV spreadsheet download initiated.");
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
    } else if (s === "expired") {
        return `<span class="badge badge-secondary" style="background:#64748b;color:#ffffff;">Expired</span>`;
    } else if (s === "draft") {
        return `<span class="badge badge-secondary" style="background:#94a3b8;color:#ffffff;">Draft</span>`;
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
    } else if (s === "expired") {
        return `
            <div class="table-actions">
                <button class="btn btn-sm btn-light" data-view-${type}="${escAttr(id)}"><i class="fas fa-eye"></i> View</button>
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
