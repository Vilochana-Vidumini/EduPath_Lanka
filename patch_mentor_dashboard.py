import re

with open("c:/dev/edupath_lanka/mentor-dashboard.js", "r", encoding="utf-8") as f:
    content = f.read()

# Update renderIncomingLearningRequests to render table rows
old_render = """    function renderIncomingLearningRequests() {
        const grid = document.getElementById('learning-requests-grid');
        if (!grid) return;
        const pending = Object.values(learningRequestDetails).filter(data => normalizeMentorshipStatus(data.request.status) === 'pending').sort((a, b) => b.request.createdAt - a.request.createdAt);
        setText('learning-req-count', pending.length);
        if (pending.length === 0) {
            grid.innerHTML = '<div class="text-muted p-4">No incoming learning requests right now.</div>';
            return;
        }
        grid.innerHTML = pending.map(data => {
            const req = data.request;
            const student = data.studentData || {};
            const photo = student.photoURL || req.requesterPhotoURL || 'images/avatar-placeholder.png';
            const name = escapeHtml(student.fullName || req.requesterName || 'Mentee');
            const date = new Date(req.createdAt).toLocaleDateString();
            return `
                <div class="user-card request-card p-3 border rounded mb-2">
                    <div class="d-flex align-items-center mb-2">
                        <img src="${escapeAttr(photo)}" alt="${escapeAttr(name)}" class="rounded-circle me-3" style="width: 48px; height: 48px; object-fit: cover;">
                        <div>
                            <h5 class="mb-0" style="font-size: 1.1rem; color: #0f1b3d; margin: 0;">${name}</h5>
                            <small class="text-muted" style="font-size: 0.85rem;">Mentor Account • Requested on ${date}</small>
                        </div>
                    </div>
                    <p style="font-size: 0.9rem; margin-bottom: 8px;"><strong>Topic:</strong> ${escapeHtml(req.topic || req.category || 'Mentorship Guidance')}</p>
                    <p class="text-truncate-2 text-muted" style="font-size: 0.85rem; margin-bottom: 12px;">${escapeHtml(req.message || '')}</p>
                    <div class="d-flex gap-2">
                        <button class="btn btn-sm btn-outline-primary flex-fill" data-view-learning-req="${escapeAttr(req.requestId)}">View Details</button>
                    </div>
                </div>
            `;
        }).join('');
        grid.querySelectorAll('[data-view-learning-req]').forEach(btn => btn.addEventListener('click', () => {
            const reqId = btn.getAttribute('data-view-learning-req');
            if (reqId && learningRequestDetails[reqId]) openLearningRequestModal(learningRequestDetails[reqId]);
        }));
    }"""

new_render = """    function renderIncomingLearningRequests() {
        const grid = document.getElementById('learning-requests-grid');
        if (!grid) return;
        const pending = Object.values(learningRequestDetails).filter(data => normalizeMentorshipStatus(data.request.status) === 'pending').sort((a, b) => b.request.createdAt - a.request.createdAt);
        setText('learning-req-count', pending.length);
        if (pending.length === 0) {
            grid.innerHTML = '<tr><td colspan="7" class="text-muted text-center p-4">No incoming learning requests right now.</td></tr>';
            return;
        }
        grid.innerHTML = pending.map(data => {
            const req = data.request;
            const student = data.studentData || {};
            const photo = student.photoURL || req.requesterPhotoURL || 'images/avatar-placeholder.png';
            const name = escapeHtml(student.fullName || req.requesterName || 'Mentor');
            const date = new Date(req.createdAt).toLocaleDateString();
            return `
                <tr>
                    <td>
                        <div class="d-flex align-items-center">
                            <img src="${escapeAttr(photo)}" alt="${escapeAttr(name)}" class="rounded-circle me-3" style="width: 40px; height: 40px; object-fit: cover;">
                            <div>
                                <h6 class="mb-0" style="color: #0f1b3d; margin:0;">${name}</h6>
                                <small class="text-muted" style="font-size: 0.8rem;">Mentor account · Seeking guidance</small>
                            </div>
                        </div>
                    </td>
                    <td class="text-muted" style="font-size:0.9rem;">${escapeHtml(req.guidancePurpose || req.category || 'Mentorship')}</td>
                    <td class="text-muted" style="font-size:0.9rem;">${escapeHtml(req.academicLevel || 'N/A')}</td>
                    <td class="text-muted" style="font-size:0.9rem;">${escapeHtml(req.studyArea || req.topic || 'N/A')}</td>
                    <td class="text-muted" style="font-size:0.9rem;">${date}</td>
                    <td><span class="badge badge-warning">Pending</span></td>
                    <td class="text-end">
                        <button class="btn btn-sm btn-outline-primary" data-view-learning-req="${escapeAttr(req.requestId)}">View Details</button>
                    </td>
                </tr>
            `;
        }).join('');
        grid.querySelectorAll('[data-view-learning-req]').forEach(btn => btn.addEventListener('click', () => {
            const reqId = btn.getAttribute('data-view-learning-req');
            if (reqId && learningRequestDetails[reqId]) openLearningRequestModal(learningRequestDetails[reqId]);
        }));
    }"""

