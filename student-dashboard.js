import { auth, database } from "./firebase-config.js";
import { onAuthStateChanged, signOut, updatePassword } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { ref, get, set, update, push, serverTimestamp, onValue } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
import { showToast, preserveThemeOnClear } from "./auth-nav.js";
import { initDashboardSidebar, updateSidebarUser } from "./sidebar.js";
import { ensureDashboardTopbarLayout, initDashboardNotifications } from "./dashboard-topbar.js";

document.addEventListener('DOMContentLoaded', () => {
    initDashboardSidebar();
    document.getElementById('complete-profile-card-btn')?.addEventListener('click', () => {
        window.location.href = 'profile.html';
    });

    // --- Authentication & Role Check ---
    let hasGeneratedPathway = false;

    onAuthStateChanged(auth, (user) => {
        if (!user) {
            window.location.href = 'login.html';
            return;
        }

        // Verify role
        get(ref(database, 'users/' + user.uid)).then((snapshot) => {
            if (snapshot.exists()) {
                const userData = snapshot.val();
                if (userData.userType.toLowerCase() !== 'student') {
                    showToast("Access denied. Directing to correct dashboard...", "error");
                    setTimeout(() => {
                        window.location.href = 'login.html';
                    }, 1500);
                    return;
                }
                
                // Check if they generated at least one pathway result
                get(ref(database, 'pathwayResults/' + user.uid)).then((pathwaySnapshot) => {
                    hasGeneratedPathway = pathwaySnapshot.exists();
                    
                    // --- Run Static / One-time Initializations ---
                    ensureDashboardTopbarLayout();
                    initDashboardNotifications(user.uid);
                    setupMentorRequests(user.uid, userData.fullName || 'Student');
                    loadPathwayResults(user.uid);

                    // --- Setup Real-Time Listeners for Live Updates ---
                    setupLiveListeners(user.uid);
                });
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

    function setupLiveListeners(uid) {
        // 1. Listen to users node live (for profile name, photoURL)
        onValue(ref(database, 'users/' + uid), (userSnap) => {
            if (userSnap.exists()) {
                const userData = userSnap.val();

                // Live update sidebar name and photo
                updateSidebarUser({
                    fullName: userData.fullName || 'Student',
                    role: 'student',
                    photoURL: userData.photoURL || '',
                });

                // Live update welcome header text
                const firstName = (userData.fullName || 'Student').split(' ')[0];
                const welcomeNameEl = document.getElementById('welcome-name');
                if (welcomeNameEl) {
                    welcomeNameEl.textContent = `Welcome back, ${firstName}`;
                }

                // Recalculate completion percentage with latest user data
                get(ref(database, 'students/' + uid)).then((studentSnap) => {
                    const studentData = studentSnap.exists() ? studentSnap.val() : {};
                    calculateProfileCompletion(uid, userData, studentData);
                });
            }
        });

        // 2. Listen to students node live (for district, stream, skills, goal, etc.)
        onValue(ref(database, 'students/' + uid), (studentSnap) => {
            if (studentSnap.exists()) {
                const studentData = studentSnap.val();

                // Recalculate completion percentage with latest student data
                get(ref(database, 'users/' + uid)).then((userSnap) => {
                    if (userSnap.exists()) {
                        calculateProfileCompletion(uid, userSnap.val(), studentData);
                    }
                });
            }
        });
    }

    function calculateProfileCompletion(uid, userData, studentData) {
        // Fields to verify (13 total)
        const fields = {
            fullName: userData.fullName || studentData.fullName || '',
            email: userData.email || studentData.email || '',
            phone: userData.phone || studentData.phone || '',
            photoURL: userData.photoURL || studentData.photoURL || '',
            district: studentData.district || '',
            educationLevel: studentData.educationLevel || '',
            examStream: studentData.examStream || '',
            resultStatus: studentData.resultStatus || '',
            interestArea: studentData.interestArea || '',
            futureGoal: studentData.futureGoal || '',
            financialSupport: studentData.financialSupport || '',
            learningMode: studentData.learningMode || '',
            skills: studentData.skills || ''
        };

        let completed = 0;
        const total = 13;

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

        // District Task
        const hasDistrict = !!fields.district;
        toggleTask('task-district', hasDistrict);
        if (hasDistrict) completed++;

        // Education Task
        const hasEducation = !!fields.educationLevel;
        toggleTask('task-education', hasEducation);
        if (hasEducation) completed++;

        // Exam Stream Task
        const hasStream = !!fields.examStream;
        toggleTask('task-stream', hasStream);
        if (hasStream) completed++;

        // Interest Task
        const hasInterest = !!fields.interestArea;
        toggleTask('task-interest', hasInterest);
        if (hasInterest) completed++;

        // Future Goal Task
        const hasGoal = !!fields.futureGoal;
        toggleTask('task-goal', hasGoal);
        if (hasGoal) completed++;

        // Skills Task
        const hasSkills = !!fields.skills;
        toggleTask('task-skills', hasSkills);
        if (hasSkills) completed++;

        // Photo URL Task
        const hasPhoto = !!fields.photoURL;
        toggleTask('task-photo', hasPhoto);
        if (hasPhoto) completed++;

        // Others counted towards overall completion calculation
        if (fields.fullName) completed++;
        if (fields.email) completed++;
        if (fields.resultStatus) completed++;
        if (fields.financialSupport) completed++;
        if (fields.learningMode) completed++;

        // Pathway Result Task (guided checklist only)
        toggleTask('task-pathway', hasGeneratedPathway);

        // Computation
        const percentage = Math.round((completed / total) * 100);

        // Save to Database so other widgets can read it
        if (studentData.profileCompletion !== percentage) {
            update(ref(database, 'students/' + uid), { profileCompletion: percentage });
        }

        // Update UI Progress Display
        const progressBar = document.getElementById('dynamic-profile-progress-bar');
        const progressBadge = document.getElementById('profile-strength-badge');
        const progressMsg = document.getElementById('profile-strength-message');

        if (progressBar) progressBar.style.width = `${percentage}%`;
        if (progressBadge) {
            progressBadge.textContent = `${percentage}% Strength`;
            if (percentage < 60) {
                progressBadge.className = 'badge badge-primary';
                progressBadge.style.backgroundColor = 'rgba(239, 68, 68, 0.1)';
                progressBadge.style.color = '#ef4444';
            } else if (percentage >= 90) {
                progressBadge.className = 'badge badge-success';
                progressBadge.style.backgroundColor = 'rgba(16, 185, 129, 0.1)';
                progressBadge.style.color = '#10b981';
            } else {
                progressBadge.className = 'badge badge-cyan';
                progressBadge.style.backgroundColor = 'rgba(6, 182, 212, 0.1)';
                progressBadge.style.color = '#06b6d4';
            }
        }

        if (progressMsg) {
            if (percentage < 60) {
                progressMsg.textContent = "⚠️ Complete your profile to get much better, hyper-personalized pathway recommendations and connect with ideal mentors!";
                progressMsg.style.color = '#ef4444';
            } else if (percentage >= 90) {
                progressMsg.textContent = "🎉 Brilliant job! Your profile is strong and fully optimized for excellent pathway search results.";
                progressMsg.style.color = '#10b981';
            } else {
                progressMsg.textContent = "👍 You are doing great! Add a few more details to unlock complete pathway reports and direct mentor matching.";
                progressMsg.style.color = '#4f46e5';
            }
        }
    }

    function loadPathwayResults(uid) {
        get(ref(database, 'pathwayResults/' + uid)).then((snapshot) => {
            if (snapshot.exists()) {
                const results = snapshot.val();
                const keys = Object.keys(results);
                const latestKey = keys[keys.length - 1];
                const latestResult = results[latestKey];

                document.getElementById('stat-results').textContent = keys.length;

                // Update UI
                document.getElementById('no-result-msg').classList.add('hidden');
                document.getElementById('has-result-data').classList.remove('hidden');

                document.getElementById('res-score').textContent = latestResult.pathwayScore || '--';
                document.getElementById('res-interest').textContent = latestResult.interestArea || '--';
                document.getElementById('res-goal').textContent = latestResult.futureGoal || '--';
                
                const financeStatus = latestResult.financialSupport || '--';
                const financeEl = document.getElementById('res-finance');
                financeEl.textContent = financeStatus;
                if (financeStatus.includes('Scholarship') || financeStatus.includes('Free')) {
                    financeEl.className = 'text-warning';
                } else {
                    financeEl.className = 'text-success';
                }

                populateTags('res-courses-tags', latestResult.recommendedCourses || []);
                populateTags('res-skills-tags', latestResult.recommendedSkills || []);
                populateTags('res-careers-tags', latestResult.careerPaths || []);

            } else {
                document.getElementById('no-result-msg').classList.remove('hidden');
                document.getElementById('has-result-data').classList.add('hidden');
            }
        });
    }

    function populateTags(containerId, items) {
        const container = document.getElementById(containerId);
        container.innerHTML = '';
        if (!items || items.length === 0) {
            container.innerHTML = '<span class="text-muted">None specified</span>';
            return;
        }
        items.forEach(item => {
            const span = document.createElement('span');
            span.className = 'tag';
            span.textContent = item;
            container.appendChild(span);
        });
    }

    function setupMentorRequests(studentUid, studentName) {
        const reqBtns = document.querySelectorAll('.req-mentor-btn');
        reqBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const mentorName = e.target.getAttribute('data-mentor');
                
                const originalText = e.target.textContent;
                e.target.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                e.target.disabled = true;

                const requestData = {
                    studentUid: studentUid,
                    studentName: studentName,
                    mentorName: mentorName,
                    message: "I would like to request guidance.",
                    status: "pending",
                    createdAt: serverTimestamp()
                };

                push(ref(database, 'mentorRequests'), requestData)
                    .then(() => {
                        e.target.innerHTML = 'Requested <i class="fas fa-check"></i>';
                        e.target.classList.replace('btn-primary', 'btn-outline');
                        showToast(`Mentorship request sent to ${mentorName}!`, "success");
                    })
                    .catch(err => {
                        console.error(err);
                        e.target.innerHTML = originalText;
                        e.target.disabled = false;
                        showToast("Failed to send mentorship request.", "error");
                    });
            });
        });
    }

    // --- Profile Editing Submit ---
    const editProfileForm = document.getElementById('student-edit-profile-form');
    editProfileForm?.addEventListener('submit', (e) => {
        e.preventDefault();
        const user = auth.currentUser;
        if (!user) return;

        const saveBtn = document.getElementById('save-student-profile-btn');
        const originalBtnText = saveBtn.textContent;
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
        saveBtn.disabled = true;

        const updatedData = {
            fullName: document.getElementById('edit-fullName').value,
            phone: document.getElementById('edit-phone').value,
            photoURL: document.getElementById('edit-photoURL').value,
            district: document.getElementById('edit-district').value,
            educationLevel: document.getElementById('edit-educationLevel').value,
            examStream: document.getElementById('edit-examStream').value,
            resultStatus: document.getElementById('edit-resultStatus').value,
            interestArea: document.getElementById('edit-interestArea').value,
            futureGoal: document.getElementById('edit-futureGoal').value,
            financialSupport: document.getElementById('edit-financialSupport').value,
            learningMode: document.getElementById('edit-learningMode').value,
            skills: document.getElementById('edit-skills').value,
            email: document.getElementById('edit-email').value,
            updatedAt: serverTimestamp()
        };

        // Update /users node
        const userUpdates = {
            fullName: updatedData.fullName,
            phone: updatedData.phone,
            photoURL: updatedData.photoURL,
            updatedAt: updatedData.updatedAt
        };

        update(ref(database, 'users/' + user.uid), userUpdates)
            .then(() => {
                // Update /students node
                return update(ref(database, 'students/' + user.uid), updatedData);
            })
            .then(() => {
                showToast("Profile updated successfully!", "success");
                closeAllModals();

                // (Dynamic updates are handled in real-time by the database listeners)
                
                // Refresh the dynamic elements like avatars in top header
                setTimeout(() => {
                    const event = new Event('authStateChanged');
                    window.dispatchEvent(event);
                }, 500);
            })
            .catch(err => {
                console.error("Error saving profile details:", err);
                showToast("Failed to save profile. Try again.", "error");
            })
            .finally(() => {
                saveBtn.textContent = originalBtnText;
                saveBtn.disabled = false;
            });
    });

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

    // --- Hash-based Navigation Router ---
    const allSections = [
        '.welcome-card',
        '.stats-grid',
        '#latest-result',
        '#courses',
        '.split-section',
        '#scholarships',
        '#mentors',
        '#skills',
        '#career-guide'
    ];

    const viewMapping = {
        'dashboard': ['.welcome-card', '.stats-grid', '#skills', '#career-guide'],
        'latest-result': ['#latest-result'],
        'courses': ['#courses'],
        'scholarships': ['.split-section', '#scholarships'],
        'mentors': ['.split-section', '#mentors']
    };

    function updateActiveView() {
        let hash = window.location.hash.substring(1); // remove '#'
        if (!hash || !viewMapping[hash]) {
            hash = 'dashboard';
        }

        // Show/hide content sections
        const activeSelectors = viewMapping[hash];
        allSections.forEach(selector => {
            const element = document.querySelector(selector);
            if (element) {
                if (activeSelectors.includes(selector)) {
                    element.classList.remove('hidden');
                } else {
                    element.classList.add('hidden');
                }
            }
        });

        // Update active class on sidebar links
        const sidebarLinks = document.querySelectorAll('.sidebar-links a');
        sidebarLinks.forEach(link => {
            const linkHref = link.getAttribute('href');
            if (linkHref) {
                const isDashboardDefault = (linkHref === 'student-dashboard.html' || linkHref === '#dashboard') && hash === 'dashboard';
                const isMatchingHash = linkHref === `#${hash}`;
                
                if (isDashboardDefault || isMatchingHash) {
                    link.classList.add('active');
                } else {
                    link.classList.remove('active');
                }
            }
        });

        // Update page title in the topbar
        const pageTitle = document.querySelector('.page-title');
        if (pageTitle) {
            if (hash === 'dashboard') {
                pageTitle.textContent = 'Student Dashboard';
            } else {
                const formattedTitle = hash.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
                pageTitle.textContent = formattedTitle;
            }
        }

        // Auto-close sidebar on mobile after navigation
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebar-overlay');
        if (sidebar && window.innerWidth <= 768) {
            sidebar.classList.remove('active');
            document.body.classList.remove('sidebar-mobile-open');
            overlay?.classList.remove('show');
        }
    }

    // Listen to hash changes and run on load
    window.addEventListener('hashchange', updateActiveView);
    updateActiveView();
});
