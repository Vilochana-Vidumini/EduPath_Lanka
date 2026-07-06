import { auth, database } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { ref, get, update, push, onValue, off, query, orderByChild, equalTo, serverTimestamp, remove } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
import { showToast, preserveThemeOnClear } from "./auth-nav.js?v=20260614-brand";
import { updateSidebarUser } from "./sidebar.js";
import { ensureDashboardTopbarLayout, initDashboardNotifications, updateDashboardGreetingName } from "./dashboard-topbar.js";
import { activeRequestFor, accountRole, isAccountActive, isApprovedMentorProfile, normalizeAppointment, normalizeConnection, normalizeList, normalizeMentorshipRequest, normalizeStatus, normalizeUserRoles } from "./mentorship-utils.js";
import { ratingLabel } from "./ratings.js";
import { getLearnerRecommendationProfile, recommendCourses, recommendScholarships, recommendInstitutes, recommendMentors } from "./recommendation-engine.js";

const state = {
    uid: "",
    user: {},
    mentorProfile: {},
    mentors: {},
    mentorUsers: {},
    ratingSummaries: {},
    requests: {},
    legacyRequests: {},
    connections: {},
    appointments: {},
    goals: {},
    conversations: {},
    conversationRefs: {},
    reviews: {},
    activeRequestFilter: "all",
    activeConversationId: "",
    learningProfile: {},
    courses: {},
    scholarships: {},
    institutes: {},
    savedOpportunities: {},
    opportunityApplications: {},
    activeSavedFilter: "courses",
    activeSection: "overview"
};

document.addEventListener("DOMContentLoaded", () => {
    bindNavigation();
    bindStaticActions();
    localStorage.setItem("edupathDashboardMode", "mentee");

    onAuthStateChanged(auth, async (user) => {
        if (!user) return window.location.href = "login.html";
        state.uid = user.uid;
        
        const userSnap = await get(ref(database, `users/${user.uid}`));
        const userData = userSnap.val() || {};
        const roles = normalizeUserRoles(userData);
        
        if (!roles.roles.mentor || !isAccountActive(userData)) {
            showToast("Only active approved mentors can open My Learning.", "error");
            window.location.href = "mentor-dashboard.html";
            return;
        }
        
        const mentorSnap = await get(ref(database, `mentors/${user.uid}`));
        const mentorProfile = mentorSnap.val() || {};
        
        if (!isApprovedMentorProfile(mentorProfile, userData)) {
            showToast("My Learning is available after your mentor profile is approved.", "warning");
            window.location.href = "mentor-dashboard.html";
            return;
        }
        
        state.user = userData;
        state.mentorProfile = mentorProfile;
        
        const fullName = userData.fullName || mentorProfile.fullName || "Mentor";
        
        // Update simple sidebar user
        const sidebarName = document.getElementById("sidebar-user-name");
        if (sidebarName) sidebarName.textContent = fullName;
        
        const sidebarAvatar = document.getElementById("sidebar-user-avatar-img");
        if (sidebarAvatar && (userData.photoURL || mentorProfile.photoURL)) {
            sidebarAvatar.src = userData.photoURL || mentorProfile.photoURL;
        }
        
        updateDashboardGreetingName(fullName);
        setText("top-user-name", fullName);
        ensureDashboardTopbarLayout();
        initDashboardNotifications(user.uid);
        
        setupRealtime(user.uid);
        
        // Init routing
        const hash = window.location.hash ? window.location.hash.slice(1) : "overview";
        openLearningSection(hash);
    });
});

// --- Routing & Navigation ---
function bindNavigation() {
    // Sidebar toggle logic (mobile)
    const sidebar = document.getElementById("sidebar");
    const overlay = document.getElementById("sidebar-overlay");
    const toggles = document.querySelectorAll("[data-sidebar-toggle], .close-sidebar");
    
    toggles.forEach(toggle => {
        toggle.addEventListener("click", () => {
            if (window.innerWidth <= 900) {
                sidebar?.classList.toggle("active");
                overlay?.classList.toggle("show");
            }
        });
    });

    overlay?.addEventListener("click", () => {
        sidebar?.classList.remove("active");
        overlay?.classList.remove("show");
    });

    // Hash routing
    window.addEventListener("hashchange", () => {
        const hash = window.location.hash ? window.location.hash.slice(1) : "overview";
        openLearningSection(hash);
    });

    // Sidebar items
    document.querySelectorAll("[data-learning-nav]").forEach(btn => {
        btn.addEventListener("click", (e) => {
            e.preventDefault();
            const section = btn.dataset.learningNav;
            openLearningSection(section);
            
            // Close mobile sidebar if open
            if (window.innerWidth <= 900) {
                sidebar?.classList.remove("active");
                overlay?.classList.remove("show");
            }
        });
    });
}

function openLearningSection(sectionId, options = {}) {
    state.activeSection = sectionId;
    
    // Update URL hash without triggering hashchange
    if (window.location.hash !== `#${sectionId}`) {
        history.pushState(null, "", `#${sectionId}`);
    }

    // Hide all, show active section
    document.querySelectorAll(".learning-section").forEach(sec => {
        sec.classList.remove("active");
    });
    
    const activeSectionEl = document.querySelector(`[data-learning-section="${sectionId}"]`) || document.getElementById(`section-${sectionId}`);
    if (activeSectionEl) {
        activeSectionEl.classList.add("active");
    }

    // Update active state on sidebar
    document.querySelectorAll("[data-learning-nav]").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.learningNav === sectionId);
    });

    // Trigger specific render logic (lazy load triggers)
    switch(sectionId) {
        case "overview": renderOverview(); break;
        case "learning-profile": populateLearningProfileForm(); break;
        case "courses": 
        case "scholarships": 
        case "institutes": 
        case "find-mentor": 
            renderRecommendations(); 
            break;
        case "my-requests": renderRequests(); break;
        case "connected-mentors": renderConnections(); break;
        case "learning-sessions": renderSessions(); break;
        case "messages": renderMessages(); break;
        case "saved-opportunities": renderSavedOpportunities(); break;
        case "applications": renderApplications(); break;
        case "learning-goals": renderGoals(); break;
        case "reviews-submitted": renderReviews(); break;
    }
}

