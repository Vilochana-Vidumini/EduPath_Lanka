import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { getDatabase, get, ref, update, serverTimestamp } from "firebase/database";

const VERSION = "safe-course-scholarship-backfill-v1";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPORT_PATH = path.join(ROOT, "safe-course-scholarship-seed-report.md");
const argv = process.argv.slice(2);
const apply = argv.includes("--apply");
const fixture = argv.includes("--fixture");
const inputArg = argv.find((value) => value.startsWith("--input="));
const inputPath = inputArg ? path.resolve(inputArg.slice(8)) : "";
const COMMON = new Set(["course", "program", "programme", "certificate", "diploma", "degree", "in", "of", "the", "for", "and", "a"]);

const asList = (value) => value == null || value === "" ? [] : Array.isArray(value) ? value.filter(Boolean) : typeof value === "object" ? Object.values(value).filter(Boolean) : String(value).split(/[,;|\n]/).map((part) => part.trim()).filter(Boolean);
const normalize = (value) => String(value || "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
const fuzzyNormalize = (value) => normalize(value).split(" ").filter((word) => !COMMON.has(word)).join(" ");
const tokens = (value) => new Set(fuzzyNormalize(value).split(" ").filter((word) => word.length > 2));
const titleOf = (item, id = "") => item.courseName || item.scholarshipName || item.title || item.name || id;
const providerOf = (item) => normalize(item.provider || item.instituteName || item.organization || item.offeredBy);
const missing = (value) => value == null || value === "" || Array.isArray(value) && !value.length || typeof value === "object" && !Array.isArray(value) && !Object.keys(value).length;
const overlap = (left, right) => { const a = tokens(left), b = tokens(right); if (!a.size || !b.size) return 0; const shared = [...a].filter((word) => b.has(word)).length; return shared / Math.min(a.size, b.size); };
const bigrams = (value) => { const text = fuzzyNormalize(value).replace(/ /g, "_"); return new Set([...Array(Math.max(0, text.length - 1))].map((_, index) => text.slice(index, index + 2))); };
const similarity = (left, right) => { const a = bigrams(left), b = bigrams(right); if (!a.size || !b.size) return 0; const shared = [...a].filter((gram) => b.has(gram)).length; return 2 * shared / (a.size + b.size); };
const searchable = (item) => [titleOf(item), item.category, item.categoryTitle, item.field, item.courseType, item.level, item.educationLevel, item.description, asList(item.matchingKeywords), asList(item.tags)].flat().join(" ");
const marketingFamily = (text) => /marketing|branding/.test(normalize(text));
const businessFamily = (text) => /business management|marketing management|supply chain.*business/.test(normalize(text));

function duplicateReason(candidate, existing, type) {
  const a = titleOf(candidate), b = titleOf(existing), exact = normalize(a) === normalize(b), fuzzy = similarity(a, b), tokenScore = overlap(a, b);
  if (exact) return "normalized title exact match";
  if (fuzzy >= 0.82 || tokenScore >= 0.8) return `high title similarity (${Math.round(Math.max(fuzzy, tokenScore) * 100)}%)`;
  const sameProvider = providerOf(candidate) && providerOf(candidate) === providerOf(existing);
  const sameField = overlap([candidate.field, candidate.category, candidate.courseCategoryTitle].join(" "), [existing.field, existing.category, existing.courseCategoryTitle].join(" ")) >= 0.65;
  const similarLevel = overlap([candidate.level, candidate.educationLevel, candidate.courseType].join(" "), [existing.level, existing.educationLevel, existing.courseType].join(" ")) >= 0.5;
  if (type === "course" && sameProvider && sameField && similarLevel) return "same provider, field, and similar level";
  const keywordScore = overlap(asList(candidate.matchingKeywords).join(" "), searchable(existing));
  const sameCategory = [candidate.academicCategoryId, candidate.courseCategoryId, candidate.scholarshipCategoryId].filter(Boolean).some((id) => [existing.academicCategoryId, existing.courseCategoryId, existing.scholarshipCategoryId].includes(id));
  if (sameCategory && keywordScore >= 0.7) return "same category and main keywords";
  if (type === "course" && marketingFamily(a) && marketingFamily(searchable(existing))) return "equivalent marketing course already exists";
  if (type === "course" && businessFamily(a) && businessFamily(searchable(existing)) && tokenScore >= 0.35) return "equivalent business/management course already exists";
  if (type === "scholarship" && normalize(b).includes(fuzzyNormalize(a)) || type === "scholarship" && fuzzyNormalize(a).includes(fuzzyNormalize(b))) return "scholarship title contains an existing equivalent";
  return "";
}

function findDuplicate(candidate, records, type) {
  for (const [id, existing] of Object.entries(records || {})) {
    const reason = duplicateReason(candidate, existing, type);
    if (reason) return { id, title: titleOf(existing, id), reason };
  }
  return null;
}

function categoryEntry(categories, preferredIds, titleTerms = []) {
  for (const id of preferredIds) if (categories?.[id]) return { id: categories[id].categoryId || id, item: categories[id] };
  const entry = Object.entries(categories || {}).find(([, item]) => titleTerms.some((term) => normalize(item.title || item.name).includes(normalize(term))));
  return entry ? { id: entry[1].categoryId || entry[0], item: entry[1] } : null;
}

function courseInference(item, data) {
  const text = normalize(searchable(item)); let academic, course, pathways, keywords;
  if (/graphic design|visual design|digital media/.test(text)) { academic = categoryEntry(data.academicCategories, ["academic_media_and_communication", "academic_information_technology"], ["media and communication", "information technology"]); course = categoryEntry(data.courseCategories, ["course_graphic_design"], ["graphic design"]); pathways = ["academic", "combined", "talent", "undecided"]; keywords = ["graphic design", "design", "creative", "digital media", "visual design"]; }
  else if (/accountancy|accounting|finance/.test(text)) { academic = categoryEntry(data.academicCategories, ["academic_accounting_and_finance"], ["accounting and finance"]); course = categoryEntry(data.courseCategories, ["course_accounting_and_finance"], ["accounting and finance"]); pathways = ["academic", "combined"]; keywords = ["accounting", "accountancy", "finance", "commerce"]; }
  else if (/supply chain|logistics/.test(text)) { academic = categoryEntry(data.academicCategories, ["academic_business_management"], ["business and management"]); course = categoryEntry(data.courseCategories, ["course_supply_chain_logistics"], ["supply chain", "logistics"]); pathways = ["academic", "combined"]; keywords = ["supply chain", "logistics", "business", "operations management"]; }
  else if (/marketing/.test(text)) { academic = categoryEntry(data.academicCategories, ["academic_business_management"], ["business and management"]); course = categoryEntry(data.courseCategories, ["course_marketing", "course_digital_marketing"], ["marketing"]); pathways = ["academic", "combined"]; keywords = ["marketing", "business", "management", "digital marketing", "branding"]; }
  else if (/full stack|mobile developer|information technology|\bict\b|web design|software|\bit\b/.test(text)) { academic = categoryEntry(data.academicCategories, ["academic_information_technology"], ["information technology"]); course = categoryEntry(data.courseCategories, ["course_information_technology"], ["information technology", "web development", "software development"]); pathways = ["academic", "combined", "academic_improvement", "undecided"]; keywords = ["information technology", "ict", "software", "web development", "mobile development", "full stack", "technology"]; }
  else return null;
  return { academicCategoryId: academic?.id, academicCategoryTitle: academic?.item?.title || academic?.item?.name, courseCategoryId: course?.id, courseCategoryTitle: course?.item?.title || course?.item?.name, suitablePathways: pathways, eligibleEducationLevels: asList(item.educationLevel || item.level || item.qualificationLevel), matchingKeywords: [...new Set([...asList(item.matchingKeywords), ...keywords])] };
}

function scholarshipInference(item, data) {
  const text = normalize(searchable(item)); let category, academicIds = [], academicTitles = [], pathways, keywords;
  if (/youth.*business.*entrepreneur|business.*entrepreneur/.test(text)) { category = categoryEntry(data.scholarshipCategories, ["scholarship_business_management", "scholarship_business_and_management_scholarships"], ["business and management"]); const academic = categoryEntry(data.academicCategories, ["academic_business_management"], ["business and management"]); if (academic) { academicIds = [academic.id]; academicTitles = [academic.item.title || academic.item.name]; } pathways = ["academic", "combined", "undecided"]; keywords = ["youth", "business", "entrepreneurship", "management", "leadership", "startup"]; }
  else if (/nenasala.*ict|ict excellence/.test(text)) { category = categoryEntry(data.scholarshipCategories, ["scholarship_ict", "scholarship_academic_merit"], ["ict", "academic merit", "it scholarship"]); const academic = categoryEntry(data.academicCategories, ["academic_information_technology"], ["information technology"]); if (academic) { academicIds = [academic.id]; academicTitles = [academic.item.title || academic.item.name]; } pathways = ["academic", "combined", "academic_improvement", "undecided"]; keywords = ["ict", "information technology", "technology", "nenasala", "student scholarship"]; }
  else if (/president'?s? fund/.test(text)) { category = categoryEntry(data.scholarshipCategories, ["scholarship_financial_aid"], ["financial aid"]); pathways = ["academic", "combined", "academic_improvement", "undecided"]; keywords = ["financial aid", "president fund", "student support", "education support", "scholarship"]; }
  else return null;
  return { scholarshipCategoryId: category?.id, scholarshipCategoryTitle: category?.item?.title || category?.item?.name, relatedAcademicCategoryIds: academicIds, relatedAcademicCategoryTitles: academicTitles, eligiblePathways: pathways, eligibleEducationLevels: asList(item.eligibleEducationLevels || item.educationLevel), matchingKeywords: [...new Set([...asList(item.matchingKeywords), ...keywords])] };
}

const newCourses = [
  { courseId: "course_entrepreneurship_startup_001", title: "Certificate in Entrepreneurship and Startup Development", provider: "Youth Enterprise Academy", academicCategoryId: "academic_business_management", courseCategoryId: "course_entrepreneurship", suitablePathways: ["academic", "combined"], matchingKeywords: ["entrepreneurship", "startup", "business idea", "business plan", "pitching", "financial literacy"] },
  { courseId: "course_event_management_creative_001", title: "Certificate in Event Management for Creative Students", provider: "Creative Business School", academicCategoryId: "academic_business_management", courseCategoryId: "course_event_management", suitablePathways: ["academic", "combined", "talent"], matchingKeywords: ["event management", "creative business", "performing arts", "dancing", "leadership", "management"] },
  { courseId: "course_foundation_english_ict_001", title: "Foundation English and ICT Skills", provider: "Foundation Skills Centre", academicCategoryId: "academic_foundation_and_academic_improvement", courseCategoryId: "course_foundation_studies", suitablePathways: ["academic_improvement", "undecided", "academic"], matchingKeywords: ["foundation", "english", "ict", "study skills", "academic improvement", "beginner"] },
  { courseId: "course_creative_entrepreneurship_001", title: "Creative Entrepreneurship for Artists and Performers", provider: "Youth Creative Hub", academicCategoryId: "academic_business_management", courseCategoryId: "course_entrepreneurship", suitablePathways: ["combined", "talent", "academic"], matchingKeywords: ["creative entrepreneurship", "business", "dancing", "music", "performing arts", "personal branding"] }
];
const newScholarships = [
  { scholarshipId: "scholarship_women_business_leadership_001", title: "Women in Business Leadership Scholarship", provider: "Youth Women Leadership Fund", scholarshipCategoryId: "scholarship_women_leadership", relatedAcademicCategoryIds: ["academic_business_management"], eligiblePathways: ["academic", "combined"], matchingKeywords: ["women", "business", "management", "leadership", "entrepreneurship"] },
  { scholarshipId: "scholarship_creative_talent_development_001", title: "Creative Talent Development Scholarship", provider: "Creative Youth Foundation", scholarshipCategoryId: "scholarship_talent", relatedTalentCategoryIds: ["cat_arts_dancing", "cat_arts_music", "cat_practical_photography"], eligiblePathways: ["talent", "combined"], requiresTalentProfile: true, matchingKeywords: ["creative talent", "dancing", "music", "performing arts", "arts", "training", "portfolio"] },
  { scholarshipId: "scholarship_foundation_support_001", title: "Foundation Education Support Scholarship", provider: "EduSupport Foundation", scholarshipCategoryId: "scholarship_foundation_support", relatedAcademicCategoryIds: ["academic_foundation_and_academic_improvement"], eligiblePathways: ["academic_improvement", "undecided", "academic"], matchingKeywords: ["foundation", "education support", "english", "ict", "financial aid", "academic improvement"] }
];

function buildPlan(data, timestamp = "__SERVER_TIMESTAMP__") {
  const updates = {}, report = { scannedCourses: Object.keys(data.courses || {}).length, scannedScholarships: Object.keys(data.scholarships || {}).length, courseBackfills: [], scholarshipBackfills: [], addedCourses: [], addedScholarships: [], duplicates: [], review: [], categories: new Set(), warnings: [] };
  const backfill = (collection, id, item, inferred, target) => { if (!inferred) return; const added = []; for (const [field, value] of Object.entries(inferred)) { if (missing(item[field]) && !missing(value)) { updates[`${collection}/${id}/${field}`] = value; added.push(field); } } if (added.length) { updates[`${collection}/${id}/categoryBackfill`] = { backfilled: true, backfilledAt: timestamp, version: VERSION }; updates[`${collection}/${id}/updatedAt`] = timestamp; target.push({ id, title: titleOf(item, id), fields: added }); } const required = collection === "courses" ? ["academicCategoryId", "courseCategoryId"] : ["scholarshipCategoryId"]; const absent = required.filter((field) => missing(item[field]) && missing(inferred[field])); if (absent.length) report.review.push({ path: `${collection}/${id}`, title: titleOf(item, id), reason: `Could not resolve ${absent.join(", ")} from existing categories` }); };
  for (const [id, item] of Object.entries(data.courses || {})) backfill("courses", id, item, { status: "active", publicVisibility: true, ...(courseInference(item, data) || {}) }, report.courseBackfills);
  for (const [id, item] of Object.entries(data.scholarships || {})) backfill("scholarships", id, item, { status: "active", publicVisibility: true, ...(scholarshipInference(item, data) || {}) }, report.scholarshipBackfills);
  const metadata = { createdByRole: "admin", createdByName: "System Admin", createdByAdminUid: "seed_admin", source: "admin_seed", isSeedData: true, status: "active", publicVisibility: true, approvalStatus: "approved", createdAt: timestamp, updatedAt: timestamp };
  for (const candidate of newCourses) { const duplicate = findDuplicate(candidate, data.courses, "course"); if (duplicate) { report.duplicates.push({ candidate: candidate.title, existing: duplicate.title, reason: duplicate.reason }); continue; } const id = candidate.courseId; const record = { ...candidate, courseName: candidate.title, eligibleEducationLevels: ["After A/L", "Undergraduate"], ...metadata }; updates[`courses/${id}`] = record; data.courses[id] = record; report.addedCourses.push({ id, title: candidate.title }); }
  for (const candidate of newScholarships) { const duplicate = findDuplicate(candidate, data.scholarships, "scholarship"); if (duplicate) { report.duplicates.push({ candidate: candidate.title, existing: duplicate.title, reason: duplicate.reason }); continue; } const id = candidate.scholarshipId; const record = { ...candidate, scholarshipName: candidate.title, eligibleEducationLevels: ["After A/L", "Undergraduate"], ...metadata }; updates[`scholarships/${id}`] = record; data.scholarships[id] = record; report.addedScholarships.push({ id, title: candidate.title }); }
  for (const [pathName, records] of [["academicCategories", data.academicCategories], ["courseCategories", data.courseCategories], ["scholarshipCategories", data.scholarshipCategories], ["talentCategories", data.talentCategories]]) for (const [id, item] of Object.entries(records || {})) if (JSON.stringify(updates).includes(item.categoryId || id)) report.categories.add(item.categoryId || id);
  if (!Object.keys(data.courseCategories || {}).length) report.warnings.push("No course categories were loaded.");
  if (!Object.keys(data.scholarshipCategories || {}).length) report.warnings.push("No scholarship categories were loaded.");
  return { updates, report };
}

function markdown(result, mode) {
  const r = result.report, list = (items, render, empty = "- None.") => items.length ? items.map(render).join("\n") : empty;
  return `# Safe Course and Scholarship Seed Report\n\n- Generated: ${new Date().toISOString()}\n- Mode: ${mode}\n- Version: ${VERSION}\n\n## Summary\n\n| Metric | Count |\n|---|---:|\n| Existing courses scanned | ${r.scannedCourses} |\n| Existing scholarships scanned | ${r.scannedScholarships} |\n| Courses backfilled | ${r.courseBackfills.length} |\n| Scholarships backfilled | ${r.scholarshipBackfills.length} |\n| New courses added | ${r.addedCourses.length} |\n| New scholarships added | ${r.addedScholarships.length} |\n| Duplicate records skipped | ${r.duplicates.length} |\n| Records needing manual review | ${r.review.length} |\n\n## Courses backfilled\n\n${list(r.courseBackfills, (x) => `- \`${x.id}\` — ${x.title}: added ${x.fields.join(", ")}`)}\n\n## Scholarships backfilled\n\n${list(r.scholarshipBackfills, (x) => `- \`${x.id}\` — ${x.title}: added ${x.fields.join(", ")}`)}\n\n## New courses added\n\n${list(r.addedCourses, (x) => `- \`${x.id}\` — ${x.title}`)}\n\n## New scholarships added\n\n${list(r.addedScholarships, (x) => `- \`${x.id}\` — ${x.title}`)}\n\n## Duplicates skipped\n\n${list(r.duplicates, (x) => `- **${x.candidate}** — existing: ${x.existing}; reason: ${x.reason}`)}\n\n## Records needing manual review\n\n${list(r.review, (x) => `- \`${x.path}\` — ${x.title}: ${x.reason}`)}\n\n## Category IDs used\n\n${list([...r.categories].sort(), (id) => `- \`${id}\``)}\n\n## Warnings\n\n${list(r.warnings, (warning) => `- ${warning}`)}\n\n## Safety\n\n- Existing non-empty fields were preserved.\n- No collection root is replaced or deleted.\n- Firebase writes use one root multipath update.\n`;
}

