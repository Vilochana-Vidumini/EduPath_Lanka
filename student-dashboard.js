import { auth, database } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { ref, get, set, update, push, remove, serverTimestamp, onValue, off, query, orderByChild, equalTo } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
import { showToast, preserveThemeOnClear } from "./auth-nav.js?v=20260614-brand";
import { initDashboardSidebar, updateSidebarUser } from "./sidebar.js";
import { ensureDashboardTopbarLayout, initDashboardNotifications, updateDashboardGreetingName } from "./dashboard-topbar.js";

const state = {
    uid: null,
    user: {},
    student: {},
    pathwayResults: {},
    currentResult: null,
    currentResultId: null,
    courses: {},
    savedCourses: {},
    scholarships: {},
    savedScholarships: {},
    mentors: {},
    mentorRequests: {},
    connectedMentors: {},
    mentorConversations: {},
    mentorConversationRefs: {},
    activeMentorConversationId: null,
    courseEngagements: {},
    courseApplications: {},
    scholarshipApplications: {},
    mentorAppointments: {},
    activeBooking: null,
    skills: {},
    careerGuides: {},
    notifications: {},
    supportConversation: {}
};

const recommendationFilters = {
    courses: {
        search: "",
        category: "",
        district: "",
        mode: "",
        feeType: "",
        qualification: "",
        matchLevel: "",
        duration: "",
        sortBy: "best-match"
    },
    scholarships: {
        search: "",
        category: "",
        supportType: "",
        district: "",
        qualification: "",
        matchLevel: "",
        deadline: "",
        sortBy: "best-match"
    },
    mentors: {
        search: "",
        field: "",
        mentorType: "",
        language: "",
        mode: "",
        availability: "",
        matchLevel: "",
        sortBy: "best-match"
    }
};

let recommendationUpdateTimer = null;
let recommendationFilterTimer = null;

const sectionTitles = {
    "overview-section": "Student Dashboard",
    "pathway-section": "My Pathway Summary",
    "pathway-history-section": "Pathway History",
    "next-steps-section": "Next Step Plan",
    "recommended-courses-section": "Courses I Can Proceed",
    "saved-courses-section": "Saved Courses",
    "engaged-courses-section": "Courses I Engaged",
    "scholarships-section": "Scholarships I Can Apply",
    "saved-scholarships-section": "Saved Scholarships",
    "applied-scholarships-section": "Applied Scholarships",
    "mentors-section": "Mentors I Can Connect With",
    "mentor-requests-section": "My Mentor Requests",
    "connected-mentors-section": "Connected Mentors",
    "mentor-messages-section": "Mentor Messages",
    "mentor-sessions-section": "My Mentor Sessions",
    "skills-section": "Skill Development",
    "career-guide-section": "Career Guidance",
    "support-section": "EduPath Support",
    "notifications-section": "Notifications"
};

const dashboardActions = {
    "continue-plan": () => showDashboardSection("next-steps-section"),
    "explore-matches": () => showDashboardSection("recommended-courses-section"),
    "update-pathway": () => {
        window.location.href = "pathway.html?mode=update";
    },
    "explore-courses": () => showDashboardSection("recommended-courses-section"),
    "explore-scholarships": () => showDashboardSection("scholarships-section"),
    "explore-mentors": () => showDashboardSection("mentors-section"),
    "view-connected-mentors": () => showDashboardSection("connected-mentors-section"),
    "view-sessions": () => showDashboardSection("mentor-sessions-section"),
    "support": () => showDashboardSection("support-section")
};

function appointmentDebug(...args) {
    if (localStorage.getItem("debugAppointments") === "true") console.log(...args);
}

function sidebarSectionFor(sectionId) {
    const parentMap = {
        "pathway-history-section": "pathway-section",
        "saved-courses-section": "recommended-courses-section",
        "engaged-courses-section": "recommended-courses-section",
        "saved-scholarships-section": "scholarships-section",
        "applied-scholarships-section": "scholarships-section",
        "mentor-requests-section": "mentors-section",
        "connected-mentors-section": "mentors-section"
    };
    return parentMap[sectionId] || sectionId;
}

const profileFields = [
    ["fullName", "Full Name", "user"],
    ["email", "Email", "user"],
    ["phone", "Phone Number", "user"],
    ["photoURL", "Profile Picture", "user"],
    ["district", "District", "student"],
    ["educationLevel", "Education Level", "student"],
    ["examStream", "Exam Stream", "student"],
    ["resultStatus", "Result Status", "student"],
    ["interestArea", "Interest Area", "student"],
    ["futureGoal", "Future Goal", "student"],
    ["financialSupport", "Financial Support", "student"],
    ["learningMode", "Learning Mode", "student"],
    ["skills", "Skills", "student"]
];

document.addEventListener("DOMContentLoaded", () => {
    initDashboardSidebar();
    bindStaticActions();

    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            window.location.href = "login.html";
            return;
        }

        state.uid = user.uid;
        const userSnap = await get(ref(database, `users/${user.uid}`));
        const userData = userSnap.val() || {};
        if (!userSnap.exists() || normalize(userData.userType || userData.role) !== "student") {
            showToast("Access denied. Directing to login...", "error");
            window.location.href = "login.html";
            return;
        }

        ensureDashboardTopbarLayout();
        initDashboardNotifications(user.uid);
        setupRealtime(user.uid);
        showDashboardSection(getSectionFromHash());
    });
});

function bindStaticActions() {
    document.getElementById("logout-btn-sidebar")?.addEventListener("click", async (event) => {
        event.preventDefault();
        await recordStudentLogout();
        signOut(auth).then(() => {
            preserveThemeOnClear();
            sessionStorage.clear();
            window.location.href = "login.html";
        });
    });

    document.querySelectorAll("[data-section]").forEach((link) => {
        link.addEventListener("click", (event) => {
            event.preventDefault();
            const sectionId = link.dataset.section;
            window.location.hash = sectionId.replace("-section", "");
            showDashboardSection(sectionId);
        });
    });

    document.getElementById("support-form")?.addEventListener("submit", sendSupportMessage);
    document.getElementById("profile-details-toggle")?.addEventListener("click", () => {
        const panel = document.getElementById("profile-details-panel");
        const button = document.getElementById("profile-details-toggle");
        if (!panel || !button) return;
        const isHidden = panel.classList.toggle("hidden");
        button.textContent = isHidden ? "Expand Details" : "Hide Details";
    });
    bindDashboardActionDelegation();
    window.addEventListener("hashchange", () => showDashboardSection(getSectionFromHash()));
}

function bindDashboardActionDelegation() {
    if (document.body.dataset.studentDashboardDelegated === "true") return;
    document.body.dataset.studentDashboardDelegated = "true";
    document.addEventListener("click", async (event) => {
        const actionButton = event.target.closest("[data-dashboard-action]");
        if (actionButton) {
            const action = dashboardActions[actionButton.dataset.dashboardAction];
            if (action) {
                event.preventDefault();
                action(actionButton);
                return;
            }
        }

        const closeBookingButton = event.target.closest("[data-close-booking-modal]");
        if (closeBookingButton) {
            event.preventDefault();
            closeBookingModal();
            return;
        }

        const sessionScrollButton = event.target.closest("[data-session-scroll]");
        if (sessionScrollButton) {
            event.preventDefault();
            document.querySelectorAll("[data-session-scroll]").forEach((button) => button.classList.toggle("active", button === sessionScrollButton));
            document.getElementById(sessionScrollButton.dataset.sessionScroll)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
            return;
        }

        const sessionSummaryButton = event.target.closest("[data-view-session-summary]");
        if (sessionSummaryButton) {
            event.preventDefault();
            const appointment = state.mentorAppointments?.[sessionSummaryButton.dataset.viewSessionSummary];
            if (!appointment) return showToast("Session details are unavailable. Please refresh and try again.", "error");
            openRecommendationDetail("Session Summary", sessionSummaryHtml(appointment));
            return;
        }

        const jumpButton = event.target.closest(".dashboard-jump[data-section], [data-section].dashboard-jump");
        if (jumpButton) {
            event.preventDefault();
            showDashboardSection(jumpButton.dataset.section);
            return;
        }

        const bookingButton = event.target.closest("[data-book-session], [data-action='book-session'], [data-overview-book-session]");
        if (bookingButton) {
            event.preventDefault();
            const mentorUid = bookingButton.dataset.bookSession || bookingButton.dataset.mentorUid || bookingButton.dataset.overviewBookSession;
            await openBookingModalSafe(mentorUid, bookingButton);
            return;
        }

        const cancelButton = event.target.closest("[data-cancel-appointment]");
        if (cancelButton) {
            event.preventDefault();
            await cancelAppointmentSafe(cancelButton.dataset.cancelAppointment, cancelButton);
            return;
        }

        const messageButton = event.target.closest("[data-message-mentor]");
        if (messageButton) {
            event.preventDefault();
            const mentorUid = messageButton.dataset.messageMentor;
            if (!mentorUid) return showToast("Mentor information is missing. Please refresh and try again.", "error");
            if (!document.getElementById("session-booking-modal")?.classList.contains("hidden")) closeBookingModal();
            openMentorConversation(mentorUid);
            return;
        }

        const dateButton = event.target.closest("[data-booking-date]");
        if (dateButton) {
            event.preventDefault();
            if (dateButton.disabled || dateButton.classList.contains("disabled") || !state.activeBooking) return;
            state.activeBooking.selectedDate = dateButton.dataset.bookingDate;
            state.activeBooking.selectedSlot = null;
            renderBookingModal();
            return;
        }

        const slotButton = event.target.closest("[data-slot-start], [data-start]");
        if (slotButton) {
            event.preventDefault();
            if (slotButton.disabled || slotButton.classList.contains("disabled") || !state.activeBooking) return;
            state.activeBooking.selectedSlot = {
                startTime: slotButton.dataset.slotStart || slotButton.dataset.start,
                endTime: slotButton.dataset.slotEnd || slotButton.dataset.end
            };
            renderBookingModal();
        }
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && !document.getElementById("session-booking-modal")?.classList.contains("hidden")) {
            closeBookingModal();
        }
    });
}

function setupRealtime(uid) {
    onValue(ref(database, `users/${uid}`), (snap) => {
        state.user = snap.val() || {};
        renderAll();
    }, renderError("overview-status", "Unable to load your user profile."));

    onValue(ref(database, `students/${uid}`), (snap) => {
        state.student = snap.val() || {};
        renderAll();
    }, renderError("overview-status", "Unable to load your student profile."));

    onValue(ref(database, `pathwayResults/${uid}`), (snap) => {
        state.pathwayResults = snap.val() || {};
        selectCurrentPathway();
        renderAll();
        ensureRecommendedSkills();
        scheduleRecommendationSave();
    }, renderError("pathway-content", "Unable to load pathway results."));

    onValue(ref(database, "courses"), (snap) => {
        state.courses = snap.val() || {};
        renderCourses();
        renderSavedCourses();
        renderStats();
        renderNextSteps();
        scheduleRecommendationSave();
    }, renderError("courses-list", "Unable to load courses."));

    onValue(ref(database, `savedCourses/${uid}`), (snap) => {
        state.savedCourses = snap.val() || {};
        renderSavedCourses();
        renderStats();
        renderNextSteps();
    }, renderError("saved-courses-list", "Unable to load saved courses."));

    onValue(ref(database, `courseEngagements/${uid}`), (snap) => {
        state.courseEngagements = snap.val() || {};
        renderEngagedCourses();
        renderStudentOverview();
    }, renderError("engaged-courses-list", "Unable to load engaged courses."));

    onValue(ref(database, `courseApplications/${uid}`), (snap) => {
        state.courseApplications = snap.val() || {};
        renderEngagedCourses();
        renderStudentOverview();
    }, renderError("engaged-courses-list", "Unable to load course applications."));

    onValue(ref(database, "scholarships"), (snap) => {
        state.scholarships = snap.val() || {};
        renderScholarships();
        renderSavedScholarships();
        renderStudentOverview();
        scheduleRecommendationSave();
    }, renderError("scholarships-list", "Unable to load scholarships."));

    onValue(ref(database, `savedScholarships/${uid}`), (snap) => {
        state.savedScholarships = snap.val() || {};
        renderScholarships();
        renderSavedScholarships();
        renderStats();
        renderNextSteps();
    }, renderError("scholarships-list", "Unable to load saved scholarships."));

    onValue(ref(database, `scholarshipApplications/${uid}`), (snap) => {
        state.scholarshipApplications = snap.val() || {};
        renderAppliedScholarships();
        renderStudentOverview();
    }, renderError("applied-scholarships-list", "Unable to load scholarship applications."));

    onValue(query(ref(database, "mentors"), orderByChild("status"), equalTo("approved")), (snap) => {
        state.mentors = snap.val() || {};
        renderMentors();
        renderMentorRequests();
        renderStudentOverview();
        scheduleRecommendationSave();
    }, renderError("mentors-list", "Unable to load mentors."));

    onValue(query(ref(database, "mentorRequests"), orderByChild("studentUid"), equalTo(uid)), (snap) => {
        state.mentorRequests = snap.val() || {};
        renderMentorRequests();
        renderStats();
        renderNextSteps();
    }, renderError("mentor-requests-list", "Unable to load mentor requests."));

    onValue(ref(database, `studentMentors/${uid}`), (snap) => {
        state.connectedMentors = snap.val() || {};
        syncMentorConversationListeners();
        renderConnectedMentors();
        renderMentorMessages();
        renderMentorSessions();
        renderStats();
        renderNextSteps();
    }, renderError("connected-mentors-list", "Unable to load connected mentors."));

    onValue(query(ref(database, "mentorAppointments"), orderByChild("studentUid"), equalTo(uid)), (snap) => {
        state.mentorAppointments = snap.val() || {};
        renderMentorSessions();
        renderStudentOverview();
    }, renderError("pending-sessions-list", "Unable to load mentor sessions."));

    onValue(ref(database, `studentProgress/${uid}/skills`), (snap) => {
        state.skills = snap.val() || {};
        renderSkills();
        renderStats();
        renderNextSteps();
    }, renderError("skills-list", "Unable to load skill progress."));

    onValue(ref(database, "careerGuides"), (snap) => {
        state.careerGuides = snap.val() || {};
        renderCareerGuides();
    }, renderError("career-guides-list", "Unable to load career guides."));

    onValue(ref(database, `notifications/${uid}`), (snap) => {
        state.notifications = snap.val() || {};
        renderNotifications();
        renderStats();
    });

    onValue(ref(database, `conversations/${studentConversationId(uid)}`), (snap) => {
        state.supportConversation = snap.val() || {};
        renderSupportMessages();
        renderStats();
        if (document.getElementById("support-section")?.classList.contains("active")) markStudentSupportRead();
    }, renderError("support-replies-list", "Unable to load support messages."));
}

async function recordStudentLogout() {
    const user = auth.currentUser;
    if (!user) return;
    const recordId = sessionStorage.getItem("edupathLoginRecordId");
    const fullName = state.user.fullName || state.student.fullName || "Student";
    const updates = {};
    updates[`users/${user.uid}/isOnline`] = false;
    updates[`users/${user.uid}/lastLogoutAt`] = serverTimestamp();
    updates[`presence/${user.uid}`] = { state: "offline", lastChanged: serverTimestamp() };
    if (recordId) {
        updates[`loginHistory/${user.uid}/${recordId}/sessionStatus`] = "completed";
        updates[`loginHistory/${user.uid}/${recordId}/logoutAt`] = serverTimestamp();
    }
    const logRef = push(ref(database, "activityLogs"));
    updates[`activityLogs/${logRef.key}`] = {
        logId: logRef.key,
        uid: user.uid,
        userName: fullName,
        userRole: "student",
        actionType: "logout",
        description: `${fullName} logged out`,
        relatedEntityType: "user",
        relatedEntityId: user.uid,
        createdAt: serverTimestamp()
    };
    return update(ref(database), updates).catch(console.error);
}

function renderAll() {
    selectCurrentPathway();
    renderIdentity();
    renderWelcome();
    renderProfileCompletion();
    renderPathway();
    renderPathwayHistory();
    renderCourses();
    renderSavedCourses();
    renderEngagedCourses();
    renderScholarships();
    renderSavedScholarships();
    renderAppliedScholarships();
    renderMentors();
    renderMentorRequests();
    renderConnectedMentors();
    renderMentorMessages();
    renderMentorSessions();
    renderSkills();
    renderCareerGuides();
    renderSupportMessages();
    renderNotifications();
    renderStats();
    renderNextSteps();
    renderStudentOverview();
}

function selectCurrentPathway() {
    const entries = Object.entries(state.pathwayResults || {});
    if (!entries.length) {
        state.currentResult = null;
        state.currentResultId = null;
        return;
    }

    const preferredId = state.student.currentPathwayResultId;
    if (preferredId && state.pathwayResults[preferredId]) {
        state.currentResultId = preferredId;
        state.currentResult = { id: preferredId, ...state.pathwayResults[preferredId] };
        return;
    }

    const sorted = entries.sort(([keyA, a], [keyB, b]) => getTimeValue(b.createdAt, keyB) - getTimeValue(a.createdAt, keyA));
    state.currentResultId = sorted[0][0];
    state.currentResult = { id: sorted[0][0], ...sorted[0][1] };
}

function getTimeValue(value, fallbackKey = "") {
    if (typeof value === "number") return value;
    if (typeof value === "string") {
        const parsed = Date.parse(value);
        if (!Number.isNaN(parsed)) return parsed;
    }
    return firebaseKeyTime(fallbackKey);
}

function formatDateTime(value) {
    const time = getTimeValue(value);
    return time ? new Date(time).toLocaleString() : "N/A";
}

function studentConversationId(uid = state.uid) {
    return `admin_${uid}`;
}

function mentorConversationId(mentorUid, studentUid) {
    return `mentor_${mentorUid}_${studentUid}`;
}

function sanitizeForWrite(value) {
    if (Array.isArray(value)) return value.map(sanitizeForWrite);
    if (!value || typeof value !== "object") return value ?? "";
    return Object.fromEntries(Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, sanitizeForWrite(item)]));
}

function firebaseKeyTime(key) {
    const chars = "-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz";
    if (!key || key.length < 8) return 0;
    return key.slice(0, 8).split("").reduce((total, char) => total * 64 + Math.max(chars.indexOf(char), 0), 0);
}

function renderIdentity() {
    const fullName = state.user.fullName || state.student.fullName || "Student";
    const firstName = fullName.split(" ")[0] || "Student";
    const photoURL = state.user.photoURL || state.student.photoURL || "";
    const initials = getInitials(fullName);

    updateSidebarUser({ fullName, role: "student", photoURL });
    updateDashboardGreetingName(fullName);
    setText("welcome-name", `Welcome back, ${firstName}`);
    setText("top-user-name", firstName);
    setText("welcome-first-name", firstName);
    setText("welcome-education", state.student.educationLevel || "Add education level");
    setText("welcome-interest", state.student.interestArea || "Add interest area");
    setText("welcome-pathway-status", state.student.pathwayCompleted === true ? "Completed" : "Not completed");
    setText("welcome-last-updated", formatDate(state.student.pathwayLastUpdatedAt || state.currentResult?.createdAt));
    setText("hero-pathway-name", state.currentResult?.recommendedPathway || "Complete Pathway Finder");

    const avatar = document.getElementById("welcome-avatar");
    if (avatar) {
        avatar.innerHTML = photoURL ? `<img src="${escapeAttr(photoURL)}" alt="${escapeAttr(fullName)}">` : `<span>${initials}</span>`;
    }
}

function renderWelcome() {
    const completed = state.student.pathwayCompleted === true || !!state.currentResult;
    const outdated = state.student.recommendationsOutdated === true;
    const buttons = document.getElementById("welcome-actions");
    const badge = document.getElementById("outdated-badge");
    const message = document.getElementById("welcome-flow-message");

    if (badge) badge.classList.toggle("hidden", !outdated);
    if (!buttons || !message) return;

    if (!completed) {
        message.textContent = "Complete the Pathway Finder once to receive personalized course, scholarship, mentor, and skill recommendations.";
        buttons.innerHTML = `
            <a href="pathway.html?mode=first-time" class="btn btn-primary">Complete Pathway Finder <i class="fas fa-arrow-right"></i></a>
            <button type="button" class="btn btn-outline dashboard-jump" data-section="recommended-courses-section">Explore Matches</button>
            <a href="profile.html" class="btn btn-outline">Complete Profile</a>
        `;
        bindJumpButtons();
        return;
    }

    if (outdated) {
        message.textContent = "Your profile information has changed. Recalculate your pathway to receive updated recommendations.";
        buttons.innerHTML = `
            <a href="pathway.html?mode=update" class="btn btn-primary">Recalculate Recommendations <i class="fas fa-sync-alt"></i></a>
            <button type="button" class="btn btn-outline dashboard-jump" data-section="recommended-courses-section">Explore Matches</button>
            <a href="pathway.html?mode=update" class="btn btn-outline">Update Pathway</a>
            <a href="#pathway-history" data-section="pathway-history-section" class="btn btn-outline dashboard-jump">View History</a>
        `;
        bindJumpButtons();
        return;
    }

    message.textContent = "Your current pathway is ready. Review it, compare matches, or update details when your goals change.";
    buttons.innerHTML = `
        <a href="#next-steps" data-section="next-steps-section" class="btn btn-primary dashboard-jump">Continue My Plan <i class="fas fa-arrow-right"></i></a>
        <button type="button" class="btn btn-outline dashboard-jump" data-section="recommended-courses-section">Explore Matches <i class="fas fa-search"></i></button>
        <a href="pathway.html?mode=update" class="btn btn-outline">Update Pathway <i class="fas fa-pen"></i></a>
    `;
    bindJumpButtons();
}

