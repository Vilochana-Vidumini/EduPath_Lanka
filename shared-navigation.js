// EduPath Lanka - shared role-aware navigation helpers

export const SIDEBAR_STORAGE_KEY = "edupathSidebarCollapsed";
export const LEGACY_SIDEBAR_KEYS = ["sidebarCollapsed", "mentorSidebarCollapsed", "adminSidebarState"];

export function normalizeRole(value) {
    const role = String(value || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_");

    const aliases = {
        admin: "admin",
        administrator: "admin",
        student: "student",
        mentor: "mentor",
        institute: "institute"
    };

    return aliases[role] || "";
}

export function getDashboardDestination(role) {
    const destinations = {
        student: "student-dashboard.html#overview-section",
        mentor: "mentor-dashboard.html#dashboard-overview",
        admin: "admin-dashboard.html#overview",
        institute: "institute-dashboard.html"
    };

    return destinations[normalizeRole(role)] || "index.html";
}

export function getProfileDestination(role) {
    const destinations = {
        student: "profile.html",
        mentor: "mentor-dashboard.html#my-profile",
        admin: "profile.html",
        institute: "institute-dashboard.html#profile"
    };

    return destinations[normalizeRole(role)] || "profile.html";
}

export function getPublicHomeDestination() {
    return "index.html";
}

export function getCurrentRoute() {
    return {
        page: window.location.pathname.split("/").pop() || "index.html",
        section: window.location.hash.replace("#", "")
    };
}

export function migrateSidebarState() {
    if (localStorage.getItem(SIDEBAR_STORAGE_KEY) !== null) return;
    for (const key of LEGACY_SIDEBAR_KEYS) {
        const value = localStorage.getItem(key);
        if (value !== null) {
            localStorage.setItem(SIDEBAR_STORAGE_KEY, String(value === "true"));
            return;
        }
    }
}

export function isSidebarCollapsed() {
    migrateSidebarState();
    return localStorage.getItem(SIDEBAR_STORAGE_KEY) === "true";
}

export function setSidebarCollapsed(collapsed) {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, String(Boolean(collapsed)));
    document.documentElement.classList.toggle("sidebar-collapsed", Boolean(collapsed));
}

export function buildUrl(page, section = "", query = {}) {
    const params = new URLSearchParams();
    Object.entries(query || {}).forEach(([key, value]) => {
        if (value !== undefined && value !== null && String(value) !== "") {
            params.set(key, String(value));
        }
    });

    const queryString = params.toString();
    return `${page || "index.html"}${queryString ? `?${queryString}` : ""}${section ? `#${section}` : ""}`;
}

export function refreshSidebarActiveState() {
    const { page, section } = getCurrentRoute();
    const links = document.querySelectorAll(".sidebar-links a[data-section], .sidebar-links a[href]");
    links.forEach((link) => {
        const href = link.getAttribute("href") || "";
        const targetSection = link.dataset.section || (href.startsWith("#") ? href.slice(1) : "");
        const targetPage = href.split(/[?#]/)[0];
        const isSectionMatch = targetSection && section && targetSection === section;
        const isPageMatch = targetPage && !href.startsWith("#") && targetPage === page && !section;
        const active = Boolean(isSectionMatch || isPageMatch);
        link.classList.toggle("active", active);
        if (active) link.setAttribute("aria-current", "page");
        else link.removeAttribute("aria-current");
    });
}

export function initSharedNavigation({ pageType = "public", activeSection = "", userRole = "" } = {}) {
    migrateSidebarState();
    if (pageType === "dashboard") {
        refreshSidebarActiveState();
        window.addEventListener("hashchange", refreshSidebarActiveState);
    }
    return {
        pageType,
        activeSection,
        userRole: normalizeRole(userRole),
        profileDestination: getProfileDestination(userRole),
        dashboardDestination: getDashboardDestination(userRole)
    };
}
