import { auth, database } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { ref, get, push, set, serverTimestamp, onValue, query, orderByChild, equalTo } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
import { showToast } from "./auth-nav.js?v=20260614-brand";

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

    // Fetch mentors from Firebase Realtime DB
    function fetchMentors() {
        if (!grid) return;
        
        // Show loading state
        grid.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; padding: 3rem;">
            <i class="fas fa-spinner fa-spin" style="font-size: 2rem; color: var(--primary-blue); margin-bottom: 1rem;"></i>
            <p>Loading mentors...</p>
        </div>`;

        const mentorsRef = query(ref(database, 'mentors'), orderByChild('status'), equalTo('approved'));
        onValue(mentorsRef, (snapshot) => {
            allMentors = [];
            if (snapshot.exists()) {
                snapshot.forEach((childSnapshot) => {
                    const mentor = childSnapshot.val();
                    if (isApprovedActiveMentor(mentor)) {
                        allMentors.push({
                            id: mentor.uid || childSnapshot.key,
                            name: mentor.fullName || 'Unnamed Mentor',
                            category: (mentor.mentorType || mentor.field || 'General').toLowerCase(),
                            designation: mentor.field || mentor.mentoringField || 'Mentor',
                            company: mentor.universityOrCompany || mentor.organization || mentor.currentOrganization || 'Independent',
                            avatar: mentor.photoURL || null,
                            bio: mentor.bio || 'No bio available yet.',
                            experience: mentor.experience || 'Not specified',
                            availableTime: mentor.availableTime || mentor.availableDays || 'Flexible',
                            mode: mentor.mentoringMode || mentor.mode || 'Online or hybrid',
                            languages: mentor.languages || mentor.language || '',
                            email: mentor.email || '',
                            status: mentor.status || 'approved',
                            accountStatus: mentor.accountStatus || 'active',
                            approvalStatus: mentor.approvalStatus || mentor.status || '',
                            publicVisibility: mentor.publicVisibility === true,
                            mentoringEnabled: mentor.mentoringEnabled === true,
                            userType: mentor.userType || mentor.role || 'mentor'
                        });
                    }
                });
            }
            renderMentors();
        }, (error) => {
            console.error("Error fetching mentors:", error);
            grid.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; padding: 3rem; color: red;">
                <p>Failed to load mentors. Please try again later.</p>
            </div>`;
        });
    }

    // --- Render Mentors ---
    function renderMentors() {
        if (!grid) return;

        let filtered = allMentors.filter(mentor => {
            // Very simple category matching since DB might not have exact 'tech', 'vocational' mapping
            // In a real app we'd map fields to these categories, here we'll just check if it includes the string
            const cat = activeCategory.toLowerCase();
            const matchesCategory = activeCategory === 'all' || 
                                    mentor.category.includes(cat) || 
                                    mentor.designation.toLowerCase().includes(cat);
            
            const matchesSearch = mentor.name.toLowerCase().includes(searchQuery) ||
                                 mentor.designation.toLowerCase().includes(searchQuery) ||
                                 mentor.company.toLowerCase().includes(searchQuery);
            return matchesCategory && matchesSearch;
        });

        if (filtered.length === 0) {
            grid.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 3rem; color: var(--text-muted);">
                    <i class="fas fa-user-slash" style="font-size: 3rem; color: #cbd5e1; margin-bottom: 1rem;"></i>
                    <h3>No mentors found</h3>
                    <p>No approved mentors are available right now. Please check again later.</p>
                </div>
            `;
            return;
        }

        grid.innerHTML = filtered.map(mentor => {
            const avatarHtml = mentor.avatar 
                ? `<img src="${mentor.avatar}" alt="${mentor.name}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">`
                : `<i class="fas fa-user-tie"></i>`;

            const requestState = getExistingRequestState(mentor.id);
            const action = getMentorActionMarkup(mentor, requestState);

            return `
            <div class="mentor-card glass">
                <div>
                    <div class="mentor-header">
                        <div class="avatar-wrapper">
                            ${avatarHtml}
                        </div>
                        <div class="mentor-meta">
                            <h3>${mentor.name}</h3>
                            <div class="designation">${mentor.designation}</div>
                            <div class="company">${mentor.company}</div>
                        </div>
                    </div>
                    <p class="mentor-bio">${mentor.bio}</p>
                    
                    <div class="mentor-details" style="margin-top:1rem; font-size:0.9rem; color:var(--text-muted);">
                        <div><i class="fas fa-clock"></i> ${mentor.availableTime}</div>
                        <div><i class="fas fa-video"></i> ${mentor.mode}</div>
                    </div>
                </div>
                
                <div class="mentor-footer">
                    <span class="exp-badge"><i class="fas fa-award"></i> ${mentor.experience}</span>
                    <div class="mentor-actions">
                        <button class="btn btn-outline btn-view-mentor" data-id="${mentor.id}">View Profile</button>
                        ${action}
                    </div>
                </div>
            </div>
        `}).join('');

        // Attach event listeners to new buttons
        document.querySelectorAll('.btn-request').forEach(btn => {
            btn.addEventListener('click', handleRequestMentor);
        });
        document.querySelectorAll('.btn-view-mentor').forEach(btn => {
            btn.addEventListener('click', () => openMentorProfile(btn.dataset.id));
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
        const status = String(mentor.approvalStatus || mentor.status || '').trim().toLowerCase();
        const accountStatus = String(mentor.accountStatus || 'active').trim().toLowerCase();
        const role = String(mentor.userType || mentor.role || 'mentor').trim().toLowerCase();
        return status === 'approved'
            && mentor.publicVisibility === true
            && mentor.mentoringEnabled === true
            && role === 'mentor'
            && accountStatus === 'active';
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

    function openMentorProfile(mentorId) {
        const mentor = allMentors.find((item) => item.id === mentorId);
        if (!mentor) return;
        let modal = document.getElementById('mentor-profile-modal');
        if (!modal) {
            document.body.insertAdjacentHTML('beforeend', `
                <div id="mentor-profile-modal" class="mentor-modal hidden" aria-hidden="true">
                    <div class="mentor-modal-card">
                        <button type="button" class="mentor-modal-close" aria-label="Close">&times;</button>
                        <div id="mentor-profile-body"></div>
                    </div>
                </div>
            `);
            modal = document.getElementById('mentor-profile-modal');
            modal.querySelector('.mentor-modal-close')?.addEventListener('click', () => modal.classList.add('hidden'));
        }
        document.getElementById('mentor-profile-body').innerHTML = `
            <h2>${mentor.name}</h2>
            <p class="text-muted">${mentor.designation} at ${mentor.company}</p>
            <p>${mentor.bio}</p>
            <div class="mentor-details mentor-profile-details">
                <div><i class="fas fa-clock"></i> ${mentor.availableTime}</div>
                <div><i class="fas fa-video"></i> ${mentor.mode}</div>
                <div><i class="fas fa-award"></i> ${mentor.experience}</div>
                <div><i class="fas fa-language"></i> ${mentor.languages || 'Languages not specified'}</div>
            </div>
        `;
        modal.classList.remove('hidden');
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
