function openStudentDetailModal(uid) {
    const student = getStudentRows().find((row) => row.uid === uid) || {};
    let modal = document.getElementById('admin-course-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'admin-course-modal';
        modal.className = 'admin-course-modal-overlay';
        document.body.appendChild(modal);
    }

    const name = student.fullName || 'Unknown Student';
    const email = student.email || 'N/A';
    const district = student.district || 'N/A';
    const status = student.accountStatus || 'active';
    const photo = student.photoURL || 'images/default-avatar.png';
    const dispStatus = status ? status.charAt(0).toUpperCase() + status.slice(1) : '';

    modal.innerHTML = `
    <div class="admin-course-modal-card">
        <div class="acm-header">
            <div class="icon-wrap"><i class="fas fa-user-graduate"></i></div>
            <h2>Student Details</h2>
            <span class="acm-badge ${status === 'active' ? 'approved' : status === 'suspended' ? 'rejected' : 'pending'}">
                ${dispStatus}
            </span>
            <button class="acm-close" id="acm-close-top"><i class="fas fa-times"></i></button>
        </div>
        
        <div class="acm-body">
            <div class="acm-main-card">
                <div class="lbl">Student Name</div>
                <div style="display: flex; align-items: center; gap: 1rem; margin-top: 0.5rem; margin-bottom: 1rem;">
                    <img src="${escapeAttr(photo)}" alt="${escapeAttr(name)}" style="width: 60px; height: 60px; border-radius: 50%; object-fit: cover; border: 2px solid var(--border-color);">
                    <h1 style="margin: 0;">${escapeHtml(name)}</h1>
                </div>
                <div class="acm-meta-row">
                    <div class="acm-meta-item">
                        <i class="fas fa-envelope acm-meta-icon"></i>
                        <div class="acm-meta-text"><span>Email</span><strong>${escapeHtml(email)}</strong></div>
                    </div>
                    <div class="acm-divider"></div>
                    <div class="acm-meta-item">
                        <i class="fas fa-map-marker-alt acm-meta-icon"></i>
                        <div class="acm-meta-text"><span>District</span><strong>${escapeHtml(district)}</strong></div>
                    </div>
                </div>
            </div>

            <div class="acm-section">
                <div class="acm-section-header">
                    <div class="acm-section-icon blue"><i class="fas fa-info-circle"></i></div>
                    <h3>Personal Information</h3>
                </div>
                <div class="acm-grid">
                    <div class="acm-field"><span>Phone</span><strong>${escapeHtml(student.phone || 'N/A')}</strong></div>
                    <div class="acm-field"><span>Account Status</span><span class="acm-stat-badge" style="width:fit-content;${status === 'active' ? '' : 'color:#d97706;background:#fffbeb;'}">${dispStatus}</span></div>
                    <div class="acm-field"><span>Created At</span><strong>${escapeHtml(display(student.createdAt))}</strong></div>
                    <div class="acm-field"><span>Last Active At</span><strong>${escapeHtml(display(student.lastActiveAt))}</strong></div>
                </div>
            </div>

            <div class="acm-section">
                <div class="acm-section-header">
                    <div class="acm-section-icon slate"><i class="fas fa-graduation-cap"></i></div>
                    <h3>Education Information</h3>
                </div>
                <div class="acm-grid">
                    <div class="acm-field"><span>Education Level</span><strong>${escapeHtml(display(student.educationLevel))}</strong></div>
                    <div class="acm-field"><span>Exam Stream</span><strong>${escapeHtml(display(student.examStream))}</strong></div>
                    <div class="acm-field"><span>Result Status</span><strong>${escapeHtml(display(student.resultStatus))}</strong></div>
                </div>
            </div>

            <div class="acm-section">
                <div class="acm-section-header">
                    <div class="acm-section-icon purple"><i class="fas fa-bullseye"></i></div>
                    <h3>Guidance & Goals</h3>
                </div>
                <div class="acm-grid">
                    <div class="acm-field"><span>Interest Area</span><strong>${escapeHtml(display(student.interestArea))}</strong></div>
                    <div class="acm-field"><span>Skills</span><strong>${escapeHtml(display(student.skills))}</strong></div>
                    <div class="acm-field"><span>Future Goal</span><strong>${escapeHtml(display(student.futureGoal))}</strong></div>
                    <div class="acm-field"><span>Financial Support</span><strong>${escapeHtml(display(student.financialSupport))}</strong></div>
                    <div class="acm-field"><span>Learning Mode</span><strong>${escapeHtml(display(student.learningMode))}</strong></div>
                </div>
            </div>
            
            <div class="acm-section">
                <div class="acm-section-header">
                    <div class="acm-section-icon green"><i class="fas fa-chart-line"></i></div>
                    <h3>Platform Progress</h3>
                </div>
                <div class="acm-grid">
                    <div class="acm-field"><span>Profile Completion</span><strong>${escapeHtml(display(student.profileCompletion))}</strong></div>
                    <div class="acm-field"><span>Pathway Completed</span><strong>${escapeHtml(display(student.pathwayCompleted))}</strong></div>
                    <div class="acm-field"><span>Saved Courses</span><strong>${escapeHtml(display(student.savedCoursesCount))}</strong></div>
                    <div class="acm-field"><span>Saved Scholarships</span><strong>${escapeHtml(display(student.savedScholarshipsCount))}</strong></div>
                    <div class="acm-field"><span>Mentor Requests</span><strong>${escapeHtml(display(student.mentorRequestsCount))}</strong></div>
                </div>
            </div>
        </div>
        <div class="acm-footer">
            <button id="acm-close-btn">Close</button>
        </div>
    </div>
    `;

    setTimeout(() => modal.classList.add('show'), 10);
    const closeModal = () => {
        modal.classList.remove('show');
        setTimeout(() => {
            if (modal.parentElement) modal.parentElement.removeChild(modal);
        }, 300);
    };

    document.getElementById('acm-close-top')?.addEventListener('click', closeModal);
    document.getElementById('acm-close-btn')?.addEventListener('click', closeModal);
}

