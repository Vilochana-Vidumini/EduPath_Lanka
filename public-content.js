export const normalizeStatus = (value) => String(value || "").trim().toLowerCase();
export const toList = (value) => Array.isArray(value) ? value.filter(Boolean) : value && typeof value === "object" ? Object.values(value).filter(Boolean) : String(value || "").split(/[,;|\n]/).map((item) => item.trim()).filter(Boolean);
export function isPublicActiveRecord(record = {}) {
  const status = normalizeStatus(record.status || record.accountStatus);
  const approval = normalizeStatus(record.approvalStatus || record.verificationStatus);
  return record.publicVisibility !== false && (status === "active" || approval === "approved") && (!approval || approval === "approved" || status === "active");
}
export function isDeadlineValid(record = {}) {
  const deadline = record.deadline || record.applicationDeadline || record.closingDate;
  if (!deadline || record.ongoing === true || /ongoing/i.test(record.opportunityType || record.type || "")) return true;
  const date = new Date(deadline); date.setHours(23, 59, 59, 999);
  return Number.isNaN(date.getTime()) || date >= new Date();
}
export const getRecordTitle = (record = {}, fallback = "Untitled") => record.instituteName || record.title || record.name || record.opportunityName || fallback;
export function getRecordImage(record = {}, fallback = "images/course-placeholder.png") {
  const value = String(record.logoURL || record.logoUrl || record.logo || record.imageURL || record.imagePath || record.image || "").trim().replace(/\\/g, "/");
  if (!value) return fallback;
  if (/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(value) || /^https?:\/\//i.test(value) || /^(\.\.\/|\.\/)?images\//i.test(value)) return value;
  return `images/${value.replace(/^\/+/, "")}`;
}
export function formatDate(value) { const date = new Date(value); return value && !Number.isNaN(date.getTime()) ? date.toLocaleDateString("en-LK", { year: "numeric", month: "short", day: "numeric" }) : "Not specified"; }
export const escapeHTML = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
export const escapeAttr = (value) => escapeHTML(value).replace(/`/g, "&#096;");
export const truncateText = (text, length = 130) => String(text || "").length > length ? `${String(text).slice(0, length).trim()}...` : String(text || "");
export const recordTime = (record, field) => { const value = record?.[field]; return typeof value === "number" ? value : Date.parse(value || "") || 0; };
export function sortInstitutes([idA, a], [idB, b]) { return Number(Boolean(b.featured)) - Number(Boolean(a.featured)) || (Number(a.sortOrder) || 999) - (Number(b.sortOrder) || 999) || recordTime(b, "updatedAt") - recordTime(a, "updatedAt") || getRecordTitle(a, idA).localeCompare(getRecordTitle(b, idB)); }
export function sortOpportunities([, a], [, b]) { const deadline = (item) => isDeadlineValid(item) && item.deadline ? Date.parse(item.deadline) || Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER; return Number(Boolean(b.featured)) - Number(Boolean(a.featured)) || deadline(a) - deadline(b) || recordTime(a, "eventDate") - recordTime(b, "eventDate") || recordTime(b, "updatedAt") - recordTime(a, "updatedAt"); }
export const safeExternalUrl = (value) => { try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) ? url.href : ""; } catch { return ""; } };
