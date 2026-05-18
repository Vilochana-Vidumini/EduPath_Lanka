import { auth, database } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { ref, get, set, update, onValue } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

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
                    alert("Access denied. Please login with a mentor account.");
                    window.location.href = 'login.html';
                    return;
                }
                
                // Initialize Dashboard
                initMentorDashboard(user.uid, userData);
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

    function initMentorDashboard(uid, userData) {
        const firstName = userData.fullName.split(' ')[0];
        document.getElementById('top-user-name').textContent = firstName;
        document.getElementById('welcome-name').textContent = `Welcome, ${firstName}`;

        // Load Mentor Specific Data from /mentors/{uid}
        get(ref(database, 'mentors/' + uid)).then((snapshot) => {
            if (snapshot.exists()) {
                const mentorData = snapshot.val();
                populateProfileForm(userData, mentorData);
                updateStatusUI(mentorData.status);
            } else {
                // Initial mentor record if not fully created
                populateProfileForm(userData, { status: "pending" });
                updateStatusUI("pending");
            }
        });

        // Setup Listeners
        setupProfileForm(uid);
        listenForRequests(uid, userData.fullName);
    }

    function updateStatusUI(status) {
        const statEl = document.getElementById('stat-status');
        const alertEl = document.getElementById('status-alert');
        
        statEl.textContent = status ? status.charAt(0).toUpperCase() + status.slice(1) : "Pending";
        
        if (status === 'pending') {
            statEl.className = 'text-warning';
            alertEl.textContent = "Your mentor profile is currently under review by an admin. You can complete your profile details while waiting for approval.";
            alertEl.className = "alert alert-warning";
            alertEl.classList.remove('hidden');
        } else if (status === 'approved') {
            statEl.className = 'text-success';
            alertEl.classList.add('hidden');
        } else if (status === 'rejected') {
            statEl.className = 'text-danger';
            alertEl.textContent = "Your mentor application was rejected. Please contact support.";
            alertEl.className = "alert alert-danger";
            alertEl.classList.remove('hidden');
        }
    }

    function populateProfileForm(userData, mentorData) {
        document.getElementById('prof-name').value = userData.fullName || '';
        document.getElementById('prof-email').value = userData.email || '';
        document.getElementById('prof-phone').value = userData.phone || mentorData.phone || '';
        document.getElementById('prof-field').value = mentorData.mentoringField || '';
        document.getElementById('prof-org').value = mentorData.organization || '';
        document.getElementById('prof-exp').value = mentorData.experienceYears || '';
        document.getElementById('prof-bio').value = mentorData.bio || '';
    }

    function setupProfileForm(uid) {
        const btn = document.getElementById('save-profile-btn');
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
            btn.disabled = true;

            const updates = {
                phone: document.getElementById('prof-phone').value,
                mentoringField: document.getElementById('prof-field').value,
                organization: document.getElementById('prof-org').value,
                experienceYears: document.getElementById('prof-exp').value,
                bio: document.getElementById('prof-bio').value
            };

            update(ref(database, 'mentors/' + uid), updates)
                .then(() => {
                    const msg = document.getElementById('profile-msg');
                    msg.classList.remove('hidden');
                    setTimeout(() => msg.classList.add('hidden'), 3000);
                })
                .catch(err => {
                    console.error("Error updating profile:", err);
                    alert("Error updating profile.");
                })
                .finally(() => {
                    btn.innerHTML = 'Save Changes';
                    btn.disabled = false;
                });
        });
    }

    function listenForRequests(uid, mentorName) {
        const reqRef = ref(database, 'mentorRequests');
        onValue(reqRef, (snapshot) => {
            const tbody = document.getElementById('requests-tbody');
            const acceptedGrid = document.getElementById('accepted-grid');
            tbody.innerHTML = '';
            acceptedGrid.innerHTML = '';

            let pendingCount = 0;
            let acceptedCount = 0;

            if (snapshot.exists()) {
                const data = snapshot.val();
                
                Object.keys(data).forEach(reqId => {
                    const req = data[reqId];
                    // Filter by this mentor
                    if (req.mentorName === mentorName || req.mentorUid === uid) {
                        
                        if (req.status === 'pending') {
                            pendingCount++;
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
                        } else if (req.status === 'accepted') {
                            acceptedCount++;
                            const div = document.createElement('div');
                            div.className = 'student-card glass';
                            div.innerHTML = `
                                <h4><i class="fas fa-user-graduate text-primary"></i> ${req.studentName}</h4>
                                <p class="text-muted"><i class="fas fa-calendar-alt"></i> Accepted on ${new Date(req.updatedAt || req.createdAt).toLocaleDateString()}</p>
                                <button class="btn btn-outline btn-sm mt-2"><i class="fas fa-envelope"></i> Message Student</button>
                            `;
                            acceptedGrid.appendChild(div);
                        }
                    }
                });
            }

            if (pendingCount === 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-muted">No pending requests found.</td></tr>';
            }
            if (acceptedCount === 0) {
                acceptedGrid.innerHTML = '<div class="text-muted p-4 full-width text-center">No students accepted yet.</div>';
            }

            document.getElementById('stat-requests').textContent = pendingCount;
            document.getElementById('req-count').textContent = pendingCount;
            document.getElementById('stat-accepted').textContent = acceptedCount;

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
                if(confirm("Are you sure you want to reject this request?")) {
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
            .catch(err => console.error("Error updating status", err));
    }
});