function bindStaticActions() {
    document.getElementById("logout-btn-sidebar")?.addEventListener("click", async (event) => {
        event.preventDefault();
        preserveThemeOnClear();
        await signOut(auth);
        sessionStorage.clear();
        window.location.href = "login.html";
    });

    document.addEventListener("click", handlePageClick);
    document.querySelectorAll("[data-close-request-modal]").forEach((button) => button.addEventListener("click", closeRequestModal));
    document.getElementById("request-mentorship-modal")?.addEventListener("click", (event) => {
        if (event.target.id === "request-mentorship-modal") closeRequestModal();
    });
    
    document.getElementById("learning-request-form")?.addEventListener("submit", submitMentorshipRequest);
    document.getElementById("learning-profile-form")?.addEventListener("submit", saveLearningProfile);
    
    document.querySelector("[data-request-tabs]")?.addEventListener("click", (event) => {
        const button = event.target.closest("[data-request-filter]");
        if (!button) return;
        state.activeRequestFilter = button.dataset.requestFilter;
        document.querySelectorAll("[data-request-filter]").forEach((item) => item.classList.toggle("active", item === button));
        renderRequests();
    });

    document.querySelector("[data-saved-tabs]")?.addEventListener("click", (event) => {
        const btn = event.target.closest("[data-saved-filter]");
        if (!btn) return;
        state.activeSavedFilter = btn.dataset.savedFilter;
        document.querySelectorAll("[data-saved-filter]").forEach(b => b.classList.toggle("active", b === btn));
        renderSavedOpportunities();
    });

    document.getElementById("add-learning-goal-btn")?.addEventListener("click", addLearningGoal);
    document.getElementById("learning-chat-form")?.addEventListener("submit", sendLearningMessage);
}

// --- Data Loading & Setup ---
function setupRealtime(uid) {
    // Initial critical data
    onValue(ref(database, `learningProfiles/${uid}`), (snap) => { 
        state.learningProfile = snap.val() || {}; 
        if (state.activeSection === "learning-profile") populateLearningProfileForm();
        if (["overview", "courses", "scholarships", "institutes"].includes(state.activeSection)) renderRecommendations(); 
    });

    onValue(query(ref(database, "mentorshipConnections"), orderByChild("menteeUid"), equalTo(uid)), (snap) => { 
        state.connections = snap.val() || {}; 
        syncConversationListeners(); 
        renderAllIfActive(["overview", "connected-mentors"]); 
    });

    onValue(query(ref(database, "appointments"), orderByChild("menteeUid"), equalTo(uid)), (snap) => { 
        state.appointments = snap.val() || {}; 
        renderAllIfActive(["overview", "learning-sessions"]); 
    });

    onValue(ref(database, `learningGoals/${uid}`), (snap) => { 
        state.goals = snap.val() || {}; 
        renderAllIfActive(["overview", "learning-goals"]); 
    });

    onValue(ref(database, `savedOpportunities/${uid}`), (snap) => { 
        state.savedOpportunities = snap.val() || {}; 
        renderAllIfActive(["overview", "saved-opportunities"]); 
    });

    // Detailed data (could be lazy loaded, but we need it for summaries too)
    onValue(query(ref(database, "mentors"), orderByChild("status"), equalTo("approved")), async (snap) => {
        state.mentors = snap.val() || {};
        await loadMentorUsers();
        renderAllIfActive(["overview", "find-mentor", "my-requests", "connected-mentors"]);
    });

    onValue(ref(database, "courses"), (snap) => { state.courses = snap.val() || {}; renderAllIfActive(["overview", "courses"]); });
    onValue(ref(database, "scholarships"), (snap) => { state.scholarships = snap.val() || {}; renderAllIfActive(["overview", "scholarships"]); });
    onValue(ref(database, "institutes"), (snap) => { state.institutes = snap.val() || {}; renderAllIfActive(["overview", "institutes"]); });
    
    onValue(query(ref(database, "mentorshipRequests"), orderByChild("requesterUid"), equalTo(uid)), (snap) => { state.requests = snap.val() || {}; renderAllIfActive(["my-requests"]); });
    onValue(query(ref(database, "mentorRequests"), orderByChild("studentUid"), equalTo(uid)), (snap) => { state.legacyRequests = snap.val() || {}; renderAllIfActive(["my-requests"]); });
    
    onValue(ref(database, `studentRatings/${uid}`), (snap) => { state.reviews = snap.val() || {}; renderAllIfActive(["reviews-submitted", "overview"]); });
    onValue(ref(database, `opportunityApplications/${uid}`), (snap) => { state.opportunityApplications = snap.val() || {}; renderAllIfActive(["applications"]); });
}

function renderAllIfActive(sections) {
    if (sections.includes(state.activeSection) || sections.includes("overview")) {
        renderOverview();
        if (state.activeSection !== "overview") {
            openLearningSection(state.activeSection);
        }
    }
}

async function loadMentorUsers() {
    const missing = Object.keys(state.mentors || {}).filter((uid) => !state.mentorUsers[uid]);
    await Promise.all(missing.map(async (uid) => {
        state.mentorUsers[uid] = await get(ref(database, `users/${uid}`)).then((snap) => snap.val() || {}).catch(() => ({}));
    }));
}

