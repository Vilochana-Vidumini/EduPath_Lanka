import { auth, database } from "./firebase-config.js";
import { onAuthStateChanged, updatePassword } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { ref, get, update, onValue } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
import { showToast } from "./auth-nav.js";

document.addEventListener('DOMContentLoaded', () => {
    let currentUser = null;
    let userRole = 'student';
    let cachedUserData = null;
    let cachedRoleData = null;

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
            userRole = (cachedUserData.userType || 'student').toLowerCase();
            
            // Set dynamic sidebar back-link URL
            const backLink = document.getElementById('dashboard-back-link');
            if (backLink) {
                backLink.href = `${userRole}-dashboard.html`;
            }

            // Bind role specifics
            if (userRole === 'student') {
                document.getElementById('student-specific-card').classList.remove('hidden');
                document.getElementById('mentor-specific-card').classList.add('hidden');
                
                // Fetch student details
                get(ref(database, 'students/' + uid)).then((roleSnap) => {
                    cachedRoleData = roleSnap.exists() ? roleSnap.val() : {};
                    populateFormData();
                    calculateProfileStrength();
                });

            } else if (userRole === 'mentor') {
                document.getElementById('student-specific-card').classList.add('hidden');
                document.getElementById('mentor-specific-card').classList.remove('hidden');

                // Fetch mentor details
                get(ref(database, 'mentors/' + uid)).then((roleSnap) => {
                    cachedRoleData = roleSnap.exists() ? roleSnap.val() : {};
                    populateFormData();
                    calculateProfileStrength();
                });

            } else { // Admin
                document.getElementById('student-specific-card').classList.add('hidden');
                document.getElementById('mentor-specific-card').classList.add('hidden');
                cachedRoleData = {};
                populateFormData();
                calculateProfileStrength();
            }
        });
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

        } else if (userRole === 'mentor' && cachedRoleData) {
            document.getElementById('field-mentorType').value = cachedRoleData.mentorType || '';
            document.getElementById('field-field').value = cachedRoleData.field || cachedRoleData.mentoringField || '';
            document.getElementById('field-universityOrCompany').value = cachedRoleData.universityOrCompany || cachedRoleData.organization || '';
            document.getElementById('field-experience').value = cachedRoleData.experience || '';
            document.getElementById('field-availableTime').value = cachedRoleData.availableTime || '';
            document.getElementById('field-availabilityStatus').value = cachedRoleData.availabilityStatus || 'active';
            document.getElementById('field-bio').value = cachedRoleData.bio || '';

            // Approval status node (read-only)
            const approvalStatus = (cachedRoleData.status || 'pending').toLowerCase();
            const badge = document.getElementById('verification-status-badge');
            if (badge) {
                badge.textContent = approvalStatus;
                badge.className = `badge badge-${approvalStatus}`;
            }
        }
    }

    // --- Dynamic Profile Strength Calculation & Task List ---
    function calculateProfileStrength() {
        if (!cachedUserData) return;

        let completed = 0;
        let total = 0;
        let missing = [];

        const addFieldCheck = (key, label, value) => {
            total++;
            if (value && value.toString().trim() !== '') {
                completed++;
            } else {
                missing.push({ key, label });
            }
        };

        // Standard inputs checked for all roles
        addFieldCheck('fullName', 'Add Full Name', cachedUserData.fullName);
        addFieldCheck('email', 'Verify Email', cachedUserData.email || currentUser.email);
        addFieldCheck('phone', 'Add Contact Number', cachedUserData.phone);
        addFieldCheck('photoURL', 'Add Profile Photo', cachedUserData.photoURL);

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
            addFieldCheck('mentorType', 'Select Mentor Category', cachedRoleData.mentorType);
            addFieldCheck('field', 'Add Field Expertise', cachedRoleData.field || cachedRoleData.mentoringField);
            addFieldCheck('universityOrCompany', 'Add University or Company Affiliation', cachedRoleData.universityOrCompany || cachedRoleData.organization);
            addFieldCheck('experience', 'Add Years of Experience', cachedRoleData.experience);
            addFieldCheck('availableTime', 'Specify Available Time Slots', cachedRoleData.availableTime);
            addFieldCheck('bio', 'Write a Short Professional Bio', cachedRoleData.bio);
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
        const missingList = document.getElementById('profile-missing-list');
        missingList.innerHTML = '';
        
        if (missing.length === 0) {
            missingList.innerHTML = `<li><i class="fas fa-check-circle text-success"></i> All profile details filled!</li>`;
        } else {
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

        const saveBtn = document.getElementById('save-profile-btn');
        const originalBtnText = saveBtn.textContent;
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
        saveBtn.disabled = true;

        const now = Date.now();
        const coreUpdates = {
            fullName: document.getElementById('field-fullName').value,
            phone: document.getElementById('field-phone').value,
            updatedAt: now
        };

        const batchUpdates = {};
        batchUpdates[`users/${currentUser.uid}/fullName`] = coreUpdates.fullName;
        batchUpdates[`users/${currentUser.uid}/phone`] = coreUpdates.phone;
        batchUpdates[`users/${currentUser.uid}/updatedAt`] = coreUpdates.updatedAt;

        if (userRole === 'student') {
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
                skills: document.getElementById('field-skills').value,
                updatedAt: now
            };

            Object.keys(studentUpdates).forEach(key => {
                batchUpdates[`students/${currentUser.uid}/${key}`] = studentUpdates[key];
            });

        } else if (userRole === 'mentor') {
            const mentorUpdates = {
                fullName: coreUpdates.fullName,
                phone: coreUpdates.phone,
                mentorType: document.getElementById('field-mentorType').value,
                field: document.getElementById('field-field').value,
                universityOrCompany: document.getElementById('field-universityOrCompany').value,
                experience: parseInt(document.getElementById('field-experience').value) || 0,
                availableTime: document.getElementById('field-availableTime').value,
                availabilityStatus: document.getElementById('field-availabilityStatus').value,
                bio: document.getElementById('field-bio').value,
                updatedAt: now
            };

            Object.keys(mentorUpdates).forEach(key => {
                batchUpdates[`mentors/${currentUser.uid}/${key}`] = mentorUpdates[key];
            });
        }

        update(ref(database), batchUpdates)
            .then(() => {
                showToast("Profile details updated successfully!", "success");
                toggleEditingMode(false);
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

    // --- Profile Picture Update Modal Form Submit ---
    avatarUpdateForm?.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!currentUser) return;

        const submitBtn = document.getElementById('submit-avatar-btn');
        const originalBtnText = submitBtn.textContent;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
        submitBtn.disabled = true;

        const newPhotoURL = document.getElementById('input-photoURL').value;
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

        if (newPwd !== confirmPwd) {
            errorEl.classList.remove('hidden');
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
