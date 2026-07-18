import { auth, database } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { ref, push, set, update, remove, serverTimestamp, get, query, orderByChild, equalTo } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
import { showToast } from "./auth-nav.js?v=20260614-brand";

const pathwayMode = new URLSearchParams(window.location.search).get("mode") || "first-time";
let currentUser = null;
let currentStep = 1;
let latestResult = {};
let latestResultId = "";

const stepMeta = [
    ["About You", "Tell us who you are and where you are starting from."],
    ["Education Background", "Share your O/L, A/L, English, and IT background."],
    ["Interests", "Choose areas and work styles that feel close to you."],
    ["Skills & Strengths", "Pick current skills and strengths. Not sure? That is okay."],
    ["Goals", "Tell us what kind of future you want to build."],
    ["Learning Preferences", "Choose how, where, and how long you prefer to learn."],
    ["Financial & Support Needs", "Help us recommend scholarships and guidance."],
    ["Review & Generate", "Review your answers and generate your pathway."]
];

const optionSets = {
    districts: ["Ampara", "Anuradhapura", "Badulla", "Batticaloa", "Colombo", "Galle", "Gampaha", "Hambantota", "Jaffna", "Kalutara", "Kandy", "Kegalle", "Kilinochchi", "Kurunegala", "Mannar", "Matale", "Matara", "Monaragala", "Mullaitivu", "Nuwara Eliya", "Polonnaruwa", "Puttalam", "Ratnapura", "Trincomalee", "Vavuniya"],
    languages: ["Sinhala", "Tamil", "English"],
    educationLevels: ["After O/L", "Currently doing A/L", "After A/L", "Undergraduate", "Diploma / Certificate Student", "Job Seeker", "Working and Want to Upskill", "Not Sure", "Other"],
    resultRanges: ["High", "Average", "Low", "Waiting results", "Prefer not to say"],
    alStreams: ["Physical Science", "Biological Science", "Commerce", "Arts", "Technology", "Other", "Not selected yet"],
    englishLevels: ["Beginner", "Basic", "Intermediate", "Good", "Strong"],
    itLevels: ["No experience", "Basic computer use", "Internet and office tools", "Basic coding/design", "Good technical knowledge"],
    interests: ["Information Technology", "Software Development", "Engineering", "Electronics", "Business & Management", "Accounting & Finance", "Medicine & Health", "Teaching & Education", "Design & Creative Arts", "Media & Communication", "Tourism & Hospitality", "Law & Public Service", "Agriculture & Environment", "Automobile & Mechanical", "Construction & Architecture", "Languages", "Entrepreneurship", "Not Sure Yet"],
    workTypes: ["Working with computers", "Helping people", "Designing creative things", "Solving technical problems", "Managing business activities", "Working outdoors", "Teaching or guiding others", "Writing or communication", "Building or repairing things", "Researching and analyzing", "Still not sure"],
    skills: ["Computer basics", "Programming basics", "Electronics basics", "Design", "Writing", "Speaking", "Mathematics", "Problem solving", "Leadership", "Teamwork", "Communication", "English", "Presentation skills", "Research skills", "Business thinking", "Creativity"],
    skillLevels: ["Beginner", "Intermediate", "Good", "Strong", "Not sure"],
    strengths: ["I learn quickly", "I like solving problems", "I like helping people", "I am creative", "I can work in a team", "I can work alone", "I like practical work", "I like theory/research", "I am good with technology", "I am good at communication"],
    futurePreferences: ["Stable job", "High income career", "Start my own business", "Work abroad", "Work in Sri Lanka", "Help people", "Creative career", "Technical career", "Government job", "Still not sure"],
    careers: ["Software Engineer", "IT Support / Network Technician", "Electronics Technician", "Engineer", "Teacher", "Nurse / Health Worker", "Business Owner", "Accountant", "Graphic Designer", "Digital Marketer", "Mechanic", "Tourism / Hotel Professional", "Government Officer", "Researcher", "Not sure yet", "Other"],
    learningModes: ["Online", "Physical", "Hybrid", "Self-paced"],
    courseDurations: ["Short course", "3-6 months", "6-12 months", "1-2 years", "Degree pathway", "No preference"],
    timeAvailability: ["Full-time", "Part-time", "Weekends", "Weekdays", "Evening", "Flexible"],
    courseTypes: ["Free course", "Certificate", "Diploma", "Degree", "NVQ / Vocational", "Professional qualification", "Internship-based", "Not sure"],
    financialSupport: ["Yes, I need scholarship support", "I prefer free courses", "I can afford low-cost courses", "I can pay moderate fees", "I can pay if installments are available", "I am not sure"],
    budgetRanges: ["Free only", "Below Rs. 10,000", "Rs. 10,000 - Rs. 50,000", "Rs. 50,000 - Rs. 150,000", "Above Rs. 150,000", "Need scholarship", "Not sure"],
    challenges: ["I do not know what to choose", "I do not have enough money", "My results are not enough", "I do not know available courses", "I need mentor guidance", "Parents/family are unsure", "I need English improvement", "I need IT skills", "I need confidence", "I want to go abroad", "I need help applying"],
    supportNeeded: ["Course guidance", "Scholarship guidance", "Career guidance", "Mentor support", "Skill development plan", "Application help", "Interview/CV help"]
};

document.addEventListener("DOMContentLoaded", () => {
    bindShellInteractions();
    buildPathwayForm();
    bindPathwayForm();

    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            window.location.href = "login.html?redirect=pathway.html";
            return;
        }
        currentUser = user;
        const userSnap = await get(ref(database, `users/${user.uid}`));
        const userData = userSnap.val() || {};
        const type = normalize(userData.userType);
        if (type && !["student", "admin"].includes(type)) {
            showToast("Access denied. The Pathway Finder is only available for students.", "error");
            window.location.href = "student-dashboard.html";
            return;
        }
        await loadExistingData(user.uid, userData);
    });
});

