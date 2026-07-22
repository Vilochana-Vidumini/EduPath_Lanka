import sys
import codecs

try:
    with codecs.open('c:/dev/edupath_lanka/student-dashboard.js', 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()

    old_import = 'import { buildStudentRecommendationProfile as buildSharedRecommendationProfile, scoreCourseRecommendation, scoreScholarshipRecommendation, scoreMentorRecommendation, recommendCourses as sharedRecommendCourses, recommendScholarships as sharedRecommendScholarships, recommendMentors as sharedRecommendMentors, recommendInstitutes, recommendTalentOpportunities, debugStudentProfile } from "./recommendation-engine.js";'
    new_import = 'import { buildStudentRecommendationProfile, recommendCourses, recommendScholarships, recommendMentors, recommendInstitutes, recommendTalentOpportunities, debugStudentProfile } from "./recommendation-engine.js";'
    content = content.replace(old_import, new_import)

    old_recalc = 'function recalculateStudentRecommendations({ updateCourses, updateScholarships, updateMentors }) {\n    if (updateCourses && typeof renderCourses === "function") renderCourses();\n    if (updateScholarships && typeof renderScholarships === "function") renderScholarships();\n    if (updateMentors && typeof renderMentors === "function") renderMentors();\n    if (typeof renderStudentOverview === "function") renderStudentOverview();\n    if (typeof scheduleRecommendationSave === "function") scheduleRecommendationSave();\n}'
    new_recalc = 'function recalculateStudentRecommendations({ updateCourses, updateScholarships, updateMentors }) {\n    if (typeof renderPersonalizedRecommendations === "function") renderPersonalizedRecommendations();\n    if (typeof renderStudentOverview === "function") renderStudentOverview();\n    if (typeof scheduleRecommendationSave === "function") scheduleRecommendationSave();\n}'
    content = content.replace(old_recalc, new_recalc)

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

    const path = profile.pathwayPreference || "undecided";
    
    // UPDATE SIDEBAR
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

    // UPDATE OVERVIEW SUMMARY
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
            <div id="recommended-courses-list" class="cards-grid" style="margin-bottom:2rem;"></div>
            <div id="scholarships-list" class="cards-grid" style="margin-bottom:2rem;"></div>
            <div id="mentors-list" class="cards-grid" style="margin-bottom:2rem;"></div>
            <div id="recommended-institutes-list" class="cards-grid" style="margin-bottom:2rem;"></div>
        `;
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
            <div id="recommended-talent-opportunities-list" class="cards-grid" style="margin-bottom:2rem;"></div>
            <div id="mentors-list" class="cards-grid" style="margin-bottom:2rem;"></div>
            <div id="recommended-courses-list" class="cards-grid" style="margin-bottom:2rem;"></div>
            <div id="scholarships-list" class="cards-grid" style="margin-bottom:2rem;"></div>
            <div id="recommended-institutes-list" class="cards-grid" style="margin-bottom:2rem;"></div>
        `;
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
            <div id="combined-recommendations-list" class="cards-grid" style="margin-bottom:2rem;"></div>
            <div id="mentors-list" class="cards-grid" style="margin-bottom:2rem;"></div>
            <div id="recommended-institutes-list" class="cards-grid" style="margin-bottom:2rem;"></div>
        `;
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
            <div id="recommended-courses-list" class="cards-grid" style="margin-bottom:2rem;"></div>
            <div id="scholarships-list" class="cards-grid" style="margin-bottom:2rem;"></div>
            <div id="mentors-list" class="cards-grid" style="margin-bottom:2rem;"></div>
            <div id="recommended-institutes-list" class="cards-grid" style="margin-bottom:2rem;"></div>
        `;
    } else {
        summaryHtml = `
            <div class="card glass" style="margin-bottom: 2rem;">
                <h2>Explore Suggestions Based on Your Discovery Profile</h2>
            </div>
            <div id="explore-recommendations-list" class="cards-grid" style="margin-bottom:2rem;"></div>
            <div id="mentors-list" class="cards-grid" style="margin-bottom:2rem;"></div>
            <div id="recommended-courses-list" class="cards-grid" style="margin-bottom:2rem;"></div>
            <div id="scholarships-list" class="cards-grid" style="margin-bottom:2rem;"></div>
        `;
    }
    const summaryContainer = document.getElementById("dynamic-recommendation-summary");
    if (summaryContainer) summaryContainer.innerHTML = summaryHtml;

    // POPULATE LISTS
    setTimeout(() => {
        if (path === "academic") {
            const listC = document.getElementById("recommended-courses-list");
            if (listC) listC.innerHTML = recommendedCourses.length ? recommendedCourses.map(c => personalizedCardHtml(c)).join('') : emptyStateHtml("No academic recommendations found yet. Please complete your Academic Profile.", "#academic-profile");
            const listS = document.getElementById("scholarships-list");
            if (listS) listS.innerHTML = recommendedScholarships.length ? recommendedScholarships.map(s => personalizedCardHtml(s)).join('') : emptyStateHtml("No scholarships found.", "#academic-profile");
            const listM = document.getElementById("mentors-list");
            if (listM) listM.innerHTML = recommendedMentors.length ? recommendedMentors.map(m => personalizedCardHtml(m)).join('') : emptyStateHtml("No mentors found.", "#academic-profile");
            const listI = document.getElementById("recommended-institutes-list");
            if (listI) listI.innerHTML = recommendedInstitutes.length ? recommendedInstitutes.map(i => personalizedCardHtml(i)).join('') : emptyStateHtml("No institutes found.", "#academic-profile");
        } else if (path === "talent") {
            const listT = document.getElementById("recommended-talent-opportunities-list");
            if (listT) listT.innerHTML = recommendedTalentOpportunities.length ? recommendedTalentOpportunities.map(t => personalizedCardHtml(t)).join('') : emptyStateHtml("No talent recommendations found yet. Please complete your Talent Profile.", "#talent-profile");
            const listM = document.getElementById("mentors-list");
            if (listM) listM.innerHTML = recommendedMentors.length ? recommendedMentors.map(m => personalizedCardHtml(m)).join('') : emptyStateHtml("No mentors found.", "#talent-profile");
            const listC = document.getElementById("recommended-courses-list");
            if (listC) listC.innerHTML = recommendedCourses.length ? recommendedCourses.map(c => personalizedCardHtml(c)).join('') : emptyStateHtml("No courses found.", "#talent-profile");
            const listS = document.getElementById("scholarships-list");
            if (listS) listS.innerHTML = recommendedScholarships.length ? recommendedScholarships.map(s => personalizedCardHtml(s)).join('') : emptyStateHtml("No scholarships found.", "#talent-profile");
            const listI = document.getElementById("recommended-institutes-list");
            if (listI) listI.innerHTML = recommendedInstitutes.length ? recommendedInstitutes.map(i => personalizedCardHtml(i)).join('') : emptyStateHtml("No institutes found.", "#talent-profile");
        } else if (path === "combined") {
            const listCombined = document.getElementById("combined-recommendations-list");
            if (listCombined) {
                listCombined.innerHTML = `
                    <h3>Academic Matches</h3>
                    <div class="cards-grid" style="margin-bottom:2rem;">${recommendedCourses.length ? recommendedCourses.map(c => personalizedCardHtml(c)).join('') : emptyStateHtml("No courses found.", "#academic-profile")}</div>
                    <h3>Talent Matches</h3>
                    <div class="cards-grid" style="margin-bottom:2rem;">${recommendedTalentOpportunities.length ? recommendedTalentOpportunities.map(t => personalizedCardHtml(t)).join('') : emptyStateHtml("No talent opportunities found.", "#talent-profile")}</div>
                `;
            }
            const listM = document.getElementById("mentors-list");
            if (listM) listM.innerHTML = recommendedMentors.length ? recommendedMentors.map(m => personalizedCardHtml(m)).join('') : emptyStateHtml("No mentors found.", "#academic-profile");
            const listI = document.getElementById("recommended-institutes-list");
            if (listI) listI.innerHTML = recommendedInstitutes.length ? recommendedInstitutes.map(i => personalizedCardHtml(i)).join('') : emptyStateHtml("No institutes found.", "#academic-profile");
        } else if (path === "academic_improvement") {
            const listC = document.getElementById("recommended-courses-list");
            if (listC) listC.innerHTML = recommendedCourses.length ? recommendedCourses.map(c => personalizedCardHtml(c)).join('') : emptyStateHtml("No courses found.", "#academic-profile");
            const listS = document.getElementById("scholarships-list");
            if (listS) listS.innerHTML = recommendedScholarships.length ? recommendedScholarships.map(s => personalizedCardHtml(s)).join('') : emptyStateHtml("No scholarships found.", "#academic-profile");
            const listM = document.getElementById("mentors-list");
            if (listM) listM.innerHTML = recommendedMentors.length ? recommendedMentors.map(m => personalizedCardHtml(m)).join('') : emptyStateHtml("No mentors found.", "#academic-profile");
            const listI = document.getElementById("recommended-institutes-list");
            if (listI) listI.innerHTML = recommendedInstitutes.length ? recommendedInstitutes.map(i => personalizedCardHtml(i)).join('') : emptyStateHtml("No institutes found.", "#academic-profile");
        } else {
            const listE = document.getElementById("explore-recommendations-list");
            if (listE) listE.innerHTML = recommendedCourses.length || recommendedTalentOpportunities.length ? 
                [...recommendedCourses, ...recommendedTalentOpportunities].map(c => personalizedCardHtml(c)).join('') : 
                emptyStateHtml("Complete your Discovery Profile to receive exploration suggestions.", "#discovery-profile");
            const listM = document.getElementById("mentors-list");
            if (listM) listM.innerHTML = recommendedMentors.length ? recommendedMentors.map(m => personalizedCardHtml(m)).join('') : emptyStateHtml("No mentors found.", "#discovery-profile");
            const listC = document.getElementById("recommended-courses-list");
            if (listC) listC.innerHTML = recommendedCourses.length ? recommendedCourses.map(c => personalizedCardHtml(c)).join('') : emptyStateHtml("No courses found.", "#discovery-profile");
            const listS = document.getElementById("scholarships-list");
            if (listS) listS.innerHTML = recommendedScholarships.length ? recommendedScholarships.map(s => personalizedCardHtml(s)).join('') : emptyStateHtml("No scholarships found.", "#discovery-profile");
        }
    }, 50);
}