function openMentorDetailModal(uid) {
    const m = getMentorRows().find((row) => row.uid === uid) || {};
    const requests = Object.values(adminState.mentorRequests).filter((r) => r.mentorUid === uid);
    const pendingRequestsCount = requests.filter((r) => normalize(r.status) === "pending").length;
    const acceptedRequestsCount = requests.filter((r) => normalize(r.status) === "accepted").length;

    let modal = document.getElementById('admin-course-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'admin-course-modal';
        modal.className = 'admin-course-modal-overlay';
        document.body.appendChild(modal);
    }

    const name = m.fullName || 'Unknown Mentor';
    const email = m.email || 'N/A';
    const role = m.currentRole || 'N/A';
    const status = m.status || m.approvalStatus || 'pending';
    const photo = m.photoURL || 'images/default-avatar.png';
    const dispStatus = status ? status.charAt(0).toUpperCase() + status.slice(1) : '';

    modal.innerHTML = `
    <div class="admin-course-modal-card">
        <div class="acm-header">
            <div class="icon-wrap"><i class="fas fa-chalkboard-teacher"></i></div>
            <h2>Mentor Details</h2>
            <span class="acm-badge ${status === 'approved' || status === 'active' ? 'approved' : status === 'rejected' ? 'rejected' : 'pending'}">
                <i class="fas ${status === 'approved' || status === 'active' ? 'fa-check-circle' : status === 'rejected' ? 'fa-times-circle' : 'fa-clock'}"></i> 
                ${dispStatus}
            </span>
            <button class="acm-close" id="acm-close-top"><i class="fas fa-times"></i></button>
        </div>
        
        <div class="acm-body">
            <div class="acm-main-card">
                <div class="lbl">Mentor Name</div>
                <div style="display: flex; align-items: center; gap: 1rem; margin-top: 0.5rem; margin-bottom: 1rem;">
                    <img src="${escapeAttr(photo)}" alt="${escapeAttr(name)}" style="width: 60px; height: 60px; border-radius: 50%; object-fit: cover; border: 2px solid var(--border-color);">
                    <h1 style="margin: 0;">${escapeHtml(name)}</h1>
                </div>
                <div class="acm-meta-row">
                    <div class="acm-meta-item">
                        <i class="fas fa-envelope acm-meta-icon"></i>
                        <div class="acm-meta-text"><span>Email</span><strong>${escapeHtml(email)}</strong></div>
                    </div>
                    <div class="acm-divider"></div>
                    <div class="acm-meta-item">
                        <i class="fas fa-briefcase acm-meta-icon"></i>
                        <div class="acm-meta-text"><span>Role</span><strong>${escapeHtml(role)}</strong></div>
                    </div>
                </div>
            </div>

            <div class="acm-section">
                <div class="acm-section-header">
                    <div class="acm-section-icon blue"><i class="fas fa-info-circle"></i></div>
                    <h3>Personal Information</h3>
                </div>
                <div class="acm-grid">
                    <div class="acm-field"><span>Phone</span><strong>${escapeHtml(display(m.phone))}</strong></div>
                    <div class="acm-field"><span>District</span><strong>${escapeHtml(display(m.district))}</strong></div>
                    <div class="acm-field"><span>City</span><strong>${escapeHtml(display(m.city))}</strong></div>
                    <div class="acm-field"><span>Languages</span><strong>${escapeHtml(display(m.preferredLanguages))}</strong></div>
                </div>
            </div>

            <div class="acm-section">
                <div class="acm-section-header">
                    <div class="acm-section-icon slate"><i class="fas fa-briefcase"></i></div>
                    <h3>Professional Information</h3>
                </div>
                <div class="acm-grid">
                    <div class="acm-field"><span>Mentor Type</span><strong>${escapeHtml(display(m.mentorType))}</strong></div>
                    <div class="acm-field"><span>Field</span><strong>${escapeHtml(display(m.field))}</strong></div>
                    <div class="acm-field"><span>Current Role</span><strong>${escapeHtml(display(m.currentRole))}</strong></div>
                    <div class="acm-field"><span>University / Company</span><strong>${escapeHtml(display(m.universityOrCompany))}</strong></div>
                    <div class="acm-field"><span>Highest Qualification</span><strong>${escapeHtml(display(m.highestQualification))}</strong></div>
                    <div class="acm-field"><span>Degree Area</span><strong>${escapeHtml(display(m.degreeArea))}</strong></div>
                    <div class="acm-field"><span>Experience</span><strong>${escapeHtml(display(m.experience))}</strong></div>
                    <div class="acm-field" style="grid-column: span 2;"><span>Bio</span><strong>${escapeHtml(display(m.bio))}</strong></div>
                </div>
            </div>

            <div class="acm-section">
                <div class="acm-section-header">
                    <div class="acm-section-icon purple"><i class="fas fa-hands-helping"></i></div>
                    <h3>Guidance Details</h3>
                </div>
                <div class="acm-grid">
                    <div class="acm-field"><span>Guidance Areas</span><strong>${escapeHtml(display(m.guidanceAreas))}</strong></div>
                    <div class="acm-field"><span>Student Levels</span><strong>${escapeHtml(display(m.studentLevelsSupported))}</strong></div>
                    <div class="acm-field"><span>Available Days</span><strong>${escapeHtml(display(m.availableDays))}</strong></div>
                    <div class="acm-field"><span>Available Time</span><strong>${escapeHtml(display(m.availableTime))}</strong></div>
                    <div class="acm-field"><span>Mentoring Mode</span><strong>${escapeHtml(display(m.mentoringMode))}</strong></div>
                    <div class="acm-field"><span>Max Students/Week</span><strong>${escapeHtml(display(m.maximumStudentsPerWeek))}</strong></div>
                </div>
            </div>

            <div class="acm-section">
                <div class="acm-section-header">
                    <div class="acm-section-icon green"><i class="fas fa-check-circle"></i></div>
                    <h3>Approval & Platform Stats</h3>
                </div>
                <div class="acm-grid">
                    <div class="acm-field"><span>Status</span><span class="acm-stat-badge" style="width:fit-content;${status === 'approved' || status === 'active' ? '' : 'color:#d97706;background:#fffbeb;'}">${dispStatus}</span></div>
                    <div class="acm-field"><span>Approved At</span><strong>${escapeHtml(display(m.approvedAt))}</strong></div>
                    <div class="acm-field"><span>Approved By</span><strong>${escapeHtml(display(m.approvedBy))}</strong></div>
                    <div class="acm-field"><span>Profile Completion</span><strong>${escapeHtml(display(m.profileCompletion))}</strong></div>
                    <div class="acm-field"><span>Pending Requests</span><strong>${escapeHtml(display(pendingRequestsCount))}</strong></div>
                    <div class="acm-field"><span>Accepted Requests</span><strong>${escapeHtml(display(acceptedRequestsCount))}</strong></div>
                    <div class="acm-field"><span>Last Active At</span><strong>${escapeHtml(display(m.lastActiveAt))}</strong></div>
                </div>
            </div>
        </div>
        <div class="acm-footer">
            <button id="acm-close-btn">Close</button>
        </div>
    </div>
    `;

    setTimeout(() => modal.classList.add('show'), 10);
    const closeModal = () => {
        modal.classList.remove('show');
        setTimeout(() => {
            if (modal.parentElement) modal.parentElement.removeChild(modal);
        }, 300);
    };

    document.getElementById('acm-close-top')?.addEventListener('click', closeModal);
    document.getElementById('acm-close-btn')?.addEventListener('click', closeModal);
}
