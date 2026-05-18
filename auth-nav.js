import { auth, database } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { ref, get } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

document.addEventListener('DOMContentLoaded', () => {
    const navLinksContainer = document.querySelector('.nav-links');
    const navButtonsDesktop = document.querySelector('.nav-buttons');
    const mobileLinksContainer = document.querySelector('.mobile-links');
    
    // Determine active path
    const path = window.location.pathname;
    const page = path.split('/').pop() || 'index.html';
    
    let loggedInUser = null;
    let currentUserType = '';

    function createNavItem(href, text, isActive) {
        return `<a href="${href}" class="${isActive ? 'active' : ''}">${text}</a>`;
    }

    function setActiveLinks() {
        document.querySelectorAll('.nav-links a, .mobile-links a').forEach(link => {
            const href = link.getAttribute('href');
            
            // Check if link matches page, or if page is empty and link is index.html
            if (href === page || (page === '' && href === 'index.html')) {
                link.classList.add('active');
            } else {
                link.classList.remove('active');
            }
        });
    }

    // Default Public Nav Links
    const publicLinks = [
        { href: 'index.html', text: 'Home' },
        { href: 'about.html', text: 'About Us' },
        { href: 'courses.html', text: 'Courses' },
        { href: 'mentors.html', text: 'Mentors' },
        { href: 'scholarships.html', text: 'Scholarships' },
        { href: '#contact', text: 'Contact' }
    ];

    function renderNavLinks(linksObj) {
        if (navLinksContainer) {
            navLinksContainer.innerHTML = linksObj.map(l => createNavItem(l.href, l.text, l.href === page)).join('');
        }
        
        if (mobileLinksContainer) {
            mobileLinksContainer.innerHTML = `
                <div class="close-btn"><i class="fas fa-times"></i></div>
                <nav class="mobile-links-inner">
                    ${linksObj.map(l => createNavItem(l.href, l.text, l.href === page)).join('')}
                </nav>
            `;
            
            // Re-bind mobile menu close logic if present
            const closeBtn = mobileLinksContainer.querySelector('.close-btn');
            if (closeBtn) {
                closeBtn.addEventListener('click', () => {
                    mobileLinksContainer.classList.remove('active');
                });
            }
        }
        setActiveLinks();
        handleScrollSpy();
    }

    // Scroll-Spy logic for Home page sections
    function handleScrollSpy() {
        if (page !== 'index.html' && page !== '') return;
        
        const contactSection = document.getElementById('contact');
        if (!contactSection) return;

        const scrollHandler = () => {
            const homeLinks = document.querySelectorAll('.nav-links a[href="index.html"], .mobile-links-inner a[href="index.html"]');
            const contactLinks = document.querySelectorAll('.nav-links a[href="#contact"], .mobile-links-inner a[href="#contact"]');
            
            if (homeLinks.length === 0 || contactLinks.length === 0) return;

            const rect = contactSection.getBoundingClientRect();
            // Trigger contact active when contact section takes up a good part of the screen
            const isContactVisible = rect.top < window.innerHeight * 0.65;

            if (isContactVisible) {
                contactLinks.forEach(el => el.classList.add('active'));
                homeLinks.forEach(el => el.classList.remove('active'));
            } else {
                homeLinks.forEach(el => el.classList.add('active'));
                contactLinks.forEach(el => el.classList.remove('active'));
            }
        };

        window.removeEventListener('scroll', scrollHandler);
        window.addEventListener('scroll', scrollHandler);
    }

    // Initialize with public links
    renderNavLinks(publicLinks);

    onAuthStateChanged(auth, (user) => {
        if (user) {
            loggedInUser = user;
            get(ref(database, 'users/' + user.uid)).then((snapshot) => {
                let dashboardUrl = 'student-dashboard.html';
                let linksObj = [];

                if (snapshot.exists()) {
                    const type = snapshot.val().userType.toLowerCase();
                    currentUserType = type;
                    
                    if (type === 'student') {
                        dashboardUrl = 'student-dashboard.html';
                        linksObj = [
                            { href: 'index.html', text: 'Home' },
                            { href: 'courses.html', text: 'Courses' },
                            { href: 'mentors.html', text: 'Mentors' },
                            { href: 'scholarships.html', text: 'Scholarships' },
                            { href: 'pathway.html', text: 'Pathway Finder' },
                            { href: 'student-dashboard.html', text: 'Student Dashboard' }
                        ];
                    } else if (type === 'mentor') {
                        dashboardUrl = 'mentor-dashboard.html';
                        linksObj = [
                            { href: 'index.html', text: 'Home' },
                            { href: 'courses.html', text: 'Courses' },
                            { href: 'mentor-dashboard.html', text: 'Mentor Dashboard' }
                        ];
                    } else if (type === 'admin') {
                        dashboardUrl = 'admin-dashboard.html';
                        linksObj = [
                            { href: 'index.html', text: 'Home' },
                            { href: 'admin-dashboard.html', text: 'Admin Dashboard' }
                        ];
                    }
                }
                
                renderNavLinks(linksObj);

                // Update Desktop Nav Buttons
                if (navButtonsDesktop) {
                    navButtonsDesktop.innerHTML = `
                        <a href="#" id="global-logout-btn" class="btn" style="border: 1px solid #ef4444; color: #ef4444; background: transparent; padding: 0.5rem 1.25rem; border-radius: 50px;">Logout</a>
                    `;
                }

                // Update Mobile Nav Buttons
                if (mobileLinksContainer) {
                    const inner = mobileLinksContainer.querySelector('.mobile-links-inner');
                    if (inner) {
                        inner.insertAdjacentHTML('beforeend', `
                            <a href="#" id="mobile-logout-btn" class="btn" style="color: #ef4444; text-align: center; margin-top: 1rem; border: 1px solid #ef4444; border-radius: 50px; background: transparent;">Logout</a>
                        `);
                    }
                }

                // Add logout listeners
                document.getElementById('global-logout-btn')?.addEventListener('click', handleLogout);
                document.getElementById('mobile-logout-btn')?.addEventListener('click', handleLogout);
            });
        } else {
            loggedInUser = null;
            currentUserType = '';
            
            // Setup login/signup buttons
            if (navButtonsDesktop) {
                navButtonsDesktop.innerHTML = `
                    <a href="login.html" class="btn btn-login">Login</a>
                    <a href="signup.html" class="btn btn-signup">Sign Up</a>
                `;
            }
            if (mobileLinksContainer) {
                const inner = mobileLinksContainer.querySelector('.mobile-links-inner');
                if (inner) {
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
            window.location.href = 'index.html';
        });
    }

    // --- Setup Restricted Links and Restricted Actions ---
    // If a restricted link (e.g. href="pathway.html") or restricted action is clicked, verify login
    document.addEventListener('click', (e) => {
        // 1. Restricted Links (Redirect to a page like pathway.html)
        const linkTarget = e.target.closest('.restricted-link');
        if (linkTarget) {
            e.preventDefault();
            const destination = linkTarget.getAttribute('href') || linkTarget.getAttribute('data-href') || 'index.html';
            
            if (loggedInUser) {
                window.location.href = destination;
            } else {
                alert("Please login or create an account to use the Pathway Finder.");
                window.location.href = `login.html?redirect=${encodeURIComponent(destination)}`;
            }
            return;
        }

        // 2. Restricted Actions (Like saving a course, requesting a mentor, etc.)
        const actionTarget = e.target.closest('.restricted-action');
        if (actionTarget) {
            e.preventDefault();
            
            if (loggedInUser) {
                // If logged in, let the page specific javascript handle it
                const actionName = actionTarget.getAttribute('data-action');
                const event = new CustomEvent('restricted-action-triggered', {
                    detail: { action: actionName, element: actionTarget }
                });
                document.dispatchEvent(event);
            } else {
                alert("Please login or create an account to access this feature.");
                const currentPage = window.location.pathname.split('/').pop() || 'index.html';
                window.location.href = `login.html?redirect=${encodeURIComponent(currentPage)}`;
            }
        }
    });
});
