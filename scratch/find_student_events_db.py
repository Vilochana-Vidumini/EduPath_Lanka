with open("student-dashboard.js", "r", encoding="utf-8") as f:
    lines = f.readlines()

for i, line in enumerate(lines, 1):
    if '"events"' in line or "'events'" in line or '`events`' in line:
        print(f"{i}: {line.strip()}")
