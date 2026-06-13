import { auth, database } from "./firebase-config.js";
import { signInWithEmailAndPassword, setPersistence, browserSessionPersistence } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { ref, get, update, push, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const emailInput = document.getElementById('email');
    const pwdInput = document.getElementById('password');
    const emailError = document.getElementById('email-error');
    const pwdError = document.getElementById('password-error');
    const alertMessage = document.getElementById('alert-message');
    const togglePwd = document.getElementById('toggle-pwd');

    if (togglePwd && pwdInput) {
        togglePwd.addEventListener('click', () => {
            const isHidden = pwdInput.type === 'password';
            pwdInput.type = isHidden ? 'text' : 'password';
            togglePwd.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');
            togglePwd.innerHTML = `<i class="fas ${isHidden ? 'fa-eye-slash' : 'fa-eye'}" aria-hidden="true"></i>`;
        });
    }

    const urlParams = new URLSearchParams(window.location.search);
    const redirectUrl = urlParams.get('redirect');
    const sessionExpired = urlParams.get('sessionExpired');

    if (sessionExpired === 'true') {
        showAlert('Session expired. Please login again.', 'warning');
    } else if (redirectUrl && redirectUrl.includes('pathway')) {
        showAlert('Please login or create an account to use the Pathway Finder.', 'info');
    } else if (redirectUrl) {
        showAlert('Please login or create an account to access this feature.', 'info');
    }

    if (!loginForm) return;

    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        clearErrors();

        const emailValue = emailInput.value.trim();
        const passwordValue = pwdInput.value;
        let isValid = true;

        if (!emailValue) {
            showFieldError(emailInput, emailError, 'Email address is required');
            isValid = false;
        } else if (!isValidEmail(emailValue)) {
            showFieldError(emailInput, emailError, 'Please enter a valid email address');
            isValid = false;
        }

        if (!passwordValue) {
            showFieldError(pwdInput, pwdError, 'Password is required');
            isValid = false;
        }

        if (!isValid) {
            showAlert('Please fix the errors above.', 'error');
            return;
        }

        const btn = loginForm.querySelector('button[type="submit"]');
        const originalBtnText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i><span>Logging in...</span>';
        btn.disabled = true;

        setPersistence(auth, browserSessionPersistence)
            .then(() => signInWithEmailAndPassword(auth, emailValue, passwordValue))
            .then((userCredential) => {
                const user = userCredential.user;
                return get(ref(database, 'users/' + user.uid)).then((snapshot) => {
                    if (!snapshot.exists()) {
                        throw new Error('User data not found in database.');
                    }
                    return finishLogin(user.uid, snapshot.val());
                });
            })
            .catch((error) => {
                console.error(error);
                btn.innerHTML = originalBtnText;
                btn.disabled = false;
                showAlert(getLoginErrorMessage(error), 'error');
            });
    });

    async function finishLogin(uid, userData) {
        localStorage.setItem('uid', uid);
        localStorage.setItem('email', userData.email || '');
        localStorage.setItem('fullName', userData.fullName || '');
        localStorage.setItem('userType', userData.userType || '');
        await recordLogin(uid, userData);

        showAlert('Login successful! Redirecting...', 'success');

        setTimeout(() => {
            const urlParams = new URLSearchParams(window.location.search);
            const redirectUrl = urlParams.get('redirect');

            if (redirectUrl) {
                window.location.href = redirectUrl;
                return;
            }

            const type = userData.userType ? userData.userType.toLowerCase() : '';
            if (type === 'student') window.location.href = 'student-dashboard.html';
            else if (type === 'mentor') window.location.href = 'mentor-dashboard.html';
            else if (type === 'institute') window.location.href = 'institute-dashboard.html';
            else if (type === 'admin') window.location.href = 'admin-dashboard.html';
            else showAlert('Unknown account role. Please contact EduPath support.', 'error');
        }, 1500);
    }

    async function recordLogin(uid, userData) {
        const recordRef = push(ref(database, `loginHistory/${uid}`));
        sessionStorage.setItem('edupathLoginRecordId', recordRef.key);
        const updates = {};
        updates[`users/${uid}/lastLoginAt`] = serverTimestamp();
        updates[`users/${uid}/lastActiveAt`] = serverTimestamp();
        updates[`users/${uid}/isOnline`] = true;
        updates[`presence/${uid}`] = { state: 'online', lastChanged: serverTimestamp() };
        updates[`loginHistory/${uid}/${recordRef.key}`] = {
            recordId: recordRef.key,
            loginAt: serverTimestamp(),
            sessionStatus: 'active',
            deviceType: /mobile|android|iphone/i.test(navigator.userAgent) ? 'mobile' : 'desktop',
            browserName: getBrowserName()
        };
        const logRef = push(ref(database, 'activityLogs'));
        updates[`activityLogs/${logRef.key}`] = {
            logId: logRef.key,
            uid,
            userName: userData.fullName || userData.email || 'User',
            userRole: userData.userType || 'user',
            actionType: 'login',
            description: `${userData.fullName || userData.email || 'User'} logged in`,
            relatedEntityType: 'user',
            relatedEntityId: uid,
            createdAt: serverTimestamp()
        };
        return update(ref(database), updates);
    }

    function clearErrors() {
        [emailInput, pwdInput].forEach((input) => input?.parentElement.classList.remove('error'));
        [emailError, pwdError].forEach((error) => {
            if (!error) return;
            error.classList.remove('visible');
            error.textContent = '';
        });
        if (alertMessage) {
            alertMessage.className = 'alert hidden';
            alertMessage.textContent = '';
        }
    }

    function showFieldError(input, errorElement, message) {
        input.parentElement.classList.add('error');
        errorElement.textContent = message;
        errorElement.classList.add('visible');
    }

    function showAlert(message, type) {
        if (!alertMessage) return;
        alertMessage.textContent = message;
        alertMessage.className = `alert alert-${type}`;
        alertMessage.classList.remove('hidden');
    }

    function getLoginErrorMessage(error) {
        if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password') {
            return 'Invalid email or password.';
        }
        if (error.code === 'auth/invalid-email') return 'Invalid email format.';
        if (error.code === 'auth/network-request-failed') return 'Network error. Please check your connection.';
        if (error.message === 'User data not found in database.') return 'Account data missing. Please contact support.';
        return 'An error occurred during login.';
    }

    function getBrowserName() {
        const ua = navigator.userAgent;
        if (ua.includes('Edg')) return 'Edge';
        if (ua.includes('Chrome')) return 'Chrome';
        if (ua.includes('Firefox')) return 'Firefox';
        if (ua.includes('Safari')) return 'Safari';
        return 'Browser';
    }

    function isValidEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }
});