// --- Overview Rendering ---
function renderOverview() {
    const profile = getLearnerRecommendationProfile({ userRole: "mentor", learningProfile: state.learningProfile });
    const recommendedCourses = recommendCourses(profile, state.courses);
    const recommendedScholarships = recommendScholarships(profile, state.scholarships);
    
    const connections = activeConnections();
    const appointments = Object.values(state.appointments || {}).map(normalizeAppointment);
    const upcoming = appointments.filter((item) => ["accepted", "confirmed", "scheduled", "upcoming"].includes(normalizeStatus(item.status)) && sessionTime(item) >= Date.now());
    
    setText("stat-course-matches", recommendedCourses.length);
    setText("stat-scholarship-matches", recommendedScholarships.length);
    setText("stat-saved-opportunities", Object.keys(state.savedOpportunities || {}).length);
    setText("stat-connected-mentors", connections.length);
    setText("stat-upcoming-sessions", upcoming.length);

    const tc = document.getElementById("overview-top-course");
    if (tc) tc.innerHTML = recommendedCourses[0] ? `<div class="overview-row" style="padding:10px; border:1px solid #dfe7f3; border-radius:12px;"><strong>${escapeHtml(recommendedCourses[0].courseName)}</strong><br><span style="font-size:0.85rem;color:#71819a;">${escapeHtml(recommendedCourses[0].instituteName)}</span></div>` : compactEmpty("No course matches.");

    const ts = document.getElementById("overview-top-scholarship");
    if (ts) ts.innerHTML = recommendedScholarships[0] ? `<div class="overview-row" style="padding:10px; border:1px solid #dfe7f3; border-radius:12px;"><strong>${escapeHtml(recommendedScholarships[0].scholarshipName)}</strong><br><span style="font-size:0.85rem;color:#71819a;">${escapeHtml(recommendedScholarships[0].provider)}</span></div>` : compactEmpty("No scholarship matches.");

    const available = availableMentorRows();
    const tm = document.getElementById("overview-top-mentor");
    if (tm) tm.innerHTML = available[0] ? `<div class="overview-row" style="padding:10px; border:1px solid #dfe7f3; border-radius:12px;"><strong>${escapeHtml(available[0].mentor.fullName || available[0].user.fullName || "Mentor")}</strong><br><span style="font-size:0.85rem;color:#71819a;">${escapeHtml(available[0].mentor.field || "Mentorship")}</span></div>` : compactEmpty("No mentors available.");
}

// --- Specific Rendering logic ---
function renderRecommendations() {
    const profile = getLearnerRecommendationProfile({ userRole: "mentor", learningProfile: state.learningProfile });
    
    const coursesGrid = document.getElementById("courses-grid");
    if (coursesGrid && state.activeSection === "courses") {
        const recommended = recommendCourses(profile, state.courses);
        if (!recommended.length) coursesGrid.innerHTML = emptyBlock("No courses match your profile right now.");
        else coursesGrid.innerHTML = recommended.map(courseCard).join("");
    }
    
    const scholarshipsGrid = document.getElementById("scholarships-grid");
    if (scholarshipsGrid && state.activeSection === "scholarships") {
        const recommended = recommendScholarships(profile, state.scholarships);
        if (!recommended.length) scholarshipsGrid.innerHTML = emptyBlock("No scholarships match your profile right now.");
        else scholarshipsGrid.innerHTML = recommended.map(scholarshipCard).join("");
    }
    
    const institutesGrid = document.getElementById("institutes-grid");
    if (institutesGrid && state.activeSection === "institutes") {
        const recommended = recommendInstitutes(profile, state.institutes, state.courses);
        if (!recommended.length) institutesGrid.innerHTML = emptyBlock("No institutes match your profile right now.");
        else institutesGrid.innerHTML = recommended.map(instituteCard).join("");
    }
    
    if (state.activeSection === "find-mentor") {
        renderMentors();
    }
}

function renderMentors() {
    const grid = document.getElementById("available-mentors-grid");
    if (!grid) return;
    const rows = availableMentorRows();
    if (!rows.length) {
        grid.innerHTML = emptyBlock("No available mentors match your current learning needs.");
        return;
    }
    grid.innerHTML = rows.map(mentorCard).join("");
}

function availableMentorRows() {
    return Object.entries(state.mentors || {})
        .map(([uid, mentor]) => ({ uid, mentor: { ...mentor, uid }, user: state.mentorUsers[uid] || {} }))
        .filter(({ uid, mentor, user }) => isAvailablePublicMentor({ ...user, ...mentor, uid }, state.uid))
        .sort((a, b) => String(a.mentor.fullName || a.user.fullName || "").localeCompare(String(b.mentor.fullName || b.user.fullName || "")));
}

function isAvailablePublicMentor(mentor, currentUserUid) {
    return isApprovedMentorProfile(mentor, mentor) && mentor.uid !== currentUserUid;
}

function mentorCard({ uid, mentor, user }) {
    const name = mentor.fullName || user.fullName || "Mentor";
    const photo = mentor.photoURL || user.photoURL || "";
    const rating = state.ratingSummaries[uid] || {};
    const existing = activeRequestFor({ ...state.requests, ...state.legacyRequests }, state.uid, uid);
    const actionLabel = existing ? (normalizeStatus(existing.status) === "pending" ? "Request Sent" : "Connected") : "Request Mentorship";
    const disabled = existing ? "disabled" : "";
    return `<article class="mentor-learning-card">
        ${avatar(photo, name)}
        <div>
            <h3 style="margin:0; font-size:1.05rem; color:#0f1b3d;">${escapeHtml(name)}</h3>
            <p style="margin:2px 0 6px; font-size:0.85rem; color:#71819a;">${escapeHtml(mentor.currentPosition || mentor.designation || mentor.mentorType || "Approved Mentor")}</p>
            <div style="display:flex; gap:10px; font-size:0.8rem; color:#536783;">
                <span><i class="fas fa-briefcase"></i> ${escapeHtml(displayValue(mentor.expertise || mentor.field))}</span>
                <span><i class="fas fa-star" style="color:#fbbf24;"></i> ${ratingLabel(rating)}</span>
            </div>
            <div class="mentor-learning-card-actions">
                <a class="btn btn-outline btn-sm" href="mentor-profile.html?uid=${encodeURIComponent(uid)}">View Profile</a>
                <button class="btn btn-primary btn-sm" data-request-mentor="${escapeAttr(uid)}" ${disabled}>${escapeHtml(actionLabel)}</button>
            </div>
        </div>
    </article>`;
}

function renderRequests() {
    const container = document.getElementById("learning-requests-list");
    if (!container) return;
    const rows = normalizedRequests().filter((item) => state.activeRequestFilter === "all" || normalizeStatus(item.status) === state.activeRequestFilter);
    if (!rows.length) {
        container.innerHTML = emptyBlock("You have not sent any mentorship requests yet.");
        return;
    }
    container.innerHTML = rows.map((request) => {
        const mentor = state.mentors[request.targetMentorUid] || {};
        const status = normalizeStatus(request.status || "pending");
        return `<article class="learning-list-item">
            <div style="display:flex; gap:14px; align-items:center;">
                ${avatar(request.targetMentorPhotoURL || mentor.photoURL, request.targetMentorName)}
                <div>
                    <h4 style="margin:0; font-size:1.05rem;">${escapeHtml(request.targetMentorName || mentor.fullName || "Mentor")}</h4>
                    <p style="margin:4px 0 0; color:#536783; font-size:0.9rem;">${escapeHtml(request.topic || "Mentorship")}</p>
                </div>
            </div>
            <div><span class="learning-status ${status}">${escapeHtml(formatStatus(status))}</span></div>
            <div style="display:flex; gap:8px;">${requestActions(request)}</div>
        </article>`;
    }).join("");
}