function bindJumpButtons() {
    // Dynamic dashboard buttons are handled by bindDashboardActionDelegation().
}

function renderProfileCompletion() {
    const completed = [];
    const missing = [];
    profileFields.forEach(([key, label, source]) => {
        const value = source === "user" ? state.user[key] : state.student[key];
        (hasValue(value) ? completed : missing).push(label);
    });

    const percentage = Math.round((completed.length / profileFields.length) * 100);
    setText("profile-strength-badge", `${percentage}% Complete`);
    setText("profile-strength-message", percentage >= 90 ? "Your profile is strong and ready for accurate recommendations." : "Add missing details to improve recommendation quality.");
    setText("profile-completion-stat", `${percentage}%`);
    setText("overview-profile-completion-stat", `${percentage}%`);
    setText("overview-profile-status", percentage >= 100 ? "Complete" : percentage >= 80 ? "Almost there" : percentage >= 50 ? "In progress" : "Needs details");
    setText("profile-completion-label", percentage >= 100 ? "Complete" : percentage >= 80 ? "Almost there" : percentage >= 50 ? "In progress" : "Needs details");
    setText("pathway-setup-status", state.student.pathwayCompleted === true || state.currentResult ? "Completed" : "Not Started");

    const bar = document.getElementById("dynamic-profile-progress-bar");
    if (bar) bar.style.width = `${percentage}%`;
    const ring = document.querySelector(".student-profile-ring");
    if (ring) ring.style.setProperty("--student-profile-progress", `${percentage * 3.6}deg`);

    renderChecklist("profile-completed-list", completed, true);
    renderChecklist("profile-todo-list", missing, false);

    const pathwayItem = document.getElementById("pathway-setup-list");
    if (pathwayItem) {
        renderChecklist("pathway-setup-list", [state.currentResult ? "First Pathway Result" : "Complete First Pathway Result"], !!state.currentResult);
    }

    if (state.student.profileCompletion !== percentage && state.uid) {
        update(ref(database, `students/${state.uid}`), { profileCompletion: percentage }).catch(console.error);
    }
}

function renderChecklist(containerId, items, complete) {
    const container = document.getElementById(containerId);
    if (!container) return;
    if (!items.length) {
        container.innerHTML = `<li><i class="fas fa-check-circle text-success"></i> Nothing pending</li>`;
        return;
    }
    const icon = complete ? "fas fa-check-circle text-success" : "far fa-circle text-muted";
    container.innerHTML = items.map((item) => `<li><i class="${icon}"></i> ${escapeHtml(item)}</li>`).join("");
}

function renderPathway() {
    const container = document.getElementById("pathway-content");
    if (!container) return;

    if (!state.currentResult) {
        container.innerHTML = emptyState("fa-search-location", "You have not completed your Pathway Finder yet.", "Complete Pathway Finder", "pathway.html?mode=first-time");
        setText("res-score", "--");
        return;
    }

    const result = state.currentResult;
    const basic = result.basicProfile || {};
    const goals = result.goals || {};
    const learning = result.learningPreferences || {};
    const support = result.supportNeeds || {};
    const courseNames = result.courseMatches?.map((match) => `${match.courseName} (${match.matchScore}%)`) || result.recommendedCourses;
    const mentorNames = result.mentorMatches?.map((match) => `${match.mentorName} (${match.matchScore}%)`) || result.recommendedMentors;
    setText("res-score", result.pathwayScore || "--");
    container.innerHTML = `
        <div class="result-grid">
            ${resultField("Recommended Pathway", result.recommendedPathway)}
            ${resultField("Interest Area", result.interestArea || result.interests?.interestAreas?.[0])}
            ${resultField("Future Goal", result.futureGoal || goals.dreamCareer || goals.futurePreference?.[0])}
            ${resultField("Education Level", result.educationLevel || basic.currentEducationLevel)}
            ${resultField("Exam Stream", result.examStream)}
            ${resultField("Result Status", result.resultStatus)}
            ${resultField("Financial Support", result.financialSupport || support.financialSupport)}
            ${resultField("Learning Mode", result.learningMode || learning.learningMode)}
            ${resultField("Budget Range", result.budgetRange || support.budgetRange)}
            ${resultField("Mentor Suggestion", mentorNames?.[0] || result.mentorSuggestion || getMentorSuggestion())}
            ${resultField("Created Date", formatDate(result.createdAt))}
            ${resultField("Last Updated Date", formatDate(result.updatedAt || result.createdAt))}
            <div class="result-item full-width"><span class="label">Recommendation Summary</span><div class="next-step-inline">${escapeHtml(result.recommendationSummary || "Review your recommended options and next steps.")}</div></div>
            <div class="result-item full-width"><span class="label">Recommended Courses</span><div class="tag-list">${tags(courseNames)}</div></div>
            <div class="result-item full-width"><span class="label">Recommended Mentors</span><div class="tag-list">${tags(mentorNames)}</div></div>
            <div class="result-item full-width"><span class="label">Recommended Skills</span><div class="tag-list">${tags(result.recommendedSkills)}</div></div>
            <div class="result-item full-width"><span class="label">Career Paths</span><div class="tag-list">${tags(result.careerPaths)}</div></div>
            <div class="result-item full-width"><span class="label">Next Step Plan</span><div class="tag-list">${tags(result.nextSteps || [getNextStepSummary()])}</div></div>
        </div>
        <div class="section-actions">
            <button class="btn btn-primary" data-section="pathway-section">View Full Result</button>
            <a href="pathway.html?mode=update" class="btn btn-outline">Recalculate</a>
            <button class="btn btn-outline dashboard-jump" data-section="pathway-history-section">View Result History</button>
        </div>
    `;
    bindJumpButtons();
}

function renderPathwayHistory() {
    const container = document.getElementById("pathway-history-list");
    if (!container) return;
    const results = Object.entries(state.pathwayResults || {})
        .map(([id, result]) => ({ id, ...result }))
        .sort((a, b) => getTimeValue(b.createdAt, b.id) - getTimeValue(a.createdAt, a.id));

    if (!results.length) {
        container.innerHTML = emptyState("fa-history", "No pathway history yet.", "Complete Pathway Finder", "pathway.html?mode=first-time");
        return;
    }

    container.innerHTML = results.map((result) => `
        <article class="timeline-card glass">
            <div class="timeline-date">${formatDate(result.createdAt)}</div>
            <div class="timeline-main">
                <div class="timeline-title">
                    <h3>${escapeHtml(result.interestArea || "Pathway Result")}</h3>
                    <span class="badge ${result.id === state.currentResultId ? "badge-success" : "badge-primary"}">${result.id === state.currentResultId ? "Current" : "Previous"}</span>
                </div>
                <p>${escapeHtml(result.futureGoal || "Future goal not specified")}</p>
                <div class="card-meta">
                    <span><i class="fas fa-chart-line"></i> ${escapeHtml(result.pathwayScore || "--")}% score</span>
                    <span><i class="fas fa-book"></i> ${escapeHtml(summarize(result.recommendedCourses))}</span>
                </div>
                <div class="card-actions">
                    <button class="btn btn-primary btn-sm" data-view-result="${escapeAttr(result.id)}">View Result</button>
                    <button class="btn btn-outline btn-sm" data-compare-result="${escapeAttr(result.id)}">Compare with Current Result</button>
                </div>
            </div>
        </article>
    `).join("");

    container.querySelectorAll("[data-view-result]").forEach((button) => {
        button.addEventListener("click", () => {
            state.currentResultId = button.dataset.viewResult;
            state.currentResult = { id: state.currentResultId, ...state.pathwayResults[state.currentResultId] };
            renderPathway();
            showDashboardSection("pathway-section");
        });
    });

    container.querySelectorAll("[data-compare-result]").forEach((button) => {
        button.addEventListener("click", () => compareResult(button.dataset.compareResult));
    });
}

function compareResult(resultId) {
    const result = state.pathwayResults[resultId];
    if (!result || !state.currentResult) return;
    showToast(`Compared with current: score ${result.pathwayScore || "--"}% vs ${state.currentResult.pathwayScore || "--"}%.`, "success");
}

function renderCourses() {
    const container = document.getElementById("courses-list");
    if (!container) return;
    if (!state.currentResult) {
        container.innerHTML = emptyState("fa-route", "Complete Pathway Finder first to see course recommendations.", "Start Pathway Finder", "pathway.html?mode=first-time");
        return;
    }
    const active = Object.entries(state.courses || {}).filter(([, course]) => normalize(course.status) === "active");
    if (!active.length) {
        container.innerHTML = emptyBlock("No active courses available yet.");
        return;
    }

    const allMatches = active.map(([id, course]) => ({ ...courseMatch(id, course), raw: course }));
    const strong = allMatches.filter((course) => course.matchScore >= 40);
    const source = strong.length >= 3 ? strong : allMatches.map((course) => ({ ...course, matchLevel: course.matchScore >= 40 ? course.matchLevel : "Alternative Option" }));
    const visible = applyCourseFilters(source);
    const best = Math.max(0, ...source.map((course) => course.matchScore));

    container.innerHTML = `
        ${recommendationSummary("Courses", `${source.length} courses found based on your pathway. Best match: ${best}%.`)}
        ${courseFilterBar(source)}
        ${filterChips("courses")}
        <div class="cards-grid recommendation-results">
            ${visible.length ? visible.map(courseCard).join("") : emptyBlock(strong.length ? "No courses match the selected filters." : "No strong matches found. Showing alternative options when filters are cleared.")}
        </div>
    `;

    container.querySelectorAll("[data-save-course]").forEach((button) => {
        button.addEventListener("click", () => saveCourse(button.dataset.saveCourse, Number(button.dataset.score || 0)));
    });
    container.querySelectorAll("[data-view-course-detail]").forEach((button) => {
        button.addEventListener("click", () => openRecommendationDetail("Course Details", courseDetailHtml(button.dataset.viewCourseDetail)));
    });
    bindRecommendationFilters(container, "courses");
}

function renderSavedCourses() {
    const container = document.getElementById("saved-courses-list");
    if (!container) return;
    const saved = Object.entries(state.savedCourses || {});
    if (!saved.length) {
        container.innerHTML = emptyBlock("No saved courses yet.");
        return;
    }

    container.innerHTML = saved.map(([courseId, savedData]) => {
        const course = state.courses[courseId] || savedData.courseSnapshot || {};
        return `
            <article class="list-item">
                <div class="list-thumb"><img src="${escapeAttr(getCourseImage(course))}" alt="${escapeAttr(course.courseName || course.name || "Saved course image")}" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='images/course-placeholder.png';"></div>
                <div class="list-content">
                    <h4>${escapeHtml(course.courseName || course.name || "Saved Course")}</h4>
                    <p>${escapeHtml(course.instituteName || course.institute || "Institute")} • Saved ${formatDate(savedData.savedAt)}</p>
                    <span class="badge badge-primary">${escapeHtml(savedData.matchScore ?? "--")}% match</span>
                    ${savedData.applyStatus ? `<span class="badge badge-cyan">${escapeHtml(savedData.applyStatus)}</span>` : ""}
                </div>
                <a class="btn btn-outline btn-sm" href="courses.html?course=${encodeURIComponent(courseId)}">View</a>
                ${course.applyLink ? `<a class="btn btn-primary btn-sm" href="${escapeAttr(course.applyLink)}" target="_blank" rel="noopener">Apply</a>` : ""}
                <button class="btn btn-outline btn-sm" data-remove-course="${escapeAttr(courseId)}">Remove</button>
            </article>
        `;
    }).join("");

    container.querySelectorAll("[data-remove-course]").forEach((button) => {
        button.addEventListener("click", () => remove(ref(database, `savedCourses/${state.uid}/${button.dataset.removeCourse}`)));
    });
}

