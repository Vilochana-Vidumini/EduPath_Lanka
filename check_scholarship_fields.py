import re

with open("c:/dev/edupath_lanka/admin-dashboard.html", "r", encoding="utf-8") as f:
    content = f.read()

# Find everything inside id="scholarship-form-card"
match = re.search(r'id="scholarship-form-card"(.*?)</form>', content, re.DOTALL)
if match:
    form_html = match.group(1)
    # find all name="..."
    names = re.findall(r'name="([^"]+)"', form_html)
    print("Scholarship fields:", names)
else:
    print("Not found")