function requestActions(request) {
    const status = normalizeStatus(request.status || "pending");
    if (status === "pending") return `<button class="btn btn-outline btn-sm" style="color:#ef4444; border-color:#ef4444;" data-cancel-request="${escapeAttr(request.requestId)}">Cancel</button>`;
    if (status === "accepted" || status === "connected") return `<button class="btn btn-primary btn-sm" data-section-jump="connected-mentors">Open</button>`;
    return ``;
}

function renderConnections() {
    const container = document.getElementById("connected-mentors-list");
    if (!container) return;
    const rows = activeConnections();
    if (!rows.length) {
        container.innerHTML = emptyBlock("You do not currently have an active mentor.");
        return;
    }
    container.innerHTML = rows.map((connection) => {
        const mentor = state.mentors[connection.mentorUid] || {};
        const conversationId = connection.conversationId || conversationIdFor(connection.mentorUid, state.uid);
        return `<article class="mentor-learning-card">
            ${avatar(connection.mentorPhotoURL || mentor.photoURL, connection.mentorName)}
            <div>
                <h3 style="margin:0; font-size:1.05rem; color:#0f1b3d;">${escapeHtml(connection.mentorName || mentor.fullName || "Mentor")}</h3>
                <p style="margin:2px 0 6px; font-size:0.85rem; color:#71819a;">${escapeHtml(connection.topic || "Mentorship")}</p>
                <div class="mentor-learning-card-actions">
                    <button class="btn btn-primary btn-sm" data-open-chat="${escapeAttr(conversationId)}">Message</button>
                    <button class="btn btn-outline btn-sm" data-schedule-session="${escapeAttr(connection.connectionId)}">Schedule</button>
                </div>
            </div>
        </article>`;
    }).join("");
}

function renderSessions() {
    const container = document.getElementById("learning-sessions-list");
    if (!container) return;
    const rows = Object.values(state.appointments || {}).map(normalizeAppointment).sort((a, b) => sessionTime(a) - sessionTime(b));
    if (!rows.length) {
        container.innerHTML = emptyBlock("No learning sessions are scheduled.");
        return;
    }
    container.innerHTML = rows.map((session) => `<article class="learning-list-item">
        <div>
            <h4 style="margin:0; font-size:1.05rem;">${escapeHtml(session.topic || "Learning Session")}</h4>
            <p style="margin:4px 0 0; color:#536783; font-size:0.9rem;">${escapeHtml(session.mentorName || "Mentor")} - ${escapeHtml(formatDateTime(session.startDateTime || session.date))}</p>
        </div>
        <div><span class="learning-status ${normalizeStatus(session.status)}">${escapeHtml(formatStatus(session.status))}</span></div>
        <div style="display:flex; gap:8px;">
            ${session.meetingLink ? `<a class="btn btn-primary btn-sm" href="${escapeAttr(session.meetingLink)}" target="_blank" rel="noopener">Open Meeting</a>` : ""}
            ${normalizeStatus(session.status) === "completed" ? `<button class="btn btn-outline btn-sm" data-section-jump="reviews-submitted">Rate Mentor</button>` : ""}
        </div>
    </article>`).join("");
}

function renderMessages() {
    const container = document.getElementById("learning-messages-list");
    if (!container) return;
    const rows = Object.entries(state.conversations || {}).sort(([, a], [, b]) => timeValue(b.lastMessageAt || b.updatedAt) - timeValue(a.lastMessageAt || a.updatedAt));
    if (!rows.length) {
        container.innerHTML = emptyBlock("You do not have any learning conversations yet.");
        return;
    }
    container.innerHTML = rows.map(([id, conversation]) => `<div class="message-item ${state.activeConversationId === id ? 'active' : ''}" data-open-chat="${escapeAttr(id)}">
        ${avatar(null, mentorNameFor(conversation.mentorUid))}
        <div>
            <div style="display:flex; justify-content:space-between;">
                <strong style="font-size:0.95rem;">${escapeHtml(mentorNameFor(conversation.mentorUid))}</strong>
                <span style="font-size:0.75rem; color:#94a3b8;">${formatDate(conversation.lastMessageAt || conversation.updatedAt)}</span>
            </div>
            <p style="margin:4px 0 0; font-size:0.85rem; color:#64748b; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(conversation.lastMessage || "No messages yet.")}</p>
        </div>
    </div>`).join("");
}

function renderGoals() {
    const container = document.getElementById("learning-goals-list");
    if (!container) return;
    const rows = Object.values(state.goals || {}).sort((a, b) => timeValue(b.createdAt) - timeValue(a.createdAt));
    if (!rows.length) {
        container.innerHTML = emptyBlock("Add a learning goal to track your progress.");
        return;
    }
    container.innerHTML = rows.map((goal) => `<article class="mentor-learning-card" style="display:block;">
        <h4 style="margin:0 0 8px; font-size:1.1rem;">${escapeHtml(goal.title || "Learning Goal")}</h4>
        <p style="margin:0 0 12px; font-size:0.85rem; color:#71819a;">${escapeHtml(goal.category || "General")} - ${Number(goal.progress || 0)}% complete</p>
        <span class="learning-status ${normalizeStatus(goal.status || "active")}">${escapeHtml(formatStatus(goal.status || "active"))}</span>
    </article>`).join("");
}

