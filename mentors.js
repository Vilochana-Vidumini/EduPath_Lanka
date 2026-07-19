import { auth, database } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { ref, get, push, set, serverTimestamp, onValue, query, orderByChild, equalTo } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
import { showToast } from "./auth-nav.js?v=20260614-brand";
import { ratingLabel } from "./ratings.js";

document.addEventListener('DOMContentLoaded', () => {
    // --- Mobile Menu Toggle ---
    const hamburger = document.querySelector('.hamburger');
    const mobileMenu = document.querySelector('.mobile-menu');
    const closeBtn = document.querySelector('.close-btn');

    if (hamburger && mobileMenu && closeBtn) {
        hamburger.addEventListener('click', () => {
            mobileMenu.classList.add('active');
        });
        closeBtn.addEventListener('click', () => {
            mobileMenu.classList.remove('active');
        });
    }

    const grid = document.getElementById('mentors-grid');
    const searchInput = document.getElementById('mentor-search');
    const chips = document.querySelectorAll('.chip');

    let allMentors = [];
    let activeCategory = 'all';
    let searchQuery = '';
    let currentUser = null;
    let currentUserType = null;
    let currentStudentData = null;
    let currentUserData = null;
    let currentPathwayResult = null;
    let currentPathwayResultId = '';
    let currentMentorRequests = {};
    let ratingSummaries = {};

    const mentorCategoryTerms = {
        tech: ["software", "technology", "information technology", "computer", "computing", "web development", "app development", "programming", "developer", "data science", "data analytics", "cyber security", "cybersecurity", "cloud", "network", "artificial intelligence", "machine learning", "digital", "it mentor"],
        vocational: ["nvq", "vocational", "technical", "technician", "trade", "craft", "skills training", "career training", "automotive", "electrical", "electronic", "mechanical", "civil", "construction", "hospitality", "culinary", "beauty", "plumbing", "welding"],
        business: ["business", "management", "entrepreneur", "entrepreneurship", "startup", "start-up", "marketing", "finance", "accounting", "commerce", "economics", "leadership", "human resource", "hrm", "operations", "project management", "administration", "sales"],
        creative: ["design", "creative", "art", "arts", "drawing", "graphic", "media", "photography", "film", "animation", "music", "dance", "dancing", "theatre", "acting", "fashion", "writing", "content creation", "performing arts", "architecture"],
        sports: ["sport", "sports", "athlete", "athletics", "coach", "coaching", "fitness", "physical education", "football", "cricket", "rugby", "basketball", "volleyball", "swimming", "badminton", "tennis", "martial arts", "wellness"]
    };

    function flattenMentorText(value) {
        if (value == null) return "";
        if (Array.isArray(value)) return value.map(flattenMentorText).join(" ");
        if (typeof value === "object") return Object.entries(value).filter(([, enabled]) => enabled !== false && enabled != null).map(([key, item]) => `${key} ${flattenMentorText(item)}`).join(" ");
        return String(value);
    }

    function mentorCategoryMatches(directoryText, term) {
        const normalizedTerm = String(term || "").toLowerCase().replace(/[^a-z0-9+#/& -]+/g, " ").replace(/\s+/g, " ").trim();
        return normalizedTerm && (` ${directoryText} `).includes(` ${normalizedTerm} `);
    }

    function mentorDirectoryText(mentor = {}, user = {}) {
        return [mentor.fullName, user.fullName, mentor.field, mentor.mentoringField, mentor.expertise, mentor.specialization, mentor.currentPosition, mentor.designation, mentor.role, mentor.profession, mentor.mentorType, mentor.professionalTypes, mentor.guidanceAreas, mentor.adviceAreas, mentor.supportAreas, mentor.skills, mentor.majorSkills, mentor.tags, mentor.supportedFields, mentor.supportedTalentCategories, mentor.bio, mentor.universityOrCompany, mentor.organization, mentor.currentOrganization]
            .map(flattenMentorText).join(" ").toLowerCase().replace(/[^a-z0-9+#/& -]+/g, " ").replace(/\s+/g, " ").trim();
    }

    // Check Auth State
    onAuthStateChanged(auth, async (user) => {
        currentUser = user;
        if (user) {
            // Fetch user type
            try {
                const userRef = ref(database, 'users/' + user.uid);
                const snapshot = await get(userRef);
                if (snapshot.exists()) {
                    currentUserData = snapshot.val();
                    currentUserType = currentUserData.userType || currentUserData.role || '';
                    if(currentUserType.toLowerCase() === 'student') {
                        const studentSnap = await get(ref(database, 'students/' + user.uid));
                        if(studentSnap.exists()) {
                            currentStudentData = studentSnap.val();
                        }
                        await loadStudentMentorContext(user.uid);
                    }
                }
            } catch (error) {
                console.error("Error fetching user data:", error);
            } finally {
                renderMentors();
            }
        }
    });

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

    // Fetch mentors from Firebase Realtime DB
    async function fetchMentors() {
        if (!grid) return;
        
        // Show loading state
        grid.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; padding: 3rem;">
            <i class="fas fa-spinner fa-spin" style="font-size: 2rem; color: var(--primary-blue); margin-bottom: 1rem;"></i>
            <p>Loading mentors...</p>
        </div>`;

        try {
            const mentorsRef = query(ref(database, 'mentors'), orderByChild('status'), equalTo('approved'));
            const mentorsSnapshot = await get(mentorsRef);

            allMentors = [];
            if (mentorsSnapshot.exists()) {
                const mentorPromises = [];
                mentorsSnapshot.forEach((childSnapshot) => {
                    const mentorUid = childSnapshot.key;
                    const mentor = childSnapshot.val();

                    // Query users/{mentorUid} individually, catching permission violations
                    const userPromise = get(ref(database, `users/${mentorUid}`))
                        .then(snap => snap.val() || {})
                        .catch(() => ({}));

                    mentorPromises.push(userPromise.then((user) => {
                        if (isPublicApprovedMentor(mentor, user)) {
                            allMentors.push({
                                id: mentorUid,
                                name: mentor.fullName || user.fullName || 'Unnamed Mentor',
                                category: (mentor.mentorType || mentor.field || 'General').toLowerCase(),
                                designation: mentor.field || mentor.mentoringField || 'Mentor',
                                company: mentor.universityOrCompany || mentor.organization || mentor.currentOrganization || 'Independent',
                                avatar: mentor.photoURL || user.photoURL || null,
                                bio: mentor.bio || 'No bio available yet.',
                                experience: mentor.experience || 'Not specified',
                                availableTime: mentor.availableTime || mentor.availableDays || 'Flexible',
                                mode: mentor.mentoringMode || mentor.mode || 'Online or hybrid',
                                languages: mentor.languages || mentor.language || '',
                                email: mentor.email || user.email || '',
                                status: mentor.status || 'approved',
                                accountStatus: user.accountStatus || mentor.accountStatus || 'active',
                                approvalStatus: mentor.approvalStatus || mentor.status || '',
                                publicVisibility: mentor.publicVisibility === true,
                                mentoringEnabled: mentor.mentoringEnabled === true,
                                userType: user.userType || user.role || 'mentor',
                                directoryText: mentorDirectoryText(mentor, user)
                            });
                        }
                    }));
                });
                await Promise.all(mentorPromises);
            }
            renderMentors();
        } catch (error) {
            console.error("Error fetching mentors:", error);
            grid.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; padding: 3rem; color: var(--error-color);">
                <p>Failed to load mentors. Please try again later.</p>
            </div>`;
        }
    }

    onValue(ref(database, 'mentorRatingSummaries'), (snapshot) => {
        ratingSummaries = snapshot.val() || {};
        renderMentors();
    }, (error) => console.warn("Unable to load mentor rating summaries:", error));

    // --- Render Mentors ---
    function renderMentors() {
        if (!grid) return;

        const filtered = allMentors.filter((mentor) => {
            const categoryTerms = mentorCategoryTerms[activeCategory] || [];
            const matchesCategory = activeCategory === "all" || categoryTerms.some((term) => mentorCategoryMatches(mentor.directoryText, term));
            const matchesSearch = !searchQuery || mentor.directoryText.includes(searchQuery);
            return matchesCategory && matchesSearch;
        });

        if (filtered.length === 0) {
            grid.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 3rem; color: var(--text-muted);">
                    <i class="fas fa-user-slash" style="font-size: 3rem; color: #cbd5e1; margin-bottom: 1rem;"></i>
                    <h3>No mentors found</h3>
                    <p>${activeCategory === "all" && !searchQuery ? "No approved mentors are available right now." : "No mentors match this category and search. Try another category or clear the search."}</p>
                </div>
            `;
            return;
        }

        grid.innerHTML = filtered.map(mentor => {
            const avatarUrl = mentor.avatar || "images/default-mentor-avatar.png";
            const requestState = getExistingRequestState(mentor.id);
            const action = getMentorActionMarkup(mentor, requestState);
            const mentorRating = ratingLabel(ratingSummaries[mentor.id] || {});

            return `
            <div class="mentor-card glass">
                <div>
                    <div class="mentor-header">
                        <div class="avatar-wrapper">
                            <img src="${avatarUrl}" alt="${mentor.name}" onerror="this.onerror=null; this.src='images/default-mentor-avatar.png';" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">
                        </div>
                        <div class="mentor-meta">
                            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                                <h3 style="margin: 0; font-size: 1.15rem; color: var(--text-heading);">${mentor.name}</h3>
                                <span class="badge badge-purple" style="margin: 0; padding: 2px 8px; font-size: 10px; font-weight: 600;">Available</span>
                            </div>
                            <div class="designation">${mentor.designation}</div>
                            <div class="company">${mentor.company}</div>
                            <div class="mentor-rating-chip"><i class="fas fa-star"></i> ${escapeHtml(mentorRating)}</div>
                        </div>
                    </div>
                    <p class="mentor-bio">${mentor.bio}</p>
                    
                    <div class="mentor-details" style="margin-top:1rem; font-size:0.9rem; color:var(--text-muted); display:flex; flex-direction:column; gap:0.4rem;">
                        <div><i class="fas fa-award"></i> ${mentor.experience}</div>
                        <div><i class="fas fa-video"></i> ${mentor.mode}</div>
                        ${mentor.languages ? `<div><i class="fas fa-language"></i> ${mentor.languages}</div>` : ''}
                    </div>
                </div>
                
                <div class="mentor-footer">
                    <div class="mentor-actions" style="width: 100%; justify-content: space-between;">
                        <button type="button" class="view-mentor-profile-btn btn btn-outline" data-mentor-uid="${mentor.id}">View Profile</button>
                        ${action}
                    </div>
                </div>
            </div>
            `;
        }).join('');

        // Attach event listeners to new buttons
        document.querySelectorAll('.btn-request').forEach(btn => {
            btn.addEventListener('click', handleRequestMentor);
        });
        document.querySelectorAll('.view-mentor-profile-btn').forEach(btn => {
            btn.addEventListener('click', () => openMentorProfile(btn.dataset.mentorUid));
        });
    }

    async function handleRequestMentor(e) {
        e.preventDefault();
        
        if (!currentUser) {
            // Not logged in
            window.location.href = 'login.html?redirect=mentors.html&msg=login_required';
            return;
        }

        if (!currentUserType || currentUserType.toLowerCase() !== 'student') {
            showToast('Only students can request mentors.', 'warning');
            return;
        }

        const btn = e.currentTarget;
        const mentorId = btn.getAttribute('data-id');
        const mentorName = btn.getAttribute('data-name');
        const mentorField = btn.getAttribute('data-field');
        const mentor = allMentors.find((item) => item.id === mentorId);
        if (!mentor) {
            showToast('Mentor profile could not be found. Please refresh and try again.', 'error');
            return;
        }

        const existing = getExistingRequestState(mentorId);
        if (['pending', 'accepted', 'connected'].includes(existing)) {
            showToast(existing === 'pending' ? 'You already sent a pending request to this mentor.' : 'You are already connected with this mentor.', 'warning');
            return;
        }

        const confirmReq = confirm(`Do you want to send a mentorship request to ${mentorName}?`);
        if(!confirmReq) return;

        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
        btn.disabled = true;

        try {
            const [mentorSnap, userSnap] = await Promise.all([
                get(ref(database, `mentors/${mentorId}`)),
                get(ref(database, `users/${mentorId}`)).catch(() => null)
            ]);
            const latestMentor = mentorSnap.val() || {};
            const latestUser = userSnap?.val?.() || {};
            if (!isApprovedActiveMentor({ ...latestUser, ...latestMentor, accountStatus: latestUser.accountStatus || latestMentor.accountStatus })) {
                showToast('This mentor is not currently available for mentoring.', 'error');
                renderMentors();
                return;
            }
            const requestRef = push(ref(database, 'mentorRequests'));
            const requestId = requestRef.key;

            await set(requestRef, {
                requestId: requestId,
                studentUid: currentUser.uid,
                studentName: currentStudentData?.fullName || currentUserData?.fullName || currentUser.displayName || 'Student',
                studentEmail: currentUserData?.email || currentUser.email || '',
                studentPhone: currentStudentData?.phone || currentUserData?.phone || '',
                educationLevel: currentStudentData?.educationLevel || currentStudentData?.education || currentPathwayResult?.educationLevel || currentPathwayResult?.basicProfile?.currentEducationLevel || '',
                interestArea: currentStudentData?.interestArea || currentStudentData?.interest || currentPathwayResult?.interestArea || currentPathwayResult?.interests?.interestAreas?.[0] || '',
                futureGoal: currentStudentData?.futureGoal || currentStudentData?.goal || currentPathwayResult?.futureGoal || currentPathwayResult?.goals?.dreamCareer || '',
                skills: currentStudentData?.skills || currentPathwayResult?.skills || currentPathwayResult?.skillsAndStrengths?.skills || [],
                mentorUid: mentorId,
                mentorName: mentorName,
                mentorField: mentorField,
                mentorEmail: mentor.email || '',
                mentorOrganization: mentor.company || '',
                pathwayResultId: currentPathwayResultId || '',
                pathwaySnapshot: buildPathwaySnapshot(currentPathwayResult),
                message: "I would like to request you as my mentor. Please review my profile.",
                status: "pending",
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                acceptedAt: null,
                rejectedAt: null,
                rejectionReason: ''
            });
            payload.pathwayPreference = currentStudentData?.pathwayPreference || 'undecided';
            payload.enjoyedActivities = currentStudentData?.enjoyedActivities || '';
            payload.talentsList = currentStudentData?.talentsList || '';

            const notificationRef = push(ref(database, `notifications/${mentorId}`));
            await set(notificationRef, {
                notificationId: notificationRef.key,
                type: 'mentor_request_received',
                title: 'New student mentor request',
                message: `${currentStudentData?.fullName || currentUserData?.fullName || 'A student'} requested your mentorship.`,
                messagePreview: `New request from ${currentStudentData?.fullName || currentUserData?.fullName || 'a student'}`,
                relatedRequestId: requestId,
                studentUid: currentUser.uid,
                read: false,
                status: 'unread',
                createdAt: serverTimestamp()
            });

            currentMentorRequests[requestId] = { mentorUid: mentorId, status: 'pending' };
            showToast(`Mentorship request sent successfully to ${mentorName}!`, 'success');
            renderMentors();

        } catch (error) {
            console.error("Error sending request:", error);
            showToast("Failed to send request. Please try again.", "error");
            btn.innerHTML = "Request Mentor";
            btn.disabled = false;
        }
    }

    async function loadStudentMentorContext(uid) {
        const [requestsSnap, pathwaySnap] = await Promise.all([
            get(query(ref(database, 'mentorRequests'), orderByChild('studentUid'), equalTo(uid))).catch(() => null),
            get(ref(database, `pathwayResults/${uid}`)).catch(() => null)
        ]);
        currentMentorRequests = requestsSnap?.exists() ? requestsSnap.val() : {};
        const latest = getLatestPathwayResult(pathwaySnap?.exists() ? pathwaySnap.val() : null);
        currentPathwayResult = latest.result;
        currentPathwayResultId = latest.id;
        renderMentors();
    }

    function isApprovedActiveMentor(mentor = {}) {
        return isPublicApprovedMentor(mentor, mentor);
    }

    function getExistingRequestState(mentorId) {
        const request = Object.values(currentMentorRequests || {}).find((item) => item?.mentorUid === mentorId && ['pending', 'accepted', 'connected'].includes(String(item.status || '').toLowerCase()));
        return String(request?.status || '').toLowerCase();
    }

    function getMentorActionMarkup(mentor, requestState) {
        if (!currentUser) return `<button class="btn btn-primary btn-request" data-id="${mentor.id}" data-name="${mentor.name}" data-field="${mentor.designation}">Login to Request</button>`;
        if (String(currentUserType || '').toLowerCase() !== 'student') return `<button class="btn btn-primary btn-request" disabled>Students Only</button>`;
        if (requestState === 'pending') return `<button class="btn btn-primary btn-request" disabled>Request Sent</button>`;
        if (requestState === 'accepted' || requestState === 'connected') return `<button class="btn btn-primary btn-request" disabled>Connected</button>`;
        return `<button class="btn btn-primary btn-request" data-id="${mentor.id}" data-name="${mentor.name}" data-field="${mentor.designation}">Request Mentor</button>`;
    }

    function getLatestPathwayResult(data) {
        if (!data || typeof data !== 'object') return { id: '', result: null };
        const entries = Object.entries(data).filter(([, item]) => item && typeof item === 'object');
        if (!entries.length) return { id: '', result: null };
        entries.sort(([, a], [, b]) => (getTimeValue(b.createdAt || b.updatedAt) - getTimeValue(a.createdAt || a.updatedAt)));
        return { id: entries[0][0], result: entries[0][1] };
    }

    function getTimeValue(value) {
        if (!value) return 0;
        if (typeof value === 'number') return value;
        if (typeof value === 'object' && value.seconds) return value.seconds * 1000;
        return new Date(value).getTime() || 0;
    }

    function buildPathwaySnapshot(result = {}) {
        if (!result) return null;
        return {
            resultId: currentPathwayResultId || '',
            educationLevel: result.educationLevel || result.basicProfile?.currentEducationLevel || '',
            interestArea: result.interestArea || result.interests?.interestAreas?.[0] || '',
            futureGoal: result.futureGoal || result.goals?.dreamCareer || '',
            learningMode: result.learningMode || result.learningPreferences?.learningMode || '',
            skills: result.skills || result.skillsAndStrengths?.skills || [],
            pathway: result.pathway || result.recommendedPathway || '',
            recommendationSummary: result.recommendationSummary || result.summary || '',
            pathwayScore: result.pathwayScore || result.score || ''
        };
    }

    function openMentorProfile(mentorUid) {
        if (!mentorUid) {
            showToast("Mentor profile could not be opened.", "error");
            return;
        }
        window.location.href = `mentor-profile.html?uid=${encodeURIComponent(mentorUid)}`;
    }

    // --- Filter Handlers ---
    chips.forEach(chip => {
        chip.addEventListener('click', () => {
            chips.forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            activeCategory = chip.getAttribute('data-category');
            renderMentors();
        });
    });

    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            searchQuery = e.target.value.toLowerCase().trim();
            renderMentors();
        });
    }

    // Initial fetch
    fetchMentors();
});

function escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = String(value ?? '');
    return div.innerHTML;
}
