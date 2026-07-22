function openScholarshipDetailModal(scholarship) {
    if (!scholarship) return;
    let modal = document.getElementById('admin-course-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'admin-course-modal';
        modal.className = 'admin-course-modal-overlay';
        document.body.appendChild(modal);
    }

    const id = scholarship.scholarshipId || scholarship.id || '';
    const name = scholarship.scholarshipName || scholarship.title || 'Unknown Scholarship';
    const status = scholarship.approvalStatus || scholarship.status || 'pending';
    const provider = scholarship.provider || scholarship.organization || 'N/A';
    const amountBenefit = scholarship.amountBenefit || scholarship.amount || 'N/A';
    const eduLevels = Array.isArray(scholarship.eligibleEducationLevels) ? scholarship.eligibleEducationLevels.join(', ') : (scholarship.eligibleEducationLevels || scholarship.educationLevels || 'N/A');
    
    let keywordsHtml = '';
    const kwds = scholarship.matchingKeywords || scholarship.keywords || [];
    if (Array.isArray(kwds) && kwds.length > 0) {
        keywordsHtml = kwds.map(k => '<span class="acm-pill">' + escapeHtml(k) + '</span>').join('');
    } else {
        keywordsHtml = '<span style="color:#94a3b8;font-size:0.8rem;">No keywords</span>';
    }

    const createdBy = scholarship.createdBy || 'System Admin';
    const role = scholarship.creatorRole || 'admin';
    const createdAt = scholarship.createdAt || Date.now();
    const adminUid = scholarship.adminUid || scholarship.creatorUid || 'seed_admin';

    const dispStatus = status ? status.charAt(0).toUpperCase() + status.slice(1) : '';

    modal.innerHTML = `
    <div class="admin-course-modal-card">
        <div class="acm-header">
            <div class="icon-wrap"><i class="fas fa-award"></i></div>
            <h2>Scholarship Details</h2>
            <span class="acm-badge ${status === 'approved' || status === 'active' ? 'approved' : status === 'rejected' ? 'rejected' : 'pending'}">
                <i class="fas ${status === 'approved' || status === 'active' ? 'fa-check-circle' : status === 'rejected' ? 'fa-times-circle' : 'fa-clock'}"></i> 
                ${dispStatus}
            </span>
            <button class="acm-close" id="acm-close-top"><i class="fas fa-times"></i></button>
        </div>
        
        <div class="acm-body">
            <div class="acm-main-card">
                <div class="lbl">Scholarship Name</div>
                <h1>${escapeHtml(name)}</h1>
                <div class="acm-meta-row">
                    <div class="acm-meta-item">
                        <i class="fas fa-building acm-meta-icon"></i>
                        <div class="acm-meta-text"><span>Provider</span><strong>${escapeHtml(provider)}</strong></div>
                    </div>
                    <div class="acm-divider"></div>
                    <div class="acm-meta-item">
                        <i class="fas fa-gift acm-meta-icon"></i>
                        <div class="acm-meta-text"><span>Benefit</span><strong>${escapeHtml(amountBenefit)}</strong></div>
                    </div>
                    <div class="acm-divider"></div>
                    <div class="acm-meta-item">
                        <i class="fas fa-graduation-cap acm-meta-icon"></i>
                        <div class="acm-meta-text"><span>Education Levels</span><strong>${escapeHtml(eduLevels)}</strong></div>
                    </div>
                </div>
                <div class="acm-keywords">
                    <span class="lbl">Keywords</span>
                    <div class="acm-pills">${keywordsHtml}</div>
                </div>
            </div>

            <div class="acm-stats-strip">
                <div class="acm-stat">
                    <div class="acm-stat-icon blue"><i class="fas fa-hashtag"></i></div>
                    <div class="acm-stat-info"><span>Scholarship ID</span><strong>${escapeHtml(id)}</strong></div>
                </div>
                <div class="acm-stat">
                    <div class="acm-stat-icon green"><i class="fas fa-shield-check"></i></div>
                    <div class="acm-stat-info"><span>Approval Status</span><span class="acm-stat-badge" style="${status === 'approved' || status === 'active' ? '' : 'color:#d97706;background:#fffbeb;'}">${dispStatus}</span></div>
                </div>
                <div class="acm-stat">
                    <div class="acm-stat-icon purple"><i class="fas fa-user"></i></div>
                    <div class="acm-stat-info"><span>Created By</span><strong>${escapeHtml(createdBy)}</strong></div>
                </div>
            </div>

            <div class="acm-section">
                <div class="acm-section-header">
                    <div class="acm-section-icon blue"><i class="fas fa-info-circle"></i></div>
                    <h3>Information</h3>
                </div>
                <div class="acm-grid">
                    <div class="acm-field"><span>Deadline</span><strong>${escapeHtml(scholarship.deadline || 'N/A')}</strong></div>
                    <div class="acm-field"><span>Eligibility</span><strong>${escapeHtml(scholarship.eligibility || 'N/A')}</strong></div>
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

function openInstituteDetailModal(instituteId) {
    const institute = adminState.institutes[instituteId];
    if (!institute) return;
    let modal = document.getElementById('admin-course-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'admin-course-modal';
        modal.className = 'admin-course-modal-overlay';
        document.body.appendChild(modal);
    }

    const name = institute.name || institute.instituteName || 'Unknown Institute';
    const status = institute.approvalStatus || institute.status || 'pending';
    const district = institute.district || 'N/A';
    const type = institute.instituteType || institute.type || 'N/A';
    const dispStatus = status ? status.charAt(0).toUpperCase() + status.slice(1) : '';

    modal.innerHTML = `
    <div class="admin-course-modal-card">
        <div class="acm-header">
            <div class="icon-wrap"><i class="fas fa-building-columns"></i></div>
            <h2>Institute Details</h2>
            <span class="acm-badge ${status === 'approved' || status === 'active' ? 'approved' : status === 'rejected' ? 'rejected' : 'pending'}">
                ${dispStatus}
            </span>
            <button class="acm-close" id="acm-close-top"><i class="fas fa-times"></i></button>
        </div>
        
        <div class="acm-body">
            <div class="acm-main-card">
                <div class="lbl">Institute Name</div>
                <h1>${escapeHtml(name)}</h1>
                <div class="acm-meta-row">
                    <div class="acm-meta-item">
                        <i class="fas fa-map-marker-alt acm-meta-icon"></i>
                        <div class="acm-meta-text"><span>District</span><strong>${escapeHtml(district)}</strong></div>
                    </div>
                    <div class="acm-divider"></div>
                    <div class="acm-meta-item">
                        <i class="fas fa-building acm-meta-icon"></i>
                        <div class="acm-meta-text"><span>Type</span><strong>${escapeHtml(type)}</strong></div>
                    </div>
                </div>
            </div>

            <div class="acm-section">
                <div class="acm-section-header">
                    <div class="acm-section-icon blue"><i class="fas fa-info-circle"></i></div>
                    <h3>Contact & Info</h3>
                </div>
                <div class="acm-grid">
                    <div class="acm-field"><span>Address</span><strong>${escapeHtml(institute.address || 'N/A')}</strong></div>
                    <div class="acm-field"><span>Email</span><strong>${escapeHtml(institute.email || 'N/A')}</strong></div>
                    <div class="acm-field"><span>Phone</span><strong>${escapeHtml(institute.phone || 'N/A')}</strong></div>
                    <div class="acm-field"><span>Website</span><strong>${escapeHtml(institute.website || 'N/A')}</strong></div>
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