function renderReviews() {
    const container = document.getElementById("reviews-submitted-list");
    if (!container) return;
    const rows = Object.values(state.reviews || {});
    if (!rows.length) {
        container.innerHTML = emptyBlock("You have not submitted any mentor reviews yet.");
        return;
    }
    container.innerHTML = rows.map((review) => `<article class="learning-list-item">
        <div>
            <h4 style="margin:0; font-size:1.05rem;">${escapeHtml(mentorNameFor(review.mentorUid))}</h4>
            <p style="margin:4px 0 0; color:#536783; font-size:0.9rem;">${escapeHtml(review.overallRating || 0)} / 5 - Verified Session</p>
        </div>
        <p style="margin:0; font-size:0.9rem; color:#334155;">${escapeHtml(review.review || "No written review.")}</p>
    </article>`).join("");
}

function renderSavedOpportunities() {
    const grid = document.getElementById("saved-opportunities-grid");
    if (!grid) return;
    const saved = Object.values(state.savedOpportunities || {}).filter(s => s.type === state.activeSavedFilter);
    if (!saved.length) {
        grid.innerHTML = emptyBlock(`No saved ${state.activeSavedFilter} yet.`);
        return;
    }
    grid.innerHTML = saved.map(s => {
        let title = s.title || s.entityId;
        if (s.type === "courses" && state.courses[s.entityId]) title = state.courses[s.entityId].courseName || state.courses[s.entityId].name;
        if (s.type === "scholarships" && state.scholarships[s.entityId]) title = state.scholarships[s.entityId].scholarshipName || state.scholarships[s.entityId].name;
        if (s.type === "institutes" && state.institutes[s.entityId]) title = state.institutes[s.entityId].name;
        
        return `<article class="opportunity-card" style="display:flex; flex-direction:column; justify-content:space-between;">
            <div>
                <h4 style="margin:0 0 8px; font-size:1.1rem;">${escapeHtml(title)}</h4>
                <p style="margin:0; font-size:0.85rem; color:#94a3b8;">Saved on ${formatDate(s.savedAt)}</p>
            </div>
            <button class="btn btn-outline btn-sm mt-3" data-toggle-saved="${escapeAttr(s.entityId)}" data-saved-type="${escapeAttr(s.type)}">Remove Saved</button>
        </article>`;
    }).join("");
}

function renderApplications() {
    const list = document.getElementById("applications-list");
    if (!list) return;
    const apps = Object.values(state.opportunityApplications || {});
    if (!apps.length) {
        list.innerHTML = emptyBlock("No tracked applications yet.");
        return;
    }
    list.innerHTML = apps.map(app => `<article class="learning-list-item">
        <div>
            <h4 style="margin:0; font-size:1.05rem;">${escapeHtml(app.title)}</h4>
            <p style="margin:4px 0 0; color:#536783; font-size:0.9rem;">${escapeHtml(app.type)}</p>
        </div>
        <div><span class="learning-status ${normalizeStatus(app.status)}">${escapeHtml(formatStatus(app.status))}</span></div>
        <button class="btn btn-outline btn-sm" data-withdraw-app="${escapeAttr(app.applicationId)}">Withdraw / Delete</button>
    </article>`).join("");
}

// --- Cards & Helpers ---
function courseCard(course) {
    const saved = state.savedOpportunities[course.courseId];
    const applied = Object.values(state.opportunityApplications || {}).find(a => a.entityId === course.courseId);
    return `<article class="opportunity-card" style="display:flex; flex-direction:column; justify-content:space-between;">
        <div>
            <span style="display:inline-block; padding:4px 8px; border-radius:8px; font-size:0.75rem; font-weight:700; background:#eff6ff; color:#1d4ed8; margin-bottom:12px;">${course.matchScore}% Match</span>
            <h4 style="margin:0 0 8px; font-size:1.1rem; line-height:1.4;">${escapeHtml(course.courseName)}</h4>
            <p style="margin:0 0 12px; font-size:0.9rem; color:#64748b;"><i class="fas fa-university"></i> ${escapeHtml(course.instituteName)}</p>
        </div>
        <div style="display:flex; flex-direction:column; gap:8px;">
            <button class="btn btn-outline btn-sm" style="width:100%;" data-toggle-saved="${escapeAttr(course.courseId)}" data-saved-type="courses">${saved ? "Remove Saved" : "Save Course"}</button>
            ${applied ? `<button class="btn btn-primary btn-sm" disabled style="width:100%;">Applied</button>` : `<button class="btn btn-primary btn-sm" style="width:100%;" data-apply-opportunity="${escapeAttr(course.courseId)}" data-apply-type="courses" data-apply-title="${escapeAttr(course.courseName)}">Mark Applied</button>`}
        </div>
    </article>`;
}

function scholarshipCard(item) {
    const saved = state.savedOpportunities[item.scholarshipId];
    const applied = Object.values(state.opportunityApplications || {}).find(a => a.entityId === item.scholarshipId);
    return `<article class="opportunity-card" style="display:flex; flex-direction:column; justify-content:space-between;">
        <div>
            <span style="display:inline-block; padding:4px 8px; border-radius:8px; font-size:0.75rem; font-weight:700; background:#f0fdf4; color:#15803d; margin-bottom:12px;">${item.matchScore}% Match</span>
            <h4 style="margin:0 0 8px; font-size:1.1rem; line-height:1.4;">${escapeHtml(item.scholarshipName)}</h4>
            <p style="margin:0 0 12px; font-size:0.9rem; color:#64748b;">${escapeHtml(item.provider)}</p>
        </div>
        <div style="display:flex; flex-direction:column; gap:8px;">
            <button class="btn btn-outline btn-sm" style="width:100%;" data-toggle-saved="${escapeAttr(item.scholarshipId)}" data-saved-type="scholarships">${saved ? "Remove Saved" : "Save Scholarship"}</button>
            ${applied ? `<button class="btn btn-primary btn-sm" disabled style="width:100%;">Applied</button>` : `<button class="btn btn-primary btn-sm" style="width:100%;" data-apply-opportunity="${escapeAttr(item.scholarshipId)}" data-apply-type="scholarships" data-apply-title="${escapeAttr(item.scholarshipName)}">Mark Applied</button>`}
        </div>
    </article>`;
}