function personalizedCardHtml(item) {
    const reasons = item.matchReasons && item.matchReasons.length > 0 ? item.matchReasons : ["Matched with your selected pathway and profile information."];
    const missingHtml = item.missingRequirements && item.missingRequirements.length > 0 ? `<li><i class="fas fa-exclamation-triangle text-warning"></i> Missing: ${escapeHtml(item.missingRequirements.join(', '))}</li>` : '';
    const statusHtml = item.eligibilityStatus ? `<br><small>Status: ${escapeHtml(item.eligibilityStatus)}</small>` : '';
    
    // Add image if available
    let imgHtml = '';
    if (item.imageUrl || item.image || item.photoUrl) {
        const url = item.imageUrl || item.image || item.photoUrl;
        imgHtml = `<div class="card-image-wrapper" style="height:150px;overflow:hidden;border-radius:var(--radius) var(--radius) 0 0;margin:-1.5rem -1.5rem 1rem -1.5rem;">
            <img src="${escapeHtml(url)}" style="width:100%;height:100%;object-fit:cover;" alt="Image" onerror="this.style.display='none'">
        </div>`;
    }

    return `
    <div class="card glass recommendation-card">
        ${imgHtml}
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

    content += '\n\n' + render_funcs

    with codecs.open('c:/dev/edupath_lanka/student-dashboard.js', 'w', encoding='utf-8') as f:
        f.write(content)
        
    print("Done writing python script replacement.")
except Exception as e:
    print(e)
