import { auth, database } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { ref, get } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

// Global CSS Injection for the premium avatar dropdown and toast notifications
const injectGlobalStyles = () => {
    if (document.getElementById('ep-global-styles')) return;
    const style = document.createElement('style');
    style.id = 'ep-global-styles';
    style.textContent = `
        /* Enforced Premium Responsive Navbar Styling */
        header.navbar, .navbar {
            height: 70px !important;
            background: rgba(255, 255, 255, 0.84) !important;
            backdrop-filter: blur(18px) !important;
            -webkit-backdrop-filter: blur(18px) !important;
            border-bottom: 1px solid rgba(226, 232, 240, 0.75) !important;
            display: flex !important;
            align-items: center !important;
            justify-content: space-between !important;
            padding: 0 2rem !important;
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            z-index: 1000 !important;
            box-shadow: 0 4px 30px rgba(0, 0, 0, 0.03) !important;
            box-sizing: border-box !important;
            transition: all 0.3s ease !important;
        }

        .nav-container {
            display: flex !important;
            align-items: center !important;
            justify-content: space-between !important;
            width: 100% !important;
            max-width: 1400px !important;
            margin: 0 auto !important;
        }

        .logo {
            font-size: 1.5rem !important;
            font-weight: 800 !important;
            color: #1e293b !important;
            text-decoration: none !important;
            display: flex !important;
            align-items: center !important;
            gap: 6px !important;
            z-index: 1002 !important;
        }

        .logo span {
            color: #4f46e5 !important;
        }

        .nav-links {
            display: flex !important;
            align-items: center !important;
            gap: 1.5rem !important;
            list-style: none !important;
            margin: 0 !important;
            padding: 0 !important;
        }

        .nav-links a {
            font-weight: 600 !important;
            font-size: 14px !important;
            color: #475569 !important;
            text-decoration: none !important;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
            padding: 8px 14px !important;
            border-radius: 50px !important;
        }

        .nav-links a:hover, .nav-links a.active {
            color: #4f46e5 !important;
            background: rgba(79, 70, 229, 0.06) !important;
        }

        /* Avatar Dropdown Wrapper */
        .ep-avatar-container {
            position: relative;
            display: inline-flex;
            align-items: center;
            gap: 10px;
            cursor: pointer;
            padding: 6px 14px;
            border-radius: 50px;
            background: rgba(255, 255, 255, 0.9);
            border: 1px solid rgba(226, 232, 240, 0.85);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.02);
            transition: all 0.25s ease;
            user-select: none;
            z-index: 1001;
        }

        .ep-avatar-container:hover {
            background: #ffffff;
            border-color: rgba(79, 70, 229, 0.25);
            box-shadow: 0 6px 18px rgba(79, 70, 229, 0.06);
            transform: translateY(-1px);
        }

        .ep-avatar-img {
            width: 32px;
            height: 32px;
            border-radius: 50%;
            object-fit: cover;
            border: 2px solid #4f46e5;
            display: flex;
            align-items: center;
            justify-content: center;
            background: linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%);
            color: #3730a3;
            font-weight: 700;
            font-size: 13px;
            text-transform: uppercase;
        }

        .ep-avatar-name {
            font-weight: 600;
            font-size: 13.5px;
            color: #1e293b;
            max-width: 90px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .ep-avatar-chevron {
            font-size: 9px;
            color: #64748b;
            transition: transform 0.25s ease;
        }

        .ep-avatar-container.active .ep-avatar-chevron {
            transform: rotate(180deg);
        }

        /* Dropdown Menu Card */
        .ep-dropdown-menu {
            position: absolute;
            top: calc(100% + 8px);
            right: 0;
            width: 220px;
            background: rgba(255, 255, 255, 0.95);
            border: 1px solid rgba(226, 232, 240, 0.8);
            border-radius: 14px;
            box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.06), 0 8px 10px -6px rgba(0, 0, 0, 0.02);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            padding: 6px;
            display: flex;
            flex-direction: column;
            gap: 2px;
            transform: translateY(10px) scale(0.96);
            opacity: 0;
            pointer-events: none;
            transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
            z-index: 10000;
        }

        .ep-dropdown-menu.show {
            transform: translateY(0) scale(1);
            opacity: 1;
            pointer-events: auto;
        }

        .ep-dropdown-header {
            padding: 10px 14px 8px 14px;
            border-bottom: 1px solid #f1f5f9;
            margin-bottom: 4px;
        }

        .ep-dropdown-username {
            font-weight: 700;
            font-size: 13.5px;
            color: #0f172a;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .ep-dropdown-role {
            display: inline-block;
            font-size: 9px;
            font-weight: 800;
            padding: 1px 6px;
            border-radius: 6px;
            margin-top: 3px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .role-student {
            background: rgba(79, 70, 229, 0.08);
            color: #4f46e5;
        }

        .role-mentor {
            background: rgba(139, 92, 246, 0.08);
            color: #8b5cf6;
        }

        .role-admin {
            background: rgba(239, 68, 68, 0.08);
            color: #ef4444;
        }

        .ep-dropdown-item {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 8px 12px;
            font-size: 13.5px;
            color: #475569;
            text-decoration: none !important;
            border-radius: 8px;
            transition: all 0.15s ease;
            font-weight: 500;
        }

        .ep-dropdown-item i {
            font-size: 14px;
            color: #94a3b8;
            width: 18px;
            text-align: center;
            transition: color 0.15s ease;
        }

        .ep-dropdown-item:hover {
            background: #f1f5f9;
            color: #0f172a;
        }

        .ep-dropdown-item:hover i {
            color: #4f46e5;
        }

        .ep-dropdown-item.text-danger {
            color: #ef4444;
        }

        .ep-dropdown-item.text-danger:hover {
            background: rgba(239, 68, 68, 0.04);
            color: #ef4444;
        }

        .ep-dropdown-item.text-danger:hover i {
            color: #ef4444;
        }

        /* Toast Notifications */
        .ep-toast {
            position: fixed;
            bottom: 24px;
            right: 24px;
            background: #ffffff;
            border-radius: 12px;
            padding: 14px 18px;
            display: flex;
            align-items: center;
            gap: 10px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.06);
            transform: translateY(15px);
            opacity: 0;
            transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
            z-index: 100000;
            border-left: 5px solid #4f46e5;
        }

        .ep-toast.show {
            transform: translateY(0);
            opacity: 1;
        }

        .ep-toast-success {
            border-left-color: #10b981;
        }

        .ep-toast-success i {
            color: #10b981;
        }

        .ep-toast-error {
            border-left-color: #ef4444;
        }

        .ep-toast-error i {
            color: #ef4444;
        }

        .ep-toast-warning {
            border-left-color: #f59e0b;
        }

        .ep-toast-warning i {
            color: #f59e0b;
        }

        /* Mobile Menu Logged-In Card styles */
        .mobile-user-card {
            background: rgba(255, 255, 255, 0.8);
            border: 1px solid rgba(226, 232, 240, 0.8);
            border-radius: 16px;
            padding: 1rem;
            margin: 1rem;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .mobile-user-info {
            display: flex;
            align-items: center;
            gap: 10px;
            border-bottom: 1px solid #f1f5f9;
            padding-bottom: 10px;
        }

        .mobile-user-details h4 {
            font-size: 13.5px;
            font-weight: 700;
            color: #0f172a;
            margin: 0;
        }

        /* Spacing and responsiveness fixes */
        @media (max-width: 991px) {
            .nav-links {
                display: none !important;
            }
        }
    `;
    document.head.appendChild(style);

    // Dynamic padding-top for body to prevent gaps/borders on dashboard pages
    const hasNavbar = !!document.querySelector('header.navbar, .navbar');
    const hasSidebar = !!document.querySelector('.sidebar');
    if (hasNavbar && !hasSidebar) {
        document.body.style.setProperty('padding-top', '70px', 'important');
    } else {
        document.body.style.setProperty('padding-top', '0px', 'important');
    }
};

