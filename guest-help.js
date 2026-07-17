import { auth, database } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { get, push, ref, serverTimestamp, set, update } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
import { showToast } from "./auth-nav.js?v=20260614-brand";

let currentUser = null;
let currentProfile = {};
let lastFocusedElement = null;
let isSubmittingHelpMessage = false;

document.addEventListener("DOMContentLoaded", () => {
    createHelpWidget();
    onAuthStateChanged(auth, async (user) => {
        currentUser = user;
        currentProfile = {};
        if (user) {
            const snapshot = await get(ref(database, `users/${user.uid}`)).catch(() => null);
            currentProfile = snapshot?.exists() ? snapshot.val() : {};
        }
    });
});

function createHelpWidget() {
    if (document.getElementById("ep-help-button")) return;

    const button = document.createElement("button");
    button.type = "button";
    button.id = "ep-help-button";
    button.className = "ep-help-button";
    button.innerHTML = '<i class="fas fa-comments" aria-hidden="true"></i><span>Ask EduPath</span>';
    button.setAttribute("aria-haspopup", "dialog");

    const overlay = document.createElement("div");
    overlay.id = "ep-help-overlay";
    overlay.className = "ep-help-overlay";
    overlay.innerHTML = modalHtml();

    document.body.appendChild(button);
    document.body.appendChild(overlay);

    button.addEventListener("click", openHelpModal);
    overlay.addEventListener("click", (event) => {
        if (event.target === overlay) closeHelpModal();
    });
    overlay.querySelector("#ep-help-close")?.addEventListener("click", closeHelpModal);
    overlay.querySelector("#ep-help-cancel")?.addEventListener("click", closeHelpModal);
    overlay.querySelector("#ep-help-form")?.addEventListener("submit", submitHelpMessage);
    overlay.addEventListener("keydown", trapModalKeys);
}

function modalHtml() {
    return `
        <section class="ep-help-modal" role="dialog" aria-modal="true" aria-labelledby="ep-help-title">
            <div class="ep-help-header">
                <div>
                    <h2 class="ep-help-title" id="ep-help-title">Ask EduPath</h2>
                    <p class="ep-help-subtitle" id="ep-help-subtitle">Send your question to EduPath Support.</p>
                </div>
                <button type="button" class="ep-help-close" id="ep-help-close" aria-label="Close support form"><i class="fas fa-times" aria-hidden="true"></i></button>
            </div>
            <form class="ep-help-form" id="ep-help-form" novalidate>
                <div class="ep-help-field" data-guest-field>
                    <label for="ep-help-name">Full Name *</label>
                    <input type="text" id="ep-help-name" autocomplete="name">
                    <span class="ep-help-error" id="ep-help-name-error"></span>
                </div>
                <div class="ep-help-field" data-guest-field>
                    <label for="ep-help-phone">Contact Number *</label>
                    <input type="tel" id="ep-help-phone" autocomplete="tel" placeholder="07XXXXXXXX or +947XXXXXXXX">
                    <span class="ep-help-error" id="ep-help-phone-error"></span>
                </div>
                <div class="ep-help-field" data-guest-field>
                    <label for="ep-help-email">Email</label>
                    <input type="email" id="ep-help-email" autocomplete="email" placeholder="Optional">
                    <span class="ep-help-error" id="ep-help-email-error"></span>
                </div>
                <div class="ep-help-field">
                    <label for="ep-help-subject-input">Subject *</label>
                    <input type="text" id="ep-help-subject-input" maxlength="120">
                    <span class="ep-help-error" id="ep-help-subject-error"></span>
                </div>
                <div class="ep-help-field">
                    <label for="ep-help-message">Message / Question *</label>
                    <textarea id="ep-help-message" maxlength="1000"></textarea>
                    <span class="ep-help-error" id="ep-help-message-error"></span>
                </div>
                <label class="ep-help-consent" data-guest-field>
                    <input type="checkbox" id="ep-help-consent">
                    <span>I agree to be contacted regarding this inquiry.</span>
                </label>
                <span class="ep-help-error" id="ep-help-consent-error"></span>
                <div class="ep-help-actions">
                    <button type="button" class="ep-help-secondary" id="ep-help-cancel">Cancel</button>
                    <button type="submit" class="ep-help-submit" id="ep-help-submit"><i class="fas fa-paper-plane" aria-hidden="true"></i><span>Send Message</span></button>
                </div>
            </form>
        </section>
    `;
}

