import { auth, database } from "./firebase-config.js";
import { createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { ref, set, push, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

const normalize = (value) => String(value || "").trim().toLowerCase();

document.addEventListener('DOMContentLoaded', () => {
    setupPasswordToggle('toggle-pwd', 'password');
    setupPasswordToggle('toggle-confirm-pwd', 'confirm-password');
    setupRoleCards();

    const signupForm = document.getElementById('signup-form');
    const alertMessage = document.getElementById('alert-message');
    const termsCheckbox = document.getElementById('terms');
    const termsError = document.getElementById('terms-error');

    if (!signupForm) return;

    signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearErrors();

        const role = normalize(value('usertype'));
        const fullName = value('fullname');
        const email = value('email');
        const phone = value('phone');
        const password = document.getElementById('password').value;
        const confirmPassword = document.getElementById('confirm-password').value;
        
        let isValid = true;
        
        if (!['student', 'mentor', 'institute'].includes(role)) { 
            showRoleError('Please choose Student, Mentor, or Institute'); 
            isValid = false; 
        }
        
        if (!fullName) { showError('fullname', 'Full name is required'); isValid = false; }
        if (!isValidEmail(email)) { showError('email', 'Please enter a valid email address'); isValid = false; }
        if (!isValidSriLankanPhone(phone)) { showError('phone', 'Use a valid Sri Lankan mobile number'); isValid = false; }
        if (!password || password.length < 8 || !/(?=.*[A-Za-z])(?=.*\d)/.test(password)) { showError('password', 'Use 8+ characters with a letter and number'); isValid = false; }
        if (password !== confirmPassword) { showError('confirm-password', 'Passwords do not match'); isValid = false; }
        
        if (termsCheckbox && !termsCheckbox.checked) {
            termsError.textContent = 'You must agree to the Terms & Conditions';
            termsError.classList.add('visible');
            isValid = false;
        }
        if (!isValid) {
            showAlert('Please fix the errors above.', 'error');
            return;
        }

        const btn = signupForm.querySelector('button[type="submit"]');
        const original = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i><span>Creating account...</span>';

        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const uid = userCredential.user.uid;
            const userData = {
                uid,
                fullName,
                email,
                phone,
                userType: role,
                accountStatus: role === 'institute' ? 'pending' : 'active',
                photoURL: '',
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            };

            if (role === 'mentor') {
                userData.mentorStatus = 'draft';
            }
            if (role === 'institute') {
                userData.role = 'institute';
                userData.accountType = 'institute';
                userData.approvalStatus = 'pending';
                userData.instituteOnboardingCompleted = false;
                userData.instituteId = '';
            }

            const writes = [set(ref(database, `users/${uid}`), userData)];
            if (role === 'student') {
                writes.push(set(ref(database, `students/${uid}`), {
                    uid,
                    fullName,
                    email,
                    phone,
                    userType: 'student',
                    photoURL: '',
                    district: '',
                    profileCompletion: 0,
                    pathwayCompleted: false,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp()
                }));
            } else if (role === 'mentor') {
                writes.push(set(ref(database, `mentors/${uid}`), {
                    uid,
                    fullName,
                    email,
                    phone,
                    userType: 'mentor',
                    photoURL: '',
                    profileStatus: 'incomplete',
                    approvalStatus: 'draft',
                    applicationStatus: 'draft',
                    publicVisibility: false,
                    mentoringEnabled: false,
                    status: 'draft',
                    accountStatus: 'active',
                    profileCompletion: 0,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp()
                }));
            } else {
                writes.push(set(ref(database, `instituteRepresentatives/${uid}`), {
                    uid,
                    representativeName: fullName,
                    representativeEmail: email,
                    representativePhone: phone,
                    roleInInstitute: '',
                    instituteId: '',
                    onboardingCompleted: false,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp()
                }));
            }

            const logRef = push(ref(database, 'activityLogs'));
            writes.push(set(logRef, {
                logId: logRef.key,
                uid,
                userName: userData.fullName,
                userRole: role,
                actionType: role === 'institute' ? 'institute_registered' : role === 'mentor' ? 'mentor_registered' : 'student_registered',
                description: `${userData.fullName} registered as ${role}`,
                relatedEntityType: role,
                relatedEntityId: uid,
                createdAt: serverTimestamp()
            }));

            await Promise.all(writes);
            localStorage.setItem('uid', uid);
            localStorage.setItem('email', email);
            localStorage.setItem('fullName', userData.fullName);
            localStorage.setItem('userType', role);
            showAlert('Account created successfully! Redirecting...', 'success');
            setTimeout(() => {
                window.location.href = role === 'institute' ? 'institute-onboarding.html' : role === 'mentor' ? 'mentor-dashboard.html?section=complete-profile' : 'student-dashboard.html';
            }, 1000);
        } catch (error) {
            console.error(error);
            btn.disabled = false;
            btn.innerHTML = original;
            showAlert(getSignupErrorMessage(error), 'error');
        }
    });

    function setupPasswordToggle(toggleId, inputId) {
        const toggle = document.getElementById(toggleId);
        const input = document.getElementById(inputId);
        if (!toggle || !input) return;
        toggle.addEventListener('click', () => {
            const isHidden = input.type === 'password';
            input.type = isHidden ? 'text' : 'password';
            toggle.setAttribute('aria-label', isHidden ? `Hide ${inputId}` : `Show ${inputId}`);
            toggle.innerHTML = `<i class="fas ${isHidden ? 'fa-eye-slash' : 'fa-eye'}" aria-hidden="true"></i>`;
        });
    }

    function setupRoleCards() {
        const roleInput = document.getElementById('usertype');
        const formBody = document.getElementById('form-body');
        const formInputs = document.querySelectorAll('.auth-input, .toggle-password, #terms, #submit-btn');
        const titleEl = document.getElementById('dynamic-form-title');
        const descEl = document.getElementById('dynamic-form-desc');
        const infoBanner = document.getElementById('dynamic-info-banner');
        const infoText = document.getElementById('dynamic-info-text');
        const fullnameLabel = document.getElementById('fullname-label');
        
        document.querySelectorAll('.role-card').forEach((card) => {
            card.addEventListener('click', () => selectRole(card));
            card.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    selectRole(card);
                }
            });
        });

        function selectRole(selectedCard) {
            roleInput.value = selectedCard.dataset.role;
            const role = roleInput.value;
            
            document.querySelectorAll('.role-card').forEach((card) => {
                const selected = card === selectedCard;
                card.classList.toggle('selected', selected);
                card.setAttribute('aria-checked', String(selected));
            });
            
            document.getElementById('usertype-error').classList.remove('visible');
            
            // Enable form interactions
            formBody.classList.remove('disabled-overlay');
            formInputs.forEach(input => input.disabled = false);
            
            // Update UI based on role
            if (role === 'student') {
                titleEl.textContent = 'Create Your Student Account';
                descEl.textContent = 'Fill in your details to start learning.';
                fullnameLabel.textContent = 'Full Name';
                infoBanner.classList.add('hidden');
            } else if (role === 'mentor') {
                titleEl.textContent = 'Create Your Mentor Account';
                descEl.textContent = 'Fill in your details to guide others.';
                fullnameLabel.textContent = 'Full Name';
                infoBanner.classList.add('hidden');
            } else if (role === 'institute') {
                titleEl.textContent = 'Create Your Institute Representative Account';
                descEl.textContent = 'Create an account as the authorized contact person.';
                fullnameLabel.textContent = 'Representative Full Name';
                infoText.textContent = 'Institute details will be added in the next step.';
                infoBanner.classList.remove('hidden');
            }
        }
    }

    function clearErrors() {
        document.querySelectorAll('.input-wrapper.error').forEach((el) => el.classList.remove('error'));
        document.querySelectorAll('.error-msg').forEach((el) => {
            el.classList.remove('visible');
            el.textContent = '';
        });
        showAlert('', '');
    }

    function showError(id, message) {
        const input = document.getElementById(id);
        const error = document.getElementById(`${id}-error`);
        input?.parentElement?.classList.add('error');
        if (error) {
            error.textContent = message;
            error.classList.add('visible');
        }
    }

    function showRoleError(message) {
        const error = document.getElementById('usertype-error');
        error.textContent = message;
        error.classList.add('visible');
    }

    function showAlert(message, type) {
        if (!alertMessage) return;
        alertMessage.textContent = message;
        alertMessage.className = message ? `alert alert-${type}` : 'alert hidden';
    }

    function value(id) {
        return document.getElementById(id)?.value.trim() || '';
    }

    function isValidEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    function isValidSriLankanPhone(phone) {
        return /^(0?7\d{8}|\+947\d{8})$/.test(phone.replace(/\s|-/g, ''));
    }

    function calculateInstituteCompletion(data) {
        return 25; // Dummy fallback since institute fields were moved to next step
    }

    function getSignupErrorMessage(error) {
        if (error.code === 'auth/email-already-in-use') return 'Email is already in use.';
        if (error.code === 'auth/weak-password') return 'Password is too weak.';
        if (error.code === 'auth/invalid-email') return 'Invalid email format.';
        if (error.code === 'auth/network-request-failed') return 'Network error. Please check your connection.';
        return error.message || 'An error occurred during signup.';
    }
});