// Custom premium Toast helper
export const showToast = (message, type = 'success') => {
    injectGlobalStyles();
    const toast = document.createElement('div');
    toast.className = `ep-toast ep-toast-${type}`;
    toast.innerHTML = `
        <i class="fas ${type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-times-circle' : 'fa-exclamation-triangle'}"></i>
        <span style="font-weight: 600; font-size: 13.5px; color: #334155;">${message}</span>
    `;
    document.body.appendChild(toast);
    
    setTimeout(() => toast.classList.add('show'), 20);
    
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3500);
};

// Activity and Session Timeout Manager
const setupSessionTimeout = (user) => {
    if (!user) return;

    if (!sessionStorage.getItem('loginTime')) {
        sessionStorage.setItem('loginTime', Date.now().toString());
    }
    if (!sessionStorage.getItem('lastActivity')) {
        sessionStorage.setItem('lastActivity', Date.now().toString());
    }

    const activityEvents = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    let throttleTimeout = null;

    const updateActivity = () => {
        if (!throttleTimeout) {
            sessionStorage.setItem('lastActivity', Date.now().toString());
            throttleTimeout = setTimeout(() => {
                throttleTimeout = null;
            }, 10000);
        }
    };

    activityEvents.forEach(event => {
        window.addEventListener(event, updateActivity, { passive: true });
    });

    const timeoutInterval = setInterval(() => {
        const now = Date.now();
        const loginTime = Number(sessionStorage.getItem('loginTime')) || now;
        const lastActivity = Number(sessionStorage.getItem('lastActivity')) || now;

        const thirtyMinutes = 30 * 60 * 1000;
        const twoHours = 2 * 60 * 60 * 1000;

        const isInactive = (now - lastActivity) > thirtyMinutes;
        const isMaxSessionExceeded = (now - loginTime) > twoHours;

        if (isInactive || isMaxSessionExceeded) {
            clearInterval(timeoutInterval);
            activityEvents.forEach(event => {
                window.removeEventListener(event, updateActivity);
            });

            signOut(auth).then(() => {
                localStorage.clear();
                sessionStorage.clear();
                window.location.href = 'login.html?sessionExpired=true';
            }).catch(err => {
                console.error("Auto-logout error:", err);
                window.location.href = 'login.html';
            });
        }
    }, 60000);
};

