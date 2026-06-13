import { auth, database } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { ref, get, set, update, push, remove, serverTimestamp, onValue, query, orderByChild, equalTo } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
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
    skills: {},
    careerGuides: {},
    notifications: {},
    supportConversation: {}
};

const sectionTitles = {
    "overview-section": "Student Dashboard",
    "pathway-section": "My Pathway",
    "pathway-history-section": "Pathway History",
    "recommended-courses-section": "Recommended Courses",
    "saved-courses-section": "Saved Courses",
    "scholarships-section": "Scholarships",
    "mentors-section": "Mentors",
    "mentor-requests-section": "My Mentor Requests",
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
        if (!userSnap.exists() || (userSnap.val().userType || "").toLowerCase() !== "student") {
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
    }, renderError("pathway-content", "Unable to load pathway results."));

    onValue(ref(database, "courses"), (snap) => {
        state.courses = snap.val() || {};
        renderCourses();
        renderSavedCourses();
        renderStats();
        renderNextSteps();
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
    }, renderError("scholarships-list", "Unable to load scholarships."));

    onValue(ref(database, `savedScholarships/${uid}`), (snap) => {
        state.savedScholarships = snap.val() || {};
        renderScholarships();
        renderSavedScholarships();
        renderStats();
        renderNextSteps();
    }, renderError("scholarships-list", "Unable to load saved scholarships."));

    onValue(ref(database, "mentors"), (snap) => {
        state.mentors = snap.val() || {};
        renderMentors();
        renderMentorRequests();
    }, renderError("mentors-list", "Unable to load mentors."));

    onValue(query(ref(database, "mentorRequests"), orderByChild("studentUid"), equalTo(uid)), (snap) => {
        state.mentorRequests = snap.val() || {};
        renderMentorRequests();
        renderStats();
        renderNextSteps();
    }, renderError("mentor-requests-list", "Unable to load mentor requests."));

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
    setText("res-score", result.pathwayScore || "--");
    container.innerHTML = `
        <div class="result-grid">
            ${resultField("Interest Area", result.interestArea)}
            ${resultField("Future Goal", result.futureGoal)}
            ${resultField("Education Level", result.educationLevel)}
            ${resultField("Exam Stream", result.examStream)}
            ${resultField("Result Status", result.resultStatus)}
            ${resultField("Financial Support", result.financialSupport)}
            ${resultField("Learning Mode", result.learningMode)}
            ${resultField("Financial Guidance", result.financialGuidance || result.financialSupport)}
            ${resultField("Mentor Suggestion", result.mentorSuggestion || getMentorSuggestion())}
            ${resultField("Created Date", formatDate(result.createdAt))}
            ${resultField("Last Updated Date", formatDate(result.updatedAt || result.createdAt))}
            <div class="result-item full-width"><span class="label">Recommended Courses</span><div class="tag-list">${tags(result.recommendedCourses)}</div></div>
            <div class="result-item full-width"><span class="label">Recommended Skills</span><div class="tag-list">${tags(result.recommendedSkills)}</div></div>
            <div class="result-item full-width"><span class="label">Career Paths</span><div class="tag-list">${tags(result.careerPaths)}</div></div>
            <div class="result-item full-width"><span class="label">Next Step Plan</span><div class="next-step-inline">${escapeHtml(getNextStepSummary())}</div></div>
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
    const active = Object.entries(state.courses || {}).filter(([, course]) => (course.status || "").toLowerCase() === "active");
    if (!active.length) {
        container.innerHTML = emptyBlock("No courses are currently available.");
        return;
    }

    const scored = active.map(([id, course]) => ({ id, ...course, matchScore: scoreCourse(course) }))
        .sort((a, b) => b.matchScore - a.matchScore)
        .slice(0, 6);
    const hasStrong = scored.some((course) => course.matchScore >= 40);

    container.innerHTML = scored.map((course) => `
        <article class="item-card glass">
            <div class="card-icon">${course.image ? `<img src="${escapeAttr(course.image)}" alt="">` : `<i class="fas fa-book-open"></i>`}</div>
            <span class="badge ${hasStrong && course.matchScore >= 40 ? "badge-success" : "badge-primary"}">${hasStrong && course.matchScore >= 40 ? "Match" : "Alternative Option"} ${course.matchScore}%</span>
            <h4>${escapeHtml(course.courseName || course.name || "Untitled Course")}</h4>
            <p class="institute"><i class="fas fa-university"></i> ${escapeHtml(course.instituteName || course.institute || "Institute not specified")}</p>
            <div class="detail-list">
                ${mini("Category", course.category)}
                ${mini("Duration", course.duration)}
                ${mini("Mode", course.mode || course.learningMode)}
                ${mini("Fee Type", course.feeType)}
                ${mini("District", course.district)}
                ${mini("Qualification", course.qualificationLevel || course.educationLevel)}
                ${mini("Status", course.status)}
            </div>
            <div class="card-actions">
                <a class="btn btn-outline btn-sm" href="courses.html?course=${encodeURIComponent(course.id)}">View Details</a>
                <button class="btn btn-primary btn-sm" data-save-course="${escapeAttr(course.id)}" data-score="${course.matchScore}">Save Course</button>
                ${course.applyLink ? `<a class="btn btn-outline btn-sm" href="${escapeAttr(course.applyLink)}" target="_blank" rel="noopener">Apply Now</a>` : ""}
            </div>
        </article>
    `).join("");

    container.querySelectorAll("[data-save-course]").forEach((button) => {
        button.addEventListener("click", () => saveCourse(button.dataset.saveCourse, Number(button.dataset.score || 0)));
    });
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
        matchScore,
        courseSnapshot: course,
        savedAt: serverTimestamp()
    });
    showToast("Course saved.", "success");
}

function renderScholarships() {
    const container = document.getElementById("scholarships-list");
    if (!container) return;
    const active = Object.entries(state.scholarships || {}).filter(([, item]) => (item.status || "").toLowerCase() === "active");
    const supportBadge = document.getElementById("scholarship-support-badge");
    if (supportBadge) supportBadge.classList.toggle("hidden", !needsFinancialHelp());

    if (!active.length) {
        container.innerHTML = emptyBlock("No active scholarships are currently available.");
        return;
    }

    const scored = active.map(([id, scholarship]) => ({ id, ...scholarship, matchScore: scoreScholarship(scholarship) }))
        .sort((a, b) => b.matchScore - a.matchScore)
        .slice(0, 6);

    container.innerHTML = scored.map((scholarship) => `
        <article class="list-item">
            <div class="list-icon bg-green"><i class="fas fa-hand-holding-usd"></i></div>
            <div class="list-content">
                <h4>${escapeHtml(scholarship.name || scholarship.scholarshipName || "Scholarship")}</h4>
                <p>${escapeHtml(scholarship.provider || "Provider not specified")} • Deadline ${formatDate(scholarship.deadline)}</p>
                <div class="detail-list compact">
                    ${mini("Support", scholarship.supportType)}
                    ${mini("Eligibility", scholarship.eligibility)}
                    ${mini("Match Level", `${scholarship.matchScore}%`)}
                </div>
            </div>
            <button class="btn btn-outline btn-sm" data-save-scholarship="${escapeAttr(scholarship.id)}" data-score="${scholarship.matchScore}">Save Scholarship</button>
            ${scholarship.applyLink ? `<a class="btn btn-primary btn-sm" href="${escapeAttr(scholarship.applyLink)}" target="_blank" rel="noopener">Apply</a>` : ""}
        </article>
    `).join("");

    container.querySelectorAll("[data-save-scholarship]").forEach((button) => {
        button.addEventListener("click", () => saveScholarship(button.dataset.saveScholarship, Number(button.dataset.score || 0)));
    });
}

function renderSavedScholarships() {
    setText("saved-scholarships-stat", Object.keys(state.savedScholarships || {}).length);
}

async function saveScholarship(id, matchScore) {
    await set(ref(database, `savedScholarships/${state.uid}/${id}`), {
        scholarshipId: id,
        matchScore,
        scholarshipSnapshot: state.scholarships[id] || {},
        savedAt: serverTimestamp()
    });
    showToast("Scholarship saved.", "success");
}

function renderMentors() {
    const container = document.getElementById("mentors-list");
    if (!container) return;
    const approved = Object.entries(state.mentors || {}).filter(([, mentor]) => (mentor.status || "").toLowerCase() === "approved");
    if (!approved.length) {
        container.innerHTML = emptyBlock("No approved mentors are currently available.");
        return;
    }

    const scored = approved.map(([id, mentor]) => ({ uid: id, ...mentor, matchScore: scoreMentor(mentor) }))
        .sort((a, b) => b.matchScore - a.matchScore)
        .slice(0, 6);

    container.innerHTML = scored.map((mentor) => `
        <article class="item-card glass">
            <div class="mentor-head">
                ${mentor.photoURL ? `<img class="avatar-sm" src="${escapeAttr(mentor.photoURL)}" alt="">` : `<div class="avatar-sm avatar-fallback">${getInitials(mentor.fullName || "Mentor")}</div>`}
                <div>
                    <h4>${escapeHtml(mentor.fullName || "Mentor")}</h4>
                    <span class="badge badge-purple">${escapeHtml(mentor.mentorType || "Mentor")} • ${mentor.matchScore}%</span>
                </div>
            </div>
            <div class="detail-list">
                ${mini("Field", mentor.field || mentor.mentoringField)}
                ${mini("University / Company", mentor.universityOrCompany || mentor.organization)}
                ${mini("Experience", mentor.experience)}
                ${mini("Language", mentor.preferredLanguage || mentor.language)}
                ${mini("Availability", mentor.availability || mentor.availableTime || mentor.availabilityStatus)}
            </div>
            <button class="btn btn-primary req-mentor-btn" data-mentor-uid="${escapeAttr(mentor.uid)}">Request Mentor</button>
        </article>
    `).join("");

    container.querySelectorAll("[data-mentor-uid]").forEach((button) => {
        button.addEventListener("click", () => requestMentor(button.dataset.mentorUid));
    });
}

async function requestMentor(mentorUid) {
    const mentor = state.mentors[mentorUid];
    if (!mentor) return;

    const duplicate = Object.values(state.mentorRequests || {}).find((request) => (
        request.mentorUid === mentorUid && ["pending", "accepted"].includes((request.status || "").toLowerCase())
    ));
    if (duplicate) {
        showToast("You already have an active request with this mentor.", "error");
        return;
    }

    const requestRef = push(ref(database, "mentorRequests"));
    await set(requestRef, {
        requestId: requestRef.key,
        studentUid: state.uid,
        studentName: state.user.fullName || state.student.fullName || "Student",
        studentEmail: state.user.email || state.student.email || auth.currentUser?.email || "",
        mentorUid,
        mentorName: mentor.fullName || "Mentor",
        mentorField: mentor.field || mentor.mentoringField || "",
        message: "I would like to request guidance.",
        status: "pending",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    });
    showToast(`Mentorship request sent to ${mentor.fullName || "mentor"}.`, "success");
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
    if (status === "accepted") return `<span class="badge badge-success">Contact details will be shared by EduPath support.</span>`;
    if (status === "rejected") return `<button class="btn btn-primary btn-sm dashboard-jump" data-section="mentors-section">Find Another Mentor</button>`;
    if (status === "completed") return `<span class="badge badge-cyan">Feedback coming soon</span>`;
    return "";
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
    const unreadMessages = Number(state.supportConversation?.unreadByUser || 0);
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

function matches(source, targets) {
    const sourceTokens = tokenize(source);
    if (!sourceTokens.length) return false;
    return targets.filter(Boolean).some((target) => tokenize(target).some((token) => sourceTokens.includes(token)));
}

function tokenize(value) {
    if (Array.isArray(value)) return value.flatMap(tokenize);
    return String(value || "").toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 2);
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
