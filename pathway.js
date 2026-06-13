import { auth, database } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { ref, push, set, update, serverTimestamp, get } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
import { showToast } from "./auth-nav.js?v=20260614-brand";

document.addEventListener('DOMContentLoaded', () => {
    let currentUser = null;
    const pathwayMode = new URLSearchParams(window.location.search).get('mode') || 'first-time';

    onAuthStateChanged(auth, (user) => {
        if (user) {
            currentUser = user;
            // Verify role - only students and admins are allowed here
            get(ref(database, 'users/' + user.uid)).then((snapshot) => {
                if (snapshot.exists()) {
                    const type = snapshot.val().userType.toLowerCase();
                    if (type !== 'student' && type !== 'admin') {
                        showToast("Access denied. The Pathway Finder is only available for students.", "error");
                        window.location.href = 'student-dashboard.html';
                        return;
                    }
                    prefillPathwayForm(user.uid, snapshot.val());
                }
            });
        } else {
            currentUser = null;
            window.location.href = 'login.html?redirect=pathway.html';
        }
    });
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

    async function prefillPathwayForm(uid, userData = {}) {
        const studentSnap = await get(ref(database, `students/${uid}`));
        const studentData = studentSnap.exists() ? studentSnap.val() : {};
        const latestResult = await getCurrentPathwayResult(uid, studentData.currentPathwayResultId);
        const source = pathwayMode === 'update' ? { ...studentData, ...latestResult } : studentData;

        setFieldValue('fullname', userData.fullName || studentData.fullName || latestResult.studentName || '');
        setFieldValue('email', userData.email || studentData.email || latestResult.email || currentUser?.email || '');
        setFieldValue('district', source.district || '');
        setFieldValue('education-level', source.educationLevel || '');
        setFieldValue('exam-stream', source.examStream || '');
        setFieldValue('result-status', source.resultStatus || '');
        setFieldValue('interest-area', source.interestArea || '');
        setFieldValue('future-goal', source.futureGoal || '');
        setFieldValue('financial', source.financialSupport || '');
        setFieldValue('learning-mode', source.learningMode || '');

        const skills = Array.isArray(source.skills) ? source.skills : String(source.skills || '').split(',').map(skill => skill.trim());
        document.querySelectorAll('.skill-cb').forEach((checkbox) => {
            checkbox.checked = skills.includes(checkbox.value);
        });
    }

    async function getCurrentPathwayResult(uid, currentResultId) {
        const resultsSnap = await get(ref(database, `pathwayResults/${uid}`));
        if (!resultsSnap.exists()) return {};
        const results = resultsSnap.val();
        if (currentResultId && results[currentResultId]) return results[currentResultId];
        return Object.entries(results)
            .sort(([keyA, a], [keyB, b]) => getResultTime(b.createdAt, keyB) - getResultTime(a.createdAt, keyA))
            .map(([, result]) => result)[0] || {};
    }

    function setFieldValue(id, value) {
        const field = document.getElementById(id);
        if (field && value !== undefined && value !== null) field.value = value;
    }

    function getResultTime(value, fallbackKey = '') {
        if (typeof value === 'number') return value;
        const parsed = Date.parse(value || '');
        if (!Number.isNaN(parsed)) return parsed;
        return fallbackKey ? fallbackKey.split('').reduce((total, char) => total + char.charCodeAt(0), 0) : 0;
    }

    // --- Scroll Reveal Animation ---
    const scrollRevealElements = document.querySelectorAll('.scroll-reveal');
    const revealOnScroll = () => {
        const windowHeight = window.innerHeight;
        const revealPoint = 100;
        scrollRevealElements.forEach((el) => {
            const revealTop = el.getBoundingClientRect().top;
            if (revealTop < windowHeight - revealPoint) {
                el.classList.add('active');
            }
        });
    };
    revealOnScroll();
    window.addEventListener('scroll', revealOnScroll);

    // --- FAQ Accordion ---
    const faqQuestions = document.querySelectorAll('.faq-question');
    faqQuestions.forEach(question => {
        question.addEventListener('click', () => {
            const answer = question.nextElementSibling;
            const isOpen = question.classList.contains('active');
            
            // Close all other
            faqQuestions.forEach(q => {
                q.classList.remove('active');
                q.nextElementSibling.style.maxHeight = null;
            });

            if (!isOpen) {
                question.classList.add('active');
                answer.style.maxHeight = answer.scrollHeight + "px";
            }
        });
    });

    // --- Pathway Recommendation Logic ---
    const pathwayForm = document.getElementById('pathwayForm');
    const resetBtn = document.getElementById('resetFormBtn');
    const resultsSection = document.getElementById('results-section');
    
    // Required Fields
    const reqFields = ['fullname', 'email', 'district', 'education-level', 'interest-area', 'future-goal', 'financial', 'learning-mode'];

    // Data for recommendations
    const recommendationsData = {
        'Information Technology': {
            courses: ['ICT Diploma', 'Software Engineering Foundation', 'Web Development Course', 'Computer Networking', 'UI/UX Design Basics'],
            skills: ['English', 'Computer Skills', 'Problem Solving'],
            careers: ['Software Developer', 'IT Support', 'Web Designer', 'QA Tester']
        },
        'Business & Management': {
            courses: ['Business Management Diploma', 'Accounting Foundation', 'Marketing Certificate', 'Entrepreneurship Training'],
            skills: ['Communication', 'Leadership', 'Business Skills'],
            careers: ['Business Assistant', 'Marketing Executive', 'Entrepreneur', 'HR Assistant']
        },
        'Design & Creative Media': {
            courses: ['Graphic Design Course', 'Video Editing Course', 'UI/UX Design', 'Digital Marketing'],
            skills: ['Creativity', 'Computer Skills', 'Communication'],
            careers: ['Graphic Designer', 'Content Creator', 'UI Designer', 'Freelancer']
        },
        'Automobile & Technical': {
            courses: ['NVQ Technical Training', 'Automobile Technology', 'Electrical Technician Course', 'Mechanical Training'],
            skills: ['Technical Skills', 'Problem Solving', 'Teamwork'],
            careers: ['Technician', 'Auto Electrician', 'Workshop Assistant', 'Maintenance Assistant']
        },
        'Health & Care': {
            courses: ['Nursing Assistant Course', 'Caregiver Training', 'Pharmacy Assistant Course', 'First Aid Certification'],
            skills: ['Communication', 'Teamwork', 'English'],
            careers: ['Caregiver', 'Healthcare Assistant', 'Pharmacy Assistant']
        },
        'Tourism & Hospitality': {
            courses: ['Hotel Management Course', 'Tourism Diploma', 'Cookery Course', 'Customer Service Training'],
            skills: ['English', 'Communication', 'Teamwork'],
            careers: ['Hotel Staff', 'Tour Guide', 'Front Office Assistant', 'Chef Assistant']
        },
        'Engineering': {
            courses: ['Engineering Foundation Course', 'Technical Diploma', 'AutoCAD Training', 'Electronics Course'],
            skills: ['Technical Skills', 'Problem Solving', 'Computer Skills'],
            careers: ['Technical Assistant', 'CAD Assistant', 'Junior Technician']
        }
    };

    // --- Multi-step Wizard Navigation Logic ---
    const steps = document.querySelectorAll('.form-step');
    const stepDots = document.querySelectorAll('.step-dot');
    const progressFill = document.getElementById('progress-line');
    let currentStep = 1;

    const stepFields = {
        1: ['fullname', 'email', 'district'],
        2: ['education-level'],
        3: ['interest-area'],
        4: ['future-goal', 'financial', 'learning-mode']
    };

    function validateStep(stepNum) {
        let isStepValid = true;
        const fields = stepFields[stepNum];
        
        fields.forEach(id => {
            const el = document.getElementById(id);
            const err = document.getElementById(`${id}-error`);
            if (!el) return;

            if (el.value.trim() === '') {
                el.parentElement.classList.add('error');
                err.textContent = 'This field is required';
                err.classList.add('visible');
                isStepValid = false;
            } else if (id === 'email' && !isValidEmail(el.value.trim())) {
                el.parentElement.classList.add('error');
                err.textContent = 'Invalid email address';
                err.classList.add('visible');
                isStepValid = false;
            } else {
                el.parentElement.classList.remove('error');
                err.classList.remove('visible');
            }
        });
        return isStepValid;
    }

    function updateStepIndicator() {
        if (!steps.length) return;
        const percent = ((currentStep - 1) / (steps.length - 1)) * 100;
        if (progressFill) {
            progressFill.style.width = `${percent}%`;
        }

        stepDots.forEach(dot => {
            const dotStep = parseInt(dot.getAttribute('data-step'));
            dot.classList.remove('active', 'completed');
            if (dotStep === currentStep) {
                dot.classList.add('active');
            } else if (dotStep < currentStep) {
                dot.classList.add('completed');
            }
        });
    }

    function goToStep(stepNum) {
        steps.forEach(step => {
            step.classList.remove('active');
            if (parseInt(step.getAttribute('data-step')) === stepNum) {
                step.classList.add('active');
            }
        });
        currentStep = stepNum;
        updateStepIndicator();
        
        // Scroll to form card to focus
        const formCard = document.querySelector('.form-card');
        if (formCard) {
            formCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    // Attach click listeners to Next buttons
    const nextBtns = document.querySelectorAll('.next-step-btn');
    nextBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            if (validateStep(currentStep)) {
                const nextVal = parseInt(btn.getAttribute('data-next'));
                goToStep(nextVal);
            }
        });
    });

    // Attach click listeners to Prev buttons
    const prevBtns = document.querySelectorAll('.prev-step-btn');
    prevBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const prevVal = parseInt(btn.getAttribute('data-prev'));
            goToStep(prevVal);
        });
    });

    if (pathwayForm) {
        pathwayForm.addEventListener('submit', (e) => {
            e.preventDefault();
            if (validateStep(4)) {
                generateResults();
            }
        });

        // Clear errors on input
        reqFields.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', () => {
                    el.parentElement.classList.remove('error');
                    const err = document.getElementById(`${id}-error`);
                    if (err) err.classList.remove('visible');
                });
            }
        });

        resetBtn.addEventListener('click', () => {
            pathwayForm.reset();
            resultsSection.classList.add('hidden');
            reqFields.forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    el.parentElement.classList.remove('error');
                    const err = document.getElementById(`${id}-error`);
                    if (err) err.classList.remove('visible');
                }
            });
            goToStep(1);
        });
    }

    function isValidEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    function generateResults() {
        const name = document.getElementById('fullname').value;
        const interest = document.getElementById('interest-area').value;
        const resultStatus = document.getElementById('result-status').value;
        const eduLevel = document.getElementById('education-level').value;
        const financial = document.getElementById('financial').value;
        const goal = document.getElementById('future-goal').value;

        // Populate Header
        document.getElementById('res-name').textContent = name;
        document.getElementById('res-interest').textContent = interest;

        // Dynamic Alerts Logic
        const alertsContainer = document.getElementById('dynamic-alerts');
        alertsContainer.innerHTML = ''; // Clear previous

        if (eduLevel.includes('Failed') || eduLevel === 'Dropout' || resultStatus === 'Not Qualified for University') {
            addAlert(alertsContainer, 'alert-info', 'fa-info-circle', 'Your result does not define your future. You still have many practical pathways through diplomas, vocational training, professional courses, online learning, entrepreneurship, and skill development.');
        }
        
        if (resultStatus === 'Qualified for University') {
            addAlert(alertsContainer, 'alert-success', 'fa-check-circle', 'Since you are qualified for university, compare degree programs carefully and choose based on career outcomes, personal interest, and job market demand.');
        }

        if (financial === 'Need Scholarship' || financial === 'Need Free or Low-Cost Options') {
            addAlert(alertsContainer, 'alert-warning', 'fa-hand-holding-usd', 'Financial Guidance: Search government courses, check free online courses, explore NGO scholarship support, apply for financial aid, and choose low-cost vocational training options.');
        }

        if (goal === 'Not Sure Yet') {
            addAlert(alertsContainer, 'alert-info', 'fa-compass', 'Start with skill discovery, mentor support, and short foundation courses before choosing a long-term pathway.');
        }

        // Populate Recommendation Tags
        const data = recommendationsData[interest] || recommendationsData['Information Technology']; // fallback if "Other"

        populateTags('rec-courses', data.courses, 'tag');
        populateTags('rec-skills', data.skills, 'tag skill');
        populateTags('rec-careers', data.careers, 'tag career');

        // Show Results and Scroll
        resultsSection.classList.remove('hidden');
        
        // Animate Circle
        const score = 85;
        setTimeout(() => {
            const circle = document.getElementById('score-circle');
            circle.setAttribute('stroke-dasharray', `${score}, 100`); 
            document.getElementById('score-text').textContent = `${score}%`;
        }, 500);

        // Firebase Save Logic
        if (currentUser) {
            const uid = currentUser.uid;
            
            // Collect selected skills
            const selectedSkills = Array.from(document.querySelectorAll('.skill-cb:checked')).map(cb => cb.value);

            const pathwayData = {
                uid: uid,
                studentName: name,
                email: document.getElementById('email').value,
                district: document.getElementById('district').value,
                educationLevel: eduLevel,
                examStream: document.getElementById('exam-stream').value || "Not Selected",
                resultStatus: resultStatus || "Not Selected",
                interestArea: interest,
                skills: selectedSkills,
                futureGoal: goal,
                financialSupport: financial,
                learningMode: document.getElementById('learning-mode').value,
                recommendedCourses: data.courses,
                recommendedSkills: data.skills,
                careerPaths: data.careers,
                pathwayScore: score,
                createdAt: serverTimestamp()
            };

            // Push to pathwayResults/{uid} and keep every result for history.
            const newResultRef = push(ref(database, `pathwayResults/${uid}`));
            set(newResultRef, {
                ...pathwayData,
                resultId: newResultRef.key,
                mode: pathwayMode,
                updatedAt: serverTimestamp()
            })
                .then(() => {
                    addAlert(alertsContainer, 'alert-success', 'fa-save', 'Your pathway result has been securely saved to your account!');
                    return update(ref(database, `students/${uid}`), {
                        fullName: name,
                        email: document.getElementById('email').value,
                        district: document.getElementById('district').value,
                        educationLevel: eduLevel,
                        examStream: document.getElementById('exam-stream').value || "Not Selected",
                        resultStatus: resultStatus || "Not Selected",
                        interestArea: interest,
                        skills: selectedSkills,
                        futureGoal: goal,
                        financialSupport: financial,
                        learningMode: document.getElementById('learning-mode').value,
                        currentPathwayResultId: newResultRef.key,
                        pathwayCompleted: true,
                        onboardingCompleted: true,
                        recommendationsOutdated: false,
                        pathwayLastUpdatedAt: serverTimestamp(),
                        updatedAt: serverTimestamp()
                    });
                })
                .then(() => {
                    setTimeout(() => {
                        window.location.href = 'student-dashboard.html#pathway';
                    }, 1200);
                })
                .catch((error) => console.error("Error saving pathway result:", error));

        } else {
            addAlert(alertsContainer, 'alert-warning', 'fa-user-lock', 'Create an account or login to save your pathway result and access it later.');
        }

        // Smooth scroll to results
        setTimeout(() => {
            resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            revealOnScroll(); // trigger animations in results
        }, 100);
    }

    function addAlert(container, typeClass, iconClass, message) {
        const div = document.createElement('div');
        div.className = `alert-box ${typeClass}`;
        div.innerHTML = `<i class="fas ${iconClass}"></i> <p>${message}</p>`;
        container.appendChild(div);
    }

    function populateTags(containerId, items, classes) {
        const container = document.getElementById(containerId);
        container.innerHTML = '';
        items.forEach(item => {
            const span = document.createElement('span');
            span.className = classes;
            span.textContent = item;
            container.appendChild(span);
        });
    }
});
