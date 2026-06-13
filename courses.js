// Course Catalog JavaScript - Loading from Firebase
import { auth, database } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { ref, get, set, onValue, push, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
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

    const grid = document.getElementById('courses-grid');
    const searchInput = document.getElementById('course-search');
    const chips = document.querySelectorAll('.chip');

    let allCourses = []; // Will be populated from Firebase
    let activeCategory = 'all';
    let searchQuery = '';
    let activeDistrictFilter = '';
    let activeModeFilter = '';
    let activeFeeTypeFilter = '';
    let activeQualificationFilter = '';

    // Helper function
    function displayVal(value) {
        if (value === null || value === undefined || value === '') return 'N/A';
        if (typeof value === 'object') return 'N/A';
        return String(value);
    }

    function escapeHtml(str) {
        if (str == null) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // --- Load Courses from Firebase ---
    function loadCoursesFromFirebase() {
        const coursesRef = ref(database, 'courses');
        onValue(coursesRef, (snapshot) => {
            allCourses = [];
            if (snapshot.exists()) {
                const data = snapshot.val();
                Object.entries(data).forEach(([id, course]) => {
                    // Only show active courses
                    const status = String(course.status || 'active').trim().toLowerCase();
                    if (status === 'active') {
                        allCourses.push({
                            id,
                            ...course
                        });
                    }
                });
            }
            renderCourses();
        });
    }

    // --- Render Courses ---
    function renderCourses() {
        if (!grid) return;

        let filtered = allCourses.filter(course => {
            // Category filter
            const matchesCategory = activeCategory === 'all' || String(course.category || '').toLowerCase().includes(activeCategory);

            // Search query filter
            const courseName = (course.courseName || course.courseTitle || course.name || '').toLowerCase();
            const institute = (course.instituteName || course.institute || '').toLowerCase();
            const description = (course.description || course.desc || '').toLowerCase();
            const skills = (course.skillsCovered || '').toLowerCase();
            const matchesSearch = courseName.includes(searchQuery) ||
                institute.includes(searchQuery) ||
                description.includes(searchQuery) ||
                skills.includes(searchQuery);

            // District filter
            const matchesDistrict = !activeDistrictFilter || (course.district === activeDistrictFilter);

            // Mode filter
            const matchesMode = !activeModeFilter || (course.mode === activeModeFilter || course.type === activeModeFilter);

            // Fee Type filter
            const matchesFee = !activeFeeTypeFilter || (course.feeType === activeFeeTypeFilter);

            // Qualification filter
            const matchesQual = !activeQualificationFilter || (course.qualificationLevel === activeQualificationFilter || course.level === activeQualificationFilter);

            return matchesCategory && matchesSearch && matchesDistrict && matchesMode && matchesFee && matchesQual;
        });

        if (filtered.length === 0) {
            grid.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 3rem; color: var(--text-muted);">
                    <i class="fas fa-search" style="font-size: 3rem; color: #cbd5e1; margin-bottom: 1rem;"></i>
                    <h3>No Courses Found</h3>
                    <p>Try refining your search or filters. No courses match your criteria at this time.</p>
                </div>
            `;
            return;
        }

        // Update result count
        const resultCount = document.querySelector('.result-count') || document.createElement('div');
        resultCount.className = 'result-count';
        resultCount.textContent = `Showing ${filtered.length} course${filtered.length !== 1 ? 's' : ''}`;
        if (!document.querySelector('.result-count')) {
            grid.parentElement?.insertBefore(resultCount, grid);
        }

        grid.innerHTML = filtered.map(course => `
            <div class="course-card">
                <div class="card-top">
                    ${course.imageURL ? `<img src="${escapeHtml(course.imageURL)}" alt="${escapeHtml(course.courseName || course.courseTitle || 'Course')}" class="course-image" style="height:200px; object-fit:cover; width:100%; border-radius:8px; margin-bottom:1rem;">` : ''}
                    <span class="card-badge" style="background-color: ${getCategoryColor(course.category)};">${escapeHtml(displayVal(course.category))}</span>
                    <h3>${escapeHtml(course.courseName || course.courseTitle || course.name)}</h3>
                    <p class="text-sm text-muted"><strong>${escapeHtml(displayVal(course.instituteName || course.institute))}</strong></p>
                    <p class="course-desc">${escapeHtml((course.description || '').substring(0, 120))}...</p>
                </div>
                <div style="flex: 1; display: flex; flex-direction: column; justify-content: space-between;">
                    <div class="card-meta" style="font-size: 0.9rem; display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin-bottom: 1rem;">
                        <span class="meta-item"><i class="far fa-clock"></i> ${escapeHtml(displayVal(course.duration))}</span>
                        <span class="meta-item"><i class="fas fa-map-marker-alt"></i> ${escapeHtml(displayVal(course.district))}</span>
                        <span class="meta-item"><i class="fas fa-money-bill"></i> ${escapeHtml(displayVal(course.fee || course.feeAmount))}</span>
                        <span class="meta-item"><i class="fas fa-laptop"></i> ${escapeHtml(displayVal(course.mode || course.type))}</span>
                    </div>
                    <div class="card-fee" style="background: #f0f0f0; padding: 0.75rem; border-radius: 6px; margin-bottom: 1rem; text-align: center;">
                        <strong style="color: var(--primary-blue);">
                            ${course.feeType === 'Free' ? 'FREE' : course.feeType === 'Paid' ? 'LKR ' + (course.feeAmount || 'TBD') : escapeHtml(displayVal(course.feeType))}
                        </strong>
                    </div>
                    <div class="card-actions">
                        <button class="btn btn-primary btn-card-primary view-course-details-btn" data-id="${course.id}">View Details</button>
                        <button class="btn btn-outline inquire-course-btn" data-id="${course.id}">Inquire</button>
                        <button class="btn-card-outline save-course-btn restricted-action" data-action="save-course" data-id="${course.id}" title="Save Course">
                            <i class="far fa-heart"></i>
                        </button>
                    </div>
                </div>
            </div>
        `).join('');

        attachCourseActionListeners();
    }

    function getCategoryColor(category) {
        const colors = {
            'Information Technology': '#0066cc',
            'Engineering': '#ff6b6b',
            'Business & Management': '#4ecdc4',
            'Health & Care': '#95e1d3',
            'Teaching & Education': '#f38181',
            'Design & Creative Media': '#aa96da',
            'Tourism & Hospitality': '#fcbad3',
            'Agriculture': '#a8d8a8',
            'Automobile & Technical': '#ffc93c',
            'Entrepreneurship': '#ff7b54',
            'Sports': '#e0aaff',
        };
        return colors[category] || '#0066cc';
    }

    function attachCourseActionListeners() {
        // View Details buttons
        document.querySelectorAll('.view-course-details-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const courseId = btn.getAttribute('data-id');
                const course = allCourses.find(c => c.id === courseId);
                if (course) {
                    showCourseDetailsModal(course);
                }
            });
        });

        // Save Course buttons
        document.querySelectorAll('.inquire-course-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const course = allCourses.find(c => c.id === btn.getAttribute('data-id'));
                if (course) showCourseDetailsModal(course, true);
            });
        });

        // Save Course buttons
        document.querySelectorAll('.save-course-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                onAuthStateChanged(auth, (user) => {
                    if (!user) {
                        window.location.href = 'login.html?redirect=courses.html';
                        return;
                    }

                    // Check if user is student
                    get(ref(database, `users/${user.uid}`)).then(snapshot => {
                        if (!snapshot.exists()) return;
                        const userData = snapshot.val();
                        const userType = (userData.userType || '').toLowerCase();

                        if (userType !== 'student') {
                            showToast('Only students can save courses.', 'warning');
                            return;
                        }

                        const courseId = btn.getAttribute('data-id');
                        const icon = btn.querySelector('i');

                        // Toggle saved state
                        const savedRef = ref(database, `savedCourses/${user.uid}/${courseId}`);
                        if (btn.classList.contains('saved')) {
                            // Remove from saved
                            set(savedRef, null).then(() => {
                                btn.classList.remove('saved');
                                icon.className = 'far fa-heart';
                                showToast('Course removed from saved list.', 'success');
                            }).catch(() => showToast('Course update failed. Please try again.', 'error'));
                        } else {
                            // Add to saved
                            const course = allCourses.find(c => c.id === courseId);
                            set(savedRef, {
                                ...course,
                                savedAt: new Date().toISOString()
                            }).then(() => {
                                btn.classList.add('saved');
                                icon.className = 'fas fa-heart';
                                showToast('Course saved successfully!', 'success');
                            }).catch(() => showToast('Course save failed. Please try again.', 'error'));
                        }
                    });
                });
            });
        });
    }

    function showCourseDetailsModal(course, focusInquiry = false) {
        const modalHtml = `
            <div style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 10000; padding: 1rem;">
                <div style="background: white; border-radius: 12px; max-width: 800px; width: 100%; max-height: 90vh; overflow-y: auto; padding: 2rem; position: relative;">
                    <button class="close-modal-btn" style="position: absolute; top: 1rem; right: 1rem; background: none; border: none; font-size: 1.5rem; cursor: pointer;">&times;</button>

                    ${course.imageURL ? `<img src="${escapeHtml(course.imageURL)}" alt="${escapeHtml(course.courseName)}" style="width:100%; height:300px; object-fit:cover; border-radius:8px; margin-bottom:1.5rem;">` : ''}

                    <h2 style="margin: 0 0 0.5rem 0;">${escapeHtml(course.courseName || course.courseTitle || course.name)}</h2>
                    <p style="margin: 0 0 1.5rem 0; color: var(--text-muted);"><strong>${escapeHtml(displayVal(course.instituteName))}</strong> • ${escapeHtml(displayVal(course.category))}</p>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.5rem; background: #f5f5f5; padding: 1rem; border-radius: 8px;">
                        <div><strong>Duration:</strong> ${escapeHtml(displayVal(course.duration))}</div>
                        <div><strong>Mode:</strong> ${escapeHtml(displayVal(course.mode || course.type))}</div>
                        <div><strong>Fee Type:</strong> ${escapeHtml(displayVal(course.feeType))}</div>
                        ${course.feeAmount ? `<div><strong>Fee Amount:</strong> LKR ${escapeHtml(course.feeAmount)}</div>` : ''}
                        <div><strong>District:</strong> ${escapeHtml(displayVal(course.district))}</div>
                        <div><strong>Location:</strong> ${escapeHtml(displayVal(course.location))}</div>
                        <div><strong>Qualification:</strong> ${escapeHtml(displayVal(course.qualificationLevel || course.level))}</div>
                        ${course.startDate ? `<div><strong>Start Date:</strong> ${escapeHtml(course.startDate)}</div>` : ''}
                    </div>

                    ${course.description ? `<div style="margin-bottom: 1.5rem;"><h4>Description</h4><p>${escapeHtml(course.description)}</p></div>` : ''}
                    ${course.eligibility ? `<div style="margin-bottom: 1.5rem;"><h4>Eligibility</h4><p>${escapeHtml(course.eligibility)}</p></div>` : ''}
                    ${course.entryRequirements ? `<div style="margin-bottom: 1.5rem;"><h4>Entry Requirements</h4><p>${escapeHtml(course.entryRequirements)}</p></div>` : ''}
                    ${course.skillsCovered ? `<div style="margin-bottom: 1.5rem;"><h4>Skills Covered</h4><p>${escapeHtml(course.skillsCovered)}</p></div>` : ''}
                    ${course.careerOpportunities ? `<div style="margin-bottom: 1.5rem;"><h4>Career Opportunities</h4><p>${escapeHtml(course.careerOpportunities)}</p></div>` : ''}

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.5rem; background: #f5f5f5; padding: 1rem; border-radius: 8px;">
                        ${course.contactEmail ? `<div><strong>Contact Email:</strong> ${escapeHtml(course.contactEmail)}</div>` : ''}
                        ${course.contactPhone || course.contactNumber ? `<div><strong>Contact Phone:</strong> ${escapeHtml(course.contactPhone || course.contactNumber)}</div>` : ''}
                        ${course.deadline ? `<div><strong>Deadline:</strong> ${escapeHtml(course.deadline)}</div>` : ''}
                    </div>

                    <form id="course-inquiry-form" style="margin: 1.5rem 0; display: grid; gap: 0.75rem; padding: 1rem; border: 1px solid #e2e8f0; border-radius: 10px;">
                        <h4 style="margin:0;">Send Inquiry</h4>
                        <input id="inq-name" placeholder="Your name" required style="padding:0.8rem;border:1px solid #e2e8f0;border-radius:8px;">
                        <input id="inq-email" type="email" placeholder="Email" required style="padding:0.8rem;border:1px solid #e2e8f0;border-radius:8px;">
                        <input id="inq-phone" placeholder="Phone number" style="padding:0.8rem;border:1px solid #e2e8f0;border-radius:8px;">
                        <textarea id="inq-message" placeholder="Message" required style="padding:0.8rem;border:1px solid #e2e8f0;border-radius:8px;min-height:90px;"></textarea>
                        <button class="btn btn-primary" type="submit">Send Inquiry</button>
                    </form>

                    <div style="display: flex; gap: 1rem;">
                        ${course.applyLink ? `<a href="${escapeHtml(course.applyLink)}" target="_blank" class="btn btn-primary">Apply Now</a>` : ''}
                        <button class="btn btn-secondary close-modal-btn">Close</button>
                    </div>
                </div>
            </div>
        `;

        const modalDiv = document.createElement('div');
        modalDiv.innerHTML = modalHtml;
        document.body.appendChild(modalDiv);
        wireInquiryForm(modalDiv, course);
        if (focusInquiry) setTimeout(() => modalDiv.querySelector('#course-inquiry-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);

        document.querySelectorAll('.close-modal-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                modalDiv.remove();
            });
        });

        modalDiv.addEventListener('click', (e) => {
            if (e.target === modalDiv) {
                modalDiv.remove();
            }
        });
    }

    function wireInquiryForm(modalDiv, course) {
        const form = modalDiv.querySelector('#course-inquiry-form');
        form?.addEventListener('submit', async (event) => {
            event.preventDefault();
            const inquiryRef = push(ref(database, 'courseInquiries'));
            const inquiry = {
                inquiryId: inquiryRef.key,
                courseId: course.id,
                courseName: course.courseName || course.courseTitle || course.name || 'Course',
                instituteUid: course.instituteUid || '',
                instituteName: course.instituteName || '',
                studentName: modalDiv.querySelector('#inq-name').value.trim(),
                email: modalDiv.querySelector('#inq-email').value.trim(),
                phone: modalDiv.querySelector('#inq-phone').value.trim(),
                message: modalDiv.querySelector('#inq-message').value.trim(),
                status: 'New',
                createdAt: Date.now(),
                updatedAt: serverTimestamp()
            };
            if (!inquiry.studentName || !inquiry.email || !inquiry.message) {
                showToast('Please fill name, email, and message.', 'warning');
                return;
            }
            const submitButton = form.querySelector('button[type="submit"]');
            const originalText = submitButton?.textContent || 'Send Inquiry';
            if (submitButton) {
                submitButton.disabled = true;
                submitButton.textContent = 'Sending...';
            }
            try {
                await set(inquiryRef, inquiry);
                showToast('Inquiry sent successfully.', 'success');
                modalDiv.remove();
            } catch (error) {
                console.error('Inquiry send failed:', error);
                showToast('Inquiry sending failed. Please try again.', 'error');
                if (submitButton) {
                    submitButton.disabled = false;
                    submitButton.textContent = originalText;
                }
            }
        });
    }

    // --- Filter Handlers ---
    chips.forEach(chip => {
        chip.addEventListener('click', () => {
            chips.forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            activeCategory = chip.getAttribute('data-category');
            renderCourses();
        });
    });

    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            searchQuery = e.target.value.toLowerCase().trim();
            renderCourses();
        });
    }

    // Load courses from Firebase on page load
    loadCoursesFromFirebase();

    // --- Handle Restricted Save Action (for compatibility) ---
    document.addEventListener('restricted-action-triggered', (e) => {
        const { action, element } = e.detail;
        if (action === 'save-course') {
            const icon = element.querySelector('i');
            element.classList.toggle('saved');
            if (element.classList.contains('saved')) {
                icon.className = 'fas fa-heart';
            } else {
                icon.className = 'far fa-heart';
            }
        }
    });
});
