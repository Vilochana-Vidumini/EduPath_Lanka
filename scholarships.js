// Scholarships Catalog JavaScript - Loading from Firebase
import { auth, database } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { ref, get, set, onValue } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
import { showToast } from "./auth-nav.js?v=20260614-brand";

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

    const grid = document.getElementById('scholarships-grid');
    const searchInput = document.getElementById('scholarship-search');
    const chips = document.querySelectorAll('.chip');

    let allScholarships = []; // Will be populated from Firebase
    let activeCategory = 'all';
    let searchQuery = '';

    // Helper functions
    function displayVal(value) {
        if (value === null || value === undefined || value === '') return 'N/A';
        if (typeof value === 'object') return 'N/A';
        return String(value);
    }

    function escapeHtml(str) {
        if (str == null) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // --- Load Scholarships from Firebase ---
    function loadScholarshipsFromFirebase() {
        const scholRef = ref(database, 'scholarships');
        onValue(scholRef, (snapshot) => {
            allScholarships = [];
            if (snapshot.exists()) {
                const data = snapshot.val();
                Object.entries(data).forEach(([id, scholarship]) => {
                    // Only show active scholarships
                    const status = String(scholarship.status || 'active').trim().toLowerCase();
                    if (status === 'active') {
                        allScholarships.push({
                            id,
                            ...scholarship
                        });
                    }
                });
            }
            renderScholarships();
        });
    }

    // --- Render Scholarships ---
    function renderScholarships() {
        if (!grid) return;

        let filtered = allScholarships.filter(item => {
            const matchesCategory = activeCategory === 'all' || 
                (item.providerType === activeCategory) || 
                (item.supportType === activeCategory) ||
                (item.category === activeCategory);

            const scholarshipName = (item.scholarshipName || item.name || '').toLowerCase();
            const provider = (item.provider || '').toLowerCase();
            const description = (item.description || '').toLowerCase();
            const eligibility = (item.eligibility || '').toLowerCase();

            const matchesSearch = scholarshipName.includes(searchQuery) ||
                provider.includes(searchQuery) ||
                description.includes(searchQuery) ||
                eligibility.includes(searchQuery);

            return matchesCategory && matchesSearch;
        });

        if (filtered.length === 0) {
            grid.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 3rem; color: var(--text-muted);">
                    <i class="fas fa-hand-holding-usd" style="font-size: 3rem; color: #cbd5e1; margin-bottom: 1rem;"></i>
                    <h3>No Scholarships Found</h3>
                    <p>Try searching another funding type or provider. Check back later for more opportunities.</p>
                </div>
            `;
            return;
        }

        // Update result count
        const resultCount = document.querySelector('.result-count') || document.createElement('div');
        resultCount.className = 'result-count';
        resultCount.textContent = `Showing ${filtered.length} scholarship${filtered.length !== 1 ? 's' : ''}`;
        if (!document.querySelector('.result-count')) {
            grid.parentElement?.insertBefore(resultCount, grid);
        }

        grid.innerHTML = filtered.map(item => `
            <div class="scholarship-card">
                <div class="card-top">
                    ${item.imageURL ? `<img src="${escapeHtml(item.imageURL)}" alt="${escapeHtml(item.scholarshipName)}" style="height:200px; object-fit:cover; width:100%; border-radius:8px; margin-bottom:1rem;">` : ''}
                    <div class="card-header-row">
                        <span class="sponsor">${escapeHtml(displayVal(item.provider))}</span>
                        <span class="amount-tag" style="background-color: #e8f5e9; color: #2e7d32;">${escapeHtml(displayVal(item.supportType))}</span>
                    </div>
                    <h3>${escapeHtml(item.scholarshipName || item.name)}</h3>
                    <p class="text-sm text-muted" style="margin-bottom: 1rem;">
                        <strong>${escapeHtml(displayVal(item.providerType))}</strong> • ${escapeHtml(displayVal(item.category))}
                    </p>
                    <p class="scholarship-desc">${escapeHtml((item.description || '').substring(0, 150))}...</p>
                    
                    <div style="background: #f5f5f5; padding: 1rem; border-radius: 8px; margin: 1rem 0;">
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; font-size: 0.9rem;">
                            ${item.amount ? `<div><strong>Amount:</strong> ${escapeHtml(item.amount)}</div>` : ''}
                            ${item.deadline ? `<div><strong>Deadline:</strong> ${escapeHtml(item.deadline)}</div>` : ''}
                            ${item.qualificationLevel ? `<div><strong>Qualification:</strong> ${escapeHtml(item.qualificationLevel)}</div>` : ''}
                            ${item.district ? `<div><strong>Region:</strong> ${escapeHtml(item.district)}</div>` : ''}
                        </div>
                    </div>

                    ${item.eligibility ? `
                        <div style="margin-bottom: 1rem;">
                            <div style="font-weight: 700; font-size: 0.9rem; margin-bottom: 0.5rem;">Eligibility</div>
                            <p style="font-size: 0.9rem; margin: 0;">${escapeHtml((item.eligibility || '').substring(0, 150))}</p>
                        </div>
                    ` : ''}
                </div>
                
                <div class="card-actions">
                    <button class="btn btn-primary btn-card-primary apply-scholarship-btn" data-id="${item.id}" title="Apply Now">
                        Apply Now
                    </button>
                    <button class="btn-card-outline save-scholarship-btn" data-id="${item.id}" title="Save Scholarship">
                        <i class="far fa-heart"></i>
                    </button>
                </div>
            </div>
        `).join('');

        attachScholarshipActionListeners();
    }

    function attachScholarshipActionListeners() {
        // Apply buttons
        document.querySelectorAll('.apply-scholarship-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const scholId = btn.getAttribute('data-id');
                const scholarship = allScholarships.find(s => s.id === scholId);
                if (scholarship && scholarship.applyLink) {
                    window.open(scholarship.applyLink, '_blank');
                } else {
                    onAuthStateChanged(auth, (user) => {
                        if (!user) {
                            window.location.href = 'login.html?redirect=scholarships.html';
                        } else {
                            showToast('Application process initiated. You will be guided to complete your scholarship application in your Student Dashboard.', 'info');
                            window.location.href = 'student-dashboard.html';
                        }
                    });
                }
            });
        });

        // Save buttons
        document.querySelectorAll('.save-scholarship-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                onAuthStateChanged(auth, (user) => {
                    if (!user) {
                        window.location.href = 'login.html?redirect=scholarships.html';
                        return;
                    }

                    const scholId = btn.getAttribute('data-id');
                    const scholarship = allScholarships.find(s => s.id === scholId);
                    if (!scholarship) return;

                    const icon = btn.querySelector('i');
                    const savedRef = ref(database, `savedScholarships/${user.uid}/${scholId}`);

                    if (btn.classList.contains('saved')) {
                        // Remove from saved
                        set(savedRef, null).then(() => {
                            btn.classList.remove('saved');
                            icon.className = 'far fa-heart';
                            showToast('Scholarship removed from saved list.', 'success');
                        }).catch(() => showToast('Scholarship update failed. Please try again.', 'error'));
                    } else {
                        // Add to saved
                        set(savedRef, {
                            ...scholarship,
                            savedAt: new Date().toISOString()
                        }).then(() => {
                            btn.classList.add('saved');
                            icon.className = 'fas fa-heart';
                            showToast('Scholarship saved successfully!', 'success');
                        }).catch(() => showToast('Scholarship save failed. Please try again.', 'error'));
                    }
                });
            });
        });
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

    // Load scholarships from Firebase on page load
    loadScholarshipsFromFirebase();

    // --- Handle Restricted Scholarship Application Actions (for compatibility) ---
    document.addEventListener('restricted-action-triggered', (e) => {
        const { action, element } = e.detail;
        if (action === 'apply-scholarship') {
            const title = element.getAttribute('data-title');
            showToast(`Application started for ${title}! The application form has been loaded in your Student Dashboard under Financial Support.`, 'info');
            window.location.href = 'student-dashboard.html';
        } else if (action === 'save-scholarship') {
            const icon = element.querySelector('i');
            element.classList.toggle('saved');
            if (element.classList.contains('saved')) {
                icon.className = 'fas fa-heart';
            } else {
                icon.className = 'far fa-heart';
            }
        }
    });
});
