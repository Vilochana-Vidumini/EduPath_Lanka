import {
    buildStudentRecommendationProfile,
    recommendCourses,
    recommendScholarships,
    recommendMentors,
    recommendInstitutes,
    recommendTalentOpportunities
} from "./recommendation-engine.js";

const sampleData = {
    courses: {
        business: { status: "active", publicVisibility: true, courseName: "Business Management", academicCategoryId: "academic_business_management", courseCategoryId: "course_business_management", category: "Business and Management", description: "Leadership, finance and entrepreneurship", skillsCovered: "leadership, communication, project management" },
        digital: { status: "active", publicVisibility: true, courseName: "Digital Marketing", academicCategoryId: "academic_business_management", courseCategoryId: "course_digital_marketing", category: "Marketing", description: "Digital marketing for business and creative entrepreneurs", skillsCovered: "digital marketing, communication" },
        accounting: { status: "active", courseName: "Accounting and Finance", category: "Commerce", description: "Accounting, finance and business analytics" },
        dance: { status: "active", courseName: "Dance Performance Certificate", category: "Arts and Dance", description: "Practical dance, choreography and performance", skillsCovered: "dancing, performance" },
        design: { status: "active", courseName: "Graphic Design and Digital Media", category: "Design", description: "Drawing, digital media and creative entrepreneurship" },
        foundation: { status: "active", courseName: "Foundation English and ICT", category: "Foundation", description: "Beginner English, ICT and academic support" },
        medicine: { status: "active", courseName: "Advanced Clinical Medicine", category: "Medicine", description: "Clinical medicine for qualified science students" },
        engineering: { status: "active", publicVisibility: true, courseName: "Electrical Engineering", academicCategoryId: "academic_engineering_technology", courseCategoryId: "course_electrical_engineering", category: "Engineering", description: "Mechanical systems and industrial engineering" }
    },
    scholarships: {
        businessWomen: { status: "active", publicVisibility: true, scholarshipName: "Women in Business Leadership Scholarship", scholarshipCategoryId: "scholarship_women_leadership", relatedAcademicCategoryIds: ["academic_business_management"], category: "Business", supportType: "Financial aid", description: "Women leadership and entrepreneurship", eligibility: "After A/L" },
        arts: { status: "active", publicVisibility: true, scholarshipName: "Performing Arts Talent Scholarship", scholarshipCategoryId: "scholarship_arts_scholarship", relatedTalentCategoryIds: ["cat_arts_dancing"], category: "Arts and Dance", description: "Dance and performance talent", eligibility: "Portfolio or achievement" },
        commerce: { status: "active", scholarshipName: "Commerce and Finance Scholarship", category: "Accounting Finance", description: "Commerce students with financial need", eligibility: "A/L results required" },
        general: { status: "active", publicVisibility: true, scholarshipName: "Youth Business and Entrepreneurship Scholarship", scholarshipCategoryId: "scholarship_business_and_management_scholarships", scholarshipCategoryTitle: "Business and Management Scholarships", relatedAcademicCategoryIds: ["academic_business_management"], relatedAcademicCategoryTitles: ["Business and Management"], eligiblePathways: ["academic", "combined", "undecided"], eligibleEducationLevels: ["After A/L", "Undergraduate"], matchingKeywords: ["youth", "business", "management", "entrepreneurship", "leadership"], category: "Business and Management", supportType: "Financial aid", description: "Youth business, management, entrepreneurship and leadership scholarship", eligibility: "After A/L or Undergraduate" }
    },
    mentors: {
        business: { status: "approved", approvalStatus: "approved", publicVisibility: true, mentoringEnabled: true, fullName: "Business Mentor", expertiseCategoryIds: ["mentor_business_mentor"], relatedAcademicCategoryIds: ["academic_business_management"], mentorType: "Business Mentor", expertise: "Business management entrepreneurship leadership", guidanceAreas: "Career, leadership, project management" },
        dance: { status: "approved", approvalStatus: "approved", publicVisibility: true, mentoringEnabled: true, fullName: "Dance Coach", expertiseCategoryIds: ["mentor_dance_coach"], relatedTalentCategoryIds: ["cat_arts_dancing"], mentorType: "Arts Coach", expertise: "Dance choreography performing arts", guidanceAreas: "Dance performance portfolio" },
        career: { status: "approved", approvalStatus: "approved", publicVisibility: true, mentoringEnabled: true, fullName: "Career Guide", mentorType: "Career Guidance", expertise: "Career discovery pathway guidance", guidanceAreas: "Career planning and study choices" },
        medicine: { status: "approved", approvalStatus: "approved", publicVisibility: true, mentoringEnabled: true, fullName: "Medical Mentor", mentorType: "Medical", expertise: "Clinical medicine surgery", guidanceAreas: "Medical school" },
        electrical: { status: "approved", approvalStatus: "approved", publicVisibility: true, mentoringEnabled: true, fullName: "Electrical Design Engineer", expertiseCategoryIds: ["mentor_engineering_mentor"], relatedAcademicCategoryIds: ["academic_engineering_technology"], field: "Electrical and Electronic Engineering", role: "Electrical Design Engineer", expertise: "Power systems, embedded systems, telecommunications", guidanceAreas: "Engineering", supportedStudentLevels: "After A/L", languages: "English", availability: "Flexible" }
    },
    opportunities: {
        danceWorkshop: { status: "active", publicVisibility: true, title: "Intermediate Dance Workshop", categoryId: "cat_arts_dancing", opportunityCategoryId: "opportunity_workshop", category: "Arts", subCategory: "Dancing", opportunityType: "Workshop", eligibleSkillLevels: "Intermediate" },
        danceCompetition: { status: "open", publicVisibility: true, title: "Cultural Dance Competition", categoryId: "cat_arts_dancing", opportunityCategoryId: "opportunity_competition", category: "Arts", subCategory: "Dance", opportunityType: "Competition and performance" },
        football: { status: "active", publicVisibility: true, title: "Football Training Camp", categoryId: "cat_sports_football", opportunityCategoryId: "opportunity_training", category: "Sports", subCategory: "Football", opportunityType: "Training" },
        artShow: { status: "active", title: "Drawing and Digital Art Exhibition", category: "Arts", subCategory: "Drawing", opportunityType: "Competition and portfolio showcase" }
    },
    institutes: {
        businessSchool: { status: "approved", publicVisibility: true, name: "Business Leadership Institute", relatedAcademicCategoryIds: ["academic_business_management"], providerCategoryId: "provider_private_institute", location: "Colombo", recognition: "Recognized" },
        artsAcademy: { status: "approved", publicVisibility: true, name: "National Dance Academy", relatedTalentCategoryIds: ["cat_arts_dancing"], providerCategoryId: "provider_creative_arts_academy", location: "Colombo", recognition: "Recognized" },
        foundationCenter: { status: "approved", publicVisibility: true, name: "Foundation Skills Centre", providerCategoryId: "provider_training_center", location: "Gampaha", recognition: "Recognized" }
    }
};