function renderEngagedCourses() {
    const container = document.getElementById("engaged-courses-list");
    if (!container) return;
    const combined = [
        ...Object.entries(state.courseEngagements || {}).map(([id, item]) => [id, { source: "engagement", ...item }]),
        ...Object.entries(state.courseApplications || {}).map(([id, item]) => [id, { source: "application", ...item }])
    ].sort(([, a], [, b]) => getTimeValue(b.updatedAt || b.appliedAt || b.createdAt) - getTimeValue(a.updatedAt || a.appliedAt || a.createdAt));

    if (!combined.length) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-book-open"></i>
                <p>No engaged courses yet. When you apply or mark a course as started, it will appear here.</p>
                <button class="btn btn-primary dashboard-jump" data-section="recommended-courses-section">Explore Recommended Courses</button>
            </div>
        `;
        bindJumpButtons();
        return;
    }

    container.innerHTML = combined.map(([id, item]) => {
        const courseId = item.courseId || id;
        const course = state.courses[courseId] || item.courseSnapshot || {};
        return `
            <article class="list-item">
                <div class="list-thumb"><img src="${escapeAttr(getCourseImage(course))}" alt="${escapeAttr(course.courseName || course.name || item.courseName || "Course image")}" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='images/course-placeholder.png';"></div>
                <div class="list-content">
                    <h4>${escapeHtml(course.courseName || course.name || item.courseName || "Course")}</h4>
                    <p>${escapeHtml(course.instituteName || course.institute || item.instituteName || "Institute")} - ${formatDate(item.updatedAt || item.appliedAt || item.createdAt)}</p>
                    <span class="badge badge-primary">${escapeHtml(formatStatus(item.status || item.progressStatus || item.source))}</span>
                </div>
                <a class="btn btn-outline btn-sm" href="courses.html?course=${encodeURIComponent(courseId)}">View Course</a>
            </article>
        `;
    }).join("");
}

async function saveCourse(courseId, matchScore) {
    const course = state.courses[courseId] || {};
    await set(ref(database, `savedCourses/${state.uid}/${courseId}`), {
        courseId,
        studentUid: state.uid,
        matchScore,
        courseSnapshot: course,
        savedAt: serverTimestamp()
    });
    showToast("Course saved.", "success");
}

function renderScholarships() {
    const container = document.getElementById("scholarships-list");
    if (!container) return;
    if (!state.currentResult) {
        container.innerHTML = emptyState("fa-route", "Complete Pathway Finder first to see scholarship recommendations.", "Start Pathway Finder", "pathway.html?mode=first-time");
        return;
    }
    const active = Object.entries(state.scholarships || {}).filter(([, item]) => normalize(item.status) === "active");
    const supportBadge = document.getElementById("scholarship-support-badge");
    if (supportBadge) supportBadge.classList.toggle("hidden", !needsFinancialHelp());

    if (!active.length) {
        container.innerHTML = emptyBlock("No scholarships available yet.");
        return;
    }

    const allMatches = active.map(([id, item]) => ({ ...scholarshipMatch(id, item), raw: item }));
    const source = allMatches.filter((item) => item.matchScore >= 40);
    const visible = applyScholarshipFilters(source.length ? source : allMatches);
    const best = Math.max(0, ...allMatches.map((item) => item.matchScore));

    container.innerHTML = `
        ${recommendationSummary("Scholarships", `${source.length || allMatches.length} scholarships may support your needs. Best match: ${best}%.`)}
        ${scholarshipFilterBar(allMatches)}
        ${filterChips("scholarships")}
        <div class="recommendation-results list-card-inner">
            ${visible.length ? visible.map(scholarshipCard).join("") : emptyBlock("No scholarships match the selected filters.")}
        </div>
    `;

    container.querySelectorAll("[data-save-scholarship]").forEach((button) => {
        button.addEventListener("click", () => saveScholarship(button.dataset.saveScholarship, Number(button.dataset.score || 0)));
    });
    container.querySelectorAll("[data-view-scholarship-detail]").forEach((button) => {
        button.addEventListener("click", () => openRecommendationDetail("Scholarship Details", scholarshipDetailHtml(button.dataset.viewScholarshipDetail)));
    });
    bindRecommendationFilters(container, "scholarships");
}

function renderSavedScholarships() {
    setText("saved-scholarships-stat", Object.keys(state.savedScholarships || {}).length);
    const container = document.getElementById("saved-scholarships-list");
    if (!container) return;
    const saved = Object.entries(state.savedScholarships || {});
    if (!saved.length) {
        container.innerHTML = emptyBlock("You have not saved any scholarships yet.");
        return;
    }

    container.innerHTML = saved.map(([id, savedData]) => {
        const item = state.scholarships[id] || savedData.scholarshipSnapshot || {};
        return `
            <article class="list-item">
                <div class="list-thumb"><img src="${escapeAttr(getScholarshipImage(item))}" alt="${escapeAttr(item.scholarshipName || item.title || item.name || "Scholarship image")}" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='images/scholarship-placeholder.png';"></div>
                <div class="list-content">
                    <h4>${escapeHtml(item.title || item.name || "Saved Scholarship")}</h4>
                    <p>${escapeHtml(item.provider || item.organization || "Provider")} - Saved ${formatDate(savedData.savedAt)}</p>
                    <span class="badge badge-primary">${escapeHtml(savedData.matchScore ?? "--")}% match</span>
                </div>
                ${item.applyLink || item.url ? `<a class="btn btn-primary btn-sm" href="${escapeAttr(item.applyLink || item.url)}" target="_blank" rel="noopener">Apply</a>` : ""}
            </article>
        `;
    }).join("");
}

function renderAppliedScholarships() {
    const container = document.getElementById("applied-scholarships-list");
    if (!container) return;
    const applications = Object.entries(state.scholarshipApplications || {}).sort(([, a], [, b]) => getTimeValue(b.updatedAt || b.appliedAt || b.createdAt) - getTimeValue(a.updatedAt || a.appliedAt || a.createdAt));
    if (!applications.length) {
        container.innerHTML = emptyBlock("No scholarship applications tracked yet.");
        return;
    }

    container.innerHTML = applications.map(([id, application]) => {
        const scholarshipId = application.scholarshipId || id;
        const item = state.scholarships[scholarshipId] || application.scholarshipSnapshot || {};
        return `
            <article class="list-item">
                <div class="list-thumb"><img src="${escapeAttr(getScholarshipImage(item))}" alt="${escapeAttr(item.scholarshipName || item.title || item.name || application.scholarshipName || "Scholarship image")}" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='images/scholarship-placeholder.png';"></div>
                <div class="list-content">
                    <h4>${escapeHtml(item.title || item.name || application.scholarshipName || "Scholarship Application")}</h4>
                    <p>${escapeHtml(item.provider || application.provider || "Provider")} - ${formatDate(application.updatedAt || application.appliedAt || application.createdAt)}</p>
                    <span class="badge badge-primary">${escapeHtml(formatStatus(application.status || "submitted"))}</span>
                </div>
            </article>
        `;
    }).join("");
}

async function saveScholarship(id, matchScore) {
    await set(ref(database, `savedScholarships/${state.uid}/${id}`), {
        scholarshipId: id,
        studentUid: state.uid,
        matchScore,
        scholarshipSnapshot: state.scholarships[id] || {},
        savedAt: serverTimestamp()
    });
    showToast("Scholarship saved.", "success");
}

function renderMentors() {
    const container = document.getElementById("mentors-list");
    if (!container) return;
    if (!state.currentResult) {
        container.innerHTML = emptyState("fa-route", "Complete Pathway Finder first to see suitable mentors.", "Start Pathway Finder", "pathway.html?mode=first-time");
        return;
    }
    const approved = Object.entries(state.mentors || {}).filter(([, mentor]) => isApprovedActiveMentor(mentor));
    if (!approved.length) {
        container.innerHTML = emptyBlock("No approved mentors available yet.");
        return;
    }

    const allMatches = approved.map(([id, mentor]) => ({ ...mentorMatch(id, mentor), raw: mentor }));
    const source = allMatches.filter((mentor) => mentor.matchScore >= 40);
    const visible = applyMentorFilters(source.length ? source : allMatches);
    const best = Math.max(0, ...allMatches.map((mentor) => mentor.matchScore));

    container.innerHTML = `
        ${recommendationSummary("Mentors", `${source.length || allMatches.length} approved mentors match your pathway. Best match: ${best}%.`)}
        ${mentorFilterBar(allMatches)}
        ${filterChips("mentors")}
        <div class="cards-grid recommendation-results">
            ${visible.length ? visible.map(mentorCard).join("") : emptyBlock("No mentors match the selected filters.")}
        </div>
    `;

    container.querySelectorAll("[data-mentor-uid]").forEach((button) => {
        if (button.disabled) return;
        button.addEventListener("click", () => requestMentor(button.dataset.mentorUid));
    });
    container.querySelectorAll("[data-view-mentor-detail]").forEach((button) => {
        button.addEventListener("click", () => openRecommendationDetail("Mentor Profile", mentorDetailHtml(button.dataset.viewMentorDetail)));
    });
    bindRecommendationFilters(container, "mentors");
}

function recommendationProfile() {
    const result = state.currentResult || {};
    return {
        currentEducationLevel: result.basicProfile?.currentEducationLevel || result.educationLevel || state.student.educationLevel,
        educationLevel: result.educationLevel || result.basicProfile?.currentEducationLevel || state.student.educationLevel,
        alStream: result.academicBackground?.alStream || result.examStream,
        olStatus: result.academicBackground?.olStatus,
        alStatus: result.academicBackground?.alStatus,
        interestAreas: result.interests?.interestAreas || arrayValue(result.interestArea || state.student.interestArea),
        enjoyableWorkTypes: result.interests?.enjoyableWorkTypes || [],
        skills: result.skillsAndStrengths?.skills || arrayValue(result.skills || state.student.skills),
        strengths: result.skillsAndStrengths?.strengths || [],
        futurePreference: result.goals?.futurePreference || [],
        dreamCareer: result.goals?.dreamCareer || result.futureGoal || state.student.futureGoal,
        learningMode: result.learningPreferences?.learningMode || result.learningMode || state.student.learningMode,
        courseDuration: result.learningPreferences?.courseDuration,
        timeAvailability: result.learningPreferences?.timeAvailability || [],
        preferredDistricts: result.learningPreferences?.preferredDistricts || arrayValue(result.preferredDistrict || state.student.preferredDistrict || state.student.district),
        preferredLanguage: result.basicProfile?.preferredLanguage || result.learningPreferences?.preferredLanguage,
        district: result.basicProfile?.district || result.district || state.student.district,
        financialSupport: result.supportNeeds?.financialSupport || result.financialSupport || state.student.financialSupport,
        budgetRange: result.supportNeeds?.budgetRange || result.budgetRange,
        biggestChallenge: result.supportNeeds?.biggestChallenge || [],
        supportNeeded: result.supportNeeds?.supportNeeded || [],
        recommendedPathway: result.recommendedPathway || ""
    };
}

function courseMatch(id, course) {
    const profile = recommendationProfile();
    const reasons = [];
    const missing = [];
    const fields = [];
    let score = 0;
    addScore(includesAny([course.category, course.subcategory, course.description, course.skillsCovered, course.careerOpportunities], [...profile.interestAreas, profile.recommendedPathway]), 25, "Matches your interest/pathway", "category");
    addScore(educationMatches(profile.currentEducationLevel, course), 20, `Suitable for ${profile.currentEducationLevel || "your education level"}`, "education");
    addScore(includesAny([course.careerOpportunities, course.description, course.category], [profile.dreamCareer, ...profile.futurePreference]), 15, "Aligns with your future goal", "career");
    addScore(includesAny([course.skillsCovered, course.description], [...profile.skills, ...profile.strengths]), 10, "Covers your selected skills", "skills");
    addScore(modeMatches(profile.learningMode, course.mode || course.learningMode), 10, "Matches your learning mode", "mode");
    addScore(locationMatches([profile.district, ...profile.preferredDistricts], course.district || course.location || course.mode), 10, "Fits your location preference", "district");
    addScore(budgetMatches(profile, course), 10, "Fits your budget preference", "budget");
    if (!hasValue(course.qualificationLevel) && !hasValue(course.eligibility)) missing.push("Check entry requirements with institute");
    if (!hasValue(course.applicationDeadline)) missing.push("Verify application deadline");
    const matchScore = Math.min(score, 100);
    return {
        courseId: id,
        courseName: course.courseName || course.name || "Untitled Course",
        instituteName: course.instituteName || course.institute || "Institute not specified",
        category: course.category || "N/A",
        subcategory: course.subcategory || "",
        duration: course.duration || "N/A",
        mode: course.mode || course.learningMode || "N/A",
        feeType: course.feeType || "N/A",
        feeAmount: course.feeAmount || "",
        district: course.district || "N/A",
        qualificationLevel: course.qualificationLevel || course.educationLevel || "N/A",
        eligibility: course.eligibility || "N/A",
        applicationDeadline: course.applicationDeadline || course.deadline || "",
        applyLink: course.applyLink || "",
        imageURL: course.imageURL || "",
        description: course.description || "",
        matchScore,
        matchLevel: getMatchLevel(matchScore),
        matchReasons: reasons.length ? reasons : ["Useful alternative based on your pathway."],
        missingRequirements: missing,
        matchedFields: fields,
        isBestMatch: false,
        createdAt: course.createdAt || course.updatedAt || ""
    };

    function addScore(condition, points, reason, field) {
        if (condition) {
            score += points;
            reasons.push(reason);
            fields.push(field);
        }
    }
}

function scholarshipMatch(id, item) {
    const profile = recommendationProfile();
    const reasons = [];
    const warnings = [];
    let score = 0;
    addScore(needsFinancialHelp() || textIncludesAny(`${item.supportType} ${item.description} ${item.eligibility}`, ["bursary", "financial aid", "scholarship", "free", "monthly support", "tuition support"]), 30, "Matches your financial support need");
    addScore(includesAny([item.educationLevel, item.qualificationLevel, item.eligibility], [profile.currentEducationLevel]), 25, "Suitable for your education level");
    addScore(locationMatches([profile.district, ...profile.preferredDistricts], item.district || item.coverage), 15, "Available in your district or islandwide");
    addScore(includesAny([item.qualificationLevel, item.eligibility], [profile.currentEducationLevel, profile.alStream, profile.olStatus, profile.alStatus, "O/L", "A/L", "Diploma", "Undergraduate", "Vocational"]), 15, "Eligibility matches your background");
    addScore(includesAny([item.category, item.description], [...profile.interestAreas, profile.recommendedPathway]), 10, "Category matches your pathway");
    const deadlineState = deadlineStatus(item.deadline);
    addScore(deadlineState.active, 5, "Deadline appears active");
    if (deadlineState.warning) warnings.push(deadlineState.warning);
    if (!hasValue(item.amountBenefit || item.amount || item.benefit)) warnings.push("Amount may change by official notice.");
    const matchScore = Math.min(score, 100);
    return {
        scholarshipId: id,
        scholarshipName: item.scholarshipName || item.name || "Scholarship",
        provider: item.provider || "Provider not specified",
        providerType: item.providerType || "",
        category: item.category || "N/A",
        supportType: item.supportType || "N/A",
        amountBenefit: item.amountBenefit || item.amount || item.benefit || "N/A",
        district: item.district || item.coverage || "Islandwide / Check notice",
        qualificationLevel: item.qualificationLevel || item.educationLevel || "N/A",
        eligibility: item.eligibility || "Confirm from provider",
        deadline: item.deadline || "",
        applyLink: item.applyLink || "",
        imageURL: item.imageURL || "",
        description: item.description || "",
        matchScore,
        matchLevel: getMatchLevel(matchScore),
        matchReasons: reasons.length ? reasons : ["Review eligibility and provider details."],
        warningNotes: warnings.length ? warnings : ["Eligibility must be confirmed from provider."]
    };

    function addScore(condition, points, reason) {
        if (condition) {
            score += points;
            reasons.push(reason);
        }
    }
}

function mentorMatch(uid, mentor) {
    const profile = recommendationProfile();
    const reasons = [];
    let score = 0;
    addScore(includesAny([mentor.field, mentor.expertise, mentor.mentoringField, mentor.shortBio, mentor.bio], [...profile.interestAreas, profile.recommendedPathway, profile.dreamCareer]), 30, "Mentor expertise matches your pathway");
    addScore(includesAny(mentor.guidanceAreas, [...profile.supportNeeded, ...profile.biggestChallenge, ...profile.futurePreference]), 20, "Guidance area fits your current need");
    addScore(includesAny(mentor.supportedStudentLevels || mentor.studentLevelsSupported, [profile.currentEducationLevel]), 15, "Supports your education level");
    addScore(includesAny(mentor.languages || mentor.language || mentor.preferredLanguage || mentor.preferredLanguages, [profile.preferredLanguage]), 10, "Language preference match");
    addScore(availabilityMatches(profile.timeAvailability, mentor), 10, "Availability matches your schedule");
    addScore(modeMatches(profile.learningMode, mentor.mentoringMode || mentor.availability), 10, "Mentoring mode match");
    addScore(hasValue(mentor.yearsOfExperience || mentor.experience) || hasValue(mentor.organization || mentor.universityOrCompany) || hasValue(mentor.highestQualification) || hasValue(mentor.shortBio || mentor.bio) || hasValue(mentor.photoURL), 5, "Strong mentor profile");
    const matchScore = Math.min(score, 100);
    return {
        mentorUid: uid,
        mentorName: mentor.fullName || "Mentor",
        mentorField: mentor.field || mentor.expertise || mentor.mentoringField || "N/A",
        mentorType: mentor.mentorType || "Mentor",
        currentRole: mentor.currentRole || "",
        organization: mentor.organization || mentor.universityOrCompany || "",
        yearsOfExperience: mentor.yearsOfExperience || mentor.experience || "",
        languages: mentor.languages || mentor.language || mentor.preferredLanguage || "",
        guidanceAreas: mentor.guidanceAreas || "",
        mentoringMode: mentor.mentoringMode || "N/A",
        availabilityStatus: mentor.availabilityStatus || mentor.availability || "N/A",
        availableDays: mentor.availableDays || "",
        availableTime: mentor.availableTime || "",
        shortBio: mentor.shortBio || mentor.bio || "",
        photoURL: mentor.photoURL || "",
        matchScore,
        matchLevel: mentorAvailabilityLevel(matchScore, mentor),
        matchReasons: reasons.length ? reasons : ["Approved mentor available for guidance."],
        availabilityNote: mentor.availableTime || mentor.availableDays || mentor.availabilityStatus || "Check availability"
    };

    function addScore(condition, points, reason) {
        if (condition) {
            score += points;
            reasons.push(reason);
        }
    }
}

function isApprovedActiveMentor(mentor = {}) {
    const userType = normalize(mentor.userType || mentor.role || "mentor");
    const accountStatus = normalize(mentor.accountStatus || "active");
    return normalize(mentor.approvalStatus || mentor.status) === "approved"
        && mentor.publicVisibility === true
        && mentor.mentoringEnabled === true
        && userType === "mentor"
        && accountStatus === "active";
}

function isAccountActive(user = {}) {
    return !["suspended", "disabled", "rejected"].includes(normalize(user.accountStatus || "active"));
}

function recommendationSummary(title, text) {
    return `<div class="recommendation-summary glass"><div><span>Recommended for You</span><h3>${escapeHtml(title)}</h3><p>${escapeHtml(text)}</p></div><i class="fas fa-sliders-h"></i></div>`;
}

function courseFilterBar(items) {
    const f = recommendationFilters.courses;
    return filterBar("courses", [
        inputFilter("search", "Search courses", f.search),
        selectFilter("category", "Category", f.category, unique(items.map((i) => i.category))),
        selectFilter("district", "District", f.district, unique(items.map((i) => i.district))),
        selectFilter("mode", "Mode", f.mode, unique(items.map((i) => i.mode))),
        selectFilter("feeType", "Fee Type", f.feeType, unique(items.map((i) => i.feeType))),
        selectFilter("qualification", "Qualification", f.qualification, unique(items.map((i) => i.qualificationLevel))),
        selectFilter("matchLevel", "Match Level", f.matchLevel, ["Excellent Match", "Strong Match", "Good Match", "Possible Match", "Alternative Option"]),
        selectFilter("duration", "Duration", f.duration, unique(items.map((i) => i.duration))),
        selectFilter("sortBy", "Sort", f.sortBy, [["best-match", "Best Match"], ["newest", "Newest"], ["deadline-soon", "Deadline Soon"], ["free-first", "Free First"], ["short-duration", "Short Duration"], ["institute-az", "Institute A-Z"]])
    ]);
}

function scholarshipFilterBar(items) {
    const f = recommendationFilters.scholarships;
    return filterBar("scholarships", [
        inputFilter("search", "Search scholarships", f.search),
        selectFilter("category", "Category", f.category, unique(items.map((i) => i.category))),
        selectFilter("supportType", "Support Type", f.supportType, unique(items.map((i) => i.supportType))),
        selectFilter("district", "District", f.district, unique(items.map((i) => i.district))),
        selectFilter("qualification", "Qualification", f.qualification, unique(items.map((i) => i.qualificationLevel))),
        selectFilter("matchLevel", "Match Level", f.matchLevel, ["Excellent Match", "Strong Match", "Good Match", "Possible Match", "Alternative Option"]),
        selectFilter("deadline", "Deadline", f.deadline, [["active", "Active / Check notice"], ["expired", "Verify Deadline"]]),
        selectFilter("sortBy", "Sort", f.sortBy, [["best-match", "Best Match"], ["deadline-soon", "Deadline Soon"], ["financial-first", "Financial Support First"], ["provider-az", "Provider A-Z"]])
    ]);
}

function mentorFilterBar(items) {
    const f = recommendationFilters.mentors;
    return filterBar("mentors", [
        inputFilter("search", "Search mentors", f.search),
        selectFilter("field", "Field / Expertise", f.field, unique(items.map((i) => i.mentorField))),
        selectFilter("mentorType", "Mentor Type", f.mentorType, unique(items.map((i) => i.mentorType))),
        selectFilter("language", "Language", f.language, unique(items.flatMap((i) => normalizeList(i.languages)))),
        selectFilter("mode", "Mentoring Mode", f.mode, unique(items.map((i) => i.mentoringMode))),
        selectFilter("availability", "Availability", f.availability, unique(items.map((i) => i.availabilityStatus))),
        selectFilter("matchLevel", "Match Level", f.matchLevel, ["Excellent Match", "Strong Match", "Good Match", "Available Mentor", "Limited Availability"]),
        selectFilter("sortBy", "Sort", f.sortBy, [["best-match", "Best Match"], ["most-experienced", "Most Experienced"], ["available-first", "Available First"], ["name-az", "Name A-Z"]])
    ]);
}

function filterBar(type, controls) {
    return `<div class="recommendation-filter-bar glass" data-filter-type="${type}">${controls.join("")}<button type="button" class="btn btn-outline btn-sm" data-clear-filters="${type}">Clear Filters</button></div>`;
}

function inputFilter(key, placeholder, value) {
    return `<input type="search" class="form-control" data-rec-filter="${key}" placeholder="${escapeAttr(placeholder)}" value="${escapeAttr(value)}">`;
}

function selectFilter(key, label, value, options) {
    const normalizedOptions = (options || []).filter(Boolean);
    return `<select class="form-control" data-rec-filter="${key}"><option value="">${escapeHtml(label)}</option>${normalizedOptions.map((option) => {
        const optionValue = Array.isArray(option) ? option[0] : option;
        const optionLabel = Array.isArray(option) ? option[1] : option;
        return `<option value="${escapeAttr(optionValue)}" ${String(value) === String(optionValue) ? "selected" : ""}>${escapeHtml(optionLabel)}</option>`;
    }).join("")}</select>`;
}

function bindRecommendationFilters(root, type) {
    root.querySelectorAll("[data-rec-filter]").forEach((field) => {
        field.addEventListener(field.type === "search" ? "input" : "change", () => {
            recommendationFilters[type][field.dataset.recFilter] = field.value;
            if (field.type === "search") {
                clearTimeout(recommendationFilterTimer);
                recommendationFilterTimer = setTimeout(() => renderRecommendationType(type), 250);
                return;
            }
            renderRecommendationType(type);
        });
    });
    root.querySelectorAll("[data-clear-filters]").forEach((button) => {
        button.addEventListener("click", () => {
            clearRecommendationFilters(button.dataset.clearFilters);
        });
    });
}

function renderRecommendationType(type) {
    if (type === "courses") renderCourses();
    if (type === "scholarships") renderScholarships();
    if (type === "mentors") renderMentors();
}

function filterChips(type) {
    const chips = Object.entries(recommendationFilters[type]).filter(([key, value]) => value && key !== "sortBy").map(([key, value]) => `<span class="filter-chip">${escapeHtml(labelizeFilter(key))}: ${escapeHtml(value)}</span>`);
    return chips.length ? `<div class="active-filter-chips">${chips.join("")}</div>` : "";
}

function clearRecommendationFilters(type) {
    Object.keys(recommendationFilters[type]).forEach((key) => {
        recommendationFilters[type][key] = key === "sortBy" ? "best-match" : "";
    });
    renderRecommendationType(type);
}

function applyCourseFilters(items) {
    const f = recommendationFilters.courses;
    let rows = items.filter((item) => {
        if (f.search && !normalize(`${item.courseName} ${item.instituteName} ${item.description}`).includes(normalize(f.search))) return false;
        if (f.category && normalize(item.category) !== normalize(f.category)) return false;
        if (f.district && normalize(item.district) !== normalize(f.district)) return false;
        if (f.mode && normalize(item.mode) !== normalize(f.mode)) return false;
        if (f.feeType && normalize(item.feeType) !== normalize(f.feeType)) return false;
        if (f.qualification && normalize(item.qualificationLevel) !== normalize(f.qualification)) return false;
        if (f.matchLevel && item.matchLevel !== f.matchLevel) return false;
        if (f.duration && normalize(item.duration) !== normalize(f.duration)) return false;
        return true;
    });
    return sortCourses(rows, f.sortBy);
}

function applyScholarshipFilters(items) {
    const f = recommendationFilters.scholarships;
    let rows = items.filter((item) => {
        if (f.search && !normalize(`${item.scholarshipName} ${item.provider} ${item.description}`).includes(normalize(f.search))) return false;
        if (f.category && normalize(item.category) !== normalize(f.category)) return false;
        if (f.supportType && normalize(item.supportType) !== normalize(f.supportType)) return false;
        if (f.district && normalize(item.district) !== normalize(f.district)) return false;
        if (f.qualification && normalize(item.qualificationLevel) !== normalize(f.qualification)) return false;
        if (f.matchLevel && item.matchLevel !== f.matchLevel) return false;
        if (f.deadline === "active" && !deadlineStatus(item.deadline).active) return false;
        if (f.deadline === "expired" && deadlineStatus(item.deadline).active) return false;
        return true;
    });
    return sortScholarships(rows, f.sortBy);
}

function applyMentorFilters(items) {
    const f = recommendationFilters.mentors;
    let rows = items.filter((item) => {
        if (f.search && !normalize(`${item.mentorName} ${item.mentorField} ${item.shortBio}`).includes(normalize(f.search))) return false;
        if (f.field && normalize(item.mentorField) !== normalize(f.field)) return false;
        if (f.mentorType && normalize(item.mentorType) !== normalize(f.mentorType)) return false;
        if (f.language && !includesAny(item.languages, [f.language])) return false;
        if (f.mode && normalize(item.mentoringMode) !== normalize(f.mode)) return false;
        if (f.availability && normalize(item.availabilityStatus) !== normalize(f.availability)) return false;
        if (f.matchLevel && item.matchLevel !== f.matchLevel) return false;
        return true;
    });
    return sortMentors(rows, f.sortBy);
}

function courseCard(course) {
    return `
        <article class="item-card glass recommendation-card">
            <div class="recommendation-card-media course-card-media">
                <img src="${escapeAttr(getCourseImage(course))}" alt="${escapeAttr(course.courseName || "Course image")}" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='images/course-placeholder.png';">
                <span class="course-card-category">${escapeHtml(course.category || "Course")}</span>
            </div>
            <span class="badge ${course.matchScore >= 75 ? "badge-success" : "badge-primary"}">${course.matchScore}% • ${escapeHtml(course.matchLevel)}</span>
            <h4>${escapeHtml(course.courseName)}</h4>
            <p class="institute"><i class="fas fa-university"></i> ${escapeHtml(course.instituteName)}</p>
            <div class="detail-list">
                ${mini("Category", course.category)}
                ${mini("Duration", course.duration)}
                ${mini("Mode", course.mode)}
                ${mini("Fee", [course.feeType, course.feeAmount].filter(Boolean).join(" - "))}
                ${mini("District", course.district)}
                ${mini("Qualification", course.qualificationLevel)}
            </div>
            <div class="why-matched"><strong>Why matched</strong><div class="tag-list">${tags(course.matchReasons)}</div></div>
            ${course.missingRequirements?.length ? `<p class="text-sm text-muted">${escapeHtml(course.missingRequirements.join(" • "))}</p>` : ""}
            <div class="card-actions">
                <button class="btn btn-outline btn-sm" data-view-course-detail="${escapeAttr(course.courseId)}">View Details</button>
                <button class="btn btn-primary btn-sm" data-save-course="${escapeAttr(course.courseId)}" data-score="${course.matchScore}">Save Course</button>
                ${course.applyLink ? `<a class="btn btn-outline btn-sm" href="${escapeAttr(course.applyLink)}" target="_blank" rel="noopener">Apply Link</a>` : ""}
            </div>
        </article>
    `;
}

function scholarshipCard(item) {
    return `
        <article class="list-item recommendation-card scholarship-recommendation-card">
            <div class="list-thumb">
                <img src="${escapeAttr(getScholarshipImage(item))}" alt="${escapeAttr(item.scholarshipName || "Scholarship image")}" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='images/scholarship-placeholder.png';">
            </div>
            <div class="list-content">
                <h4>${escapeHtml(item.scholarshipName)} <span class="badge ${item.matchScore >= 75 ? "badge-success" : "badge-primary"}">${item.matchScore}% • ${escapeHtml(item.matchLevel)}</span></h4>
                <p>${escapeHtml(item.provider)} • Deadline ${escapeHtml(item.deadline || "Check official notice")}</p>
                <div class="detail-list compact">
                    ${mini("Support", item.supportType)}
                    ${mini("Benefit", item.amountBenefit)}
                    ${mini("Qualification", item.qualificationLevel)}
                    ${mini("District", item.district)}
                </div>
                <div class="why-matched"><strong>Why matched</strong><div class="tag-list">${tags(item.matchReasons)}</div></div>
                ${item.warningNotes?.length ? `<p class="text-sm text-muted">${escapeHtml(item.warningNotes.join(" • "))}</p>` : ""}
            </div>
            <button class="btn btn-outline btn-sm" data-view-scholarship-detail="${escapeAttr(item.scholarshipId)}">View Details</button>
            <button class="btn btn-outline btn-sm" data-save-scholarship="${escapeAttr(item.scholarshipId)}" data-score="${item.matchScore}">Save Scholarship</button>
            ${item.applyLink ? `<a class="btn btn-primary btn-sm" href="${escapeAttr(item.applyLink)}" target="_blank" rel="noopener">Apply</a>` : ""}
        </article>
    `;
}

function mentorCard(mentor) {
    const status = mentorRequestStatus(mentor.mentorUid);
    return `
        <article class="item-card glass recommendation-card">
            <div class="mentor-head">
                ${mentor.photoURL ? `<img class="avatar-sm" src="${escapeAttr(mentor.photoURL)}" alt="">` : `<div class="avatar-sm avatar-fallback">${getInitials(mentor.mentorName)}</div>`}
                <div>
                    <h4>${escapeHtml(mentor.mentorName)}</h4>
                    <span class="badge badge-purple">${escapeHtml(mentor.matchLevel)} • ${mentor.matchScore}%</span>
                </div>
            </div>
            <div class="detail-list">
                ${mini("Field", mentor.mentorField)}
                ${mini("Role", mentor.currentRole)}
                ${mini("Organization", mentor.organization)}
                ${mini("Experience", mentor.yearsOfExperience)}
                ${mini("Languages", mentor.languages)}
                ${mini("Availability", mentor.availabilityNote)}
            </div>
            <div class="why-matched"><strong>Why matched</strong><div class="tag-list">${tags(mentor.matchReasons)}</div></div>
            <div class="card-actions">
                <button class="btn btn-outline btn-sm" data-view-mentor-detail="${escapeAttr(mentor.mentorUid)}">View Profile</button>
                <button class="btn btn-primary btn-sm req-mentor-btn" data-mentor-uid="${escapeAttr(mentor.mentorUid)}" ${status.disabled ? "disabled" : ""}>${escapeHtml(status.label)}</button>
            </div>
        </article>
    `;
}

function sortCourses(rows, sortBy) {
    const sorted = [...rows];
    if (sortBy === "newest") return sorted.sort((a, b) => getTimeValue(b.createdAt) - getTimeValue(a.createdAt));
    if (sortBy === "deadline-soon") return sorted.sort((a, b) => deadlineTime(a.applicationDeadline) - deadlineTime(b.applicationDeadline));
    if (sortBy === "free-first") return sorted.sort((a, b) => Number(textIncludesAny(`${b.feeType} ${b.feeAmount}`, ["free"])) - Number(textIncludesAny(`${a.feeType} ${a.feeAmount}`, ["free"])) || b.matchScore - a.matchScore);
    if (sortBy === "short-duration") return sorted.sort((a, b) => durationWeight(a.duration) - durationWeight(b.duration));
    if (sortBy === "institute-az") return sorted.sort((a, b) => a.instituteName.localeCompare(b.instituteName));
    return sorted.sort((a, b) => b.matchScore - a.matchScore);
}

function sortScholarships(rows, sortBy) {
    const sorted = [...rows];
    if (sortBy === "deadline-soon") return sorted.sort((a, b) => deadlineTime(a.deadline) - deadlineTime(b.deadline));
    if (sortBy === "financial-first") return sorted.sort((a, b) => Number(textIncludesAny(`${b.supportType} ${b.amountBenefit}`, ["scholarship", "financial", "free", "bursary"])) - Number(textIncludesAny(`${a.supportType} ${a.amountBenefit}`, ["scholarship", "financial", "free", "bursary"])) || b.matchScore - a.matchScore);
    if (sortBy === "provider-az") return sorted.sort((a, b) => a.provider.localeCompare(b.provider));
    return sorted.sort((a, b) => b.matchScore - a.matchScore);
}

function sortMentors(rows, sortBy) {
    const sorted = [...rows];
    if (sortBy === "most-experienced") return sorted.sort((a, b) => Number(b.yearsOfExperience || 0) - Number(a.yearsOfExperience || 0));
    if (sortBy === "available-first") return sorted.sort((a, b) => Number(availabilityMatches(["Flexible"], b)) - Number(availabilityMatches(["Flexible"], a)) || b.matchScore - a.matchScore);
    if (sortBy === "name-az") return sorted.sort((a, b) => a.mentorName.localeCompare(b.mentorName));
    return sorted.sort((a, b) => b.matchScore - a.matchScore);
}

function scheduleRecommendationSave() {
    clearTimeout(recommendationUpdateTimer);
    recommendationUpdateTimer = setTimeout(saveCurrentRecommendations, 700);
}

async function saveCurrentRecommendations() {
    if (!state.uid || !state.currentResultId || !state.currentResult) return;
    const courses = Object.entries(state.courses || {}).filter(([, item]) => normalize(item.status) === "active").map(([id, item]) => courseMatch(id, item)).sort((a, b) => b.matchScore - a.matchScore).slice(0, 10);
    const scholarships = Object.entries(state.scholarships || {}).filter(([, item]) => normalize(item.status) === "active").map(([id, item]) => scholarshipMatch(id, item)).sort((a, b) => b.matchScore - a.matchScore).slice(0, 8);
    const mentors = Object.entries(state.mentors || {}).filter(([, item]) => isApprovedActiveMentor(item)).map(([id, item]) => mentorMatch(id, item)).sort((a, b) => b.matchScore - a.matchScore).slice(0, 8);
    const nextSignature = recommendationSignature(courses, scholarships, mentors);
    const currentSignature = recommendationSignature(state.currentResult.courseMatches || [], state.currentResult.scholarshipMatches || [], state.currentResult.mentorMatches || []);
    if (nextSignature === currentSignature) return;
    await update(ref(database, `pathwayResults/${state.uid}/${state.currentResultId}`), {
        courseMatches: sanitizeForWrite(courses),
        scholarshipMatches: sanitizeForWrite(scholarships),
        mentorMatches: sanitizeForWrite(mentors),
        recommendedCourseIds: courses.map((item) => item.courseId),
        recommendedScholarshipIds: scholarships.map((item) => item.scholarshipId),
        recommendedMentorIds: mentors.map((item) => item.mentorUid),
        recommendationsUpdatedAt: serverTimestamp()
    }).catch((error) => console.error("Recommendation update failed:", error));
}

function recommendationSignature(courses = [], scholarships = [], mentors = []) {
    const coursePart = courses.map((item) => `${item.courseId}:${item.matchScore}`).join("|");
    const scholarshipPart = scholarships.map((item) => `${item.scholarshipId}:${item.matchScore}`).join("|");
    const mentorPart = mentors.map((item) => `${item.mentorUid}:${item.matchScore}`).join("|");
    return `${coursePart}::${scholarshipPart}::${mentorPart}`;
}

function courseDetailHtml(courseId) {
    const match = courseMatch(courseId, state.courses[courseId] || {});
    return detailGrid({
        "Course Name": match.courseName,
        "Institute": match.instituteName,
        "Category": match.category,
        "Duration": match.duration,
        "Mode": match.mode,
        "Fee Type": match.feeType,
        "Fee Amount": match.feeAmount,
        "District": match.district,
        "Qualification": match.qualificationLevel,
        "Eligibility": match.eligibility,
        "Application Deadline": match.applicationDeadline || "Check official notice",
        "Match": `${match.matchScore}% - ${match.matchLevel}`,
        "Why Matched": match.matchReasons.join(", "),
        "Missing / Verify": match.missingRequirements.join(", ") || "N/A"
    });
}

function scholarshipDetailHtml(id) {
    const match = scholarshipMatch(id, state.scholarships[id] || {});
    return detailGrid({
        "Scholarship": match.scholarshipName,
        "Provider": match.provider,
        "Provider Type": match.providerType,
        "Category": match.category,
        "Support Type": match.supportType,
        "Amount / Benefit": match.amountBenefit,
        "District": match.district,
        "Qualification": match.qualificationLevel,
        "Eligibility": match.eligibility,
        "Deadline": match.deadline || "Check official notice",
        "Match": `${match.matchScore}% - ${match.matchLevel}`,
        "Why Matched": match.matchReasons.join(", "),
        "Warnings": match.warningNotes.join(", ")
    });
}

function mentorDetailHtml(uid) {
    const match = mentorMatch(uid, state.mentors[uid] || {});
    return detailGrid({
        "Mentor": match.mentorName,
        "Field": match.mentorField,
        "Mentor Type": match.mentorType,
        "Current Role": match.currentRole,
        "Organization": match.organization,
        "Experience": match.yearsOfExperience,
        "Languages": displayValue(match.languages),
        "Guidance Areas": displayValue(match.guidanceAreas),
        "Mentoring Mode": match.mentoringMode,
        "Availability": match.availabilityNote,
        "Short Bio": match.shortBio,
        "Match": `${match.matchScore}% - ${match.matchLevel}`,
        "Why Matched": match.matchReasons.join(", ")
    });
}

function openRecommendationDetail(title, bodyHtml) {
    let modal = document.getElementById("recommendation-detail-modal");
    if (!modal) {
        modal = document.createElement("div");
        modal.id = "recommendation-detail-modal";
        modal.className = "modal-overlay hidden";
        document.body.appendChild(modal);
    }
    modal.innerHTML = `<div class="modal-card recommendation-detail-card"><div class="modal-header"><h3>${escapeHtml(title)}</h3><button type="button" class="modal-close" id="recommendation-detail-close" aria-label="Close">&times;</button></div><div class="modal-body">${bodyHtml}</div></div>`;
    modal.classList.remove("hidden");
    document.getElementById("recommendation-detail-close")?.addEventListener("click", () => modal.classList.add("hidden"));
}

function detailGrid(data) {
    return `<div class="detail-grid recommendation-detail-grid">${Object.entries(data).map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(displayValue(value))}</strong></div>`).join("")}</div>`;
}

