const fs = require('fs');
const files = ['about.html', 'courses.html', 'institutes.html', 'mentors.html', 'pathway.html', 'scholarships.html', 'admin-dashboard.html', 'institute-dashboard.html', 'mentor-dashboard.html', 'profile.html', 'student-dashboard.html', 'signup.html', 'login.html'];

files.forEach(f => {
    if (!fs.existsSync(f)) return;
    let content = fs.readFileSync(f, 'utf8');

    // Desktop nav
    content = content.replace(
        /<a href="scholarships\.html"><i class="fas fa-graduation-cap" aria-hidden="true"><\/i> Scholarships<\/a>\s*<a href="institutes\.html">/g,
        '<a href="scholarships.html"><i class="fas fa-graduation-cap" aria-hidden="true"></i> Scholarships</a>\n                        <a href="talent-opportunities.html"><i class="fas fa-star" aria-hidden="true"></i> Talent Opportunities</a>\n                        <a href="institutes.html">'
    );

    // Mobile nav
    content = content.replace(
        /<a href="courses\.html"(?: class="active")?>Courses<\/a>\s*<a href="mentors\.html">Mentors<\/a>/g,
        '<a href="courses.html">Courses</a>\n                <a href="talent-opportunities.html">Talent Opportunities</a>\n                <a href="mentors.html">Mentors</a>'
    );

    fs.writeFileSync(f, content);
});
console.log('Done replacing nav');
