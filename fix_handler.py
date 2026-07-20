import re

with open("c:/dev/edupath_lanka/mentor-dashboard.js", "r", encoding="utf-8") as f:
    content = f.read()

# Fix handleLearningRequestAction
old_handler = """    function handleLearningRequestAction(event) {
        const view = event.target.closest('[data-view-learning-request]'); if (view) return openLearningRequestDetails(view.dataset.viewLearningRequest);
        const accept = event.target.closest('[data-accept-learning-request]'); if (accept) return acceptMentorshipRequest(accept.dataset.acceptLearningRequest);
        const reject = event.target.closest('[data-reject-learning-request]'); if (reject) { const note = prompt('Optional response note:', '') || ''; return rejectMentorshipRequest(reject.dataset.rejectLearningRequest, note); }
    }"""

new_handler = """    function handleLearningRequestAction(event) {
        const view = event.target.closest('[data-view-learning-request]'); if (view) {
            const reqId = view.dataset.viewLearningRequest;
            if (reqId && learningRequestDetails[reqId]) return openLearningRequestModal(learningRequestDetails[reqId]);
            return;
        }
        const accept = event.target.closest('[data-accept-learning-request]'); if (accept) return acceptLearningRequest(accept.dataset.acceptLearningRequest);
        const reject = event.target.closest('[data-reject-learning-request]'); if (reject) { const note = prompt('Optional response note:', '') || ''; return rejectLearningRequest(reject.dataset.rejectLearningRequest, note); }
    }"""

if old_handler in content:
    content = content.replace(old_handler, new_handler)
else:
    print("WARNING: handleLearningRequestAction not found exactly!")

with open("c:/dev/edupath_lanka/mentor-dashboard.js", "w", encoding="utf-8") as f:
    f.write(content)
print("Updated handleLearningRequestAction successfully")
