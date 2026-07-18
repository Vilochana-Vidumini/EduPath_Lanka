with open("admin-dashboard.js", "r", encoding="utf-8") as f:
    lines = f.readlines()

for i, line in enumerate(lines, 1):
    if "ref(database" in line.lower() and ("course" in line.lower() or "scholarship" in line.lower() or "student" in line.lower()):
        print(f"{i}: {line.strip()}")