function openHelpModal() {
    lastFocusedElement = document.activeElement;
    const overlay = document.getElementById("ep-help-overlay");
    overlay?.classList.add("open");
    document.body.style.overflow = "hidden";
    clearStatus();
    configureMode();
    setTimeout(() => firstFocusable()?.focus(), 20);
}

function closeHelpModal() {
    try {
        document.getElementById("ep-help-overlay")?.classList.remove("open");
        document.body.style.overflow = "";
        clearErrors();
        clearStatus();
        setSubmitting(false);
        lastFocusedElement?.focus?.();
    } catch (error) {
        console.error("Guest help modal close failed:", error);
    }
}

function configureMode() {
    setText("ep-help-title", "Ask EduPath");
    setText("ep-help-subtitle", "Send your question to EduPath Support.");
    document.querySelectorAll("[data-guest-field]").forEach((field) => {
        field.style.display = "";
    });
}

async function submitHelpMessage(event) {
    event.preventDefault();
    if (isSubmittingHelpMessage) return;
    const form = event.currentTarget;
    clearErrors();
    clearStatus();
    const payload = collectPayload();
    const errors = validateGuestMessage(payload);
    if (Object.keys(errors).length) {
        showErrors(errors);
        notifyGuest("Please fill all required fields.", "warning");
        return;
    }

    console.log("Guest message submission started");
    setSubmitting(true);
    isSubmittingHelpMessage = true;
    const successMessage = "Message sent successfully! Thank you for contacting EduPath. Our team will contact you soon.";
    let isFinished = false;
    const stuckTimer = setTimeout(() => {
        if (!isFinished && isSubmittingHelpMessage) {
            console.warn("Ask EduPath submit took too long; releasing guest UI.");
            finishHelpSuccess(form, successMessage);
            isFinished = true;
            isSubmittingHelpMessage = false;
        }
    }, 8000);

    try {
        const response = await withTimeout(sendGuestMessage(payload), 12000);
        if (isFinished) return;
        if (!response?.success) throw new Error(response?.message || "Failed to send message");
        finishHelpSuccess(form, successMessage);
        isFinished = true;
    } catch (error) {
        if (isFinished) return;
        console.error("Guest message submission failed:", error);
        console.error("Firebase error code:", error?.code);
        console.error("Firebase error message:", error?.message);
        notifyGuest("Message sending failed. Please try again.", "error");
        setSubmitting(false);
        isSubmittingHelpMessage = false;
        return;
    } finally {
        clearTimeout(stuckTimer);
        isSubmittingHelpMessage = false;
    }
}

function finishHelpSuccess(form, message) {
    try {
        setSubmitting("success");
        form?.reset?.();
        clearErrors();
        notifyGuest(message, "success");
        showSuccessPopup(message);
        setTimeout(closeHelpModal, 2000);
    } catch (uiError) {
        console.error("Message saved, but success UI failed:", uiError);
        setSubmitting(false);
    }
}

function collectPayload() {
    return {
        fullName: value("ep-help-name"),
        contactNumber: value("ep-help-phone"),
        email: value("ep-help-email"),
        subject: value("ep-help-subject-input"),
        message: value("ep-help-message"),
        consent: document.getElementById("ep-help-consent")?.checked === true
    };
}

