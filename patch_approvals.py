with open("c:/dev/edupath_lanka/admin-dashboard.js", "r", encoding="utf-8") as f:
    content = f.read()

content = content.replace(
    '"admin-hero-pending-approvals": pendingMentors,',
    '"admin-hero-pending-approvals": pendingMentors + pendingInstitutes,'
)

with open("c:/dev/edupath_lanka/admin-dashboard.js", "w", encoding="utf-8") as f:
    f.write(content)
print("Updated admin-hero-pending-approvals")
