import sys
import codecs

with codecs.open('c:/dev/edupath_lanka/student-dashboard.js', 'r', encoding='utf-8', errors='ignore') as f:
    content = f.read()

# I will wrap the logic inside window.renderPersonalizedRecommendations with a try..catch
old_start = "window.renderPersonalizedRecommendations = function() {"
new_start = """window.renderPersonalizedRecommendations = function() {
    try {
"""

old_end = """        }
    }, 50);
}

function personalizedCardHtml"""

new_end = """        }
    }, 50);
    } catch (e) {
        console.error("RECOMMENDATION ENGINE ERROR:", e);
        const errDiv = document.createElement("div");
        errDiv.style.color = "red";
        errDiv.style.background = "#fee";
        errDiv.style.padding = "20px";
        errDiv.innerHTML = "<h3>Error in renderPersonalizedRecommendations</h3><pre>" + e.stack + "</pre>";
        const header = document.querySelector(".dashboard-header");
        if (header) header.parentNode.insertBefore(errDiv, header.nextSibling);
    }
}

function personalizedCardHtml"""

content = content.replace(old_start, new_start).replace(old_end, new_end)

with codecs.open('c:/dev/edupath_lanka/student-dashboard.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("Injected try-catch wrapper.")
