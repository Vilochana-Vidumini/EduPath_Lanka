import sys
import codecs
import re

with codecs.open('c:/dev/edupath_lanka/student-dashboard.js', 'r', encoding='utf-8', errors='ignore') as f:
    content = f.read()

# 1. Update Profile Completion Logic
old_completion = """function getProfileCompletionPercentage() {
    const completed = profileFields.filter(([key, , source]) => hasValue(source === "user" ? state.user[key] : state.student[key]));
    return Math.round((completed.length / profileFields.length) * 100);
}"""

new_completion = """function getProfileCompletionPercentage() {
    const path = (state.currentResult && state.currentResult.recommendedPathway) ? state.currentResult.recommendedPathway : (state.student.pathwayPreference || "undecided");
    
    let requiredProfiles = ["personal"];
    if (path === "talent") requiredProfiles = ["personal", "talent"];
    else if (path === "academic" || path === "academic_improvement") requiredProfiles = ["personal", "academic"];
    else if (path === "combined") requiredProfiles = ["personal", "academic", "talent"];
    else requiredProfiles = ["personal", "discovery"];

    // Count how many keys from required profiles have data
    let totalKeys = 0;
    let filledKeys = 0;

    // Use profileFields array mapping which has ['key', 'Label', 'source']
    // Wait, profileFields doesn't distinguish between academic vs talent fields. 
    // Instead we can just check state.personalProfile, state.academicProfile, etc directly.
    const profiles = {
        "personal": Object.keys(state.personalProfile || {}).length > 2,
        "academic": Object.keys(state.academicProfile || {}).length > 2,
        "talent": Object.keys(state.talentProfile || {}).length > 2,
        "discovery": Object.keys(state.discoveryProfile || {}).length > 2
    };

    let completed = 0;
    requiredProfiles.forEach(p => { if (profiles[p]) completed++; });
    return requiredProfiles.length ? Math.round((completed / requiredProfiles.length) * 100) : 0;
}"""
content = content.replace(old_completion, new_completion)

# Wait, `getProfileCompletionPercentage` doesn't need to be replaced if we just use the existing one but filter it.
# Actually let's just make it simpler.
content = re.sub(
    r'function getProfileCompletionPercentage\(\) \{[\s\S]*?return Math.round.*?\n\}', 
    new_completion, 
    content
)

# 2. Update renderFocusToday
# I'll just leave `renderFocusToday` mostly intact but hook into the dashboard generation.

# 3. Completely replace window.renderPersonalizedRecommendations and its helpers.
# We'll just slice the file before the first `window.renderPersonalizedRecommendations` and append the new version.
idx = content.find('window.renderPersonalizedRecommendations = function() {')
if idx != -1:
    content = content[:idx]