function buildPathwayForm() {
    const card = document.querySelector(".form-card");
    if (!card) return;
    card.innerHTML = `
        <div class="form-header text-center">
            <span class="pathway-kicker">Sri Lankan education and career guidance</span>
            <h2>Build Your Personalized Pathway</h2>
            <p>Choose what feels closest to you. Your answers help us recommend better courses, scholarships, mentors, and next steps.</p>
        </div>
        <div class="step-progress-container pathway-progress">
            <div class="progress-line-bg"><div class="progress-line-fill" id="progress-line"></div></div>
            ${stepMeta.map((step, index) => `<button type="button" class="step-dot ${index === 0 ? "active" : ""}" data-step="${index + 1}">${index + 1}<span>${step[0]}</span></button>`).join("")}
        </div>
        <form id="pathwayForm" novalidate>
            ${renderStep(1, "fa-user-circle", step1())}
            ${renderStep(2, "fa-graduation-cap", step2())}
            ${renderStep(3, "fa-heart", step3())}
            ${renderStep(4, "fa-bolt", step4())}
            ${renderStep(5, "fa-bullseye", step5())}
            ${renderStep(6, "fa-laptop-house", step6())}
            ${renderStep(7, "fa-hand-holding-heart", step7())}
            ${renderStep(8, "fa-clipboard-check", `<div id="review-summary" class="review-summary"></div>`)}
            <div class="step-buttons pathway-step-actions">
                <button type="button" class="btn btn-outline-dark" id="prev-step-btn"><i class="fas fa-arrow-left"></i> Back</button>
                <button type="button" class="btn btn-outline-dark" id="save-draft-btn"><i class="fas fa-save"></i> Save Draft</button>
                <button type="button" class="btn btn-primary" id="next-step-btn">Next <i class="fas fa-arrow-right"></i></button>
                <button type="submit" class="btn btn-primary hidden" id="generate-pathway-btn">Generate My Pathway <i class="fas fa-compass"></i></button>
            </div>
        </form>
        <div id="pathway-validation-summary" class="validation-summary hidden"></div>
    `;
    updateStepIndicator();
}

function renderStep(number, icon, body) {
    const [title, description] = stepMeta[number - 1];
    return `
        <section class="form-step ${number === 1 ? "active" : ""}" data-step="${number}">
            <div class="pathway-step-heading">
                <div class="pathway-step-icon"><i class="fas ${icon}"></i></div>
                <div>
                    <span>Step ${number} of ${stepMeta.length}</span>
                    <h3>${title}</h3>
                    <p>${description}</p>
                </div>
            </div>
            <div class="form-group-section">${body}</div>
        </section>
    `;
}

function step1() {
    return `
        <div class="form-row">
            ${input("fullName", "Full Name *")}
            ${select("ageRange", "Age Range", ["Below 16", "16-18", "19-21", "22-25", "26-30", "Above 30"])}
        </div>
        <div class="form-row three-cols">
            ${select("district", "District *", optionSets.districts)}
            ${select("preferredLanguage", "Preferred Language", optionSets.languages)}
            ${select("currentEducationLevel", "Current Education Level *", optionSets.educationLevels)}
        </div>
        <div class="form-row">
            ${input("email", "Contact Email", "email")}
            ${input("phone", "Phone Number", "tel")}
        </div>
    `;
}

function step2() {
    return `
        <div class="form-row three-cols">
            ${select("olStatus", "O/L Status", ["Completed with good results", "Completed with average results", "Completed but results are not strong", "Waiting for results", "Not completed"])}
            ${select("olResultRange", "O/L Result Range", optionSets.resultRanges)}
            ${select("alStatus", "A/L Status", ["Not started", "Currently studying", "Completed", "Waiting for results", "Not planning A/L"])}
        </div>
        <div class="form-row three-cols">
            ${select("alStream", "A/L Stream", optionSets.alStreams)}
            ${select("alResultRange", "A/L Result Range", optionSets.resultRanges)}
            ${input("mainSubjects", "Main Subjects")}
        </div>
        <div class="form-row">
            ${input("bestSubjects", "Best Subjects")}
            ${input("weakSubjects", "Weak Subjects")}
        </div>
        <div class="form-row">
            ${select("englishLevel", "English Level", optionSets.englishLevels)}
            ${select("itKnowledgeLevel", "IT Knowledge Level", optionSets.itLevels)}
        </div>
    `;
}

function step3() {
    return `
        ${checkboxGroup("interestAreas", "Interest Areas *", optionSets.interests, "option-card-grid")}
        ${checkboxGroup("enjoyableWorkTypes", "What kind of work do you enjoy?", optionSets.workTypes, "option-card-grid")}
    `;
}

function step4() {
    return `
        ${checkboxGroup("skills", "Current Skills *", optionSets.skills, "option-card-grid skills-picker")}
        <div id="skill-levels" class="skill-level-grid"></div>
        ${checkboxGroup("strengths", "Strengths *", optionSets.strengths, "option-card-grid")}
    `;
}

function step5() {
    return `
        ${checkboxGroup("futurePreference", "What kind of future do you want?", optionSets.futurePreferences, "option-card-grid")}
        <div class="form-row">
            ${select("dreamCareer", "Dream job or preferred career", optionSets.careers)}
            ${input("longTermGoal", "Long-term goal (optional)")}
        </div>
    `;
}

function step6() {
    return `
        <div class="form-row three-cols">
            ${select("learningMode", "Preferred Learning Mode *", optionSets.learningModes)}
            ${select("courseDuration", "Preferred Course Duration", optionSets.courseDurations)}
            ${select("courseTypePreference", "Course Type Preference", optionSets.courseTypes)}
        </div>
        ${checkboxGroup("timeAvailability", "Study Time Availability", optionSets.timeAvailability, "option-card-grid compact-options")}
        ${checkboxGroup("preferredDistricts", "Preferred Districts", optionSets.districts, "option-card-grid compact-options")}
        ${select("learningLanguage", "Preferred Course Language", optionSets.languages)}
    `;
}

function step7() {
    return `
        <div class="form-row">
            ${select("financialSupport", "Do you need financial support? *", optionSets.financialSupport)}
            ${select("budgetRange", "Budget Range", optionSets.budgetRanges)}
        </div>
        ${checkboxGroup("biggestChallenge", "Biggest challenge right now *", optionSets.challenges, "option-card-grid")}
        ${checkboxGroup("supportNeeded", "Support Needed", optionSets.supportNeeded, "option-card-grid compact-options")}
    `;
}

