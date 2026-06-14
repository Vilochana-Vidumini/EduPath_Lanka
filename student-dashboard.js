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
    "pathway-section": "My Pathway",
    "pathway-history-section": "Pathway History",
    "recommended-courses-section": "Recommended Courses",
    "saved-courses-section": "Saved Courses",
    "scholarships-section": "Scholarships",
    "mentors-section": "Mentors",
    "mentor-requests-section": "My Mentor Requests",
    "connected-mentors-section": "Connected Mentors",
    "skills-section": "Skill Development",
    "career-guide-section": "Career Guidance",
    "support-section": "EduPath Support",
    "notifications-section": "Notifications"
};

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
    window.addEventListener("hashchange", () => showDashboardSection(getSectionFromHash()));
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

    onValue(ref(database, "scholarships"), (snap) => {
        state.scholarships = snap.val() || {};
        renderScholarships();
        renderSavedScholarships();
        scheduleRecommendationSave();
    }, renderError("scholarships-list", "Unable to load scholarships."));

    onValue(ref(database, `savedScholarships/${uid}`), (snap) => {
        state.savedScholarships = snap.val() || {};
        renderScholarships();
        renderSavedScholarships();
        renderStats();
        renderNextSteps();
    }, renderError("scholarships-list", "Unable to load saved scholarships."));

    onValue(query(ref(database, "mentors"), orderByChild("status"), equalTo("approved")), (snap) => {
        state.mentors = snap.val() || {};
        renderMentors();
        renderMentorRequests();
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
        renderStats();
        renderNextSteps();
    }, renderError("connected-mentors-list", "Unable to load connected mentors."));

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
    renderScholarships();
    renderMentors();
    renderMentorRequests();
    renderConnectedMentors();
    renderSkills();
    renderCareerGuides();
    renderSupportMessages();
    renderNotifications();
    renderStats();
    renderNextSteps();
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
            <a href="profile.html" class="btn btn-outline">Complete Profile</a>
        `;
        return;
    }

    if (outdated) {
        message.textContent = "Your profile information has changed. Recalculate your pathway to receive updated recommendations.";
        buttons.innerHTML = `
            <a href="pathway.html?mode=update" class="btn btn-primary">Recalculate Recommendations <i class="fas fa-sync-alt"></i></a>
            <a href="profile.html" class="btn btn-outline">Update My Details</a>
            <a href="#pathway-history" data-section="pathway-history-section" class="btn btn-outline dashboard-jump">View History</a>
        `;
        bindJumpButtons();
        return;
    }

    message.textContent = "Your current pathway is ready. Review it, compare matches, or update details when your goals change.";
    buttons.innerHTML = `
        <a href="#pathway" data-section="pathway-section" class="btn btn-primary dashboard-jump">View My Pathway <i class="fas fa-poll-h"></i></a>
        <a href="profile.html" class="btn btn-outline">Update My Details</a>
        <a href="#pathway-history" data-section="pathway-history-section" class="btn btn-outline dashboard-jump">View History</a>
    `;
    bindJumpButtons();
}

function bindJumpButtons() {
    document.querySelectorAll(".dashboard-jump").forEach((button) => {
        button.addEventListener("click", (event) => {
            event.preventDefault();
            showDashboardSection(button.dataset.section);
        });
    });
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
    setText("pathway-setup-status", state.student.pathwayCompleted === true || state.currentResult ? "Completed" : "Not Started");

    const bar = document.getElementById("dynamic-profile-progress-bar");
    if (bar) bar.style.width = `${percentage}%`;

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
                <div class="list-icon bg-blue"><i class="fas fa-bookmark"></i></div>
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
    return normalize(mentor.status) === "approved"
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
        <article class="list-item recommendation-card">
            <div class="list-icon bg-green"><i class="fas fa-hand-holding-usd"></i></div>
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
                    <a class="btn btn-outline btn-sm" href="mentors.html?mentor=${encodeURIComponent(mentorUid)}">View Profile</a>
                </div>
            </article>
        `;
    }).join("");
    container.querySelectorAll("[data-message-mentor]").forEach((button) => {
        button.addEventListener("click", () => openMentorConversation(button.dataset.messageMentor));
    });
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
}

function renderNextSteps() {
    const container = document.getElementById("next-step-list");
    if (!container) return;
    const steps = buildNextSteps();
    if (!steps.length) {
        container.innerHTML = `<div class="empty-state glass"><i class="fas fa-check-circle"></i><p>You are making excellent progress. Continue learning and reviewing your pathway.</p></div>`;
        return;
    }
    container.innerHTML = steps.map((step) => `
        <article class="next-step-card glass">
            <i class="${step.done ? "fas fa-check-circle text-success" : "far fa-circle text-muted"}"></i>
            <div>
                <h4>${escapeHtml(step.title)}</h4>
                <p>${escapeHtml(step.description)}</p>
            </div>
            ${step.href ? `<a class="btn btn-outline btn-sm" href="${escapeAttr(step.href)}">${escapeHtml(step.action)}</a>` : `<button class="btn btn-outline btn-sm dashboard-jump" data-section="${escapeAttr(step.section)}">${escapeHtml(step.action)}</button>`}
        </article>
    `).join("");
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
    document.querySelectorAll(".dashboard-section").forEach((section) => section.classList.toggle("active", section.id === normalized));
    document.querySelectorAll(".sidebar-links a[data-section]").forEach((link) => link.classList.toggle("active", link.dataset.section === normalized));
    setText("page-title", sectionTitles[normalized] || "Student Dashboard");
    const title = document.querySelector(".page-title");
    if (title) title.textContent = sectionTitles[normalized] || "Student Dashboard";
    if (normalized === "support-section") markStudentSupportRead();

    const sidebar = document.getElementById("sidebar");
    const overlay = document.getElementById("sidebar-overlay");
    if (sidebar && window.innerWidth <= 768) {
        sidebar.classList.remove("active");
        document.body.classList.remove("sidebar-mobile-open");
        overlay?.classList.remove("show");
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
    return found || "overview-section";
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
