// EduPath Lanka - Dashboard sidebar collapse, active state, and mobile overlay
import {
    isSidebarCollapsed,
    setSidebarCollapsed,
    refreshSidebarActiveState
} from "./shared-navigation.js";

const MOBILE_BP = 768;

export function applySidebarCollapsedEarly() {
    if (typeof window === "undefined") return;
    if (isSidebarCollapsed() && window.innerWidth > MOBILE_BP) {
        document.documentElement.classList.add("sidebar-collapsed");
    }
}

applySidebarCollapsedEarly();

function isMobile() {
    return window.innerWidth <= MOBILE_BP;
}

function setCollapsed(collapsed) {
    if (isMobile()) return;
    setSidebarCollapsed(collapsed);
}

function syncCollapsedFromStorage() {
    if (isMobile()) {
        document.documentElement.classList.remove("sidebar-collapsed");
        return;
    }
    setCollapsed(isSidebarCollapsed());
}

export function initDashboardSidebar() {
    const sidebar = document.getElementById("sidebar");
    const toggles = document.querySelectorAll("[data-sidebar-toggle], #sidebar-toggle");
    const closeBtn = document.getElementById("close-sidebar");
    const overlay = document.getElementById("sidebar-overlay");
    let tooltip = null;

    if (!sidebar) return;

    syncCollapsedFromStorage();
    refreshSidebarActiveState();

    const getTooltipText = (link) => {
        const label = link.querySelector(".sidebar-label")?.textContent?.trim();
        return link.getAttribute("title") || label || link.getAttribute("aria-label") || "";
    };

    const hideTooltip = () => {
        tooltip?.remove();
        tooltip = null;
    };

    const showTooltip = (link) => {
        if (!document.documentElement.classList.contains("sidebar-collapsed") || isMobile()) return;
        const text = getTooltipText(link);
        if (!text) return;
        hideTooltip();
        const rect = link.getBoundingClientRect();
        tooltip = document.createElement("div");
        tooltip.className = "sidebar-icon-tooltip";
        tooltip.textContent = text;
        tooltip.style.top = `${rect.top + rect.height / 2}px`;
        tooltip.style.left = `${rect.right + 12}px`;
        document.body.appendChild(tooltip);
    };

    const closeMobile = () => {
        sidebar.classList.remove("active");
        sidebar.classList.remove("mobile-open");
        document.body.classList.remove("sidebar-mobile-open");
        overlay?.classList.remove("show");
    };

    const openMobile = () => {
        sidebar.classList.add("active");
        sidebar.classList.add("mobile-open");
        document.body.classList.add("sidebar-mobile-open");
        overlay?.classList.add("show");
    };

    toggles.forEach((toggle) => {
        if (toggle.dataset.sidebarWired === "true") return;
        toggle.dataset.sidebarWired = "true";
        toggle.addEventListener("click", (e) => {
            e.stopPropagation();
            if (isMobile()) {
                if (sidebar.classList.contains("active") || sidebar.classList.contains("mobile-open")) closeMobile();
                else openMobile();
            } else {
                hideTooltip();
                setCollapsed(!document.documentElement.classList.contains("sidebar-collapsed"));
            }
        });
    });

    sidebar.querySelectorAll(".sidebar-links a").forEach((link) => {
        if (link.dataset.sidebarLinkWired === "true") return;
        link.dataset.sidebarLinkWired = "true";
        link.addEventListener("mouseenter", () => showTooltip(link));
        link.addEventListener("focus", () => showTooltip(link));
        link.addEventListener("mouseleave", hideTooltip);
        link.addEventListener("blur", hideTooltip);
        link.addEventListener("click", () => {
            if (isMobile()) closeMobile();
            setTimeout(refreshSidebarActiveState, 0);
        });
    });

    closeBtn?.addEventListener("click", closeMobile);
    overlay?.addEventListener("click", closeMobile);

    window.addEventListener("resize", () => {
        if (!isMobile()) {
            closeMobile();
            syncCollapsedFromStorage();
        } else {
            document.documentElement.classList.remove("sidebar-collapsed");
            hideTooltip();
        }
    });

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && sidebar.classList.contains("active")) closeMobile();
    });

    window.addEventListener("hashchange", refreshSidebarActiveState);
}

export function updateSidebarUser({ fullName = "User", role = "student", photoURL = "" } = {}) {
    const nameEl = document.getElementById("sidebar-user-name");
    const roleEl = document.getElementById("sidebar-user-role");
    const avatarEl = document.getElementById("sidebar-user-avatar");

    if (nameEl) nameEl.textContent = fullName;
    if (roleEl) {
        roleEl.textContent = role;
        roleEl.className = `sidebar-user-role role-${String(role).toLowerCase()}`;
    }
    if (avatarEl) {
        const initials = fullName.split(" ").map((n) => n[0]).join("").substring(0, 2).toUpperCase();
        if (photoURL) {
            const img = document.createElement("img");
            img.src = photoURL;
            img.alt = fullName;
            avatarEl.replaceChildren(img, onlineDot());
        } else {
            const span = document.createElement("span");
            span.className = "sidebar-initials";
            span.textContent = initials;
            avatarEl.replaceChildren(span, onlineDot());
        }
    }
}

function onlineDot() {
    const dot = document.createElement("span");
    dot.className = "online-dot";
    dot.setAttribute("aria-hidden", "true");
    return dot;
}