function input(id, label, type = "text") {
    return `<div class="input-group"><label for="${id}">${label}</label><input type="${type}" id="${id}" name="${id}" autocomplete="off"><span class="error-msg" id="${id}-error"></span></div>`;
}

function select(id, label, options) {
    return `<div class="input-group"><label for="${id}">${label}</label><select id="${id}" name="${id}"><option value="">Select option</option>${options.map((item) => `<option value="${escapeAttr(item)}">${escapeHtml(item)}</option>`).join("")}</select><span class="error-msg" id="${id}-error"></span></div>`;
}

function checkboxGroup(name, label, options, className = "option-card-grid") {
    return `<div class="input-group full-width"><label>${label}</label><div class="${className}" data-checkbox-group="${name}">${options.map((item) => `<label class="option-card"><input type="checkbox" name="${name}" value="${escapeAttr(item)}"><span>${escapeHtml(item)}</span></label>`).join("")}</div><span class="error-msg" id="${name}-error"></span></div>`;
}

function bindPathwayForm() {
    document.getElementById("next-step-btn")?.addEventListener("click", () => {
        if (!validateStep(currentStep)) return;
        if (currentStep < stepMeta.length) goToStep(currentStep + 1);
    });
    document.getElementById("prev-step-btn")?.addEventListener("click", () => {
        if (currentStep > 1) goToStep(currentStep - 1);
    });
    document.getElementById("save-draft-btn")?.addEventListener("click", () => saveDraft(true));
    document.getElementById("pathwayForm")?.addEventListener("submit", generatePathway);
    document.querySelectorAll("[data-checkbox-group='skills'] input").forEach((inputEl) => {
        inputEl.addEventListener("change", renderSkillLevels);
    });
    document.querySelectorAll("input, select").forEach((field) => {
        field.addEventListener("change", () => {
            clearFieldError(field.name || field.id);
            if (currentStep === 8) renderReview();
        });
        field.addEventListener("input", () => clearFieldError(field.name || field.id));
    });
}

async function loadExistingData(uid, userData) {
    const [studentSnap, draftSnap] = await Promise.all([
        get(ref(database, `students/${uid}`)),
        get(ref(database, `pathwayDrafts/${uid}`))
    ]);
    const studentData = studentSnap.val() || {};
    latestResult = await getCurrentPathwayResult(uid, studentData.currentPathwayResultId);
    latestResultId = latestResult.resultId || studentData.currentPathwayResultId || "";

    const draft = draftSnap.val();
    const shouldUseDraft = draft?.formData && window.confirm("Continue your saved Pathway Finder draft?");
    const formData = shouldUseDraft ? draft.formData : (pathwayMode === "update" ? resultToFormData(latestResult, studentData) : resultToFormData({}, studentData));
    setFormData({
        ...formData,
        fullName: formData.fullName || userData.fullName || studentData.fullName || "",
        email: formData.email || userData.email || studentData.email || currentUser?.email || "",
        phone: formData.phone || userData.phone || studentData.phone || ""
    });
    if (shouldUseDraft) goToStep(Number(draft.currentStep || 1));
}

async function getCurrentPathwayResult(uid, currentResultId) {
    const resultsSnap = await get(ref(database, `pathwayResults/${uid}`));
    const results = resultsSnap.val() || {};
    if (currentResultId && results[currentResultId]) return { resultId: currentResultId, ...results[currentResultId] };
    return Object.entries(results)
        .sort(([keyA, a], [keyB, b]) => getTime(b.createdAt, keyB) - getTime(a.createdAt, keyA))
        .map(([id, result]) => ({ resultId: id, ...result }))[0] || {};
}

function resultToFormData(result = {}, student = {}) {
    const basic = result.basicProfile || {};
    const academic = result.academicBackground || {};
    const interests = result.interests || {};
    const skills = result.skillsAndStrengths || {};
    const goals = result.goals || {};
    const learning = result.learningPreferences || {};
    const support = result.supportNeeds || {};
    return {
        fullName: basic.fullName || result.studentName || student.fullName || "",
        ageRange: basic.ageRange || "",
        district: basic.district || result.district || student.district || "",
        preferredLanguage: basic.preferredLanguage || learning.preferredLanguage || "",
        currentEducationLevel: basic.currentEducationLevel || result.educationLevel || student.educationLevel || "",
        email: result.studentEmail || result.email || student.email || "",
        phone: result.phone || student.phone || "",
        ...academic,
        interestAreas: interests.interestAreas || arrayValue(result.interestArea || student.interestArea),
        enjoyableWorkTypes: interests.enjoyableWorkTypes || [],
        skills: skills.skills || arrayValue(result.skills || student.skills),
        skillLevels: skills.skillLevels || {},
        strengths: skills.strengths || [],
        ...goals,
        learningMode: learning.learningMode || result.learningMode || student.learningMode || "",
        courseDuration: learning.courseDuration || "",
        timeAvailability: learning.timeAvailability || [],
        preferredDistricts: learning.preferredDistricts || arrayValue(result.preferredDistrict || student.preferredDistrict || student.district),
        learningLanguage: learning.preferredLanguage || "",
        courseTypePreference: learning.courseTypePreference || "",
        financialSupport: support.financialSupport || result.financialSupport || student.financialSupport || "",
        budgetRange: support.budgetRange || result.budgetRange || "",
        biggestChallenge: support.biggestChallenge || [],
        supportNeeded: support.supportNeeded || []
    };
}

function setFormData(data) {
    Object.entries(data || {}).forEach(([key, value]) => {
        const field = document.getElementById(key);
        if (field) field.value = Array.isArray(value) ? value[0] || "" : value || "";
        document.querySelectorAll(`[name="${CSS.escape(key)}"][type="checkbox"]`).forEach((checkbox) => {
            checkbox.checked = arrayValue(value).includes(checkbox.value);
        });
    });
    renderSkillLevels(data.skillLevels || {});
}

