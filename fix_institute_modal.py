import re
import sys

with open("c:/dev/edupath_lanka/admin-dashboard.js", "r", encoding="utf-8") as f:
    content = f.read()

# Find the start of the function
start_match = re.search(r"function openInstituteDetailModal\(instituteId\) \{", content)
if not start_match:
    print("Function start not found!")
    sys.exit(1)

start_idx = start_match.start()

# Find the start of the next function
end_match = re.search(r"function openStudentDetailModal\(uid\) \{", content[start_idx:])
if not end_match:
    print("Next function not found!")
    sys.exit(1)

end_idx = start_idx + end_match.start()

new_function = """function openInstituteDetailModal(instituteId) {
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
                    <div class="acm-field"><span>Address</span><strong>${escapeHtml(institute.address || institute.streetAddress || 'N/A')}</strong></div>
                    <div class="acm-field"><span>Email</span><strong>${escapeHtml(institute.email || institute.officialEmail || 'N/A')}</strong></div>
                    <div class="acm-field"><span>Phone</span><strong>${escapeHtml(institute.phone || 'N/A')}</strong></div>
                    <div class="acm-field"><span>Website</span><strong>${escapeHtml(institute.website || 'N/A')}</strong></div>
                </div>
            </div>

            <div class="acm-section">
                <div class="acm-section-header">
                    <div class="acm-section-icon green"><i class="fas fa-building"></i></div>
                    <h3>Institute Details</h3>
                </div>
                <div class="acm-grid">
                    <div class="acm-field" style="grid-column: span 2;"><span>Description</span><strong>${escapeHtml(institute.description || institute.instituteDescription || 'N/A')}</strong></div>
                    <div class="acm-field"><span>Established Year</span><strong>${escapeHtml(institute.establishedYear || 'N/A')}</strong></div>
                    <div class="acm-field"><span>Reg No.</span><strong>${escapeHtml(institute.governmentRegistrationNumber || 'N/A')}</strong></div>
                    <div class="acm-field"><span>Accreditation</span><strong>${escapeHtml(institute.accreditationDetails || 'N/A')}</strong></div>
                    <div class="acm-field" style="grid-column: span 2;"><span>Facilities</span><strong>${escapeHtml(Array.isArray(institute.facilities || institute.facilitiesAvailable) ? (institute.facilities || institute.facilitiesAvailable).join(', ') : (institute.facilities || institute.facilitiesAvailable || 'N/A'))}</strong></div>
                </div>
            </div>

            <div class="acm-section">
                <div class="acm-section-header">
                    <div class="acm-section-icon purple"><i class="fas fa-user-tie"></i></div>
                    <h3>Representative</h3>
                </div>
                <div class="acm-grid">
                    <div class="acm-field"><span>Name</span><strong>${escapeHtml(institute.representativeName || 'N/A')}</strong></div>
                    <div class="acm-field"><span>Designation</span><strong>${escapeHtml(institute.representativeDesignation || 'N/A')}</strong></div>
                    <div class="acm-field"><span>Email</span><strong>${escapeHtml(institute.representativeEmail || 'N/A')}</strong></div>
                    <div class="acm-field"><span>Phone</span><strong>${escapeHtml(institute.representativePhone || 'N/A')}</strong></div>
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
"""

new_content = content[:start_idx] + new_function + content[end_idx:]

with open("c:/dev/edupath_lanka/admin-dashboard.js", "w", encoding="utf-8") as f:
    f.write(new_content)

print("Successfully replaced openInstituteDetailModal!")
