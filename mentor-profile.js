import { auth, database } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { ref, get, push, set, update, serverTimestamp, query, orderByChild, equalTo } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
import { showToast } from "./auth-nav.js?v=20260614-brand";
import { requiredText, validateForm } from "./validation.js";
import { getDashboardDestination, getProfileDestination } from "./shared-navigation.js";
import { publicReviewRows, ratingLabel } from "./ratings.js";

document.addEventListener('DOMContentLoaded', () => {
    // URL Parameter Extraction
    const params = new URLSearchParams(window.location.search);
    const mentorUid = params.get("uid");

    // DOM References
    const skeletonLoader = document.getElementById('skeleton-loader');
    const errorScreen = document.getElementById('error-screen');
    const profileContent = document.getElementById('profile-content');
    const errorTitle = document.getElementById('error-title');
    const errorDesc = document.getElementById('error-desc');
    const adminBanner = document.getElementById('admin-banner');
    const connectCardDesc = document.getElementById('connect-card-desc');

    // Hero DOM elements
    const heroPhoto = document.getElementById('public-mentor-photo');
    const heroName = document.getElementById('public-mentor-name');
    const heroField = document.getElementById('public-mentor-field');
    const heroPosition = document.getElementById('public-mentor-position');
    const heroMeta = document.getElementById('public-mentor-meta');
    const heroActions = document.getElementById('public-mentor-actions');
    const availabilityBadge = document.getElementById('mentor-availability-badge');

    // Modal DOM elements
    const requestModal = document.getElementById('mentor-request-modal');
    const closeRequestModal = document.getElementById('close-request-modal');
    const btnCancelRequest = document.getElementById('btn-cancel-request');
    const requestForm = document.getElementById('mentor-request-form');
    const modalMentorName = document.getElementById('modal-mentor-name');

    // Mobile menu DOM elements
    const hamburger = document.querySelector('.public-site-header .hamburger');
    const mobileMenu = document.querySelector('.mobile-menu');
    const mobileCloseBtn = document.querySelector('.mobile-menu .close-btn');

    // Wire up hamburger menu toggle
    if (hamburger && mobileMenu) {
        hamburger.addEventListener('click', () => {
            mobileMenu.classList.add('active');
        });
    }
    if (mobileCloseBtn && mobileMenu) {
        mobileCloseBtn.addEventListener('click', () => {
            mobileMenu.classList.remove('active');
        });
    }

    // Sidebar DOM elements
    const connectionActions = document.getElementById('connection-actions');
    const availabilityContent = document.getElementById('availability-content');
    const qualificationsContent = document.getElementById('qualifications-content');
    const languagesContent = document.getElementById('languages-content');
    const publicLinksContent = document.getElementById('public-links-content');

    // State Variables
    let currentUser = null;
    let currentUserData = null;
    let currentStudentData = null;
    let currentUserType = null;
    let mentorProfile = null;
    let existingRequest = null;
    let mentorRatingSummary = {};
    let mentorPublicReviews = {};

    if (!mentorUid) {
        renderMentorProfileError("No mentor profile was selected.");
        return;
    }

    // Initialize Auth listener and load profile
    onAuthStateChanged(auth, async (user) => {
        currentUser = user;
        if (user) {
            try {
                const userRef = ref(database, 'users/' + user.uid);
                const snapshot = await get(userRef);
                if (snapshot.exists()) {
                    currentUserData = snapshot.val();
                    currentUserType = String(currentUserData.userType || currentUserData.role || '').toLowerCase();
                    if (currentUserType === 'student') {
                        const studentSnap = await get(ref(database, 'students/' + user.uid));
                        if (studentSnap.exists()) {
                            currentStudentData = studentSnap.val();
                        }
                    }
                }
            } catch (error) {
                console.error("Error loading current user data:", error);
            }
        }
        loadMentorProfile();
    });

    // --- Helper Functions ---
    function normalizeStatus(value) {
        return String(value || "")
            .trim()
            .toLowerCase()
            .replace(/\s+/g, "*")
            .replace(/-/g, "*");
    }

    function isPublicApprovedMentor(mentor, user = {}) {
        return (
            normalizeStatus(
                mentor.approvalStatus ||
                mentor.applicationStatus ||
                mentor.status
            ) === "approved" &&
            mentor.publicVisibility === true &&
            mentor.mentoringEnabled === true &&
            normalizeStatus(
                user.accountStatus ||
                mentor.accountStatus ||
                "active"
            ) === "active"
        );
    }

    function normalizeList(value) {
        if (Array.isArray(value)) {
            return value.filter(Boolean);
        }
        if (value && typeof value === "object") {
            return Object.entries(value)
                .filter(([, enabled]) => enabled)
                .map(([key]) => key);
        }
        return String(value || "")
            .split(",")
            .map(item => item.trim())
            .filter(Boolean);
    }

    function safePublicUrl(value) {
        try {
            const url = new URL(value);
            return ["http:", "https:"].includes(url.protocol) ? url.href : "";
        } catch {
            return "";
        }
    }

    function sanitize(text) {
        if (!text) return "";
        const div = document.createElement("div");
        div.textContent = text;
        return div.innerHTML;
    }

    function renderMentorProfileError(message) {
        skeletonLoader.classList.add('hidden');
        profileContent.classList.add('hidden');
        errorTitle.textContent = "Profile Unavailable";
        errorDesc.textContent = message || "This mentor profile is currently unavailable.";
        errorScreen.classList.remove('hidden');
    }

    // --- Load Data ---
    async function loadMentorProfile() {
        try {
            const [
                userData,
                mentorData,
                availabilityData,
                applicationData,
                ratingSummaryData,
                publicReviewsData
            ] = await Promise.all([
                get(ref(database, `users/${mentorUid}`)).then(s => s.val() || {}).catch(() => ({})),
                get(ref(database, `mentors/${mentorUid}`)).then(s => s.val() || {}).catch(() => ({})),
                get(ref(database, `mentorAvailability/${mentorUid}`)).then(s => s.val() || {}).catch(() => ({})),
                get(ref(database, `mentorApplications/${mentorUid}`)).then(s => s.val() || {}).catch(() => ({})),
                get(ref(database, `mentorRatingSummaries/${mentorUid}`)).then(s => s.val() || {}).catch(() => ({})),
                get(ref(database, `publicMentorReviews/${mentorUid}`)).then(s => s.val() || {}).catch(() => ({}))
            ]);

            // Enforce verification
            if (!isPublicApprovedMentor(mentorData, userData)) {
                renderMentorProfileError("This mentor profile is currently unavailable.");
                return;
            }

            // Merge data (priority to mentors/{uid})
            mentorProfile = {
                ...userData,
                ...applicationData,
                ...mentorData,
                availability: availabilityData,
                uid: mentorUid
            };
            mentorRatingSummary = ratingSummaryData || {};
            mentorPublicReviews = publicReviewsData || {};

            // Check existing request
            if (currentUser && currentUserType === 'student') {
                const requestSnap = await get(
                    query(ref(database, 'mentorRequests'), orderByChild('studentUid'), equalTo(currentUser.uid))
                );
                if (requestSnap.exists()) {
                    const requests = requestSnap.val();
                    existingRequest = Object.values(requests).find(
                        r => r.mentorUid === mentorUid && ['pending', 'accepted', 'connected'].includes(String(r.status || '').toLowerCase())
                    );
                }
            }

            renderProfile();

        } catch (error) {
            console.error("Error loading mentor profile details:", error);
            renderMentorProfileError("We could not load this mentor profile. Please try again.");
        }
    }

    // --- Render Profile ---
    function renderProfile() {
        // Hide Skeleton loader
        skeletonLoader.classList.add('hidden');
        errorScreen.classList.add('hidden');
        profileContent.classList.remove('hidden');

        // Hero image fallback & details
        const photoUrl = mentorProfile.photoURL || mentorProfile.avatar || "images/default-mentor-avatar.png";
        heroPhoto.src = photoUrl;
        heroPhoto.onerror = function() {
            this.onerror = null;
            this.src = "images/default-mentor-avatar.png";
        };

        heroName.textContent = mentorProfile.fullName || "Unnamed Mentor";
        heroField.textContent = mentorProfile.field || mentorProfile.mentoringField || "Mentor";
        
        const org = mentorProfile.universityOrCompany || mentorProfile.organization || mentorProfile.currentOrganization || "";
        const pos = mentorProfile.currentPosition || mentorProfile.designation || "";
        if (pos && org) {
            heroPosition.textContent = `${pos} at ${org}`;
        } else if (pos || org) {
            heroPosition.textContent = pos || org;
        } else {
            heroPosition.textContent = "";
        }

        // Availability Badge
        const availabilityStatus = mentorProfile.availabilityStatus || mentorProfile.availability?.status || "Available";
        availabilityBadge.textContent = availabilityStatus;
        if (normalizeStatus(availabilityStatus) === "available" || normalizeStatus(availabilityStatus) === "active") {
            availabilityBadge.className = "availability-badge";
        } else {
            availabilityBadge.className = "availability-badge unavailable";
        }

        // Quick Meta chips
        heroMeta.innerHTML = "";
        const quickChips = [];
        if (mentorProfile.experience) {
            quickChips.push(`<span><i class="fas fa-briefcase" aria-hidden="true"></i> ${sanitize(mentorProfile.experience)} years experience</span>`);
        }
        if (mentorProfile.district || mentorProfile.location) {
            quickChips.push(`<span><i class="fas fa-location-dot" aria-hidden="true"></i> ${sanitize(mentorProfile.district || mentorProfile.location)}</span>`);
        }
        
        const prefLangs = normalizeList(mentorProfile.languages || mentorProfile.preferredLanguages || mentorProfile.language);
        if (prefLangs.length > 0) {
            quickChips.push(`<span><i class="fas fa-language" aria-hidden="true"></i> ${prefLangs.map(sanitize).join(', ')}</span>`);
        }

        const mode = mentorProfile.mentoringMode || mentorProfile.mode;
        if (mode) {
            quickChips.push(`<span><i class="fas fa-video" aria-hidden="true"></i> ${sanitize(mode)}</span>`);
        }
        if (Number(mentorRatingSummary.totalRatings || 0) > 0) {
            quickChips.push(`<span><i class="fas fa-star" aria-hidden="true"></i> ${sanitize(ratingLabel(mentorRatingSummary))}</span>`);
            quickChips.push(`<span><i class="fas fa-thumbs-up" aria-hidden="true"></i> ${sanitize(mentorRatingSummary.recommendationPercentage || 0)}% recommend</span>`);
        }
        heroMeta.innerHTML = quickChips.join('');

        // Bio section
        const bioText = document.getElementById('mentor-bio-text');
        if (mentorProfile.bio || mentorProfile.biography) {
            bioText.textContent = mentorProfile.bio || mentorProfile.biography;
            document.getElementById('section-about').classList.remove('hidden');
        } else {
            bioText.textContent = "This mentor has not added a detailed biography yet.";
        }

        // Professional Background Detail Grid
        const gridContainer = document.getElementById('mentor-detail-grid');
        gridContainer.innerHTML = "";
        const details = [
            { label: "Current Position", val: pos },
            { label: "Organization", val: org },
            { label: "Highest Qualification", val: mentorProfile.highestQualification || mentorProfile.qualification },
            { label: "Study Area", val: mentorProfile.studyArea || mentorProfile.fieldOfStudy },
            { label: "Years of Experience", val: mentorProfile.experience ? `${mentorProfile.experience} years` : "" },
            { label: "Professional Membership", val: mentorProfile.professionalMembership || mentorProfile.memberships },
            { label: "Mentor Type", val: mentorProfile.mentorType || mentorProfile.role }
        ];

        let detailCount = 0;
        details.forEach(det => {
            if (det.val && String(det.val).trim() !== "" && !["n/a", "null", "undefined"].includes(String(det.val).toLowerCase())) {
                const item = document.createElement('div');
                item.className = "mentor-detail-item";
                item.innerHTML = `<span>${sanitize(det.label)}</span><strong>${sanitize(det.val)}</strong>`;
                gridContainer.appendChild(item);
                detailCount++;
            }
        });
        if (detailCount === 0) {
            document.getElementById('section-background').classList.add('hidden');
        } else {
            document.getElementById('section-background').classList.remove('hidden');
        }

        // Expertise list
        const skillsList = document.getElementById('mentor-skills-list');
        const expertiseTags = normalizeList(mentorProfile.expertise || mentorProfile.skills || mentorProfile.majorSkills);
        skillsList.innerHTML = "";
        expertiseTags.forEach(tag => {
            const span = document.createElement('span');
            span.className = "mentor-tag";
            span.textContent = tag;
            skillsList.appendChild(span);
        });
        if (expertiseTags.length === 0) {
            document.getElementById('section-expertise').classList.add('hidden');
        } else {
            document.getElementById('section-expertise').classList.remove('hidden');
        }

        // Guidance areas
        const guidanceList = document.getElementById('mentor-guidance-list');
        const guidanceTags = normalizeList(mentorProfile.guidanceAreas || mentorProfile.adviceAreas || mentorProfile.mentoringTopics);
        guidanceList.innerHTML = "";
        guidanceTags.forEach(tag => {
            const span = document.createElement('span');
            span.className = "mentor-tag";
            span.textContent = tag;
            guidanceList.appendChild(span);
        });
        if (guidanceTags.length === 0) {
            document.getElementById('section-guidance').classList.add('hidden');
        } else {
            document.getElementById('section-guidance').classList.remove('hidden');
        }

        renderPublicReviews();

        // Student Levels and Streams
        const studentLevelsList = document.getElementById('student-levels-list');
        const studentLevelsTags = normalizeList(mentorProfile.supportedStudentLevels || mentorProfile.studentLevels);
        studentLevelsList.innerHTML = "";
        studentLevelsTags.forEach(tag => {
            const span = document.createElement('span');
            span.className = "mentor-tag";
            span.textContent = tag;
            studentLevelsList.appendChild(span);
        });
        if (studentLevelsTags.length === 0) {
            document.getElementById('group-student-levels').classList.add('hidden');
        } else {
            document.getElementById('group-student-levels').classList.remove('hidden');
        }

        const studentStreamsList = document.getElementById('student-streams-list');
        const studentStreamsTags = normalizeList(mentorProfile.supportedStreams || mentorProfile.streams || mentorProfile.fieldsOfStudy);
        studentStreamsList.innerHTML = "";
        studentStreamsTags.forEach(tag => {
            const span = document.createElement('span');
            span.className = "mentor-tag";
            span.textContent = tag;
            studentStreamsList.appendChild(span);
        });
        if (studentStreamsTags.length === 0) {
            document.getElementById('group-student-streams').classList.add('hidden');
        } else {
            document.getElementById('group-student-streams').classList.remove('hidden');
        }

        if (studentLevelsTags.length === 0 && studentStreamsTags.length === 0) {
            document.getElementById('section-students-streams').classList.add('hidden');
        } else {
            document.getElementById('section-students-streams').classList.remove('hidden');
        }

        // Why I Mentor
        const whyMentorText = document.getElementById('why-mentor-text');
        if (mentorProfile.whyMentor || mentorProfile.purpose) {
            whyMentorText.textContent = `“ ${mentorProfile.whyMentor || mentorProfile.purpose} ”`;
            document.getElementById('section-why-mentor').classList.remove('hidden');
        } else {
            document.getElementById('section-why-mentor').classList.add('hidden');
        }

        // Student Expectations
        const expectationsText = document.getElementById('student-expectations-text');
        if (mentorProfile.studentExpectation || mentorProfile.expectationsFromStudents) {
            expectationsText.textContent = mentorProfile.studentExpectation || mentorProfile.expectationsFromStudents;
            document.getElementById('section-expectations').classList.remove('hidden');
        } else {
            document.getElementById('section-expectations').classList.add('hidden');
        }

        // --- Sidebar Hydration ---

        // Availability Details
        availabilityContent.innerHTML = "";
        const avail = mentorProfile.availability || {};
        const availableDays = normalizeList(avail.availableDays || mentorProfile.availableDays || mentorProfile.availableTime);
        const availItems = [];
        if (availableDays.length > 0) {
            availItems.push(`<div class="sidebar-detail-item"><span>Available Days</span><strong>${availableDays.map(sanitize).join(', ')}</strong></div>`);
        }
        if (mode) {
            availItems.push(`<div class="sidebar-detail-item"><span>Mode</span><strong>${sanitize(mode)}</strong></div>`);
        }
        if (avail.sessionDuration || mentorProfile.sessionDuration) {
            availItems.push(`<div class="sidebar-detail-item"><span>Session Duration</span><strong>${sanitize(avail.sessionDuration || mentorProfile.sessionDuration)} minutes</strong></div>`);
        }
        if (avail.timezone || mentorProfile.timezone) {
            availItems.push(`<div class="sidebar-detail-item"><span>Timezone</span><strong>${sanitize(avail.timezone || mentorProfile.timezone)}</strong></div>`);
        }
        if (mentorProfile.maxStudents || avail.maxStudents) {
            availItems.push(`<div class="sidebar-detail-item"><span>Max Students Limit</span><strong>${sanitize(mentorProfile.maxStudents || avail.maxStudents)} active students</strong></div>`);
        }

        if (availItems.length === 0) {
            document.getElementById('sidebar-availability-card').classList.add('hidden');
        } else {
            availabilityContent.innerHTML = availItems.join('');
            document.getElementById('sidebar-availability-card').classList.remove('hidden');
        }

        // Qualifications Details
        qualificationsContent.innerHTML = "";
        const qualItems = [];
        const highestQ = mentorProfile.highestQualification || mentorProfile.qualification;
        const studyA = mentorProfile.studyArea || mentorProfile.fieldOfStudy;
        const memberships = mentorProfile.professionalMembership || mentorProfile.memberships;
        if (highestQ) {
            qualItems.push(`<div class="sidebar-detail-item"><span>Highest Qualification</span><strong>${sanitize(highestQ)}</strong></div>`);
        }
        if (studyA) {
            qualItems.push(`<div class="sidebar-detail-item"><span>Study Area</span><strong>${sanitize(studyA)}</strong></div>`);
        }
        if (memberships) {
            qualItems.push(`<div class="sidebar-detail-item"><span>Professional Membership</span><strong>${sanitize(memberships)}</strong></div>`);
        }

        if (qualItems.length === 0) {
            document.getElementById('sidebar-qualifications-card').classList.add('hidden');
        } else {
            qualificationsContent.innerHTML = qualItems.join('');
            document.getElementById('sidebar-qualifications-card').classList.remove('hidden');
        }

        // Languages
        languagesContent.innerHTML = "";
        if (prefLangs.length > 0) {
            languagesContent.innerHTML = `<div class="sidebar-detail-item"><span>Preferred Languages</span><strong>${prefLangs.map(sanitize).join(', ')}</strong></div>`;
            document.getElementById('sidebar-languages-card').classList.remove('hidden');
        } else {
            document.getElementById('sidebar-languages-card').classList.add('hidden');
        }

        // Public Links
        publicLinksContent.innerHTML = "";
        const linkItems = [];
        if (mentorProfile.linkedin || mentorProfile.linkedInURL) {
            const val = safePublicUrl(mentorProfile.linkedin || mentorProfile.linkedInURL);
            if (val) linkItems.push(`<a href="${val}" target="_blank" rel="noopener noreferrer" class="public-link-btn"><i class="fab fa-linkedin" style="color: #0077b5;"></i> LinkedIn Profile</a>`);
        }
        if (mentorProfile.portfolio || mentorProfile.portfolioURL) {
            const val = safePublicUrl(mentorProfile.portfolio || mentorProfile.portfolioURL);
            if (val) linkItems.push(`<a href="${val}" target="_blank" rel="noopener noreferrer" class="public-link-btn"><i class="fas fa-globe" style="color: #0ea5e9;"></i> Portfolio Website</a>`);
        }
        if (mentorProfile.website || mentorProfile.professionalWebsite) {
            const val = safePublicUrl(mentorProfile.website || mentorProfile.professionalWebsite);
            if (val) linkItems.push(`<a href="${val}" target="_blank" rel="noopener noreferrer" class="public-link-btn"><i class="fas fa-briefcase" style="color: #6366f1;"></i> Professional Website</a>`);
        }

        if (linkItems.length === 0) {
            document.getElementById('sidebar-links-card').classList.add('hidden');
        } else {
            publicLinksContent.innerHTML = linkItems.join('');
            document.getElementById('sidebar-links-card').classList.remove('hidden');
        }

        // --- Connection Action Buttons ---
        hydrateConnectionActions();
    }

    function renderPublicReviews() {
        const section = document.getElementById('section-reviews');
        const summaryEl = document.getElementById('mentor-rating-summary');
        const listEl = document.getElementById('mentor-review-list');
        if (!section || !summaryEl || !listEl) return;
        const reviews = publicReviewRows(mentorPublicReviews);
        const total = Number(mentorRatingSummary.totalRatings || 0);
        if (!total && reviews.length === 0) {
            section.classList.add('hidden');
            return;
        }
        section.classList.remove('hidden');
        summaryEl.innerHTML = `
            <article class="rating-summary-card">
                <strong>${sanitize(Number(mentorRatingSummary.averageRating || 0).toFixed(1))}</strong>
                <span>Average Rating</span>
            </article>
            <article class="rating-summary-card">
                <strong>${sanitize(total)}</strong>
                <span>Verified Reviews</span>
            </article>
            <article class="rating-summary-card">
                <strong>${sanitize(mentorRatingSummary.recommendationPercentage || 0)}%</strong>
                <span>Would Recommend</span>
            </article>
        `;
        if (!reviews.length) {
            listEl.innerHTML = `<div class="empty-state compact"><p>No written reviews are published yet.</p></div>`;
            return;
        }
        listEl.innerHTML = reviews.slice(0, 6).map((review) => `
            <article class="review-card">
                <div class="review-card-head">
                    <strong>${sanitize(review.studentDisplayName || "Verified Student")}</strong>
                    <span class="review-stars">${sanitize(review.overallRating || 0)} / 5</span>
                </div>
                <p>${sanitize(review.review)}</p>
                <span class="verified-review-badge"><i class="fas fa-check-circle"></i> Verified completed session</span>
            </article>
        `).join('');
    }

    // --- Connection State Hydration ---
    function hydrateConnectionActions() {
        connectionActions.innerHTML = "";
        heroActions.innerHTML = "";

        // Handle Admin Banner
        if (currentUserType === 'admin') {
            if (adminBanner) adminBanner.classList.remove('hidden');
        } else {
            if (adminBanner) adminBanner.classList.add('hidden');
        }

        if (!currentUser) {
            // Guest User State
            const btns = `
                <a href="login.html?redirect=mentor-profile.html?uid=${encodeURIComponent(mentorUid)}&msg=login_required" class="btn btn-primary"><i class="fas fa-sign-in-alt"></i> Login to Request Mentorship</a>
                <a href="signup.html" class="btn btn-outline"><i class="fas fa-user-plus"></i> Create Student Account</a>
            `;
            heroActions.innerHTML = btns;
            connectionActions.innerHTML = btns;
            if (connectCardDesc) {
                connectCardDesc.textContent = "Log in or sign up as a student to connect with this mentor and schedule sessions.";
            }
        } else if (currentUser.uid === mentorUid) {
            // Self Profile State
            const btns = `
                <a href="${getDashboardDestination('mentor')}" class="btn btn-primary"><i class="fas fa-tachometer-alt"></i> Open My Dashboard</a>
                <a href="${getProfileDestination('mentor')}" class="btn btn-outline"><i class="fas fa-edit"></i> Edit My Profile</a>
            `;
            heroActions.innerHTML = btns;
            connectionActions.innerHTML = btns;
            if (connectCardDesc) {
                connectCardDesc.textContent = "This is how your profile appears to the public. You can update your biography, experience, and availability details from your profile editor.";
            }
        } else if (currentUserType === 'admin') {
            // Admin User State
            heroActions.innerHTML = `
                <a href="admin-dashboard.html#mentors" class="btn btn-primary"><i class="fas fa-user-shield"></i> View Admin Record</a>
                <a href="admin-dashboard.html" class="btn btn-outline"><i class="fas fa-arrow-left"></i> Return to Admin Dashboard</a>
            `;
            connectionActions.innerHTML = ""; // No buttons in connect card for Admin
            if (connectCardDesc) {
                connectCardDesc.textContent = "You are viewing this profile as an administrator. You can view their registration details or manage approval status from the admin dashboard.";
            }
        } else if (mentorProfile.loginEnabled === false || mentorProfile.isManualProfile === true) {
            const buttons = `<a href="contact.html?subject=${encodeURIComponent(`Guidance request for ${mentorProfile.fullName || 'manual mentor'}`)}" class="btn btn-primary"><i class="fas fa-headset"></i> Request Guidance / Contact Admin</a><a href="mentors.html" class="btn btn-outline"><i class="fas fa-users"></i> View Other Mentors</a>`;
            heroActions.innerHTML = buttons;
            connectionActions.innerHTML = buttons;
            if (connectCardDesc) connectCardDesc.textContent = "This mentor profile is managed by EduPath Lanka. Contact the admin team to arrange guidance; direct messaging and mentor login are not available.";        } else if (currentUserType === 'mentor') {
            // Logged in Mentor (other) State
            const btns = `<a class="btn btn-primary" href="mentor-learning.html?mentor=${encodeURIComponent(mentorUid)}#find-mentor"><i class="fas fa-paper-plane"></i> Request Mentorship</a><a class="btn btn-outline" href="mentor-learning.html"><i class="fas fa-graduation-cap"></i> Open My Learning</a>`;
            heroActions.innerHTML = btns;
            connectionActions.innerHTML = btns;
            if (connectCardDesc) {
                connectCardDesc.textContent = "Request mentorship from this approved mentor while keeping your own mentor profile active.";
            }
        } else if (currentUserType === 'student') {
            // Logged in Student State
            if (existingRequest) {
                const reqStatus = String(existingRequest.status || '').toLowerCase();
                if (reqStatus === 'pending') {
                    const btns = `
                        <button type="button" class="btn btn-primary" disabled><i class="fas fa-clock"></i> Request Pending</button>
                        <a href="student-dashboard.html#messages" class="btn btn-outline"><i class="fas fa-comments"></i> Open Messages</a>
                    `;
                    heroActions.innerHTML = btns;
                    connectionActions.innerHTML = btns;
                    if (connectCardDesc) {
                        connectCardDesc.textContent = "Your mentorship request has been sent and is currently pending review by the mentor.";
                    }
                } else if (reqStatus === 'accepted' || reqStatus === 'connected') {
                    const btns = `
                        <a href="student-dashboard.html#messages" class="btn btn-primary"><i class="fas fa-comments"></i> Open Messages</a>
                        <a href="student-dashboard.html#appointments" class="btn btn-outline"><i class="fas fa-calendar-alt"></i> View Appointments</a>
                    `;
                    heroActions.innerHTML = btns;
                    connectionActions.innerHTML = btns;
                    if (connectCardDesc) {
                        connectCardDesc.textContent = "You are connected with this mentor. You can send them messages or view your appointments.";
                    }
                }
            } else {
                // Unconnected Student
                const heroBtns = `
                    <button type="button" class="btn btn-primary" id="action-request-mentor-hero"><i class="fas fa-paper-plane"></i> Request This Mentor</button>
                    <button type="button" class="btn btn-outline" id="action-send-message-hero"><i class="fas fa-comment-dots"></i> Send Message</button>
                `;
                const sidebarBtns = `
                    <button type="button" class="btn btn-primary" id="action-request-mentor-sidebar"><i class="fas fa-paper-plane"></i> Request This Mentor</button>
                    <button type="button" class="btn btn-outline" id="action-send-message-sidebar"><i class="fas fa-comment-dots"></i> Send Message</button>
                `;
                heroActions.innerHTML = heroBtns;
                connectionActions.innerHTML = sidebarBtns;
                if (connectCardDesc) {
                    connectCardDesc.textContent = "Send a request to connect with this mentor for personalized guidance and support.";
                }

                // Attach action handlers for unconnected student buttons
                const btnRequestHero = document.getElementById('action-request-mentor-hero');
                const btnRequestSidebar = document.getElementById('action-request-mentor-sidebar');
                if (btnRequestHero) btnRequestHero.addEventListener('click', openModal);
                if (btnRequestSidebar) btnRequestSidebar.addEventListener('click', openModal);

                const btnSendMessageHero = document.getElementById('action-send-message-hero');
                const btnSendMessageSidebar = document.getElementById('action-send-message-sidebar');
                const handleSendMessageClick = () => {
                    showToast("You need to request mentorship and connect before starting messages.", "info");
                    openModal();
                };
                if (btnSendMessageHero) btnSendMessageHero.addEventListener('click', handleSendMessageClick);
                if (btnSendMessageSidebar) btnSendMessageSidebar.addEventListener('click', handleSendMessageClick);
            }
        }
    }

    // --- Modal Logic ---
    function openModal() {
        modalMentorName.textContent = mentorProfile.fullName || "Mentor";
        requestModal.classList.remove('hidden');
        requestModal.setAttribute('aria-hidden', 'false');
        requestModal.focus();

        // Populate guidance selection option with mentor's guidance tags
        const guidanceSel = document.getElementById('request-guidance-area');
        const originalOptions = Array.from(guidanceSel.options).slice(0, 7); // keep static options
        
        guidanceSel.innerHTML = "";
        originalOptions.forEach(opt => guidanceSel.appendChild(opt));

        const guidanceTags = normalizeList(mentorProfile.guidanceAreas || mentorProfile.adviceAreas || mentorProfile.mentoringTopics);
        guidanceTags.forEach(tag => {
            // check if tag already exists in select options
            const exists = Array.from(guidanceSel.options).some(opt => opt.value === tag);
            if (!exists) {
                const opt = document.createElement('option');
                opt.value = tag;
                opt.textContent = tag;
                guidanceSel.appendChild(opt);
            }
        });
        
        // Trap focus inside modal
        requestModal.addEventListener('keydown', trapFocus);
    }

    function closeModal() {
        requestModal.classList.add('hidden');
        requestModal.setAttribute('aria-hidden', 'true');
        requestModal.removeEventListener('keydown', trapFocus);
    }

    function trapFocus(e) {
        if (e.key === 'Escape') {
            closeModal();
            return;
        }

        const focusableElements = requestModal.querySelectorAll('a[href], area[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex="0"]');
        const firstFocusable = focusableElements[0];
        const lastFocusable = focusableElements[focusableElements.length - 1];

        if (e.key === 'Tab') {
            if (e.shiftKey) {
                if (document.activeElement === firstFocusable) {
                    lastFocusable.focus();
                    e.preventDefault();
                }
            } else {
                if (document.activeElement === lastFocusable) {
                    firstFocusable.focus();
                    e.preventDefault();
                }
            }
        }
    }

    if (closeRequestModal) closeRequestModal.addEventListener('click', closeModal);
    if (btnCancelRequest) btnCancelRequest.addEventListener('click', closeModal);
    requestModal.addEventListener('click', (e) => {
        if (e.target === requestModal) closeModal();
    });

    // --- Submit Mentorship Request ---
    if (requestForm) {
        requestForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            if (!currentUser || currentUserType !== 'student') {
                showToast("Only logged in students can submit requests.", "error");
                return;
            }

            const validation = validateForm([
                { id: 'request-guidance-area', validate: (value) => requiredText(value, 'Guidance area') },
                { id: 'request-student-goal', validate: (value) => requiredText(value, 'Core goal', { minLength: 3, maxLength: 120 }) },
                { id: 'request-mode', validate: (value) => requiredText(value, 'Preferred mentoring mode') },
                { id: 'request-message', validate: (value) => requiredText(value, 'Introduction message', { minLength: 10, maxLength: 2000 }) }
            ]);

            if (!validation.valid) {
                showToast("Please fix the highlighted request fields.", "warning");
                return;
            }

            const guidanceArea = document.getElementById('request-guidance-area').value;
            const goal = document.getElementById('request-student-goal').value.trim();
            const preferredMode = document.getElementById('request-mode').value;
            const introduction = document.getElementById('request-message').value.trim();

            const btnSubmit = document.getElementById('btn-submit-request');
            btnSubmit.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
            btnSubmit.disabled = true;

            try {
                // Fetch the latest values to check duplicate again and ensure mentor is active
                const [mentorSnap, userSnap] = await Promise.all([
                    get(ref(database, `mentors/${mentorUid}`)),
                    get(ref(database, `users/${mentorUid}`)).catch(() => null)
                ]);
                const latestMentor = mentorSnap.val() || {};
                const latestUser = userSnap?.val?.() || {};

                if (!isPublicApprovedMentor(latestMentor, latestUser)) {
                    showToast("This mentor is no longer available for new requests.", "error");
                    closeModal();
                    loadMentorProfile();
                    return;
                }

                // Check duplicate check
                const checkRequestsSnap = await get(
                    query(ref(database, 'mentorRequests'), orderByChild('studentUid'), equalTo(currentUser.uid))
                );
                let doubleSubmit = false;
                if (checkRequestsSnap.exists()) {
                    const requests = checkRequestsSnap.val();
                    doubleSubmit = Object.values(requests).some(
                        r => r.mentorUid === mentorUid && ['pending', 'accepted', 'connected'].includes(String(r.status || '').toLowerCase())
                    );
                }

                if (doubleSubmit) {
                    showToast("You already have an active request with this mentor.", "warning");
                    closeModal();
                    loadMentorProfile();
                    return;
                }

                const requestRef = push(ref(database, 'mentorRequests'));
                const requestId = requestRef.key;

                const payload = {
                    requestId: requestId,
                    studentUid: currentUser.uid,
                    studentName: currentStudentData?.fullName || currentUserData?.fullName || currentUser.displayName || 'Student',
                    studentEmail: currentUserData?.email || currentUser.email || '',
                    studentPhone: currentStudentData?.phone || currentUserData?.phone || '',
                    educationLevel: currentStudentData?.educationLevel || currentStudentData?.education || '',
                    interestArea: currentStudentData?.interestArea || currentStudentData?.interest || '',
                    futureGoal: goal,
                    mentorUid: mentorUid,
                    mentorName: mentorProfile.fullName || 'Mentor',
                    mentorPhotoURL: mentorProfile.photoURL || '',
                    mentorEmail: mentorProfile.email || '',
                    mentorOrganization: mentorProfile.universityOrCompany || mentorProfile.organization || '',
                    message: introduction,
                    guidanceArea: guidanceArea,
                    preferredMode: preferredMode,
                    status: "pending",
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp()
                };

                const notificationRef = push(ref(database, `notifications/${mentorUid}`));
                const updates = {};
                updates[`mentorRequests/${requestId}`] = payload;
                updates[`notifications/${mentorUid}/${notificationRef.key}`] = {
                    notificationId: notificationRef.key,
                    targetUserUid: mentorUid,
                    targetRole: 'mentor',
                    senderUid: currentUser.uid,
                    senderRole: 'student',
                    type: 'mentorship_request_received',
                    title: 'New student mentor request',
                    message: `${payload.studentName} requested your mentorship.`,
                    messagePreview: `New request from ${payload.studentName}`,
                    relatedEntityType: 'mentorRequest',
                    relatedEntityId: requestId,
                    requestId,
                    studentUid: currentUser.uid,
                    targetPage: 'mentor-dashboard.html',
                    targetSection: 'requests',
                    targetQuery: { requestId },
                    read: false,
                    status: 'unread',
                    createdAt: serverTimestamp()
                };
                await update(ref(database), updates);

                showToast("Your mentorship request was sent successfully.", "success");
                closeModal();
                
                // Refresh local state request check
                existingRequest = payload;
                renderProfile();

            } catch (err) {
                console.error("Error submitting mentor request:", err);
                showToast("We could not send your request. Please try again.", "error");
                btnSubmit.innerHTML = "Send Request";
                btnSubmit.disabled = false;
            }
        });
    }
});