function instituteCard(inst) {
    const saved = state.savedOpportunities[inst.instituteId];
    return `<article class="opportunity-card" style="display:flex; flex-direction:column; justify-content:space-between;">
        <div>
            <span style="display:inline-block; padding:4px 8px; border-radius:8px; font-size:0.75rem; font-weight:700; background:#fdf2f8; color:#be185d; margin-bottom:12px;">${inst.matchScore}% Match</span>
            <h4 style="margin:0 0 8px; font-size:1.1rem; line-height:1.4;">${escapeHtml(inst.name)}</h4>
            <p style="margin:0 0 12px; font-size:0.9rem; color:#64748b;"><i class="fas fa-map-marker-alt"></i> ${escapeHtml(inst.district || inst.location)}</p>
        </div>
        <button class="btn btn-outline btn-sm mt-3" style="width:100%;" data-toggle-saved="${escapeAttr(inst.instituteId)}" data-saved-type="institutes">${saved ? "Remove Saved" : "Save Institute"}</button>
    </article>`;
}

// --- Interaction Handlers ---
function handlePageClick(event) {
    const jumpButton = event.target.closest("[data-section-jump]");
    if (jumpButton) {
        event.preventDefault();
        openLearningSection(jumpButton.dataset.sectionJump);
        return;
    }
    const requestButton = event.target.closest("[data-request-mentor]");
    if (requestButton) return openRequestModal(requestButton.dataset.requestMentor);
    const cancelButton = event.target.closest("[data-cancel-request]");
    if (cancelButton) return cancelRequest(cancelButton.dataset.cancelRequest);
    const chatButton = event.target.closest("[data-open-chat]");
    if (chatButton) return openChat(chatButton.dataset.openChat);
    const scheduleButton = event.target.closest("[data-schedule-session]");
    if (scheduleButton) return showToast("Meeting scheduling for mentor-to-mentor sessions is ready for the next implementation pass.", "info");

    const toggleSavedBtn = event.target.closest("[data-toggle-saved]");
    if (toggleSavedBtn) return toggleSaved(toggleSavedBtn.dataset.toggleSaved, toggleSavedBtn.dataset.savedType);

    const applyBtn = event.target.closest("[data-apply-opportunity]");
    if (applyBtn) return markApplied(applyBtn.dataset.applyOpportunity, applyBtn.dataset.applyType, applyBtn.dataset.applyTitle);

    const withdrawBtn = event.target.closest("[data-withdraw-app]");
    if (withdrawBtn) return withdrawApp(withdrawBtn.dataset.withdrawApp);
}

function openChat(conversationId) {
    const conversation = state.conversations[conversationId];
    if (!conversation) return showToast("Conversation is not available yet.", "warning");
    
    // Switch to messages section if not already
    if (state.activeSection !== "messages") {
        openLearningSection("messages");
    }

    state.activeConversationId = conversationId;
    setText("learning-chat-title", mentorNameFor(conversation.mentorUid));
    setText("learning-chat-subtitle", conversation.topic || "Learning conversation");
    renderChatThread(conversation);
    
    const input = document.getElementById("learning-chat-input");
    const btn = document.querySelector("#learning-chat-form button");
    if (input && btn) {
        input.disabled = false;
        btn.disabled = false;
    }
    
    // update active state in list
    document.querySelectorAll(".message-item").forEach(item => {
        item.classList.toggle("active", item.dataset.openChat === conversationId);
    });
}

function renderChatThread(conversation) {
    const thread = document.getElementById("learning-chat-thread");
    const messages = Object.values(conversation.messages || {}).sort((a, b) => timeValue(a.createdAt) - timeValue(b.createdAt));
    thread.innerHTML = messages.length ? messages.map((message) => `<div style="display:flex; flex-direction:column; align-items: ${message.senderUid === state.uid ? 'flex-end' : 'flex-start'};">
        <div style="max-width:75%; padding:10px 14px; border-radius:18px; ${message.senderUid === state.uid ? 'background:#2563eb; color:#fff; border-bottom-right-radius:4px;' : 'background:#e2e8f0; color:#0f1b3d; border-bottom-left-radius:4px;'}">
            <p style="margin:0; font-size:0.95rem;">${escapeHtml(message.text || message.message || "")}</p>
        </div>
        <span style="font-size:0.7rem; color:#94a3b8; margin-top:4px;">${escapeHtml(formatDateTime(message.createdAt))}</span>
    </div>`).join("") : `<div class="learning-empty-state" style="border:none; background:transparent;"><div class="empty-state-icon"><i class="fas fa-comments"></i></div><h3>No messages yet</h3><p>Send the first message.</p></div>`;
    thread.scrollTop = thread.scrollHeight;
}

// ... other existing functions (submitMentorshipRequest, saveLearningProfile, toggleSaved, etc.) are kept mostly the same internally ...

function populateLearningProfileForm() {
    const lp = state.learningProfile || {};
    document.getElementById("lp-currentEducationLevel").value = lp.currentEducationLevel || "";
    document.getElementById("lp-preferredFields").value = (lp.preferredFields || []).join(", ");
    document.getElementById("lp-careerGoals").value = (lp.careerGoals || []).join(", ");
    document.getElementById("lp-skillsToImprove").value = (lp.skillsToImprove || []).join(", ");
    document.getElementById("lp-preferredStudyModes").value = (lp.preferredStudyModes || []).join(", ");
    document.getElementById("lp-preferredLocations").value = (lp.preferredLocations || []).join(", ");
    document.getElementById("lp-budgetMax").value = lp.budgetMax || "";
    document.getElementById("lp-financialSupportNeeded").checked = !!lp.financialSupportNeeded;
}

async function saveLearningProfile(event) {
    event.preventDefault();
    const btn = document.getElementById("save-learning-profile-btn");
    if (btn) { btn.disabled = true; btn.textContent = "Saving..."; }
    try {
        const data = {
            currentEducationLevel: value("lp-currentEducationLevel"),
            preferredFields: value("lp-preferredFields").split(",").map(s => s.trim()).filter(Boolean),
            careerGoals: value("lp-careerGoals").split(",").map(s => s.trim()).filter(Boolean),
            skillsToImprove: value("lp-skillsToImprove").split(",").map(s => s.trim()).filter(Boolean),
            preferredStudyModes: value("lp-preferredStudyModes").split(",").map(s => s.trim()).filter(Boolean),
            preferredLocations: value("lp-preferredLocations").split(",").map(s => s.trim()).filter(Boolean),
            budgetMax: Number(value("lp-budgetMax") || 0),
            financialSupportNeeded: document.getElementById("lp-financialSupportNeeded").checked,
            updatedAt: serverTimestamp()
        };
        await update(ref(database, `learningProfiles/${state.uid}`), data);
        showToast("Learning profile saved. Recommendations updated.", "success");
    } catch (err) {
        showToast("Error saving profile.", "error");
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = "Save Profile"; }
    }
}

