// =========================================
// EduPath Lanka - Custom JavaScript
// =========================================

document.addEventListener('DOMContentLoaded', () => {

    // --- 1. Sticky Navigation Bar ---
    const header = document.querySelector('.header');
    
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
        }
    });

    // --- 2. Mobile Menu Toggle ---
    const hamburger = document.querySelector('.hamburger');
    const mobileMenu = document.querySelector('.mobile-menu');
    const closeBtn = document.querySelector('.close-btn');
    const mobileLinks = document.querySelectorAll('.mobile-links a');

    hamburger.addEventListener('click', () => {
        mobileMenu.classList.add('active');
    });

    closeBtn.addEventListener('click', () => {
        mobileMenu.classList.remove('active');
    });

    // Close menu when a link is clicked
    mobileLinks.forEach(link => {
        link.addEventListener('click', () => {
            mobileMenu.classList.remove('active');
        });
    });

    // --- 3. Scroll Reveal Animation using Intersection Observer ---
    const revealElements = document.querySelectorAll('.scroll-reveal');

    const revealObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('active');
                observer.unobserve(entry.target); // Stop observing once revealed
            }
        });
    }, {
        root: null,
        threshold: 0.15, // Trigger when 15% of the element is visible
        rootMargin: "0px 0px -50px 0px"
    });

    revealElements.forEach(el => {
        revealObserver.observe(el);
    });

    // --- 4. Interactive Path Finder Preview ---
    const pfForm = document.getElementById('pf-form');
    const pfResult = document.getElementById('pf-result');
    const pfResetBtn = document.getElementById('pf-reset');

    if (pfForm && pfResult && pfResetBtn) {
        pfForm.addEventListener('submit', (e) => {
            e.preventDefault(); // Prevent page reload
            
            // Basic validation check
            const education = document.getElementById('education').value;
            const interest = document.getElementById('interest').value;
            const goal = document.getElementById('goal').value;

            if (!education || !interest || !goal) {
                alert('Please select all options to find your path!');
                return;
            }

            // Hide form, show result (simulating a calculation/loading state)
            pfForm.classList.add('hidden');
            pfResult.classList.remove('hidden');
            
            // You could add dynamic text here based on selections if desired
        });

        pfResetBtn.addEventListener('click', () => {
            // Reset form and show it again
            pfForm.reset();
            pfResult.classList.add('hidden');
            pfForm.classList.remove('hidden');
        });
    }

    // --- 5. Smooth Scrolling for Anchor Links ---
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const targetId = this.getAttribute('href');
            
            if(targetId === '#') return; // Ignore empty hash
            
            const targetElement = document.querySelector(targetId);
            
            if (targetElement) {
                e.preventDefault();
                // Account for fixed header height
                const headerHeight = document.querySelector('.header').offsetHeight;
                const elementPosition = targetElement.getBoundingClientRect().top;
                const offsetPosition = elementPosition + window.pageYOffset - headerHeight;
  
                window.scrollTo({
                    top: offsetPosition,
                    behavior: "smooth"
                });
            }
        });
    });

    // --- 6. Number Counter Animation for Impact Section ---
    const counters = document.querySelectorAll('.counter');
    let counted = false;

    const counterObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting && !counted) {
                counted = true; // Ensure it only runs once
                counters.forEach(counter => {
                    const target = +counter.getAttribute('data-target');
                    const duration = 2000; // 2 seconds
                    const increment = target / (duration / 16); // 60fps
                    
                    let current = 0;
                    const updateCounter = () => {
                        current += increment;
                        if (current < target) {
                            counter.innerText = Math.ceil(current);
                            requestAnimationFrame(updateCounter);
                        } else {
                            // Formatting the number nicely (e.g., 10000 -> 10K or just 10000 depending on preference)
                            if (target >= 10000) {
                                counter.innerText = (target / 1000) + 'K';
                            } else {
                                counter.innerText = target;
                            }
                        }
                    };
                    updateCounter();
                });
            }
        });
    }, { threshold: 0.5 });

    const impactSection = document.getElementById('impact');
    if (impactSection) {
        counterObserver.observe(impactSection);
    }
});
