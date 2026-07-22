import { auth, database } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  get,
  ref,
  set,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
import { showToast } from "./auth-nav.js?v=20260719-home-redesign";
import {
  escapeAttr,
  escapeHTML,
  formatDate,
  getRecordImage,
  getRecordTitle,
  isDeadlineValid,
  isPublicActiveRecord,
  safeExternalUrl,
  toList,
} from "./public-content.js";
let user = null;
onAuthStateChanged(auth, (x) => (user = x));
const id = new URLSearchParams(location.search).get("id"),
  root = document.getElementById("public-detail-root"),
  type = document.body.dataset.detailType;
const empty = (message) =>
  (root.innerHTML = `<div class="public-empty"><h2>${escapeHTML(message)}</h2><a class="btn btn-primary" href="${type === "institute" ? "institutes.html" : "talent-opportunities.html"}">Back</a></div>`);
const chips = (values) =>
  toList(values)
    .map((x) => `<span>${escapeHTML(x)}</span>`)
    .join("");
async function instituteDetail(item) {
  const [courses, scholarships, opps, mentors] = await Promise.all(
    ["courses", "scholarships", "talentOpportunities", "mentors"].map((node) =>
      get(ref(database, node)),
    ),
  );
  const instituteName = getRecordTitle(item),
    owns = (x) =>
      [
        x.instituteUid,
        x.instituteId,
        x.linkedInstituteId,
        x.providerId,
      ].includes(id) ||
      String(x.instituteName || x.provider || "")
        .trim()
        .toLowerCase() === instituteName.trim().toLowerCase();
  const courseRows = Object.entries(courses.val() || {}).filter(
    ([, x]) =>
      normalizePublicStatus(x.status) === "active" &&
      x.publicVisibility !== false &&
      owns(x),
  );
  const courseCards = courseRows
    .map(
      ([key, x]) =>
        `<article class="institute-course-card"><img src="${escapeAttr(getRecordImage(x))}" alt="${escapeAttr(getRecordTitle(x, key))}" onerror="this.onerror=null;this.src='images/course-placeholder.png'"><div class="institute-course-main"><span class="public-record-subtitle">${escapeHTML(x.category || x.courseCategoryTitle || "Course")}</span><h3>${escapeHTML(getRecordTitle(x, key))}</h3><p>${escapeHTML(x.description || "Course offered by " + instituteName)}</p><div class="course-compact-meta"><span><i class="far fa-clock"></i>${escapeHTML(x.duration || "Duration TBA")}</span><span><i class="fas fa-graduation-cap"></i>${escapeHTML(x.level || x.educationLevel || "Level TBA")}</span><span><i class="fas fa-laptop"></i>${escapeHTML(x.studyMode || x.mode || x.type || "Mode TBA")}</span><span><i class="fas fa-location-dot"></i>${escapeHTML(x.district || item.district || "Sri Lanka")}</span><span><i class="fas fa-money-bill"></i>${escapeHTML(x.fee || x.feeAmount || x.feeType || "Fee TBA")}</span></div></div></article>`,
    )
    .join("");
  const related = (snapshot, predicate, href) =>
    Object.entries(snapshot.val() || {})
      .filter(([, x]) => isPublicActiveRecord(x) && predicate(x))
      .slice(0, 6)
      .map(
        ([key, x]) =>
          `<a href="${href(key)}">${escapeHTML(getRecordTitle(x, key))}</a>`,
      )
      .join("");
  const website = safeExternalUrl(item.websiteURL || item.website),
    social = [
      ["Facebook", item.facebookPage],
      ["LinkedIn", item.linkedinPage],
    ].filter(([, url]) => safeExternalUrl(url));
  root.innerHTML = `<article class="public-detail-hero institute-profile-hero"><img class="public-detail-image institute-profile-image" src="${escapeAttr(getRecordImage(item))}" alt="${escapeAttr(instituteName)} profile image" onerror="this.onerror=null;this.src='images/course-placeholder.png'"><div><span class="public-record-subtitle">${escapeHTML(item.providerCategoryTitle || item.instituteType || item.type || "Partner Institute")}</span><h1>${escapeHTML(instituteName)}</h1><p>${escapeHTML(item.description || "Registered EduPath Lanka education partner.")}</p><div class="public-record-meta">${chips(item.programTypes || item.relatedCourseCategoryTitles)}${chips(item.studyModes)}</div>${website ? `<a class="btn btn-primary" target="_blank" rel="noopener" href="${escapeAttr(website)}">Visit Website</a>` : ""}</div></article><section class="detail-section"><h2>Institute Information</h2><div class="detail-grid"><div class="detail-panel"><strong>Address</strong><p>${escapeHTML(item.address || item.location || item.district || "Sri Lanka")}</p></div><div class="detail-panel"><strong>District / Province</strong><p>${escapeHTML([item.district, item.province].filter(Boolean).join(", ") || "Not provided")}</p></div><div class="detail-panel"><strong>Established</strong><p>${escapeHTML(item.establishedYear || "Not provided")}</p></div><div class="detail-panel"><strong>Accreditation</strong><p>${escapeHTML(item.accreditation || "Not provided")}</p></div>${item.publicEmail || item.contactEmailPublic ? `<div class="detail-panel"><strong>Public email</strong><p>${escapeHTML(item.publicEmail || item.email)}</p></div>` : ""}</div></section>${item.facilities ? `<section class="detail-section"><h2>Facilities</h2><div class="public-record-meta">${chips(item.facilities)}</div></section>` : ""}${social.length ? `<section class="detail-section"><h2>Connect</h2><div class="public-card-actions">${social.map(([label, url]) => `<a class="btn btn-outline-dark" target="_blank" rel="noopener" href="${escapeAttr(safeExternalUrl(url))}">${escapeHTML(label)}</a>`).join("")}</div></section>` : ""}<section class="detail-section institute-courses-section"><div class="public-directory-heading"><div><h2>Courses Provided</h2><p>${courseRows.length} active public course${courseRows.length === 1 ? "" : "s"} from this institute.</p></div><a class="btn btn-outline-dark" href="courses.html">Browse All Courses</a></div><div class="institute-course-grid">${courseCards || '<div class="public-empty">No active public courses are currently listed for this institute.</div>'}</div></section><section class="detail-section"><h2>Scholarships and Talent Opportunities</h2><div class="detail-related">${related(scholarships, owns, (key) => `scholarships.html?id=${encodeURIComponent(key)}`)}${related(opps, owns, (key) => `talent-opportunity-details.html?id=${encodeURIComponent(key)}`) || "No related public opportunities listed."}</div></section><section class="detail-section"><h2>Related Mentors and Coaches</h2><div class="detail-related">${
    related(
      mentors,
      (x) => toList(x.relatedInstituteIds).includes(id) || x.instituteId === id,
      (key) => `mentor-profile.html?id=${encodeURIComponent(key)}`,
    ) || "No related mentors listed."
  }</div></section>`;
}
const normalizePublicStatus = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();
async function opportunityDetail(item) {
  const apply = safeExternalUrl(item.applicationUrl || item.applicationLink || item.applyLink),
        age = [item.eligibleAgeMin, item.eligibleAgeMax].filter((x) => x != null).join(" - ") || "Any";
  let coachesHtml = "";
  if (item.relatedMentorIds && item.relatedMentorIds.length) {
    const mSnap = await get(ref(database, "mentors"));
    const allM = mSnap.val() || {};
    const coachNames = item.relatedMentorIds.map(mid => allM[mid]?.fullName || "EduPath Coach").join(", ");
    coachesHtml = `<section class="detail-section"><h2>Conducted By</h2><p>${escapeHTML(coachNames)}</p></section>`;
  }
  root.innerHTML = `<article class="public-detail-hero"><img class="public-detail-image" src="${escapeAttr(getRecordImage(item))}" alt="${escapeAttr(getRecordTitle(item))}"><div><span class="public-record-subtitle">${escapeHTML(item.categoryTitle || item.category || "Talent")} · ${escapeHTML(item.opportunityCategoryTitle || item.opportunityType || "Opportunity")}</span><h1>${escapeHTML(getRecordTitle(item))}</h1><p>${escapeHTML(item.provider || item.organizer || "EduPath Partner")}</p><div class="public-card-actions">${apply ? `<a class="btn btn-primary" target="_blank" rel="noopener" href="${escapeAttr(apply)}">Apply Now</a>` : ""}<button class="btn btn-outline-dark" id="save-public-opportunity">Save Opportunity</button><button class="btn btn-outline-dark" id="track-public-opportunity">Track Application</button><a class="btn btn-outline-dark" href="talent-opportunities.html">Back to Opportunities</a></div></div></article><div class="detail-grid"><div class="detail-panel"><strong>Deadline</strong><p>${escapeHTML(formatDate(item.deadline))}</p></div><div class="detail-panel"><strong>Event date</strong><p>${escapeHTML(formatDate(item.eventDate))}</p></div><div class="detail-panel"><strong>Location / Mode</strong><p>${escapeHTML(item.district || item.location || "TBA")} · ${escapeHTML(item.mode || "TBA")}</p></div><div class="detail-panel"><strong>Fee</strong><p>${escapeHTML(item.feeType || "TBA")}${item.fee ? ` · LKR ${escapeHTML(item.fee)}` : ""}</p></div><div class="detail-panel"><strong>Age range</strong><p>${escapeHTML(age)}</p></div></div><section class="detail-section"><h2>Description</h2><p>${escapeHTML(item.description || "No description provided.")}</p></section><section class="detail-section"><h2>Eligibility</h2><p>${escapeHTML(item.eligibility || "See provider requirements.")}</p><div class="public-record-meta">${chips(item.eligibleSkillLevels)}${chips(item.eligibleEducationLevels)}</div></section><section class="detail-section"><h2>Requirements</h2><p>${escapeHTML(item.requirements || "No additional requirements listed.")}</p></section>${coachesHtml}${item.linkedInstituteId ? `<a class="btn btn-outline-dark" href="institute-details.html?id=${encodeURIComponent(item.linkedInstituteId)}">View Related Institute</a>` : ""}`;
  const requireLogin = () => {
    if (user) return true;
    showToast(
      "Create an account or login to save and track this opportunity.",
      "info",
    );
    return false;
  };
  document
    .getElementById("save-public-opportunity")
    ?.addEventListener("click", async () => {
      if (!requireLogin()) return;
      await set(ref(database, `savedOpportunities/${user.uid}/${id}`), {
        opportunityId: id,
        savedAt: serverTimestamp(),
      });
      showToast("Opportunity saved.", "success");
    });
  document
    .getElementById("track-public-opportunity")
    ?.addEventListener("click", async () => {
      if (!requireLogin()) return;
      await set(ref(database, `opportunityApplications/${user.uid}/${id}`), {
        opportunityId: id,
        status: "tracking",
        updatedAt: serverTimestamp(),
      });
      showToast("Opportunity added to application tracking.", "success");
    });
}
async function load() {
  if (!id) return empty("Record not specified.");
  const snapshot = await get(
      ref(
        database,
        `${type === "institute" ? "institutes" : "talentOpportunities"}/${id}`,
      ),
    ),
    item = snapshot.val();
  if (
    !item ||
    !isPublicActiveRecord(item) ||
    (type !== "institute" && !isDeadlineValid(item))
  )
    return empty("This public record is unavailable.");
  type === "institute" ? await instituteDetail(item) : opportunityDetail(item);
}
load().catch((err) => {
  console.error("Error loading record:", err);
  empty("Unable to load this record right now.");
});