document.addEventListener('DOMContentLoaded', () => {
    injectGlobalStyles();

    const navLinksContainer = document.querySelector('.nav-links');
    const navButtonsDesktop = document.querySelector('.nav-buttons');
    const mobileLinksContainer = document.querySelector('.mobile-links');
    const dashboardUserProfile = document.querySelector('.user-profile');
    
    const path = window.location.pathname;
    const page = path.split('/').pop() || 'index.html';
    
    let loggedInUser = null;
    let currentUserType = '';

    // Standard public navigation items - KEPT 100% UNIFIED & NON-SHIFTING
    const publicLinks = [
        { href: 'index.html', text: 'Home' },
        { href: 'about.html', text: 'About Us' },
        { href: 'courses.html', text: 'Courses' },
        { href: 'mentors.html', text: 'Mentors' },
        { href: 'scholarships.html', text: 'Scholarships' },
        { href: 'pathway.html', text: 'Pathway Finder' }
    ];

    function createNavItem(href, text, isActive) {
        return `<a href="${href}" class="${isActive ? 'active' : ''}">${text}</a>`;
    }

    function renderNavLinks(linksObj) {
        if (navLinksContainer) {
            navLinksContainer.innerHTML = linksObj.map(l => createNavItem(l.href, l.text, l.href === page)).join('');
        }
        
        if (mobileLinksContainer) {
            let inner = mobileLinksContainer.querySelector('.mobile-links-inner') || mobileLinksContainer;
            const menuHtml = linksObj.map(l => createNavItem(l.href, l.text, l.href === page)).join('');
            const closeBtnHtml = mobileLinksContainer.querySelector('.close-btn') ? '' : '<div class="close-btn"><i class="fas fa-times"></i></div>';
            
            if (!mobileLinksContainer.querySelector('.mobile-links-inner')) {
                mobileLinksContainer.innerHTML = `
                    ${closeBtnHtml}
                    <nav class="mobile-links-inner">
                        ${menuHtml}
                    </nav>
                `;
            } else {
                mobileLinksContainer.querySelector('.mobile-links-inner').innerHTML = menuHtml;
            }
            
            const closeBtn = mobileLinksContainer.querySelector('.close-btn');
            if (closeBtn) {
                closeBtn.addEventListener('click', () => {
                    mobileLinksContainer.parentElement.classList.remove('active');
                });
            }
        }
        setActiveLinks();
    }

    function setActiveLinks() {
        document.querySelectorAll('.nav-links a, .mobile-links a').forEach(link => {
            const href = link.getAttribute('href');
            if (href === page || (page === '' && href === 'index.html')) {
                link.classList.add('active');
            } else {
                link.classList.remove('active');
            }
        });
    }

    // Default init with completely stable center menu links
    renderNavLinks(publicLinks);

    // Main Auth Listener
    onAuthStateChanged(auth, (user) => {
        if (user) {
            loggedInUser = user;
            setupSessionTimeout(user);

            // Fetch extra details from Realtime Database
            get(ref(database, 'users/' + user.uid)).then((snapshot) => {
                let dashboardUrl = 'student-dashboard.html';
                let role = 'student';
                let fullName = user.displayName || 'EduPath User';
                let photoURL = user.photoURL || '';

                if (snapshot.exists()) {
                    const data = snapshot.val();
                    const rawType = data.userType || data.role || 'student';
                    role = rawType.toLowerCase();
                    currentUserType = role;
                    fullName = data.fullName || fullName;
                    photoURL = data.photoURL || photoURL;
                    
                    if (role === 'student') {
                        dashboardUrl = 'student-dashboard.html';
                    } else if (role === 'mentor') {
                        dashboardUrl = 'mentor-dashboard.html';
                    } else if (role === 'admin') {
                        dashboardUrl = 'admin-dashboard.html';
                    }
                }
                
                // Perform route protection
                validateRoute(role);

                // Keep center nav links stable for all logged-in states!
                renderNavLinks(publicLinks);

                // Init initials and display details
                const initials = fullName.split(' ').map(n => n[0]).join('').substring(0, 2);
                const firstName = fullName.split(' ')[0];

                const dropdownHtml = `
                    <div class="ep-avatar-container" id="ep-user-dropdown-trigger">
                        ${photoURL ? `<img src="${photoURL}" class="ep-avatar-img" alt="${fullName}">` : `<div class="ep-avatar-img">${initials}</div>`}
                        <span class="ep-avatar-name">${firstName}</span>
                        <i class="fas fa-chevron-down ep-avatar-chevron"></i>
                        
                        <div class="ep-dropdown-menu" id="ep-user-dropdown-menu">
                            <div class="ep-dropdown-header">
                                <div class="ep-dropdown-username">${fullName}</div>
                                <span class="ep-dropdown-role role-${role}">${role}</span>
                            </div>
                            <a href="${dashboardUrl}" class="ep-dropdown-item"><i class="fas fa-tachometer-alt"></i> My Dashboard</a>
                            <a href="profile.html" class="ep-dropdown-item"><i class="fas fa-user"></i> My Profile</a>
                            <a href="profile.html#security" class="ep-dropdown-item"><i class="fas fa-key"></i> Change Password</a>
                            <hr style="border: 0; border-top: 1px solid #f1f5f9; margin: 4px 0;">
                            <a href="#" class="ep-dropdown-item text-danger" id="ep-dropdown-logout"><i class="fas fa-sign-out-alt"></i> Logout</a>
                        </div>
                    </div>
                `;

                // Render in desktop navbar on public pages
                if (navButtonsDesktop) {
                    navButtonsDesktop.innerHTML = dropdownHtml;
                }

                // Render in dashboard topbars
                if (dashboardUserProfile) {
                    dashboardUserProfile.outerHTML = dropdownHtml;
                }

                // Wire up dynamic click listener for dropdown toggling
                setTimeout(() => {
                    const trigger = document.getElementById('ep-user-dropdown-trigger');
                    const menu = document.getElementById('ep-user-dropdown-menu');
                    
                    if (trigger && menu) {
                        trigger.addEventListener('click', (e) => {
                            e.stopPropagation();
                            trigger.classList.toggle('active');
                            menu.classList.toggle('show');
                        });
                        
                        window.addEventListener('click', () => {
                            trigger.classList.remove('active');
                            menu.classList.remove('show');
                        });
                    }

                    document.getElementById('ep-dropdown-logout')?.addEventListener('click', handleLogout);
                    document.getElementById('mobile-logout-btn')?.addEventListener('click', handleLogout);
                }, 100);

                // Update Mobile Menu overlay with beautiful user card
                if (mobileLinksContainer) {
                    const inner = mobileLinksContainer.querySelector('.mobile-links-inner') || mobileLinksContainer;
                    inner.querySelectorAll('.btn-login, .btn-signup, #mobile-logout-btn').forEach(el => el.remove());
                    
                    const mobileCardHtml = `
                        <div class="mobile-user-card">
                            <div class="mobile-user-info">
                                ${photoURL ? `<img src="${photoURL}" class="avatar-sm" style="width:40px;height:40px;border-radius:50%;object-fit:cover;" alt="${fullName}">` : `<div class="ep-avatar-img" style="width:40px;height:40px;font-size:12px;">${initials}</div>`}
                                <div class="mobile-user-details">
                                    <h4>${fullName}</h4>
                                    <span class="ep-dropdown-role role-${role}" style="margin:0;">${role}</span>
                                </div>
                            </div>
                            <a href="${dashboardUrl}" class="ep-dropdown-item" style="padding: 6px 8px;"><i class="fas fa-tachometer-alt"></i> Dashboard</a>
                            <a href="profile.html" class="ep-dropdown-item" style="padding: 6px 8px;"><i class="fas fa-user"></i> My Profile</a>
                            <a href="#" id="mobile-logout-btn" class="ep-dropdown-item text-danger" style="padding: 6px 8px;"><i class="fas fa-sign-out-alt"></i> Logout</a>
                        </div>
                    `;
                    
                    inner.querySelector('.mobile-user-card')?.remove();
                    inner.insertAdjacentHTML('beforeend', mobileCardHtml);
                    
                    setTimeout(() => {
                        document.getElementById('mobile-logout-btn')?.addEventListener('click', handleLogout);
                    }, 100);
                }
            });
        } else {
            loggedInUser = null;
            currentUserType = '';
            
            // Check route protection
            validateRoute(null);

            // Re-render nav links for stable guest states
            renderNavLinks(publicLinks);

            if (navButtonsDesktop) {
                navButtonsDesktop.innerHTML = `
                    <a href="login.html" class="btn btn-login">Login</a>
                    <a href="signup.html" class="btn btn-signup">Sign Up</a>
                `;
            }
            
            if (mobileLinksContainer) {
                const inner = mobileLinksContainer.querySelector('.mobile-links-inner') || mobileLinksContainer;
                inner.querySelector('.mobile-user-card')?.remove();
                
                if (!inner.querySelector('.btn-login')) {
                    inner.insertAdjacentHTML('beforeend', `
                        <a href="login.html" class="btn btn-login" style="margin-top: 1.5rem; text-align: center; display: block; border-radius: 50px;">Login</a>
                        <a href="signup.html" class="btn btn-signup" style="text-align: center; margin-top: 0.5rem; display: block; border-radius: 50px;">Sign Up</a>
                    `);
                }
            }
        }
    });

    function handleLogout(e) {
        e.preventDefault();
        signOut(auth).then(() => {
            localStorage.clear();
            sessionStorage.clear();
            window.location.href = 'login.html';
        }).catch(err => {
            console.error("Sign out error:", err);
            window.location.href = 'login.html';
        });
    }

    function validateRoute(role) {
        const protectedRoutes = {
            'student-dashboard.html': 'student',
            'pathway.html': 'student',
            'mentor-dashboard.html': 'mentor',
            'admin-dashboard.html': 'admin'
        };

        const currentPage = window.location.pathname.split('/').pop();
        
        if (currentPage === 'profile.html' && !role) {
            window.location.href = `login.html?redirect=profile.html`;
            return;
        }

        const requiredRole = protectedRoutes[currentPage];

        if (requiredRole) {
            if (!role) {
                window.location.href = `login.html?redirect=${encodeURIComponent(currentPage)}`;
                return;
            }

            if (role !== requiredRole) {
                if (role === 'student') window.location.href = 'student-dashboard.html';
                else if (role === 'mentor') window.location.href = 'mentor-dashboard.html';
                else if (role === 'admin') window.location.href = 'admin-dashboard.html';
                else window.location.href = 'index.html';
            }
        }
    }

    document.addEventListener('click', (e) => {
        const linkTarget = e.target.closest('.restricted-link');
        if (linkTarget) {
            e.preventDefault();
            const destination = linkTarget.getAttribute('href') || linkTarget.getAttribute('data-href') || 'index.html';
            
            if (loggedInUser) {
                window.location.href = destination;
            } else {
                showToast("Please login or create an account to access this feature.", "warning");
                setTimeout(() => {
                    window.location.href = `login.html?redirect=${encodeURIComponent(destination)}`;
                }, 1500);
            }
            return;
        }

        const actionTarget = e.target.closest('.restricted-action');
        if (actionTarget) {
            e.preventDefault();
            
            if (loggedInUser) {
                const actionName = actionTarget.getAttribute('data-action');
                const event = new CustomEvent('restricted-action-triggered', {
                    detail: { action: actionName, element: actionTarget }
                });
                document.dispatchEvent(event);
            } else {
                showToast("Please login or create an account to access this feature.", "warning");
                setTimeout(() => {
                    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
                    window.location.href = `login.html?redirect=${encodeURIComponent(currentPage)}`;
                }, 1500);
            }
        }
    });
});
