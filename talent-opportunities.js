// Talent Opportunities JavaScript - Loading from Firebase
import { auth, database } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { ref, get, set, onValue, push, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
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

    const grid = document.getElementById('courses-grid');
    const searchInput = document.getElementById('course-search');
    const chips = document.querySelectorAll('.chip');

    let allOpportunities = []; // Will be populated from Firebase
    let activeCategory = 'all';
    let searchQuery = '';

    // Helper function
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

    function escapeAttr(str) {
        return escapeHtml(str).replace(/'/g, '&#39;');
    }

    function sanitizeImageURL(value, fallback = '', defaultLocalFolder = 'images') {
        const raw = String(value || '').trim();
        let url = raw.replace(/\\/g, '/');
        const imagesIndex = url.toLowerCase().lastIndexOf('/images/');
        if (imagesIndex >= 0) url = url.slice(imagesIndex + 1);
        if (/^[a-z]:\/images\//i.test(url)) url = url.replace(/^[a-z]:\//i, '');
        if (!url) return fallback;
        if (url.startsWith('images/') || url.startsWith('./images/') || url.startsWith('../images/')) return url;
        if (defaultLocalFolder && /^[\w./ -]+\.(png|jpe?g|webp|gif|svg)$/i.test(url) && !/^[a-z][a-z0-9+.-]*:/i.test(url)) {
            const normalized = url.replace(/^\.?\//, '');
            return normalized.includes('/') ? `images/${normalized.replace(/^images\//, '')}` : `${defaultLocalFolder.replace(/\/$/, '')}/${normalized}`;
        }
        try {
            const parsed = new URL(url);
            if (parsed.protocol === 'https:' || parsed.protocol === 'http:') return parsed.href;
        } catch (error) {
            console.warn('Invalid image URL:', url);
        }
        return fallback;
    }

    function getOpportunityImage(opportunity = {}) {
        return sanitizeImageURL(opportunity.imageURL || opportunity.imagePath, 'images/course-placeholder.png', 'images');
    }

    // --- Load Opportunities from Firebase ---
    function loadOpportunitiesFromFirebase() {
        const oppsRef = ref(database, 'talentOpportunities');
        onValue(oppsRef, (snapshot) => {
            allOpportunities = [];
            if (snapshot.exists()) {
                const data = snapshot.val();
                Object.entries(data).forEach(([id, opp]) => {
                    // Only show active opportunities
                    const status = String(opp.status || 'active').trim().toLowerCase();
                    if (status === 'active' && opp.publicVisibility !== false) {
                        allOpportunities.push({
                            id,
                            ...opp
                        });
                    }
                });
            }
            renderOpportunities();
        });
    }

    // --- Render Opportunities ---
    function renderOpportunities() {
        if (!grid) return;

        let filtered = allOpportunities.filter(opp => {
            // Category filter
            const matchesCategory = activeCategory === 'all' || String(opp.category || '').toLowerCase().includes(activeCategory);

            // Search query filter
            const title = (opp.title || opp.name || '').toLowerCase();
            const provider = (opp.provider || '').toLowerCase();
            const description = (opp.description || '').toLowerCase();
            const matchesSearch = title.includes(searchQuery) ||
                provider.includes(searchQuery) ||
                description.includes(searchQuery);

            return matchesCategory && matchesSearch;
        });

        if (filtered.length === 0) {
            grid.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 3rem; color: var(--text-muted);">
                    <i class="fas fa-search" style="font-size: 3rem; color: #cbd5e1; margin-bottom: 1rem;"></i>
                    <h3>No Opportunities Found</h3>
                    <p>Try refining your search or filters. No opportunities match your criteria at this time.</p>
                </div>
            `;
            return;
        }

        // Update result count
        const resultCount = document.querySelector('.result-count') || document.createElement('div');
        resultCount.className = 'result-count';
        resultCount.textContent = `Showing ${filtered.length} opportunit${filtered.length !== 1 ? 'ies' : 'y'}`;
        if (!document.querySelector('.result-count')) {
            grid.parentElement?.insertBefore(resultCount, grid);
        }

        grid.innerHTML = filtered.map(opp => `
            <div class="course-card">
                <div class="course-card-media">
                    <img src="${escapeAttr(getOpportunityImage(opp))}" alt="${escapeAttr(opp.title || opp.name || 'Opportunity image')}" title="${escapeAttr(opp.imageURL || 'Using placeholder')}" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='images/course-placeholder.png';">
                    <span class="course-card-category">${escapeHtml(displayVal(opp.category || 'Opportunity'))}</span>
                </div>
                <div class="course-card-content">
                <div class="card-top">
                    <span class="card-badge" style="background-color: ${getCategoryColor(opp.category)};">${escapeHtml(displayVal(opp.category))}</span>
                    <h3>${escapeHtml(opp.title || opp.name)}</h3>
                    <p class="text-sm text-muted"><strong>${escapeHtml(displayVal(opp.provider))}</strong></p>
                    <p class="course-desc">${escapeHtml((opp.description || '').substring(0, 120))}...</p>
                </div>
                <div style="flex: 1; display: flex; flex-direction: column; justify-content: space-between;">
                    <div class="card-meta" style="font-size: 0.9rem; display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin-bottom: 1rem;">
                        <span class="meta-item"><i class="far fa-calendar-alt"></i> ${escapeHtml(displayVal(opp.deadline))}</span>
                        <span class="meta-item"><i class="fas fa-map-marker-alt"></i> ${escapeHtml(displayVal(opp.location))}</span>
                        <span class="meta-item"><i class="fas fa-trophy"></i> ${escapeHtml(displayVal(opp.opportunityType))}</span>
                        <span class="meta-item"><i class="fas fa-users"></i> ${escapeHtml(displayVal(opp.ageGroup || opp.eligibility))}</span>
                    </div>
                    <div class="card-actions">
                        <button class="btn btn-primary btn-card-primary view-details-btn" data-id="${opp.id}">View Details</button>
                    </div>
                </div>
                </div>
            </div>
        `).join('');

        attachActionListeners();
    }

    function getCategoryColor(category) {
        const colors = {
            'Sports': '#ff6b6b',
            'Arts & Culture': '#aa96da',
            'Technology': '#4ecdc4',
            'Leadership': '#f38181',
            'Music': '#95e1d3',
            'Drama & Theatre': '#fcbad3',
            'Dance': '#ffc93c',
            'Writing': '#ff7b54'
        };
        const defaultColor = '#0066cc';
        if (!category) return defaultColor;
        
        const normalized = category.toLowerCase();
        for (const [key, color] of Object.entries(colors)) {
            if (normalized.includes(key.toLowerCase())) return color;
        }
        return defaultColor;
    }

    function attachActionListeners() {
        // View Details buttons
        document.querySelectorAll('.view-details-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-id');
                const opp = allOpportunities.find(o => o.id === id);
                if (opp) {
                    showDetailsModal(opp);
                }
            });
        });
    }

    function showDetailsModal(opp) {
        const modalHtml = `
            <div style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 10000; padding: 1rem;">
                <div style="background: white; border-radius: 12px; max-width: 800px; width: 100%; max-height: 90vh; overflow-y: auto; padding: 2rem; position: relative;">
                    <button class="close-modal-btn" style="position: absolute; top: 1rem; right: 1rem; background: none; border: none; font-size: 1.5rem; cursor: pointer;">&times;</button>

                    <img src="${escapeAttr(getOpportunityImage(opp))}" alt="${escapeAttr(opp.title || opp.name || 'Opportunity image')}" style="width:100%; height:300px; object-fit:cover; border-radius:8px; margin-bottom:1.5rem;" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='images/course-placeholder.png';">

                    <h2 style="margin: 0 0 0.5rem 0;">${escapeHtml(opp.title || opp.name)}</h2>
                    <p style="margin: 0 0 1.5rem 0; color: var(--text-muted);"><strong>${escapeHtml(displayVal(opp.provider))}</strong> • ${escapeHtml(displayVal(opp.category))}</p>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.5rem; background: #f5f5f5; padding: 1rem; border-radius: 8px;">
                        <div><strong>Opportunity Type:</strong> ${escapeHtml(displayVal(opp.opportunityType))}</div>
                        <div><strong>Deadline:</strong> ${escapeHtml(displayVal(opp.deadline))}</div>
                        <div><strong>Location:</strong> ${escapeHtml(displayVal(opp.location))}</div>
                        <div><strong>Age Group/Eligibility:</strong> ${escapeHtml(displayVal(opp.ageGroup || opp.eligibility))}</div>
                        ${opp.date ? `<div><strong>Date:</strong> ${escapeHtml(opp.date)}</div>` : ''}
                        ${opp.contactEmail ? `<div><strong>Contact Email:</strong> ${escapeHtml(opp.contactEmail)}</div>` : ''}
                        ${opp.contactPhone ? `<div><strong>Contact Phone:</strong> ${escapeHtml(opp.contactPhone)}</div>` : ''}
                    </div>

                    ${opp.description ? `<div style="margin-bottom: 1.5rem;"><h4>Description</h4><p>${escapeHtml(opp.description)}</p></div>` : ''}
                    ${opp.requirements ? `<div style="margin-bottom: 1.5rem;"><h4>Requirements</h4><p>${escapeHtml(opp.requirements)}</p></div>` : ''}
                    ${opp.benefits ? `<div style="margin-bottom: 1.5rem;"><h4>Benefits/Prizes</h4><p>${escapeHtml(opp.benefits)}</p></div>` : ''}

                    <div style="display: flex; gap: 1rem; margin-top: 2rem;">
                        ${(opp.applicationUrl || opp.applicationLink || opp.applyLink) ? `<a href="${escapeHtml(opp.applicationUrl || opp.applicationLink || opp.applyLink)}" target="_blank" class="btn btn-primary">Apply / Register Now</a>` : ''}
                        <button class="btn btn-secondary close-modal-btn">Close</button>
                    </div>
                </div>
            </div>
        `;

        const modalDiv = document.createElement('div');
        modalDiv.innerHTML = modalHtml;
        document.body.appendChild(modalDiv);

        document.querySelectorAll('.close-modal-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                modalDiv.remove();
            });
        });

        modalDiv.addEventListener('click', (e) => {
            if (e.target === modalDiv) {
                modalDiv.remove();
            }
        });
    }

    // --- Filter Handlers ---
    chips.forEach(chip => {
        chip.addEventListener('click', () => {
            chips.forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            activeCategory = chip.getAttribute('data-category');
            renderOpportunities();
        });
    });

    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            searchQuery = e.target.value.toLowerCase().trim();
            renderOpportunities();
        });
    }

    // Load opportunities from Firebase on page load
    loadOpportunitiesFromFirebase();
});
