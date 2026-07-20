import { auth, database } from "./firebase-config.js";
import { onAuthStateChanged, updatePassword } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { ref, get, update, onValue, serverTimestamp, push } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
import { showToast } from "./auth-nav.js?v=20260614-brand";
import {
    requiredText,
    validatePhone,
    normalizeSriLankanPhone,
    validateImageUrl,
    validatePublicUrl,
    validateDocumentUrl,
    validateNumberRange,
    validateForm,
    showFieldError,
    clearFieldError,
    normalizeList
} from "./validation.js";
import { getDashboardDestination, normalizeRole } from "./shared-navigation.js";
import { initDashboardSidebar, updateSidebarUser } from "./sidebar.js";
import { ensureDashboardTopbarLayout } from "./dashboard-topbar.js";

document.addEventListener('DOMContentLoaded', () => {
    let currentUser = null;
    let userRole = 'student';
    let cachedUserData = null;
    let cachedRoleData = null;
    let cachedPrivateData = {};
    let cachedApplicationData = {};
    let cachedAvailabilityData = {};
    let mergedMentorProfile = {};

    // --- Modal overlays selectors ---
    const avatarModalOverlay = document.getElementById('avatar-modal-overlay');
    const passwordModalOverlay = document.getElementById('password-modal-overlay');
    
    const closeAvatarModal = document.getElementById('close-avatar-modal');
    const closePasswordModal = document.getElementById('close-password-modal');
    
    const cancelAvatarBtn = document.getElementById('cancel-avatar-btn');
    const cancelPasswordBtn = document.getElementById('cancel-password-btn');

    // --- Controls and forms selectors ---
    const editToggleBtn = document.getElementById('edit-profile-toggle-btn');
    const editingControlsBlock = document.getElementById('editing-controls-block');
    const cancelEditBtn = document.getElementById('cancel-edit-btn');
    const profileDetailsForm = document.getElementById('profile-details-form');
    const submitMentorProfileBtn = document.getElementById('submit-mentor-profile-btn');
    
    const openPwdBtn = document.getElementById('open-pwd-modal-btn');
    const changePwdForm = document.getElementById('profile-change-password-form');
    const avatarUpdateForm = document.getElementById('avatar-update-form');

    // --- Global Modal helper functions ---
    const openModal = (overlay) => {
        overlay.classList.add('show');
    };

    const closeModal = (overlay) => {
        overlay.classList.remove('show');
    };

    const closeAllModals = () => {
        closeModal(avatarModalOverlay);
        closeModal(passwordModalOverlay);
    };

    // Bind close events
    closeAvatarModal?.addEventListener('click', () => closeModal(avatarModalOverlay));
    closePasswordModal?.addEventListener('click', () => closeModal(passwordModalOverlay));
    cancelAvatarBtn?.addEventListener('click', () => closeModal(avatarModalOverlay));
    cancelPasswordBtn?.addEventListener('click', () => closeModal(passwordModalOverlay));
    
    // Open password modal
    openPwdBtn?.addEventListener('click', () => {
        changePwdForm.reset();
        document.getElementById('password-match-error').classList.add('hidden');
        openModal(passwordModalOverlay);
    });

    // Open avatar modal
    document.getElementById('change-avatar-btn')?.addEventListener('click', () => {
        document.getElementById('input-photoURL').value = (cachedUserData && cachedUserData.photoURL) ? cachedUserData.photoURL : '';
        openModal(avatarModalOverlay);
    });

    // Bind cancel edit toggle
    cancelEditBtn?.addEventListener('click', () => {
        toggleEditingMode(false);
        populateFormData(); // revert values to cache
    });

    // Toggle edit-lock state
    editToggleBtn?.addEventListener('click', () => {
        toggleEditingMode(true);
    });

    submitMentorProfileBtn?.addEventListener('click', () => submitMentorProfileForReview());

    document.querySelectorAll('[data-mentor-tab]').forEach((button) => {
        button.addEventListener('click', () => {
            const tab = button.dataset.mentorTab;
            document.querySelectorAll('[data-mentor-tab]').forEach((btn) => btn.classList.toggle('active', btn === button));
            document.querySelectorAll('[data-mentor-panel]').forEach((panel) => panel.classList.toggle('active', panel.dataset.mentorPanel === tab));
        });
    });

    document.querySelectorAll('[data-student-tab]').forEach((button) => {
        button.addEventListener('click', () => {
            const tab = button.dataset.studentTab;
            document.querySelectorAll('[data-student-tab]').forEach((btn) => btn.classList.toggle('active', btn === button));
            document.querySelectorAll('[data-student-panel]').forEach((panel) => panel.classList.toggle('active', panel.dataset.studentPanel === tab));
        });
    });

    function toggleEditingMode(isEditing) {
        const inputs = profileDetailsForm.querySelectorAll('.form-input');
        inputs.forEach(input => {
            // Email and Type and Created Dates are ALWAYS read-only
            if (input.id === 'field-email' || input.id === 'field-userType' || input.id === 'field-createdAt' || input.id === 'field-updatedAt') {
                return;
            }
            if (input.tagName === 'SELECT') {
                input.disabled = !isEditing;
            } else {
                input.readOnly = !isEditing;
            }
        });

        profileDetailsForm.querySelectorAll('[data-profile-checkbox-group] input, .mentor-declarations input[type="checkbox"], input[name="field-pathwayPreference"], input[name="field-talentOpportunities"]').forEach(input => {
            input.disabled = !isEditing;
        });

        if (isEditing) {
            editToggleBtn.classList.add('hidden');
            editingControlsBlock.classList.remove('hidden');
        } else {
            editToggleBtn.classList.remove('hidden');
            editingControlsBlock.classList.add('hidden');
        }
    }

    // --- Main Authenticated Profile Bootstrapper ---
    onAuthStateChanged(auth, (user) => {
        if (!user) {
            window.location.href = 'login.html?redirect=profile.html';
            return;
        }

        currentUser = user;
        loadProfileData(user.uid);
    });

    function loadProfileData(uid) {
        // Core user node listener
        onValue(ref(database, 'users/' + uid), (userSnapshot) => {
            if (!userSnapshot.exists()) {
                showToast("User details not found.", "error");
                return;
            }

            cachedUserData = userSnapshot.val();
            userRole = normalizeRole(cachedUserData.userType || 'student') || 'student';
            
            // Initialize Dashboard Layout Components
            ensureDashboardTopbarLayout();
            initDashboardSidebar();
            if (cachedUserData) {
                updateSidebarUser({ fullName: cachedUserData.fullName || 'User', role: userRole, photoURL: cachedUserData.photoURL });
            }

            populateFormData();
            // Set dynamic sidebar back-link URL
            const backLink = document.getElementById('dashboard-back-link');
            if (backLink) {
                backLink.href = getDashboardDestination(userRole);
            }

            // Bind role specifics
            if (userRole === 'student') {
                window.location.replace('student-dashboard.html#personal-profile-section');
                return;
            } else if (userRole === 'mentor') {
                document.getElementById('student-specific-card').classList.add('hidden');
                document.getElementById('mentor-specific-card').classList.remove('hidden');

                loadMentorProfileData(uid);

            } else { // Admin
                document.getElementById('student-specific-card').classList.add('hidden');
                document.getElementById('mentor-specific-card').classList.add('hidden');
                cachedRoleData = {};
                populateFormData();
                calculateProfileStrength();
            }
        });
    }

    async function loadMentorProfileData(uid) {
        const [mentorSnap, privateSnap, applicationSnap, availabilitySnap] = await Promise.all([
            get(ref(database, `mentors/${uid}`)),
            get(ref(database, `mentorPrivate/${uid}`)),
            get(ref(database, `mentorApplications/${uid}`)),
            get(ref(database, `mentorAvailability/${uid}`))
        ]);

        const mentorData = mentorSnap.exists() ? mentorSnap.val() : {};
        cachedPrivateData = privateSnap.exists() ? privateSnap.val() : {};
        cachedApplicationData = applicationSnap.exists() ? applicationSnap.val() : {};
        cachedAvailabilityData = availabilitySnap.exists() ? availabilitySnap.val() : {};

        await ensureExistingMentorProfile(uid, mentorData, cachedApplicationData, cachedPrivateData);

        mergedMentorProfile = {
            ...(cachedUserData || {}),
            ...cachedApplicationData,
            ...cachedPrivateData,
            ...mentorData
        };
        cachedRoleData = mergedMentorProfile;
        populateFormData();
        calculateProfileStrength();
        renderMentorProfileStatus();
        renderAvailabilitySummary();
    }

    async function ensureExistingMentorProfile(uid, mentorData = {}, applicationData = {}, privateData = {}) {
        const existingStatus = normalizeStatus(mentorData.approvalStatus || applicationData.approvalStatus || mentorData.status || cachedUserData?.mentorStatus || '');
        const alreadyApproved = existingStatus === 'approved';
        const preservedStatus = ['submitted', 'under_review', 'changes_requested', 'rejected'].includes(existingStatus) ? existingStatus : 'draft';
        const defaultStatus = alreadyApproved ? 'approved' : preservedStatus;
        const updates = {};
        const mentorDefaults = {
            uid,
            fullName: mentorData.fullName || cachedUserData?.fullName || '',
            email: mentorData.email || cachedUserData?.email || currentUser?.email || '',
            phone: mentorData.phone || cachedUserData?.phone || '',
            profileStatus: mentorData.profileStatus || (alreadyApproved ? 'completed' : 'incomplete'),
            approvalStatus: mentorData.approvalStatus || defaultStatus,
            applicationStatus: mentorData.applicationStatus || defaultStatus,
            status: mentorData.status || (alreadyApproved ? 'approved' : 'draft')
        };

        Object.entries(mentorDefaults).forEach(([key, value]) => {
            if ((mentorData[key] === undefined || mentorData[key] === '') && value !== undefined) {
                updates[`mentors/${uid}/${key}`] = value;
            }
        });

        if (mentorData.publicVisibility === undefined) updates[`mentors/${uid}/publicVisibility`] = alreadyApproved;
        if (mentorData.mentoringEnabled === undefined) updates[`mentors/${uid}/mentoringEnabled`] = alreadyApproved;
        if (!mentorData.createdAt && cachedUserData?.createdAt) updates[`mentors/${uid}/createdAt`] = cachedUserData.createdAt;
        updates[`mentors/${uid}/updatedAt`] = serverTimestamp();

        if (!Object.keys(applicationData).length) {
            updates[`mentorApplications/${uid}/mentorUid`] = uid;
            updates[`mentorApplications/${uid}/profileStatus`] = alreadyApproved ? 'completed' : 'incomplete';
            updates[`mentorApplications/${uid}/approvalStatus`] = defaultStatus;
            updates[`mentorApplications/${uid}/applicationStatus`] = defaultStatus;
            updates[`mentorApplications/${uid}/createdAt`] = serverTimestamp();
            updates[`mentorApplications/${uid}/updatedAt`] = serverTimestamp();
        }

        if (!Object.keys(privateData).length) {
            updates[`mentorPrivate/${uid}/mentorUid`] = uid;
            updates[`mentorPrivate/${uid}/createdAt`] = serverTimestamp();
            updates[`mentorPrivate/${uid}/updatedAt`] = serverTimestamp();
        }

        if (Object.keys(updates).length) {
            await update(ref(database), updates).catch((err) => console.warn('Mentor compatibility defaults skipped:', err));
        }
    }

    // Populate all input values from cached values
    function populateFormData() {
        if (!cachedUserData) return;

        // Core fields
        document.getElementById('field-fullName').value = cachedUserData.fullName || '';
        document.getElementById('field-email').value = cachedUserData.email || currentUser.email || '';
        document.getElementById('field-phone').value = cachedUserData.phone || '';
        document.getElementById('field-userType').value = cachedUserData.userType || 'Student';
        document.getElementById('field-createdAt').value = cachedUserData.createdAt ? new Date(cachedUserData.createdAt).toLocaleDateString() : '-';
        document.getElementById('field-updatedAt').value = cachedUserData.updatedAt ? new Date(cachedUserData.updatedAt).toLocaleString() : 'Never';

        // Avatar info panel
        const avatarDisplay = document.getElementById('profile-avatar-display');
        const userDisplayName = document.getElementById('user-display-name');
        const roleBadge = document.getElementById('user-role-badge');

        userDisplayName.textContent = cachedUserData.fullName || 'EduPath User';
        
        // Style badges
        roleBadge.className = `role-badge role-${userRole}`;
        roleBadge.textContent = userRole;

        const initials = (cachedUserData.fullName || 'EP').split(' ').map(n => n[0]).join('').substring(0, 2);
        if (cachedUserData.photoURL) {
            avatarDisplay.innerHTML = `<img src="${cachedUserData.photoURL}" alt="${cachedUserData.fullName}">`;
        } else {
            avatarDisplay.innerHTML = initials;
        }

        // Role fields
        if (userRole === 'student' && cachedRoleData) {
            document.getElementById('field-district').value = cachedRoleData.district || '';
            document.getElementById('field-educationLevel').value = cachedRoleData.educationLevel || '';
            document.getElementById('field-examStream').value = cachedRoleData.examStream || '';
            document.getElementById('field-resultStatus').value = cachedRoleData.resultStatus || '';
            document.getElementById('field-interestArea').value = cachedRoleData.interestArea || '';
            document.getElementById('field-futureGoal').value = cachedRoleData.futureGoal || '';
            document.getElementById('field-financialSupport').value = cachedRoleData.financialSupport || '';
            document.getElementById('field-learningMode').value = cachedRoleData.learningMode || '';
            document.getElementById('field-skills').value = cachedRoleData.skills || '';
            
            // New fields
            const pathwayPref = cachedRoleData.pathwayPreference || 'undecided';
            document.querySelectorAll('input[name="field-pathwayPreference"]').forEach(r => r.checked = r.value === pathwayPref);
            
            document.getElementById('field-enjoyedActivities').value = cachedRoleData.enjoyedActivities || '';
            document.getElementById('field-workStyle').value = cachedRoleData.workStyle || '';
            document.getElementById('field-talentsList').value = cachedRoleData.talentsList || '';
            
            const selectedOpportunities = new Set(normalizeList(cachedRoleData.talentOpportunities || []));
            document.querySelectorAll('input[name="field-talentOpportunities"]').forEach(cb => {
                cb.checked = selectedOpportunities.has(cb.value);
            });

        } else if (userRole === 'mentor' && cachedRoleData) {
            const mentor = mergedMentorProfile || cachedRoleData;
            setValue('field-photoURL', valueFrom(mentor, 'photoURL'));
            setValue('field-mentorDistrict', valueFrom(mentor, 'district'));
            setValue('field-mentorCity', valueFrom(mentor, 'city'));
            setProfileCheckedValues('preferredLanguages', arrayFrom(valueFrom(mentor, 'preferredLanguages', 'languages', 'language')));
            setValue('field-mentorType', valueFrom(mentor, 'mentorType'));
            setValue('field-field', valueFrom(mentor, 'field', 'mentoringField', 'expertise'));
            setValue('field-currentPosition', valueFrom(mentor, 'currentPosition', 'currentRole'));
            setValue('field-universityOrCompany', valueFrom(mentor, 'universityOrCompany', 'organization', 'company'));
            setValue('field-highestQualification', valueFrom(mentor, 'highestQualification', 'qualification'));
            setValue('field-studyArea', valueFrom(mentor, 'studyArea'));
            setValue('field-yearsOfExperience', valueFrom(mentor, 'yearsOfExperience', 'experience'));
            setValue('field-professionalMembership', valueFrom(mentor, 'professionalMembership'));
            setValue('field-linkedInURL', valueFrom(mentor, 'linkedInURL'));
            setValue('field-portfolioURL', valueFrom(mentor, 'portfolioURL'));
            setProfileCheckedValues('guidanceAreas', arrayFrom(valueFrom(mentor, 'guidanceAreas')));
            setProfileCheckedValues('studentLevelsSupported', arrayFrom(valueFrom(mentor, 'studentLevelsSupported')));
            setProfileCheckedValues('streamsSupported', arrayFrom(valueFrom(mentor, 'streamsSupported')));
            setValue('field-mentoringMode', valueFrom(mentor, 'mentoringMode'));
            setValue('field-maxStudents', valueFrom(mentor, 'maxStudents'));
            setValue('field-bio', valueFrom(mentor, 'bio', 'shortBio'));
            setValue('field-whyMentor', valueFrom(mentor, 'whyMentor'));
            setValue('field-studentExpectation', valueFrom(mentor, 'studentExpectation'));
            setValue('field-cvURL', valueFrom(mentor, 'cvURL'));
            setValue('field-qualificationDocumentURL', valueFrom(mentor, 'qualificationDocumentURL'));
            setValue('field-experienceProofURL', valueFrom(mentor, 'experienceProofURL'));
            setValue('field-professionalCertificateURL', valueFrom(mentor, 'professionalCertificateURL'));
            setChecked('field-informationConfirmed', mentor.informationConfirmed === true);
            setChecked('field-mentorGuidelinesAccepted', mentor.mentorGuidelinesAccepted === true);
            setChecked('field-publicationConsent', mentor.publicationConsent === true);
            renderMentorProfileStatus(mentor);
        }
    }

    const mentorRequiredFields = [
        { key: 'photoURL', label: 'Profile Photo' },
        { key: 'fullName', label: 'Full Name' },
        { key: 'phone', label: 'Phone Number' },
        { key: 'district', label: 'District' },
        { key: 'city', label: 'City' },
        { key: 'preferredLanguages', label: 'Preferred Languages' },
        { key: 'mentorType', label: 'Mentor Type' },
        { key: 'field', label: 'Field / Expertise' },
        { key: 'currentPosition', label: 'Current Position' },
        { key: 'universityOrCompany', label: 'University / Company' },
        { key: 'highestQualification', label: 'Highest Qualification' },
        { key: 'studyArea', label: 'Study Area' },
        { key: 'yearsOfExperience', label: 'Years of Experience' },
        { key: 'guidanceAreas', label: 'Guidance Areas' },
        { key: 'studentLevelsSupported', label: 'Student Levels Supported' },
        { key: 'streamsSupported', label: 'Streams Supported' },
        { key: 'mentoringMode', label: 'Mentoring Mode' },
        { key: 'maxStudents', label: 'Maximum Students' },
        { key: 'bio', label: 'Short Biography' },
        { key: 'whyMentor', label: 'Why You Want to Mentor' },
        { key: 'qualificationDocumentURL', label: 'Qualification Document' },
        { key: 'informationConfirmed', label: 'Information Accuracy Confirmation' },
        { key: 'mentorGuidelinesAccepted', label: 'Mentoring Guidelines Agreement' },
        { key: 'publicationConsent', label: 'Publication Consent' }
    ];

    function valueFrom(source, ...keys) {
        for (const key of keys) {
            const value = source?.[key];
            if (Array.isArray(value) && value.length) return value;
            if (value !== undefined && value !== null && String(value).trim() !== '') return value;
        }
        return '';
    }

    function arrayFrom(value) {
        return normalizeList(value);
    }

    function setValue(id, value) {
        const el = document.getElementById(id);
        if (el) el.value = value || '';
    }

    function setChecked(id, checked) {
        const el = document.getElementById(id);
        if (el) el.checked = checked;
    }

    function getValue(id) {
        return document.getElementById(id)?.value.trim() || '';
    }

    function getProfileCheckedValues(group) {
        return [...document.querySelectorAll(`[data-profile-checkbox-group="${group}"] input:checked`)].map((input) => input.value);
    }

    function setProfileCheckedValues(group, values) {
        const selected = new Set(arrayFrom(values));
        document.querySelectorAll(`[data-profile-checkbox-group="${group}"] input`).forEach((input) => {
            input.checked = selected.has(input.value);
        });
    }

    function normalizeStatus(status) {
        return String(status || 'draft').trim().toLowerCase().replace(/\s+/g, '_');
    }

    function isApprovedMentor(profile = mergedMentorProfile) {
        return normalizeStatus(profile?.approvalStatus || profile?.status) === 'approved';
    }

    function collectMentorProfilePayload() {
        const payload = {
            uid: currentUser.uid,
            photoURL: getValue('field-photoURL'),
            fullName: getValue('field-fullName'),
            email: getValue('field-email') || currentUser.email || '',
            phone: normalizeSriLankanPhone(getValue('field-phone')) || getValue('field-phone'),
            district: getValue('field-mentorDistrict'),
            city: getValue('field-mentorCity'),
            preferredLanguages: normalizeList(getProfileCheckedValues('preferredLanguages')),
            mentorType: getValue('field-mentorType'),
            field: getValue('field-field'),
            expertise: getValue('field-field'),
            currentPosition: getValue('field-currentPosition'),
            currentRole: getValue('field-currentPosition'),
            universityOrCompany: getValue('field-universityOrCompany'),
            organization: getValue('field-universityOrCompany'),
            highestQualification: getValue('field-highestQualification'),
            qualification: getValue('field-highestQualification'),
            studyArea: getValue('field-studyArea'),
            yearsOfExperience: Number(getValue('field-yearsOfExperience') || 0),
            experience: Number(getValue('field-yearsOfExperience') || 0),
            professionalMembership: getValue('field-professionalMembership'),
            linkedInURL: getValue('field-linkedInURL'),
            portfolioURL: getValue('field-portfolioURL'),
            guidanceAreas: normalizeList(getProfileCheckedValues('guidanceAreas')),
            studentLevelsSupported: normalizeList(getProfileCheckedValues('studentLevelsSupported')),
            streamsSupported: normalizeList(getProfileCheckedValues('streamsSupported')),
            mentoringMode: getValue('field-mentoringMode'),
            maxStudents: Number(getValue('field-maxStudents') || 0),
            bio: getValue('field-bio'),
            shortBio: getValue('field-bio'),
            whyMentor: getValue('field-whyMentor'),
            studentExpectation: getValue('field-studentExpectation'),
            cvURL: getValue('field-cvURL'),
            qualificationDocumentURL: getValue('field-qualificationDocumentURL'),
            experienceProofURL: getValue('field-experienceProofURL'),
            professionalCertificateURL: getValue('field-professionalCertificateURL'),
            informationConfirmed: document.getElementById('field-informationConfirmed')?.checked === true,
            mentorGuidelinesAccepted: document.getElementById('field-mentorGuidelinesAccepted')?.checked === true,
            publicationConsent: document.getElementById('field-publicationConsent')?.checked === true
        };
        payload.profileCompletion = calculateMentorCompletion(payload).percentage;
        return payload;
    }

    function calculateMentorCompletion(profile = {}) {
        const missing = mentorRequiredFields.filter((field) => {
            const value = field.key === 'field' ? valueFrom(profile, 'field', 'mentoringField', 'expertise') : profile[field.key];
            return Array.isArray(value) ? value.length === 0 : value !== true && String(value || '').trim() === '';
        });
        return {
            percentage: Math.round(((mentorRequiredFields.length - missing.length) / mentorRequiredFields.length) * 100),
            missing
        };
    }

    function validateProfileDetailsBeforeSave() {
        const rules = [
            { id: 'field-fullName', validate: (value) => requiredText(value, 'Full name', { minLength: 2, maxLength: 100 }) },
            { id: 'field-phone', validate: (value) => validatePhone(value, 'Contact number', { optional: true }) }
        ];

        if (userRole === 'student') {
            rules.push(
                { id: 'field-futureGoal', validate: (value) => value ? requiredText(value, 'Future career goal', { minLength: 2, maxLength: 120 }) : '' },
                { id: 'field-skills', validate: (value) => value && value.length > 500 ? 'Skills must not exceed 500 characters.' : '' }
            );
        }

        if (userRole === 'mentor') {
            rules.push(
                { id: 'field-photoURL', validate: (value) => validateImageUrl(value, 'Profile photo URL', { optional: true }) },
                { id: 'field-mentorDistrict', validate: (value) => requiredText(value, 'District', { minLength: 2, maxLength: 80 }) },
                { id: 'field-mentorCity', validate: (value) => requiredText(value, 'City', { minLength: 2, maxLength: 80 }) },
                { id: 'field-field', validate: (value) => requiredText(value, 'Field / expertise', { minLength: 2, maxLength: 120 }) },
                { id: 'field-currentPosition', validate: (value) => requiredText(value, 'Current position', { minLength: 2, maxLength: 120 }) },
                { id: 'field-universityOrCompany', validate: (value) => requiredText(value, 'Affiliation', { minLength: 2, maxLength: 150 }) },
                { id: 'field-highestQualification', validate: (value) => requiredText(value, 'Highest qualification', { minLength: 2, maxLength: 150 }) },
                { id: 'field-yearsOfExperience', validate: (value) => validateNumberRange(value, 'Years of experience', { min: 0, max: 60, integer: true }) },
                { id: 'field-linkedInURL', validate: (value) => validatePublicUrl(value, 'LinkedIn URL', { optional: true }) },
                { id: 'field-portfolioURL', validate: (value) => validatePublicUrl(value, 'Portfolio URL', { optional: true }) },
                { id: 'field-maxStudents', validate: (value) => validateNumberRange(value, 'Maximum students', { min: 1, max: 100, integer: true }) },
                { id: 'field-bio', validate: (value) => requiredText(value, 'Short biography', { minLength: 30, maxLength: 1500 }) },
                { id: 'field-whyMentor', validate: (value) => requiredText(value, 'Why you want to mentor', { minLength: 20, maxLength: 1000 }) },
                { id: 'field-studentExpectation', validate: (value) => value ? requiredText(value, 'Student expectations', { minLength: 20, maxLength: 1000 }) : '' },
                { id: 'field-cvURL', validate: (value) => validateDocumentUrl(value, 'CV URL', { optional: true }) },
                { id: 'field-qualificationDocumentURL', validate: (value) => validateDocumentUrl(value, 'Qualification document URL', { optional: true }) },
                { id: 'field-experienceProofURL', validate: (value) => validateDocumentUrl(value, 'Experience proof URL', { optional: true }) },
                { id: 'field-professionalCertificateURL', validate: (value) => validateDocumentUrl(value, 'Professional certificate URL', { optional: true }) }
            );
        }

        return validateForm(rules);
    }

    function renderMentorProfileStatus(profile = mergedMentorProfile) {
        if (userRole !== 'mentor') return;
        const status = normalizeStatus(profile.approvalStatus || profile.applicationStatus || profile.status || 'draft');
        const banner = document.getElementById('mentor-profile-status-banner');
        const title = document.getElementById('mentor-profile-status-title');
        const message = document.getElementById('mentor-profile-status-message');
        const badge = document.getElementById('verification-status-badge');
        const submitBtn = document.getElementById('submit-mentor-profile-btn');
        const messages = {
            draft: ['Your mentor profile is incomplete.', 'Save your missing professional details as a draft, then submit for admin approval.'],
            incomplete: ['Your mentor profile is incomplete.', 'Complete the required details before submitting for review.'],
            submitted: ['Waiting for admin review.', 'Your profile has been submitted and is waiting for EduPath Lanka admin approval.'],
            under_review: ['Under admin review.', 'An administrator is currently reviewing your mentor application.'],
            changes_requested: ['Changes required.', profile.adminRequestedChanges || profile.adminReviewReason || 'Please update the requested information and resubmit.'],
            rejected: ['Application not approved.', profile.rejectionReason || 'You can update your profile and contact admin for the next steps.'],
            suspended: ['Mentoring account suspended.', 'Your mentoring account is currently suspended.'],
            approved: ['Your mentor profile is approved.', 'Your profile is visible to students and your mentoring functions remain active.']
        };
        const [statusTitle, statusMessage] = messages[status] || messages.draft;
        if (title) title.textContent = statusTitle;
        if (message) message.textContent = statusMessage;
        if (badge) {
            badge.textContent = status.replace(/_/g, ' ');
            badge.className = `badge badge-${status}`;
        }
        if (banner) {
            banner.className = `mentor-status-banner status-${status}`;
        }
        if (submitBtn) {
            submitBtn.classList.toggle('hidden', userRole !== 'mentor');
            submitBtn.innerHTML = status === 'changes_requested'
                ? '<i class="fas fa-paper-plane"></i> Resubmit for Review'
                : status === 'approved'
                    ? '<i class="fas fa-paper-plane"></i> Submit Updates'
                    : '<i class="fas fa-paper-plane"></i> Submit for Review';
        }
    }

    function renderAvailabilitySummary() {
        const target = document.getElementById('mentor-availability-summary');
        if (!target) return;
        const schedule = cachedAvailabilityData?.weeklySchedule || cachedAvailabilityData?.availability || {};
        const availableDays = Object.entries(schedule).filter(([, day]) => {
            if (Array.isArray(day)) return day.length;
            return day?.enabled || day?.available || (day?.timeRanges && day.timeRanges.length);
        });
        const duration = cachedAvailabilityData?.sessionDuration || cachedAvailabilityData?.duration || mergedMentorProfile?.sessionDuration || '60';
        const buffer = cachedAvailabilityData?.bufferMinutes || cachedAvailabilityData?.bufferTime || '15';
        const status = cachedAvailabilityData?.currentStatus || cachedAvailabilityData?.availabilityStatus || mergedMentorProfile?.availabilityStatus || 'Not configured';

        if (!availableDays.length) {
            target.innerHTML = `
                <div class="availability-empty">
                    <strong>No availability added yet.</strong>
                    <span>Use the existing Availability page to add the days and time slots students can book.</span>
                </div>
            `;
            return;
        }

        target.innerHTML = `
            <div class="availability-pill"><strong>${availableDays.length}</strong><span>Available days</span></div>
            <div class="availability-pill"><strong>${duration} min</strong><span>Session duration</span></div>
            <div class="availability-pill"><strong>${buffer} min</strong><span>Buffer time</span></div>
            <div class="availability-pill"><strong>${String(status).replace(/_/g, ' ')}</strong><span>Status</span></div>
            <div class="availability-days">
                ${availableDays.map(([day, value]) => `<span>${day}: ${formatAvailabilityDay(value)}</span>`).join('')}
            </div>
        `;
    }

    function formatAvailabilityDay(value) {
        if (Array.isArray(value)) return value.join(', ');
        const ranges = value?.timeRanges || value?.ranges || [];
        if (ranges.length) {
            return ranges.map((range) => `${range.start || range.startTime || ''} - ${range.end || range.endTime || ''}`.trim()).join(', ');
        }
        if (value?.startTime || value?.endTime) return `${value.startTime || ''} - ${value.endTime || ''}`.trim();
        return 'Available';
    }

    // --- Dynamic Profile Strength Calculation & Task List ---
    function calculateProfileStrength() {
        if (!cachedUserData) return;

        let completed = 0;
        let total = 0;
        let missing = [];
        let completedItems = [];

        const addFieldCheck = (key, label, value, completeLabel = label) => {
            total++;
            if (value && value.toString().trim() !== '') {
                completed++;
                completedItems.push({ key, label: completeLabel });
            } else {
                missing.push({ key, label });
            }
        };

        // Standard inputs checked for all roles
        addFieldCheck('fullName', 'Add Full Name', cachedUserData.fullName, 'Full Name');
        addFieldCheck('email', 'Verify Email', cachedUserData.email || currentUser.email, 'Email');
        addFieldCheck('phone', 'Add Contact Number', cachedUserData.phone, 'Phone');
        addFieldCheck('photoURL', 'Add Profile Photo', cachedUserData.photoURL, 'Profile Photo');

        if (userRole === 'student') {
            addFieldCheck('district', 'Select Home District', cachedRoleData.district);
            addFieldCheck('educationLevel', 'Select Level of Education', cachedRoleData.educationLevel);
            addFieldCheck('examStream', 'Select Exam Stream', cachedRoleData.examStream);
            addFieldCheck('resultStatus', 'Select Exam Result Status', cachedRoleData.resultStatus);
            addFieldCheck('interestArea', 'Select Primary Interest Area', cachedRoleData.interestArea);
            addFieldCheck('futureGoal', 'Add Future Career Goal', cachedRoleData.futureGoal);
            addFieldCheck('financialSupport', 'Specify Financial Support Preference', cachedRoleData.financialSupport);
            addFieldCheck('learningMode', 'Select Preferred Mode of Learning', cachedRoleData.learningMode);
            addFieldCheck('skills', 'Add Key Skills', cachedRoleData.skills);

        } else if (userRole === 'mentor') {
            const completion = calculateMentorCompletion(mergedMentorProfile || cachedRoleData);
            completed = mentorRequiredFields.length - completion.missing.length;
            total = mentorRequiredFields.length;
            missing = completion.missing.map((field) => ({ key: field.key, label: field.label }));
        }

        const percentage = Math.round((completed / total) * 100);

        // Update progress bar
        document.getElementById('profile-strength-value').textContent = `${percentage}%`;
        document.getElementById('profile-strength-fill').style.width = `${percentage}%`;

        // Update advice label
        const advice = document.getElementById('profile-strength-advice');
        if (percentage < 60) {
            advice.innerHTML = `⚠️ <strong>Complete your profile (at least 60%)</strong> to receive customized pathway matches, mentor notifications, and expert advice.`;
            advice.style.color = '#f59e0b';
        } else if (percentage < 90) {
            advice.innerHTML = `💪 <strong>Nice job!</strong> Add a few more details to optimize your profile recommendations.`;
            advice.style.color = '#0ea5e9';
        } else {
            advice.innerHTML = `🎉 <strong>Excellent!</strong> Your profile is complete and optimized for the EduPath system.`;
            advice.style.color = '#10b981';
        }

        // Render checklist tasks
        const taskListTitle = document.getElementById('profile-task-list-title');
        const missingList = document.getElementById('profile-missing-list');
        missingList.innerHTML = '';

        if (userRole === 'admin') {
            if (taskListTitle) taskListTitle.innerHTML = `<i class="fas fa-tasks"></i> Profile Details`;
            const completedMarkup = completedItems.map(item => `<li><i class="fas fa-check-circle text-success"></i> ${item.label}</li>`).join('');
            const missingMarkup = missing.map(item => `<li><i class="far fa-circle text-muted"></i> ${item.label.replace(/^Add |^Verify /, '')}</li>`).join('');
            missingList.innerHTML = `
                <li class="task-list-heading">Completed</li>
                ${completedMarkup || '<li><i class="far fa-circle text-muted"></i> None</li>'}
                <li class="task-list-heading">Missing</li>
                ${missingMarkup || '<li><i class="fas fa-check-circle text-success"></i> None</li>'}
            `;
        } else if (missing.length === 0) {
            if (taskListTitle) taskListTitle.innerHTML = `<i class="fas fa-tasks"></i> Remaining Tasks`;
            missingList.innerHTML = `<li><i class="fas fa-check-circle text-success"></i> All profile details filled!</li>`;
        } else {
            if (taskListTitle) taskListTitle.innerHTML = `<i class="fas fa-tasks"></i> Remaining Tasks`;
            missing.forEach(item => {
                const li = document.createElement('li');
                li.innerHTML = `<i class="far fa-circle text-muted"></i> ${item.label}`;
                missingList.appendChild(li);
            });
        }

        // Save percentage to Database in real-time if changed
        const dbPercentageNode = userRole === 'student' ? `students/${currentUser.uid}/profileCompletion` : userRole === 'mentor' ? `mentors/${currentUser.uid}/profileCompletion` : `users/${currentUser.uid}/profileCompletion`;
        if (cachedRoleData.profileCompletion !== percentage && cachedUserData.profileCompletion !== percentage) {
            const up = {};
            up[dbPercentageNode] = percentage;
            update(ref(database), up).catch(err => console.error("Error logging strength:", err));
        }
    }

    // --- Profile Details Save Form Handler ---
    profileDetailsForm?.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!currentUser) return;

        const validation = validateProfileDetailsBeforeSave();
        if (!validation.valid) {
            showToast("Please fix the highlighted profile fields.", "error");
            return;
        }

        const saveBtn = document.getElementById('save-profile-btn');
        const originalBtnText = saveBtn.textContent;
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
        saveBtn.disabled = true;

        const now = Date.now();
        const normalizedPhone = normalizeSriLankanPhone(document.getElementById('field-phone').value) || document.getElementById('field-phone').value.trim();
        const coreUpdates = {
            fullName: document.getElementById('field-fullName').value,
            phone: normalizedPhone,
            updatedAt: now
        };

        const batchUpdates = {};
        batchUpdates[`users/${currentUser.uid}/fullName`] = coreUpdates.fullName;
        batchUpdates[`users/${currentUser.uid}/phone`] = coreUpdates.phone;
        batchUpdates[`users/${currentUser.uid}/updatedAt`] = coreUpdates.updatedAt;

        if (userRole === 'student') {
            const recommendationFields = [
                'educationLevel',
                'examStream',
                'resultStatus',
                'interestArea',
                'futureGoal',
                'financialSupport',
                'learningMode',
                'skills',
                'district'
            ];
            const studentUpdates = {
                fullName: coreUpdates.fullName,
                phone: coreUpdates.phone,
                district: document.getElementById('field-district').value,
                educationLevel: document.getElementById('field-educationLevel').value,
                examStream: document.getElementById('field-examStream').value,
                resultStatus: document.getElementById('field-resultStatus').value,
                interestArea: document.getElementById('field-interestArea').value,
                futureGoal: document.getElementById('field-futureGoal').value,
                financialSupport: document.getElementById('field-financialSupport').value,
                learningMode: document.getElementById('field-learningMode').value,
                skills: normalizeList(document.getElementById('field-skills').value).join(', '),
                pathwayPreference: document.querySelector('input[name="field-pathwayPreference"]:checked')?.value || 'undecided',
                enjoyedActivities: document.getElementById('field-enjoyedActivities').value,
                workStyle: document.getElementById('field-workStyle').value,
                talentsList: document.getElementById('field-talentsList').value,
                talentOpportunities: [...document.querySelectorAll('input[name="field-talentOpportunities"]:checked')].map(cb => cb.value),
                updatedAt: now
            };
            const recommendationDataChanged = recommendationFields.some((field) => {
                return String(cachedRoleData?.[field] || '') !== String(studentUpdates[field] || '');
            });

            Object.keys(studentUpdates).forEach(key => {
                batchUpdates[`students/${currentUser.uid}/${key}`] = studentUpdates[key];
            });
            if (recommendationDataChanged) {
                batchUpdates[`students/${currentUser.uid}/recommendationsOutdated`] = true;
                batchUpdates[`students/${currentUser.uid}/profileUpdatedAt`] = serverTimestamp();
            }

        } else if (userRole === 'mentor') {
            Object.assign(batchUpdates, buildMentorProfileUpdates('draft'));
        }

        update(ref(database), batchUpdates)
            .then(() => {
                showToast("Profile details updated successfully!", "success");
                toggleEditingMode(false);
                if (userRole === 'mentor') {
                    loadMentorProfileData(currentUser.uid);
                }
            })
            .catch(err => {
                console.error("Save details error:", err);
                showToast("Failed to save changes. Please try again.", "error");
            })
            .finally(() => {
                saveBtn.textContent = originalBtnText;
                saveBtn.disabled = false;
            });
    });

    function buildMentorProfileUpdates(mode = 'draft') {
        const uid = currentUser.uid;
        const payload = collectMentorProfilePayload();
        const completion = calculateMentorCompletion(payload);
        const approved = isApprovedMentor(mergedMentorProfile);
        const submitting = mode === 'submit';
        const profileStatus = completion.missing.length ? 'incomplete' : 'completed';
        const approvalStatus = approved ? 'approved' : (submitting ? 'submitted' : normalizeStatus(mergedMentorProfile.approvalStatus || 'draft'));
        const applicationStatus = approved ? 'approved' : (submitting ? 'submitted' : normalizeStatus(mergedMentorProfile.applicationStatus || approvalStatus));
        const status = approved ? 'approved' : (submitting ? 'pending' : normalizeStatus(mergedMentorProfile.status || 'draft'));
        const mentorFields = { ...payload };
        delete mentorFields.cvURL;
        delete mentorFields.qualificationDocumentURL;
        delete mentorFields.experienceProofURL;
        delete mentorFields.professionalCertificateURL;

        const updates = {};
        updates[`users/${uid}/fullName`] = payload.fullName;
        updates[`users/${uid}/phone`] = payload.phone;
        updates[`users/${uid}/photoURL`] = payload.photoURL;
        updates[`users/${uid}/updatedAt`] = serverTimestamp();
        if (submitting && !approved) updates[`users/${uid}/mentorStatus`] = 'submitted';

        Object.entries({
            ...mentorFields,
            profileCompletion: payload.profileCompletion,
            profileStatus,
            approvalStatus,
            applicationStatus,
            status,
            publicVisibility: approved,
            mentoringEnabled: approved,
            profileUpdatePending: approved && submitting ? true : (mergedMentorProfile.profileUpdatePending || false),
            submittedAt: submitting ? (mergedMentorProfile.submittedAt || serverTimestamp()) : (mergedMentorProfile.submittedAt || null),
            resubmittedAt: submitting && mergedMentorProfile.submittedAt ? serverTimestamp() : (mergedMentorProfile.resubmittedAt || null),
            updatedAt: serverTimestamp()
        }).forEach(([key, value]) => {
            if (value !== undefined) updates[`mentors/${uid}/${key}`] = value;
        });

        Object.entries({
            mentorUid: uid,
            ...payload,
            profileCompletion: payload.profileCompletion,
            profileStatus,
            approvalStatus,
            applicationStatus,
            submittedAt: submitting ? (mergedMentorProfile.submittedAt || serverTimestamp()) : (mergedMentorProfile.submittedAt || null),
            resubmittedAt: submitting && mergedMentorProfile.submittedAt ? serverTimestamp() : (mergedMentorProfile.resubmittedAt || null),
            updatedAt: serverTimestamp()
        }).forEach(([key, value]) => {
            if (value !== undefined) updates[`mentorApplications/${uid}/${key}`] = value;
        });

        ['cvURL', 'qualificationDocumentURL', 'experienceProofURL', 'professionalCertificateURL'].forEach((key) => {
            updates[`mentorPrivate/${uid}/${key}`] = payload[key];
        });
        updates[`mentorPrivate/${uid}/mentorUid`] = uid;
        updates[`mentorPrivate/${uid}/updatedAt`] = serverTimestamp();

        return updates;
    }

    async function submitMentorProfileForReview() {
        if (!currentUser || userRole !== 'mentor') return;
        const payload = collectMentorProfilePayload();
        const completion = calculateMentorCompletion(payload);
        if (completion.missing.length) {
            renderMissingMentorFields(completion.missing);
            scrollToMissingMentorField(completion.missing[0].key);
            showToast("Complete all required mentor details before submitting.", "error");
            return;
        }

        const submitBtn = document.getElementById('submit-mentor-profile-btn');
        const originalText = submitBtn?.innerHTML;
        if (submitBtn) {
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
            submitBtn.disabled = true;
        }

        try {
            const uid = currentUser.uid;
            const notificationRef = push(ref(database, 'notifications/admin'));
            const updates = buildMentorProfileUpdates('submit');
            updates[`notifications/admin/${notificationRef.key}`] = {
                notificationId: notificationRef.key,
                targetUserUid: 'admin',
                targetRole: 'admin',
                senderUid: uid,
                senderRole: 'mentor',
                type: 'mentor_application_submitted',
                title: 'Mentor profile submitted',
                message: `${payload.fullName || 'A mentor'} submitted a completed mentor profile for review.`,
                relatedEntityType: 'mentorApplication',
                relatedEntityId: uid,
                mentorUid: uid,
                targetPage: 'admin-dashboard.html',
                targetSection: 'mentor-approvals',
                targetQuery: { mentorUid: uid },
                read: false,
                status: 'unread',
                createdAt: serverTimestamp()
            };
            await update(ref(database), updates);
            showToast(isApprovedMentor(mergedMentorProfile) ? "Your profile updates were saved for admin review." : "Your mentor profile has been submitted for admin review.", "success");
            toggleEditingMode(false);
            await loadMentorProfileData(uid);
        } catch (err) {
            console.error("Submit mentor profile error:", err);
            showToast("Failed to submit mentor profile. Please try again.", "error");
        } finally {
            if (submitBtn) {
                submitBtn.innerHTML = originalText;
                submitBtn.disabled = false;
            }
        }
    }

    function renderMissingMentorFields(missing = calculateMentorCompletion(collectMentorProfilePayload()).missing) {
        const missingList = document.getElementById('profile-missing-list');
        const title = document.getElementById('profile-task-list-title');
        if (title) title.innerHTML = `<i class="fas fa-tasks"></i> Missing Details`;
        if (missingList) {
            missingList.innerHTML = missing.map((field) => `<li><i class="far fa-circle text-muted"></i> ${field.label}</li>`).join('');
        }
    }

    function scrollToMissingMentorField(key) {
        const map = {
            district: 'field-mentorDistrict',
            city: 'field-mentorCity',
            preferredLanguages: 'preferredLanguages',
            guidanceAreas: 'guidanceAreas',
            studentLevelsSupported: 'studentLevelsSupported',
            streamsSupported: 'streamsSupported',
            informationConfirmed: 'field-informationConfirmed',
            mentorGuidelinesAccepted: 'field-mentorGuidelinesAccepted',
            publicationConsent: 'field-publicationConsent'
        };
        const id = map[key] || `field-${key}`;
        let target = document.getElementById(id) || document.querySelector(`[data-profile-checkbox-group="${id}"]`);
        if (target) {
            const panel = target.closest('[data-mentor-panel]');
            if (panel) {
                const tab = panel.dataset.mentorPanel;
                document.querySelector(`[data-mentor-tab="${tab}"]`)?.click();
            }
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    // --- Profile Picture Update Modal Form Submit ---
    avatarUpdateForm?.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!currentUser) return;

        const photoInput = document.getElementById('input-photoURL');
        const photoError = validateImageUrl(photoInput.value, 'Profile photo URL');
        showFieldError(photoInput, photoError);
        if (photoError) {
            showToast("Please enter a valid image URL.", "error");
            return;
        }

        const submitBtn = document.getElementById('submit-avatar-btn');
        const originalBtnText = submitBtn.textContent;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
        submitBtn.disabled = true;

        const newPhotoURL = document.getElementById('input-photoURL').value.trim();
        const now = Date.now();

        const batchUpdates = {};
        batchUpdates[`users/${currentUser.uid}/photoURL`] = newPhotoURL;
        batchUpdates[`users/${currentUser.uid}/updatedAt`] = now;

        if (userRole === 'student') {
            batchUpdates[`students/${currentUser.uid}/photoURL`] = newPhotoURL;
            batchUpdates[`students/${currentUser.uid}/updatedAt`] = now;
        } else if (userRole === 'mentor') {
            batchUpdates[`mentors/${currentUser.uid}/photoURL`] = newPhotoURL;
            batchUpdates[`mentors/${currentUser.uid}/updatedAt`] = now;
        }

        update(ref(database), batchUpdates)
            .then(() => {
                showToast("Profile photo updated successfully!", "success");
                closeAllModals();

                // Dispatch global event so the navbar dropdown avatar updates in real-time
                const changeEvent = new Event('authStateChanged');
                window.dispatchEvent(changeEvent);
            })
            .catch(err => {
                console.error("Save avatar error:", err);
                showToast("Failed to save profile photo.", "error");
            })
            .finally(() => {
                submitBtn.textContent = originalBtnText;
                submitBtn.disabled = false;
            });
    });

    // --- Change Password Form Submit ---
    changePwdForm?.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!currentUser) return;

        const newPwd = document.getElementById('settings-new-password').value;
        const confirmPwd = document.getElementById('settings-confirm-password').value;
        const errorEl = document.getElementById('password-match-error');

        clearFieldError('settings-new-password');
        clearFieldError('settings-confirm-password');
        if (newPwd.length < 8) {
            showFieldError('settings-new-password', 'Password must contain at least 8 characters.');
            showToast("Please fix the highlighted password field.", "error");
            return;
        }
        if (newPwd !== confirmPwd) {
            errorEl.classList.remove('hidden');
            showFieldError('settings-confirm-password', 'Passwords do not match.');
            return;
        }
        errorEl.classList.add('hidden');

        const saveBtn = document.getElementById('save-password-btn');
        const originalBtnText = saveBtn.textContent;
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
        saveBtn.disabled = true;

        updatePassword(currentUser, newPwd)
            .then(() => {
                showToast("Password updated successfully!", "success");
                closeAllModals();
            })
            .catch(err => {
                console.error("Password update error:", err);
                if (err.code === 'auth/requires-recent-login') {
                    showToast("For security, please logout and login again before changing your password.", "error");
                } else {
                    showToast(err.message || "Failed to change password.", "error");
                }
            })
            .finally(() => {
                saveBtn.textContent = originalBtnText;
                saveBtn.disabled = false;
            });
    });

    // Handle hash check on launch to auto-open password modal (e.g. if loaded via profile.html#security)
    if (window.location.hash === '#security') {
        setTimeout(() => {
            openPwdBtn?.click();
        }, 600);
    }
});
