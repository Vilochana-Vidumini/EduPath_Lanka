import re

with open("c:/dev/edupath_lanka/mentor-dashboard.js", "r", encoding="utf-8") as f:
    content = f.read()

old_accept = """    async function acceptMentorshipRequest(requestId) {
        const snap = await get(ref(database, `mentorshipRequests/${requestId}`));
        const request = snap.val();
        if (!request || request.targetMentorUid !== currentUid || normalizeMentorshipStatus(request.status) !== 'pending') return showToast('This learning request is no longer available.', 'error');
        const connectionRef = push(ref(database, 'mentorshipConnections'));
        const notificationRef = push(ref(database, `notifications/${request.requesterUid}`));
        const learningConversationId = `mentor_${currentUid}_${request.requesterUid}`;
        const connection = { connectionId: connectionRef.key, requestId, mentorUid: currentUid, mentorName: request.targetMentorName || currentMentorData.fullName || currentUserData.fullName || 'Mentor', mentorPhotoURL: request.targetMentorPhotoURL || currentMentorData.photoURL || currentUserData.photoURL || '', menteeUid: request.requesterUid, menteeName: request.requesterName || 'Mentor', menteePhotoURL: request.requesterPhotoURL || '', menteeAccountRole: request.requesterAccountRole || 'mentor', mentorRelationshipRole: 'mentor', menteeRelationshipRole: 'mentee', topic: request.topic || 'General Mentorship', category: request.category || 'General Guidance', goal: request.goal || '', status: 'active', conversationId: learningConversationId, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), endedAt: null };
        const updates = {};
        updates[`mentorshipConnections/${connectionRef.key}`] = connection;
        updates[`conversations/${learningConversationId}`] = { conversationId: learningConversationId, mentorUid: currentUid, menteeUid: request.requesterUid, participantIds: { [currentUid]: true, [request.requesterUid]: true }, topic: connection.topic, lastMessage: "", unreadByMentor: 0, unreadByMentee: 0, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
        updates[`mentorshipRequests/${requestId}/status`] = 'accepted'; updates[`mentorshipRequests/${requestId}/respondedAt`] = serverTimestamp(); updates[`mentorshipRequests/${requestId}/updatedAt`] = serverTimestamp();
        updates[`notifications/${request.requesterUid}/${notificationRef.key}`] = { notificationId: notificationRef.key, type: 'mentorship_request_accepted', title: 'Mentorship Request Accepted', message: `${connection.mentorName} accepted your learning request.`, targetUserUid: request.requesterUid, senderUid: currentUid, relatedEntityType: 'mentorship_connection', relatedEntityId: connectionRef.key, targetPage: 'mentor-learning.html', targetSection: 'connected-mentors', read: false, status: 'unread', createdAt: serverTimestamp() };
        await update(ref(database), updates); document.getElementById('learning-request-detail-modal')?.classList.add('hidden'); showToast('Mentorship request accepted.', 'success');
    }"""

new_accept = """    async function acceptLearningRequest(requestId) {
        const snap = await get(ref(database, `mentorshipRequests/${requestId}`));
        const request = snap.val();
        if (!request || request.targetMentorUid !== currentUid || normalizeMentorshipStatus(request.status) !== 'pending') return showToast('This learning request is no longer available.', 'error');
        const connectionRef = push(ref(database, 'mentorshipConnections'));
        const notificationRef = push(ref(database, `notifications/${request.requesterUid}`));
        const learningConversationId = `mentor_${currentUid}_${request.requesterUid}`;
        const connection = { 
            connectionId: connectionRef.key, 
            requestId, 
            mentorUid: currentUid, 
            mentorName: request.targetMentorName || currentMentorData.fullName || currentUserData.fullName || 'Mentor', 
            mentorPhotoURL: request.targetMentorPhotoURL || currentMentorData.photoURL || currentUserData.photoURL || '', 
            menteeUid: request.requesterUid, 
            menteeName: request.requesterName || 'Mentor', 
            menteePhotoURL: request.requesterPhotoURL || '', 
            menteeAccountRole: request.requesterAccountRole || 'mentor', 
            mentorRelationshipRole: 'mentor', 
            menteeRelationshipRole: 'mentee', 
            guidancePurpose: request.guidancePurpose || request.category || 'General Guidance',
            academicLevel: request.academicLevel || 'N/A',
            studyArea: request.studyArea || request.topic || 'General Mentorship',
            researchArea: request.researchArea || request.topic || 'General Mentorship',
            learningGoal: request.learningGoal || request.goal || '', 
            status: 'active', 
            conversationId: learningConversationId, 
            createdAt: serverTimestamp(), 
            updatedAt: serverTimestamp(), 
            endedAt: null 
        };
        const updates = {};
        updates[`mentorshipConnections/${connectionRef.key}`] = connection;
        updates[`conversations/${learningConversationId}`] = { conversationId: learningConversationId, mentorUid: currentUid, menteeUid: request.requesterUid, participantIds: { [currentUid]: true, [request.requesterUid]: true }, topic: connection.guidancePurpose, lastMessage: "", unreadByMentor: 0, unreadByMentee: 0, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
        updates[`mentorshipRequests/${requestId}/status`] = 'accepted'; updates[`mentorshipRequests/${requestId}/respondedAt`] = serverTimestamp(); updates[`mentorshipRequests/${requestId}/updatedAt`] = serverTimestamp();
        updates[`notifications/${request.requesterUid}/${notificationRef.key}`] = { notificationId: notificationRef.key, type: 'mentorship_request_accepted', title: 'Mentorship Request Accepted', message: `${connection.mentorName} accepted your learning request.`, targetUserUid: request.requesterUid, senderUid: currentUid, relatedEntityType: 'mentorship_connection', relatedEntityId: connectionRef.key, targetPage: 'mentor-learning.html', targetSection: 'connected-mentors', read: false, status: 'unread', createdAt: serverTimestamp() };
        await update(ref(database), updates); document.getElementById('learning-request-detail-modal')?.classList.add('hidden'); showToast('Mentorship request accepted.', 'success');
    }"""

old_reject = """    async function rejectMentorshipRequest(requestId, note = '') {"""
new_reject = """    async function rejectLearningRequest(requestId, note = '') {"""

if old_accept in content:
    content = content.replace(old_accept, new_accept)
else:
    print("WARNING: acceptMentorshipRequest old content not found exactly!")

content = content.replace(old_reject, new_reject)

with open("c:/dev/edupath_lanka/mentor-dashboard.js", "w", encoding="utf-8") as f:
    f.write(content)
print("Updated acceptLearningRequest and rejectLearningRequest successfully")