function mentorRequestStatus(mentorUid) {
    const request = Object.values(state.mentorRequests || {}).find((item) => item.mentorUid === mentorUid);
    if (!request) return { label: "Request Mentor", disabled: false };
    const status = normalize(request.status || "pending");
    if (status === "pending") return { label: "Pending Request", disabled: true };
    if (status === "accepted") return { label: "Connected", disabled: true };
    if (status === "rejected") return { label: "Request Again", disabled: false };
    return { label: formatStatus(status), disabled: ["cancelled", "completed"].includes(status) };
}

function getMatchLevel(score) {
    if (score >= 90) return "Excellent Match";
    if (score >= 75) return "Strong Match";
    if (score >= 60) return "Good Match";
    if (score >= 40) return "Possible Match";
    return "Alternative Option";
}

function mentorAvailabilityLevel(score, mentor) {
    if (!availabilityMatches(["Flexible"], mentor) && score < 60) return "Limited Availability";
    if (score >= 90) return "Excellent Match";
    if (score >= 75) return "Strong Match";
    if (score >= 60) return "Good Match";
    return "Available Mentor";
}

function educationMatches(level, item) {
    const text = `${item.qualificationLevel || ""} ${item.educationLevel || ""} ${item.eligibility || ""} ${item.description || ""}`;
    const value = normalize(level);
    if (value.includes("after o/l")) return textIncludesAny(text, ["after o/l", "o/l completed", "nvq", "certificate", "foundation", "beginner"]);
    if (value.includes("after a/l") || value.includes("currently doing a/l")) return textIncludesAny(text, ["after a/l", "diploma", "degree", "undergraduate", "foundation degree", "a/l"]);
    if (value.includes("undergraduate")) return textIncludesAny(text, ["advanced", "professional", "skill development", "career development", "undergraduate"]);
    if (value.includes("job seeker") || value.includes("working")) return textIncludesAny(text, ["short course", "professional qualification", "part-time", "online", "skill development", "career development"]);
    if (value.includes("not sure")) return textIncludesAny(text, ["beginner", "foundation", "certificate", "english", "it basics", "career"]);
    return includesAny(text, [level]);
}

function modeMatches(studentMode, itemMode) {
    const student = normalize(studentMode);
    const mode = normalize(itemMode);
    if (!student || !mode) return false;
    if (student === "flexible") return ["online", "hybrid", "self-paced", "part-time"].some((item) => mode.includes(item));
    if (student === "self-paced") return mode.includes("self") || mode.includes("online");
    return mode.includes(student) || student.includes(mode);
}

function locationMatches(studentDistricts, itemDistrict) {
    const location = normalize(itemDistrict);
    if (!location) return false;
    if (["islandwide", "all island", "sri lanka", "online", "remote"].some((item) => location.includes(item))) return true;
    return includesAny(location, studentDistricts);
}

function budgetMatches(profile, course) {
    const budget = normalize(`${profile.financialSupport || ""} ${profile.budgetRange || ""}`);
    const fee = normalize(`${course.feeType || ""} ${course.feeAmount || ""} ${course.installments || ""}`);
    if (!budget || !fee) return false;
    if (budget.includes("free")) return fee.includes("free");
    if (budget.includes("scholarship")) return textIncludesAny(fee, ["scholarship", "free", "low"]);
    if (budget.includes("low") || budget.includes("below")) return textIncludesAny(fee, ["free", "low", "10000", "below"]);
    if (budget.includes("moderate")) return textIncludesAny(fee, ["paid", "low", "scholarship", "installment"]);
    if (budget.includes("installment")) return textIncludesAny(fee, ["installment", "paid"]);
    return true;
}

function availabilityMatches(studentTimes, mentor) {
    const availability = `${mentor.availableDays || ""} ${mentor.availableTime || ""} ${mentor.availabilityStatus || ""} ${mentor.availability || ""}`;
    if (textIncludesAny(availability, ["active", "available", "flexible"])) return true;
    return includesAny(availability, studentTimes);
}

function deadlineStatus(value) {
    if (!value || /check|official|notice/i.test(String(value))) return { active: true, warning: "Verify latest deadline before applying." };
    const time = getTimeValue(value);
    if (!time) return { active: true, warning: "Verify latest deadline before applying." };
    if (time < Date.now()) return { active: false, warning: "Verify Deadline. The listed date may have passed." };
    return { active: true, warning: "" };
}

function deadlineTime(value) {
    return getTimeValue(value) || Number.MAX_SAFE_INTEGER;
}

function durationWeight(value) {
    const text = normalize(value);
    if (text.includes("short")) return 1;
    const months = Number(text.match(/(\d+)\s*month/)?.[1] || 0);
    if (months) return months;
    const years = Number(text.match(/(\d+)\s*year/)?.[1] || 0);
    if (years) return years * 12;
    return 999;
}

function unique(values) {
    return [...new Set((values || []).flatMap((value) => Array.isArray(value) ? value : [value]).map((value) => String(value || "").trim()).filter((value) => value && value !== "N/A"))].sort();
}

function labelizeFilter(key) {
    return key.replace(/([A-Z])/g, " $1").replace(/^./, (char) => char.toUpperCase());
}

function displayValue(value) {
    if (Array.isArray(value)) return value.join(", ") || "N/A";
    if (value && typeof value === "object") return Object.values(value).join(", ") || "N/A";
    return hasValue(value) ? String(value) : "N/A";
}


