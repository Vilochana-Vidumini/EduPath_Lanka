import { auth, database } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { ref, get, set, update, push, onValue, remove } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

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
                if (userData.userType.toLowerCase() !== 'admin') {
                    alert("Access denied. Please login with an admin account.");
                    window.location.href = 'login.html';
                    return;
                }
                
                // Initialize Dashboard
                initAdminDashboard(user.uid, userData);
            } else {
                window.location.href = 'login.html';
            }
        }).catch(err => console.error(err));
    });

    // --- Logout ---
    const logoutBtn = document.getElementById('logout-btn-sidebar');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            signOut(auth).then(() => {
                localStorage.clear();
                window.location.href = 'login.html';
            });
        });
    }

    function initAdminDashboard(uid, userData) {
        document.getElementById('top-user-name').textContent = userData.fullName || 'Admin';

        // Load all data listeners
        listenForStats();
        listenForMentors();
        listenForCourses();
        listenForScholarships();

        // Setup Forms
        setupCourseForm();
        setupScholForm();
    }

    function listenForStats() {
        // Students
        onValue(ref(database, 'students'), (snapshot) => {
            document.getElementById('stat-students').textContent = snapshot.exists() ? Object.keys(snapshot.val()).length : 0;
        });
        
        // Courses
        onValue(ref(database, 'courses'), (snapshot) => {
            document.getElementById('stat-courses').textContent = snapshot.exists() ? Object.keys(snapshot.val()).length : 0;
        });

        // Scholarships
        onValue(ref(database, 'scholarships'), (snapshot) => {
            document.getElementById('stat-scholarships').textContent = snapshot.exists() ? Object.keys(snapshot.val()).length : 0;
        });

        // Pathway Results
        onValue(ref(database, 'pathwayResults'), (snapshot) => {
            let count = 0;
            if (snapshot.exists()) {
                Object.values(snapshot.val()).forEach(userResults => {
                    count += Object.keys(userResults).length;
                });
            }
            document.getElementById('stat-results').textContent = count;
        });

        // Mentor Requests
        onValue(ref(database, 'mentorRequests'), (snapshot) => {
            document.getElementById('stat-requests').textContent = snapshot.exists() ? Object.keys(snapshot.val()).length : 0;
        });

        // Contact Messages
        onValue(ref(database, 'contactMessages'), (snapshot) => {
            document.getElementById('stat-messages').textContent = snapshot.exists() ? Object.keys(snapshot.val()).length : 0;
        });
    }

    function listenForMentors() {
        onValue(ref(database, 'mentors'), (snapshot) => {
            const tbody = document.getElementById('admin-mentors-tbody');
            tbody.innerHTML = '';
            
            let total = 0;
            let pending = 0;

            if (snapshot.exists()) {
                const mentors = snapshot.val();
                
                Object.keys(mentors).forEach(mentorId => {
                    total++;
                    const m = mentors[mentorId];
                    if (m.status === 'pending') pending++;

                    // Get user data for name
                    get(ref(database, 'users/' + mentorId)).then(userSnap => {
                        const name = userSnap.exists() ? userSnap.val().fullName : 'Unknown';
                        
                        const tr = document.createElement('tr');
                        let badgeClass = 'badge-success';
                        if(m.status === 'pending') badgeClass = 'badge-warning';
                        if(m.status === 'rejected') badgeClass = 'badge-danger';

                        tr.innerHTML = `
                            <td>${name}</td>
                            <td>${m.mentoringField || '-'}</td>
                            <td>${m.organization || '-'}</td>
                            <td><span class="badge ${badgeClass}">${(m.status || 'pending').toUpperCase()}</span></td>
                            <td class="action-btns">
                                ${m.status === 'pending' ? `<button class="btn btn-success btn-sm acc-mentor-btn" data-id="${mentorId}">Approve</button>
                                <button class="btn btn-danger btn-sm rej-mentor-btn" data-id="${mentorId}">Reject</button>` : ''}
                            </td>
                        `;
                        tbody.appendChild(tr);

                        // Reattach listeners to new buttons
                        attachMentorActionListeners();
                    });
                });
            } else {
                tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-muted">No mentors found.</td></tr>';
            }

            document.getElementById('stat-mentors').textContent = total;
            document.getElementById('stat-pending-mentors').textContent = pending;
        });
    }

    function attachMentorActionListeners() {
        document.querySelectorAll('.acc-mentor-btn').forEach(btn => {
            // Remove old listener if re-rendered
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);
            newBtn.addEventListener('click', (e) => {
                const id = e.target.getAttribute('data-id');
                update(ref(database, `mentors/${id}`), { status: 'approved' });
            });
        });

        document.querySelectorAll('.rej-mentor-btn').forEach(btn => {
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);
            newBtn.addEventListener('click', (e) => {
                if(confirm("Reject this mentor?")) {
                    const id = e.target.getAttribute('data-id');
                    update(ref(database, `mentors/${id}`), { status: 'rejected' });
                }
            });
        });
    }

    function setupCourseForm() {
        const form = document.getElementById('add-course-form');
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
                    alert("Course added successfully!");
                })
                .catch(err => alert("Error adding course"))
                .finally(() => {
                    btn.innerHTML = originalText;
                    btn.disabled = false;
                });
        });
    }

    function listenForCourses() {
        onValue(ref(database, 'courses'), (snapshot) => {
            const tbody = document.getElementById('admin-courses-tbody');
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
                    alert("Scholarship added successfully!");
                })
                .catch(err => alert("Error adding scholarship"))
                .finally(() => {
                    btn.innerHTML = originalText;
                    btn.disabled = false;
                });
        });
    }

    function listenForScholarships() {
        onValue(ref(database, 'scholarships'), (snapshot) => {
            const tbody = document.getElementById('admin-schol-tbody');
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