function runCase(name, sources, expectations) {
    const profile = buildStudentRecommendationProfile(sources);
    const results = {
        profile,
        courses: recommendCourses(profile, sampleData.courses).slice(0, 10),
        scholarships: recommendScholarships(profile, sampleData.scholarships).slice(0, 10),
        mentors: recommendMentors(profile, sampleData.mentors, profile.uid).slice(0, 10),
        institutes: recommendInstitutes(profile, sampleData.institutes, sampleData.courses, sampleData.opportunities, sampleData.scholarships).slice(0, 10),
        opportunities: recommendTalentOpportunities(profile, sampleData.opportunities).slice(0, 10)
    };
    const itemTitle = (item) => String(item.courseName || item.scholarshipName || item.mentorName || item.instituteName || item.name || item.opportunityName || "");
    const notes = expectations.map(({ type, keywords, reject = [], exclude = [] }) => {
        const rows = results[type] || [];
        const topRows = rows.slice(0, 5);
        const missingExpected = keywords.filter((word) => !topRows.some((item) => itemTitle(item).toLowerCase().includes(word.toLowerCase())));
        const wrongRecommendations = rows.filter((item, index) => {
            const title = itemTitle(item).toLowerCase();
            return (index < 2 && reject.some((word) => title.includes(word.toLowerCase()))) || exclude.some((word) => title.includes(word.toLowerCase()));
        });
        return {
            type,
            pass: missingExpected.length < keywords.length && wrongRecommendations.length === 0,
            expected: keywords,
            actual: topRows,
            missingExpected,
            wrongRecommendations,
            rejectedAtTop: reject,
            excludedEntirely: exclude
        };
    });
    const pass = notes.every(note => note.pass);
    console.group(`${pass ? "PASS" : "FAIL"}: ${name}`);
    console.log("student profile", profile);
    Object.entries(results).filter(([key]) => key !== "profile").forEach(([key, rows]) => console.table(rows.map(row => ({ name: row.courseName || row.scholarshipName || row.mentorName || row.name || row.opportunityName, score: row.matchScore, level: row.matchLevel, reason: row.matchReasons?.[0], eligibility: row.eligibilityStatus }))));
    console.table(notes);
    console.groupEnd();
    return { name, pass, notes, results };
}

