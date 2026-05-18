import { auth, database } from "./firebase-config.js";
import { createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { ref, set, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

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

    // --- Password Visibility Toggles ---
    function setupPasswordToggle(toggleId, inputId) {
        const toggle = document.getElementById(toggleId);
        const input = document.getElementById(inputId);

        if (toggle && input) {
            toggle.addEventListener('click', () => {
                const type = input.getAttribute('type') === 'password' ? 'text' : 'password';
                input.setAttribute('type', type);
                
                // Toggle icon
                if (type === 'text') {
                    toggle.classList.remove('fa-eye');
                    toggle.classList.add('fa-eye-slash');
                } else {
                    toggle.classList.remove('fa-eye-slash');
                    toggle.classList.add('fa-eye');
                }
            });
        }
    }

    setupPasswordToggle('toggle-pwd', 'password');
    setupPasswordToggle('toggle-confirm-pwd', 'confirm-password');

    // --- Form Validation ---
    const signupForm = document.getElementById('signup-form');
    const fields = ['fullname', 'usertype', 'email', 'phone', 'password', 'confirm-password'];
    
    const alertMessage = document.getElementById('alert-message');
    const termsCheckbox = document.getElementById('terms');
    const termsError = document.getElementById('terms-error');

    if (signupForm) {
        signupForm.addEventListener('submit', (e) => {
            e.preventDefault();
            
            let isValid = true;
            
            // Reset errors
            fields.forEach(field => {
                const input = document.getElementById(field);
                const errorSpan = document.getElementById(`${field}-error`);
                if(input && errorSpan) {
                    input.parentElement.classList.remove('error');
                    errorSpan.classList.remove('visible');
                    errorSpan.textContent = '';
                }
            });
            
            if(termsError) {
                termsError.classList.remove('visible');
                termsError.textContent = '';
            }
            
            if(alertMessage) {
                alertMessage.className = 'alert hidden';
                alertMessage.textContent = '';
            }

            // Validation Rules
            const fullname = document.getElementById('fullname');
            if (fullname && fullname.value.trim() === '') {
                showError(fullname, 'Full name is required');
                isValid = false;
            }

            const usertype = document.getElementById('usertype');
            if (usertype && usertype.value === '') {
                showError(usertype, 'Please select a user type');
                isValid = false;
            }

            const email = document.getElementById('email');
            if (email && email.value.trim() === '') {
                showError(email, 'Email address is required');
                isValid = false;
            } else if (email && !isValidEmail(email.value.trim())) {
                showError(email, 'Please enter a valid email address');
                isValid = false;
            }

            const phone = document.getElementById('phone');
            if (phone && phone.value.trim() === '') {
                showError(phone, 'Phone number is required');
                isValid = false;
            }

            const password = document.getElementById('password');
            if (password && password.value === '') {
                showError(password, 'Password is required');
                isValid = false;
            } else if (password && password.value.length < 8) {
                showError(password, 'Password must be at least 8 characters');
                isValid = false;
            }

            const confirmPassword = document.getElementById('confirm-password');
            if (confirmPassword && confirmPassword.value === '') {
                showError(confirmPassword, 'Please confirm your password');
                isValid = false;
            } else if (confirmPassword && password && password.value !== confirmPassword.value) {
                showError(confirmPassword, 'Passwords do not match');
                isValid = false;
            }

            if (termsCheckbox && !termsCheckbox.checked) {
                termsError.textContent = 'You must agree to the Terms & Conditions';
                termsError.classList.add('visible');
                isValid = false;
            }

            // Submit / Show Success
            if (isValid) {
                const btn = signupForm.querySelector('button[type="submit"]');
                const originalBtnText = btn.innerHTML;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating Account...';
                btn.disabled = true;

                createUserWithEmailAndPassword(auth, email.value.trim(), password.value)
                    .then((userCredential) => {
                        const user = userCredential.user;
                        const uid = user.uid;

                        // Base user data
                        const userData = {
                            uid: uid,
                            fullName: fullname.value.trim(),
                            email: email.value.trim(),
                            phone: phone.value.trim(),
                            userType: usertype.value,
                            createdAt: serverTimestamp(),
                            updatedAt: serverTimestamp()
                        };

                        // Realtime DB Promises
                        const promises = [];

                        // 1. Save to users node
                        promises.push(set(ref(database, 'users/' + uid), userData));

                        // 2. Save to specific type node
                        if (usertype.value === 'student') {
                            const studentData = {
                                uid: uid,
                                fullName: fullname.value.trim(),
                                email: email.value.trim(),
                                createdAt: serverTimestamp(),
                                updatedAt: serverTimestamp()
                            };
                            promises.push(set(ref(database, 'students/' + uid), studentData));
                        } else if (usertype.value === 'mentor') {
                            const mentorData = {
                                uid: uid,
                                fullName: fullname.value.trim(),
                                email: email.value.trim(),
                                phone: phone.value.trim(),
                                status: "pending",
                                createdAt: serverTimestamp(),
                                updatedAt: serverTimestamp()
                            };
                            promises.push(set(ref(database, 'mentors/' + uid), mentorData));
                        }

                        // Add a timeout to catch database connection issues
                        const timeoutPromise = new Promise((_, reject) => 
                            setTimeout(() => reject(new Error("Database connection timed out. Please check your Realtime Database URL and ensure it is created.")), 8000)
                        );

                        return Promise.race([Promise.all(promises), timeoutPromise])
                            .then(() => userData);
                    })
                    .then((userData) => {
                        alertMessage.textContent = 'Account created successfully! Redirecting...';
                        alertMessage.className = 'alert alert-success';
                        alertMessage.classList.remove('hidden');
                        
                        // Store session data
                        localStorage.setItem('uid', userData.uid);
                        localStorage.setItem('email', userData.email);
                        localStorage.setItem('fullName', userData.fullName);
                        localStorage.setItem('userType', userData.userType);

                        setTimeout(() => {
                            const type = userData.userType.toLowerCase();
                            if (type === 'student') {
                                window.location.href = 'student-dashboard.html';
                            } else if (type === 'mentor') {
                                window.location.href = 'mentor-dashboard.html';
                            } else if (type === 'admin') {
                                window.location.href = 'admin-dashboard.html';
                            } else {
                                window.location.href = 'index.html';
                            }
                        }, 1500);
                    })
                    .catch((error) => {
                        console.error(error);
                        btn.innerHTML = originalBtnText;
                        btn.disabled = false;
                        
                        let msg = error.message || "An error occurred during signup.";
                        if (error.code === 'auth/email-already-in-use') {
                            msg = "Email is already in use.";
                        } else if (error.code === 'auth/weak-password') {
                            msg = "Password is too weak.";
                        } else if (error.code === 'auth/invalid-email') {
                            msg = "Invalid email format.";
                        } else if (error.code === 'auth/network-request-failed') {
                            msg = "Network error. Please check your connection.";
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

    function showError(inputElement, message) {
        const errorSpan = document.getElementById(`${inputElement.id}-error`);
        if(inputElement && errorSpan) {
            inputElement.parentElement.classList.add('error');
            errorSpan.textContent = message;
            errorSpan.classList.add('visible');
        }
    }

    function isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }
});
