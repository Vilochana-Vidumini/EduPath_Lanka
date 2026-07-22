with open("student-dashboard.js", "r", encoding="utf-8") as f:
    lines = f.readlines()

print("--- student-dashboard.js ---")
for i, line in enumerate(lines, 1):
    if "event" in line.lower() and ("status" in line.lower() or "active" in line.lower()):
        print(f"{i}: {line.strip()}")
