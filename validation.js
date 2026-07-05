// EduPath Lanka - shared client-side validation and normalization helpers

export function normalizeText(value, options = {}) {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    return options.lowercase ? text.toLowerCase() : text;
}

export function requiredText(value, label, options = {}) {
    const text = normalizeText(value);
    if (!text) return `${label} is required.`;
    if (options.minLength && text.length < options.minLength) return `${label} must contain at least ${options.minLength} characters.`;
    if (options.maxLength && text.length > options.maxLength) return `${label} must not exceed ${options.maxLength} characters.`;
    return "";
}

export function validateEmail(value, label = "Email") {
    const email = normalizeText(value, { lowercase: true });
    if (!email) return `${label} is required.`;
    if (email.length > 254 || /\s/.test(email)) return `Enter a valid ${label.toLowerCase()}.`;
    const parts = email.split("@");
    if (parts.length !== 2 || !parts[0] || !parts[1]) return `Enter a valid ${label.toLowerCase()}.`;
    if (!/^[^\s@]+$/.test(parts[0])) return `Enter a valid ${label.toLowerCase()}.`;
    if (!/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(parts[1])) {
        return `Enter a valid ${label.toLowerCase()}.`;
    }
    return "";
}

export function normalizeSriLankanPhone(value) {
    const raw = String(value || "").trim();
    const cleaned = raw.startsWith("+") ? `+${raw.slice(1).replace(/\D/g, "")}` : raw.replace(/\D/g, "");
    let digits = cleaned.replace(/^\+/, "");

    if (digits.startsWith("94") && digits.length === 11) return `+${digits}`;
    if (digits.startsWith("0") && digits.length === 10) return `+94${digits.slice(1)}`;
    if (digits.length === 9 && /^[1-9]/.test(digits)) return `+94${digits}`;
    return "";
}

export function validatePhone(value, label = "Phone number", options = {}) {
    const text = normalizeText(value);
    if (!text && options.optional) return "";
    if (!normalizeSriLankanPhone(text)) return `${label} must be a valid Sri Lankan number, e.g. 0712345678 or +94712345678.`;
    return "";
}

export function validatePublicUrl(value, label = "URL", options = {}) {
    const text = normalizeText(value);
    if (!text && options.optional) return "";
    if (/^(javascript|data):/i.test(text)) return `${label} is not allowed.`;
    if (/^images\/[A-Za-z0-9._/-]+\.(png|jpe?g|webp|gif|svg)$/i.test(text)) return "";
    try {
        const url = new URL(text);
        if (!["https:", "http:"].includes(url.protocol)) return `${label} must start with https:// or http://.`;
        if (!url.hostname.includes(".")) return `${label} must contain a valid domain.`;
        return "";
    } catch {
        return `${label} must be a valid URL.`;
    }
}

export function validateImageUrl(value, label = "Image URL", options = {}) {
    const error = validatePublicUrl(value, label, options);
    if (error || (!value && options.optional)) return error;
    const path = String(value || "").split("?")[0].toLowerCase();
    return /\.(png|jpe?g|webp|gif|svg)$/.test(path) ? "" : `${label} must point to an image file.`;
}

export function validateDocumentUrl(value, label = "Document URL", options = {}) {
    const error = validatePublicUrl(value, label, options);
    if (error || (!value && options.optional)) return error;
    const path = String(value || "").split("?")[0].toLowerCase();
    return /\.(pdf|doc|docx|png|jpe?g|webp)$/.test(path) ? "" : `${label} must point to a document or image file.`;
}

export function validateNumberRange(value, label, { min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY, integer = false, optional = false } = {}) {
    if ((value === "" || value === null || value === undefined) && optional) return "";
    const number = Number(value);
    if (!Number.isFinite(number)) return `${label} must be a valid number.`;
    if (integer && !Number.isInteger(number)) return `${label} must be a whole number.`;
    if (number < min || number > max) return `${label} must be between ${min} and ${max}.`;
    return "";
}

export function normalizeList(value) {
    let list = [];
    if (Array.isArray(value)) {
        list = value;
    } else if (value && typeof value === "object") {
        list = Object.entries(value).filter(([, enabled]) => enabled === true).map(([key]) => key);
    } else {
        list = String(value || "").split(",");
    }
    return [...new Set(list.map((item) => normalizeText(item)).filter(Boolean))];
}

export function validateDate(value, label = "Date", options = {}) {
    if (!value && options.optional) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return `${label} must be a valid date.`;
    return "";
}

export function validateTime(value, label = "Time", options = {}) {
    if (!value && options.optional) return "";
    return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || "")) ? "" : `${label} must be a valid time.`;
}

export function timeToMinutes(value) {
    const [hours, minutes] = String(value || "0:0").split(":").map(Number);
    return (hours * 60) + minutes;
}

export function validateDateRange(start, end, label = "Date range") {
    const startDate = new Date(start);
    const endDate = new Date(end);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return `${label} is invalid.`;
    return endDate > startDate ? "" : `${label} end must be after start.`;
}

export function intervalsOverlap(startA, endA, startB, endB) {
    return startA < endB && startB < endA;
}

export function isPastDateTime(dateValue, timeValue = "00:00") {
    const when = new Date(`${dateValue}T${timeValue}`);
    return Number.isNaN(when.getTime()) || when.getTime() < Date.now();
}

export function validateRole(value) {
    return ["student", "mentor", "admin", "institute"].includes(String(value || "").toLowerCase()) ? "" : "Invalid user role.";
}

export function validateFirebaseKey(value, label = "ID") {
    return /^[^.#$\[\]/]+$/.test(String(value || "")) ? "" : `${label} contains invalid Firebase key characters.`;
}

export function sanitizeRecord(record = {}) {
    return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));
}

export function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

export function showFieldError(inputOrId, message) {
    const input = typeof inputOrId === "string" ? document.getElementById(inputOrId) : inputOrId;
    if (!input) return;
    input.classList.toggle("is-invalid", Boolean(message));
    input.setAttribute("aria-invalid", message ? "true" : "false");
    const errorId = input.getAttribute("aria-describedby") || `${input.id}-error`;
    input.setAttribute("aria-describedby", errorId);
    let errorEl = document.getElementById(errorId);
    if (!errorEl && input.parentElement) {
        errorEl = document.createElement("small");
        errorEl.id = errorId;
        errorEl.className = "field-error";
        errorEl.setAttribute("aria-live", "polite");
        input.parentElement.appendChild(errorEl);
    }
    if (errorEl) errorEl.textContent = message || "";
}

export function clearFieldError(inputOrId) {
    showFieldError(inputOrId, "");
}

export function validateForm(rules = []) {
    const errors = [];
    rules.forEach(({ id, validate }) => {
        const input = document.getElementById(id);
        const message = validate(input?.value, input) || "";
        showFieldError(input, message);
        if (message) errors.push({ id, message, input });
    });
    if (errors[0]?.input) {
        errors[0].input.focus();
        errors[0].input.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    return { valid: errors.length === 0, errors };
}
