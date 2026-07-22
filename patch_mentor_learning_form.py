import re

with open("c:/dev/edupath_lanka/mentor-learning.js", "r", encoding="utf-8") as f:
    content = f.read()

# Replace submitMentorshipRequest
old_submit = """async function submitMentorshipRequest(event) {
    event.preventDefault();
    const mentorUid = value("request-target-mentor-uid");
    const mentor = state.mentors[mentorUid] || {};
    const mentorUser = state.mentorUsers[mentorUid] || {};
    const topic = value("request-topic");
    const category = value("request-category");
    const goal = value("request-goal");
    const message = value("request-message");
    const preferredMode = value("request-mode");
    const duration = Number(value("request-duration") || 0);
    clearRequestErrors();
    const errors = {
        "request-topic": topic.length < 3 || topic.length > 150 ? "Topic must be 3 to 150 characters." : "",
        "request-category": !category ? "Choose a guidance category." : "",
        "request-goal": goal.length < 20 || goal.length > 1000 ? "Learning goal must be 20 to 1000 characters." : "",
        "request-message": message.length < 20 || message.length > 1500 ? "Message must be 20 to 1500 characters." : "",
        "request-mode": !preferredMode ? "Choose a preferred mode." : "",
        "request-duration": duration < 15 || duration > 240 ? "Duration must be 15 to 240 minutes." : ""
    };
    Object.entries(errors).forEach(([id, error]) => setText(`${id}-error`, error));
    if (Object.values(errors).some(Boolean)) return showToast("Please fix the highlighted request fields.", "warning");
    if (mentorUid === state.uid) return showToast("You cannot request mentorship from yourself.", "error");
    if (!isAccountActive(state.user) || !isAvailablePublicMentor({ ...mentorUser, ...mentor, uid: mentorUid }, state.uid)) return showToast("This mentor is not currently available.", "error");
    const existingSnap = await get(query(ref(database, "mentorshipRequests"), orderByChild("requesterUid"), equalTo(state.uid))).catch(() => null);
    const existingRequest = Object.values(existingSnap?.val?.() || {}).map(normalizeMentorshipRequest).find((request) => request.requesterUid === state.uid && request.targetMentorUid === mentorUid && normalizeStatus(request.status) === "pending");
    if (existingRequest) return showToast("You already have a pending request with this mentor.", "warning");
    const connectionSnap = await get(query(ref(database, "mentorshipConnections"), orderByChild("menteeUid"), equalTo(state.uid))).catch(() => null);
    const activeConnection = Object.values(connectionSnap?.val?.() || {}).map(normalizeConnection).find((connection) => connection.menteeUid === state.uid && connection.mentorUid === mentorUid && normalizeStatus(connection.status) === "active");
    if (activeConnection) return showToast("You are already connected with this mentor.", "warning");

    const requestRef = push(ref(database, "mentorshipRequests"));
    const notificationRef = push(ref(database, `notifications/${mentorUid}`));
    const requesterName = state.user.fullName || state.mentorProfile.fullName || "Mentor";
    const mentorName = mentor.fullName || mentorUser.fullName || "Mentor";
    const requestRecord = {
        requestId: requestRef.key,
        requesterUid: state.uid,
        requesterName,
        requesterPhotoURL: state.user.photoURL || state.mentorProfile.photoURL || "",
        requesterAccountRole: accountRole(state.user) || "mentor",
        requesterRelationshipRole: "mentee",
        targetRelationshipRole: "mentor",
        targetMentorUid: mentorUid,
        targetMentorName: mentorName,
        targetMentorPhotoURL: mentor.photoURL || mentorUser.photoURL || "",
        topic,
        category,
        goal,
        message,
        preferredMode,
        preferredSessionDuration: duration,
        preferredDays: value("request-days"),
        urgency: value("request-urgency") || "normal",
        requestSource: "mentor_to_mentor",
        status: "pending",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        respondedAt: null
    };
    const updates = {};
    updates[`mentorshipRequests/${requestRef.key}`] = requestRecord;
    updates[`notifications/${mentorUid}/${notificationRef.key}`] = { notificationId: notificationRef.key, type: "mentorship_request_received", title: "New Mentorship Request", message: `${requesterName} requested mentorship in ${topic}.`, targetUserUid: mentorUid, senderUid: state.uid, senderRole: "mentor", relatedEntityType: "mentorship_request", relatedEntityId: requestRef.key, requestId: requestRef.key, targetPage: "mentor-dashboard.html", targetSection: "requests", read: false, status: "unread", createdAt: serverTimestamp() };
    await update(ref(database), updates);
    closeRequestModal();
    showToast("Mentorship request sent.", "success");
}"""

