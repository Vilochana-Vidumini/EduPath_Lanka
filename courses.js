// Course Catalog JavaScript
document.addEventListener('DOMContentLoaded', () => {
    // --- Mobile Menu Toggle ---
    const hamburger = document.querySelector('.hamburger');
    const mobileMenu = document.querySelector('.mobile-menu');
    const closeBtn = document.querySelector('.close-btn');

    if (hamburger && mobileMenu && closeBtn) {
        hamburger.addEventListener('click', () => {
            mobileMenu.classList.add('active');
        });
        closeBtn.addEventListener('click', () => {
            mobileMenu.classList.remove('active');
        });
    }

    // --- Course Data ---
    const courses = [
        {
            id: 'se-diploma',
            title: 'Professional Diploma in Software Engineering',
            category: 'it',
            type: 'diploma',
            badgeClass: 'badge-diploma',
            typeName: 'Professional Diploma',
            duration: '12 Months',
            level: 'Level 5 Equiv.',
            desc: 'A complete practical roadmap to software development, web APIs, cloud architectures, and databases. Designed for direct industry placement.',
            price: 'LKR 120,000'
        },
        {
            id: 'nvq-it',
            title: 'NVQ Level 4 Information & Communication Technology',
            category: 'vocational',
            type: 'nvq',
            badgeClass: 'badge-nvq',
            typeName: 'Vocational (NVQ)',
            duration: '6 Months',
            level: 'NVQ Level 4',
            desc: 'Government-certified training covering hardware, software maintenance, fundamental coding, networking, and office operations. Highly valued globally.',
            price: 'Free / Gov Funded'
        },
        {
            id: 'dm-specialist',
            title: 'Digital Marketing & Growth Hacking Specialist',
            category: 'business',
            type: 'cert',
            badgeClass: 'badge-cert',
            typeName: 'Short Certification',
            duration: '4 Months',
            level: 'Specialist Cert',
            desc: 'Master search engine optimization (SEO), social media campaigns, paid ads, analytics, and content copy to grow local and international businesses.',
            price: 'LKR 45,000'
        },
        {
            id: 'graphic-design',
            title: 'Graphic Design & UI/UX Pathway',
            category: 'creative',
            type: 'diploma',
            badgeClass: 'badge-diploma',
            typeName: 'Professional Diploma',
            duration: '8 Months',
            level: 'Skill Diploma',
            desc: 'Unlock creative career options. Learn Adobe Creative Suite, Figma, design principles, prototyping, and user psychology to build modern digital products.',
            price: 'LKR 75,000'
        },
        {
            id: 'nvq-electrical',
            title: 'NVQ Level 4 Electrical Technology & Smart Systems',
            category: 'vocational',
            type: 'nvq',
            badgeClass: 'badge-nvq',
            typeName: 'Vocational (NVQ)',
            duration: '12 Months',
            level: 'NVQ Level 4',
            desc: 'Practical vocational path on home automation, industrial wiring, diagnostic tools, and electrical schematics. Perfect for global technical employment.',
            price: 'Free / Gov Funded'
        },
        {
            id: 'business-analytics',
            title: 'Diploma in Business Analytics & Startup Operations',
            category: 'business',
            type: 'diploma',
            badgeClass: 'badge-diploma',
            typeName: 'Professional Diploma',
            duration: '9 Months',
            level: 'Level 5 Equiv.',
            desc: 'Learn high-demand analytical tools like Excel, PowerBI, SQL, along with entrepreneurship fundamentals and agile project workflows.',
            price: 'LKR 95,000'
        }
    ];

    const grid = document.getElementById('courses-grid');
    const searchInput = document.getElementById('course-search');
    const chips = document.querySelectorAll('.chip');

    let activeCategory = 'all';
    let searchQuery = '';

    // --- Render Courses ---
    function renderCourses() {
        if (!grid) return;
        
        const filtered = courses.filter(course => {
            const matchesCategory = activeCategory === 'all' || course.category === activeCategory;
            const matchesSearch = course.title.toLowerCase().includes(searchQuery) ||
                                 course.desc.toLowerCase().includes(searchQuery) ||
                                 course.typeName.toLowerCase().includes(searchQuery);
            return matchesCategory && matchesSearch;
        });

        if (filtered.length === 0) {
            grid.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 3rem; color: var(--text-muted);">
                    <i class="fas fa-search" style="font-size: 3rem; color: #cbd5e1; margin-bottom: 1rem;"></i>
                    <h3>No Pathways Found</h3>
                    <p>Try refining your search query or choosing another category.</p>
                </div>
            `;
            return;
        }

        grid.innerHTML = filtered.map(course => `
            <div class="course-card">
                <div class="card-top">
                    <span class="card-badge ${course.badgeClass}">${course.typeName}</span>
                    <h3>${course.title}</h3>
                    <p class="course-desc">${course.desc}</p>
                </div>
                <div>
                    <div class="card-meta">
                        <span class="meta-item"><i class="far fa-clock"></i> ${course.duration}</span>
                        <span class="meta-item"><i class="fas fa-graduation-cap"></i> ${course.level}</span>
                        <span class="meta-item" style="font-weight:700; color:var(--primary-blue);">${course.price}</span>
                    </div>
                    <div class="card-actions">
                        <a href="student-dashboard.html" class="btn btn-primary btn-card-primary restricted-link">Enroll Course</a>
                        <button class="btn-card-outline restricted-action" data-action="save-course" data-id="${course.id}">
                            <i class="far fa-heart"></i>
                        </button>
                    </div>
                </div>
            </div>
        `).join('');
    }

    // --- Filter Handlers ---
    chips.forEach(chip => {
        chip.addEventListener('click', () => {
            chips.forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            activeCategory = chip.getAttribute('data-category');
            renderCourses();
        });
    });

    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            searchQuery = e.target.value.toLowerCase().trim();
            renderCourses();
        });
    }

    // Initial render
    renderCourses();

    // --- Handle Restricted Save Action ---
    document.addEventListener('restricted-action-triggered', (e) => {
        const { action, element } = e.detail;
        if (action === 'save-course') {
            const icon = element.querySelector('i');
            element.classList.toggle('saved');
            if (element.classList.contains('saved')) {
                icon.className = 'fas fa-heart';
                alert("Course saved successfully to your EduPath profile!");
            } else {
                icon.className = 'far fa-heart';
                alert("Course removed from your saved list.");
            }
        }
    });
});