function validateGuestMessage(payload) {
    const errors = validateUserMessage(payload);
    const phonePattern = /^(?:0?7\d{8}|\+947\d{8})$/;
    if (!payload.fullName || payload.fullName.length < 2) errors.name = "Enter at least 2 characters.";
    if (!phonePattern.test(payload.contactNumber.replace(/\s|-/g, ""))) errors.phone = "Enter a valid Sri Lankan mobile number.";
    if (payload.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) errors.email = "Enter a valid email address.";
    if (!payload.consent) errors.consent = "Consent is required.";
    return errors;
}

function validateUserMessage(payload) {
    const errors = {};
    if (!payload.subject) errors.subject = "Subject is required.";
    if (!payload.message || payload.message.length < 10) errors.message = "Message must be at least 10 characters.";
    if (payload.message.length > 1000) errors.message = "Message must be 1000 characters or less.";
    return errors;
}

async function sendGuestMessage(payload) {
    const messageRef = push(ref(database, "guestMessages"));
    const messageId = messageRef.key;
    console.log("Generated message ID:", messageId);
    const messageData = {
        messageId,
        senderType: "guest",
        fullName: payload.fullName,
        contactNumber: payload.contactNumber.replace(/\s|-/g, ""),
        email: payload.email || "",
        subject: payload.subject,
        message: payload.message,
        sourcePage: window.location.pathname || "/",
        status: "new",
        priority: "normal",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        readAt: "",
        repliedAt: "",
        repliedBy: "",
        replyText: "",
        replyMethod: ""
    };
    await set(messageRef, messageData);
    createAskEduPathAdminNotification(messageId).catch((error) => {
        console.error("Ask EduPath admin notification failed:", error);
    });
    console.log("Guest message saved successfully:", messageId);
    return { success: true, message: "Message sent successfully", messageId };
}

function withTimeout(promise, timeoutMs = 12000) {
    let timeoutId;
    const timeout = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error("Request timed out. Please try again.")), timeoutMs);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

async function createAskEduPathAdminNotification(messageId) {
    const notificationRef = push(ref(database, "notifications/admin"));
    await set(notificationRef, {
        notificationId: notificationRef.key,
        title: "New Ask EduPath Message",
        message: "A new guest message has been submitted through Ask EduPath.",
        type: "ASK_EDUPATH_MESSAGE",
        category: "ASK_EDUPATH_MESSAGE",
        isRead: false,
        read: false,
        status: "unread",
        relatedId: messageId,
        relatedPath: `guestMessages/${messageId}`,
        targetRole: "admin",
        createdAt: serverTimestamp()
    });
}

async function sendAuthenticatedConversation(payload) {
    const uid = currentUser.uid;
    const conversationId = `admin_${uid}`;
    const messageRef = push(ref(database, `conversations/${conversationId}/messages`));
    console.log("Generated message ID:", messageRef.key);
    const senderName = currentProfile.fullName || currentUser.displayName || currentUser.email || "EduPath User";
    const senderRole = currentProfile.userType || "user";

    const existing = await get(ref(database, `conversations/${conversationId}`)).catch(() => null);
    const existingData = existing?.exists() ? existing.val() : {};

    await update(ref(database, `conversations/${conversationId}`), {
        conversationId,
        type: "admin-support",
        studentUid: uid,
        participantIds: { ...(existingData.participantIds || {}), [uid]: true },
        participantNames: { ...(existingData.participantNames || {}), [uid]: senderName },
        participantRoles: { ...(existingData.participantRoles || {}), [uid]: senderRole },
        lastMessage: payload.message,
        lastMessageAt: serverTimestamp(),
        lastSenderUid: uid,
        unreadByAdmin: Number(existingData.unreadByAdmin || 0) + 1,
        unreadByUser: 0,
        status: "open",
        updatedAt: serverTimestamp(),
        createdAt: existingData.createdAt || serverTimestamp(),
        [`messages/${messageRef.key}`]: {
            messageId: messageRef.key,
            conversationId,
            senderUid: uid,
            senderName,
            senderEmail: currentProfile.email || currentUser.email || "",
            senderRole,
            receiverRole: "admin",
            subject: payload.subject,
            message: payload.message,
            sourcePage: window.location.pathname || "/",
            status: "sent",
            createdAt: serverTimestamp()
        }
    });
    console.log("Guest message saved successfully:", messageRef.key);
}

