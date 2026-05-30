import { auth, database } from "./firebase-config.js";
import { onAuthStateChanged, signOut, updatePassword } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { ref, get, set, update, onValue } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
import { showToast, preserveThemeOnClear } from "./auth-nav.js";

document.addEventListener('DOMContentLoaded', () => {
    // --- Sidebar Toggle ---
    const sidebarToggle = document.getElementById('sidebar-toggle');
    const closeSidebar = document.getElementById('close-sidebar');
    const sidebar = document.getElementById('sidebar');

    if (sidebarToggle && sidebar && closeSidebar) {
        sidebarToggle.addEventListener('click', () => {
            sidebar.classList.add('active');
        });
        closeSidebar.addEventListener('click', () => {
            sidebar.classList.remove('active');
        });
    }



    let currentUid = null;

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
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            signOut(auth).then(() => {
                preserveThemeOnClear();
                sessionStorage.clear();
                window.location.href = 'login.html';
            });
        });
    }

    function initMentorDashboard(uid, userData) {
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
        onValue(reqRef, (snapshot) => {
            const tbody = document.getElementById('requests-tbody');
            const acceptedGrid = document.getElementById('accepted-grid');
            if (tbody) tbody.innerHTML = '';
            if (acceptedGrid) acceptedGrid.innerHTML = '';

            let pendingCount = 0;
            let acceptedCount = 0;

            if (snapshot.exists()) {
                const data = snapshot.val();
                
                Object.keys(data).forEach(reqId => {
                    const req = data[reqId];
                    if (req.mentorName === mentorName || req.mentorUid === uid) {
                        
                        if (req.status === 'pending') {
                            pendingCount++;
                            if (tbody) {
                                const tr = document.createElement('tr');
                                tr.innerHTML = `
                                    <td>${req.studentName}</td>
                                    <td>${req.message || 'No message'}</td>
                                    <td>${new Date(req.createdAt).toLocaleDateString()}</td>
                                    <td><span class="badge badge-warning">Pending</span></td>
                                    <td class="action-btns">
                                        <button class="btn btn-success btn-sm acc-btn" data-id="${reqId}">Accept</button>
                                        <button class="btn btn-danger btn-sm rej-btn" data-id="${reqId}">Reject</button>
                                    </td>
                                `;
                                tbody.appendChild(tr);
                            }
                        } else if (req.status === 'accepted') {
                            acceptedCount++;
                            if (acceptedGrid) {
                                const div = document.createElement('div');
                                div.className = 'student-card glass';
                                div.style.padding = '16px';
                                div.style.borderRadius = '12px';
                                div.style.border = '1px solid var(--border-color)';
                                div.innerHTML = `
                                    <h4><i class="fas fa-user-graduate text-primary"></i> ${req.studentName}</h4>
                                    <p class="text-muted" style="font-size:12px; margin-top:4px;"><i class="fas fa-calendar-alt"></i> Accepted on ${new Date(req.updatedAt || req.createdAt).toLocaleDateString()}</p>
                                    <button class="btn btn-outline btn-sm mt-2" style="padding:6px 12px; font-size:12px;"><i class="fas fa-envelope"></i> Message Student</button>
                                `;
                                acceptedGrid.appendChild(div);
                            }
                        }
                    }
                });
            }

            if (pendingCount === 0 && tbody) {
                tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-muted">No pending requests found.</td></tr>';
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
    }

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
