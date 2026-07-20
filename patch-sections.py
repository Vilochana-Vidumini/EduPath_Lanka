import sys
import codecs
import re

with codecs.open('c:/dev/edupath_lanka/student-dashboard.js', 'r', encoding='utf-8', errors='ignore') as f:
    content = f.read()

patch_code = """
    if (localStorage.getItem("debugRecommendations") === "true") {
        console.log("Hidden Sidebar items:");
        if (navAcademic && navAcademic.parentElement.style.display === "none") console.log("- Academic Profile");
        if (navTalent && navTalent.parentElement.style.display === "none") console.log("- Talent Profile");
        if (navDiscovery && navDiscovery.parentElement.style.display === "none") console.log("- Discovery Profile");
    }

    // ALSO HIDE THE ACTUAL SECTIONS FROM THE DOM TO PREVENT DIRECT ACCESS
    const secAcademic = document.getElementById("academic-profile-section");
    const secTalent = document.getElementById("talent-profile-section");
    const secDiscovery = document.getElementById("discovery-profile-section");
    
    if (secAcademic) secAcademic.style.display = (path === "talent" || path === "undecided") ? "none" : "";
    if (secTalent) secTalent.style.display = (path === "academic" || path === "academic_improvement" || path === "undecided") ? "none" : "";
    if (secDiscovery) secDiscovery.style.display = (path !== "undecided") ? "none" : "";
"""

old_code = """
    if (localStorage.getItem("debugRecommendations") === "true") {
        console.log("Hidden Sidebar items:");
        if (navAcademic && navAcademic.parentElement.style.display === "none") console.log("- Academic Profile");
        if (navTalent && navTalent.parentElement.style.display === "none") console.log("- Talent Profile");
        if (navDiscovery && navDiscovery.parentElement.style.display === "none") console.log("- Discovery Profile");
    }
"""

content = content.replace(old_code, patch_code)

with codecs.open('c:/dev/edupath_lanka/student-dashboard.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("Patched section hiding.")
