// recommendation-engine.js
import { normalizeList } from "./mentorship-utils.js";

// Utility helpers for normalization
export function normalize(value) {
    if (typeof value === "boolean") return value;
    if (value === undefined || value === null) return "";
    return String(value).trim().toLowerCase();
}

export function includesAny(target, searchKeys) {
    if (!target || !searchKeys) return false;
    const targetArray = Array.isArray(target) ? target : normalizeList(target);
    const searchArray = Array.isArray(searchKeys) ? searchKeys : normalizeList(searchKeys);
    if (!targetArray.length || !searchArray.length) return false;
    const tString = targetArray.map(normalize).join(" ");
    return searchArray.some(key => key && tString.includes(normalize(key)));
}

export function hasValue(value) {
    if (Array.isArray(value)) return value.length > 0 && value.some(Boolean);
    return value !== undefined && value !== null && String(value).trim() !== "";
}

function normalizeLearningProfile(profile = {}) {
    return {
        currentEducationLevel: profile.currentEducationLevel || "",
        educationLevel: profile.currentEducationLevel || "",
        qualification: profile.currentQualification || "",
        alStream: profile.academicResults?.alStream || "",
        interestAreas: profile.preferredFields || [],
        careerGoals: profile.careerGoals || [],
        researchInterests: profile.researchInterests || [],
        skillsToImprove: profile.skillsToImprove || [],
        preferredCourseLevels: profile.preferredCourseLevels || [],
        preferredStudyModes: profile.preferredStudyModes || [],
        preferredLanguages: profile.preferredLanguages || [],
        preferredLocations: profile.preferredLocations || [],
        budgetMin: Number(profile.budgetMin || 0),
        budgetMax: Number(profile.budgetMax || Infinity),
        financialSupportNeeded: profile.financialSupportNeeded === true,
        preferredDurationMonths: Number(profile.preferredDurationMonths || 12),
        preferredScholarshipLevels: profile.preferredScholarshipLevels || [],
        preferredCountries: profile.preferredCountries || [],
        supportNeeded: profile.supportNeeded || [],
        preferredMentorFields: profile.preferredMentorFields || [],
        preferredMentorType: profile.preferredMentorType || [],
        preferredMentoringModes: profile.preferredMentoringModes || [],
        preferredSessionDuration: Number(profile.preferredSessionDuration || 60)
    };
}

export function normalizeStudentProfile(result = {}, student = {}) {
    return {
        currentEducationLevel: result.basicProfile?.currentEducationLevel || result.educationLevel || student.educationLevel || "",
        educationLevel: result.educationLevel || result.basicProfile?.currentEducationLevel || student.educationLevel || "",
        alStream: result.academicBackground?.alStream || result.examStream || "",
        interestAreas: result.interests?.interestAreas || normalizeList(result.interestArea || student.interestArea),
        careerGoals: result.goals?.futurePreference || [result.goals?.dreamCareer || result.futureGoal || student.futureGoal],
        researchInterests: [],
        skillsToImprove: result.skillsAndStrengths?.skills || normalizeList(result.skills || student.skills),
        preferredCourseLevels: [],
        preferredStudyModes: result.learningPreferences?.learningMode || result.learningMode || student.learningMode ? [result.learningPreferences?.learningMode || result.learningMode || student.learningMode] : [],
        preferredLanguages: result.basicProfile?.preferredLanguage || result.learningPreferences?.preferredLanguage ? [result.basicProfile?.preferredLanguage || result.learningPreferences?.preferredLanguage] : [],
        preferredLocations: result.learningPreferences?.preferredDistricts || normalizeList(result.preferredDistrict || student.preferredDistrict || student.district),
        budgetMin: 0,
        budgetMax: Number(result.supportNeeds?.budgetRange || result.budgetRange || Infinity),
        financialSupportNeeded: !!(result.supportNeeds?.financialSupport || result.financialSupport || student.financialSupport),
        preferredDurationMonths: Number(result.learningPreferences?.courseDuration || 12),
        preferredScholarshipLevels: [],
        preferredCountries: [],
        supportNeeded: result.supportNeeds?.supportNeeded || [],
        preferredMentorFields: [],
        preferredMentorType: [],
        preferredMentoringModes: [],
        preferredSessionDuration: 60
    };
}

export function getLearnerRecommendationProfile({ userRole, studentProfile, learningProfile, pathwayResult, talentProfile, discoveryProfile }) {
    if (userRole === "mentor" && learningProfile) {
        return normalizeLearningProfile(learningProfile);
    }
    return buildStudentRecommendationProfile({
        studentProfile: { ...studentProfile, ...pathwayResult },
        learningProfile,
        talentProfile,
        discoveryProfile
    });
}

