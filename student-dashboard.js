import { auth, database } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { ref, get, push, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

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
                if (userData.userType.toLowerCase() !== 'student') {
                    alert("Access denied. Please login with a student account.");
                    window.location.href = 'login.html';
                    return;
                }
                
                // Initialize Dashboard
                initDashboard(user.uid, userData);
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

    function initDashboard(uid, userData) {
        // Set names
        document.getElementById('top-user-name').textContent = userData.fullName.split(' ')[0];
        document.getElementById('welcome-name').textContent = `Welcome back, ${userData.fullName.split(' ')[0]}`;

        // Load Pathway Results
        loadPathwayResults(uid);
        
        // Setup Mentor Request Buttons
        setupMentorRequests(uid, userData.fullName);
    }

    function loadPathwayResults(uid) {
        get(ref(database, 'pathwayResults/' + uid)).then((snapshot) => {
            if (snapshot.exists()) {
                const results = snapshot.val();
                
                // We might have multiple results (push ID). Get the latest one.
                const keys = Object.keys(results);
                // Sort by createdAt or just take the last key if we assume sequential push IDs
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
                    financeEl.classList.add('text-warning');
                } else {
                    financeEl.classList.remove('text-warning');
                    financeEl.classList.add('text-success');
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
                    })
                    .catch(err => {
                        console.error(err);
                        e.target.innerHTML = originalText;
                        e.target.disabled = false;
                        alert("Failed to send request.");
                    });
            });
        });
    }
});
