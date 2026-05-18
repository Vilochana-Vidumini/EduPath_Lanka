// Mentors Catalog JavaScript
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

    // --- Mentors Data ---
    const mentors = [
        {
            id: 'dinith-se',
            name: 'Dinith Perera',
            category: 'tech',
            designation: 'Senior Software Architect',
            company: 'WSO2 Sri Lanka',
            avatar: 'fa-user-tie',
            bio: 'Dinith skipped the traditional state university route, earning a professional software engineering diploma while working. Over 10 years of experience.',
            skills: ['Java', 'Cloud Native', 'API Design', 'Career Advice'],
            experience: '10+ Years'
        },
        {
            id: 'dilshan-voc',
            name: 'Dilshan Silva',
            category: 'vocational',
            designation: 'Lead Vocational Counselor',
            company: 'VTA Sri Lanka',
            avatar: 'fa-compass',
            bio: 'Dilshan specializes in government NVQ programs, helping students transition from school directly into globally-demanded technical careers.',
            skills: ['NVQ Support', 'Electrical Technology', 'Automotive Paths'],
            experience: '8 Years'
        },
        {
            id: 'nimasha-startup',
            name: 'Nimasha Gunawardena',
            category: 'business',
            designation: 'Co-Founder & Tech CEO',
            company: 'Lanka Ventures',
            avatar: 'fa-user-ninja',
            bio: 'Nimasha built her own digital marketing agency at age 21 without a business degree. Passionate about empowering young entrepreneurs.',
            skills: ['Growth Hacking', 'Fundraising', 'B2B Sales', 'Mentorship'],
            experience: '6 Years'
        },
        {
            id: 'amila-design',
            name: 'Amila Fernando',
            category: 'creative',
            designation: 'Head of UI/UX Design',
            company: 'Sysco LABS',
            avatar: 'fa-user-astronaut',
            bio: 'Self-taught UI/UX designer. Amila helps students build highly competitive creative portfolios that attract international agencies.',
            skills: ['Figma', 'Product Design', 'Visual Hierarchy', 'Portfolio Review'],
            experience: '7 Years'
        },
        {
            id: 'sajith-voc',
            name: 'Sajith Alwis',
            category: 'vocational',
            designation: 'NVQ Curriculum Consultant',
            company: 'NAITA Sri Lanka',
            avatar: 'fa-user-graduate',
            bio: 'Specialist in apprenticeship training. Sajith helps students gain hands-on industrial experience and job placements during their courses.',
            skills: ['NAITA Paths', 'Industry Training', 'Vocational Levels'],
            experience: '12 Years'
        },
        {
            id: 'ruwani-tech',
            name: 'Ruwani Wijesinghe',
            category: 'tech',
            designation: 'Data Analyst & Lead Instructor',
            company: 'London Met Alumna',
            avatar: 'fa-user-doctor',
            bio: 'Ruwani transitioned from a biology background to tech and data analytics. She is dedicated to guiding students through career switches.',
            skills: ['SQL', 'Python', 'Tableau', 'Alternative Coding Paths'],
            experience: '5 Years'
        }
    ];

    const grid = document.getElementById('mentors-grid');
    const searchInput = document.getElementById('mentor-search');
    const chips = document.querySelectorAll('.chip');

    let activeCategory = 'all';
    let searchQuery = '';

    // --- Render Mentors ---
    function renderMentors() {
        if (!grid) return;

        const filtered = mentors.filter(mentor => {
            const matchesCategory = activeCategory === 'all' || mentor.category === activeCategory;
            const matchesSearch = mentor.name.toLowerCase().includes(searchQuery) ||
                                 mentor.designation.toLowerCase().includes(searchQuery) ||
                                 mentor.company.toLowerCase().includes(searchQuery) ||
                                 mentor.skills.some(s => s.toLowerCase().includes(searchQuery));
            return matchesCategory && matchesSearch;
        });

        if (filtered.length === 0) {
            grid.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 3rem; color: var(--text-muted);">
                    <i class="fas fa-user-slash" style="font-size: 3rem; color: #cbd5e1; margin-bottom: 1rem;"></i>
                    <h3>No Mentors Found</h3>
                    <p>Try searching another field, company, or tech stack.</p>
                </div>
            `;
            return;
        }

        grid.innerHTML = filtered.map(mentor => `
            <div class="mentor-card">
                <div>
                    <div class="mentor-header">
                        <div class="avatar-wrapper">
                            <i class="fas ${mentor.avatar}"></i>
                        </div>
                        <div class="mentor-meta">
                            <h3>${mentor.name}</h3>
                            <div class="designation">${mentor.designation}</div>
                            <div class="company">${mentor.company}</div>
                        </div>
                    </div>
                    <p class="mentor-bio">${mentor.bio}</p>
                    
                    <div class="expertise-title">Areas of Advice</div>
                    <div class="skills-list">
                        ${mentor.skills.map(skill => `<span class="skill-chip">${skill}</span>`).join('')}
                    </div>
                </div>
                
                <div class="mentor-footer">
                    <span class="exp-badge"><i class="fas fa-award"></i> ${mentor.experience}</span>
                    <button class="btn btn-primary btn-request restricted-action" data-action="request-mentorship" data-name="${mentor.name}">
                        Request Mentorship
                    </button>
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
            renderMentors();
        });
    });

    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            searchQuery = e.target.value.toLowerCase().trim();
            renderMentors();
        });
    }

    // Initial render
    renderMentors();

    // --- Handle Restricted Mentorship Request Action ---
    document.addEventListener('restricted-action-triggered', (e) => {
        const { action, element } = e.detail;
        if (action === 'request-mentorship') {
            const name = element.getAttribute('data-name');
            alert(`Mentorship request sent successfully to ${name}! They will review your profile and contact you via your registered email shortly.`);
            element.textContent = "Request Sent";
            element.style.background = "#059669";
            element.style.borderColor = "#059669";
            element.disabled = true;
        }
    });
});