export function normalizeTalentProfile(profile = {}) {
    return {
        talents: profile.talents || [],
        achievements: profile.achievements || [],
        preferredOpportunities: profile.preferredOpportunities || [],
        preferredLocations: profile.preferredLocations || [],
        preferredModes: profile.preferredModes || [],
        availability: profile.availability || []
    };
}

export function normalizeDiscoveryProfile(profile = {}) {
    return {
        enjoyedActivities: profile.enjoyedActivities || [],
        preferredWorkStyle: profile.preferredWorkStyle || "",
        practicalPreference: profile.practicalPreference || "",
        favoriteSubjects: profile.favoriteSubjects || [],
        interests: profile.interests || [],
        workEnvironment: profile.workEnvironment || "",
        confidenceAreas: profile.confidenceAreas || [],
        skillsToExplore: profile.skillsToExplore || []
    };
}

export function buildStudentRecommendationProfile({ studentProfile = {}, learningProfile = {}, talentProfile = {}, discoveryProfile = {} }) {
    const mode = studentProfile.pathwayPreference || "undecided";
    
    return {
        mode,
        useAcademicProfile: mode === "academic" || mode === "combined",
        useTalentProfile: mode === "talent" || mode === "combined",
        useDiscoveryProfile: mode === "undecided",
        
        academic: normalizeStudentProfile({}, learningProfile && Object.keys(learningProfile).length > 0 ? learningProfile : studentProfile),
        talent: normalizeTalentProfile(talentProfile),
        discovery: normalizeDiscoveryProfile(discoveryProfile),
        
        // Include flat properties for backward compatibility with existing recommendation functions
        ...normalizeStudentProfile({}, studentProfile)
    };
}

// ----------------------------------------------------------------------
// RECOMMENDATION PIPELINE LOGIC
// ----------------------------------------------------------------------

function isActiveVisibility(status, publicVisibility) {
    const s = normalize(status);
    if (!["active", "published"].includes(s)) return false;
    if (publicVisibility === false) return false;
    return true;
}

// COURSE RECOMMENDATIONS
export function recommendCourses(profile, coursesObj) {
    const courses = Object.entries(coursesObj || {}).map(([id, data]) => ({ courseId: id, ...data }));
    
    // Stage 1: Visibility
    const visible = courses.filter(c => isActiveVisibility(c.status, c.publicVisibility) && !c.archived);
    
    // Stage 2, 3, 4: Eligibility, Scoring, Reason generation
    const recommendations = visible.map(course => {
        let score = 0;
        const reasons = [];
        const missing = [];
        let eligible = true;

        // Eligibility (Mandatory Checks) - example simple checking
        if (course.minimumEducationLevel && profile.currentEducationLevel && normalize(course.minimumEducationLevel) !== normalize(profile.currentEducationLevel)) { // In real app, order levels
            eligible = false;
            missing.push(`Requires ${course.minimumEducationLevel}`);
        }
        
        if (eligible) {
            // Field Match: 25
            if (includesAny([course.category, course.subcategory, course.description, course.skillsCovered, course.careerOpportunities], profile.interestAreas)) {
                score += 25;
                reasons.push("Matches your preferred field");
            }
            // Career Goal Match: 20
            if (includesAny([course.careerOpportunities, course.description, course.category], profile.careerGoals)) {
                score += 20;
                reasons.push("Supports your career goal");
            }
            // Qualification Match: 15
            if (includesAny([course.qualificationLevel, course.educationLevel], [profile.currentEducationLevel, ...profile.preferredCourseLevels])) {
                score += 15;
                reasons.push("Suitable for your current qualification");
            }
            // Skill Development Match: 15
            if (includesAny([course.skillsCovered, course.description], profile.skillsToImprove)) {
                score += 15;
                reasons.push("Develops your target skills");
            }
            // Study Mode Match: 10
            if (includesAny(course.mode || course.learningMode, profile.preferredStudyModes)) {
                score += 10;
                reasons.push("Available in your preferred study mode");
            }
            // Budget Match: 5
            const fee = Number(course.feeAmount || course.fee || 0);
            if (fee <= profile.budgetMax) {
                score += 5;
                reasons.push("Fits your budget");
            }
            // Language Match: 5
            if (includesAny(course.language, profile.preferredLanguages)) {
                score += 5;
                reasons.push("Available in your preferred language");
            }
            // Location Match: 5
            if (includesAny([course.district, course.location], profile.preferredLocations)) {
                score += 5;
                reasons.push("Available in your preferred location");
            }
        }

        const matchScore = Math.min(100, Math.round(score));
        let matchLevel = "";
        if (matchScore >= 85) matchLevel = "Excellent Match";
        else if (matchScore >= 70) matchLevel = "Strong Match";
        else if (matchScore >= 55) matchLevel = "Good Match";
        else if (matchScore >= 40) matchLevel = "Possible Match";
        else matchLevel = "Low Match";

        return {
            ...course,
            courseName: course.courseName || course.name || "Untitled Course",
            instituteName: course.instituteName || course.institute || "Institute not specified",
            matchScore,
            matchLevel,
            matchReasons: reasons.length ? reasons : ["Useful alternative based on your pathway."],
            missingRequirements: missing,
            eligibilityStatus: eligible ? "eligible" : "ineligible"
        };
    });

    // Sort: score desc
    return recommendations.filter(r => r.eligibilityStatus === "eligible").sort((a, b) => b.matchScore - a.matchScore);
}

