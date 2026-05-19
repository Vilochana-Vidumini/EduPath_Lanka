import { auth, database, googleProvider } from "./firebase-config.js";
import { signInWithEmailAndPassword, signInWithPopup, setPersistence, browserSessionPersistence } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { ref, get, set, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

document.addEventListener('DOMContentLoaded', () => {
    // --- Mobile Menu Toggle ---
    const hamburger = document.querySelector('.hamburger');
    const mobileMenu = document.querySelector('.mobile-menu');
    const closeBtn = document.querySelector('.close-btn');

    if (hamburger && mobileMenu && closeBtn) {
        hamburger.addEventListener('click', () => {
            mobileMenu.classList.add('active');
        });

        closeBtn.addEventListener('click', () => {
            mobileMenu.classList.remove('active');
        });
    }

    // --- Password Visibility Toggle ---
    const togglePwd = document.getElementById('toggle-pwd');
    const pwdInput = document.getElementById('password');

    if (togglePwd && pwdInput) {
        togglePwd.addEventListener('click', () => {
            const type = pwdInput.getAttribute('type') === 'password' ? 'text' : 'password';
            pwdInput.setAttribute('type', type);
            
            // Toggle icon
            if (type === 'text') {
                togglePwd.classList.remove('fa-eye');
                togglePwd.classList.add('fa-eye-slash');
            } else {
                togglePwd.classList.remove('fa-eye-slash');
                togglePwd.classList.add('fa-eye');
            }
        });
    }

    const loginForm = document.getElementById('login-form');
    const emailInput = document.getElementById('email');
    const emailError = document.getElementById('email-error');
    const pwdError = document.getElementById('password-error');
    const alertMessage = document.getElementById('alert-message');

    // Show redirect message if redirected from Pathway Finder or other restricted services
    const urlParams = new URLSearchParams(window.location.search);
    const redirectUrl = urlParams.get('redirect');
    const sessionExpired = urlParams.get('sessionExpired');

    if (sessionExpired === 'true') {
        alertMessage.textContent = 'Session expired. Please login again.';
        alertMessage.className = 'alert alert-warning';
        alertMessage.classList.remove('hidden');
        alertMessage.style.display = 'block';
        alertMessage.style.backgroundColor = 'rgba(245, 158, 11, 0.1)';
        alertMessage.style.color = '#d97706';
        alertMessage.style.border = '1px solid rgba(245, 158, 11, 0.2)';
        alertMessage.style.padding = '12px';
        alertMessage.style.borderRadius = '8px';
        alertMessage.style.marginBottom = '20px';
        alertMessage.style.fontSize = '14px';
        alertMessage.style.fontWeight = '500';
    } else if (redirectUrl && redirectUrl.includes('pathway')) {
        alertMessage.textContent = 'Please login or create an account to use the Pathway Finder.';
        alertMessage.className = 'alert alert-info';
        alertMessage.classList.remove('hidden');
        alertMessage.style.display = 'block';
        alertMessage.style.backgroundColor = 'rgba(37, 99, 235, 0.1)';
        alertMessage.style.color = '#2563eb';
        alertMessage.style.border = '1px solid rgba(37, 99, 235, 0.2)';
        alertMessage.style.padding = '12px';
        alertMessage.style.borderRadius = '8px';
        alertMessage.style.marginBottom = '20px';
        alertMessage.style.fontSize = '14px';
        alertMessage.style.fontWeight = '500';
    } else if (redirectUrl) {
        alertMessage.textContent = 'Please login or create an account to access this feature.';
        alertMessage.className = 'alert alert-info';
        alertMessage.classList.remove('hidden');
        alertMessage.style.display = 'block';
        alertMessage.style.backgroundColor = 'rgba(37, 99, 235, 0.1)';
        alertMessage.style.color = '#2563eb';
        alertMessage.style.border = '1px solid rgba(37, 99, 235, 0.2)';
        alertMessage.style.padding = '12px';
        alertMessage.style.borderRadius = '8px';
        alertMessage.style.marginBottom = '20px';
        alertMessage.style.fontSize = '14px';
        alertMessage.style.fontWeight = '500';
    }

    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            
            let isValid = true;
            
            // Reset errors
            emailInput.parentElement.classList.remove('error');
            emailError.classList.remove('visible');
            emailError.textContent = '';
            
            pwdInput.parentElement.classList.remove('error');
            pwdError.classList.remove('visible');
            pwdError.textContent = '';
            
            alertMessage.className = 'alert hidden';
            alertMessage.textContent = '';

            // Validate Email
            const emailValue = emailInput.value.trim();
            if (emailValue === '') {
                emailInput.parentElement.classList.add('error');
                emailError.textContent = 'Email address is required';
                emailError.classList.add('visible');
                isValid = false;
            } else if (!isValidEmail(emailValue)) {
                emailInput.parentElement.classList.add('error');
                emailError.textContent = 'Please enter a valid email address';
                emailError.classList.add('visible');
                isValid = false;
            }

            // Validate Password
            if (pwdInput.value === '') {
                pwdInput.parentElement.classList.add('error');
                pwdError.textContent = 'Password is required';
                pwdError.classList.add('visible');
                isValid = false;
            }

            // Submit / Show Success
            if (isValid) {
                const btn = loginForm.querySelector('button[type="submit"]');
                const originalBtnText = btn.innerHTML;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Logging in...';
                btn.disabled = true;

                setPersistence(auth, browserSessionPersistence)
                    .then(() => {
                        return signInWithEmailAndPassword(auth, emailValue, pwdInput.value);
                    })
                    .then((userCredential) => {
                        const user = userCredential.user;
                        
                        // Fetch user data from DB to determine userType
                        return get(ref(database, 'users/' + user.uid))
                            .then((snapshot) => {
                                if (snapshot.exists()) {
                                    finishLogin(user.uid, snapshot.val());
                                } else {
                                    throw new Error("User data not found in database.");
                                }
                            });
                    })
                    .catch((error) => {
                        console.error(error);
                        btn.innerHTML = originalBtnText;
                        btn.disabled = false;
                        
                        let msg = "An error occurred during login.";
                        if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password') {
                            msg = "Invalid email or password.";
                        } else if (error.code === 'auth/invalid-email') {
                            msg = "Invalid email format.";
                        } else if (error.code === 'auth/network-request-failed') {
                            msg = "Network error. Please check your connection.";
                        } else if (error.message === "User data not found in database.") {
                            msg = "Account data missing. Please contact support.";
                        }
                        
                        alertMessage.textContent = msg;
                        alertMessage.className = 'alert alert-error';
                        alertMessage.classList.remove('hidden');
                    });
            } else {
                alertMessage.textContent = 'Please fix the errors above.';
                alertMessage.className = 'alert alert-error';
                alertMessage.classList.remove('hidden');
            }
        });
    }

    // --- Google Login ---
    const googleBtn = document.querySelector('.btn-google');
    if (googleBtn) {
        googleBtn.addEventListener('click', () => {
            const originalBtnText = googleBtn.innerHTML;
            googleBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Connecting...';
            googleBtn.disabled = true;

            setPersistence(auth, browserSessionPersistence)
                .then(() => {
                    return signInWithPopup(auth, googleProvider);
                })
                .then((result) => {
                    const user = result.user;
                    // Check if user exists in DB
                    return get(ref(database, 'users/' + user.uid)).then((snapshot) => {
                        if (snapshot.exists()) {
                            // User exists, proceed to login
                            finishLogin(user.uid, snapshot.val());
                        } else {
                            // New user, create student profile
                            const newUserData = {
                                fullName: user.displayName || 'Student',
                                email: user.email,
                                userType: 'student',
                                createdAt: serverTimestamp()
                            };
                            return set(ref(database, 'users/' + user.uid), newUserData).then(() => {
                                finishLogin(user.uid, newUserData);
                            });
                        }
                    });
                })
                .catch((error) => {
                    console.error(error);
                    googleBtn.innerHTML = originalBtnText;
                    googleBtn.disabled = false;
                    
                    if (error.code !== 'auth/popup-closed-by-user') {
                        alertMessage.textContent = "Google Sign-In failed: " + error.message;
                        alertMessage.className = 'alert alert-error';
                        alertMessage.classList.remove('hidden');
                    }
                });
        });
    }

    function finishLogin(uid, userData) {
        localStorage.setItem('uid', uid);
        localStorage.setItem('email', userData.email);
        localStorage.setItem('fullName', userData.fullName);
        localStorage.setItem('userType', userData.userType);
        
        alertMessage.textContent = 'Login successful! Redirecting...';
        alertMessage.className = 'alert alert-success';
        alertMessage.classList.remove('hidden');
        
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
            else if (type === 'admin') window.location.href = 'admin-dashboard.html';
            else window.location.href = 'index.html';
        }, 1500);
    }

    function isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }
});
