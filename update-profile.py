import sys
import re

with open('c:\\dev\\edupath_lanka\\student-dashboard.js', 'r', encoding='utf-8') as f:
    content = f.read()

new_get_profile_completion = '''function getProfileCompletionPercentage() {
    const path = state.student?.pathwayPreference || "undecided";
    let requiredSections = ["personalProfile"];
    
    if (path === "academic" || path === "academic_improvement") {
        requiredSections.push("academicProfile");
    } else if (path === "talent") {
        requiredSections.push("talentProfile");
    } else if (path === "combined") {
        requiredSections.push("academicProfile", "talentProfile");
    } else {
        requiredSections.push("discoveryProfile");
    }

    let totalFields = 0;
    let completedFields = 0;

    requiredSections.forEach(section => {
        let sectionData = {};
        if (section === "personalProfile") {
            sectionData = { ...state.user, ...state.student };
            totalFields += 5; // e.g., name, email, phone, district, dob
        } else if (section === "academicProfile") {
            sectionData = state.academicProfile || {};
            totalFields += 4;
        } else if (section === "talentProfile") {
            sectionData = state.talentProfile || {};
            totalFields += 4;
        } else if (section === "discoveryProfile") {
            sectionData = state.discoveryProfile || {};
            totalFields += 3;
        }
        
        Object.keys(sectionData).forEach(k => {
            if (sectionData[k] !== undefined && sectionData[k] !== "" && sectionData[k] !== null) {
                completedFields++;
            }
        });
    });

    const pct = Math.min(100, Math.round((completedFields / totalFields) * 100));
    return isNaN(pct) ? 0 : pct;
}'''

content = re.sub(r'function getProfileCompletionPercentage\(\)\s*\{[^}]+\}', new_get_profile_completion, content)

with open('c:\\dev\\edupath_lanka\\student-dashboard.js', 'w', encoding='utf-8') as f:
    f.write(content)
print('Updated getProfileCompletionPercentage')