// SCHOLARSHIP RECOMMENDATIONS
export function recommendScholarships(profile, scholarshipsObj) {
    const scholarships = Object.entries(scholarshipsObj || {}).map(([id, data]) => ({ scholarshipId: id, ...data }));
    
    const visible = scholarships.filter(s => isActiveVisibility(s.status, s.publicVisibility) && !s.archived && (!s.deadline || new Date(s.deadline) >= new Date()));

    const recommendations = visible.map(scholarship => {
        let score = 0;
        const reasons = [];
        const missing = [];
        let eligible = true;

        // Eligibility (Mandatory Checks)
        if (scholarship.minimumAge && profile.age && profile.age < scholarship.minimumAge) { eligible = false; missing.push("Does not meet minimum age."); }
        if (scholarship.country && profile.preferredCountries && profile.preferredCountries.length > 0 && !includesAny(scholarship.country, profile.preferredCountries)) { eligible = false; missing.push("Country not preferred."); }

        if (eligible) {
            // Study Level Match: 25
            if (includesAny([scholarship.educationLevel, scholarship.studyLevel, scholarship.qualificationLevel, scholarship.eligibleEducationLevels, scholarship.eligibleStudyLevels], [profile.currentEducationLevel, ...profile.preferredScholarshipLevels])) {
                score += 25;
                reasons.push("You meet the study-level requirement");
            }
            // Field Match: 25
            if (includesAny([scholarship.category, scholarship.eligibleFields, scholarship.description], profile.interestAreas)) {
                score += 25;
                reasons.push("Matches your preferred field");
            }
            // Academic Match: 20
            if (includesAny([scholarship.qualificationLevel, scholarship.eligibility], [profile.alStream, profile.qualification])) {
                score += 20;
                reasons.push("Matches your academic background");
            }
            // Financial Need Match: 15
            if (profile.financialSupportNeeded && includesAny([scholarship.supportType, scholarship.description, scholarship.fundingCoverage], ["bursary", "financial aid", "scholarship", "free", "monthly support", "tuition support"])) {
                score += 15;
                reasons.push("Matches your financial support needs");
            }
            // Country Match: 5
            if (includesAny(scholarship.country, profile.preferredCountries)) {
                score += 5;
                reasons.push("Available in preferred country");
            }
            // Career Goal Match: 5
            if (includesAny([scholarship.category, scholarship.description], profile.careerGoals)) {
                score += 5;
                reasons.push("Aligns with career goals");
            }
            // Achievement Match: 5
            if (includesAny(scholarship.achievementRequirements, profile.skillsToImprove)) { // approximation
                score += 5;
            }
        }

        const matchScore = Math.min(100, Math.round(score));
        let matchLevel = matchScore >= 85 ? "Excellent Match" : matchScore >= 70 ? "Strong Match" : matchScore >= 55 ? "Good Match" : matchScore >= 40 ? "Possible Match" : "Low Match";

        return {
            ...scholarship,
            scholarshipName: scholarship.scholarshipName || scholarship.name || "Scholarship",
            provider: scholarship.provider || "Provider not specified",
            matchScore,
            matchLevel,
            matchReasons: reasons.length ? reasons : ["Review eligibility and provider details."],
            missingRequirements: missing,
            eligibilityStatus: eligible ? "eligible" : "ineligible"
        };
    });

    return recommendations.filter(r => r.eligibilityStatus === "eligible").sort((a, b) => b.matchScore - a.matchScore);
}

