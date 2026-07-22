with open("admin-dashboard.js", "r", encoding="utf-8") as f:
    lines = f.readlines()

for i, line in enumerate(lines, 1):
    if "event" in line.lower() and ("status" in line.lower() or "active" in line.lower() or "pending" in line.lower()):
        if "course" not in line.lower() and "mentor" not in line.lower():
            print(f"{i}: {line.strip()}")