function collectFormData() {
    const selectedSkills = checkedValues("skills");
    return {
        fullName: value("fullName"),
        ageRange: value("ageRange"),
        district: value("district"),
        preferredLanguage: value("preferredLanguage"),
        currentEducationLevel: value("currentEducationLevel"),
        email: value("email"),
        phone: value("phone"),
        olStatus: value("olStatus"),
        olResultRange: value("olResultRange"),
        alStatus: value("alStatus"),
        alStream: value("alStream"),
        alResultRange: value("alResultRange"),
        mainSubjects: value("mainSubjects"),
        bestSubjects: value("bestSubjects"),
        weakSubjects: value("weakSubjects"),
        englishLevel: value("englishLevel"),
        itKnowledgeLevel: value("itKnowledgeLevel"),
        interestAreas: checkedValues("interestAreas"),
        enjoyableWorkTypes: checkedValues("enjoyableWorkTypes"),
        skills: selectedSkills,
        skillLevels: Object.fromEntries(selectedSkills.map((skill) => [skill, value(`skill-level-${slug(skill)}`) || "Not sure"])),
        strengths: checkedValues("strengths"),
        futurePreference: checkedValues("futurePreference"),
        dreamCareer: value("dreamCareer"),
        longTermGoal: value("longTermGoal"),
        learningMode: value("learningMode"),
        courseDuration: value("courseDuration"),
        timeAvailability: checkedValues("timeAvailability"),
        preferredDistricts: checkedValues("preferredDistricts"),
        learningLanguage: value("learningLanguage"),
        courseTypePreference: value("courseTypePreference"),
        financialSupport: value("financialSupport"),
        budgetRange: value("budgetRange"),
        biggestChallenge: checkedValues("biggestChallenge"),
        supportNeeded: checkedValues("supportNeeded")
    };
}

function renderSkillLevels(existing = {}) {
    const container = document.getElementById("skill-levels");
    if (!container) return;
    const skills = checkedValues("skills");
    if (!skills.length) {
        container.innerHTML = "";
        return;
    }
    container.innerHTML = skills.map((skill) => `
        <div class="skill-level-item">
            <span>${escapeHtml(skill)}</span>
            <select id="skill-level-${slug(skill)}">
                ${optionSets.skillLevels.map((level) => `<option value="${escapeAttr(level)}" ${existing[skill] === level ? "selected" : ""}>${escapeHtml(level)}</option>`).join("")}
            </select>
        </div>
    `).join("");
}

function validateStep(step) {
    const data = collectFormData();
    const errors = {};
    if (step === 1) {
        if (!data.fullName) errors.fullName = "Please enter your full name.";
        if (!data.district) errors.district = "Please select your district.";
        if (!data.currentEducationLevel) errors.currentEducationLevel = "Please select your current education level.";
    }
    if (step === 3 && !data.interestAreas.length) errors.interestAreas = "Select at least one interest area.";
    if (step === 4 && !data.skills.length && !data.strengths.length) {
        errors.skills = "Select at least one skill or strength.";
        errors.strengths = "Select at least one skill or strength.";
    }
    if (step === 6 && !data.learningMode) errors.learningMode = "Please select a learning mode.";
    if (step === 7) {
        if (!data.financialSupport) errors.financialSupport = "Please select your financial support need.";
        if (!data.biggestChallenge.length) errors.biggestChallenge = "Select at least one current challenge.";
    }
    showErrors(errors);
    return Object.keys(errors).length === 0;
}

function validateAll() {
    return [1, 3, 4, 6, 7].every(validateStep);
}

function showErrors(errors) {
    document.querySelectorAll(".input-group.error").forEach((group) => group.classList.remove("error"));
    document.querySelectorAll(".error-msg").forEach((error) => {
        error.textContent = "";
        error.classList.remove("visible");
    });
    Object.entries(errors).forEach(([key, message]) => {
        const error = document.getElementById(`${key}-error`);
        if (error) {
            error.textContent = message;
            error.classList.add("visible");
            error.closest(".input-group")?.classList.add("error");
        }
    });
    const summary = document.getElementById("pathway-validation-summary");
    if (summary) {
        summary.classList.toggle("hidden", !Object.keys(errors).length);
        summary.innerHTML = Object.keys(errors).length ? `<i class="fas fa-circle-info"></i> Please complete the highlighted fields before continuing.` : "";
    }
}

function clearFieldError(key) {
    const error = document.getElementById(`${key}-error`);
    if (error) {
        error.textContent = "";
        error.classList.remove("visible");
        error.closest(".input-group")?.classList.remove("error");
    }
}