// INSTITUTE RECOMMENDATIONS
export function recommendInstitutes(profile, institutesObj, coursesObj) {
    const institutes = Object.entries(institutesObj || {}).map(([id, data]) => ({ instituteId: id, ...data }));
    const courses = Object.entries(coursesObj || {}).map(([id, data]) => ({ courseId: id, ...data }));
    
    const visible = institutes.filter(i => isActiveVisibility(i.status, i.publicVisibility));

    const recommendations = visible.map(institute => {
        let score = 0;
        const reasons = [];
        const missing = [];
        let eligible = true;
        
        const matchingCourses = courses.filter(c => c.instituteId === institute.instituteId && includesAny([c.category, c.subcategory, c.description], profile.interestAreas));

        if (eligible) {
            // Matching Courses: 35
            if (matchingCourses.length > 0) {
                score += Math.min(35, matchingCourses.length * 10);
                reasons.push("Offers multiple matching courses");
            }
            // Field Match: 20
            if (includesAny(institute.specialties || institute.description || institute.categories, profile.interestAreas)) {
                score += 20;
                reasons.push("Specializes in your preferred field");
            }
            // Location Match: 15
            if (includesAny([institute.district, institute.location, institute.country], profile.preferredLocations)) {
                score += 15;
                reasons.push("Available in your preferred location");
            }
            // Study Mode Match: 10
            if (includesAny([institute.availableModes, institute.studyModes], profile.preferredStudyModes)) {
                score += 10;
                reasons.push("Supports your study mode");
            }
            // Budget Compatibility: 10
            score += 10; // Approximation if missing data
            // Recognition or Accreditation: 5
            if (hasValue(institute.accreditation) || hasValue(institute.recognition)) {
                score += 5;
                reasons.push("Recognized/Accredited institute");
            }
            // Language Match: 5
            if (includesAny(institute.languages, profile.preferredLanguages)) {
                score += 5;
            }
        }

        const matchScore = Math.min(100, Math.round(score));
        let matchLevel = matchScore >= 85 ? "Excellent Match" : matchScore >= 70 ? "Strong Match" : matchScore >= 55 ? "Good Match" : matchScore >= 40 ? "Possible Match" : "Low Match";

        return {
            ...institute,
            matchingCourseCount: matchingCourses.length,
            matchScore,
            matchLevel,
            matchReasons: reasons,
            missingRequirements: missing,
            eligibilityStatus: eligible ? "eligible" : "ineligible"
        };
    });

    return recommendations.filter(r => r.eligibilityStatus === "eligible").sort((a, b) => b.matchScore - a.matchScore);
}

// MENTOR RECOMMENDATIONS
export function recommendMentors(profile, mentorsObj, currentUid) {
    const mentors = Object.entries(mentorsObj || {}).map(([id, data]) => ({ uid: id, ...data }));
    
    // Mandatory filters: approved, active, public, mentoring enabled, not suspended, not full capacity, not current user
    const visible = mentors.filter(m => 
        (normalize(m.approvalStatus || m.status) === "approved") && 
        m.publicVisibility === true && 
        m.mentoringEnabled === true && 
        m.uid !== currentUid
    );

    const recommendations = visible.map(mentor => {
        let score = 0;
        const reasons = [];
        const missing = [];
        let eligible = true;

        if (eligible) {
            // Expertise Match: 30
            if (includesAny([mentor.field, mentor.expertise, mentor.mentoringField, mentor.shortBio, mentor.bio], profile.interestAreas || profile.preferredMentorFields)) {
                score += 30;
                reasons.push("Matches your research interest");
            }
            // Guidance Area Match: 20
            if (includesAny(mentor.guidanceAreas, profile.supportNeeded)) {
                score += 20;
                reasons.push("Supports your required guidance areas");
            }
            // Research or Topic Match: 15
            if (includesAny([mentor.shortBio, mentor.bio, mentor.expertise], profile.researchInterests)) {
                score += 15;
                reasons.push("Aligns with your research topics");
            }
            // Supported Education Level: 10
            if (includesAny(mentor.supportedStudentLevels || mentor.studentLevelsSupported, [profile.currentEducationLevel])) {
                score += 10;
                reasons.push(`Supports ${profile.currentEducationLevel || "your"} learners`);
            }
            // Language Match: 10
            if (includesAny(mentor.languages || mentor.language || mentor.preferredLanguage || mentor.preferredLanguages, profile.preferredLanguages)) {
                score += 10;
                reasons.push("Communicates in your preferred language");
            }
            // Mentoring Mode Match: 5
            if (includesAny(mentor.mentoringMode || mentor.availability, profile.preferredMentoringModes)) {
                score += 5;
                reasons.push("Matches your mentoring mode");
            }
            // Availability Match: 5
            score += 5; // Standard default

            // Rating: 3, Capacity: 2
            score += 5;
        }

        const matchScore = Math.min(100, Math.round(score));
        let matchLevel = matchScore >= 85 ? "Excellent Match" : matchScore >= 70 ? "Strong Match" : matchScore >= 55 ? "Good Match" : matchScore >= 40 ? "Possible Match" : "Low Match";

        return {
            ...mentor,
            mentorName: mentor.fullName || "Mentor",
            mentorField: mentor.field || mentor.expertise || mentor.mentoringField || "N/A",
            mentorType: mentor.mentorType || "Mentor",
            matchScore,
            matchLevel,
            matchReasons: reasons.length ? reasons : ["Approved mentor available for guidance."],
            missingRequirements: missing,
            eligibilityStatus: eligible ? "eligible" : "ineligible"
        };
    });

    return recommendations.filter(r => r.eligibilityStatus === "eligible").sort((a, b) => b.matchScore - a.matchScore);
}

