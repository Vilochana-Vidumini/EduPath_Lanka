# EduPath Lanka Recommendation Test Report

- Test date: 2026-07-18
- Result: PASS — 5 of 5 deterministic category scenarios
- Command: npm run test:recommendations

## Category nodes checked

- academicCategories
- courseCategories
- scholarshipCategories
- mentorExpertiseCategories
- talentCategories
- opportunityCategories
- providerCategories

## Content checked

The regression fixture checks 8 courses, 5 mentors, 4 scholarships, 3 institutes, and 4 talent opportunities. The admin Recommendation Testing panel additionally audits all currently loaded Firebase records and lists missing category fields.

## Test cases and actual results

1. Combined Business and Management + Dancing — PASS
2. Talent-only Dancing — PASS
3. Academic Business and Management — PASS
4. Academic Engineering and Technology — PASS
5. Undecided exploration — PASS

Business + Dancing ranks business and dance content while excluding Electrical Engineering from primary recommendations. The engineering student receives Electrical Engineering content. Talent-only Dancing works without an academic profile.

## Incorrect recommendations found

The first detailed run found business and accounting courses scoring 45 for the talent-only dancer. A broad practical/business bonus plus generic preferences caused this without dance relevance. A filter regression also briefly removed valid dance opportunities; the test suite caught it.

## Fixes applied

- Added category IDs/titles, course category IDs, and scholarship category IDs to the normalized profile.
- Kept category IDs primary with text fallback.
- Raised normal default thresholds to 40 while preserving lower undecided Explore Options.
- Capped generic-only course, scholarship, mentor, and institute matches.
- Added category-first institute scoring and meaningful talent relevance for opportunities.
- Added explainable scores, match reasons, inclusion state, and exclusion reasons.
- Added debug logging, executable five-scenario tests, an admin test panel, and missing-category detection.

## Remaining review

The production backfill previously identified one health mentor requiring manual category review. Use Category Review and Recommendation Testing to resolve any loaded records missing category fields. Undecided results intentionally allow broad, lower-scored Explore Options.

## Manual verification

1. Sign in as an administrator and open Recommendation Testing.
2. Run all tests and confirm five PASS results.
3. Review Automatic issue detection and assign missing categories through Category Review.
4. Enable console debug mode with localStorage.setItem("debugRecommendations", "true").
5. Confirm Business + Dancing excludes Electrical Engineering primary cards.
6. Confirm Engineering includes Electrical Engineering content.
7. Confirm Talent-only Dancing works without A/L details.
8. Disable debug mode with localStorage.removeItem("debugRecommendations").