function goToStep(step) {
    currentStep = Math.max(1, Math.min(stepMeta.length, step));
    document.querySelectorAll(".form-step").forEach((item) => item.classList.toggle("active", Number(item.dataset.step) === currentStep));
    updateStepIndicator();
    if (currentStep === 8) renderReview();
    document.querySelector(".form-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function updateStepIndicator() {
    const percent = ((currentStep - 1) / (stepMeta.length - 1)) * 100;
    const progress = document.getElementById("progress-line");
    if (progress) progress.style.width = `${percent}%`;
    document.querySelectorAll(".step-dot").forEach((dot) => {
        const step = Number(dot.dataset.step);
        dot.classList.toggle("active", step === currentStep);
        dot.classList.toggle("completed", step < currentStep);
    });
    document.getElementById("prev-step-btn")?.classList.toggle("hidden", currentStep === 1);
    document.getElementById("next-step-btn")?.classList.toggle("hidden", currentStep === stepMeta.length);
    document.getElementById("generate-pathway-btn")?.classList.toggle("hidden", currentStep !== stepMeta.length);
}

function renderReview() {
    const data = collectFormData();
    const review = document.getElementById("review-summary");
    if (!review) return;
    const groups = {
        "About You": [data.fullName, data.ageRange, data.district, data.preferredLanguage, data.currentEducationLevel],
        Education: [data.olStatus, data.olResultRange, data.alStatus, data.alStream, data.alResultRange, data.englishLevel, data.itKnowledgeLevel],
        Interests: [...data.interestAreas, ...data.enjoyableWorkTypes],
        "Skills & Strengths": [...data.skills, ...data.strengths],
        Goals: [...data.futurePreference, data.dreamCareer, data.longTermGoal],
        "Learning Preferences": [data.learningMode, data.courseDuration, ...data.timeAvailability, ...data.preferredDistricts, data.courseTypePreference],
        "Financial & Support": [data.financialSupport, data.budgetRange, ...data.biggestChallenge, ...data.supportNeeded]
    };
    review.innerHTML = Object.entries(groups).map(([title, items]) => `
        <article class="review-card">
            <h4>${escapeHtml(title)}</h4>
            <div class="tag-list">${items.filter(Boolean).map((item) => `<span class="tag">${escapeHtml(item)}</span>`).join("") || `<span class="text-muted">No details added</span>`}</div>
        </article>
    `).join("");
}

async function saveDraft(showMessage = false) {
    if (!currentUser) return;
    await set(ref(database, `pathwayDrafts/${currentUser.uid}`), {
        currentStep,
        formData: sanitizeForWrite(collectFormData()),
        updatedAt: serverTimestamp()
    });
    if (showMessage) showToast("Pathway draft saved.", "success");
}

async function generatePathway(event) {
    event.preventDefault();
    if (!validateAll()) {
        showToast("Please complete the required Pathway Finder fields.", "error");
        return;
    }
    const button = document.getElementById("generate-pathway-btn");
    const original = button?.innerHTML;
    if (button) {
        button.disabled = true;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';
    }
    try {
        const formData = collectFormData();
        const pathway = determinePathway(formData);
        const matches = await buildMatches(formData, pathway);
        const score = calculatePathwayScore(formData, matches);
        const resultRef = push(ref(database, `pathwayResults/${currentUser.uid}`));
        const resultId = resultRef.key;
        const summary = buildSummary(formData, pathway, matches);
        const nextSteps = buildFuturePlan(formData, matches);
        const result = buildResultPayload(resultId, formData, pathway, score, summary, nextSteps, matches);
        const updates = {};

        if (latestResultId) updates[`pathwayResults/${currentUser.uid}/${latestResultId}/status`] = "previous";
        updates[`pathwayResults/${currentUser.uid}/${resultId}`] = result;
        updates[`students/${currentUser.uid}/fullName`] = formData.fullName;
        updates[`students/${currentUser.uid}/email`] = formData.email || currentUser.email || "";
        updates[`students/${currentUser.uid}/phone`] = formData.phone || "";
        updates[`students/${currentUser.uid}/district`] = formData.district;
        updates[`students/${currentUser.uid}/pathwayCompleted`] = true;
        updates[`students/${currentUser.uid}/currentPathwayResultId`] = resultId;
        updates[`students/${currentUser.uid}/lastPathwayUpdatedAt`] = serverTimestamp();
        updates[`students/${currentUser.uid}/pathwayLastUpdatedAt`] = serverTimestamp();
        updates[`students/${currentUser.uid}/educationLevel`] = formData.currentEducationLevel;
<<<<<<< HEAD
        updates[`students/${currentUser.uid}/interestArea`] = formData.interestAreas?.[0] || "Not Sure Yet";
        updates[`students/${currentUser.uid}/futureGoal`] = formData.dreamCareer || formData.futurePreference?.[0] || "Not sure yet";
        updates[`students/${currentUser.uid}/skills`] = formData.skills;
        updates[`students/${currentUser.uid}/financialSupport`] = formData.financialSupport;
        updates[`students/${currentUser.uid}/learningMode`] = formData.learningMode;
        updates[`students/${currentUser.uid}/preferredDistrict`] = formData.preferredDistricts?.[0] || formData.district;
        updates[`students/${currentUser.uid}/profileUpdatedAfterPathway`] = false;

        // --- Profile Sync ---
        // Personal Profile
        if (formData.fullName) updates[`studentProfiles/${currentUser.uid}/personal/fullName`] = formData.fullName;
        if (formData.email || currentUser.email) updates[`studentProfiles/${currentUser.uid}/personal/email`] = formData.email || currentUser.email;
        if (formData.phone) updates[`studentProfiles/${currentUser.uid}/personal/phone`] = formData.phone;
        if (formData.district) updates[`studentProfiles/${currentUser.uid}/personal/district`] = formData.district;
        updates[`studentProfiles/${currentUser.uid}/personal/updatedAt`] = serverTimestamp();

        // Academic Profile
        if (formData.currentEducationLevel) updates[`learningProfiles/${currentUser.uid}/educationLevel`] = formData.currentEducationLevel;
        if (formData.school) updates[`learningProfiles/${currentUser.uid}/school`] = formData.school;
        if (formData.learningMode) updates[`learningProfiles/${currentUser.uid}/learningMode`] = formData.learningMode;
        if (formData.interestAreas && formData.interestAreas.length > 0) updates[`learningProfiles/${currentUser.uid}/subjectInterests`] = formData.interestAreas.join(", ");
        updates[`learningProfiles/${currentUser.uid}/updatedAt`] = serverTimestamp();

        // Talent Profile
        if (formData.primaryTalentCategory) updates[`talentProfiles/${currentUser.uid}/category`] = formData.primaryTalentCategory;
        if (formData.specificTalent) updates[`talentProfiles/${currentUser.uid}/specificSkill`] = formData.specificTalent;
        if (formData.trainingLevel) updates[`talentProfiles/${currentUser.uid}/trainingLevel`] = formData.trainingLevel;
        updates[`talentProfiles/${currentUser.uid}/updatedAt`] = serverTimestamp();

        // Discovery Profile
        if (formData.hobbies) updates[`discoveryProfiles/${currentUser.uid}/hobbies`] = formData.hobbies;
        if (formData.personalityTraits && formData.personalityTraits.length > 0) updates[`discoveryProfiles/${currentUser.uid}/personalityTraits`] = formData.personalityTraits.join(", ");
        updates[`discoveryProfiles/${currentUser.uid}/updatedAt`] = serverTimestamp();
        // ---------------------

=======
        updates[`students/${currentUser.uid}/interestArea`] = formData.interestAreas[0] || "Not Sure Yet";
        updates[`students/${currentUser.uid}/futureGoal`] = formData.dreamCareer || formData.futurePreference[0] || "Not sure yet";
        updates[`students/${currentUser.uid}/skills`] = formData.skills;
        updates[`students/${currentUser.uid}/financialSupport`] = formData.financialSupport;
        updates[`students/${currentUser.uid}/learningMode`] = formData.learningMode;
        updates[`students/${currentUser.uid}/preferredDistrict`] = formData.preferredDistricts[0] || formData.district;
        updates[`students/${currentUser.uid}/profileUpdatedAfterPathway`] = false;

>>>>>>> origin/Sewmini
        const logRef = push(ref(database, "activityLogs"));
        updates[`activityLogs/${logRef.key}`] = {
            logId: logRef.key,
            uid: currentUser.uid,
            userName: formData.fullName,
            userRole: "student",
            actionType: "pathway_generated",
            description: `${formData.fullName} generated ${pathway}`,
            relatedEntityType: "pathwayResult",
            relatedEntityId: resultId,
            createdAt: serverTimestamp()
        };

        await update(ref(database), updates);
        await remove(ref(database, `pathwayDrafts/${currentUser.uid}`)).catch(() => {});
        renderGeneratedResult(result);
        showToast("Your pathway result was generated and saved.", "success");
        setTimeout(() => {
            window.location.href = "student-dashboard.html#pathway";
        }, 1400);
    } catch (error) {
        console.error(error);
        showToast(error?.message || "Could not generate your pathway.", "error");
    } finally {
        if (button) {
            button.disabled = false;
            button.innerHTML = original || 'Generate My Pathway <i class="fas fa-compass"></i>';
        }
    }
}

function buildResultPayload(resultId, data, pathway, score, summary, nextSteps, matches) {
    return {
        resultId,
        studentUid: currentUser.uid,
        studentName: data.fullName,
        studentEmail: data.email || currentUser.email || "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        basicProfile: {
            fullName: data.fullName,
            ageRange: data.ageRange,
            district: data.district,
            preferredLanguage: data.preferredLanguage,
            currentEducationLevel: data.currentEducationLevel
        },
        academicBackground: {
            olStatus: data.olStatus,
            olResultRange: data.olResultRange,
            alStatus: data.alStatus,
            alStream: data.alStream,
            alResultRange: data.alResultRange,
            mainSubjects: data.mainSubjects,
            bestSubjects: data.bestSubjects,
            weakSubjects: data.weakSubjects,
            englishLevel: data.englishLevel,
            itKnowledgeLevel: data.itKnowledgeLevel
        },
        interests: {
            interestAreas: data.interestAreas,
            enjoyableWorkTypes: data.enjoyableWorkTypes
        },
        skillsAndStrengths: {
            skills: data.skills,
            skillLevels: data.skillLevels,
            strengths: data.strengths
        },
        goals: {
            futurePreference: data.futurePreference,
            dreamCareer: data.dreamCareer,
            longTermGoal: data.longTermGoal
        },
        learningPreferences: {
            learningMode: data.learningMode,
            courseDuration: data.courseDuration,
            timeAvailability: data.timeAvailability,
            preferredDistricts: data.preferredDistricts,
            preferredLanguage: data.learningLanguage || data.preferredLanguage,
            courseTypePreference: data.courseTypePreference
        },
        supportNeeds: {
            financialSupport: data.financialSupport,
            budgetRange: data.budgetRange,
            biggestChallenge: data.biggestChallenge,
            supportNeeded: data.supportNeeded
        },
        recommendedPathway: pathway,
        pathwayScore: score,
        recommendationSummary: summary,
        nextSteps,
        recommendedCourseIds: matches.courseMatches.map((item) => item.courseId),
        recommendedScholarshipIds: matches.scholarshipMatches.map((item) => item.scholarshipId),
        recommendedMentorIds: matches.mentorMatches.map((item) => item.mentorUid),
        courseMatches: matches.courseMatches,
        scholarshipMatches: matches.scholarshipMatches,
        mentorMatches: matches.mentorMatches,
        status: "current",
        educationLevel: data.currentEducationLevel,
        interestArea: data.interestAreas[0] || "Not Sure Yet",
        skills: data.skills,
        futureGoal: data.dreamCareer || data.futurePreference[0] || "Not sure yet",
        financialSupport: data.financialSupport,
        learningMode: data.learningMode,
        preferredDistrict: data.preferredDistricts[0] || data.district,
        budgetRange: data.budgetRange,
        recommendedSkills: buildSkillGapPlan(data),
        careerPaths: [data.dreamCareer, ...data.futurePreference].filter(Boolean)
    };
}

