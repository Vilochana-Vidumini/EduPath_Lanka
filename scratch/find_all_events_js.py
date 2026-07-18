import os

for root, dirs, files in os.walk("."):
    for file in files:
        if file.endswith(".js"):
            path = os.path.join(root, file)
            with open(path, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read()
            if "events" in content.lower():
                print(f"Found events in {path}")