// TALENT OPPORTUNITY RECOMMENDATIONS
export function recommendTalentOpportunities(profile, opportunitiesObj) {
    const opportunities = Object.entries(opportunitiesObj || {}).map(([id, data]) => ({ opportunityId: id, ...data }));
    
    // Stage 1: Visibility
    const visible = opportunities.filter(o => isActiveVisibility(o.status, o.publicVisibility) && (!o.deadline || new Date(o.deadline) >= new Date()));
    
    // Stage 2, 3, 4: Eligibility, Scoring, Reason generation
    const recommendations = visible.map(opp => {
        let score = 0;
        const reasons = [];
        const missing = [];
        let eligible = "eligible"; // 'eligible', 'ineligible', 'unknown'

        // Check age eligibility
        if (opp.eligibleAgeMin && profile.age && profile.age < opp.eligibleAgeMin) {
            eligible = "ineligible";
            missing.push("Does not meet minimum age.");
        }
        if (opp.eligibleAgeMax && profile.age && profile.age > opp.eligibleAgeMax) {
            eligible = "ineligible";
            missing.push("Exceeds maximum age.");
        }

        if (eligible !== "ineligible") {
            const talents = profile.talent?.talents || [];
            const talentCategories = talents.map(t => t.category);
            const talentSkills = talents.map(t => t.skill);

            // Talent Match: 30
            if (includesAny([opp.category, opp.subCategory], talentCategories) || includesAny(opp.title, talentSkills)) {
                score += 30;
                reasons.push("Matches your talent category");
            }

            // Skill Level Match: 20
            if (opp.eligibleSkillLevels && opp.eligibleSkillLevels.length > 0) {
                const userSkillLevels = talents.map(t => t.skillLevel);
                if (includesAny(opp.eligibleSkillLevels, userSkillLevels)) {
                    score += 20;
                    reasons.push("Matches your skill level");
                }
            } else {
                score += 20; // Default if not specified
            }

            // Achievement Match: 15
            score += 15; // approximation

            // Opportunity Preference: 10
            if (includesAny(opp.opportunityType, profile.talent?.preferredOpportunities)) {
                score += 10;
                reasons.push("Matches preferred opportunity type");
            }

            // Location Match: 10
            if (includesAny(opp.location, profile.talent?.preferredLocations)) {
                score += 10;
                reasons.push("Available in your preferred location");
            }

            // Age Eligibility: 5
            score += 5;
            
            // Availability Match: 5
            score += 5;

            // Mode Match: 5
            if (includesAny(opp.mode, profile.talent?.preferredModes)) {
                score += 5;
                reasons.push("Matches preferred mode");
            }
        }

        const matchScore = Math.min(100, Math.round(score));
        let matchLevel = "";
        if (matchScore >= 85) matchLevel = "Excellent Match";
        else if (matchScore >= 70) matchLevel = "Strong Match";
        else if (matchScore >= 55) matchLevel = "Good Match";
        else if (matchScore >= 40) matchLevel = "Possible Match";
        else matchLevel = "Explore Option";

        return {
            ...opp,
            opportunityName: opp.title || "Untitled Opportunity",
            matchScore,
            matchLevel,
            matchReasons: reasons.length ? reasons : ["Explore this talent opportunity."],
            missingRequirements: missing,
            eligibilityStatus: eligible
        };
    });

    // Sort: score desc
    return recommendations.filter(r => r.eligibilityStatus !== "ineligible").sort((a, b) => b.matchScore - a.matchScore);
}