async function sendLearningMessage(event) {
    event.preventDefault();
    const conversation = state.conversations[state.activeConversationId];
    const text = value("learning-chat-input");
    if (!conversation || text.length < 1 || text.length > 1500) return showToast("Message must be 1 to 1500 characters.", "warning");
    
    document.getElementById("learning-chat-input").value = "";
    const receiverUid = conversation.mentorUid === state.uid ? conversation.menteeUid : conversation.mentorUid;
    const msgRef = push(ref(database, `conversations/${state.activeConversationId}/messages`));
    const notificationRef = push(ref(database, `notifications/${receiverUid}`));
    const updates = {};
    updates[`conversations/${state.activeConversationId}/messages/${msgRef.key}`] = { messageId: msgRef.key, senderUid: state.uid, receiverUid, text, read: false, createdAt: serverTimestamp() };
    updates[`conversations/${state.activeConversationId}/lastMessage`] = text;
    updates[`conversations/${state.activeConversationId}/lastMessageAt`] = serverTimestamp();
    updates[`conversations/${state.activeConversationId}/updatedAt`] = serverTimestamp();
    updates[`conversations/${state.activeConversationId}/unreadByMentor`] = Number(conversation.unreadByMentor || 0) + 1;
    updates[`notifications/${receiverUid}/${notificationRef.key}`] = { notificationId: notificationRef.key, type: "new_message", title: "New Learning Message", message: text.slice(0, 120), targetUserUid: receiverUid, senderUid: state.uid, senderRole: "mentor", relatedEntityType: "conversation", relatedEntityId: state.activeConversationId, conversationId: state.activeConversationId, targetPage: "mentor-dashboard.html", targetSection: "messages", read: false, status: "unread", createdAt: serverTimestamp() };
    
    await update(ref(database), updates);
}

function openRequestModal(mentorUid) {
    if (mentorUid === state.uid) return showToast("You cannot request mentorship from yourself.", "error");
    const mentor = state.mentors[mentorUid] || {};
    const user = state.mentorUsers[mentorUid] || {};
    if (!isAvailablePublicMentor({ ...user, ...mentor, uid: mentorUid }, state.uid)) return showToast("This mentor is not currently available.", "error");
    document.getElementById("request-target-mentor-uid").value = mentorUid;
    document.getElementById("request-modal-subtitle").textContent = `Send a mentorship request to ${mentor.fullName || user.fullName || "this mentor"}.`;
    document.getElementById("learning-request-form").reset();
    document.getElementById("request-duration").value = "60";
    document.getElementById("request-mentorship-modal").classList.remove("hidden");
}

function closeRequestModal() { document.getElementById("request-mentorship-modal")?.classList.add("hidden"); }

async function submitMentorshipRequest(event) {
    event.preventDefault();
    const mentorUid = value("request-target-mentor-uid");
    const mentor = state.mentors[mentorUid] || {};
    const mentorUser = state.mentorUsers[mentorUid] || {};
    const topic = value("request-topic");
    const category = value("request-category");
    const goal = value("request-goal");
    const message = value("request-message");
    const preferredMode = value("request-mode");
    const duration = Number(value("request-duration") || 0);
    clearRequestErrors();
    const errors = {
        "request-topic": topic.length < 3 || topic.length > 150 ? "Topic must be 3 to 150 characters." : "",
        "request-category": !category ? "Choose a guidance category." : "",
        "request-goal": goal.length < 20 || goal.length > 1000 ? "Learning goal must be 20 to 1000 characters." : "",
        "request-message": message.length < 20 || message.length > 1500 ? "Message must be 20 to 1500 characters." : "",
        "request-mode": !preferredMode ? "Choose a preferred mode." : "",
        "request-duration": duration < 15 || duration > 240 ? "Duration must be 15 to 240 minutes." : ""
    };
    Object.entries(errors).forEach(([id, error]) => setText(`${id}-error`, error));
    if (Object.values(errors).some(Boolean)) return showToast("Please fix the highlighted request fields.", "warning");
    if (mentorUid === state.uid) return showToast("You cannot request mentorship from yourself.", "error");
    if (!isAccountActive(state.user) || !isAvailablePublicMentor({ ...mentorUser, ...mentor, uid: mentorUid }, state.uid)) return showToast("This mentor is not currently available.", "error");
    const existingSnap = await get(query(ref(database, "mentorshipRequests"), orderByChild("requesterUid"), equalTo(state.uid))).catch(() => null);
    if (activeRequestFor(existingSnap?.val?.() || {}, state.uid, mentorUid, topic)) return showToast("You already have an active mentorship request with this mentor.", "warning");

    const requestRef = push(ref(database, "mentorshipRequests"));
    const notificationRef = push(ref(database, `notifications/${mentorUid}`));
    const requesterName = state.user.fullName || state.mentorProfile.fullName || "Mentor";
    const mentorName = mentor.fullName || mentorUser.fullName || "Mentor";
    const requestRecord = {
        requestId: requestRef.key,
        requesterUid: state.uid,
        requesterName,
        requesterPhotoURL: state.user.photoURL || state.mentorProfile.photoURL || "",
        requesterAccountRole: accountRole(state.user) || "mentor",
        requesterRelationshipRole: "mentee",
        targetMentorUid: mentorUid,
        targetMentorName: mentorName,
        targetMentorPhotoURL: mentor.photoURL || mentorUser.photoURL || "",
        topic,
        category,
        goal,
        message,
        preferredMode,
        preferredSessionDuration: duration,
        preferredDays: value("request-days"),
        urgency: value("request-urgency") || "normal",
        requestSource: "mentor_to_mentor",
        status: "pending",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        respondedAt: null
    };
    const updates = {};
    updates[`mentorshipRequests/${requestRef.key}`] = requestRecord;
    updates[`notifications/${mentorUid}/${notificationRef.key}`] = { notificationId: notificationRef.key, type: "mentorship_request_received", title: "New Mentorship Request", message: `${requesterName} requested mentorship in ${topic}.`, targetUserUid: mentorUid, senderUid: state.uid, senderRole: "mentor", relatedEntityType: "mentorship_request", relatedEntityId: requestRef.key, requestId: requestRef.key, targetPage: "mentor-dashboard.html", targetSection: "requests", read: false, status: "unread", createdAt: serverTimestamp() };
    await update(ref(database), updates);
    closeRequestModal();
    showToast("Mentorship request sent.", "success");
}