async function buildMatches(data, pathway) {
    const [coursesSnap, scholarshipsSnap, mentorsSnap] = await Promise.all([
        get(ref(database, "courses")),
        get(ref(database, "scholarships")),
        get(query(ref(database, "mentors"), orderByChild("status"), equalTo("approved")))
    ]);
    return {
        courseMatches: Object.entries(coursesSnap.val() || {})
            .filter(([, item]) => normalize(item.status) === "active")
            .map(([id, item]) => scoreCourse(id, item, data, pathway))
            .sort((a, b) => b.matchScore - a.matchScore)
            .slice(0, 10),
        scholarshipMatches: Object.entries(scholarshipsSnap.val() || {})
            .filter(([, item]) => normalize(item.status) === "active")
            .map(([id, item]) => scoreScholarship(id, item, data))
            .sort((a, b) => b.matchScore - a.matchScore)
            .slice(0, 8),
        mentorMatches: Object.entries(mentorsSnap.val() || {})
            .filter(([, item]) => isApprovedActiveMentor(item))
            .map(([uid, item]) => scoreMentor(uid, item, data, pathway))
            .sort((a, b) => b.matchScore - a.matchScore)
            .slice(0, 8)
    };
}

function scoreCourse(id, course, data, pathway) {
    const reasons = [];
    const fields = [];
    let score = 0;
    addScore(matches(course.category || course.interestArea || course.name, [...data.interestAreas, pathway]), 25, "Interest/category match", "category");
    addScore(matches(course.educationLevel || course.qualificationLevel || course.eligibility, [data.currentEducationLevel]), 20, "Education level fits", "education");
    addScore(matches(course.futureGoal || course.careerOpportunities || course.careerPath, [data.dreamCareer, ...data.futurePreference]), 15, "Career goal alignment", "career");
    addScore(matches(course.skillsCovered || course.skills, data.skills), 10, "Builds selected skills", "skills");
    addScore(matches(course.learningMode || course.mode, [data.learningMode]), 10, "Learning mode match", "mode");
    addScore(matches(course.district || course.location, [data.district, ...data.preferredDistricts, "Online", "Islandwide"]), 10, "Location preference match", "district");
    addScore(matches(course.feeType || course.budgetRange || course.feeAmount, [data.financialSupport, data.budgetRange, data.courseTypePreference]), 10, "Budget/fee fit", "budget");
    return {
        courseId: id,
        courseName: course.courseName || course.name || "Course",
        instituteName: course.instituteName || course.institute || "Institute",
        matchScore: Math.min(score || 20, 100),
        matchReasons: reasons.length ? reasons : ["This is a useful option to explore."],
        matchedFields: fields,
        duration: course.duration || "",
        mode: course.mode || course.learningMode || "",
        fee: course.feeAmount || course.feeType || "",
        eligibility: course.eligibility || "",
        applyLink: course.applyLink || ""
    };
    function addScore(condition, points, reason, field) {
        if (condition) {
            score += points;
            reasons.push(reason);
            fields.push(field);
        }
    }
}

