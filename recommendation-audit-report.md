# EduPath Lanka Recommendation System Audit

Audit date: 18 July 2026

## 1. Executive summary

The recommendation system previously had two different scoring implementations: `recommendation-engine.js` was used by mentor learning, while `student-dashboard.js` calculated courses, scholarships, and mentors with separate rules. Institute and talent-opportunity suggestions were not shown on the student dashboard. Incomplete profiles could also be treated as weak matches instead of receiving appropriate exploratory suggestions.

The system now uses one shared, deterministic engine for courses, scholarships, mentors, institutes, and arts/sports/talent opportunities. It combines all available student profile sources, applies rules for Academic, Talent, Combined, Undecided, and Academic Improvement paths, filters unavailable content, shows scores and reasons, and gives scholarship eligibility guidance. Six local persona tests pass.

## 2. System map

| Responsibility | File/functions | Result location |
|---|---|---|
| Normalize student data | `recommendation-engine.js`: `buildStudentRecommendationProfile`, `normalizeStudentProfile` | Shared normalized profile |
| Course scoring | `scoreCourseRecommendation`, `recommendCourses` | Dashboard Courses and overview |
| Scholarship scoring | `scoreScholarshipRecommendation`, `recommendScholarships` | Dashboard Scholarships and overview |
| Mentor scoring | `scoreMentorRecommendation`, `recommendMentors` | Dashboard Mentors and overview; mentor-learning consumer remains compatible |
| Institute scoring | `scoreInstituteRecommendation`, `recommendInstitutes` | Student overview Suggested Institutes |
| Opportunity scoring | `scoreTalentOpportunityRecommendation`, `recommendTalentOpportunities` | Student overview Talent-Based Opportunities |
| Live data and rendering | `student-dashboard.js` | `student-dashboard.html` recommendation cards |
| Development tests | `recommendation-test-helper.js` | Browser/developer console only |

`pathway.js` continues to create pathway results. Catalog pages such as `courses.js`, `scholarships.js`, and `talent-opportunities.js` remain browse/search pages; personalized ranking is performed on the authenticated student dashboard. `institutes.html` is a public information page and there is no separate `institutes.js` recommendation implementation.

## 3. Firebase paths

Student profile reads: `users/{uid}`, `students/{uid}`, `studentProfiles/{uid}` (including `personal` and compatible nested fields), `learningProfiles/{uid}`, `talentProfiles/{uid}`, `discoveryProfiles/{uid}`, and the latest `pathwayResults/{uid}`.

Recommendation content reads: `courses`, `scholarships`, `mentors`, `institutes`, `talentOpportunities`, `artsOpportunities`, and `sportsOpportunities`. Related dashboard flows also read `careerGuides`, `studentProgress/{uid}`, saved items, mentor relationships, requests, and appointments.

Recommendation persistence writes the ranked course, scholarship, and mentor snapshots back to `pathwayResults/{uid}/{resultId}`. Existing saved/application paths remain unchanged: `savedCourses/{uid}`, `savedScholarships/{uid}`, `savedOpportunities/{uid}`, application paths, `mentorRequests`, `studentMentors/{uid}`, and `mentorAppointments`.

The local `database.rules.json` now permits authenticated institute reads and public reads of the three opportunity feeds. These rules must be deployed before those new dashboard panels can receive production data.

## 4. Normalized student profile

The engine merges current and older field names. It uses path preference; education level and stream; preferred fields; interests; career goals; skills to improve; location, mode, language, and budget preferences; financial-support need; talent categories/types/specific skills; skill levels, experience, achievements, portfolio, and preferred opportunities; discovery hobbies and roles; and relevant pathway-result answers.

Path flags are explicit:

- Academic and Academic Improvement use academic evidence.
- Talent uses talent evidence and does not require A/L information.
- Combined uses academic and talent evidence.
- Undecided uses discovery evidence and broad beginner/exploration signals.
- An academic student who voluntarily has a talent profile can still see lower-priority relevant talent opportunities.

Missing optional values do not become false evidence. Older scalar, comma-separated, array, and object-list formats are normalized consistently.

## 5. Scoring and display logic

### Courses

Academic scoring considers field, career goal, education/eligibility, skills, mode, location, budget, and language. Combined uses roughly 70% academic relevance and 30% talent/skill relevance. Talent emphasizes the actual skill, practical/vocational relevance, access preferences, and beginner suitability. Academic Improvement prioritizes foundation, certificate, vocational, O/L/A/L support, English, and ICT. Undecided prioritizes broad beginner and exploration content.

### Scholarships

Scoring considers study level, academic or talent category, known eligibility, achievement evidence, financial need, location, valid deadline, career goals, and language/mode. Every result includes `eligible`, `possible`, `more_information_needed`, or `not_eligible`. Missing required evidence produces guidance such as adding A/L results instead of silently hiding all scholarships.

