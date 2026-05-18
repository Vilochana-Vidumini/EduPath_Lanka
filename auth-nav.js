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

    function createNavItem(href, text, isActive) {
        return `<a href="${href}" class="${isActive ? 'active' : ''}">${text}</a>`;
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

    // Default Public Nav Links
    const publicLinks = [
        { href: 'index.html', text: 'Home' },
        { href: 'about.html', text: 'About Us' },
        { href: 'courses.html', text: 'Courses' },
        { href: 'mentors.html', text: 'Mentors' },
        { href: 'scholarships.html', text: 'Scholarships' },
        { href: '#contact', text: 'Contact' } // Assume contact is a section or future page
    ];

    function renderNavLinks(linksObj) {
        if (!navLinksContainer) return;
        navLinksContainer.innerHTML = linksObj.map(l => createNavItem(l.href, l.text, l.href === page)).join('');
        
        if (mobileLinksContainer) {
            // Keep mobile specific layout logic, removing login/signup temporarily to append them later
            mobileLinksContainer.innerHTML = `
                <div class="close-btn"><i class="fas fa-times"></i></div>
                <nav class="mobile-links-inner">
                    ${linksObj.map(l => createNavItem(l.href, l.text, l.href === page)).join('')}
                </nav>
            `;
            // Re-attach close event if needed, though usually handled by script.js
        }
        setActiveLinks();
    }

    // Initialize with public links
    renderNavLinks(publicLinks);

    onAuthStateChanged(auth, (user) => {
        if (user) {
            get(ref(database, 'users/' + user.uid)).then((snapshot) => {
                let dashboardUrl = 'student-dashboard.html';
                let linksObj = [];

                if (snapshot.exists()) {
                    const type = snapshot.val().userType.toLowerCase();
                    if(type === 'student') {
                        dashboardUrl = 'student-dashboard.html';
                        linksObj = [
                            { href: 'index.html', text: 'Home' },
                            { href: 'courses.html', text: 'Courses' },
                            { href: 'mentors.html', text: 'Mentors' },
                            { href: 'scholarships.html', text: 'Scholarships' },
                            { href: 'pathway.html', text: 'Pathway Finder' }
                        ];
                    } else if(type === 'mentor') {
                        dashboardUrl = 'mentor-dashboard.html';
                        linksObj = [
                            { href: 'index.html', text: 'Home' },
                            { href: 'courses.html', text: 'Courses' },
                            { href: '#', text: 'Requests' },
                            { href: '#', text: 'Resources' }
                        ];
                    } else if(type === 'admin') {
                        dashboardUrl = 'admin-dashboard.html';
                        linksObj = [
                            { href: 'index.html', text: 'Home' },
                            { href: '#', text: 'Manage Courses' },
                            { href: '#', text: 'Manage Mentors' },
                            { href: '#', text: 'Reports' }
                        ];
                    }
                }
                
                renderNavLinks(linksObj);

                // Update Desktop Nav
                if(navButtonsDesktop) {
                    navButtonsDesktop.innerHTML = `
                        <a href="${dashboardUrl}" class="btn" style="background-color: var(--primary-color, #2563eb); color: white; padding: 0.5rem 1.5rem; border-radius: 8px;">Dashboard</a>
                        <a href="#" id="global-logout-btn" class="btn" style="border: 2px solid #ef4444; color: #ef4444; padding: 0.5rem 1.5rem; border-radius: 8px;">Logout</a>
                    `;
                }

                // Update Mobile Nav Buttons
                if (mobileLinksContainer) {
                    const inner = mobileLinksContainer.querySelector('.mobile-links-inner');
                    if (inner) {
                        inner.insertAdjacentHTML('beforeend', `
                            <a href="${dashboardUrl}" class="btn" style="background-color: var(--primary-color, #2563eb); color: white; margin-top: 1rem; text-align: center;">Dashboard</a>
                            <a href="#" id="mobile-logout-btn" class="btn" style="color: #ef4444; text-align: center; margin-top: 0.5rem;">Logout</a>
                        `);
                    }
                }

                // Add logout listeners
                document.getElementById('global-logout-btn')?.addEventListener('click', handleLogout);
                document.getElementById('mobile-logout-btn')?.addEventListener('click', handleLogout);
            });
        } else {
            // Not logged in -> Already rendered publicLinks.
            // Setup login/signup buttons
            if(navButtonsDesktop) {
                navButtonsDesktop.innerHTML = `
                    <a href="login.html" class="btn btn-login">Login</a>
                    <a href="signup.html" class="btn btn-signup">Sign Up</a>
                `;
            }
            if (mobileLinksContainer) {
                const inner = mobileLinksContainer.querySelector('.mobile-links-inner');
                if (inner) {
                    inner.insertAdjacentHTML('beforeend', `
                        <a href="login.html" class="btn btn-login" style="margin-top: 1rem; text-align: center;">Login</a>
                        <a href="signup.html" class="btn btn-signup" style="text-align: center; margin-top: 0.5rem;">Sign Up</a>
                    `);
                }
            }
        }
    });

    function handleLogout(e) {
        e.preventDefault();
        signOut(auth).then(() => {
            window.location.href = 'index.html';
        });
    }

    // --- Setup Restrict Links Logic (for public links that lead to protected areas) ---
    // If a button with class .restricted-link is clicked, check auth state
    document.addEventListener('click', (e) => {
        const target = e.target.closest('.restricted-link');
        if (target) {
            e.preventDefault();
            const destination = target.getAttribute('href') || target.getAttribute('data-href');
            if (auth.currentUser) {
                if(destination) window.location.href = destination;
            } else {
                window.location.href = `login.html?redirect=${encodeURIComponent(destination)}`;
            }
        }
    });
});