async function requestMentor(mentorUid) {
    const mentor = state.mentors[mentorUid];
    if (!mentor) return;
    if (!isAccountActive(state.user)) {
        showToast("Your account is not active. Please contact EduPath Support.", "error");
        return;
    }
    if (!isApprovedActiveMentor(mentor)) {
        showToast("This mentor is not available for requests right now.", "error");
        return;
    }
    const [mentorSnap, userSnap] = await Promise.all([
        get(ref(database, `mentors/${mentorUid}`)),
        get(ref(database, `users/${mentorUid}`)).catch(() => null)
    ]);
    const latestMentor = mentorSnap.val() || {};
    const latestUser = userSnap?.val?.() || {};
    if (!isApprovedActiveMentor({ ...latestUser, ...latestMentor, accountStatus: latestUser.accountStatus || latestMentor.accountStatus })) {
        showToast("This mentor is not currently available for mentoring.", "error");
        return;
    }
    if (!state.currentResult) {
        showToast("Complete Pathway Finder to request a suitable mentor.", "error");
        return;
    }

    const duplicate = Object.values(state.mentorRequests || {}).find((request) => (
        request.mentorUid === mentorUid && ["pending", "accepted"].includes((request.status || "").toLowerCase())
    ));
    if (duplicate) {
        showToast("You already have an active request with this mentor.", "error");
        return;
    }

    const message = await openMentorRequestModal(mentorUid, mentor);
    if (message === null) return;
    const requestMessage = message.trim() || "I would like your guidance for my education and career pathway.";
    const notificationRef = push(ref(database, `notifications/${mentorUid}`));
    const logRef = push(ref(database, "activityLogs"));
    const requestRef = push(ref(database, "mentorRequests"));
    const studentName = state.user.fullName || state.student.fullName || "Student";
    const updates = {};
    updates[`mentorRequests/${requestRef.key}`] = {
        requestId: requestRef.key,
        studentUid: state.uid,
        studentName,
        studentEmail: state.user.email || state.student.email || auth.currentUser?.email || "",
        studentPhone: state.user.phone || state.student.phone || "",
        mentorUid,
        mentorName: mentor.fullName || "Mentor",
        mentorEmail: mentor.email || "",
        mentorField: mentor.field || mentor.mentoringField || "",
        pathwayResultId: state.currentResultId,
        pathwaySnapshot: sanitizeForWrite(state.currentResult),
        message: requestMessage,
        status: "pending",
        acceptedAt: null,
        rejectedAt: null,
        rejectionReason: "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    };
    updates[`notifications/${mentorUid}/${notificationRef.key}`] = {
        notificationId: notificationRef.key,
        type: "mentor_request",
        title: "New Mentor Request",
        message: `${studentName} requested your guidance.`,
        messagePreview: requestMessage,
        relatedRequestId: requestRef.key,
        studentUid: state.uid,
        read: false,
        status: "unread",
        createdAt: serverTimestamp()
    };
    updates[`activityLogs/${logRef.key}`] = {
        logId: logRef.key,
        uid: state.uid,
        userName: studentName,
        userRole: "student",
        actionType: "mentor_request_created",
        description: `${studentName} requested ${mentor.fullName || "a mentor"}`,
        relatedEntityType: "mentorRequest",
        relatedEntityId: requestRef.key,
        createdAt: serverTimestamp()
    };
    await update(ref(database), updates);
    showToast(`Mentorship request sent to ${mentor.fullName || "mentor"}.`, "success");
}

function openMentorRequestModal(mentorUid, mentor = {}) {
    return new Promise((resolve) => {
        let modal = document.getElementById("mentor-request-modal");
        const studentName = state.user.fullName || state.student.fullName || "Student";
        const summary = state.currentResult?.recommendationSummary || state.currentResult?.recommendedPathway || "Latest pathway summary unavailable.";
        if (!modal) {
            modal = document.createElement("div");
            modal.id = "mentor-request-modal";
            modal.className = "modal-overlay hidden";
            document.body.appendChild(modal);
        }
        modal.innerHTML = `
            <div class="modal-card mentor-request-card">
                <div class="modal-header">
                    <h3>Request Mentor</h3>
                    <button type="button" class="modal-close" data-close-mentor-request aria-label="Close">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="detail-grid recommendation-detail-grid">
                        <div><span>Mentor</span><strong>${escapeHtml(mentor.fullName || "Mentor")}</strong></div>
                        <div><span>Field</span><strong>${escapeHtml(mentor.field || mentor.mentoringField || mentor.expertise || "N/A")}</strong></div>
                        <div><span>Student</span><strong>${escapeHtml(studentName)}</strong></div>
                        <div><span>Pathway</span><strong>${escapeHtml(state.currentResult?.recommendedPathway || "N/A")}</strong></div>
                    </div>
                    <label class="form-label" for="mentor-request-message">Message</label>
                    <textarea id="mentor-request-message" class="form-control" rows="5">${escapeHtml("I would like your guidance for my education and career pathway.")}</textarea>
                    <p class="text-sm text-muted"><strong>Latest pathway summary:</strong> ${escapeHtml(summary)}</p>
                </div>
                <div class="modal-actions">
                    <button type="button" class="btn btn-outline" data-close-mentor-request>Cancel</button>
                    <button type="button" class="btn btn-primary" data-submit-mentor-request="${escapeAttr(mentorUid)}">Send Request</button>
                </div>
            </div>
        `;
        const close = (value) => {
            modal.classList.add("hidden");
            resolve(value);
        };
        modal.classList.remove("hidden");
        modal.querySelectorAll("[data-close-mentor-request]").forEach((button) => button.addEventListener("click", () => close(null), { once: true }));
        modal.querySelector("[data-submit-mentor-request]")?.addEventListener("click", () => {
            const value = document.getElementById("mentor-request-message")?.value.trim() || "I would like your guidance for my education and career pathway.";
            close(value);
        }, { once: true });
    });
}

function renderMentorRequests() {
    const container = document.getElementById("mentor-requests-list");
    if (!container) return;
    const requests = Object.entries(state.mentorRequests || {}).sort(([, a], [, b]) => getTimeValue(b.createdAt) - getTimeValue(a.createdAt));
    if (!requests.length) {
        container.innerHTML = emptyBlock("No mentor requests yet.");
        return;
    }

    container.innerHTML = requests.map(([id, request]) => {
        const mentor = state.mentors[request.mentorUid] || {};
        return `
            <article class="list-item">
                ${mentor.photoURL ? `<img class="avatar-sm" src="${escapeAttr(mentor.photoURL)}" alt="">` : `<div class="list-icon bg-purple"><i class="fas fa-user-tie"></i></div>`}
                <div class="list-content">
                    <h4>${escapeHtml(request.mentorName || mentor.fullName || "Mentor")}</h4>
                    <p>${escapeHtml(request.mentorField || mentor.field || "Field not specified")} • ${formatDate(request.createdAt)}</p>
                    <span class="badge badge-primary">${escapeHtml(request.status || "pending")}</span>
                    <p>${escapeHtml(request.message || "")}</p>
                </div>
                ${mentor.uid || request.mentorUid ? `<a class="btn btn-outline btn-sm" href="mentors.html?mentor=${encodeURIComponent(request.mentorUid || "")}">View Mentor</a>` : ""}
                ${mentorRequestAction(id, request)}
            </article>
        `;
    }).join("");

    container.querySelectorAll("[data-cancel-request]").forEach((button) => {
        button.addEventListener("click", () => update(ref(database, `mentorRequests/${button.dataset.cancelRequest}`), {
            status: "cancelled",
            updatedAt: serverTimestamp()
        }));
    });
}

function mentorRequestAction(id, request) {
    const status = (request.status || "pending").toLowerCase();
    if (status === "pending") return `<button class="btn btn-outline btn-sm" data-cancel-request="${escapeAttr(id)}">Cancel Request</button>`;
    if (status === "accepted") return `<span class="badge badge-success">Connected</span>`;
    if (status === "rejected") return `<button class="btn btn-primary btn-sm dashboard-jump" data-section="mentors-section">Find Another Mentor</button>`;
    if (status === "completed") return `<span class="badge badge-cyan">Feedback coming soon</span>`;
    return "";
}

function renderConnectedMentors() {
    const container = document.getElementById("connected-mentors-list");
    if (!container) return;
    const rows = Object.entries(state.connectedMentors || {}).filter(([, item]) => normalize(item.status) === "connected");
    if (!rows.length) {
        container.innerHTML = emptyBlock("No connected mentors yet. Request a suitable mentor from your recommendations.");
        return;
    }
    container.innerHTML = rows.map(([mentorUid, connection]) => {
        const mentor = state.mentors[mentorUid] || {};
        const conversationId = mentorConversationId(mentorUid, state.uid);
        const unread = Number(state.mentorConversations[conversationId]?.unreadByStudent || 0);
        const name = connection.mentorName || mentor.fullName || "Mentor";
        return `
            <article class="item-card glass">
                <div class="mentor-head">
                    ${connection.mentorPhotoURL || mentor.photoURL ? `<img class="avatar-sm" src="${escapeAttr(connection.mentorPhotoURL || mentor.photoURL)}" alt="">` : `<div class="avatar-sm avatar-fallback">${getInitials(name)}</div>`}
                    <div>
                        <h4>${escapeHtml(name)}</h4>
                        <span class="badge badge-success">Connected${unread ? ` • ${unread} new` : ""}</span>
                    </div>
                </div>
                <div class="detail-list">
                    ${mini("Field", connection.mentorField || mentor.field || mentor.mentoringField)}
                    ${mini("Organization", mentor.universityOrCompany || mentor.organization)}
                    ${mini("Languages", mentor.languages || mentor.language || mentor.preferredLanguage)}
                    ${mini("Availability", mentor.availability || mentor.availableTime || mentor.availabilityStatus)}
                    ${mini("Connected", formatDate(connection.connectedAt))}
                </div>
                <div class="card-actions">
                    <button class="btn btn-primary btn-sm" data-message-mentor="${escapeAttr(mentorUid)}">Message Mentor</button>
                    <button class="btn btn-secondary btn-sm" data-book-session="${escapeAttr(mentorUid)}">Book Session</button>
                    <a class="btn btn-outline btn-sm" href="mentors.html?mentor=${encodeURIComponent(mentorUid)}">View Profile</a>
                </div>
            </article>
        `;
    }).join("");
}

function renderMentorMessages() {
    const container = document.getElementById("mentor-messages-list");
    if (!container) return;
    const conversations = Object.entries(state.mentorConversations || {})
        .sort(([, a], [, b]) => getTimeValue(b.lastMessageAt || b.updatedAt) - getTimeValue(a.lastMessageAt || a.updatedAt));
    if (!conversations.length) {
        container.innerHTML = emptyBlock("Your mentor conversations will appear here after a request is accepted.");
        return;
    }

    container.innerHTML = conversations.map(([conversationId, conversation]) => {
        const mentorUid = conversation.mentorUid || conversationId.replace(/^mentor_/, "").replace(`_${state.uid}`, "");
        const connection = state.connectedMentors[mentorUid] || {};
        const mentor = state.mentors[mentorUid] || {};
        const name = conversation.mentorName || connection.mentorName || mentor.fullName || "Mentor";
        return `
            <article class="list-item">
                ${connection.mentorPhotoURL || mentor.photoURL ? `<img class="avatar-sm" src="${escapeAttr(connection.mentorPhotoURL || mentor.photoURL)}" alt="">` : `<div class="list-icon bg-blue"><i class="fas fa-comments"></i></div>`}
                <div class="list-content">
                    <h4>${escapeHtml(name)}</h4>
                    <p>${escapeHtml(conversation.lastMessage || "No messages yet.")}</p>
                    <span class="text-sm text-muted">${formatDateTime(conversation.lastMessageAt || conversation.updatedAt)}</span>
                    ${Number(conversation.unreadByStudent || 0) ? `<span class="badge badge-primary">${Number(conversation.unreadByStudent || 0)} unread</span>` : ""}
                </div>
                <button class="btn btn-primary btn-sm" data-message-mentor="${escapeAttr(mentorUid)}">Open Chat</button>
            </article>
        `;
    }).join("");

}

function renderMentorSessions() {
    const bookContainer = document.getElementById("book-session-list");
    const pendingContainer = document.getElementById("pending-sessions-list");
    const upcomingContainer = document.getElementById("upcoming-sessions-list");
    const completedContainer = document.getElementById("completed-sessions-list");
    if (!bookContainer && !pendingContainer && !upcomingContainer && !completedContainer) return;

    const connected = Object.entries(state.connectedMentors || {}).filter(([, item]) => normalize(item.status) === "connected");
    renderMentorSessionHero(connected);
    if (bookContainer) {
        bookContainer.innerHTML = connected.length ? connected.map(([mentorUid, connection]) => `
            <article class="session-item session-book-card">
                <div class="session-date-tile blue"><i class="fas fa-calendar-plus"></i></div>
                <div class="session-main">
                    <span class="session-status-pill accepted">CONNECTED MENTOR</span>
                    <h4>${escapeHtml(connection.mentorName || state.mentors[mentorUid]?.fullName || "Mentor")}</h4>
                    <p>${escapeHtml(connection.mentorField || state.mentors[mentorUid]?.field || "Mentor guidance")}</p>
                </div>
                <div class="session-actions"><button class="btn btn-primary btn-sm" data-book-session="${escapeAttr(mentorUid)}">Book Session</button></div>
            </article>
        `).join("") : emptyBlock("Appointment scheduling will appear here after connecting with a mentor.");
    }

    const appointments = Object.entries(state.mentorAppointments || {});
    const pendingRows = filterSessionRows(appointments, ["pending", "requested"]);
    const upcomingRows = filterSessionRows(appointments, ["accepted", "upcoming", "scheduled", "confirmed"]);
    const completedRows = filterSessionRows(appointments, ["completed", "done"]);
    const rejectedRows = filterSessionRows(appointments, ["rejected", "cancelled"]);
    setText("session-tab-pending", pendingRows.length);
    setText("session-tab-upcoming", upcomingRows.length);
    setText("session-tab-completed", completedRows.length);
    setText("session-tab-rejected", rejectedRows.length);
    renderSessionBucket(pendingContainer, pendingRows, ["pending", "requested"], "No pending sessions.");
    renderSessionBucket(upcomingContainer, upcomingRows, ["accepted", "upcoming", "scheduled", "confirmed"], "No upcoming sessions.");
    renderSessionBucket(completedContainer, completedRows, ["completed", "done"], "No completed sessions.");
    renderSessionBucket(document.getElementById("rejected-sessions-list"), rejectedRows, ["rejected", "cancelled"], "No rejected or cancelled sessions.");
}

function renderMentorSessionHero(connected = []) {
    const summary = document.getElementById("session-mentor-summary-card");
    const bookButton = document.getElementById("session-hero-book-btn");
    if (!summary || !bookButton) return;
    if (!connected.length) {
        bookButton.dataset.dashboardAction = "explore-mentors";
        bookButton.removeAttribute("data-book-session");
        bookButton.textContent = "Find a Mentor";
        summary.innerHTML = `<div class="empty-state compact"><i class="fas fa-user-tie"></i><p>Connect with a mentor to start booking sessions.</p></div>`;
        return;
    }
    const [mentorUid, connection] = connected[0];
    const mentor = state.mentors[mentorUid] || {};
    const availability = mentor.availability || mentor.availableTime || mentor.availabilityStatus || "Availability varies";
    bookButton.removeAttribute("data-dashboard-action");
    bookButton.dataset.bookSession = mentorUid;
    bookButton.textContent = "Book New Session";
    const name = connection.mentorName || mentor.fullName || "Your Mentor";
    summary.innerHTML = `
        <div class="session-mentor-head">
            ${connection.mentorPhotoURL || mentor.photoURL ? `<img src="${escapeAttr(connection.mentorPhotoURL || mentor.photoURL)}" alt="${escapeAttr(name)}">` : `<div class="mentor-photo"><i class="fas fa-user-tie"></i></div>`}
            <div><span>Your Mentor</span><strong>${escapeHtml(name)}</strong><small>${escapeHtml(connection.mentorField || mentor.field || mentor.mentoringField || "Mentor guidance")}</small></div>
            <a class="btn btn-outline btn-sm" href="mentors.html?mentor=${encodeURIComponent(mentorUid)}">View Profile</a>
        </div>
        <div class="session-mentor-meta">
            <span><i class="far fa-clock"></i><strong>60 min</strong><small>Session Duration</small></span>
            <span><i class="fas fa-laptop"></i><strong>${escapeHtml(mentor.mentoringMode || "Online")}</strong><small>Session Mode</small></span>
            <span><i class="far fa-calendar"></i><strong>${escapeHtml(availability)}</strong><small>Available Days</small></span>
        </div>
    `;
}

function filterSessionRows(appointments, statuses) {
    return appointments
        .filter(([, item]) => statuses.includes(normalize(item.status)))
        .sort(([, a], [, b]) => getTimeValue(a.sessionAt || a.date || a.createdAt) - getTimeValue(b.sessionAt || b.date || b.createdAt));
}

function renderSessionBucket(container, rows, statuses, emptyMessage) {
    if (!container) return;
    if (!rows.length) {
        container.innerHTML = emptyBlock(emptyMessage || "No mentor sessions scheduled yet.");
        return;
    }
    container.innerHTML = rows.map(([id, session]) => sessionCardHtml(id, session)).join("");
}

function sessionCardHtml(id, session) {
    const status = normalize(session.status || "pending");
    const statusClass = status === "accepted" ? "accepted" : status === "completed" ? "completed" : status === "rejected" || status === "cancelled" ? "rejected" : "pending";
    const date = session.date ? new Date(`${session.date}T00:00:00`) : null;
    const month = date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString(undefined, { month: "short" }) : "TBD";
    const day = date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString(undefined, { day: "2-digit" }) : "--";
    const fullDate = date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString(undefined, { weekday: "long", day: "2-digit", month: "short", year: "numeric" }) : "Date pending";
    return `
        <article class="session-item session-status-card ${statusClass}">
            <div class="session-date-tile ${statusClass}">
                <i class="fas ${statusClass === "pending" ? "fa-calendar-days" : statusClass === "accepted" ? "fa-calendar-check" : statusClass === "completed" ? "fa-calendar-check" : "fa-calendar-xmark"}"></i>
                <strong>${escapeHtml(day)}</strong>
                <span>${escapeHtml(month)}</span>
            </div>
            <div class="session-main">
                <span class="session-status-pill ${statusClass}">${escapeHtml(status === "accepted" ? "Accepted" : formatStatus(session.status || "pending"))}</span>
                <h4>${escapeHtml(session.topic || session.note || "Mentor Session")}</h4>
                <p>${escapeHtml(session.message || session.rejectionReason || "Review your education path and next steps with your mentor.")}</p>
            </div>
            <div class="session-time">
                <strong>${escapeHtml(fullDate)}</strong>
                <span><i class="far fa-clock"></i> ${escapeHtml(formatTimeLabel(session.startTime))} - ${escapeHtml(formatTimeLabel(session.endTime))}</span>
                ${statusClass === "accepted" ? `<a class="session-link" href="${escapeAttr(calendarLinkForSession(session))}" target="_blank" rel="noopener"><i class="far fa-calendar-plus"></i> Add to Calendar</a>` : ""}
            </div>
            <div class="session-meta">
                <span><small>Type</small><strong><i class="fas fa-circle"></i> ${escapeHtml(session.mode || "Online Session")}</strong></span>
                <span><small>Duration</small><strong>${escapeHtml(session.duration || "60 Minutes")}</strong></span>
            </div>
            <div class="session-actions">
                ${statusClass === "pending" ? `<button class="btn btn-outline btn-sm danger-outline" data-cancel-appointment="${escapeAttr(id)}">Cancel Request</button>` : ""}
                ${statusClass === "accepted" && (session.meetingLink || session.joinLink) ? `<a class="btn btn-primary btn-sm" href="${escapeAttr(session.meetingLink || session.joinLink)}" target="_blank" rel="noopener"><i class="fas fa-video"></i> Join Session</a>` : ""}
                ${statusClass === "accepted" ? `<button class="btn btn-outline btn-sm" data-message-mentor="${escapeAttr(session.mentorUid)}"><i class="fas fa-envelope"></i> Message Mentor</button>` : ""}
                ${statusClass === "completed" ? `<button class="btn btn-outline btn-sm" data-view-session-summary="${escapeAttr(id)}"><i class="fas fa-file-lines"></i> View Summary</button>` : ""}
                ${statusClass === "rejected" ? `<button class="btn btn-outline btn-sm" data-book-session="${escapeAttr(session.mentorUid)}">Book Again</button>` : ""}
                ${statusClass === "cancelled" ? `<button class="btn btn-outline btn-sm" data-book-session="${escapeAttr(session.mentorUid)}">Book Again</button>` : ""}
                </div>
            </div>
        </article>
    `;
}

function calendarLinkForSession(session = {}) {
    const start = calendarDateToken(session.date, session.startTime);
    const end = calendarDateToken(session.date, session.endTime);
    const title = encodeURIComponent(session.topic || "Mentor Session");
    const details = encodeURIComponent(session.message || "EduPath Lanka mentor session");
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${start}/${end}&details=${details}&ctz=Asia/Colombo`;
}

function calendarDateToken(date = "", time = "00:00") {
    const cleanDate = String(date || dateKeyLocal()).replaceAll("-", "");
    const cleanTime = String(time || "00:00").replace(":", "").padEnd(4, "0");
    return `${cleanDate}T${cleanTime}00`;
}

function sessionSummaryHtml(session = {}) {
    return detailGrid({
        "Session": session.topic || "Mentor Session",
        "Mentor": session.mentorName || "Mentor",
        "Date": session.date || "N/A",
        "Time": `${formatTimeLabel(session.startTime)} - ${formatTimeLabel(session.endTime)}`,
        "Mode": session.mode || "Online Session",
        "Status": formatStatus(session.status || "completed"),
        "Message": session.message || "N/A",
        "Completed Note": session.completedNote || "No summary note added yet."
    });
}

async function openBookingModalSafe(mentorUid, clickedButton = null) {
    const originalHtml = clickedButton?.innerHTML;
    try {
        if (!state.uid) return showToast("Please sign in again.", "error");
        if (!mentorUid) {
            console.error("Book Session button missing mentor UID", clickedButton);
            return showToast("Mentor information is missing. Please refresh and try again.", "error");
        }
        const connection = state.connectedMentors?.[mentorUid];
        if (!connection || normalize(connection.status) !== "connected") {
            return showToast("You need to connect with a mentor before booking a session.", "error");
        }
        if (clickedButton) {
            clickedButton.disabled = true;
            clickedButton.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Opening...`;
        }
        await openBookingModal(mentorUid);
    } catch (error) {
        console.error("[Appointment] Error", error);
        closeBookingModal();
        const code = error?.code || "";
        if (code === "PERMISSION_DENIED" || code === "permission-denied") {
            showToast("Appointment data could not be loaded because access is restricted.", "error");
        } else {
            showToast("Could not open the appointment calendar. Please try again.", "error");
        }
    } finally {
        if (clickedButton) {
            clickedButton.disabled = false;
            clickedButton.innerHTML = originalHtml;
        }
    }
}

async function openBookingModal(mentorUid) {
    if (!state.uid) throw new Error("Student is not signed in.");
    if (!mentorUid) throw new Error("Mentor UID is missing.");
    const [connectionSnap, mentorSnap, availabilitySnap, appointmentsSnap] = await Promise.all([
        get(ref(database, `studentMentors/${state.uid}/${mentorUid}`)),
        get(ref(database, `mentors/${mentorUid}`)),
        get(ref(database, `mentorAvailability/${mentorUid}`)),
        get(query(ref(database, "mentorAppointments"), orderByChild("mentorUid"), equalTo(mentorUid)))
    ]);
    const connection = connectionSnap.val();
    if (!connection || normalize(connection.status) !== "connected") {
        throw new Error("Student and mentor are not connected.");
    }
    const mentor = mentorSnap.val() || state.mentors[mentorUid] || {};
    const availability = availabilitySnap.val() || {};
    const mentorAppointments = appointmentsSnap.val() || {};
    appointmentDebug("[Appointment] Book button clicked", mentorUid);
    appointmentDebug("[Appointment] Connection", connection);
    appointmentDebug("[Appointment] Availability loaded", availability);
    appointmentDebug("[Appointment] Existing appointments", mentorAppointments);
    state.activeBooking = {
        mentorUid,
        connection,
        mentor,
        availability,
        mentorAppointments,
        calendarDate: new Date(),
        selectedDate: "",
        selectedSlot: null
    };
    ensureBookingModal();
    renderBookingModal();
    const modal = document.getElementById("session-booking-modal");
    if (!modal) throw new Error("Booking modal was not created.");
    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    modal.querySelector(".modal-close")?.focus();
}

function ensureBookingModal() {
    if (document.getElementById("session-booking-modal")) return;
    document.body.insertAdjacentHTML("beforeend", `
        <div id="session-booking-modal" class="modal-overlay hidden" aria-hidden="true">
            <div class="modal-card booking-modal-card">
                <div class="modal-header">
                    <div>
                        <h3 id="booking-modal-title">Book Session</h3>
                        <p id="booking-modal-subtitle" class="text-muted"></p>
                    </div>
                    <button type="button" class="modal-close" id="booking-modal-close" aria-label="Close">&times;</button>
                </div>
                <div class="booking-modal-grid">
                    <div>
                        <div id="booking-mentor-summary" class="booking-summary"></div>
                        <div class="booking-calendar-header">
                            <button type="button" id="booking-prev-month" class="calendar-nav"><i class="fas fa-chevron-left"></i></button>
                            <h4 id="booking-calendar-title">Choose Date</h4>
                            <button type="button" id="booking-next-month" class="calendar-nav"><i class="fas fa-chevron-right"></i></button>
                        </div>
                        <div class="calendar-weekdays"><span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span></div>
                        <div id="booking-date-grid" class="booking-date-grid month-calendar"></div>
                    </div>
                    <form id="session-booking-form" class="booking-form">
                        <h4>Available Time Slots</h4>
                        <p id="booking-selected-date-label" class="text-muted"></p>
                        <div id="booking-slot-list" class="booking-slot-list"></div>
                        <label for="booking-topic">Topic</label>
                        <input id="booking-topic" class="form-control" placeholder="What do you want to discuss?" required>
                        <label for="booking-message">Message</label>
                        <textarea id="booking-message" class="form-control" rows="4" placeholder="Add details for your mentor..."></textarea>
                        <button class="btn btn-primary" id="booking-submit-btn" type="submit" disabled>Request Session</button>
                    </form>
                </div>
            </div>
        </div>
    `);
    const modal = document.getElementById("session-booking-modal");
    document.getElementById("booking-modal-close")?.addEventListener("click", closeBookingModal);
    modal?.addEventListener("click", (event) => {
        if (event.target === modal) closeBookingModal();
    });
    document.getElementById("session-booking-form")?.addEventListener("submit", submitAppointmentRequest);
    document.getElementById("booking-prev-month")?.addEventListener("click", () => {
        if (!state.activeBooking) return;
        state.activeBooking.calendarDate.setMonth(state.activeBooking.calendarDate.getMonth() - 1);
        renderBookingModal();
    });
    document.getElementById("booking-next-month")?.addEventListener("click", () => {
        if (!state.activeBooking) return;
        state.activeBooking.calendarDate.setMonth(state.activeBooking.calendarDate.getMonth() + 1);
        renderBookingModal();
    });
}

function closeBookingModal() {
    const modal = document.getElementById("session-booking-modal");
    modal?.classList.add("hidden");
    modal?.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
    state.activeBooking = null;
}