async function loadLive() {
  const email = process.env.FIREBASE_ADMIN_EMAIL, password = process.env.FIREBASE_ADMIN_PASSWORD;
  if (!email || !password) throw new Error("Set FIREBASE_ADMIN_EMAIL and FIREBASE_ADMIN_PASSWORD, or use --input=<export.json> for an offline preview.");
  const app = initializeApp({ apiKey: process.env.FIREBASE_API_KEY || "AIzaSyD33FV6wnVeEiM3-DhSgqigSZcp88a2ztc", authDomain: "edupath-lanka-af6ae.firebaseapp.com", databaseURL: process.env.FIREBASE_DATABASE_URL || "https://edupath-lanka-af6ae-default-rtdb.asia-southeast1.firebasedatabase.app", projectId: "edupath-lanka-af6ae" });
  await signInWithEmailAndPassword(getAuth(app), email, password);
  const database = getDatabase(app), nodes = ["courses", "scholarships", "academicCategories", "courseCategories", "scholarshipCategories", "talentCategories"];
  const snapshots = await Promise.all(nodes.map((node) => get(ref(database, node))));
  return { data: Object.fromEntries(nodes.map((node, index) => [node, snapshots[index].val() || {}])), applyUpdates: (updates) => update(ref(database), replaceTimestamp(updates, serverTimestamp)) };
}
function replaceTimestamp(value, replacement) { if (value === "__SERVER_TIMESTAMP__") return replacement(); if (Array.isArray(value)) return value.map((item) => replaceTimestamp(item, replacement)); if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replaceTimestamp(item, replacement)])); return value; }

