import sys
import codecs
import re

with codecs.open('c:/dev/edupath_lanka/student-dashboard.html', 'r', encoding='utf-8', errors='ignore') as f:
    content = f.read()

# 1. Remove BROWSE ALL section
browse_all_pattern = re.compile(r'<li class="sidebar-section-label"><span>BROWSE ALL</span></li>.*?<li><a href="talent-opportunities\.html".*?</li>', re.DOTALL)
content = browse_all_pattern.sub('', content)

# 2. Add missing sections
# We need to insert these right before <section id="saved-courses-section" class="dashboard-section">
# Wait, let's insert them right after <section id="recommended-courses-section" class="dashboard-section">... </section>

new_sections = """
            <section id="talent-recommendations-section" class="dashboard-section">
                <div class="section-header"><h2>My Talent Path Recommendations</h2></div>
                <div class="list-card glass">
                    <div class="empty-state"><p>Check your specialized talent recommendations.</p></div>
                </div>
            </section>

            <section id="talent-opportunities-recommendations-section" class="dashboard-section">
                <div class="section-header"><h2>My Talent Opportunities</h2></div>
                <div id="talent-opportunities-recommendations-list" class="cards-grid">
                    <div class="empty-state glass"><i class="fas fa-spinner fa-spin"></i><p>Loading talent opportunities...</p></div>
                </div>
            </section>

            <section id="talent-mentors-recommendations-section" class="dashboard-section">
                <div class="section-header"><h2>My Talent Mentors & Coaches</h2></div>
                <div id="talent-mentors-recommendations-list" class="cards-grid">
                    <div class="empty-state glass"><i class="fas fa-spinner fa-spin"></i><p>Loading mentors...</p></div>
                </div>
            </section>

            <section id="skill-courses-recommendations-section" class="dashboard-section">
                <div class="section-header"><h2>My Skill Courses</h2></div>
                <div id="skill-courses-recommendations-list" class="cards-grid">
                    <div class="empty-state glass"><i class="fas fa-spinner fa-spin"></i><p>Loading skill courses...</p></div>
                </div>
            </section>

            <section id="talent-scholarships-recommendations-section" class="dashboard-section">
                <div class="section-header"><h2>My Talent Scholarships</h2></div>
                <div id="talent-scholarships-recommendations-list" class="cards-grid">
                    <div class="empty-state glass"><i class="fas fa-spinner fa-spin"></i><p>Loading talent scholarships...</p></div>
                </div>
            </section>

            <section id="talent-institutes-recommendations-section" class="dashboard-section">
                <div class="section-header"><h2>My Institutes & Academies</h2></div>
                <div id="talent-institutes-recommendations-list" class="cards-grid">
                    <div class="empty-state glass"><i class="fas fa-spinner fa-spin"></i><p>Loading institutes...</p></div>
                </div>
            </section>
"""

content = content.replace('<section id="saved-courses-section" class="dashboard-section">', new_sections + '\n            <section id="saved-courses-section" class="dashboard-section">')

# 3. Add IDs to the profile sidebar links so we can hide them in JS
content = content.replace('href="#academic-profile" data-section="academic-profile-section"', 'id="nav-academic-profile" href="#academic-profile" data-section="academic-profile-section"')
content = content.replace('href="#talent-profile" data-section="talent-profile-section"', 'id="nav-talent-profile" href="#talent-profile" data-section="talent-profile-section"')
content = content.replace('href="#discovery-profile" data-section="discovery-profile-section"', 'id="nav-discovery-profile" href="#discovery-profile" data-section="discovery-profile-section"')

with codecs.open('c:/dev/edupath_lanka/student-dashboard.html', 'w', encoding='utf-8') as f:
    f.write(content)

print("Updated HTML sections.")