function renderBookingModal() {
    const booking = state.activeBooking;
    if (!booking) return;
    const { mentorUid, connection, mentor, availability } = booking;
    const name = connection.mentorName || mentor.fullName || "Mentor";
    setText("booking-modal-title", `Book Session with ${name}`);
    setText("booking-modal-subtitle", connection.mentorField || mentor.field || mentor.mentoringField || "");
    const summary = document.getElementById("booking-mentor-summary");
    if (summary) {
        const normalizedAvailability = normalizeBookingAvailability(availability);
        const days = Object.entries(normalizedAvailability.availableDays).filter(([, enabled]) => enabled).map(([day]) => formatStatus(day)).join(", ") || "Not set";
        summary.innerHTML = `
            <div><strong>${escapeHtml(name)}</strong><span>${escapeHtml(connection.mentorField || mentor.field || "Mentor")}</span></div>
            <div><strong>${escapeHtml(normalizedAvailability.mentoringMode || mentor.mentoringMode || "Online")}</strong><span>${escapeHtml(days)}</span></div>
            <div><strong>${Number(normalizedAvailability.sessionDuration || 60)} min sessions</strong><span>${Number(normalizedAvailability.bufferMinutes || 0)} min buffer</span></div>
        `;
    }
    const submitButton = document.getElementById("booking-submit-btn");
    const selectedDateLabel = document.getElementById("booking-selected-date-label");
    if (submitButton) submitButton.disabled = !booking.selectedDate || !booking.selectedSlot || !hasValidAvailability(availability);
    if (selectedDateLabel) selectedDateLabel.textContent = booking.selectedDate ? `Selected date: ${formatDate(booking.selectedDate)}` : "Select a date to view available times.";
    if (!hasValidAvailability(availability)) {
        const dateGrid = document.getElementById("booking-date-grid");
        const slots = document.getElementById("booking-slot-list");
        if (dateGrid) {
            dateGrid.innerHTML = `
                <div class="booking-empty-state">
                    <i class="fas fa-calendar-times"></i>
                    <h4>Your mentor has not published available appointment times yet.</h4>
                    <p>Please message your mentor or check again later.</p>
                    <button type="button" class="btn btn-primary btn-sm" data-message-mentor="${escapeAttr(mentorUid)}">Message Mentor</button>
                    <button type="button" class="btn btn-outline btn-sm" data-close-booking-modal>Close</button>
                </div>
            `;
        }
        if (slots) slots.innerHTML = '<div class="empty-state"><i class="fas fa-clock"></i><p>This mentor has not published available appointment times yet.</p></div>';
        return;
    }
    const dateGrid = document.getElementById("booking-date-grid");
    if (dateGrid) {
        const dates = buildBookingDates(availability, booking.calendarDate, booking.mentorAppointments);
        const title = document.getElementById("booking-calendar-title");
        if (title) title.textContent = booking.calendarDate.toLocaleDateString(undefined, { month: "long", year: "numeric" });
        dateGrid.innerHTML = dates.length ? dates.map((item) => `
            <button type="button" class="booking-date ${item.inMonth ? "" : "muted"} ${item.available ? "available" : ""} ${item.disabled ? "disabled" : ""} ${booking.selectedDate === item.value ? "selected" : ""}" data-booking-date="${escapeAttr(item.value)}" title="${escapeAttr(item.reason || "")}" ${item.disabled ? "disabled" : ""}>
                <strong>${escapeHtml(item.day)}</strong><span>${escapeHtml(item.label)}</span>${item.count ? `<small>${item.count}</small>` : ""}
            </button>
        `).join("") : emptyBlock("Mentor has not added available times yet.");
    }
    renderBookingSlots();
}

function renderBookingSlots() {
    const container = document.getElementById("booking-slot-list");
    const booking = state.activeBooking;
    if (!container || !booking) return;
    if (!booking.selectedDate) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-calendar"></i><p>Select an available date first.</p></div>';
        return;
    }
    const slots = buildAvailableSlots(booking.availability, booking.selectedDate, booking.mentorAppointments);
    container.innerHTML = slots.length ? slots.map((slot) => `
        <button type="button" class="booking-slot ${slot.disabled ? "disabled" : ""} ${booking.selectedSlot?.startTime === slot.startTime ? "selected" : ""}" data-slot-start="${escapeAttr(slot.startTime)}" data-slot-end="${escapeAttr(slot.endTime)}" ${slot.disabled ? "disabled" : ""}>
            ${escapeHtml(formatTimeLabel(slot.startTime))} - ${escapeHtml(formatTimeLabel(slot.endTime))}
        </button>
    `).join("") : '<div class="empty-state"><i class="fas fa-clock"></i><p>No free time slots are available on this date.</p></div>';
    const submitButton = document.getElementById("booking-submit-btn");
    if (submitButton) submitButton.disabled = !booking.selectedSlot;
}

function normalizeBookingAvailability(data = {}) {
    const weekDays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
    const legacyDays = Array.isArray(data.availableDays)
        ? data.availableDays.map((day) => String(day).toLowerCase())
        : String(data.availableDays || "").split(",").map((day) => day.trim().toLowerCase()).filter(Boolean);
    const availableDays = {};
    const daySchedules = {};
    weekDays.forEach((day) => {
        const enabled = data.availableDays?.[day] === true || legacyDays.includes(day);
        const ranges = Array.isArray(data.daySchedules?.[day]) ? data.daySchedules[day] : [];
        availableDays[day] = enabled || ranges.length > 0;
        daySchedules[day] = ranges.length ? ranges : (availableDays[day] ? [{ startTime: data.startTime || "18:00", endTime: data.endTime || "20:00" }] : []);
    });
    return {
        availableDays,
        daySchedules,
        sessionDuration: Number(data.sessionDuration || 60),
        bufferMinutes: Number(data.bufferMinutes || 0),
        mentoringMode: data.mentoringMode || "Online",
        maxSessionsPerDay: Number(data.maxSessionsPerDay || 99),
        unavailableDates: data.unavailableDates || {}
    };
}

function hasValidAvailability(availability = {}) {
    const normalized = normalizeBookingAvailability(availability);
    return Object.values(normalized.daySchedules || {}).some((ranges) => Array.isArray(ranges) && ranges.length > 0);
}

function buildBookingDates(availability = {}, calendarDate = new Date(), appointments = {}) {
    const normalizedAvailability = normalizeBookingAvailability(availability);
    const unavailable = availability.unavailableDates || {};
    if (!Object.values(normalizedAvailability.availableDays).some(Boolean)) return [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();
    const first = new Date(year, month, 1);
    const start = new Date(first);
    start.setDate(first.getDate() - first.getDay());
    return Array.from({ length: 42 }, (_, index) => {
        const date = new Date(start);
        date.setDate(start.getDate() + index);
        const value = dateKeyLocal(date);
        const dayKey = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][date.getDay()];
        const past = date < today;
        const blockedDate = unavailable[value] === true;
        const availableDay = normalizedAvailability.availableDays[dayKey] === true;
        const slots = buildAvailableSlots(availability, value, appointments);
        const noSlots = availableDay && !slots.some((slot) => !slot.disabled);
        const disabled = past || blockedDate || !availableDay || noSlots;
        const reason = past ? "Past date" : blockedDate ? "Unavailable date" : !availableDay ? "Mentor unavailable" : noSlots ? "Fully booked" : "Available";
        return {
            value,
            inMonth: date.getMonth() === month,
            available: availableDay && !past && !blockedDate,
            disabled,
            reason,
            count: Object.values(appointments || {}).filter((item) => item.date === value && ["pending", "accepted"].includes(normalize(item.status))).length,
            day: String(date.getDate()),
            label: date.toLocaleDateString(undefined, { weekday: "short" })
        };
    });
}

function buildAvailableSlots(availability = {}, date, appointments = {}) {
    const normalizedAvailability = normalizeBookingAvailability(availability);
    const dateObj = new Date(`${date}T00:00:00`);
    const dayKey = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][dateObj.getDay()];
    const ranges = normalizedAvailability.daySchedules[dayKey] || [];
    const duration = Number(normalizedAvailability.sessionDuration || 60);
    const buffer = Number(normalizedAvailability.bufferMinutes || 0);
    if (!date || !ranges.length || duration <= 0) return [];
    const dayBookings = Object.values(appointments || {}).filter((item) => item.date === date && ["pending", "accepted", "completed"].includes(normalize(item.status)));
    const maxSessions = Number(normalizedAvailability.maxSessionsPerDay || 99);
    const dayFull = dayBookings.length >= maxSessions;
    const today = new Date();
    const isToday = date === dateKeyLocal(today);
    const nowMinutes = today.getHours() * 60 + today.getMinutes();
    const slots = [];
    ranges.forEach((range) => {
        const start = timeToMinutes(range.startTime);
        const end = timeToMinutes(range.endTime);
        for (let minute = start; minute + duration <= end; minute += duration + buffer) {
            const startTime = minutesToTime(minute);
            const endTime = minutesToTime(minute + duration);
            const overlaps = dayBookings.some((item) => intervalsOverlap(startTime, endTime, item.startTime, item.endTime));
            const past = isToday && minute <= nowMinutes;
            slots.push({ startTime, endTime, disabled: dayFull || overlaps || past });
        }
    });
    return slots;
}

function intervalsOverlap(startA, endA, startB, endB) {
    return timeToMinutes(startA) < timeToMinutes(endB) && timeToMinutes(endA) > timeToMinutes(startB);
}

async function submitAppointmentRequest(event) {
    event.preventDefault();
    const submitButton = document.getElementById("booking-submit-btn");
    const originalText = submitButton?.innerHTML;
    const booking = state.activeBooking;
    const slot = booking?.selectedSlot;
    const topic = document.getElementById("booking-topic")?.value.trim();
    const message = document.getElementById("booking-message")?.value.trim() || "";
    try {
        if (!state.uid || !booking) return showToast("Please sign in again.", "error");
        if (!hasValidAvailability(booking.availability)) return showToast("This mentor has not published available appointment times yet.", "error");
        if (!booking.selectedDate || !slot) return showToast("Please select an available date and time.", "error");
        if (!topic) return showToast("Please enter a session topic.", "error");
        if (submitButton) {
            submitButton.disabled = true;
            submitButton.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Sending Request...`;
        }
        appointmentDebug("[Appointment] Selected date", booking.selectedDate);
        appointmentDebug("[Appointment] Selected slot", slot);
        const connectionSnap = await get(ref(database, `studentMentors/${state.uid}/${booking.mentorUid}`));
        if (normalize(connectionSnap.val()?.status) !== "connected") return showToast("You can book only with connected mentors.", "error");
        const latestAppointmentsSnap = await get(query(ref(database, "mentorAppointments"), orderByChild("mentorUid"), equalTo(booking.mentorUid)));
        const latestAppointments = latestAppointmentsSnap.val() || {};
        const stillAvailable = buildAvailableSlots(booking.availability, booking.selectedDate, latestAppointments)
            .some((item) => item.startTime === slot.startTime && item.endTime === slot.endTime && !item.disabled);
        const hasConflict = Object.values(latestAppointments).some((item) => item.date === booking.selectedDate
            && ["pending", "accepted"].includes(normalize(item.status))
            && intervalsOverlap(slot.startTime, slot.endTime, item.startTime, item.endTime));
        const hasDuplicate = Object.values(latestAppointments).some((item) => item.studentUid === state.uid
            && item.mentorUid === booking.mentorUid
            && item.date === booking.selectedDate
            && ["pending", "accepted"].includes(normalize(item.status))
            && intervalsOverlap(slot.startTime, slot.endTime, item.startTime, item.endTime));
        if (!stillAvailable || hasConflict || hasDuplicate) return showToast("This time slot was just booked. Please select another slot.", "error");
        const appointmentRef = push(ref(database, "mentorAppointments"));
        const notificationRef = push(ref(database, `notifications/${booking.mentorUid}`));
        const logRef = push(ref(database, "activityLogs"));
        const studentName = state.user.fullName || state.student.fullName || "Student";
        const mentorName = booking.connection.mentorName || booking.mentor.fullName || "Mentor";
        const appointmentMessage = `${studentName} requested a session on ${booking.selectedDate} at ${formatTimeLabel(slot.startTime)}.`;
        const updates = {};
        updates[`mentorAppointments/${appointmentRef.key}`] = {
            appointmentId: appointmentRef.key,
            mentorUid: booking.mentorUid,
            studentUid: state.uid,
            mentorName,
            studentName,
            studentEmail: state.user.email || state.student.email || auth.currentUser?.email || "",
            studentPhotoURL: state.user.photoURL || state.student.photoURL || "",
            date: booking.selectedDate,
            startTime: slot.startTime,
            endTime: slot.endTime,
            timezone: "Asia/Colombo",
            topic,
            message,
            mode: booking.availability.mentoringMode || booking.mentor.mentoringMode || "Online",
            status: "pending",
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            acceptedAt: null,
            rejectedAt: null,
            rejectionReason: "",
            cancelledAt: null,
            completedAt: null,
            completedNote: ""
        };
        updates[`notifications/${booking.mentorUid}/${notificationRef.key}`] = {
            notificationId: notificationRef.key,
            type: "appointment_request",
            title: "New mentoring session request",
            message: appointmentMessage,
            messagePreview: `${studentName} requested ${topic} on ${booking.selectedDate} at ${formatTimeLabel(slot.startTime)}.`,
            relatedAppointmentId: appointmentRef.key,
            studentUid: state.uid,
            read: false,
            status: "unread",
            createdAt: serverTimestamp()
        };
        updates[`activityLogs/${logRef.key}`] = {
            logId: logRef.key,
            uid: state.uid,
            userName: studentName,
            userRole: "student",
            actionType: "appointment_request_created",
            description: `${studentName} requested a mentoring session with ${mentorName}`,
            relatedEntityType: "mentorAppointment",
            relatedEntityId: appointmentRef.key,
            createdAt: serverTimestamp()
        };
        await update(ref(database), updates);
        event.currentTarget.reset();
        closeBookingModal();
        showToast("Session request sent to mentor.", "success");
    } catch (error) {
        console.error("[Appointment] Error", error);
        if (error?.code === "PERMISSION_DENIED" || error?.code === "permission-denied") {
            showToast("Appointment data could not be loaded because access is restricted.", "error");
        } else {
            showToast("Could not send the appointment request. Please try again.", "error");
        }
    } finally {
        if (submitButton && state.activeBooking) {
            submitButton.innerHTML = originalText || "Request Session";
            submitButton.disabled = !state.activeBooking.selectedDate || !state.activeBooking.selectedSlot;
        }
    }
}

async function cancelAppointment(appointmentId) {
    const appointment = state.mentorAppointments[appointmentId];
    if (!appointment || normalize(appointment.status) !== "pending") return;
    const notificationRef = push(ref(database, `notifications/${appointment.mentorUid}`));
    const updates = {};
    updates[`mentorAppointments/${appointmentId}/status`] = "cancelled";
    updates[`mentorAppointments/${appointmentId}/cancelledAt`] = serverTimestamp();
    updates[`mentorAppointments/${appointmentId}/updatedAt`] = serverTimestamp();
    updates[`notifications/${appointment.mentorUid}/${notificationRef.key}`] = {
        notificationId: notificationRef.key,
        type: "appointment_cancelled",
        title: "Session request cancelled",
        messagePreview: `${state.user.fullName || "A student"} cancelled a pending session request.`,
        relatedAppointmentId: appointmentId,
        studentUid: state.uid,
        read: false,
        status: "unread",
        createdAt: serverTimestamp()
    };
    await update(ref(database), updates);
    showToast("Session request cancelled.", "success");
}

async function cancelAppointmentSafe(appointmentId, clickedButton = null) {
    const originalHtml = clickedButton?.innerHTML;
    try {
        if (!appointmentId) return showToast("Appointment information is missing. Please refresh and try again.", "error");
        if (clickedButton) {
            clickedButton.disabled = true;
            clickedButton.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Cancelling...`;
        }
        await cancelAppointment(appointmentId);
    } catch (error) {
        console.error("[Appointment] Error", error);
        showToast("Could not cancel the appointment request. Please try again.", "error");
    } finally {
        if (clickedButton) {
            clickedButton.disabled = false;
            clickedButton.innerHTML = originalHtml;
        }
    }
}

function syncMentorConversationListeners() {
    const activeIds = new Set(Object.keys(state.connectedMentors || {}).map((mentorUid) => mentorConversationId(mentorUid, state.uid)));
    Object.entries(state.mentorConversationRefs || {}).forEach(([conversationId, conversationRef]) => {
        if (!activeIds.has(conversationId)) {
            off(conversationRef);
            delete state.mentorConversationRefs[conversationId];
            delete state.mentorConversations[conversationId];
        }
    });
    Object.keys(state.connectedMentors || {}).forEach((mentorUid) => {
        const conversationId = mentorConversationId(mentorUid, state.uid);
        if (state.mentorConversationRefs[conversationId]) return;
        const conversationRef = ref(database, `mentorConversations/${conversationId}`);
        state.mentorConversationRefs[conversationId] = conversationRef;
        onValue(conversationRef, (snap) => {
            if (snap.exists()) state.mentorConversations[conversationId] = snap.val();
            else delete state.mentorConversations[conversationId];
            renderConnectedMentors();
            renderMentorMessages();
            renderStats();
            renderActiveMentorConversation();
        });
    });
}

function openMentorConversation(mentorUid) {
    const connection = state.connectedMentors[mentorUid];
    if (!connection || normalize(connection.status) !== "connected") {
        showToast("You can message only connected mentors.", "error");
        return;
    }
    state.activeMentorConversationId = mentorConversationId(mentorUid, state.uid);
    ensureMentorChatModal();
    renderActiveMentorConversation();
    document.getElementById("mentor-chat-modal")?.classList.remove("hidden");
    markMentorConversationRead(state.activeMentorConversationId);
}

function ensureMentorChatModal() {
    if (document.getElementById("mentor-chat-modal")) return;
    document.body.insertAdjacentHTML("beforeend", `
        <div id="mentor-chat-modal" class="modal-overlay hidden" aria-hidden="true">
            <div class="modal-card mentor-chat-card">
                <div class="modal-header">
                    <div>
                        <h3 id="mentor-chat-title">Mentor Messages</h3>
                        <p id="mentor-chat-subtitle" class="text-muted"></p>
                    </div>
                    <button type="button" class="modal-close" id="mentor-chat-close" aria-label="Close">&times;</button>
                </div>
                <div id="mentor-chat-thread" class="chat-thread"></div>
                <form id="mentor-chat-form" class="chat-form">
                    <textarea id="mentor-chat-input" rows="2" placeholder="Write your message..." required></textarea>
                    <button class="btn btn-primary" type="submit"><i class="fas fa-paper-plane"></i> Send</button>
                </form>
            </div>
        </div>
    `);
    document.getElementById("mentor-chat-close")?.addEventListener("click", () => document.getElementById("mentor-chat-modal")?.classList.add("hidden"));
    document.getElementById("mentor-chat-form")?.addEventListener("submit", sendMentorConversationMessage);
}

function renderActiveMentorConversation() {
    if (!state.activeMentorConversationId) return;
    const modal = document.getElementById("mentor-chat-modal");
    if (!modal) return;
    const conversation = state.mentorConversations[state.activeMentorConversationId] || {};
    const mentorUid = conversation.mentorUid || state.activeMentorConversationId.replace(/^mentor_/, "").replace(`_${state.uid}`, "");
    const mentor = state.mentors[mentorUid] || state.connectedMentors[mentorUid] || {};
    setText("mentor-chat-title", mentor.fullName || mentor.mentorName || "Mentor Messages");
    setText("mentor-chat-subtitle", mentor.field || mentor.mentorField || mentor.mentoringField || "");
    const thread = document.getElementById("mentor-chat-thread");
    if (!thread) return;
    const messages = Object.values(conversation.messages || {}).sort((a, b) => getTimeValue(a.createdAt) - getTimeValue(b.createdAt));
    thread.innerHTML = messages.length ? messages.map((message) => `
        <div class="chat-bubble ${message.senderUid === state.uid ? "is-self" : "is-other"}">
            <p>${escapeHtml(message.message || "")}</p>
            <span>${formatDateTime(message.createdAt)}</span>
        </div>
    `).join("") : emptyBlock("No messages yet. Start the conversation with your mentor.");
    thread.scrollTop = thread.scrollHeight;
}

async function sendMentorConversationMessage(event) {
    event.preventDefault();
    if (!isAccountActive(state.user)) {
        showToast("Your account is not active. Please contact EduPath Support.", "error");
        return;
    }
    const conversationId = state.activeMentorConversationId;
    const conversation = state.mentorConversations[conversationId];
    const input = document.getElementById("mentor-chat-input");
    const message = input?.value.trim();
    if (!conversation || !message) return;
    const mentorUid = conversation.mentorUid;
    const messageRef = push(ref(database, `mentorConversations/${conversationId}/messages`));
    const notificationRef = push(ref(database, `notifications/${mentorUid}`));
    const logRef = push(ref(database, "activityLogs"));
    const senderName = state.user.fullName || state.student.fullName || "Student";
    const updates = {};
    updates[`mentorConversations/${conversationId}/messages/${messageRef.key}`] = {
        messageId: messageRef.key,
        conversationId,
        senderUid: state.uid,
        senderName,
        senderRole: "student",
        receiverUid: mentorUid,
        receiverRole: "mentor",
        message,
        status: "sent",
        createdAt: serverTimestamp(),
        readAt: null
    };
    updates[`mentorConversations/${conversationId}/lastMessage`] = message;
    updates[`mentorConversations/${conversationId}/lastMessageAt`] = serverTimestamp();
    updates[`mentorConversations/${conversationId}/lastSenderUid`] = state.uid;
    updates[`mentorConversations/${conversationId}/unreadByMentor`] = Number(conversation.unreadByMentor || 0) + 1;
    updates[`mentorConversations/${conversationId}/updatedAt`] = serverTimestamp();
    updates[`notifications/${mentorUid}/${notificationRef.key}`] = {
        notificationId: notificationRef.key,
        type: "mentor_message",
        title: "New student message",
        message: `${senderName}: ${message.slice(0, 80)}`,
        messagePreview: message.slice(0, 140),
        conversationId,
        studentUid: state.uid,
        read: false,
        status: "unread",
        createdAt: serverTimestamp()
    };
    updates[`activityLogs/${logRef.key}`] = {
        logId: logRef.key,
        uid: state.uid,
        userName: senderName,
        userRole: "student",
        actionType: "mentor_message_sent",
        description: `${senderName} sent a message to a connected mentor`,
        relatedEntityType: "mentorConversation",
        relatedEntityId: conversationId,
        createdAt: serverTimestamp()
    };
    await update(ref(database), updates);
    input.value = "";
}

