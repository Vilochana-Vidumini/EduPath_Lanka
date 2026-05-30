import { auth, database } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { ref, get, push, set, serverTimestamp, onValue } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

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

    // Check Auth State
    onAuthStateChanged(auth, async (user) => {
        currentUser = user;
        if (user) {
            // Fetch user type
            try {
                const userRef = ref(database, 'users/' + user.uid);
                const snapshot = await get(userRef);
                if (snapshot.exists()) {
                    currentUserType = snapshot.val().userType;
                    if(currentUserType.toLowerCase() === 'student') {
                        const studentSnap = await get(ref(database, 'students/' + user.uid));
                        if(studentSnap.exists()) {
                            currentStudentData = studentSnap.val();
                        }
                    }
                }
            } catch (error) {
                console.error("Error fetching user data:", error);
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

        const mentorsRef = ref(database, 'mentors');
        onValue(mentorsRef, (snapshot) => {
            allMentors = [];
            if (snapshot.exists()) {
                snapshot.forEach((childSnapshot) => {
                    const mentor = childSnapshot.val();
                    // Only add approved mentors
                    if (mentor.status === 'approved') {
                        allMentors.push({
                            id: mentor.uid,
                            name: mentor.fullName || 'Unnamed Mentor',
                            category: (mentor.mentorType || mentor.field || 'General').toLowerCase(),
                            designation: mentor.field || 'Mentor',
                            company: mentor.universityOrCompany || 'Independent',
                            avatar: mentor.photoURL || null,
                            bio: mentor.bio || 'No bio available yet.',
                            experience: mentor.experience || 'Not specified',
                            availableTime: mentor.availableTime || 'Flexible',
                            email: mentor.email
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
                    </div>
                </div>
                
                <div class="mentor-footer">
                    <span class="exp-badge"><i class="fas fa-award"></i> ${mentor.experience}</span>
                    <button class="btn btn-primary btn-request" data-id="${mentor.id}" data-name="${mentor.name}" data-field="${mentor.designation}">
                        Request Mentor
                    </button>
                </div>
            </div>
        `}).join('');

        // Attach event listeners to new buttons
        document.querySelectorAll('.btn-request').forEach(btn => {
            btn.addEventListener('click', handleRequestMentor);
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
            alert('Only students can request mentors.');
            return;
        }

        const btn = e.target;
        const mentorId = btn.getAttribute('data-id');
        const mentorName = btn.getAttribute('data-name');
        const mentorField = btn.getAttribute('data-field');

        const confirmReq = confirm(`Do you want to send a mentorship request to ${mentorName}?`);
        if(!confirmReq) return;

        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
        btn.disabled = true;

        try {
            const requestRef = push(ref(database, 'mentorRequests'));
            const requestId = requestRef.key;

            await set(requestRef, {
                requestId: requestId,
                studentUid: currentUser.uid,
                studentName: currentStudentData ? currentStudentData.fullName : currentUser.displayName || 'Student',
                studentEmail: currentUser.email,
                mentorUid: mentorId,
                mentorName: mentorName,
                mentorField: mentorField,
                message: "I would like to request you as my mentor. Please review my profile.",
                status: "pending",
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });

            alert(`Mentorship request sent successfully to ${mentorName}!`);
            btn.textContent = "Request Sent";
            btn.style.background = "#059669";
            btn.style.borderColor = "#059669";
            btn.disabled = true;

        } catch (error) {
            console.error("Error sending request:", error);
            alert("Failed to send request. Please try again.");
            btn.textContent = "Request Mentor";
            btn.disabled = false;
        }
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