async function main() {
  if (apply && (inputPath || fixture)) throw new Error("--apply cannot be used with offline preview data.");
  const fixtureData = fixture ? { ...JSON.parse(fs.readFileSync(path.join(ROOT, "sample-data/default-category-seed-data.json"), "utf8")), ...JSON.parse(fs.readFileSync(path.join(ROOT, "sample-data/sample-content-seed-data.json"), "utf8")) } : null;
  const source = fixture ? { data: fixtureData } : inputPath ? { data: JSON.parse(fs.readFileSync(inputPath, "utf8")) } : await loadLive();
  const result = buildPlan(structuredClone(source.data));
  const mode = fixture ? "fixture-preview" : inputPath ? "offline-preview" : apply ? "live-apply" : "live-preview";
  fs.writeFileSync(REPORT_PATH, markdown(result, mode), "utf8");
  console.log(`Existing courses scanned: ${result.report.scannedCourses}`);
  console.log(`Existing scholarships scanned: ${result.report.scannedScholarships}`);
  console.log(`Courses backfilled: ${result.report.courseBackfills.length}`);
  console.log(`Scholarships backfilled: ${result.report.scholarshipBackfills.length}`);
  console.log(`New courses added: ${result.report.addedCourses.length}`);
  console.log(`New scholarships added: ${result.report.addedScholarships.length}`);
  console.log(`Duplicate records skipped: ${result.report.duplicates.length}`);
  console.log(`Records needing manual review: ${result.report.review.length}`);
  console.log(`Report: ${path.basename(REPORT_PATH)}`);
  if (!apply) return console.log("Preview complete. No Firebase data was changed. Re-run with --apply after reviewing the report.");
  if (!Object.keys(result.updates).length) return console.log("No updates are required.");
  await source.applyUpdates(result.updates);
  console.log(`Applied ${Object.keys(result.updates).length} non-destructive paths in one root multipath update.`);
}

main().catch((error) => { console.error(`Safe seed/backfill failed: ${error.message}`); process.exitCode = 1; });

