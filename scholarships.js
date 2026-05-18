// Scholarships Catalog JavaScript
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

    // --- Scholarships Data ---
    const scholarships = [
        {
            id: 'presidential-fund',
            title: 'Presidential Fund Scholarship for School Leavers',
            sponsor: 'Government of Sri Lanka',
            category: 'government',
            amount: 'Full Tuition + Stipend',
            desc: 'A national welfare initiative to support talented school leavers after O/L and A/L examinations from low-income families to continue vocational levels or diplomas.',
            criteria: [
                'Sri Lankan citizen under 24 years',
                'Family monthly income < LKR 60,000',
                'Completed O/L or A/L examinations'
            ]
        },
        {
            id: 'ict-growth-grant',
            title: 'IT Sector Female & Alternative Tech Grant',
            sponsor: 'SLASSCOM & Partners',
            category: 'it-sector',
            amount: 'LKR 80,000 Allowance',
            desc: 'Special scholarship scheme to encourage female students and alternative path takers to enroll in professional software engineering and coding diplomas.',
            criteria: [
                'Enrolled in approved IT diploma',
                'Active tech interest (No prior degree)',
                'Shows commitment to a tech career'
            ]
        },
        {
            id: 'naita-stipend',
            title: 'Vocational Training Monthly Allowance Fund',
            sponsor: 'NAITA / TVEC Govt Board',
            category: 'vocational',
            amount: 'Monthly LKR 5,000',
            desc: 'Financial support program providing a monthly stipend to technical trainees enrolled in NVQ Level 3 and 4 courses at NAITA and VTA training centers.',
            criteria: [
                'Enrolled in full-time NVQ course',
                'Minimum 80% monthly attendance',
                'Technical skill-focused pathways'
            ]
        },
        {
            id: 'private-partial-grant',
            title: 'Private Institute Alternative Path Sponsorship',
            sponsor: 'EduPath Corporate Network',
            category: 'it-sector',
            amount: '75% Tuition Covered',
            desc: 'Partial scholarships funded by local tech companies for students who had unexpected exam results but show outstanding problem-solving skills.',
            criteria: [
                'Pass in EduPath Skill Assessment',
                'A/L or O/L results (Any stream)',
                'Highly motivated to switch paths'
            ]
        }
    ];

    const grid = document.getElementById('scholarships-grid');
    const searchInput = document.getElementById('scholarship-search');
    const chips = document.querySelectorAll('.chip');

    let activeCategory = 'all';
    let searchQuery = '';

    // --- Render Scholarships ---
    function renderScholarships() {
        if (!grid) return;

        const filtered = scholarships.filter(item => {
            const matchesCategory = activeCategory === 'all' || item.category === activeCategory;
            const matchesSearch = item.title.toLowerCase().includes(searchQuery) ||
                                 item.sponsor.toLowerCase().includes(searchQuery) ||
                                 item.desc.toLowerCase().includes(searchQuery) ||
                                 item.criteria.some(c => c.toLowerCase().includes(searchQuery));
            return matchesCategory && matchesSearch;
        });

        if (filtered.length === 0) {
            grid.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 3rem; color: var(--text-muted);">
                    <i class="fas fa-hand-holding-usd" style="font-size: 3rem; color: #cbd5e1; margin-bottom: 1rem;"></i>
                    <h3>No Scholarships Found</h3>
                    <p>Try searching another funding type or provider.</p>
                </div>
            `;
            return;
        }

        grid.innerHTML = filtered.map(item => `
            <div class="scholarship-card">
                <div class="card-top">
                    <div class="card-header-row">
                        <span class="sponsor">${item.sponsor}</span>
                        <span class="amount-tag">${item.amount}</span>
                    </div>
                    <h3>${item.title}</h3>
                    <p class="scholarship-desc">${item.desc}</p>
                    
                    <div class="criteria-title">Eligibility Criteria</div>
                    <div class="criteria-list">
                        ${item.criteria.map(c => `
                            <span class="criteria-item"><i class="fas fa-check-circle"></i> ${c}</span>
                        `).join('')}
                    </div>
                </div>
                
                <div class="card-actions">
                    <button class="btn btn-primary btn-card-primary restricted-action" data-action="apply-scholarship" data-title="${item.title}">
                        Apply Now
                    </button>
                    <button class="btn-card-outline restricted-action" data-action="save-scholarship" data-id="${item.id}">
                        <i class="far fa-heart"></i>
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
            renderScholarships();
        });
    });

    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            searchQuery = e.target.value.toLowerCase().trim();
            renderScholarships();
        });
    }

    // Initial render
    renderScholarships();

    // --- Handle Restricted Scholarship Application Actions ---
    document.addEventListener('restricted-action-triggered', (e) => {
        const { action, element } = e.detail;
        if (action === 'apply-scholarship') {
            const title = element.getAttribute('data-title');
            alert(`Application started for ${title}! The application form has been loaded in your Student Dashboard under Financial Support.`);
            window.location.href = 'student-dashboard.html';
        } else if (action === 'save-scholarship') {
            const icon = element.querySelector('i');
            element.classList.toggle('saved');
            if (element.classList.contains('saved')) {
                icon.className = 'fas fa-heart';
                alert("Scholarship saved successfully to your profile!");
            } else {
                icon.className = 'far fa-heart';
                alert("Scholarship removed from your saved list.");
            }
        }
    });
});
