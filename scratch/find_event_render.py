with open("student-dashboard.js", "r", encoding="utf-8") as f:
    lines = f.readlines()

for i, line in enumerate(lines, 1):
    if "event" in line.lower() and ("render" in line.lower() or "list" in line.lower() or "db" in line.lower() or "child" in line.lower() or "snap" in line.lower() or "ref" in line.lower()):
        if "course" not in line.lower() and "mentor" not in line.lower():
            print(f"{i}: {line.strip()}")
