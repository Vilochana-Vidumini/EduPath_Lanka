// EduPath Lanka - shared mentorship role and relationship helpers

export const ACTIVE_REQUEST_STATUSES = ["pending", "accepted", "connected"];

export function normalizeRole(value = "") {
    return String(value || "").trim().toLowerCase().replace(/\s+/g, "_");
}

export function normalizeRelationshipRole(value = "") {
    const role = normalizeRole(value);
    return role === "mentor" ? "mentor" : "mentee";
}

export function normalizeStatus(value = "") {
    return String(value || "").trim().toLowerCase().replace(/\s+/g, "_").replace(/-/g, "_");
}

export function normalizeList(value) {
    if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
    if (value && typeof value === "object") {
        return Object.entries(value)
            .filter(([, enabled]) => enabled === true || enabled === "true" || enabled === 1)
            .map(([key]) => String(key || "").trim())
            .filter(Boolean);
    }
    return String(value || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
}

export function normalizeUserRoles(userData = {}) {
    const primaryRole = normalizeRole(userData.primaryRole || userData.role || userData.userType || userData.accountType || "");
    const roles = {
        student: userData.roles?.student === true || primaryRole === "student",
        mentor: userData.roles?.mentor === true || primaryRole === "mentor",
        mentee: userData.roles?.mentee !== false,
        admin: userData.roles?.admin === true || primaryRole === "admin"
    };
    return { primaryRole, roles };
}

export function accountRole(userData = {}) {
    return normalizeUserRoles(userData).primaryRole || "user";
}

export function isAccountActive(userData = {}) {
    return !["suspended", "disabled", "rejected", "inactive"].includes(normalizeStatus(userData.accountStatus || "active"));
}

export function isApprovedMentorProfile(mentor = {}, user = {}) {
    const status = normalizeStatus(mentor.approvalStatus || mentor.applicationStatus || mentor.status);
    return status === "approved" &&
        mentor.publicVisibility === true &&
        mentor.mentoringEnabled === true &&
        isAccountActive({ accountStatus: user.accountStatus || mentor.accountStatus || "active" });
}

export function normalizeMentorshipRequest(request = {}) {
    const requesterUid = request.requesterUid || request.studentUid || request.menteeUid || "";
    const targetMentorUid = request.targetMentorUid || request.mentorUid || "";
    const requesterName = request.requesterName || request.studentName || request.menteeName || "Mentee";
    const targetMentorName = request.targetMentorName || request.mentorName || "Mentor";
    return {
        ...request,
        requesterUid,
        requesterName,
        requesterPhotoURL: request.requesterPhotoURL || request.studentPhotoURL || request.menteePhotoURL || "",
        requesterAccountRole: request.requesterAccountRole || "student",
        requesterRelationshipRole: "mentee",
        targetMentorUid,
        targetMentorName,
        targetMentorPhotoURL: request.targetMentorPhotoURL || request.mentorPhotoURL || "",
        topic: request.topic || request.guidanceArea || request.mentorField || request.category || "General Mentorship",
        category: request.category || request.guidanceArea || request.mentorField || "General Guidance",
        goal: request.goal || request.futureGoal || request.coreGoal || "",
        preferredMode: request.preferredMode || request.mode || request.learningMode || "",
        status: normalizeStatus(request.status || "pending")
    };
}

export function normalizeConnection(connection = {}) {
    const mentorUid = connection.mentorUid || connection.targetMentorUid || "";
    const menteeUid = connection.menteeUid || connection.requesterUid || connection.studentUid || "";
    return {
        ...connection,
        mentorUid,
        menteeUid,
        menteeName: connection.menteeName || connection.requesterName || connection.studentName || "Mentee",
        mentorRelationshipRole: "mentor",
        menteeRelationshipRole: "mentee",
        status: normalizeStatus(connection.status || "active")
    };
}

export function normalizeAppointment(appointment = {}) {
    return {
        ...appointment,
        menteeUid: appointment.menteeUid || appointment.studentUid || "",
        menteeName: appointment.menteeName || appointment.studentName || "Mentee",
        menteeRelationshipRole: "mentee",
        mentorRelationshipRole: "mentor",
        status: normalizeStatus(appointment.status || "pending")
    };
}

export function normalizeRating(rating = {}) {
    return {
        ...rating,
        reviewerUid: rating.reviewerUid || rating.studentUid || rating.menteeUid || "",
        reviewerRelationshipRole: normalizeRelationshipRole(rating.reviewerRelationshipRole || "mentee")
    };
}

export function activeRequestFor(requests = {}, requesterUid = "", targetMentorUid = "", topic = "") {
    const normalizedTopic = normalizeStatus(topic);
    return Object.values(requests || {}).map(normalizeMentorshipRequest).find((request) => {
        const sameUsers = request.requesterUid === requesterUid && request.targetMentorUid === targetMentorUid;
        const active = ACTIVE_REQUEST_STATUSES.includes(normalizeStatus(request.status));
        const sameTopic = !normalizedTopic || normalizeStatus(request.topic || request.category) === normalizedTopic;
        return sameUsers && active && sameTopic;
    });
}

export function requestSourceFor(accountRoleValue = "") {
    const role = normalizeRole(accountRoleValue);
    if (role === "student") return "student_to_mentor";
    if (role === "mentor") return "mentor_to_mentor";
    return "general_user_to_mentor";
}

export function buildMentorshipRequestPayload({
    requestId,
    requesterUid,
    requester = {},
    requesterProfile = {},
    targetMentorUid,
    targetMentor = {},
    topic = "General Mentorship",
    category = "General Guidance",
    goal = "",
    message = "",
    preferredMode = "",
    preferredSessionDuration = 60,
    pathwayResultId = "",
    pathwaySnapshot = null
} = {}) {
    const role = accountRole(requester);
    const requesterName = requesterProfile.fullName || requester.fullName || requester.displayName || "Mentee";
    const mentorName = targetMentor.fullName || targetMentor.name || "Mentor";
    return {
        requestId,
        requesterUid,
        requesterName,
        requesterPhotoURL: requester.photoURL || requesterProfile.photoURL || "",
        requesterAccountRole: role,
        requesterRelationshipRole: "mentee",
        targetMentorUid,
        targetMentorName: mentorName,
        targetMentorPhotoURL: targetMentor.photoURL || "",
        topic,
        category,
        goal,
        message,
        preferredMode,
        preferredSessionDuration,
        requestSource: requestSourceFor(role),
        status: "pending",
        createdAt: null,
        updatedAt: null,
        respondedAt: null,

        // Legacy compatibility fields. New readers should use requester/target fields.
        studentUid: requesterUid,
        studentName: requesterName,
        studentEmail: requester.email || requesterProfile.email || "",
        studentPhone: requester.phone || requesterProfile.phone || "",
        mentorUid: targetMentorUid,
        mentorName,
        mentorPhotoURL: targetMentor.photoURL || "",
        mentorEmail: targetMentor.email || "",
        mentorField: targetMentor.field || targetMentor.mentoringField || category || topic,
        mentorOrganization: targetMentor.universityOrCompany || targetMentor.organization || targetMentor.currentOrganization || "",
        guidanceArea: category,
        futureGoal: goal,
        pathwayResultId,
        pathwaySnapshot,
        acceptedAt: null,
        rejectedAt: null,
        rejectionReason: ""
    };
}