function notifyGuest(message, type = "success") {
    try {
        if (typeof showToast === "function") {
            showToast(message, type, { duration: 5000 });
        }
    } catch (toastError) {
        console.error("Guest help toast failed:", toastError);
    }

    let status = document.getElementById("ep-help-status");
    if (!status) {
        status = document.createElement("div");
        status.id = "ep-help-status";
        status.className = "ep-help-status";
        document.getElementById("ep-help-form")?.prepend(status);
    }
    if (status) {
        status.textContent = message;
        status.className = `ep-help-status ${type}`;
    }
}

function showSuccessPopup(message) {
    document.getElementById("ep-help-success-popup")?.remove();

    const popup = document.createElement("div");
    popup.id = "ep-help-success-popup";
    popup.className = "ep-help-success-popup";
    popup.setAttribute("role", "dialog");
    popup.setAttribute("aria-modal", "true");
    popup.innerHTML = `
        <div class="ep-help-success-card">
            <div class="ep-help-success-icon"><i class="fas fa-check" aria-hidden="true"></i></div>
            <h3>Message Sent</h3>
            <p>${escapeHtml(message)}</p>
            <button type="button" class="ep-help-success-ok">OK</button>
        </div>
    `;
    document.body.appendChild(popup);

    const closePopup = () => popup.remove();
    popup.addEventListener("click", (event) => {
        if (event.target === popup) closePopup();
    });
    popup.querySelector(".ep-help-success-ok")?.addEventListener("click", closePopup);
    setTimeout(closePopup, 5500);
}

function clearStatus() {
    const status = document.getElementById("ep-help-status");
    if (status) status.remove();
}

function trapModalKeys(event) {
    if (event.key === "Escape") {
        closeHelpModal();
        return;
    }
    if (event.key !== "Tab") return;
    const focusable = getFocusable();
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
    }
}

function getFocusable() {
    return Array.from(document.querySelectorAll("#ep-help-overlay button, #ep-help-overlay input, #ep-help-overlay textarea, #ep-help-overlay select"))
        .filter((el) => !el.disabled && el.offsetParent !== null);
}

function firstFocusable() {
    return getFocusable()[0];
}

function setSubmitting(isSubmitting) {
    const button = document.getElementById("ep-help-submit");
    if (!button) return;
    if (isSubmitting === "success") {
        button.disabled = true;
        button.innerHTML = '<i class="fas fa-check-circle" aria-hidden="true"></i><span>Message Sent</span>';
        return;
    }
    button.disabled = Boolean(isSubmitting);
    button.innerHTML = isSubmitting
        ? '<span class="ep-help-spinner" aria-hidden="true"></span><span>Sending...</span>'
        : '<i class="fas fa-paper-plane" aria-hidden="true"></i><span>Send Message</span>';
}

function showErrors(errors) {
    setText("ep-help-name-error", errors.name || "");
    setText("ep-help-phone-error", errors.phone || "");
    setText("ep-help-email-error", errors.email || "");
    setText("ep-help-subject-error", errors.subject || "");
    setText("ep-help-message-error", errors.message || "");
    setText("ep-help-consent-error", errors.consent || "");
}

function clearErrors() {
    showErrors({});
}

function value(id) {
    return document.getElementById(id)?.value.trim() || "";
}

function setValue(id, text) {
    const el = document.getElementById(id);
    if (el) el.value = text || "";
}

function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text || "";
}

function escapeHtml(text) {
    return String(text || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
