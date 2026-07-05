// EduPath Lanka - shared notification routing and read-state helpers
import { database } from "./firebase-config.js";
import { ref, update, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
import { buildUrl, normalizeRole } from "./shared-navigation.js";

const ROLE_DEFAULT_PAGES = {
    student: "student-dashboard.html",
    mentor: "mentor-dashboard.html",
    admin: "admin-dashboard.html",
    institute: "institute-dashboard.html"
};

const TYPE_ROUTES = {
    mentor_application_submitted: { page: "admin-dashboard.html", section: "mentor-approvals", queryKey: "mentorUid" },
    mentor_application_approved: { page: "mentor-dashboard.html", section: "dashboard-overview" },
    mentor_changes_requested: { page: "mentor-dashboard.html", section: "complete-profile" },
    mentor_application_rejected: { page: "mentor-dashboard.html", section: "complete-profile" },
    approved_mentor_profile_updated: { page: "admin-dashboard.html", section: "mentor-profile-updates", queryKey: "changeId" },
    mentorship_request_received: { page: "mentor-dashboard.html", section: "requests", queryKey: "requestId" },
    mentorship_request_accepted: { page: "student-dashboard.html", section: "mentor-requests-section", queryKey: "requestId" },
    mentorship_request_rejected: { page: "student-dashboard.html", section: "mentor-requests-section", queryKey: "requestId" },
    mentor_request: { page: "mentor-dashboard.html", section: "requests", queryKey: "requestId" },
    mentor_request_received: { page: "mentor-dashboard.html", section: "requests", queryKey: "requestId" },
    mentor_request_accepted: { page: "student-dashboard.html", section: "mentor-requests-section", queryKey: "requestId" },
    mentor_request_rejected: { page: "student-dashboard.html", section: "mentor-requests-section", queryKey: "requestId" },
    appointment_created: { page: null, section: "appointments", queryKey: "appointmentId" },
    appointment_updated: { page: null, section: "appointments", queryKey: "appointmentId" },
    appointment_cancelled: { page: null, section: "appointments", queryKey: "appointmentId" },
    appointment_request: { page: "mentor-dashboard.html", section: "appointments", queryKey: "appointmentId" },
    appointment_accepted: { page: "student-dashboard.html", section: "mentor-sessions-section", queryKey: "appointmentId" },
    appointment_rejected: { page: "student-dashboard.html", section: "mentor-sessions-section", queryKey: "appointmentId" },
    appointment_completed: { page: "student-dashboard.html", section: "mentor-sessions-section", queryKey: "appointmentId" },
    new_message: { page: null, section: "messages", queryKey: "conversationId" },
    mentor_message: { page: "student-dashboard.html", section: "mentor-messages-section", queryKey: "conversationId" },
    admin_support_reply: { page: null, section: "support", queryKey: "conversationId" },
    mentor_rating_required: { page: "student-dashboard.html", section: "mentor-sessions-section", queryKey: "appointmentId" },
    mentor_rating_received: { page: "mentor-dashboard.html", section: "ratings", queryKey: "appointmentId" },
    ASK_EDUPATH_MESSAGE: { page: "admin-dashboard.html", section: "support-inbox", queryKey: "messageId" }
};

const ROLE_SECTION_ALIASES = {
    student: {
        appointments: "mentor-sessions-section",
        messages: "mentor-messages-section",
        support: "support-section",
        dashboard: "overview-section",
        "completed-sessions": "mentor-sessions-section"
    },
    mentor: {
        appointments: "appointments",
        messages: "messages",
        support: "support",
        dashboard: "dashboard-overview",
        ratings: "ratings"
    },
    admin: {
        messages: "admin-messages",
        support: "support-inbox",
        dashboard: "overview",
        notifications: "admin-notifications",
        "mentor-profile-updates": "mentor-profile-updates"
    }
};

export function isUnreadNotification(notification = {}, uid = "") {
    if (notification.source === "admin" && uid) {
        return notification.readBy?.[uid] !== true;
    }
    return notification.isRead === false ||
        notification.read === false ||
        notification.status === "unread" ||
        (notification.isRead === undefined && notification.read === undefined && notification.status === undefined);
}

export async function markNotificationAsRead(notification = {}, uid = "") {
    const path = notification.path ||
        (notification.targetUserUid && notification.id ? `notifications/${notification.targetUserUid}/${notification.id}` : "") ||
        (uid && notification.id ? `notifications/${uid}/${notification.id}` : "");

    if (!path) return;

    const updates = notification.source === "admin" && uid
        ? {
            [`${path}/readBy/${uid}`]: true,
            [`${path}/readAtBy/${uid}`]: serverTimestamp()
        }
        : {
            [`${path}/isRead`]: true,
            [`${path}/read`]: true,
            [`${path}/status`]: "read",
            [`${path}/readAt`]: serverTimestamp()
        };

    await update(ref(database), updates);
}

export function resolveNotificationDestination(notification = {}, currentRole = "") {
    const targetRole = normalizeRole(notification.targetRole || currentRole);
    const explicitPage = notification.targetPage || notification.page;
    const explicitSection = notification.targetSection || notification.section;
    const type = notification.type || notification.category || "";
    const fallback = TYPE_ROUTES[type] || {};
    const page = explicitPage || fallback.page || ROLE_DEFAULT_PAGES[targetRole] || "index.html";
    const rawSection = explicitSection || fallback.section || "";
    const section = ROLE_SECTION_ALIASES[targetRole]?.[rawSection] || rawSection;
    const relatedId = notification.relatedEntityId ||
        notification.relatedId ||
        notification.relatedRequestId ||
        notification.relatedAppointmentId ||
        notification.relatedConversationId ||
        notification.requestId ||
        notification.appointmentId ||
        notification.conversationId ||
        notification.mentorUid ||
        notification.courseId ||
        notification.scholarshipId ||
        "";
    const queryKey = notification.targetQueryKey || fallback.queryKey || queryKeyFromNotification(notification);
    const query = { ...(notification.targetQuery || {}) };
    if (queryKey && relatedId) query[queryKey] = relatedId;

    return buildUrl(page, section, query);
}

export async function handleNotificationClick(notification = {}, options = {}) {
    const { uid = "", role = "", showToast = null } = options;
    try {
        await markNotificationAsRead(notification, uid);
    } catch (error) {
        console.error("Notification read update failed:", error);
    }

    const destination = resolveNotificationDestination(notification, role);
    if (!destination) {
        showToast?.("The related update is no longer available.", "warning");
        return;
    }
    window.location.href = destination;
}

export function parseDeepLink() {
    const params = new URLSearchParams(window.location.search);
    return {
        requestId: params.get("requestId") || "",
        appointmentId: params.get("appointmentId") || "",
        conversationId: params.get("conversationId") || "",
        mentorUid: params.get("mentorUid") || "",
        courseId: params.get("courseId") || "",
        scholarshipId: params.get("scholarshipId") || "",
        messageId: params.get("messageId") || ""
    };
}

function queryKeyFromNotification(notification = {}) {
    const type = String(notification.relatedEntityType || "").toLowerCase();
    if (type.includes("request")) return "requestId";
    if (type.includes("appointment")) return "appointmentId";
    if (type.includes("conversation") || type.includes("message")) return "conversationId";
    if (type.includes("mentor")) return "mentorUid";
    if (type.includes("course")) return "courseId";
    if (type.includes("scholarship")) return "scholarshipId";
    return "";
}