function scoreScholarship(id, item, data) {
    const reasons = [];
    let score = 0;
    addScore(needsFinancialHelp(data), 30, "Financial support need match");
    addScore(matches(item.educationLevel || item.qualificationLevel || item.eligibility, [data.currentEducationLevel]), 25, "Education level match");
    addScore(matches(item.district || item.coverage, [data.district, ...data.preferredDistricts, "Islandwide"]), 15, "District or islandwide support");
    addScore(matches(item.qualificationLevel || item.eligibility, [data.olResultRange, data.alResultRange, data.currentEducationLevel]), 15, "Qualification match");
    addScore(matches(item.category || item.interestArea, data.interestAreas), 10, "Category match");
    addScore(!item.deadline || getTime(item.deadline) >= Date.now(), 5, "Deadline active");
    return {
        scholarshipId: id,
        scholarshipName: item.scholarshipName || item.name || "Scholarship",
        provider: item.provider || "Provider",
        matchScore: Math.min(score || 15, 100),
        matchReasons: reasons.length ? reasons : ["Review eligibility and deadline."],
        eligibility: item.eligibility || "",
        amount: item.amount || item.benefit || item.supportType || "",
        deadline: item.deadline || "",
        applyLink: item.applyLink || ""
    };
    function addScore(condition, points, reason) {
        if (condition) {
            score += points;
            reasons.push(reason);
        }
    }
}

function scoreMentor(uid, mentor, data, pathway) {
    const reasons = [];
    let score = 0;
    addScore(matches(mentor.field || mentor.expertise || mentor.mentoringField, [...data.interestAreas, pathway]), 30, "Expertise matches your pathway");
    addScore(matches(mentor.guidanceAreas, [...data.supportNeeded, ...data.futurePreference, data.dreamCareer]), 20, "Guidance area fits your goals");
    addScore(matches(mentor.supportedStudentLevels || mentor.studentLevelsSupported, [data.currentEducationLevel]), 15, "Supports your education level");
    addScore(matches(mentor.languages || mentor.language || mentor.preferredLanguage, [data.preferredLanguage, data.learningLanguage]), 10, "Language preference match");
    addScore(Boolean(mentor.availableTime || mentor.availableDays || mentor.availabilityStatus === "active"), 10, "Availability listed");
    addScore(matches(mentor.mentoringMode || mentor.availability, [data.learningMode]), 10, "Mentoring mode match");
    addScore(Number(mentor.profileCompletion || 0) >= 70 || Number(mentor.experience || 0) > 0, 5, "Strong mentor profile");
    return {
        mentorUid: uid,
        mentorName: mentor.fullName || "Mentor",
        mentorField: mentor.field || mentor.mentoringField || "Mentor",
        matchScore: Math.min(score || 20, 100),
        matchReasons: reasons.length ? reasons : ["Approved mentor available for guidance."],
        experience: mentor.experience || "",
        photoURL: mentor.photoURL || ""
    };
    function addScore(condition, points, reason) {
        if (condition) {
            score += points;
            reasons.push(reason);
        }
    }
}

function isApprovedActiveMentor(mentor) {
    const userType = normalize(mentor.userType || mentor.role || "mentor");
    const accountStatus = normalize(mentor.accountStatus || "active");
    return normalize(mentor.status) === "approved"
        && userType === "mentor"
        && accountStatus === "active";
}

function determinePathway(data) {
    const interests = data.interestAreas.join(" ");
    const work = data.enjoyableWorkTypes.join(" ");
    const skills = data.skills.join(" ");
    const goals = [...data.futurePreference, data.dreamCareer].join(" ");
    if (/not sure/i.test(`${interests} ${work} ${goals}`)) return "General Exploration Pathway";
    if (/software|information technology/i.test(interests) && /computer|problem|software|programming/i.test(`${work} ${skills}`)) return "IT & Software Development";
    if (/engineering/i.test(interests) && /technical|problem|mathematics|practical/i.test(`${work} ${skills}`)) return "Engineering & Technology";
    if (/electronics|automobile|mechanical/i.test(interests)) return "Electronics & Technical Pathway";
    if (/accounting|finance/i.test(interests)) return "Accounting & Finance";
    if (/business|management/i.test(interests) || /business|income|stable/i.test(goals)) return "Business & Management";
    if (/medicine|health|nurse/i.test(`${interests} ${goals}`)) return "Health & Medical Support";
    if (/teaching|education|teacher/i.test(`${interests} ${goals}`)) return "Teaching & Education";
    if (/design|creative|media|communication/i.test(`${interests} ${work}`)) return "Design & Creative Media";
    if (/tourism|hospitality|hotel/i.test(`${interests} ${goals}`)) return "Tourism & Hospitality";
    if (/entrepreneur|business owner/i.test(`${interests} ${goals}`)) return "Entrepreneurship Pathway";
    if (/language|writing|communication/i.test(`${interests} ${work} ${skills}`)) return "Language & Communication Pathway";
    return "General Exploration Pathway";
}

function buildSummary(data, pathway, matches) {
    const mentorText = matches.mentorMatches.length || data.supportNeeded.includes("Mentor support") || data.biggestChallenge.includes("I need mentor guidance")
        ? " Mentor guidance is recommended so you can compare options with confidence."
        : "";
    return `${pathway} was selected because your interests, strengths, and goals point toward ${data.interestAreas.slice(0, 2).join(" and ") || "exploration"}. Focus first on foundation skills, then compare suitable courses and scholarships.${mentorText}`;
}

