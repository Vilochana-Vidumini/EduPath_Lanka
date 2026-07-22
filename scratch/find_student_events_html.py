with open("student-dashboard.html", "r", encoding="utf-8", errors="ignore") as f:
    lines = f.readlines()

for i, line in enumerate(lines, 1):
    if "event" in line.lower() and "course" not in line.lower() and "mentor" not in line.lower():
        print(f"{i}: {line.strip()}")