async function cancelRequest(requestId) {
    if (!requestId) return;
    await update(ref(database, `mentorshipRequests/${requestId}`), { status: "cancelled", updatedAt: serverTimestamp() });
    showToast("Request cancelled.", "success");
}

async function addLearningGoal() {
    const title = prompt("Learning goal title:");
    if (!title) return;
    const goalRef = push(ref(database, `learningGoals/${state.uid}`));
    await update(ref(database), { [`learningGoals/${state.uid}/${goalRef.key}`]: { goalId: goalRef.key, uid: state.uid, title: title.trim(), category: "General", description: "", targetDate: "", relatedMentorUid: "", relatedConnectionId: "", progress: 0, status: "active", createdAt: serverTimestamp(), updatedAt: serverTimestamp() } });
    showToast("Learning goal added.", "success");
}

function syncConversationListeners() {
    const ids = new Set(activeConnections().map((connection) => conversationIdFor(connection.mentorUid, state.uid)));
    Object.entries(state.conversationRefs).forEach(([id, dbRef]) => {
        if (!ids.has(id)) {
            off(dbRef);
            delete state.conversationRefs[id];
            delete state.conversations[id];
        }
    });
    ids.forEach((id) => {
        if (state.conversationRefs[id]) return;
        const dbRef = ref(database, `conversations/${id}`);
        state.conversationRefs[id] = dbRef;
        onValue(dbRef, (snap) => {
            if (snap.exists()) state.conversations[id] = snap.val();
            else delete state.conversations[id];
            if (state.activeSection === "messages") {
                renderMessages();
                if (state.activeConversationId === id) openChat(id);
            }
        });
    });
}

async function toggleSaved(entityId, type) {
    if (!entityId) return;
    const existing = state.savedOpportunities[entityId];
    if (existing) {
        await remove(ref(database, `savedOpportunities/${state.uid}/${entityId}`));
        showToast("Removed from saved.", "success");
    } else {
        await update(ref(database, `savedOpportunities/${state.uid}/${entityId}`), {
            entityId,
            type,
            savedAt: serverTimestamp()
        });
        showToast("Opportunity saved.", "success");
    }
}

async function markApplied(entityId, type, title) {
    if (!entityId) return;
    const appRef = push(ref(database, `opportunityApplications/${state.uid}`));
    await update(ref(database, `opportunityApplications/${state.uid}/${appRef.key}`), {
        applicationId: appRef.key,
        entityId,
        type,
        title,
        status: "applied",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    });
    showToast("Application marked as tracked.", "success");
}

async function withdrawApp(appId) {
    if (!appId) return;
    await remove(ref(database, `opportunityApplications/${state.uid}/${appId}`));
    showToast("Application tracking removed.", "success");
}

// Basic Helpers
function normalizedRequests() { return Object.values({ ...state.requests, ...state.legacyRequests }).map(normalizeMentorshipRequest).sort((a, b) => timeValue(b.createdAt) - timeValue(a.createdAt)); }
function activeConnections() { return Object.values(state.connections || {}).map(normalizeConnection).filter((item) => item.menteeUid === state.uid && ["active", "connected"].includes(normalizeStatus(item.status))); }
function value(id) { return String(document.getElementById(id)?.value || "").trim(); }
function setText(id, value) { const el = document.getElementById(id); if (el) el.textContent = value ?? ""; }
function clearRequestErrors() { ["request-topic", "request-category", "request-goal", "request-message", "request-mode", "request-duration"].forEach((id) => setText(`${id}-error`, "")); }
function escapeHtml(value) { const div = document.createElement("div"); div.textContent = value == null ? "" : String(value); return div.innerHTML; }
function escapeAttr(value) { return escapeHtml(value).replace(/"/g, "&quot;"); }
function displayValue(value) { const list = normalizeList(value); return list.length ? list.join(", ") : (value || "N/A"); }
function avatar(photo, name) { return photo ? `<img src="${escapeAttr(photo)}" style="width:44px; height:44px; border-radius:50%; object-fit:cover;" alt="">` : `<div style="width:44px; height:44px; border-radius:50%; background:#dbeafe; color:#1d4ed8; display:grid; place-items:center; font-weight:700;">${escapeHtml(initials(name))}</div>`; }
function initials(name) { return String(name || "ML").split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase(); }
function emptyBlock(message) { return `<div class="learning-empty-state"><div class="empty-state-icon"><i class="fas fa-inbox"></i></div><h3>Nothing here yet</h3><p>${escapeHtml(message)}</p></div>`; }
function compactEmpty(message) { return `<div style="padding:16px; background:#f8fafc; border-radius:12px; border:1px dashed #cbd5e1; text-align:center; color:#64748b; font-size:0.9rem;">${escapeHtml(message)}</div>`; }
function formatStatus(value) { return String(value || "pending").replace(/_/g, " ").replace(/^./, (char) => char.toUpperCase()); }
function mentorNameFor(uid) { const mentor = state.mentors[uid] || {}; const user = state.mentorUsers[uid] || {}; return mentor.fullName || user.fullName || "Mentor"; }
function conversationIdFor(mentorUid, menteeUid) { return `mentor_${mentorUid}_${menteeUid}`; }
function timeValue(value) { if (!value) return 0; if (typeof value === "number") return value; if (value.seconds) return value.seconds * 1000; return new Date(value).getTime() || 0; }
function sessionTime(session) { return timeValue(session.startDateTime || session.sessionAt || (session.date && `${session.date}T${session.startTime || "00:00"}`)); }
function formatDate(value) { const time = timeValue(value); return time ? new Date(time).toLocaleDateString() : "N/A"; }
function formatDateTime(value) { const time = timeValue(value); return time ? new Date(time).toLocaleString() : "N/A"; }