function buildFuturePlan(data, matches) {
    const plan = [
        "Build foundation skills in English, IT basics, and communication.",
        "Shortlist and save at least three suitable courses.",
        "Check eligibility, fees, location, and duration before applying.",
        "Save one scholarship or low-cost option if financial support is needed.",
        "Connect with an approved mentor for guidance.",
        "Create a portfolio, certificates, CV, or project evidence.",
        "Update your pathway again after 3 months or when your goals change."
    ];
    if (!matches.courseMatches.length) plan.splice(1, 1, "Explore all courses and update your pathway when new courses are added.");
    if (!needsFinancialHelp(data)) plan.splice(3, 1, "Compare payment plans, course value, and career outcomes.");
    return plan;
}

function buildSkillGapPlan(data) {
    const gaps = ["English", "IT basics", "Communication", "Portfolio", "Interview skills"];
    if (/software|it|technology/i.test(`${data.interestAreas.join(" ")} ${data.dreamCareer}`)) gaps.push("Programming basics");
    if (/business|account/i.test(`${data.interestAreas.join(" ")} ${data.dreamCareer}`)) gaps.push("Business thinking");
    if (/design|creative/i.test(`${data.interestAreas.join(" ")} ${data.dreamCareer}`)) gaps.push("Design portfolio");
    return [...new Set(gaps.filter((gap) => !data.skills.some((skill) => normalize(skill).includes(normalize(gap)))))];
}

function calculatePathwayScore(data, matches) {
    let score = 45;
    if (data.interestAreas.length) score += 10;
    if (data.skills.length || data.strengths.length) score += 10;
    if (data.dreamCareer && !/not sure/i.test(data.dreamCareer)) score += 10;
    if (matches.courseMatches[0]) score += Math.round(matches.courseMatches[0].matchScore * 0.12);
    if (matches.mentorMatches[0]) score += Math.round(matches.mentorMatches[0].matchScore * 0.08);
    if (needsFinancialHelp(data) && matches.scholarshipMatches[0]) score += 5;
    return Math.min(score, 100);
}

function renderGeneratedResult(result) {
    const section = document.getElementById("results-section");
    if (!section) return;
    section.classList.remove("hidden");
    setText("res-name", result.studentName);
    setText("res-interest", result.recommendedPathway);
    populateTags("rec-courses", result.courseMatches.map((item) => `${item.courseName} (${item.matchScore}%)`), "tag");
    populateTags("rec-skills", result.recommendedSkills, "tag skill");
    populateTags("rec-careers", [result.recommendedPathway, ...result.careerPaths], "tag career");
    const alerts = document.getElementById("dynamic-alerts");
    if (alerts) {
        alerts.innerHTML = `
            <div class="alert-box alert-success"><i class="fas fa-check-circle"></i><p>${escapeHtml(result.recommendationSummary)}</p></div>
            ${needsFinancialHelp(collectFormData()) ? `<div class="alert-box alert-warning"><i class="fas fa-hand-holding-usd"></i><p>Scholarship and free/low-cost options are highlighted for you.</p></div>` : ""}
        `;
    }
    const circle = document.getElementById("score-circle");
    if (circle) circle.setAttribute("stroke-dasharray", `${result.pathwayScore}, 100`);
    setText("score-text", `${result.pathwayScore}%`);
    section.scrollIntoView({ behavior: "smooth", block: "start" });
}

function bindShellInteractions() {
    document.querySelector(".hamburger")?.addEventListener("click", () => document.querySelector(".mobile-menu")?.classList.add("active"));
    document.querySelector(".close-btn")?.addEventListener("click", () => document.querySelector(".mobile-menu")?.classList.remove("active"));
    document.querySelectorAll(".faq-question").forEach((question) => {
        question.addEventListener("click", () => {
            const answer = question.nextElementSibling;
            const open = question.classList.contains("active");
            document.querySelectorAll(".faq-question").forEach((item) => {
                item.classList.remove("active");
                if (item.nextElementSibling) item.nextElementSibling.style.maxHeight = null;
            });
            if (!open) {
                question.classList.add("active");
                answer.style.maxHeight = `${answer.scrollHeight}px`;
            }
        });
    });
    const revealElements = document.querySelectorAll(".scroll-reveal");
    const reveal = () => revealElements.forEach((el) => {
        if (el.getBoundingClientRect().top < window.innerHeight - 100) el.classList.add("active");
    });
    reveal();
    window.addEventListener("scroll", reveal);
}

function checkedValues(name) {
    return Array.from(document.querySelectorAll(`[name="${CSS.escape(name)}"]:checked`)).map((item) => item.value);
}

function value(id) {
    return document.getElementById(id)?.value.trim() || "";
}

function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text ?? "";
}

function populateTags(containerId, items, classes) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = (items || []).slice(0, 10).map((item) => `<span class="${classes}">${escapeHtml(item)}</span>`).join("") || `<span class="text-muted">No matches yet</span>`;
}

function needsFinancialHelp(data) {
    return /scholarship|free|low|support|not sure/i.test(`${data.financialSupport} ${data.budgetRange}`);
}

function matches(source, targets) {
    const sourceTokens = tokenize(source);
    return sourceTokens.length > 0 && targets.filter(Boolean).some((target) => tokenize(target).some((token) => sourceTokens.includes(token)));
}

function tokenize(value) {
    if (Array.isArray(value)) return value.flatMap(tokenize);
    return String(value || "").toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 2);
}

function arrayValue(value) {
    if (Array.isArray(value)) return value.filter(Boolean);
    return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
}

function sanitizeForWrite(value) {
    if (Array.isArray(value)) return value.map(sanitizeForWrite);
    if (!value || typeof value !== "object") return value ?? "";
    return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).map(([key, item]) => [key, sanitizeForWrite(item)]));
}

function getTime(value, fallbackKey = "") {
    if (typeof value === "number") return value;
    const parsed = Date.parse(value || "");
    if (!Number.isNaN(parsed)) return parsed;
    return fallbackKey.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

function slug(value) {
    return normalize(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function normalize(value) {
    return String(value || "").trim().toLowerCase();
}

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
}

function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, "&#096;");
}