new_render_logic = """
window.renderPersonalizedRecommendations = function() {
    const profile = buildSharedRecommendationProfile({
        user: state.user,
        student: state.student,
        personal: state.personalProfile,
        academic: state.academicProfile,
        talent: state.talentProfile,
        discovery: state.discoveryProfile,
        latestPathwayResult: state.currentResult
    });

    const allTalentOpportunities = {
        ...state.talentOpportunities,
        ...state.artsOpportunities,
        ...state.sportsOpportunities
    };

    const recommendedCourses = sharedRecommendCourses(profile, state.courses);
    const recommendedScholarships = sharedRecommendScholarships(profile, state.scholarships);
    const recommendedMentors = sharedRecommendMentors(profile, state.mentors, state.uid);
    const recommendedInstitutes = recommendInstitutes(
        profile,
        state.institutes,
        state.courses,
        allTalentOpportunities,
        state.scholarships
    );
    const recommendedTalentOpportunities = recommendTalentOpportunities(profile, allTalentOpportunities);

    const path = profile.pathwayPreference || "undecided";

    if (localStorage.getItem("debugRecommendations") === "true") {
        console.log("=== DEBUG RECOMMENDATIONS ===");
        console.log("Selected Pathway:", path);
        console.log("Normalized Profile:", profile);
        console.log("Counts - Courses:", recommendedCourses.length, "Scholarships:", recommendedScholarships.length, "Mentors:", recommendedMentors.length, "Institutes:", recommendedInstitutes.length, "Talent:", recommendedTalentOpportunities.length);
        console.log("Top 5 Courses:", recommendedCourses.slice(0, 5));
        console.log("Top 5 Talent Opps:", recommendedTalentOpportunities.slice(0, 5));
    }
    
    // HIDE UNNECESSARY SIDEBAR PROFILE SECTIONS
    const navAcademic = document.getElementById("nav-academic-profile");
    const navTalent = document.getElementById("nav-talent-profile");
    const navDiscovery = document.getElementById("nav-discovery-profile");
    
    if (navAcademic && navAcademic.parentElement) navAcademic.parentElement.style.display = (path === "talent" || path === "undecided") ? "none" : "";
    if (navTalent && navTalent.parentElement) navTalent.parentElement.style.display = (path === "academic" || path === "academic_improvement" || path === "undecided") ? "none" : "";
    if (navDiscovery && navDiscovery.parentElement) navDiscovery.parentElement.style.display = (path !== "undecided") ? "none" : "";

    if (localStorage.getItem("debugRecommendations") === "true") {
        console.log("Hidden Sidebar items:");
        if (navAcademic && navAcademic.parentElement.style.display === "none") console.log("- Academic Profile");
        if (navTalent && navTalent.parentElement.style.display === "none") console.log("- Talent Profile");
        if (navDiscovery && navDiscovery.parentElement.style.display === "none") console.log("- Discovery Profile");
    }

    // UPDATE SIDEBAR RECOMMENDATIONS
    let sidebarHtml = "";
    if (path === "talent") {
        sidebarHtml = `
            <li class="sidebar-section-label"><span>MY RECOMMENDATIONS</span></li>
            <li><a href="#talent-opportunities-recommendations" data-section="talent-opportunities-recommendations-section" class="student-nav-item"><i class="fas fa-star"></i><span class="sidebar-label">My Talent Opportunities</span></a></li>
            <li><a href="#talent-mentors-recommendations" data-section="talent-mentors-recommendations-section" class="student-nav-item"><i class="fas fa-user-group"></i><span class="sidebar-label">My Talent Mentors</span></a></li>
            <li><a href="#skill-courses-recommendations" data-section="skill-courses-recommendations-section" class="student-nav-item"><i class="fas fa-book-open"></i><span class="sidebar-label">My Skill Courses</span></a></li>
            <li><a href="#talent-scholarships-recommendations" data-section="talent-scholarships-recommendations-section" class="student-nav-item"><i class="fas fa-award"></i><span class="sidebar-label">My Talent Scholarships</span></a></li>
            <li><a href="#talent-institutes-recommendations" data-section="talent-institutes-recommendations-section" class="student-nav-item"><i class="fas fa-university"></i><span class="sidebar-label">My Institutes / Academies</span></a></li>
        `;
    } else if (path === "academic") {
        sidebarHtml = `
            <li class="sidebar-section-label"><span>MY RECOMMENDATIONS</span></li>
            <li><a href="#recommended-courses" data-section="recommended-courses-section" class="student-nav-item"><i class="fas fa-book-open"></i><span class="sidebar-label">My Recommended Courses</span></a></li>
            <li><a href="#scholarships" data-section="scholarships-section" class="student-nav-item"><i class="fas fa-award"></i><span class="sidebar-label">My Scholarships</span></a></li>
            <li><a href="#mentors" data-section="mentors-section" class="student-nav-item"><i class="fas fa-user-group"></i><span class="sidebar-label">My Mentors</span></a></li>
            <li><a href="#recommended-institutes" data-section="recommended-institutes-section" class="student-nav-item"><i class="fas fa-university"></i><span class="sidebar-label">My Institutes</span></a></li>
        `;
    } else if (path === "combined") {
        sidebarHtml = `
            <li class="sidebar-section-label"><span>MY RECOMMENDATIONS</span></li>
            <li><a href="#recommended-courses" data-section="recommended-courses-section" class="student-nav-item"><i class="fas fa-book-open"></i><span class="sidebar-label">My Academic Recommendations</span></a></li>
            <li><a href="#talent-opportunities-recommendations" data-section="talent-opportunities-recommendations-section" class="student-nav-item"><i class="fas fa-star"></i><span class="sidebar-label">My Talent Recommendations</span></a></li>
            <li><a href="#mentors" data-section="mentors-section" class="student-nav-item"><i class="fas fa-user-group"></i><span class="sidebar-label">My Mentors</span></a></li>
            <li><a href="#recommended-institutes" data-section="recommended-institutes-section" class="student-nav-item"><i class="fas fa-university"></i><span class="sidebar-label">My Institutes</span></a></li>
        `;
    } else if (path === "academic_improvement") {
        sidebarHtml = `
            <li class="sidebar-section-label"><span>MY RECOMMENDATIONS</span></li>
            <li><a href="#recommended-courses" data-section="recommended-courses-section" class="student-nav-item"><i class="fas fa-book-open"></i><span class="sidebar-label">Support Courses</span></a></li>
            <li><a href="#scholarships" data-section="scholarships-section" class="student-nav-item"><i class="fas fa-award"></i><span class="sidebar-label">Support Scholarships</span></a></li>
            <li><a href="#mentors" data-section="mentors-section" class="student-nav-item"><i class="fas fa-user-group"></i><span class="sidebar-label">Study Mentors</span></a></li>
            <li><a href="#recommended-institutes" data-section="recommended-institutes-section" class="student-nav-item"><i class="fas fa-university"></i><span class="sidebar-label">Support Institutes</span></a></li>
        `;
    } else {
        sidebarHtml = `
            <li class="sidebar-section-label"><span>MY RECOMMENDATIONS</span></li>
            <li><a href="#recommended-courses" data-section="recommended-courses-section" class="student-nav-item"><i class="fas fa-search"></i><span class="sidebar-label">Explore Suggestions</span></a></li>
            <li><a href="#mentors" data-section="mentors-section" class="student-nav-item"><i class="fas fa-user-group"></i><span class="sidebar-label">Guidance Mentors</span></a></li>
            <li><a href="#recommended-courses" data-section="recommended-courses-section" class="student-nav-item"><i class="fas fa-book-open"></i><span class="sidebar-label">Beginner Courses</span></a></li>
            <li><a href="#scholarships" data-section="scholarships-section" class="student-nav-item"><i class="fas fa-award"></i><span class="sidebar-label">Scholarships</span></a></li>
        `;
    }
    
    const sb = document.getElementById("dynamic-recommendations-sidebar");
    if (sb) {
        sb.innerHTML = sidebarHtml;
        sb.querySelectorAll('.student-nav-item').forEach(link => {
            link.addEventListener('click', (e) => {
                if (link.dataset.section) {
                    e.preventDefault();
                    if (typeof showDashboardSection === 'function') {
                        showDashboardSection(link.dataset.section);
                    }
                }
            });
        });
    }

    // UPDATE OVERVIEW HERO AND KPI
    const heroTitle = document.getElementById("hero-pathway-name");
    const heroSubtitle = document.getElementById("hero-pathway-score-label");
    const primaryBtn = document.querySelector(".dashboard-hero-actions .btn-primary");
    const secondaryBtn = document.querySelector(".dashboard-hero-actions .btn-outline");
    const progressList = document.getElementById("journey-progress-list");

    if (path === "talent") {
        if (heroTitle) heroTitle.textContent = "Grow your future through your talents";
        if (heroSubtitle) heroSubtitle.textContent = "Talent development path";
        if (primaryBtn) {
            primaryBtn.textContent = "View My Talent Recommendations";
            primaryBtn.onclick = () => showDashboardSection("talent-opportunities-recommendations-section");
        }
        if (secondaryBtn) {
            secondaryBtn.textContent = "Update Talent Profile";
            secondaryBtn.onclick = () => showDashboardSection("talent-profile-section");
        }
        
        // Update KPI/Journey steps for Talent Path
        if (progressList) {
            const completion = getProfileCompletionPercentage();
            const saved = Object.keys(state.savedOpportunities || {}).length;
            const requests = Object.keys(state.mentorRequests || {}).length;
            const steps = [
                { title: "Complete Talent Profile", date: "Profile", done: completion >= 80 },
                { title: "Save Talent Opportunity", date: `${saved} saved`, done: saved > 0 },
                { title: "Request Talent Mentor", date: `${requests} requests`, done: requests > 0 },
                { title: "Apply / Register", date: "Upcoming", done: false },
                { title: "Build Portfolio", date: "Upcoming", done: false },
                { title: "Track Progress", date: "Upcoming", done: false }
            ];
            progressList.innerHTML = steps.map((step, index) => `
                <button type="button" class="journey-step ${step.done ? 'completed' : (index === Math.max(0, steps.findIndex(s => !s.done)) ? 'current' : 'upcoming')}">
                    <span>${step.done ? '<i class="fas fa-check"></i>' : index + 1}</span>
                    <strong>${escapeHtml(step.title)}</strong>
                    <small>${escapeHtml(step.date)}</small>
                </button>
            `).join("");
        }
    }

    // UPDATE OVERVIEW RECOMMENDATION CARDS
    // Hide standard overview grids for Talent Path, replace with customized ones
    const bestMatches = document.getElementById("best-matches-overview-grid");
    const extendedRecs = document.getElementById("extended-recommendations-grid");
    const talentDynamicSummary = document.getElementById("dynamic-recommendation-summary");

    if (path === "talent") {
        if (bestMatches && bestMatches.parentElement) bestMatches.parentElement.style.display = "none";
        if (extendedRecs && extendedRecs.parentElement) extendedRecs.parentElement.style.display = "none";
        
        let summaryHtml = `
            <div class="dashboard-section" style="padding-top:0;">
                <div class="section-header"><h2>My Talent Opportunities</h2><button class="btn btn-outline btn-sm" onclick="showDashboardSection('talent-opportunities-recommendations-section')">View All</button></div>
                <div class="cards-grid" style="margin-bottom:2rem;">
                    ${recommendedTalentOpportunities.slice(0,3).map(i => personalizedCardHtml(i, "talent")).join('') || emptyStateHtml("No matching talent opportunities yet.\\nComplete your Talent Profile with category, skill level, preferred opportunity types and location.", "#talent-profile", "Update Talent Profile")}
                </div>
                
                <div class="section-header"><h2>My Talent Mentors & Coaches</h2><button class="btn btn-outline btn-sm" onclick="showDashboardSection('talent-mentors-recommendations-section')">View All</button></div>
                <div class="cards-grid" style="margin-bottom:2rem;">
                    ${recommendedMentors.slice(0,3).map(i => personalizedCardHtml(i, "mentor")).join('') || emptyStateHtml("No matching talent mentors yet.\\nTry adding your talent category and preferred mentor type.", "#talent-profile", "Update Talent Profile")}
                </div>

                <div class="section-header"><h2>My Skill Courses</h2><button class="btn btn-outline btn-sm" onclick="showDashboardSection('skill-courses-recommendations-section')">View All</button></div>
                <div class="cards-grid" style="margin-bottom:2rem;">
                    ${recommendedCourses.slice(0,3).map(i => personalizedCardHtml(i, "course")).join('') || emptyStateHtml("No matching skill courses yet.\\nAdd specific skills or preferred course types to improve recommendations.", "#talent-profile", "Update Talent Profile")}
                </div>
                
                <div class="section-header"><h2>My Talent Scholarships</h2><button class="btn btn-outline btn-sm" onclick="showDashboardSection('talent-scholarships-recommendations-section')">View All</button></div>
                <div class="cards-grid" style="margin-bottom:2rem;">
                    ${recommendedScholarships.slice(0,3).map(i => personalizedCardHtml(i, "scholarship")).join('') || emptyStateHtml("No scholarships found.", "#talent-profile", "Update Talent Profile")}
                </div>
                
                <div class="section-header"><h2>My Institutes & Academies</h2><button class="btn btn-outline btn-sm" onclick="showDashboardSection('talent-institutes-recommendations-section')">View All</button></div>
                <div class="cards-grid" style="margin-bottom:2rem;">
                    ${recommendedInstitutes.slice(0,3).map(i => personalizedCardHtml(i, "institute")).join('') || emptyStateHtml("No matching academies or institutes yet.\\nMore institute and academy data is needed.", "#talent-profile", "Update Talent Profile")}
                </div>
            </div>
        `;
        if (talentDynamicSummary) talentDynamicSummary.innerHTML = summaryHtml;
    } else {
        if (bestMatches && bestMatches.parentElement) bestMatches.parentElement.style.display = "";
        if (extendedRecs && extendedRecs.parentElement) extendedRecs.parentElement.style.display = "";
        if (talentDynamicSummary) talentDynamicSummary.innerHTML = "";
    }

    // POPULATE ALL LISTS FOR TALENT PATH
    setTimeout(() => {
        if (path === "talent") {
            const listOpp = document.getElementById("talent-opportunities-recommendations-list");
            if (listOpp) listOpp.innerHTML = recommendedTalentOpportunities.length ? recommendedTalentOpportunities.map(i => personalizedCardHtml(i, "talent")).join('') : emptyStateHtml("No matching talent opportunities yet.", "#talent-profile");
            
            const listMen = document.getElementById("talent-mentors-recommendations-list");
            if (listMen) listMen.innerHTML = recommendedMentors.length ? recommendedMentors.map(i => personalizedCardHtml(i, "mentor")).join('') : emptyStateHtml("No matching talent mentors yet.", "#talent-profile");
            
            const listCou = document.getElementById("skill-courses-recommendations-list");
            if (listCou) listCou.innerHTML = recommendedCourses.length ? recommendedCourses.map(i => personalizedCardHtml(i, "course")).join('') : emptyStateHtml("No matching skill courses yet.", "#talent-profile");
            
            const listSch = document.getElementById("talent-scholarships-recommendations-list");
            if (listSch) listSch.innerHTML = recommendedScholarships.length ? recommendedScholarships.map(i => personalizedCardHtml(i, "scholarship")).join('') : emptyStateHtml("No scholarships found.", "#talent-profile");
            
            const listIns = document.getElementById("talent-institutes-recommendations-list");
            if (listIns) listIns.innerHTML = recommendedInstitutes.length ? recommendedInstitutes.map(i => personalizedCardHtml(i, "institute")).join('') : emptyStateHtml("No matching academies or institutes yet.", "#talent-profile");
        } else {
            // Populate generic path lists as fallback
            const listC = document.getElementById("recommended-courses-list");
            if (listC) listC.innerHTML = recommendedCourses.length ? recommendedCourses.map(c => personalizedCardHtml(c, "course")).join('') : emptyStateHtml("No recommendations found.", "#academic-profile");
        }
    }, 50);
}

function personalizedCardHtml(item, type) {
    const reasons = item.matchReasons && item.matchReasons.length > 0 ? item.matchReasons : ["Matched with your selected pathway and profile information."];
    const missingHtml = item.missingRequirements && item.missingRequirements.length > 0 ? `<li><i class="fas fa-exclamation-triangle text-warning"></i> Missing: ${escapeHtml(item.missingRequirements.join(', '))}</li>` : '';
    
    let typeLabel = "Opportunity";
    let title = item.title || item.name || "Opportunity";
    let primaryAction = "View Details";
    let secondaryAction = "Save";
    
    if (type === "course") { typeLabel = "Skill Course"; title = item.courseName || title; }
    else if (type === "scholarship") { typeLabel = "Talent Scholarship"; title = item.scholarshipName || title; }
    else if (type === "mentor") { typeLabel = "Coach / Mentor"; title = item.mentorName || title; secondaryAction = "Request Mentor"; }
    else if (type === "institute") { typeLabel = "Academy / Institute"; title = item.instituteName || title; secondaryAction = "Visit"; }
    else if (type === "talent") { typeLabel = "Talent Opportunity"; primaryAction = "Apply / View"; secondaryAction = "Save Opportunity"; }

    let imgHtml = '';
    const url = item.imageUrl || item.image || item.photoUrl || item.photoURL;
    if (url) {
        imgHtml = `<div class="card-image-wrapper" style="height:150px;overflow:hidden;border-radius:var(--radius) var(--radius) 0 0;margin:-1.5rem -1.5rem 1rem -1.5rem;">
            <img src="${escapeHtml(url)}" style="width:100%;height:100%;object-fit:cover;" alt="Image" onerror="this.style.display='none'">
        </div>`;
    }

    return `
    <div class="card glass recommendation-card">
        ${imgHtml}
        <small class="text-secondary">${typeLabel}</small>
        <h3>${escapeHtml(title)}</h3>
        <p class="match-score text-success"><i class="fas fa-check-circle"></i> ${escapeHtml(item.matchLevel || 'Match')} &middot; ${item.matchScore || 0}%</p>
        <div class="reasons" style="margin-top: 1rem; font-size: 0.9rem;">
            <strong>Why this matches:</strong>
            <ul style="padding-left: 1.5rem; margin-top: 0.5rem; color: var(--text-secondary);">
                ${reasons.map(r => `<li>${escapeHtml(r)}</li>`).join('')}
                ${missingHtml}
            </ul>
        </div>
        <div class="card-actions" style="margin-top: 1.5rem;">
            <button class="btn btn-outline" onclick="alert('View Details clicked')">${escapeHtml(primaryAction)}</button>
            <button class="btn btn-primary" onclick="alert('${escapeHtml(secondaryAction)} clicked')">${escapeHtml(secondaryAction)}</button>
        </div>
    </div>
    `;
}

function emptyStateHtml(msg, link, btnLabel="Update Profile") {
    return `
        <div class="empty-state glass" style="width: 100%; grid-column: 1 / -1;">
            <i class="fas fa-search" style="font-size: 3rem; color: var(--border-color); margin-bottom: 1rem;"></i>
            <p>${escapeHtml(msg).replace(/\\n/g, '<br>')}</p>
            <button class="btn btn-primary" onclick="showDashboardSection('${link.replace('#', '')}-section')" style="margin-top: 1rem;">${escapeHtml(btnLabel)}</button>
        </div>
    `;
}
"""

content += new_render_logic

with codecs.open('c:/dev/edupath_lanka/student-dashboard.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("Updated JS file.")
