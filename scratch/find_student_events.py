import os

for root, dirs, files in os.walk("."):
    for file in files:
        if file.endswith(".js") or file.endswith(".html"):
            if "student" in file.lower() or "event" in file.lower() or "public" in file.lower():
                path = os.path.join(root, file)
                with open(path, "r", encoding="utf-8", errors="ignore") as f:
                    content = f.read()
                if "events" in content.lower() and ("status" in content.lower() or "active" in content.lower()):
                    if "institute-dashboard" not in file and "admin-dashboard" not in file:
                        print(f"Found in {path}")