new_submit = """async function submitMentorshipRequest(event) {
    event.preventDefault();
    const mentorUid = value("request-target-mentor-uid");
    const mentor = state.mentors[mentorUid] || {};
    const mentorUser = state.mentorUsers[mentorUid] || {};
    
    const guidancePurpose = value("request-purpose");
    const academicLevel = value("request-level");
    const studyArea = value("request-study-area");
    const currentChallenge = value("request-challenge");
    const goal = value("request-goal");
    const message = value("request-message");
    const preferredMode = value("request-mode");
    const preferredSessionType = value("request-session-type");
    const duration = Number(value("request-duration") || 0);
    const preferredDays = value("request-days");

    clearRequestErrors();
    const errors = {
        "request-purpose": !guidancePurpose ? "Choose a guidance purpose." : "",
        "request-study-area": studyArea.length < 3 || studyArea.length > 150 ? "Study area must be 3 to 150 characters." : "",
        "request-goal": goal.length < 20 || goal.length > 1000 ? "Learning goal must be 20 to 1000 characters." : "",
        "request-message": message.length < 20 || message.length > 1500 ? "Message must be 20 to 1500 characters." : "",
        "request-mode": !preferredMode ? "Choose a preferred mode." : "",
        "request-session-type": !preferredSessionType ? "Choose a preferred session type." : "",
        "request-duration": duration < 15 || duration > 240 ? "Duration must be 15 to 240 minutes." : ""
    };
    Object.entries(errors).forEach(([id, error]) => setText(`${id}-error`, error));
    if (Object.values(errors).some(Boolean)) return showToast("Please fix the highlighted request fields.", "warning");
    if (mentorUid === state.uid) return showToast("You cannot request mentorship from yourself.", "error");
    if (!isAccountActive(state.user) || !isAvailablePublicMentor({ ...mentorUser, ...mentor, uid: mentorUid }, state.uid)) return showToast("This mentor is not currently available.", "error");
    const existingSnap = await get(query(ref(database, "mentorshipRequests"), orderByChild("requesterUid"), equalTo(state.uid))).catch(() => null);
    const existingRequest = Object.values(existingSnap?.val?.() || {}).map(normalizeMentorshipRequest).find((request) => request.requesterUid === state.uid && request.targetMentorUid === mentorUid && normalizeStatus(request.status) === "pending");
    if (existingRequest) return showToast("You already have a pending request with this mentor.", "warning");
    const connectionSnap = await get(query(ref(database, "mentorshipConnections"), orderByChild("menteeUid"), equalTo(state.uid))).catch(() => null);
    const activeConnection = Object.values(connectionSnap?.val?.() || {}).map(normalizeConnection).find((connection) => connection.menteeUid === state.uid && connection.mentorUid === mentorUid && normalizeStatus(connection.status) === "active");
    if (activeConnection) return showToast("You are already connected with this mentor.", "warning");

    const requestRef = push(ref(database, "mentorshipRequests"));
    const notificationRef = push(ref(database, `notifications/${mentorUid}`));
    const requesterName = state.user.fullName || state.mentorProfile.fullName || "Mentor";
    const mentorName = mentor.fullName || mentorUser.fullName || "Mentor";
    const requestRecord = {
        requestId: requestRef.key,
        requesterUid: state.uid,
        requesterName,
        requesterPhotoURL: state.user.photoURL || state.mentorProfile.photoURL || "",
        requesterAccountRole: accountRole(state.user) || "mentor",
        requesterRelationshipRole: "mentee",
        targetRelationshipRole: "mentor",
        targetMentorUid: mentorUid,
        targetMentorName: mentorName,
        targetMentorPhotoURL: mentor.photoURL || mentorUser.photoURL || "",
        
        guidancePurpose,
        academicLevel,
        studyArea,
        researchArea: studyArea,
        currentChallenge,
        learningGoal: goal,
        message,
        preferredMode,
        preferredSessionType,
        preferredSessionDuration: duration,
        preferredDays,
        
        requestSource: "mentor_to_mentor",
        status: "pending",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        respondedAt: null
    };
    const updates = {};
    updates[`mentorshipRequests/${requestRef.key}`] = requestRecord;
    updates[`notifications/${mentorUid}/${notificationRef.key}`] = { notificationId: notificationRef.key, type: "mentorship_request_received", title: "New Mentorship Request", message: `${requesterName} sent you a request for ${guidancePurpose}.`, targetUserUid: mentorUid, senderUid: state.uid, senderRole: "mentor", relatedEntityType: "mentorship_request", relatedEntityId: requestRef.key, requestId: requestRef.key, targetPage: "mentor-dashboard.html", targetSection: "requests", read: false, status: "unread", createdAt: serverTimestamp() };
    await update(ref(database), updates);
    closeRequestModal();
    showToast("Mentorship request sent.", "success");
}"""

content = content.replace(old_submit, new_submit)

with open("c:/dev/edupath_lanka/mentor-learning.js", "w", encoding="utf-8") as f:
    f.write(content)
print("Updated submitMentorshipRequest successfully")