async function markMentorConversationRead(conversationId) {
    const conversation = state.mentorConversations[conversationId];
    if (!conversation) return;
    const updates = {
        [`mentorConversations/${conversationId}/unreadByStudent`]: 0,
        [`mentorConversations/${conversationId}/updatedAt`]: serverTimestamp()
    };
    Object.entries(conversation.messages || {}).forEach(([messageId, message]) => {
        if (message.senderUid !== state.uid && normalize(message.status) !== "read") {
            updates[`mentorConversations/${conversationId}/messages/${messageId}/status`] = "read";
            updates[`mentorConversations/${conversationId}/messages/${messageId}/readAt`] = serverTimestamp();
        }
    });
    await update(ref(database), updates).catch(console.error);
}

function renderSkills() {
    const container = document.getElementById("skills-list");
    if (!container) return;
    const skills = Object.entries(state.skills || {});
    if (!skills.length) {
        container.innerHTML = emptyBlock("No skill plan yet. Complete or recalculate your pathway to generate recommended skills.");
        return;
    }

    container.innerHTML = skills.map(([id, skill]) => `
        <article class="skill-item glass">
            <div class="skill-info">
                <span>${escapeHtml(skill.name || id)}</span>
                <span class="skill-status">${formatStatus(skill.status || "not-started")}</span>
            </div>
            <div class="progress-bar-container"><div class="progress-bar" style="width:${Number(skill.progress || 0)}%;"></div></div>
            <div class="card-actions">
                <button class="btn btn-outline btn-sm" data-skill-start="${escapeAttr(id)}">Start</button>
                <button class="btn btn-outline btn-sm" data-skill-update="${escapeAttr(id)}">Update</button>
                <button class="btn btn-primary btn-sm" data-skill-complete="${escapeAttr(id)}">Mark Completed</button>
            </div>
        </article>
    `).join("");

    container.querySelectorAll("[data-skill-start]").forEach((button) => {
        button.addEventListener("click", () => updateSkill(button.dataset.skillStart, "in-progress", 25));
    });
    container.querySelectorAll("[data-skill-update]").forEach((button) => {
        button.addEventListener("click", () => {
            const skill = state.skills[button.dataset.skillUpdate] || {};
            updateSkill(button.dataset.skillUpdate, "in-progress", Math.min(Number(skill.progress || 0) + 25, 95));
        });
    });
    container.querySelectorAll("[data-skill-complete]").forEach((button) => {
        button.addEventListener("click", () => updateSkill(button.dataset.skillComplete, "completed", 100));
    });
}

async function ensureRecommendedSkills() {
    if (!state.uid || !state.currentResult?.recommendedSkills) return;
    const existingNames = new Set(Object.values(state.skills || {}).map((skill) => normalize(skill.name)));
    const updates = {};
    state.currentResult.recommendedSkills.forEach((name) => {
        if (!existingNames.has(normalize(name))) {
            const id = slug(name);
            updates[`studentProgress/${state.uid}/skills/${id}`] = {
                name,
                status: "not-started",
                progress: 0,
                updatedAt: serverTimestamp()
            };
        }
    });
    if (Object.keys(updates).length) await update(ref(database), updates);
}

function updateSkill(id, status, progress) {
    const payload = { status, progress, updatedAt: serverTimestamp() };
    if (status === "in-progress" && !state.skills[id]?.startedAt) payload.startedAt = serverTimestamp();
    if (status === "completed") payload.completedAt = serverTimestamp();
    update(ref(database, `studentProgress/${state.uid}/skills/${id}`), payload);
}

function renderCareerGuides() {
    const container = document.getElementById("career-guides-list");
    if (!container) return;
    const guides = Object.entries(state.careerGuides || {}).filter(([, guide]) => (guide.status || "").toLowerCase() === "active");
    if (!guides.length) {
        container.innerHTML = emptyBlock("No career guides are available yet.");
        return;
    }

    container.innerHTML = guides.slice(0, 6).map(([id, guide]) => `
        <article class="guide-card glass">
            ${guide.image ? `<img src="${escapeAttr(guide.image)}" alt="">` : `<i class="fas fa-compass"></i>`}
            <span class="badge badge-cyan">${escapeHtml(guide.category || "Guide")}</span>
            <h4>${escapeHtml(guide.title || "Career Guide")}</h4>
            <p>${escapeHtml(guide.shortDescription || guide.description || "")}</p>
            <a href="${escapeAttr(guide.url || `career-guide.html?guide=${id}`)}">Read More <i class="fas fa-arrow-right"></i></a>
        </article>
    `).join("");
}

async function sendSupportMessage(event) {
    event.preventDefault();
    const form = event.currentTarget || document.getElementById("support-form");
    const user = auth.currentUser;
    if (!user) return showToast("Please log in again.", "error");
    const subjectInput = document.getElementById("support-subject");
    const input = document.getElementById("support-message");
    const subject = subjectInput?.value.trim() || "EduPath Support";
    const messageText = input?.value.trim();
    if (!messageText) return;

    const submitButton = form?.querySelector("button[type='submit']");
    const originalButton = submitButton?.innerHTML;
    if (submitButton?.disabled) return;
    if (submitButton) {
        submitButton.disabled = true;
        submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
    }

    try {
        const uid = user.uid;
        const userSnapshot = await get(ref(database, `users/${uid}`));
        if (!userSnapshot.exists()) {
            showToast("Your user profile could not be loaded.", "error");
            return;
        }
        const userData = userSnapshot.val() || {};
        const conversationId = studentConversationId(uid);
        const messageRef = push(ref(database, `conversations/${conversationId}/messages`));
        const messageId = messageRef.key;
        const existingConversation = state.supportConversation || {};
        const currentUnread = Number(existingConversation.unreadByAdmin || 0);
        const senderName = userData.fullName || state.student.fullName || user.displayName || "Student";
        const senderEmail = userData.email || state.student.email || user.email || "";
        const updates = {};

        updates[`conversations/${conversationId}/conversationId`] = conversationId;
        updates[`conversations/${conversationId}/type`] = "admin-support";
        updates[`conversations/${conversationId}/studentUid`] = uid;
        updates[`conversations/${conversationId}/userUid`] = uid;
        updates[`conversations/${conversationId}/participantIds/${uid}`] = true;
        updates[`conversations/${conversationId}/participantRoles/${uid}`] = "student";
        updates[`conversations/${conversationId}/participantNames/${uid}`] = senderName;
        updates[`conversations/${conversationId}/lastMessage`] = messageText;
        updates[`conversations/${conversationId}/lastMessageAt`] = serverTimestamp();
        updates[`conversations/${conversationId}/lastSenderUid`] = uid;
        updates[`conversations/${conversationId}/unreadByAdmin`] = currentUnread + 1;
        updates[`conversations/${conversationId}/unreadByUser`] = 0;
        updates[`conversations/${conversationId}/status`] = "open";
        updates[`conversations/${conversationId}/updatedAt`] = serverTimestamp();
        if (!existingConversation.createdAt) updates[`conversations/${conversationId}/createdAt`] = serverTimestamp();
        updates[`conversations/${conversationId}/messages/${messageId}`] = {
            messageId,
            conversationId,
            senderUid: uid,
            senderName,
            senderEmail,
            senderRole: "student",
            receiverRole: "admin",
            subject,
            message: messageText,
            status: "sent",
            createdAt: serverTimestamp(),
            readAt: null
        };

        await update(ref(database), updates);
    } catch (error) {
        console.error("Student support message failed:", error);
        console.error("Code:", error?.code);
        console.error("Message:", error?.message);
        showToast(error?.code === "PERMISSION_DENIED" ? "Firebase permission denied. Check conversation security rules." : (error?.message || "Message could not be sent."), "error");
        return;
    } finally {
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.innerHTML = originalButton || '<i class="fas fa-paper-plane"></i> Send Message';
        }
    }

    try {
        form?.reset();
    } catch (uiError) {
        console.error("Student support message saved, but form reset failed:", uiError);
        if (subjectInput) subjectInput.value = "";
        if (input) input.value = "";
    }
    showToast("Your message was sent to EduPath Support.", "success");
}

function renderSupportMessages() {
    const container = document.getElementById("support-replies-list");
    if (!container) return;
    const messages = Object.entries(state.supportConversation?.messages || {}).sort(([, a], [, b]) => getTimeValue(a.createdAt) - getTimeValue(b.createdAt));
    if (!messages.length) {
        container.innerHTML = emptyBlock("No messages yet. Ask EduPath Support a question.");
        return;
    }
    container.innerHTML = messages.map(([, message]) => `
        <article class="list-item">
            <div class="list-icon ${message.senderUid === state.uid ? "bg-blue" : "bg-cyan"}"><i class="fas ${message.senderUid === state.uid ? "fa-paper-plane" : "fa-reply"}"></i></div>
            <div class="list-content">
                <h4>${escapeHtml(message.subject || "EduPath Support")} <span class="badge ${message.senderUid === state.uid ? "badge-primary" : "badge-success"}">${escapeHtml(message.senderRole || "support")}</span></h4>
                <p>${escapeHtml(message.message || message.reply || "")}</p>
                <span class="text-sm text-muted">${formatDateTime(message.createdAt)} - ${escapeHtml(message.status || "sent")}</span>
            </div>
        </article>
    `).join("");
}

function renderNotifications() {
    const container = document.getElementById("notifications-list");
    if (!container) return;
    const notifications = Object.entries(state.notifications || {}).sort(([, a], [, b]) => getTimeValue(b.createdAt) - getTimeValue(a.createdAt));
    if (!notifications.length) {
        container.innerHTML = emptyBlock("No notifications yet.");
        return;
    }
    container.innerHTML = notifications.map(([, item]) => `
        <article class="list-item">
            <div class="list-icon bg-orange"><i class="fas fa-bell"></i></div>
            <div class="list-content">
                <h4>${escapeHtml(item.title || "Notification")}</h4>
                <p>${escapeHtml(item.message || "")}</p>
                <span class="badge ${item.status === "unread" ? "badge-primary" : "badge-success"}">${escapeHtml(item.status || "read")}</span>
            </div>
        </article>
    `).join("");
}

function renderStats() {
    setText("pathway-results-stat", Object.keys(state.pathwayResults || {}).length);
    setText("saved-courses-stat", Object.keys(state.savedCourses || {}).length);
    setText("mentor-requests-stat", Object.keys(state.mentorRequests || {}).length);
    setText("saved-scholarships-stat", Object.keys(state.savedScholarships || {}).length);
    setText("completed-skills-stat", Object.values(state.skills || {}).filter((skill) => skill.status === "completed").length);
    const unreadMentorMessages = Object.values(state.mentorConversations || {}).reduce((sum, conversation) => sum + Number(conversation.unreadByStudent || 0), 0);
    const unreadMessages = Number(state.supportConversation?.unreadByUser || 0) + unreadMentorMessages;
    const unreadNotifications = Object.values(state.notifications || {}).filter((item) => item.status === "unread").length;
    setText("unread-messages-stat", unreadMessages + unreadNotifications);
    setSidebarBadge("sidebar-unread-message-count", unreadMessages);
    setSidebarBadge("sidebar-notification-count", unreadNotifications);
    renderStudentOverview();
}

function setSidebarBadge(id, count) {
    const badge = document.getElementById(id);
    if (!badge) return;
    badge.textContent = count > 0 ? String(count) : "";
    badge.classList.toggle("visible", count > 0);
}

function renderStudentOverview() {
    renderStudentHero();
    renderJourneyProgress();
    renderFocusToday();
    renderBestMatchesOverview();
    renderSkillGrowthOverview();
    renderConnectedMentorOverview();
    renderUpcomingCalendarOverview();
    renderAchievementsOverview();
    renderKeepGrowingOverview();
    bindJumpButtons();
    observeRevealCards();
}

function renderStudentHero() {
    const score = Number(state.currentResult?.pathwayScore || 0);
    setText("hero-pathway-name", state.currentResult?.recommendedPathway || "Complete Pathway Finder");
    setText("hero-pathway-score", score ? `${score}/100` : "--/100");
    setText("hero-pathway-score-label", score >= 75 ? "Great match!" : score ? "Review your plan" : "Start matching");
}

function renderJourneyProgress() {
    const container = document.getElementById("journey-progress-list");
    if (!container) return;
    const profileCompletion = getProfileCompletionPercentage();
    const savedCourses = Object.keys(state.savedCourses || {}).length;
    const mentorRequests = Object.keys(state.mentorRequests || {}).length;
    const appointments = Object.values(state.mentorAppointments || {});
    const courseStarted = Object.keys(state.courseEngagements || {}).length || Object.keys(state.courseApplications || {}).length;
    const steps = [
        { title: "Complete Profile", date: "Profile", done: profileCompletion >= 80, section: "overview-section" },
        { title: "Complete Pathway Finder", date: state.currentResult ? formatDate(state.currentResult.createdAt) : "Next", done: !!state.currentResult, section: "pathway-section" },
        { title: "Save Courses", date: `${savedCourses} saved`, done: savedCourses > 0, section: "recommended-courses-section" },
        { title: "Request Mentor", date: `${mentorRequests} requests`, done: mentorRequests > 0, section: "mentors-section" },
        { title: "Book Session", date: appointments.length ? `${appointments.length} sessions` : "In progress", done: appointments.length > 0, section: "mentor-sessions-section" },
        { title: "Start Course", date: courseStarted ? "Started" : "Upcoming", done: courseStarted > 0, section: "engaged-courses-section" }
    ];
    const currentIndex = Math.max(0, steps.findIndex((step) => !step.done));
    container.innerHTML = steps.map((step, index) => `
        <button type="button" class="journey-step ${step.done ? "done" : index === currentIndex ? "current" : "upcoming"} dashboard-jump" data-section="${escapeAttr(step.section)}">
            <span>${step.done ? '<i class="fas fa-check"></i>' : index + 1}</span>
            <strong>${escapeHtml(step.title)}</strong>
            <small>${escapeHtml(step.date)}</small>
        </button>
    `).join("");
}

function renderFocusToday() {
    const container = document.getElementById("focus-today-content");
    if (!container) return;
    const profileCompletion = getProfileCompletionPercentage();
    const savedCourses = Object.keys(state.savedCourses || {}).length;
    const mentorRequests = Object.keys(state.mentorRequests || {}).length;
    const connected = Object.entries(state.connectedMentors || {}).filter(([, item]) => normalize(item.status) === "connected");
    const appointments = Object.values(state.mentorAppointments || {});
    const pending = appointments.find((item) => normalize(item.status) === "pending");
    const upcoming = appointments.find((item) => normalize(item.status) === "accepted" && getTimeValue(item.date) >= Date.now() - 86400000);
    let focus = { icon: "fa-route", title: "Complete your Pathway Finder.", text: "Unlock personalized courses, scholarships, mentors, and skills.", action: "Start Now", href: "pathway.html?mode=first-time" };
    if (state.currentResult && profileCompletion < 80) focus = { icon: "fa-user-edit", title: "Complete your profile for better recommendations.", text: "A stronger profile improves every match.", action: "Complete Profile", href: "profile.html" };
    else if (state.currentResult && savedCourses === 0) focus = { icon: "fa-bookmark", title: "Compare and save suitable courses.", text: "Shortlist options that fit your pathway and budget.", action: "Browse Courses", section: "recommended-courses-section" };
    else if (state.currentResult && mentorRequests === 0) focus = { icon: "fa-user-tie", title: "Connect with a recommended mentor.", text: "Get guidance from someone who understands your pathway.", action: "Find Mentors", section: "mentors-section" };
    else if (connected.length && !appointments.length) focus = { icon: "fa-calendar-plus", title: "Book a mentoring session.", text: "Turn your mentor connection into clear next steps.", action: "Book Now", mentorUid: connected[0][0] };
    else if (pending) focus = { icon: "fa-hourglass-half", title: "Wait for your mentor to approve your session.", text: "Keep exploring courses while your request is pending.", action: "View Sessions", section: "mentor-sessions-section" };
    else if (upcoming) focus = { icon: "fa-calendar-check", title: "Prepare for your upcoming mentor session.", text: `${formatDate(upcoming.date)} ${upcoming.startTime ? `at ${formatTimeLabel(upcoming.startTime)}` : ""}`, action: "View Session", section: "mentor-sessions-section" };
    else if (state.currentResult) focus = { icon: "fa-chart-line", title: "Continue building your skills.", text: "Small skill progress compounds into stronger opportunities.", action: "Open Skills", section: "skills-section" };
    container.innerHTML = `
        <div class="focus-highlight">
            <i class="fas ${focus.icon}"></i>
            <div><h4>${escapeHtml(focus.title)}</h4><p>${escapeHtml(focus.text)}</p></div>
        </div>
        ${focus.href ? `<a class="btn btn-primary btn-sm" href="${escapeAttr(focus.href)}">${escapeHtml(focus.action)}</a>` : focus.mentorUid ? `<button class="btn btn-primary btn-sm" data-book-session="${escapeAttr(focus.mentorUid)}">${escapeHtml(focus.action)}</button>` : `<button class="btn btn-primary btn-sm dashboard-jump" data-section="${escapeAttr(focus.section)}">${escapeHtml(focus.action)}</button>`}
        <div class="focus-quick-links">
            <button class="btn btn-outline btn-sm dashboard-jump" data-section="scholarships-section"><i class="fas fa-award"></i> Explore Scholarships</button>
            <button class="btn btn-outline btn-sm dashboard-jump" data-section="recommended-courses-section"><i class="fas fa-book-open"></i> Browse Courses</button>
        </div>
    `;
}

function renderBestMatchesOverview() {
    const container = document.getElementById("overview-best-matches");
    if (!container) return;
    const bestCourse = getBestCourseMatch();
    const bestScholarship = getBestScholarshipMatch();
    const bestMentor = getBestMentorMatch();
    const cards = [
        overviewCourseCard(bestCourse),
        overviewScholarshipCard(bestScholarship),
        overviewMentorCard(bestMentor)
    ].filter(Boolean);
    container.innerHTML = cards.length ? cards.join("") : modernEmpty("fa-search", "No matches yet.", "Complete Pathway Finder to generate personalized matches.", "Start Pathway Finder", "pathway.html?mode=first-time");
    container.querySelectorAll("[data-overview-save-course]").forEach((button) => button.addEventListener("click", () => saveCourse(button.dataset.overviewSaveCourse, Number(button.dataset.score || 0))));
    container.querySelectorAll("[data-overview-save-scholarship]").forEach((button) => button.addEventListener("click", () => saveScholarship(button.dataset.overviewSaveScholarship, Number(button.dataset.score || 0))));
    container.querySelectorAll("[data-overview-mentor-uid]").forEach((button) => button.addEventListener("click", () => requestMentor(button.dataset.overviewMentorUid)));
}

function renderSkillGrowthOverview() {
    const container = document.getElementById("overview-skill-growth");
    if (!container) return;
    const skills = Object.values(state.skills || {});
    const names = ["Problem Solving", "Programming / Technical Skill", "Communication", "English", "Leadership"];
    const items = names.map((name) => {
        const skill = skills.find((item) => normalize(item.name || item.skillName || item.title).includes(normalize(name.split("/")[0])) || normalize(name).includes(normalize(item.name || "")));
        const status = normalize(skill?.status || "");
        const progress = status === "completed" ? 100 : status === "in-progress" ? 60 : skill ? 30 : 0;
        return { name, progress, status: skill ? formatStatus(skill.status || "planned") : "Recommended" };
    });
    container.innerHTML = items.map((item) => `
        <div class="skill-growth-row">
            <div><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.status)}</span></div>
            <div class="skill-growth-bar"><span style="width:${item.progress}%"></span></div>
        </div>
    `).join("");
}

function renderConnectedMentorOverview() {
    const container = document.getElementById("overview-connected-mentor");
    if (!container) return;
    const connected = Object.entries(state.connectedMentors || {}).filter(([, item]) => normalize(item.status) === "connected");
    if (!connected.length) {
        container.innerHTML = `
            <div class="card-heading"><div><h3><i class="fas fa-user-tie text-primary"></i> Connected Mentor</h3><p>No mentor connected yet</p></div></div>
            ${modernEmpty("fa-user-plus", "Find guidance from an expert mentor.", `${Object.keys(state.mentors || {}).length} recommended mentors may be available.`, "Explore Mentors", null, "mentors-section")}
        `;
        return;
    }
    const [mentorUid, connection] = connected[0];
    const mentor = state.mentors[mentorUid] || connection;
    const next = Object.values(state.mentorAppointments || {}).filter((item) => item.mentorUid === mentorUid && normalize(item.status) === "accepted").sort((a, b) => getTimeValue(a.date) - getTimeValue(b.date))[0];
    const name = connection.mentorName || mentor.fullName || "Connected Mentor";
    container.innerHTML = `
        <div class="card-heading"><div><h3><i class="fas fa-user-tie text-primary"></i> Connected Mentor</h3><p>${escapeHtml(connection.mentorField || mentor.field || mentor.mentoringField || "Career guidance")}</p></div><span class="badge badge-success">Available</span></div>
        <div class="mentor-mini-profile">
            <div class="mentor-photo">${mentor.photoURL ? `<img src="${escapeAttr(mentor.photoURL)}" alt="${escapeAttr(name)}">` : `<i class="fas fa-user-tie"></i>`}</div>
            <div><h4>${escapeHtml(name)}</h4><p>${escapeHtml(mentor.currentRole || mentor.organization || "EduPath Mentor")}</p><small>${next ? `Next session: ${formatDate(next.date)} ${next.startTime ? formatTimeLabel(next.startTime) : ""}` : "No upcoming session"}</small></div>
        </div>
        <div class="mentor-mini-actions">
            <button class="btn btn-outline btn-sm" data-open-mentor-conversation="${escapeAttr(mentorUid)}"><i class="fas fa-comment"></i> Message</button>
            <button class="btn btn-outline btn-sm dashboard-jump" data-section="connected-mentors-section"><i class="fas fa-eye"></i> View Profile</button>
            ${next ? "" : `<button class="btn btn-primary btn-sm" data-overview-book-session="${escapeAttr(mentorUid)}"><i class="fas fa-calendar-plus"></i> Book Session</button>`}
        </div>
    `;
    container.querySelector("[data-open-mentor-conversation]")?.setAttribute("data-message-mentor", mentorUid);
}

