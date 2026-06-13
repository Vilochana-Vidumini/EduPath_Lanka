import { auth, database } from "./firebase-config.js";
import { onAuthStateChanged, signOut, updatePassword } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { ref, get, set, update, push, onValue, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
import { showToast, preserveThemeOnClear } from "./auth-nav.js?v=20260614-brand";
import { initDashboardSidebar, updateSidebarUser } from "./sidebar.js";
import { ensureDashboardTopbarLayout, initDashboardNotifications, updateDashboardGreetingName } from "./dashboard-topbar.js";

document.addEventListener('DOMContentLoaded', () => {
    initDashboardSidebar();

    let currentUid = null;
    let requestDetailCache = {};

    // --- Authentication & Role Check ---
    onAuthStateChanged(auth, (user) => {
        if (!user) {
            window.location.href = 'login.html';
            return;
        }
        currentUid = user.uid;

        // Verify role
        get(ref(database, 'users/' + user.uid)).then((snapshot) => {
            if (snapshot.exists()) {
                const userData = snapshot.val();
                if (userData.userType.toLowerCase() !== 'mentor') {
                    showToast("Access denied. Directing to correct dashboard...", "error");
                    setTimeout(() => {
                        window.location.href = 'login.html';
                    }, 1500);
                    return;
                }
                
                // Initialize Dashboard
                initMentorDashboard(user.uid, userData);
                ensureDashboardTopbarLayout();
                initDashboardNotifications(user.uid);
            } else {
                window.location.href = 'login.html';
            }
        }).catch(err => {
            console.error(err);
            window.location.href = 'login.html';
        });
    });

    // --- Logout ---
    const logoutBtn = document.getElementById('logout-btn-sidebar');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            await recordMentorLogout();
            signOut(auth).then(() => {
                preserveThemeOnClear();
                sessionStorage.clear();
                window.location.href = 'login.html';
            });
        });
    }

    async function recordMentorLogout() {
        const user = auth.currentUser;
        if (!user) return;
        const recordId = sessionStorage.getItem('edupathLoginRecordId');
        const updates = {};
        updates[`users/${user.uid}/isOnline`] = false;
        updates[`users/${user.uid}/lastLogoutAt`] = serverTimestamp();
        updates[`presence/${user.uid}`] = { state: 'offline', lastChanged: serverTimestamp() };
        if (recordId) {
            updates[`loginHistory/${user.uid}/${recordId}/sessionStatus`] = 'completed';
            updates[`loginHistory/${user.uid}/${recordId}/logoutAt`] = serverTimestamp();
        }
        const logRef = push(ref(database, 'activityLogs'));
        updates[`activityLogs/${logRef.key}`] = {
            logId: logRef.key,
            uid: user.uid,
            userName: localStorage.getItem('fullName') || user.displayName || 'Mentor',
            userRole: 'mentor',
            actionType: 'logout',
            description: 'Mentor logged out',
            relatedEntityType: 'user',
            relatedEntityId: user.uid,
            createdAt: serverTimestamp()
        };
        return update(ref(database), updates).catch(console.error);
    }

    function initMentorDashboard(uid, userData) {
        updateSidebarUser({
            fullName: userData.fullName || 'Mentor',
            role: 'mentor',
            photoURL: userData.photoURL || '',
        });
        updateDashboardGreetingName(userData.fullName || 'Mentor');

        const firstName = (userData.fullName || 'Mentor').split(' ')[0];
        const welcomeNameEl = document.getElementById('welcome-name');
        if (welcomeNameEl) {
            welcomeNameEl.textContent = `Welcome back, ${firstName}`;
        }

        // Load Mentor Specific Data from /mentors/{uid}
        get(ref(database, 'mentors/' + uid)).then((snapshot) => {
            let mentorData = { status: "pending" };
            if (snapshot.exists()) {
                mentorData = snapshot.val();
            }
            
            updateStatusUI(mentorData.status);
            calculateProfileCompletion(uid, userData, mentorData);
        });

        // Setup Listeners
        listenForRequests(uid, userData.fullName);
    }

    function updateStatusUI(status) {
        const statEl = document.getElementById('stat-status');
        const alertEl = document.getElementById('status-alert');
        
        statEl.textContent = status ? status.charAt(0).toUpperCase() + status.slice(1) : "Pending";
        
        if (status === 'pending') {
            statEl.className = 'text-warning';
            if (alertEl) {
                alertEl.textContent = "Your mentor profile is currently under review by an admin. You can complete your profile details while waiting for approval.";
                alertEl.className = "alert alert-warning";
                alertEl.classList.remove('hidden');
            }
        } else if (status === 'approved') {
            statEl.className = 'text-success';
            if (alertEl) alertEl.classList.add('hidden');
        } else if (status === 'rejected') {
            statEl.className = 'text-danger';
            if (alertEl) {
                alertEl.textContent = "Your mentor application was rejected. Please contact support.";
                alertEl.className = "alert alert-danger";
                alertEl.classList.remove('hidden');
            }
        }
    }



    function calculateProfileCompletion(uid, userData, mentorData) {
        // Fields to verify (10 total)
        const fields = {
            fullName: userData.fullName || mentorData.fullName || '',
            email: userData.email || mentorData.email || '',
            phone: userData.phone || mentorData.phone || '',
            photoURL: userData.photoURL || mentorData.photoURL || '',
            mentorType: mentorData.mentorType || '',
            field: mentorData.field || mentorData.mentoringField || '',
            universityOrCompany: mentorData.universityOrCompany || mentorData.organization || '',
            experience: mentorData.experience || mentorData.experienceYears || '',
            bio: mentorData.bio || '',
            availableTime: mentorData.availableTime || ''
        };

        let completed = 0;
        const total = 10;

        // Check off checklist tasks dynamically
        const toggleTask = (id, condition) => {
            const el = document.getElementById(id);
            if (el) {
                if (condition) {
                    el.innerHTML = `<i class="fas fa-check-circle text-success" style="margin-right: 8px;"></i> ${el.textContent.trim()}`;
                    el.style.color = 'var(--success)';
                } else {
                    el.innerHTML = `<i class="far fa-circle text-muted" style="margin-right: 8px;"></i> ${el.textContent.trim()}`;
                    el.style.color = 'var(--text-muted)';
                }
            }
        };

        // Phone Task
        const hasPhone = !!fields.phone;
        toggleTask('task-phone', hasPhone);
        if (hasPhone) completed++;

        // Photo Task
        const hasPhoto = !!fields.photoURL;
        toggleTask('task-photo', hasPhoto);
        if (hasPhoto) completed++;

        // Mentor Type Task
        const hasType = !!fields.mentorType;
        toggleTask('task-type', hasType);
        if (hasType) completed++;

        // Field Task
        const hasField = !!fields.field;
        toggleTask('task-field', hasField);
        if (hasField) completed++;

        // Org Task
        const hasOrg = !!fields.universityOrCompany;
        toggleTask('task-org', hasOrg);
        if (hasOrg) completed++;

        // Experience Task
        const hasExp = !!fields.experience;
        toggleTask('task-exp', hasExp);
        if (hasExp) completed++;

        // Bio Task
        const hasBio = !!fields.bio;
        toggleTask('task-bio', hasBio);
        if (hasBio) completed++;

        // Time Task
        const hasTime = !!fields.availableTime;
        toggleTask('task-time', hasTime);
        if (hasTime) completed++;

        // Others counted towards overall completion calculation
        if (fields.fullName) completed++;
        if (fields.email) completed++;

        // Approved Task (guided checklist only)
        const isApproved = mentorData.status === 'approved';
        toggleTask('task-approved', isApproved);

        // Computation
        const percentage = Math.round((completed / total) * 100);

        // Save to Database
        update(ref(database, 'mentors/' + uid), { profileCompletion: percentage });

        // Update UI Progress Display
        const progressBar = document.getElementById('dynamic-profile-progress-bar');
        const progressBadge = document.getElementById('profile-strength-badge');
        const progressMsg = document.getElementById('profile-strength-message');

        if (progressBar) progressBar.style.width = `${percentage}%`;
        if (progressBadge) {
            progressBadge.textContent = `${percentage}% Strength`;
            if (percentage < 80) {
                progressBadge.style.backgroundColor = 'rgba(245, 158, 11, 0.1)';
                progressBadge.style.color = '#f59e0b';
            } else {
                progressBadge.style.backgroundColor = 'rgba(16, 185, 129, 0.1)';
                progressBadge.style.color = '#10b981';
            }
        }

        if (progressMsg) {
            if (percentage < 80) {
                progressMsg.textContent = "⚠️ Please complete your profile to at least 80% strength to ensure your application gets approved quickly by our admins!";
                progressMsg.style.color = '#f59e0b';
            } else {
                progressMsg.textContent = "🎉 Excellent! Your profile strength is optimized for immediate admin approval and student matching.";
                progressMsg.style.color = '#10b981';
            }
        }
    }



    function listenForRequests(uid, mentorName) {
        const reqRef = ref(database, 'mentorRequests');
        onValue(reqRef, async (snapshot) => {
            const requestsGrid = document.getElementById('requests-grid');
            const acceptedGrid = document.getElementById('accepted-grid');
            if (requestsGrid) requestsGrid.innerHTML = '';
            if (acceptedGrid) acceptedGrid.innerHTML = '';

            let pendingCount = 0;
            let acceptedCount = 0;
            requestDetailCache = {};

            if (snapshot.exists()) {
                const data = snapshot.val();
                const filtered = Object.entries(data || {}).filter(([, req]) => req && (req.mentorUid === uid || req.mentorName === mentorName));

                const rows = await Promise.all(filtered.map(async ([reqId, req]) => {
                    const studentUid = req.studentUid || '';
                    const [studentSnap, userSnap, pathwaySnap] = await Promise.all([
                        studentUid ? get(ref(database, `students/${studentUid}`)) : Promise.resolve({ exists: () => false }),
                        studentUid ? get(ref(database, `users/${studentUid}`)) : Promise.resolve({ exists: () => false }),
                        studentUid ? get(ref(database, `pathwayResults/${studentUid}`)) : Promise.resolve({ exists: () => false }),
                    ]);

                    const studentData = studentSnap.exists() ? studentSnap.val() : {};
                    const userData = userSnap.exists() ? userSnap.val() : {};
                    const pathwayData = pathwaySnap.exists() ? pathwaySnap.val() : null;
                    const latestResult = getLatestPathwayResult(pathwayData);

                    return { reqId, req, studentData, userData, latestResult };
                }));

                rows.forEach((row) => {
                    const req = row.req;
                    const cardData = {
                        reqId: row.reqId,
                        request: req,
                        studentData: row.studentData,
                        userData: row.userData,
                        latestResult: row.latestResult,
                    };
                    requestDetailCache[row.reqId] = cardData;

                    if (req.status === 'pending') {
                        pendingCount++;
                        if (requestsGrid) requestsGrid.appendChild(buildRequestCard(cardData));
                    } else if (req.status === 'accepted') {
                        acceptedCount++;
                        if (acceptedGrid) acceptedGrid.appendChild(buildAcceptedCard(cardData));
                    }
                });
            }

            if (pendingCount === 0 && requestsGrid) {
                requestsGrid.innerHTML = '<div class="text-muted p-4 full-width text-center">No pending requests found.</div>';
            }
            if (acceptedCount === 0 && acceptedGrid) {
                acceptedGrid.innerHTML = '<div class="text-muted p-4 full-width text-center">No students accepted yet.</div>';
            }

            const statRequests = document.getElementById('stat-requests');
            const reqCount = document.getElementById('req-count');
            const statAccepted = document.getElementById('stat-accepted');

            if (statRequests) statRequests.textContent = pendingCount;
            if (reqCount) reqCount.textContent = pendingCount;
            if (statAccepted) statAccepted.textContent = acceptedCount;

            attachRequestListeners();
        });
    }

    function attachRequestListeners() {
        document.querySelectorAll('.acc-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const reqId = e.target.getAttribute('data-id');
                updateReqStatus(reqId, 'accepted');
            });
        });

        document.querySelectorAll('.rej-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                if (confirm("Are you sure you want to reject this request?")) {
                    const reqId = e.target.getAttribute('data-id');
                    updateReqStatus(reqId, 'rejected');
                }
            });
        });

        document.querySelectorAll('.view-request-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const reqId = e.target.getAttribute('data-id');
                if (reqId && requestDetailCache[reqId]) {
                    openRequestModal(requestDetailCache[reqId]);
                }
            });
        });
    }

    function getLatestPathwayResult(data) {
        if (!data || typeof data !== 'object') return null;
        const results = Object.values(data).filter((item) => item && typeof item === 'object');
        if (results.length === 0) return null;
        return results.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0] || null;
    }

    function buildRequestCard(data) {
        const req = data.request;
        const studentName = req.studentName || data.userData.fullName || 'Student';
        const studentEmail = req.studentEmail || data.userData.email || 'N/A';
        const studentPhone = data.studentData.phone || data.userData.phone || 'N/A';
        const createdAt = req.createdAt ? new Date(req.createdAt).toLocaleDateString() : 'N/A';
        const status = (req.status || 'pending').toLowerCase();
        const badge = status === 'pending' ? 'badge-warning' : status === 'accepted' ? 'badge-approved' : 'badge-rejected';

        const card = document.createElement('div');
        card.className = 'student-card request-card glass';
        card.innerHTML = `
            <div class="request-card-header">
                <div>
                    <h4>${escapeHtml(studentName)}</h4>
                    <div class="text-sm text-muted">${escapeHtml(studentEmail)}</div>
                </div>
                <span class="badge ${badge}">${escapeHtml(status.toUpperCase())}</span>
            </div>
            <p class="text-sm"><strong>Requested:</strong> ${escapeHtml(createdAt)}</p>
            <p class="text-sm"><strong>Message:</strong> ${escapeHtml(req.message || 'No message')}</p>
            <div class="request-card-meta">
                <span>${escapeHtml(data.studentData.educationLevel || data.studentData.education || data.userData.educationLevel || 'Education unavailable')}</span>
                <span>${escapeHtml(data.studentData.interestArea || data.studentData.interest || data.userData.interestArea || 'Interest unavailable')}</span>
            </div>
            <div class="request-card-actions">
                <button class="btn btn-secondary btn-sm view-request-btn" data-id="${escapeHtml(data.reqId)}">View Details</button>
                <button class="btn btn-success btn-sm acc-btn" data-id="${escapeHtml(data.reqId)}">Accept</button>
                <button class="btn btn-danger btn-sm rej-btn" data-id="${escapeHtml(data.reqId)}">Reject</button>
            </div>
        `;
        return card;
    }

    function buildAcceptedCard(data) {
        const req = data.request;
        const studentName = req.studentName || data.userData.fullName || 'Student';
        const acceptedAt = req.updatedAt ? new Date(req.updatedAt).toLocaleDateString() : req.createdAt ? new Date(req.createdAt).toLocaleDateString() : 'N/A';
        const latestPathway = data.latestResult ? `${escapeHtml(data.latestResult.pathway || data.latestResult.recommendedPathway || 'Recommended pathway unavailable')} (${escapeHtml(displayVal(data.latestResult.pathwayScore || data.latestResult.score || 'N/A'))})` : 'No pathway match yet';

        const card = document.createElement('div');
        card.className = 'student-card glass';
        card.innerHTML = `
            <h4><i class="fas fa-user-graduate text-primary"></i> ${escapeHtml(studentName)}</h4>
            <p class="text-muted" style="margin:0 0 0.75rem; font-size:0.95rem;">Accepted on ${escapeHtml(acceptedAt)}</p>
            <p class="text-sm"><strong>Latest Pathway:</strong> ${latestPathway}</p>
            <div class="request-card-actions">
                <button class="btn btn-secondary btn-sm view-request-btn" data-id="${escapeHtml(data.reqId)}">View Details</button>
            </div>
        `;
        return card;
    }

    function openRequestModal(data) {
        const req = data.request;
        const studentData = data.studentData || {};
        const userData = data.userData || {};
        const latestResult = data.latestResult;

        document.getElementById('modal-request-title').textContent = `${escapeHtml(req.studentName || userData.fullName || 'Student')} Request Details`;
        document.getElementById('modal-status').textContent = (req.status || 'pending').toUpperCase();
        document.getElementById('modal-student-name').textContent = req.studentName || userData.fullName || 'N/A';
        document.getElementById('modal-student-email').textContent = req.studentEmail || userData.email || 'N/A';
        document.getElementById('modal-student-phone').textContent = studentData.phone || userData.phone || 'N/A';
        document.getElementById('modal-education').textContent = studentData.educationLevel || studentData.education || userData.educationLevel || 'N/A';
        document.getElementById('modal-interest').textContent = studentData.interestArea || studentData.interest || userData.interestArea || 'N/A';
        document.getElementById('modal-goal').textContent = studentData.futureGoal || studentData.goal || userData.futureGoal || 'N/A';
        document.getElementById('modal-learning-mode').textContent = studentData.learningMode || userData.learningMode || 'N/A';
        document.getElementById('modal-skills').textContent = studentData.skills || userData.skills || 'N/A';
        document.getElementById('modal-message').textContent = req.message || 'N/A';
        document.getElementById('modal-pathway-result').textContent = latestResult ? `${latestResult.pathway || latestResult.recommendedPathway || 'Recommended pathway unavailable'} (${displayVal(latestResult.pathwayScore || latestResult.score || 'N/A')})` : 'No pathway result available yet.';
        document.getElementById('modal-requested-at').textContent = req.createdAt ? new Date(req.createdAt).toLocaleDateString() : 'N/A';

        const overlay = document.getElementById('student-request-modal');
        if (overlay) overlay.classList.remove('hidden');
    }

    document.getElementById('modal-close-btn')?.addEventListener('click', () => {
        document.getElementById('student-request-modal')?.classList.add('hidden');
    });

    function updateReqStatus(reqId, newStatus) {
        const updates = {
            status: newStatus,
            updatedAt: Date.now()
        };
        update(ref(database, `mentorRequests/${reqId}`), updates)
            .then(() => {
                showToast(`Request ${newStatus} successfully!`, newStatus === 'accepted' ? 'success' : 'warning');
            })
            .catch(err => {
                console.error("Error updating request status:", err);
                showToast("Failed to process request.", "error");
            });
    }

    // --- Settings Change Password Submit ---
    const changePasswordForm = document.getElementById('change-password-form');
    changePasswordForm?.addEventListener('submit', (e) => {
        e.preventDefault();
        const user = auth.currentUser;
        if (!user) return;

        const newPwd = document.getElementById('settings-new-password').value;
        const confirmPwd = document.getElementById('settings-confirm-password').value;
        const errorEl = document.getElementById('password-match-error');

        if (newPwd.length < 8) {
            showToast("Password must be at least 8 characters long.", "error");
            return;
        }

        if (newPwd !== confirmPwd) {
            errorEl.classList.remove('hidden');
            return;
        }
        errorEl.classList.add('hidden');

        const saveBtn = document.getElementById('save-password-btn');
        const originalBtnText = saveBtn.textContent;
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Updating...';
        saveBtn.disabled = true;

        updatePassword(user, newPwd)
            .then(() => {
                showToast("Password updated successfully!", "success");
                closeAllModals();
            })
            .catch(err => {
                console.error("Password update error:", err);
                if (err.code === 'auth/requires-recent-login') {
                    showToast("For security, please logout and login again before changing your password.", "error");
                } else {
                    showToast(err.message || "Failed to update password.", "error");
                }
            })
            .finally(() => {
                saveBtn.textContent = originalBtnText;
                saveBtn.disabled = false;
            });
    });
});
