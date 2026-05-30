import { auth, database } from "./firebase-config.js";
import { onAuthStateChanged, signOut, updatePassword } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { ref, get, set, update, push, onValue, remove } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
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

    // --- Redirect Controls ---
    document.getElementById('complete-profile-card-btn')?.addEventListener('click', () => {
        window.location.href = 'profile.html';
    });

    // --- Authentication & Role Check ---
    onAuthStateChanged(auth, (user) => {
        if (!user) {
            window.location.href = 'login.html';
            return;
        }

        // Verify role
        get(ref(database, 'users/' + user.uid)).then((snapshot) => {
            if (snapshot.exists()) {
                const userData = snapshot.val();
                const userType = userData.userType || userData.role || '';
                if (userType.toLowerCase() !== 'admin') {
                    showToast("Access denied. Directing to correct dashboard...", "error");
                    setTimeout(() => {
                        const type = userType.toLowerCase();
                        if (type === 'student') window.location.href = 'student-dashboard.html';
                        else if (type === 'mentor') window.location.href = 'mentor-dashboard.html';
                        else window.location.href = 'login.html';
                    }, 1500);
                    return;
                }
                
                // Initialize Dashboard
                initAdminDashboard(user.uid, userData);
            } else {
                console.warn("Admin record missing in database. Attempting fallback...");
                // Fallback: If user is authenticated in Firebase Auth, check if they are likely an admin
                if (user.email && (user.email.includes('admin') || user.email === 'admin@edupath.lk')) {
                    const defaultAdmin = {
                        uid: user.uid,
                        fullName: user.displayName || 'EduPath Admin',
                        email: user.email,
                        userType: 'Admin',
                        createdAt: Date.now()
                    };
                    set(ref(database, 'users/' + user.uid), defaultAdmin).then(() => {
                        initAdminDashboard(user.uid, defaultAdmin);
                    }).catch(err => {
                        console.error("Fallback admin creation failed: ", err);
                        window.location.href = 'login.html';
                    });
                } else {
                    window.location.href = 'login.html';
                }
            }
        }).catch(err => {
            console.error("Role verification error: ", err);
            showToast("Failed to verify admin status: " + (err.message || err), "error");
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

    // Keep track of checklist completion flags
    let tasksCompleted = {
        phone: false,
        photo: false,
        reviewMentors: false,
        addCourse: false,
        addScholarship: false
    };

    function initAdminDashboard(uid, userData) {
        const topUserName = document.getElementById('top-user-name') || document.querySelector('.ep-avatar-name');
        if (topUserName) {
            topUserName.textContent = userData.fullName || 'Admin';
        }

        const welcomeName = document.getElementById('welcome-name');
        if (welcomeName) {
            welcomeName.textContent = `Admin Panel - ${userData.fullName || 'Admin'}`;
        }

        // Load all data listeners
        listenForStats();
        listenForMentors();
        listenForCourses();
        listenForScholarships();

        // Setup Forms
        setupCourseForm();
        setupScholForm();

        // Track and compute admin profile strength
        trackAdminProfileStrength(uid, userData);
    }

    function trackAdminProfileStrength(uid, userData) {
        // Fetch real-time changes to the admin user block
        onValue(ref(database, 'users/' + uid), (snapshot) => {
            if (!snapshot.exists()) return;
            const data = snapshot.val();

            // Total 4 fields: fullName, email, phone, photoURL
            const hasPhone = !!data.phone;
            const hasPhoto = !!data.photoURL;

            tasksCompleted.phone = hasPhone;
            tasksCompleted.photo = hasPhoto;

            updateChecklistUI();

            let completed = 0;
            const total = 4;
            if (data.fullName) completed++;
            if (data.email) completed++;
            if (hasPhone) completed++;
            if (hasPhoto) completed++;

            const percentage = Math.round((completed / total) * 100);

            const progressBar = document.getElementById('dynamic-profile-progress-bar');
            const progressBadge = document.getElementById('profile-strength-badge');
            const progressMsg = document.getElementById('profile-strength-message');

            if (progressBar) progressBar.style.width = `${percentage}%`;
            if (progressBadge) {
                progressBadge.textContent = `${percentage}% Strength`;
                if (percentage < 100) {
                    progressBadge.style.backgroundColor = 'rgba(245, 158, 11, 0.1)';
                    progressBadge.style.color = '#f59e0b';
                } else {
                    progressBadge.style.backgroundColor = 'rgba(16, 185, 129, 0.1)';
                    progressBadge.style.color = '#10b981';
                }
            }

            if (progressMsg) {
                if (percentage < 100) {
                    progressMsg.textContent = "⚠️ Fill in all key admin details like a contact phone number and a professional photo URL to achieve 100% profile strength.";
                    progressMsg.style.color = '#f59e0b';
                } else {
                    progressMsg.textContent = "🎉 Fantastic! Your admin profile is complete and fully optimized.";
                    progressMsg.style.color = '#10b981';
                }
            }
        });
    }

    function updateChecklistUI() {
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

        toggleTask('task-phone', tasksCompleted.phone);
        toggleTask('task-photo', tasksCompleted.photo);
        toggleTask('task-review-mentors', tasksCompleted.reviewMentors);
        toggleTask('task-add-course', tasksCompleted.addCourse);
        toggleTask('task-add-scholarship', tasksCompleted.addScholarship);
    }

    function listenForStats() {
        // Students
        onValue(ref(database, 'students'), (snapshot) => {
            const el = document.getElementById('stat-students');
            if (el) el.textContent = snapshot.exists() ? Object.keys(snapshot.val()).length : 0;
        });
        
        // Courses
        onValue(ref(database, 'courses'), (snapshot) => {
            const el = document.getElementById('stat-courses');
            const count = snapshot.exists() ? Object.keys(snapshot.val()).length : 0;
            if (el) el.textContent = count;
            
            tasksCompleted.addCourse = count > 0;
            updateChecklistUI();
        });

        // Scholarships
        onValue(ref(database, 'scholarships'), (snapshot) => {
            const el = document.getElementById('stat-scholarships');
            const count = snapshot.exists() ? Object.keys(snapshot.val()).length : 0;
            if (el) el.textContent = count;

            tasksCompleted.addScholarship = count > 0;
            updateChecklistUI();
        });

        // Pathway Results
        onValue(ref(database, 'pathwayResults'), (snapshot) => {
            let count = 0;
            if (snapshot.exists()) {
                Object.values(snapshot.val()).forEach(userResults => {
                    count += Object.keys(userResults).length;
                });
            }
            const el = document.getElementById('stat-results');
            if (el) el.textContent = count;
        });

        // Mentor Requests
        onValue(ref(database, 'mentorRequests'), (snapshot) => {
            const el = document.getElementById('stat-requests');
            const count = snapshot.exists() ? Object.keys(snapshot.val()).length : 0;
            if (el) el.textContent = count;

            const tbody = document.getElementById('admin-requests-tbody');
            if (!tbody) return;
            tbody.innerHTML = '';

            if (snapshot.exists()) {
                const requests = snapshot.val();
                Object.keys(requests).forEach(key => {
                    const r = requests[key];
                    const tr = document.createElement('tr');
                    
                    let badgeClass = 'badge-warning';
                    if (r.status === 'accepted' || r.status === 'approved') badgeClass = 'badge-success';
                    if (r.status === 'declined' || r.status === 'rejected') badgeClass = 'badge-danger';

                    tr.innerHTML = `
                        <td>
                            <strong>${r.studentName || 'Unnamed Student'}</strong>
                            <div style="font-size: 0.8rem; color: var(--text-muted);">${r.studentEmail || '-'}</div>
                        </td>
                        <td>
                            <strong>${r.mentorName || 'Unnamed Mentor'}</strong>
                            <div style="font-size: 0.8rem; color: var(--text-muted);">${r.mentorField || '-'}</div>
                        </td>
                        <td>
                            <p class="text-sm" style="max-width: 280px; margin: 0; white-space: normal; line-height: 1.4;">${r.message || '-'}</p>
                        </td>
                        <td><span class="badge ${badgeClass}">${(r.status || 'pending').toUpperCase()}</span></td>
                        <td>
                            <button class="btn btn-danger btn-sm delete-request-btn" data-id="${key}"><i class="fas fa-trash"></i> Delete</button>
                        </td>
                    `;
                    tbody.appendChild(tr);
                });

                // Attach delete button action listeners
                tbody.querySelectorAll('.delete-request-btn').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        const btnEl = e.target.closest('.delete-request-btn');
                        const id = btnEl.getAttribute('data-id');
                        if (confirm("Are you sure you want to delete this mentor request?")) {
                            remove(ref(database, `mentorRequests/${id}`))
                                .then(() => showToast("Request deleted successfully.", "success"))
                                .catch(err => showToast("Failed to delete request.", "error"));
                        }
                    });
                });
            } else {
                tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-muted">No student mentor requests found.</td></tr>';
            }
        });

        // Contact Messages
        onValue(ref(database, 'contactMessages'), (snapshot) => {
            const el = document.getElementById('stat-messages');
            const count = snapshot.exists() ? Object.keys(snapshot.val()).length : 0;
            if (el) el.textContent = count;

            const tbody = document.getElementById('admin-messages-tbody');
            if (!tbody) return;
            tbody.innerHTML = '';

            if (snapshot.exists()) {
                const messages = snapshot.val();
                Object.keys(messages).forEach(key => {
                    const m = messages[key];
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td><strong>${m.name || 'Anonymous'}</strong></td>
                        <td>${m.email || '-'}</td>
                        <td><strong>${m.subject || m.title || '-'}</strong></td>
                        <td>
                            <p class="text-sm" style="max-width: 300px; margin: 0; white-space: normal; line-height: 1.4;">${m.message || '-'}</p>
                        </td>
                        <td>
                            <button class="btn btn-danger btn-sm delete-message-btn" data-id="${key}"><i class="fas fa-trash"></i> Delete</button>
                        </td>
                    `;
                    tbody.appendChild(tr);
                });

                // Attach delete action listeners
                tbody.querySelectorAll('.delete-message-btn').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        const btnEl = e.target.closest('.delete-message-btn');
                        const id = btnEl.getAttribute('data-id');
                        if (confirm("Are you sure you want to delete this message?")) {
                            remove(ref(database, `contactMessages/${id}`))
                                .then(() => showToast("Message deleted successfully.", "success"))
                                .catch(err => showToast("Failed to delete message.", "error"));
                        }
                    });
                });
            } else {
                tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-muted">No contact messages received yet.</td></tr>';
            }
        });
    }

    function listenForMentors() {
        onValue(ref(database, 'mentors'), (snapshot) => {
            const tbody = document.getElementById('admin-mentors-tbody');
            if (!tbody) return;
            tbody.innerHTML = '';
            
            let total = 0;
            let pending = 0;

            if (snapshot.exists()) {
                const mentors = snapshot.val();
                const keys = Object.keys(mentors);
                
                tasksCompleted.reviewMentors = true; // start true, make false if pending exist

                let renderedCount = 0;
                
                keys.forEach(mentorId => {
                    total++;
                    const m = mentors[mentorId];
                    if (m.status === 'pending') {
                        pending++;
                        tasksCompleted.reviewMentors = false; // still pending review
                    }

                    // Get user data for name
                    get(ref(database, 'users/' + mentorId)).then(userSnap => {
                        const name = userSnap.exists() ? userSnap.val().fullName : 'Unknown';
                        
                        const tr = document.createElement('tr');
                        let badgeClass = 'badge-success';
                        if (m.status === 'pending') badgeClass = 'badge-warning';
                        if (m.status === 'rejected') badgeClass = 'badge-danger';

                        tr.innerHTML = `
                            <td>${name}</td>
                            <td>${m.field || m.mentoringField || '-'}</td>
                            <td>${m.universityOrCompany || m.organization || '-'}</td>
                            <td><span class="badge ${badgeClass}">${(m.status || 'pending').toUpperCase()}</span></td>
                            <td class="action-btns">
                                ${m.status === 'pending' ? `<button class="btn btn-success btn-sm acc-mentor-btn" data-id="${mentorId}">Approve</button>
                                <button class="btn btn-danger btn-sm rej-mentor-btn" data-id="${mentorId}">Reject</button>` : ''}
                            </td>
                        `;
                        tbody.appendChild(tr);
                    }).catch(err => {
                        console.warn(`Failed to fetch user node for mentor ${mentorId}:`, err);
                        // Fallback render to keep UI functional and prevent page crashes
                        const tr = document.createElement('tr');
                        let badgeClass = 'badge-success';
                        if (m.status === 'pending') badgeClass = 'badge-warning';
                        if (m.status === 'rejected') badgeClass = 'badge-danger';

                        tr.innerHTML = `
                            <td>Mentor (${mentorId.substring(0, 6)})</td>
                            <td>${m.field || m.mentoringField || '-'}</td>
                            <td>${m.universityOrCompany || m.organization || '-'}</td>
                            <td><span class="badge ${badgeClass}">${(m.status || 'pending').toUpperCase()}</span></td>
                            <td class="action-btns">
                                ${m.status === 'pending' ? `<button class="btn btn-success btn-sm acc-mentor-btn" data-id="${mentorId}">Approve</button>
                                <button class="btn btn-danger btn-sm rej-mentor-btn" data-id="${mentorId}">Reject</button>` : ''}
                            </td>
                        `;
                        tbody.appendChild(tr);
                    }).finally(() => {
                        renderedCount++;
                        if (renderedCount === keys.length) {
                            attachMentorActionListeners();
                        }
                    });
                });
            } else {
                tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-muted">No mentors found.</td></tr>';
                tasksCompleted.reviewMentors = true; // no mentors to review
            }

            const statMentors = document.getElementById('stat-mentors');
            const statPendingMentors = document.getElementById('stat-pending-mentors');

            if (statMentors) statMentors.textContent = total;
            if (statPendingMentors) statPendingMentors.textContent = pending;

            updateChecklistUI();
        });
    }

    function attachMentorActionListeners() {
        document.querySelectorAll('.acc-mentor-btn').forEach(btn => {
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);
            newBtn.addEventListener('click', (e) => {
                const id = e.target.getAttribute('data-id');
                update(ref(database, `mentors/${id}`), { status: 'approved' })
                    .then(() => showToast("Mentor approved successfully!", "success"))
                    .catch(err => showToast("Approval failed.", "error"));
            });
        });

        document.querySelectorAll('.rej-mentor-btn').forEach(btn => {
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);
            newBtn.addEventListener('click', (e) => {
                if (confirm("Reject this mentor?")) {
                    const id = e.target.getAttribute('data-id');
                    update(ref(database, `mentors/${id}`), { status: 'rejected' })
                        .then(() => showToast("Mentor application rejected.", "warning"))
                        .catch(err => showToast("Failed to reject.", "error"));
                }
            });
        });
    }

    function setupCourseForm() {
        const form = document.getElementById('add-course-form');
        if (!form) return;
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const btn = document.getElementById('add-course-btn');
            const originalText = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Adding...';
            btn.disabled = true;

            const courseData = {
                name: document.getElementById('course-name').value,
                institute: document.getElementById('course-institute').value,
                category: document.getElementById('course-category').value,
                duration: document.getElementById('course-duration').value,
                mode: document.getElementById('course-mode').value,
                feeType: document.getElementById('course-fee').value,
                createdAt: Date.now()
            };

            push(ref(database, 'courses'), courseData)
                .then(() => {
                    form.reset();
                    showToast("Course added successfully!", "success");
                })
                .catch(err => showToast("Error adding course.", "error"))
                .finally(() => {
                    btn.innerHTML = originalText;
                    btn.disabled = false;
                });
        });
    }

    function listenForCourses() {
        onValue(ref(database, 'courses'), (snapshot) => {
            const tbody = document.getElementById('admin-courses-tbody');
            if (!tbody) return;
            tbody.innerHTML = '';
            
            if (snapshot.exists()) {
                const courses = snapshot.val();
                Object.keys(courses).forEach(key => {
                    const c = courses[key];
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td><strong>${c.name}</strong><br><span class="text-muted text-sm">${c.institute}</span></td>
                        <td>${c.category}</td>
                        <td><span class="badge ${c.feeType === 'Free' ? 'badge-success' : 'badge-warning'}">${c.feeType}</span></td>
                    `;
                    tbody.appendChild(tr);
                });
            } else {
                tbody.innerHTML = '<tr><td colspan="3" class="text-center py-4 text-muted">No courses added yet.</td></tr>';
            }
        });
    }

    function setupScholForm() {
        const form = document.getElementById('add-schol-form');
        if (!form) return;
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const btn = document.getElementById('add-schol-btn');
            const originalText = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Adding...';
            btn.disabled = true;

            const scholData = {
                name: document.getElementById('schol-name').value,
                provider: document.getElementById('schol-provider').value,
                category: document.getElementById('schol-category').value,
                createdAt: Date.now()
            };

            push(ref(database, 'scholarships'), scholData)
                .then(() => {
                    form.reset();
                    showToast("Scholarship added successfully!", "success");
                })
                .catch(err => showToast("Error adding scholarship.", "error"))
                .finally(() => {
                    btn.innerHTML = originalText;
                    btn.disabled = false;
                });
        });
    }

    function listenForScholarships() {
        onValue(ref(database, 'scholarships'), (snapshot) => {
            const tbody = document.getElementById('admin-schol-tbody');
            if (!tbody) return;
            tbody.innerHTML = '';
            
            if (snapshot.exists()) {
                const schol = snapshot.val();
                Object.keys(schol).forEach(key => {
                    const s = schol[key];
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td><strong>${s.name}</strong></td>
                        <td>${s.provider}</td>
                        <td>${s.category}</td>
                    `;
                    tbody.appendChild(tr);
                });
            } else {
                tbody.innerHTML = '<tr><td colspan="3" class="text-center py-4 text-muted">No scholarships added yet.</td></tr>';
            }
        });
    }


});