function renderUpcomingCalendarOverview() {
    const container = document.getElementById("overview-calendar-list");
    if (!container) return;
    const events = [];
    Object.values(state.mentorAppointments || {}).forEach((item) => {
        if (!["accepted", "pending"].includes(normalize(item.status))) return;
        events.push({ type: "mentor", date: item.date, title: normalize(item.status) === "pending" ? "Pending Mentor Session" : "Mentor Session", subtitle: item.mentorName || "Mentor", time: item.startTime ? formatTimeLabel(item.startTime) : formatStatus(item.status), icon: "fa-calendar-check" });
    });
    Object.entries(state.scholarships || {}).forEach(([id, item]) => {
        const saved = state.savedScholarships?.[id];
        const deadline = item.deadline || item.applicationDeadline;
        if (saved && deadline) events.push({ type: "scholarship", date: deadline, title: item.title || item.name || "Scholarship Deadline", subtitle: item.provider || "Scholarship", time: "Deadline", icon: "fa-award" });
    });
    const upcoming = events.filter((item) => getTimeValue(item.date) >= Date.now() - 86400000).sort((a, b) => getTimeValue(a.date) - getTimeValue(b.date)).slice(0, 3);
    container.innerHTML = upcoming.length ? upcoming.map(calendarEventCard).join("") : modernEmpty("fa-calendar", "No upcoming sessions.", "Book a session or save scholarships to see deadlines here.", "Book Session", null, "mentor-sessions-section");
}

function renderAchievementsOverview() {
    const container = document.getElementById("overview-achievements");
    if (!container) return;
    const achievements = [
        { title: "Pathway Starter", text: "Completed your pathway plan", unlocked: !!state.currentResult },
        { title: "Profile Pro", text: "Completed 75% of your profile", unlocked: getProfileCompletionPercentage() >= 75 },
        { title: "Course Explorer", text: "Saved your first course", unlocked: Object.keys(state.savedCourses || {}).length >= 1 },
        { title: "Scholarship Hunter", text: "Saved a scholarship", unlocked: Object.keys(state.savedScholarships || {}).length >= 1 },
        { title: "Mentor Connected", text: "Connected with a mentor", unlocked: Object.values(state.connectedMentors || {}).some((item) => normalize(item.status) === "connected") },
        { title: "Session Starter", text: "Completed a mentor session", unlocked: Object.values(state.mentorAppointments || {}).some((item) => normalize(item.status) === "completed") },
        { title: "Skill Builder", text: "Completed a skill", unlocked: Object.values(state.skills || {}).some((item) => normalize(item.status) === "completed") }
    ].sort((a, b) => Number(b.unlocked) - Number(a.unlocked)).slice(0, 4);
    container.innerHTML = achievements.map((item) => `
        <div class="achievement-item ${item.unlocked ? "unlocked" : "locked"}">
            <i class="fas ${item.unlocked ? "fa-star" : "fa-lock"}"></i>
            <div><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.text)}</span></div>
        </div>
    `).join("");
}

function renderKeepGrowingOverview() {
    const container = document.getElementById("keep-growing-metrics");
    if (!container) return;
    const sessions = Object.values(state.mentorAppointments || {}).filter((item) => ["accepted", "completed"].includes(normalize(item.status))).length;
    const skills = Object.keys(state.skills || {}).length;
    container.innerHTML = [
        ["Courses Saved", Object.keys(state.savedCourses || {}).length, "fa-bookmark"],
        ["Mentor Sessions", sessions, "fa-calendar-check"],
        ["Scholarships Saved", Object.keys(state.savedScholarships || {}).length, "fa-award"],
        ["Skills Tracked", skills, "fa-chart-line"]
    ].map(([label, value, icon]) => `<span><i class="fas ${icon}"></i><strong>${value}</strong>${label}</span>`).join("");
}

function getProfileCompletionPercentage() {
    const completed = profileFields.filter(([key, , source]) => hasValue(source === "user" ? state.user[key] : state.student[key]));
    return Math.round((completed.length / profileFields.length) * 100);
}

function getBestCourseMatch() {
    if (!state.currentResult) return null;
    return Object.entries(state.courses || {}).filter(([, course]) => normalize(course.status) === "active").map(([id, course]) => courseMatch(id, course)).sort((a, b) => b.matchScore - a.matchScore)[0] || null;
}

function getBestScholarshipMatch() {
    if (!state.currentResult) return null;
    return Object.entries(state.scholarships || {}).filter(([, item]) => normalize(item.status) === "active").map(([id, item]) => scholarshipMatch(id, item)).sort((a, b) => b.matchScore - a.matchScore)[0] || null;
}

function getBestMentorMatch() {
    if (!state.currentResult) return null;
    return Object.entries(state.mentors || {}).filter(([, mentor]) => isApprovedActiveMentor(mentor)).map(([uid, mentor]) => mentorMatch(uid, mentor)).sort((a, b) => b.matchScore - a.matchScore)[0] || null;
}

function overviewCourseCard(course) {
    if (!course) return "";
    const saved = !!state.savedCourses?.[course.courseId];
    return `<article class="overview-match-card course"><div class="match-media"><i class="fas fa-laptop-code"></i><span>${course.matchScore}% Match</span></div><small>Course</small><h4>${escapeHtml(course.courseName)}</h4><p>${escapeHtml(course.instituteName)}</p><div class="match-meta"><span>${escapeHtml(course.duration)}</span><span>${escapeHtml(course.mode)}</span></div><button class="btn btn-outline btn-sm" data-overview-save-course="${escapeAttr(course.courseId)}" data-score="${course.matchScore}" ${saved ? "disabled" : ""}>${saved ? "Saved" : "Save Course"}</button></article>`;
}

function overviewScholarshipCard(item) {
    if (!item) return "";
    const saved = !!state.savedScholarships?.[item.scholarshipId];
    return `<article class="overview-match-card scholarship"><div class="match-media"><i class="fas fa-graduation-cap"></i><span>${item.matchScore}% Match</span></div><small>Scholarship</small><h4>${escapeHtml(item.scholarshipName)}</h4><p>${escapeHtml(item.provider)}</p><div class="match-meta"><span>${escapeHtml(item.deadline || "Verify deadline")}</span></div><button class="btn btn-outline btn-sm" data-overview-save-scholarship="${escapeAttr(item.scholarshipId)}" data-score="${item.matchScore}" ${saved ? "disabled" : ""}>${saved ? "Saved" : "Save"}</button></article>`;
}

function overviewMentorCard(mentor) {
    if (!mentor) return "";
    const request = mentorRequestStatus(mentor.mentorUid);
    return `<article class="overview-match-card mentor"><div class="match-media">${mentor.photoURL ? `<img src="${escapeAttr(mentor.photoURL)}" alt="${escapeAttr(mentor.mentorName)}">` : `<i class="fas fa-user-tie"></i>`}<span>${mentor.matchScore}% Match</span></div><small>Mentor</small><h4>${escapeHtml(mentor.mentorName)}</h4><p>${escapeHtml(mentor.mentorField)}</p><div class="match-meta"><span>${escapeHtml(mentor.availabilityNote || "Available")}</span></div><button class="btn btn-outline btn-sm" data-overview-mentor-uid="${escapeAttr(mentor.mentorUid)}" ${request.disabled ? "disabled" : ""}>${escapeHtml(request.label)}</button></article>`;
}

function calendarEventCard(item) {
    const date = new Date(getTimeValue(item.date));
    const month = Number.isNaN(date.getTime()) ? "TBD" : date.toLocaleDateString(undefined, { month: "short" });
    const day = Number.isNaN(date.getTime()) ? "--" : date.toLocaleDateString(undefined, { day: "2-digit" });
    return `<div class="calendar-event ${escapeAttr(item.type)}"><div class="date-badge"><span>${escapeHtml(month)}</span><strong>${escapeHtml(day)}</strong></div><i class="fas ${item.icon}"></i><div><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.subtitle)}</span><small>${escapeHtml(item.time)}</small></div></div>`;
}

function modernEmpty(icon, title, text, label, href, section) {
    const action = href ? `<a class="btn btn-primary btn-sm" href="${escapeAttr(href)}">${escapeHtml(label)}</a>` : section ? `<button class="btn btn-primary btn-sm dashboard-jump" data-section="${escapeAttr(section)}">${escapeHtml(label)}</button>` : "";
    return `<div class="modern-empty"><i class="fas ${icon}"></i><h4>${escapeHtml(title)}</h4><p>${escapeHtml(text)}</p>${action}</div>`;
}

function observeRevealCards() {
    const cards = document.querySelectorAll(".reveal-card:not(.is-revealed)");
    if (!cards.length) return;
    if (!("IntersectionObserver" in window)) {
        cards.forEach((card) => card.classList.add("is-revealed"));
        return;
    }
    const observer = new IntersectionObserver((entries, obs) => {
        entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            entry.target.classList.add("is-revealed");
            obs.unobserve(entry.target);
        });
    }, { threshold: 0.12 });
    cards.forEach((card, index) => {
        card.style.setProperty("--reveal-delay", `${Math.min(index * 45, 240)}ms`);
        observer.observe(card);
    });
}

function renderNextSteps() {
    const containers = ["next-step-list", "next-step-list-standalone"]
        .map((id) => document.getElementById(id))
        .filter(Boolean);
    if (!containers.length) return;
    const steps = buildNextSteps();
    if (!steps.length) {
        containers.forEach((container) => {
            container.innerHTML = `<div class="empty-state glass"><i class="fas fa-check-circle"></i><p>You are making excellent progress. Continue learning and reviewing your pathway.</p></div>`;
        });
        return;
    }
    const html = steps.map((step) => `
        <article class="next-step-card glass">
            <i class="${step.done ? "fas fa-check-circle text-success" : "far fa-circle text-muted"}"></i>
            <div>
                <h4>${escapeHtml(step.title)}</h4>
                <p>${escapeHtml(step.description)}</p>
            </div>
            ${step.href ? `<a class="btn btn-outline btn-sm" href="${escapeAttr(step.href)}">${escapeHtml(step.action)}</a>` : `<button class="btn btn-outline btn-sm dashboard-jump" data-section="${escapeAttr(step.section)}">${escapeHtml(step.action)}</button>`}
        </article>
    `).join("");
    containers.forEach((container) => {
        container.innerHTML = html;
    });
    bindJumpButtons();
}

function buildNextSteps() {
    const steps = [];
    const profileCompletion = Number(state.student.profileCompletion || 0);
    const savedCourseCount = Object.keys(state.savedCourses || {}).length;
    const savedScholarshipCount = Object.keys(state.savedScholarships || {}).length;
    const mentorRequestCount = Object.keys(state.mentorRequests || {}).length;
    const skillStarted = Object.values(state.skills || {}).some((skill) => skill.status === "in-progress" || skill.status === "completed");

    if (profileCompletion < 70) steps.push({ title: "Complete your student profile", description: "Better profile data improves all pathway matches.", action: "Complete Profile", href: "profile.html" });
    if (state.student.pathwayCompleted !== true && !state.currentResult) steps.push({ title: "Complete Pathway Finder", description: "Generate your first personalized recommendation set.", action: "Start", href: "pathway.html?mode=first-time" });
    if (state.currentResult && savedCourseCount < 2) steps.push({ title: "Compare and save at least two courses", description: "Shortlist courses that fit your pathway and budget.", action: "View Courses", section: "recommended-courses-section" });
    if (needsFinancialHelp() && savedScholarshipCount === 0) steps.push({ title: "Explore scholarships and financial aid", description: "Your profile indicates scholarship or low-cost support may help.", action: "View Scholarships", section: "scholarships-section" });
    if (mentorRequestCount === 0) steps.push({ title: "Request a suitable mentor", description: "Get guidance from an approved mentor matched to your interests.", action: "Find Mentors", section: "mentors-section" });
    if (state.currentResult?.recommendedSkills?.length && !skillStarted) steps.push({ title: "Start one recommended skill", description: "Build momentum with a skill linked to your pathway.", action: "Skill Tracker", section: "skills-section" });
    return steps;
}

function getNextStepSummary() {
    return buildNextSteps()[0]?.title || "You are making excellent progress. Continue learning and reviewing your pathway.";
}

function scoreCourse(course) {
    let score = 0;
    if (matches(course.category || course.interestArea, [state.student.interestArea, state.currentResult?.interestArea])) score += 30;
    if (matches(course.qualificationLevel || course.educationLevel, [state.student.educationLevel, state.currentResult?.educationLevel])) score += 20;
    if (matches(course.futureGoal || course.careerPath, [state.student.futureGoal, state.currentResult?.futureGoal])) score += 15;
    if (matches(course.mode || course.learningMode, [state.student.learningMode, state.currentResult?.learningMode])) score += 10;
    if (matches(course.feeType || course.financialSupport, [state.student.financialSupport, state.currentResult?.financialSupport])) score += 10;
    if (matches(course.district, [state.student.district, state.currentResult?.district])) score += 5;
    if (matches(course.skills, [state.student.skills, ...(state.currentResult?.recommendedSkills || [])])) score += 10;
    return score;
}

function scoreScholarship(item) {
    let score = 0;
    if (matches(item.educationLevel || item.eligibility, [state.student.educationLevel])) score += 20;
    if (matches(item.district || item.eligibility, [state.student.district])) score += 15;
    if (matches(item.category || item.interestArea, [state.student.interestArea, state.currentResult?.interestArea])) score += 20;
    if (needsFinancialHelp() || matches(item.financialNeed || item.eligibility, [state.student.financialSupport])) score += 30;
    if (item.deadline && getTimeValue(item.deadline) >= Date.now()) score += 15;
    return Math.min(score, 100);
}

function scoreMentor(mentor) {
    let score = 0;
    if (matches(mentor.field || mentor.mentoringField, [state.student.interestArea, state.currentResult?.interestArea])) score += 30;
    if (matches(mentor.guidanceAreas || mentor.futureGoal, [state.student.futureGoal, state.currentResult?.futureGoal])) score += 20;
    if (matches(mentor.mentorType, [state.currentResult?.mentorSuggestion, state.student.futureGoal])) score += 15;
    if (matches(mentor.language || mentor.preferredLanguage, ["English", "Sinhala", "Tamil"])) score += 10;
    if (mentor.availability || mentor.availableTime || mentor.availabilityStatus === "active") score += 15;
    if (matches(mentor.skills, [state.student.skills])) score += 10;
    return Math.min(score, 100);
}

function normalizeList(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value.map(normalize).filter(Boolean);
    if (typeof value === "object") return Object.values(value).map(normalize).filter(Boolean);
    return String(value).split(",").map(normalize).filter(Boolean);
}

function includesAny(sourceList, targetList) {
    const source = normalizeList(sourceList);
    const target = normalizeList(targetList);
    return source.some((item) => target.some((t) => item.includes(t) || t.includes(item)));
}

function textIncludesAny(text, list) {
    const cleanText = normalize(text);
    return normalizeList(list).some((item) => cleanText.includes(item));
}

function matches(source, targets) {
    return includesAny(source, targets);
}

function arrayValue(value) {
    return normalizeList(value).map((item) => item.replace(/\b\w/g, (char) => char.toUpperCase()));
}

function hasValue(value) {
    return Array.isArray(value) ? value.length > 0 : String(value || "").trim() !== "";
}

function needsFinancialHelp() {
    return /scholarship|free|low.?cost|financial/i.test(`${state.student.financialSupport || ""} ${state.currentResult?.financialSupport || ""}`);
}

function getMentorSuggestion() {
    return state.student.futureGoal ? `${state.student.futureGoal} mentor` : "Career mentor";
}

function resultField(label, value) {
    return `<div class="result-item"><span class="label">${escapeHtml(label)}</span><strong>${escapeHtml(value || "--")}</strong></div>`;
}

function mini(label, value) {
    if (!hasValue(value)) return "";
    return `<span><strong>${escapeHtml(label)}:</strong> ${escapeHtml(Array.isArray(value) ? value.join(", ") : value)}</span>`;
}

function tags(items) {
    const list = Array.isArray(items) ? items : String(items || "").split(",").map((item) => item.trim()).filter(Boolean);
    return list.length ? list.map((item) => `<span class="tag">${escapeHtml(item)}</span>`).join("") : `<span class="text-muted">None specified</span>`;
}

function summarize(items) {
    const list = Array.isArray(items) ? items : [];
    if (!list.length) return "No courses listed";
    return list.slice(0, 2).join(", ") + (list.length > 2 ? "..." : "");
}

function emptyState(icon, message, label, href) {
    return `<div class="empty-state"><i class="fas ${icon}"></i><p>${escapeHtml(message)}</p><a href="${escapeAttr(href)}" class="btn btn-primary">${escapeHtml(label)}</a></div>`;
}

function emptyBlock(message) {
    return `<div class="empty-state glass"><i class="fas fa-inbox"></i><p>${escapeHtml(message)}</p></div>`;
}

function renderError(containerId, message) {
    return (error) => {
        console.error(error);
        const container = document.getElementById(containerId);
        if (container) container.innerHTML = `<div class="empty-state glass"><i class="fas fa-exclamation-triangle text-danger"></i><p>${escapeHtml(message)}</p></div>`;
    };
}

function showDashboardSection(sectionId = "overview-section") {
    const normalized = sectionTitles[sectionId] ? sectionId : "overview-section";
    document.querySelectorAll(".dashboard-section").forEach((section) => {
        section.classList.toggle("active", section.id === normalized);
        section.style.display = "";
    });
    const activeSidebarSection = sidebarSectionFor(normalized);
    document.querySelectorAll(".sidebar-links a[data-section], .sidebar-support-link[data-section]").forEach((link) => {
        const active = link.dataset.section === activeSidebarSection || link.dataset.section === normalized;
        link.classList.toggle("active", active);
        if (active) link.setAttribute("aria-current", "page");
        else link.removeAttribute("aria-current");
    });
    setText("page-title", sectionTitles[normalized] || "Student Dashboard");
    const title = document.querySelector(".page-title");
    if (title) title.textContent = sectionTitles[normalized] || "Student Dashboard";
    if (normalized === "support-section") markStudentSupportRead();
    localStorage.setItem("studentActiveSection", normalized);
    const nextHash = `#${normalized.replace("-section", "")}`;
    if (window.location.hash !== nextHash) history.replaceState(null, "", nextHash);

    const sidebar = document.getElementById("sidebar");
    const overlay = document.getElementById("sidebar-overlay");
    if (sidebar && window.innerWidth <= 768) {
        sidebar.classList.remove("active");
        sidebar.classList.remove("mobile-open");
        document.body.classList.remove("sidebar-mobile-open");
        overlay?.classList.remove("show");
        overlay?.classList.remove("active");
    }
}

async function markStudentSupportRead() {
    if (!state.uid || !state.supportConversation?.conversationId) return;
    const conversationId = studentConversationId(state.uid);
    const updates = {
        [`conversations/${conversationId}/unreadByUser`]: 0,
        [`conversations/${conversationId}/updatedAt`]: serverTimestamp()
    };
    Object.entries(state.supportConversation.messages || {}).forEach(([messageId, message]) => {
        if (normalize(message.senderRole) === "admin" && normalize(message.status) !== "read") {
            updates[`conversations/${conversationId}/messages/${messageId}/status`] = "read";
            updates[`conversations/${conversationId}/messages/${messageId}/readAt`] = serverTimestamp();
        }
    });
    await update(ref(database), updates).catch((error) => console.error("Student support read update failed:", error));
}

function getSectionFromHash() {
    const hash = window.location.hash.replace("#", "");
    const found = Object.keys(sectionTitles).find((id) => id.replace("-section", "") === hash || id === hash);
    const saved = localStorage.getItem("studentActiveSection");
    return found || (sectionTitles[saved] ? saved : "overview-section");
}

function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value ?? "";
}

function getInitials(name) {
    return String(name || "ST").split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

function formatDate(value) {
    const time = getTimeValue(value);
    if (!time) return "Not updated yet";
    return new Date(time).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function dateKeyLocal(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function timeToMinutes(value = "00:00") {
    const [hours, minutes] = String(value || "00:00").split(":").map(Number);
    return (hours || 0) * 60 + (minutes || 0);
}

function minutesToTime(total) {
    const hours = Math.floor(total / 60);
    const minutes = total % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function formatTimeLabel(value = "") {
    if (!value) return "N/A";
    const [hours, minutes] = String(value).split(":").map(Number);
    const date = new Date();
    date.setHours(hours || 0, minutes || 0, 0, 0);
    return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function formatStatus(status) {
    return String(status || "").split("-").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

function slug(value) {
    return normalize(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || push(ref(database)).key;
}

function normalize(value) {
    return String(value || "").toLowerCase().trim();
}

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    }[char]));
}

function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, "&#096;");
}

function sanitizeImageURL(value, fallback = "", defaultLocalFolder = "images") {
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

function getCourseImage(course = {}) {
    return sanitizeImageURL(course.imageURL || course.raw?.imageURL, "images/course-placeholder.png", "images");
}

function getScholarshipImage(scholarship = {}) {
    return sanitizeImageURL(scholarship.imageURL || scholarship.raw?.imageURL, "images/scholarship-placeholder.png", "images");
}
