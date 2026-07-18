with open("admin-dashboard.js", "r", encoding="utf-8") as f:
    lines = f.readlines()

for i, line in enumerate(lines, 1):
    if "showadminsection" in line.lower() or "sidebar-links" in line.lower() or "onhashchange" in line.lower():
        print(f"{i}: {line.strip()}")
