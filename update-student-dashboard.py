import sys
import re

with open('c:\\dev\\edupath_lanka\\student-dashboard.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update the imports
old_import_pattern = r'import\s*\{\s*buildStudentRecommendationProfile[^}]+\}\s*from\s*"./recommendation-engine.js";'
new_import = 'import { buildStudentRecommendationProfile, recommendCourses, recommendScholarships, recommendMentors, recommendInstitutes, recommendTalentOpportunities, debugStudentProfile } from "./recommendation-engine.js";'
content = re.sub(old_import_pattern, new_import, content)

# 2. Add the dynamic sidebar injection to updatePathwayAwareSidebar
sidebar_injection = """
    const path = state.student?.pathwayPreference || "undecided";
    let sidebarHtml = "";
    if (path === "academic") {
        sidebarHtml = `
            <li class="sidebar-section-label"><span>MY RECOMMENDATIONS</span></li>
            <li><a href="#recommended-courses" data-section="recommended-courses-section" class="student-nav-item"><i class="fas fa-book-open"></i><span class="sidebar-label">My Recommended Courses</span></a></li>
            <li><a href="#scholarships" data-section="scholarships-section" class="student-nav-item"><i class="fas fa-award"></i><span class="sidebar-label">My Scholarships</span></a></li>
            <li><a href="#mentors" data-section="mentors-section" class="student-nav-item"><i class="fas fa-user-group"></i><span class="sidebar-label">My Mentors</span></a></li>
            <li><a href="#recommended-institutes" data-section="recommended-institutes-section" class="student-nav-item"><i class="fas fa-university"></i><span class="sidebar-label">My Institutes</span></a></li>
        `;
    } else if (path === "talent") {
        sidebarHtml = `
            <li class="sidebar-section-label"><span>MY RECOMMENDATIONS</span></li>
            <li><a href="#recommended-talent-opportunities" data-section="recommended-talent-opportunities-section" class="student-nav-item"><i class="fas fa-star"></i><span class="sidebar-label">My Talent Opportunities</span></a></li>
            <li><a href="#mentors" data-section="mentors-section" class="student-nav-item"><i class="fas fa-user-group"></i><span class="sidebar-label">My Talent Mentors</span></a></li>
            <li><a href="#recommended-courses" data-section="recommended-courses-section" class="student-nav-item"><i class="fas fa-book-open"></i><span class="sidebar-label">My Skill Courses</span></a></li>
            <li><a href="#scholarships" data-section="scholarships-section" class="student-nav-item"><i class="fas fa-award"></i><span class="sidebar-label">My Talent Scholarships</span></a></li>
            <li><a href="#recommended-institutes" data-section="recommended-institutes-section" class="student-nav-item"><i class="fas fa-university"></i><span class="sidebar-label">My Institutes / Academies</span></a></li>
        `;
    } else if (path === "combined") {
        sidebarHtml = `
            <li class="sidebar-section-label"><span>MY RECOMMENDATIONS</span></li>
            <li><a href="#combined-recommendations" data-section="combined-recommendations-section" class="student-nav-item"><i class="fas fa-layer-group"></i><span class="sidebar-label">Academic + Talent</span></a></li>
            <li><a href="#mentors" data-section="mentors-section" class="student-nav-item"><i class="fas fa-user-group"></i><span class="sidebar-label">My Mentors</span></a></li>
            <li><a href="#recommended-institutes" data-section="recommended-institutes-section" class="student-nav-item"><i class="fas fa-university"></i><span class="sidebar-label">My Institutes</span></a></li>
        `;
    } else if (path === "academic_improvement") {
        sidebarHtml = `
            <li class="sidebar-section-label"><span>SUPPORT RECOMMENDATIONS</span></li>
            <li><a href="#recommended-courses" data-section="recommended-courses-section" class="student-nav-item"><i class="fas fa-book-open"></i><span class="sidebar-label">Support Courses</span></a></li>
            <li><a href="#scholarships" data-section="scholarships-section" class="student-nav-item"><i class="fas fa-award"></i><span class="sidebar-label">Support Scholarships</span></a></li>
            <li><a href="#mentors" data-section="mentors-section" class="student-nav-item"><i class="fas fa-user-group"></i><span class="sidebar-label">Study Mentors</span></a></li>
            <li><a href="#recommended-institutes" data-section="recommended-institutes-section" class="student-nav-item"><i class="fas fa-university"></i><span class="sidebar-label">Support Institutes</span></a></li>
        `;
    } else {
        sidebarHtml = `
            <li class="sidebar-section-label"><span>EXPLORE OPTIONS</span></li>
            <li><a href="#explore-recommendations" data-section="explore-recommendations-section" class="student-nav-item"><i class="fas fa-search"></i><span class="sidebar-label">Explore Suggestions</span></a></li>
            <li><a href="#mentors" data-section="mentors-section" class="student-nav-item"><i class="fas fa-user-group"></i><span class="sidebar-label">Guidance Mentors</span></a></li>
            <li><a href="#recommended-courses" data-section="recommended-courses-section" class="student-nav-item"><i class="fas fa-book-open"></i><span class="sidebar-label">Beginner Courses</span></a></li>
            <li><a href="#scholarships" data-section="scholarships-section" class="student-nav-item"><i class="fas fa-award"></i><span class="sidebar-label">Scholarships</span></a></li>
        `;
    }
    const sb = document.getElementById("dynamic-recommendations-sidebar");
    if (sb) sb.innerHTML = sidebarHtml;
    // Rebind navigation
    sb?.querySelectorAll('.student-nav-item').forEach(link => {
        link.addEventListener('click', (e) => {
            if (link.dataset.section) {
                e.preventDefault();
                showDashboardSection(link.dataset.section);
            }
        });
    });
"""

# Inject this at the end of updatePathwayAwareSidebar
content = content.replace('function updatePathwayAwareSidebar() {', 'function updatePathwayAwareSidebar() {' + sidebar_injection)

# 3. Rewrite recalculateStudentRecommendations to call renderPersonalizedRecommendations
new_recalculate = """function recalculateStudentRecommendations({ updateCourses, updateScholarships, updateMentors }) {
    renderPersonalizedRecommendations();
}"""
content = re.sub(r'function recalculateStudentRecommendations[^}]+\}', new_recalculate, content)

# 4. Remove old scoreCourse, scoreScholarship, scoreMentor functions if they exist
content = re.sub(r'function scoreCourse\([^)]*\)\s*\{[^}]*\}', '', content)
content = re.sub(r'function scoreScholarship\([^)]*\)\s*\{[^}]*\}', '', content)
content = re.sub(r'function scoreMentor\([^)]*\)\s*\{[^}]*\}', '', content)

# 5. Append renderPersonalizedRecommendations and card rendering functions
render_funcs = """

window.renderPersonalizedRecommendations = function() {
    const profile = buildStudentRecommendationProfile({
        user: state.user,
        student: state.student,
        personal: state.personalProfile,
        academic: state.academicProfile,
        talent: state.talentProfile,
        discovery: state.discoveryProfile,
        latestPathwayResult: state.currentResult
    });

    const recommendedCourses = recommendCourses(profile, state.courses);
    const recommendedScholarships = recommendScholarships(profile, state.scholarships);
    const recommendedMentors = recommendMentors(profile, state.mentors);
    const recommendedTalentOpportunities = recommendTalentOpportunities(profile, {
        ...state.talentOpportunities,
        ...state.artsOpportunities,
        ...state.sportsOpportunities
    });
    const recommendedInstitutes = recommendInstitutes(
        profile,
        state.institutes,
        state.courses,
        { ...state.talentOpportunities, ...state.artsOpportunities, ...state.sportsOpportunities },
        state.scholarships
    );

    const path = profile.pathwayPreference;
    let summaryHtml = "";
    
    if (path === "academic") {
        summaryHtml = `
            <div class="card glass" style="margin-bottom: 2rem;">
                <h2>Recommendations for Your Academic Path</h2>
                <div style="display:flex; gap: 1rem; flex-wrap:wrap; margin-top:1rem;">
                    <span class="badge">Courses: ${recommendedCourses.length}</span>
                    <span class="badge">Scholarships: ${recommendedScholarships.length}</span>
                    <span class="badge">Mentors: ${recommendedMentors.length}</span>
                    <span class="badge">Institutes: ${recommendedInstitutes.length}</span>
                </div>
            </div>
        `;
        document.getElementById("recommended-courses-list").innerHTML = recommendedCourses.length ? recommendedCourses.map(c => personalizedCardHtml(c)).join('') : emptyStateHtml("No academic recommendations found yet. Please complete your Academic Profile.", "#academic-profile");
        document.getElementById("scholarships-list").innerHTML = recommendedScholarships.length ? recommendedScholarships.map(s => personalizedCardHtml(s)).join('') : emptyStateHtml("No scholarships found.", "#academic-profile");
        document.getElementById("mentors-list").innerHTML = recommendedMentors.length ? recommendedMentors.map(m => personalizedCardHtml(m)).join('') : emptyStateHtml("No mentors found.", "#academic-profile");
        document.getElementById("recommended-institutes-list").innerHTML = recommendedInstitutes.length ? recommendedInstitutes.map(i => personalizedCardHtml(i)).join('') : emptyStateHtml("No institutes found.", "#academic-profile");
    } else if (path === "talent") {
        summaryHtml = `
            <div class="card glass" style="margin-bottom: 2rem;">
                <h2>Recommendations for Your Talent Path</h2>
                <div style="display:flex; gap: 1rem; flex-wrap:wrap; margin-top:1rem;">
                    <span class="badge">Talent Opportunities: ${recommendedTalentOpportunities.length}</span>
                    <span class="badge">Mentors: ${recommendedMentors.length}</span>
                    <span class="badge">Institutes / Academies: ${recommendedInstitutes.length}</span>
                    <span class="badge">Skill Courses: ${recommendedCourses.length}</span>
                    <span class="badge">Talent Scholarships: ${recommendedScholarships.length}</span>
                </div>
            </div>
        `;
        document.getElementById("recommended-talent-opportunities-list").innerHTML = recommendedTalentOpportunities.length ? recommendedTalentOpportunities.map(t => personalizedCardHtml(t)).join('') : emptyStateHtml("No talent recommendations found yet. Please complete your Talent Profile.", "#talent-profile");
        document.getElementById("mentors-list").innerHTML = recommendedMentors.length ? recommendedMentors.map(m => personalizedCardHtml(m)).join('') : emptyStateHtml("No mentors found.", "#talent-profile");
        document.getElementById("recommended-courses-list").innerHTML = recommendedCourses.length ? recommendedCourses.map(c => personalizedCardHtml(c)).join('') : emptyStateHtml("No courses found.", "#talent-profile");
        document.getElementById("scholarships-list").innerHTML = recommendedScholarships.length ? recommendedScholarships.map(s => personalizedCardHtml(s)).join('') : emptyStateHtml("No scholarships found.", "#talent-profile");
        document.getElementById("recommended-institutes-list").innerHTML = recommendedInstitutes.length ? recommendedInstitutes.map(i => personalizedCardHtml(i)).join('') : emptyStateHtml("No institutes found.", "#talent-profile");
    } else if (path === "combined") {
        summaryHtml = `
            <div class="card glass" style="margin-bottom: 2rem;">
                <h2>Recommendations for Your Academic + Talent Path</h2>
                <div style="display:flex; gap: 1rem; flex-wrap:wrap; margin-top:1rem;">
                    <span class="badge">Courses: ${recommendedCourses.length}</span>
                    <span class="badge">Talent Opps: ${recommendedTalentOpportunities.length}</span>
                    <span class="badge">Mentors: ${recommendedMentors.length}</span>
                </div>
            </div>
        `;
        document.getElementById("combined-recommendations-list").innerHTML = `
            <h3>Academic Matches</h3>
            <div class="cards-grid" style="margin-bottom:2rem;">${recommendedCourses.length ? recommendedCourses.map(c => personalizedCardHtml(c)).join('') : emptyStateHtml("No courses found.", "#academic-profile")}</div>
            <h3>Talent Matches</h3>
            <div class="cards-grid" style="margin-bottom:2rem;">${recommendedTalentOpportunities.length ? recommendedTalentOpportunities.map(t => personalizedCardHtml(t)).join('') : emptyStateHtml("No talent opportunities found.", "#talent-profile")}</div>
        `;
        document.getElementById("mentors-list").innerHTML = recommendedMentors.length ? recommendedMentors.map(m => personalizedCardHtml(m)).join('') : emptyStateHtml("No mentors found.", "#academic-profile");
        document.getElementById("recommended-institutes-list").innerHTML = recommendedInstitutes.length ? recommendedInstitutes.map(i => personalizedCardHtml(i)).join('') : emptyStateHtml("No institutes found.", "#academic-profile");
    } else if (path === "academic_improvement") {
        summaryHtml = `
            <div class="card glass" style="margin-bottom: 2rem;">
                <h2>Support Recommendations for Your Improvement Path</h2>
                <div style="display:flex; gap: 1rem; flex-wrap:wrap; margin-top:1rem;">
                    <span class="badge">Support Courses: ${recommendedCourses.length}</span>
                    <span class="badge">Scholarships: ${recommendedScholarships.length}</span>
                    <span class="badge">Study Mentors: ${recommendedMentors.length}</span>
                </div>
            </div>
        `;
        document.getElementById("recommended-courses-list").innerHTML = recommendedCourses.length ? recommendedCourses.map(c => personalizedCardHtml(c)).join('') : emptyStateHtml("No courses found.", "#academic-profile");
        document.getElementById("scholarships-list").innerHTML = recommendedScholarships.length ? recommendedScholarships.map(s => personalizedCardHtml(s)).join('') : emptyStateHtml("No scholarships found.", "#academic-profile");
        document.getElementById("mentors-list").innerHTML = recommendedMentors.length ? recommendedMentors.map(m => personalizedCardHtml(m)).join('') : emptyStateHtml("No mentors found.", "#academic-profile");
        document.getElementById("recommended-institutes-list").innerHTML = recommendedInstitutes.length ? recommendedInstitutes.map(i => personalizedCardHtml(i)).join('') : emptyStateHtml("No institutes found.", "#academic-profile");
    } else {
        summaryHtml = `
            <div class="card glass" style="margin-bottom: 2rem;">
                <h2>Explore Suggestions Based on Your Discovery Profile</h2>
            </div>
        `;
        document.getElementById("explore-recommendations-list").innerHTML = recommendedCourses.length || recommendedTalentOpportunities.length ? 
            [...recommendedCourses, ...recommendedTalentOpportunities].map(c => personalizedCardHtml(c)).join('') : 
            emptyStateHtml("Complete your Discovery Profile to receive exploration suggestions.", "#discovery-profile");
        document.getElementById("mentors-list").innerHTML = recommendedMentors.length ? recommendedMentors.map(m => personalizedCardHtml(m)).join('') : emptyStateHtml("No mentors found.", "#discovery-profile");
        document.getElementById("recommended-courses-list").innerHTML = recommendedCourses.length ? recommendedCourses.map(c => personalizedCardHtml(c)).join('') : emptyStateHtml("No courses found.", "#discovery-profile");
        document.getElementById("scholarships-list").innerHTML = recommendedScholarships.length ? recommendedScholarships.map(s => personalizedCardHtml(s)).join('') : emptyStateHtml("No scholarships found.", "#discovery-profile");
    }

    const summaryContainer = document.getElementById("dynamic-recommendation-summary");
    if (summaryContainer) summaryContainer.innerHTML = summaryHtml;
}

function personalizedCardHtml(item) {
    const reasons = item.matchReasons && item.matchReasons.length > 0 ? item.matchReasons : ["Matched with your selected pathway and profile information."];
    const missingHtml = item.missingRequirements && item.missingRequirements.length > 0 ? `<li><i class="fas fa-exclamation-triangle text-warning"></i> Missing: ${escapeHtml(item.missingRequirements.join(', '))}</li>` : '';
    const statusHtml = item.eligibilityStatus ? `<br><small>Status: ${escapeHtml(item.eligibilityStatus)}</small>` : '';

    return `
    <div class="card glass recommendation-card">
        <h3>${escapeHtml(item.title || item.name || item.courseName || item.scholarshipName || item.instituteName || item.mentorName || 'Opportunity')}</h3>
        <p class="match-score text-success"><i class="fas fa-check-circle"></i> ${escapeHtml(item.matchLevel || 'Match')} &middot; ${item.matchScore}%</p>
        ${statusHtml}
        <div class="reasons" style="margin-top: 1rem; font-size: 0.9rem;">
            <strong>Why this matches:</strong>
            <ul style="padding-left: 1.5rem; margin-top: 0.5rem; color: var(--text-secondary);">
                ${reasons.map(r => `<li>${escapeHtml(r)}</li>`).join('')}
                ${missingHtml}
            </ul>
        </div>
        <div class="card-actions" style="margin-top: 1.5rem;">
            <button class="btn btn-outline" onclick="alert('View Details clicked')">View Details</button>
            <button class="btn btn-primary" onclick="alert('Action clicked')">Action</button>
        </div>
    </div>
    `;
}

function emptyStateHtml(msg, link) {
    return `
        <div class="empty-state glass">
            <i class="fas fa-search" style="font-size: 3rem; color: var(--border-color); margin-bottom: 1rem;"></i>
            <p>${escapeHtml(msg)}</p>
            <button class="btn btn-primary" onclick="showDashboardSection('${link.replace('#', '')}-section')" style="margin-top: 1rem;">Update Profile</button>
        </div>
    `;
}
"""

content += render_funcs

with open('c:\\dev\\edupath_lanka\\student-dashboard.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated student-dashboard.js")