### Mentors

Scoring uses expertise, specialization, mentor type, guidance areas, path compatibility, supported education/talent levels, languages, modes, location/availability, rating, and capacity. Undecided and improvement students receive extra relevance for career/pathway or foundation guidance. Combined students can receive both professional mentors and talent coaches.

### Institutes

Scoring uses linked matching courses, talent programs/opportunities, location, mode, scholarships/support, recognition, and language. The path changes which programs are prioritized.

### Talent, arts, and sports opportunities

All three feeds use the same scorer and are deduplicated by ID. Scoring uses category, exact talent or skill, skill level, preferred opportunity type, location, mode/availability, and achievement requirements. Talent path treats these as primary; Combined keeps them visible; Academic requires actual talent evidence; Undecided receives low-confidence discovery options rather than false high matches.

### Labels and sorting

Scores map to Excellent Match (80–100), Good Match (60–79), Possible Match (40–59), and Explore Option (below 40). Items below 20 are excluded except appropriate exploration cases. Sorting is deterministic: score, eligibility, deadline urgency, mentor rating, and recency. IDs are retained from Firebase; display names are never used as IDs.

Cards show scores, labels, short reasons, and missing requirements. Scholarship cards additionally show eligibility status.

## 6. Availability and validity filtering

The engine accepts normalized active states such as active, approved, published, open, and visible. It excludes inactive, archived, closed, suspended, hidden, unapproved, or expired records. Ongoing and rolling opportunities may remain visible. Mentor self-matches, disabled mentoring, invalid account states, and full-capacity mentors are excluded where the data is available.

## 7. Bugs found and fixes applied

1. Duplicate dashboard and shared-engine scoring could disagree. Dashboard scoring and saved recommendation snapshots now call the shared engine.
2. Recommendations depended too heavily on pathway results. The normalized profile now combines separated profile paths and the latest pathway result.
3. Partial and undecided profiles could be blocked. Every signed-in student can now receive appropriately labelled suggestions.
4. Talent-only students were vulnerable to academic requirements. Talent scoring no longer requires A/L data.
5. Scholarships lacked a clear eligibility model. Four eligibility states and missing-data reasons were added.
6. Institute and opportunity recommendations were absent from the student dashboard. New overview panels and live listeners were added.
7. Opportunity feeds and institutes were unreadable under the local rules used by these consumers. Local read rules were added; deployment is still required.
8. Status, deadlines, visibility, mentor capacity, and tie ordering were inconsistent. These checks are centralized and deterministic.
9. There was no safe trace facility. Debug logging is opt-in through local storage.
10. There was no repeatable persona suite. A local helper now covers all required paths plus the combined Medha case.

## 8. Test results

Tests use a small controlled dataset containing relevant and deliberately irrelevant medicine, engineering, and football records.

| Persona | Expected | Actual | Result |
|---|---|---|---|
| Combined: Physical Science, Business, Dancing | Business/marketing, business or dance mentors, arts/business aid, dance opportunities; no medicine/football at top | Business Management and Digital Marketing ranked first; Business Mentor first; dance opportunities first; irrelevant records stayed below top positions | Pass |
| Talent: Dancing, no A/L | Dance course, coach, workshops; no A/L block | Dance course, Dance Coach, and dance opportunities ranked first | Pass |
| Academic: Commerce/Finance | Accounting/business, business mentor, commerce/business scholarship | Accounting and Finance first; Business Mentor first; business scholarship first | Pass |
| Academic Improvement | Foundation English/ICT and career guidance | Foundation English and ICT first; Career Guide first | Pass |
| Undecided | Foundation/business/digital exploration and career guidance | Foundation first; Career Guide first; broad scholarships remained available | Pass |
| Combined: Arts, Digital Media, Drawing | Design/digital course and drawing/art opportunities | Graphic Design and Digital Media first; Drawing and Digital Art Exhibition first | Pass |

These are deterministic logic tests, not a claim that every live Firebase record is complete or well tagged.

## 9. Debug mode

In the browser console, enable debugging and reload:

```js
localStorage.setItem("debugRecommendations", "true");
location.reload();
```

The console then shows the normalized profile, selected path, item scores, match/exclusion reasons, and missing data. Disable it with:

```js
localStorage.removeItem("debugRecommendations");
location.reload();
```

Normal users receive no debug logs.

To run the development suite, import `recommendation-test-helper.js` from a local module/dev page or the browser console, then call `runRecommendationTestSuite()`. The helper is not loaded by production pages.

## 10. Manual verification

