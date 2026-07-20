import { auth, database } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { ref, get, set, update, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

let currentUid = null;
let representativeData = null;

document.addEventListener('DOMContentLoaded', () => {
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            signOut(auth).then(() => {
                window.location.href = 'index.html';
            });
        });
    }

    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            window.location.href = 'login.html';
            return;
        }

        currentUid = user.uid;
        
        try {
            // Fetch user and representative data
            const userSnap = await get(ref(database, `users/${currentUid}`));
            const repSnap = await get(ref(database, `instituteRepresentatives/${currentUid}`));
            
            if (!userSnap.exists() || !repSnap.exists() || userSnap.val().role !== 'institute') {
                window.location.href = 'index.html';
                return;
            }

            representativeData = repSnap.val();

            // If already completed onboarding, send to dashboard
            if (userSnap.val().instituteOnboardingCompleted) {
                window.location.href = 'institute-dashboard.html';
                return;
            }

            // Populate representative card
            document.getElementById('rep-name').textContent = representativeData.representativeName || userSnap.val().fullName;
            document.getElementById('rep-email').textContent = representativeData.representativeEmail || userSnap.val().email;
            document.getElementById('rep-phone').textContent = representativeData.representativePhone || userSnap.val().phone;

        } catch (error) {
            console.error("Error fetching representative data:", error);
            showAlert("Failed to load account details. Please try refreshing.", "error");
        }
    });

    const form = document.getElementById('institute-onboarding-form');
    if (form) {
        form.addEventListener('submit', handleOnboardingSubmit);
    }
});

async function handleOnboardingSubmit(e) {
    e.preventDefault();
    
    if (!currentUid || !representativeData) return;

    const btn = document.getElementById('submit-btn');
    const originalBtnContent = btn.innerHTML;
    
    // Clear alerts
    showAlert("", "");

    // Gather basic details
    const instituteName = document.getElementById('instituteName').value.trim();
    const shortName = document.getElementById('shortName').value.trim();
    const instituteType = document.getElementById('instituteType').value;
    const registrationNumber = document.getElementById('registrationNumber').value.trim();
    const description = document.getElementById('description').value.trim();
    
    // Gather contact
    const officialEmail = document.getElementById('officialEmail').value.trim();
    const officialPhone = document.getElementById('officialPhone').value.trim();
    const website = document.getElementById('website').value.trim();
    
    // Gather location
    const address = document.getElementById('address').value.trim();
    const district = document.getElementById('district').value.trim();
    const city = document.getElementById('city').value.trim();
    const province = document.getElementById('province').value.trim();
    const country = document.getElementById('country').value.trim();

    // Gather programs
    const programTypes = parseCommaSeparated(document.getElementById('programTypes').value);
    const categories = parseCommaSeparated(document.getElementById('categories').value);
    const studyModes = parseCommaSeparated(document.getElementById('studyModes').value);
    const languages = parseCommaSeparated(document.getElementById('languages').value);

    // Media
    const logoUrl = document.getElementById('logoUrl').value.trim();
    const coverImageUrl = document.getElementById('coverImageUrl').value.trim();
    
    // Visibility
    const publicVisibility = document.getElementById('publicVisibility').checked;
    const showOnHomePage = document.getElementById('showOnHomePage').checked;
    
    // Verification
    const representativeDesignation = document.getElementById('representativeDesignation').value.trim();
    const authConfirm = document.getElementById('authConfirm').checked;

    // Simple validation check (HTML5 validation should catch most)
    if (!instituteName || !instituteType || !description || !officialEmail || !officialPhone || !address || !district || !city || !province || !representativeDesignation) {
        showAlert("Please fill in all required fields.", "error");
        return;
    }
    
    if (!authConfirm) {
        showAlert("You must confirm authorization.", "error");
        return;
    }

    if (programTypes.length === 0 || studyModes.length === 0 || languages.length === 0) {
        showAlert("Please provide at least one item for Program Types, Study Modes, and Languages.", "error");
        return;
    }

    try {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';

        // Generate an institute ID (for now, using the representative's UID as the institute ID is standard in this project, but we can generate a new one. The requirements say:
        // ownerUid: uid, representativeUid: uid, instituteId: instituteId. Let's use a standard push ID to separate institute from user)
        const newInstituteRef = push(ref(database, 'institutes'));
        const instituteId = newInstituteRef.key;

        const instituteData = {
            instituteId,
            ownerUid: currentUid,
            representativeUid: currentUid,
            
            instituteName,
            shortName,
            instituteType,
            registrationNumber,
            description,
            
            officialEmail,
            officialPhone,
            website,
            
            address,
            district,
            city,
            province,
            country,
            
            programTypes,
            relatedAcademicCategoryTitles: categories, // Using this as requested in data structure
            supportedPathways: [], // Not gathered in form directly yet
            studyModes,
            languages,
            
            logoUrl,
            coverImageUrl,
            
            representativeName: representativeData.representativeName,
            representativeEmail: representativeData.representativeEmail,
            representativePhone: representativeData.representativePhone,
            representativeDesignation,
            
            status: "pending",
            approvalStatus: "pending",
            publicVisibility: publicVisibility,
            featured: false,
            showOnHomePage: showOnHomePage,
            
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        };

        // Update Users collection
        const userUpdates = {
            instituteId,
            instituteName,
            instituteOnboardingCompleted: true,
            approvalStatus: "pending",
            accountStatus: "pending",
            updatedAt: serverTimestamp()
        };

        // Update Representatives collection
        const repUpdates = {
            instituteId,
            roleInInstitute: representativeDesignation,
            onboardingCompleted: true,
            updatedAt: serverTimestamp()
        };

        const writes = [
            set(ref(database, `institutes/${instituteId}`), instituteData),
            update(ref(database, `users/${currentUid}`), userUpdates),
            update(ref(database, `instituteRepresentatives/${currentUid}`), repUpdates)
        ];

        await Promise.all(writes);

        showAlert("Institute profile submitted successfully! Redirecting to dashboard...", "success");
        setTimeout(() => {
            window.location.href = 'institute-dashboard.html';
        }, 1500);

    } catch (error) {
        console.error("Error submitting onboarding form:", error);
        showAlert("An error occurred during submission. Please try again.", "error");
        btn.disabled = false;
        btn.innerHTML = originalBtnContent;
    }
}

function parseCommaSeparated(str) {
    if (!str) return [];
    return str.split(',').map(item => item.trim()).filter(item => item.length > 0);
}

function showAlert(message, type) {
    const alertEl = document.getElementById('alert-message');
    if (!alertEl) return;
    
    if (!message) {
        alertEl.className = 'alert hidden';
        alertEl.textContent = '';
        return;
    }

    alertEl.textContent = message;
    alertEl.className = `alert alert-${type}`;
    // Scroll to top to see error
    window.scrollTo({ top: 0, behavior: 'smooth' });
}