export function testCombinedBusinessDancingStudent() { return runCase("Combined: business + dancing", { uid:"medha", student:{pathwayPreference:"combined",educationLevel:"After A/L"}, learningProfile:{alStream:"Physical Science",academicCategoryId:"academic_business_management",academicCategoryTitle:"Business and Management",preferredFields:"Business and Management",careerGoals:"Business management professional, entrepreneur",skillsToImprove:"Leadership, communication, financial literacy, project management, digital marketing, English speaking"}, talentProfile:{talentCategoryId:"cat_arts_dancing",talentCategoryTitle:"Dancing",primaryTalentCategory:"Dancing",specificTalent:"Kandyan Dancing and Modern Dancing",trainingLevel:"Intermediate",yearsOfExperience:5,talentGoals:"Continue dancing while studying business",preferredOpportunities:"Courses, scholarships, workshops, competitions, coaches, performance"} }, [{type:"courses",keywords:["business","marketing"],reject:["medicine"]},{type:"mentors",keywords:["business","dance"],reject:["medical"],exclude:["electrical"]},{type:"scholarships",keywords:["business","arts"]},{type:"opportunities",keywords:["dance"],reject:["football"]}]); }
export function testTalentOnlyDancingStudent() { return runCase("Talent-only: dancing", {student:{pathwayPreference:"talent"},talentProfile:{talentCategoryId:"cat_arts_dancing",talentCategoryTitle:"Dancing",primaryTalentCategory:"Dancing",specificTalent:"Kandyan Dancing and Modern Dancing",trainingLevel:"Intermediate",preferredOpportunities:"workshops, competitions, performance"}}, [{type:"courses",keywords:["dance"]},{type:"mentors",keywords:["dance"]},{type:"opportunities",keywords:["dance"],reject:["football"]}]); }
export function testAcademicBusinessStudent() { return runCase("Academic: business", {student:{pathwayPreference:"academic",educationLevel:"After A/L"},learningProfile:{alStream:"Commerce",academicCategoryId:"academic_business_management",academicCategoryTitle:"Business and Management",preferredFields:"Business and Management",careerGoals:"Business professional, entrepreneur"}}, [{type:"courses",keywords:["business","marketing"]},{type:"mentors",keywords:["business"],exclude:["electrical"]},{type:"scholarships",keywords:["business"]}]); }
export function testAcademicEngineeringStudent() { return runCase("Academic: engineering", {student:{pathwayPreference:"academic",educationLevel:"After A/L"},learningProfile:{alStream:"Physical Science",academicCategoryId:"academic_engineering_technology",academicCategoryTitle:"Engineering and Technology",preferredFields:"Electrical Engineering",careerGoals:"Electrical engineer"}}, [{type:"courses",keywords:["electrical"],reject:["business"]},{type:"mentors",keywords:["electrical"],exclude:["dance"]}]); }
export function testUndecidedStudent() { return runCase("Undecided explorer", {student:{pathwayPreference:"undecided"},discoveryProfile:{hobbies:"technology, business, creative work",preferredRoles:"entrepreneur"}}, [{type:"courses",keywords:["foundation","business","digital"]},{type:"mentors",keywords:["career"]},{type:"scholarships",keywords:["youth","business"]}]); }
export function testCombinedArtsDrawingStudent() { return runCase("Combined: digital media + drawing", {student:{pathwayPreference:"combined",educationLevel:"After A/L"},learningProfile:{alStream:"Arts",preferredFields:"Digital Media",careerGoals:"Creative entrepreneur"},talentProfile:{primaryTalentCategory:"Arts",specificTalent:"Drawing",trainingLevel:"Intermediate",preferredOpportunities:"competitions, portfolio showcase"}}, [{type:"courses",keywords:["design","digital"]},{type:"opportunities",keywords:["art","drawing"]}]); }
export function runRecommendationTestSuite() { const tests=[testCombinedBusinessDancingStudent(),testTalentOnlyDancingStudent(),testAcademicBusinessStudent(),testAcademicEngineeringStudent(),testUndecidedStudent()]; console.table(tests.map(t=>({test:t.name,pass:t.pass}))); return tests; }
if (typeof window !== "undefined") window.runRecommendationTestSuite = runRecommendationTestSuite;


if (typeof process !== "undefined" && process.argv?.[1]?.endsWith("recommendation-test-helper.js")) { const results=runRecommendationTestSuite(); process.exitCode=results.every(test=>test.pass)?0:1; }