if old_render in content:
    content = content.replace(old_render, new_render)
else:
    print("WARNING: renderIncomingLearningRequests old content not found exactly!")


# Add openLearningRequestModal
old_open_learning = """    function openLearningRequestModal(data) {
        const req = data.request;
        const student = data.studentData || {};
        setText('modal-request-title', 'Mentorship Request Details');
        setText('modal-status', 'Pending');
        setText('modal-student-name', escapeHtml(student.fullName || req.requesterName || 'Mentor Account'));
        setText('modal-message', escapeHtml(req.message || 'No message provided.'));
        setText('modal-requested-at', new Date(req.createdAt).toLocaleDateString());
        
        const modal = document.getElementById('learning-request-detail-modal') || document.querySelector('.request-modal-card').parentElement;
        if (modal) {
            modal.classList.remove('hidden');
            const acceptBtn = document.getElementById('modal-accept-btn') || modal.querySelector('.btn-primary');
            const rejectBtn = document.getElementById('modal-reject-btn') || modal.querySelector('.btn-outline');
            if (acceptBtn) {
                const newAccept = acceptBtn.cloneNode(true);
                acceptBtn.replaceWith(newAccept);
                newAccept.addEventListener('click', () => acceptLearningRequest(req.requestId));
            }
            if (rejectBtn) {
                const newReject = rejectBtn.cloneNode(true);
                rejectBtn.replaceWith(newReject);
                newReject.addEventListener('click', () => {
                    const note = prompt('Rejection reason (optional):');
                    if (note !== null) rejectLearningRequest(req.requestId, note);
                });
            }
        }
    }"""

new_open_learning = """    function openLearningRequestModal(data) {
        const req = data.request;
        const student = data.studentData || {};
        
        setText('lr-modal-name', escapeHtml(student.fullName || req.requesterName || 'Mentor Account'));
        setText('lr-modal-status', 'Pending');
        setText('lr-modal-purpose', escapeHtml(req.guidancePurpose || req.category || 'N/A'));
        setText('lr-modal-level', escapeHtml(req.academicLevel || 'N/A'));
        setText('lr-modal-area', escapeHtml(req.studyArea || req.topic || 'N/A'));
        setText('lr-modal-challenge', escapeHtml(req.currentChallenge || 'N/A'));
        setText('lr-modal-goal', escapeHtml(req.learningGoal || req.goal || 'N/A'));
        setText('lr-modal-message', escapeHtml(req.message || 'No message provided.'));
        setText('lr-modal-mode', escapeHtml(req.preferredMode || 'N/A'));
        setText('lr-modal-session', escapeHtml(req.preferredSessionType || 'N/A'));
        setText('lr-modal-days', escapeHtml(req.preferredDays || 'N/A'));
        setText('lr-modal-duration', req.preferredSessionDuration ? `${req.preferredSessionDuration} mins` : 'N/A');
        setText('lr-modal-date', new Date(req.createdAt).toLocaleDateString());
        
        const modal = document.getElementById('learning-request-detail-modal');
        if (modal) {
            modal.classList.remove('hidden');
            const acceptBtn = document.getElementById('lr-modal-accept-btn');
            const rejectBtn = document.getElementById('lr-modal-reject-btn');
            
            const closeBtn = document.getElementById('lr-modal-close-btn');
            if(closeBtn) closeBtn.onclick = () => modal.classList.add('hidden');

            if (acceptBtn) {
                const newAccept = acceptBtn.cloneNode(true);
                acceptBtn.replaceWith(newAccept);
                newAccept.addEventListener('click', () => acceptLearningRequest(req.requestId));
            }
            if (rejectBtn) {
                const newReject = rejectBtn.cloneNode(true);
                rejectBtn.replaceWith(newReject);
                newReject.addEventListener('click', () => {
                    const note = prompt('Rejection reason (optional):');
                    if (note !== null) rejectLearningRequest(req.requestId, note);
                });
            }
        }
    }"""

if old_open_learning in content:
    content = content.replace(old_open_learning, new_open_learning)
else:
    print("WARNING: openLearningRequestModal old content not found exactly!")

# Let's fix the acceptLearningRequest and rejectLearningRequest if they use modal ID
content = content.replace("document.getElementById('learning-request-detail-modal')?.classList.add('hidden');", "document.getElementById('learning-request-detail-modal')?.classList.add('hidden');")

with open("c:/dev/edupath_lanka/mentor-dashboard.js", "w", encoding="utf-8") as f:
    f.write(content)
print("Updated mentor-dashboard.js successfully")