1. Sign in as each path type and save the personal plus relevant academic/talent/discovery profile.
2. Open the student dashboard and confirm the displayed path and normalized recommendations after live data loads.
3. Check that every card has a score, label, and reason; scholarships must also show eligibility and missing data.
4. For Medha’s Combined profile, confirm business/management and dance-related results precede medicine, unrelated engineering, IT-only, or unrelated sports content.
5. For Talent-only dance, remove A/L data and confirm dance results remain available.
6. For Finance, confirm accounting/finance content and appropriate mentors/scholarships lead.
7. For Academic Improvement, confirm foundation, certificate, English, ICT, vocational, and guidance content leads.
8. For Undecided, confirm broad explore options and career/pathway guidance appear without false high-confidence labels.
9. Close or archive a content record and confirm it disappears. Test an expired deadline and an ongoing record.
10. Save a course/scholarship, request a mentor, and verify existing saved/application/request flows still operate.
11. Deploy and test `database.rules.json` in the Firebase Rules Playground before production deployment.

## 11. Remaining limitations

Recommendation quality still depends on administrators entering meaningful categories, skills, eligibility, institute IDs, deadlines, and status values. Institute matching is weaker when courses and opportunities do not contain an institute ID/name. Free-text matching is transparent and maintainable but does not understand synonyms as deeply as a trained semantic model. The test suite uses controlled fixtures; a future staging test should sample real production-shaped records while protecting student data. Rules have been updated locally but are not deployed by this audit.

## 12. Future testing checklist

- Run all six persona tests after changing scoring or schemas.
- Add a fixture for every new legacy field name or status value.
- Verify missing optional data never creates automatic ineligibility.
- Verify expired, hidden, inactive, unapproved, suspended, full-capacity, and duplicate records are excluded.
- Verify tie ordering remains stable across reloads.
- Verify all five paths independently and Combined uses both evidence groups.
- Verify no academic requirement blocks Talent and no talent requirement blocks Academic.
- Verify Firebase indexes/rules in the emulator or Rules Playground before deployment.
- Recheck saved items, applications, mentor requests, appointments, messages, and ratings after dashboard changes.
## Mentor Recommendation Fix

### What was wrong

The earlier mentor formula could award substantial points for pathway type, student level, language, mentoring mode, location, availability, rating, and capacity before proving that the mentor's field was relevant. An Electrical and Electronic Engineering mentor could therefore reach a visible “Possible Match” score for a Combined Business Management and Dancing student even though neither expertise area matched.

A second text issue was found during regression testing: loose substring matching could read `dance` inside `guidance`. Mentor relevance now uses whole normalized terms and phrases, preventing that class of false match.

### New hard relevance gate and scoring

`hasMeaningfulMentorRelevance(studentProfile, mentor)` now requires an academic, talent, or appropriate discovery match according to the selected path. It checks normalized mentor field, expertise, specialization, role, profession, organization, bio, mentor type, professional types, guidance areas, supported fields/talents, skills, and tags. Business/management and dancing synonym families are normalized explicitly.

The score is now Academic relevance 35, Talent relevance 25, Guidance relevance 15, Career-goal relevance 10, Pathway compatibility 5, Student-level support 4, Language 3, and mode/location/availability 3. Generic factors are added only after relevance passes. Without meaningful relevance, the score is capped at 15 and the mentor is excluded. The default list requires both the hard gate and a score of at least 40.

Reasons now lead with the actual academic, talent, guidance, or career match. Generic compatibility is summarized only as supporting evidence and can never stand alone.

### Regression test

The Medha Combined-path fixture uses Business and Management, entrepreneurship, leadership and related skills, plus Arts/Dancing at Intermediate level. The controlled mentor data now includes an Electrical Design Engineer specializing in power systems, embedded systems, and telecommunications, with otherwise favorable level, language, and availability values.

Actual ranked mentors are Business Mentor, Dance Coach, and Career Guide. The Electrical Design Engineer is absent from the recommendation results. Talent-only Dancing returns only the Dance Coach; Finance returns Business Mentor and Career Guide; Academic Improvement returns Career Guide. All six persona tests pass.

### Debugging and manual verification

Enable debug mode with `localStorage.setItem("debugRecommendations", "true")` and reload. Each mentor log includes mentor name/ID, field, role, normalized student targets, academic/talent/guidance/career scores, generic score, final score, inclusion status, and exclusion reason.

For manual verification, open Medha's mentor recommendations and confirm only mentors connected to Business, Management, Entrepreneurship, Leadership, Career Guidance, Dancing, Performing Arts, or creative career development appear. Confirm Electrical/Electronic, Mechanical, Civil, unrelated IT, and unrelated sports mentors remain absent unless their profiles also contain a genuinely matching expertise or guidance field. Confirm the card separator renders as `Possible Match - 41%` or the applicable score without corrupted characters.

