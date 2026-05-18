import { auth, database } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { ref, push, update, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

document.addEventListener('DOMContentLoaded', () => {
    let currentUser = null;

    onAuthStateChanged(auth, (user) => {
        if (user) {
            currentUser = user;
        } else {
            currentUser = null;
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

    if (pathwayForm) {
        pathwayForm.addEventListener('submit', (e) => {
            e.preventDefault();
            let isValid = true;

            // Basic Validation
            reqFields.forEach(id => {
                const el = document.getElementById(id);
                const err = document.getElementById(`${id}-error`);
                
                if (el.value.trim() === '') {
                    el.parentElement.classList.add('error');
                    err.textContent = 'This field is required';
                    err.classList.add('visible');
                    isValid = false;
                } else if (id === 'email' && !isValidEmail(el.value.trim())) {
                    el.parentElement.classList.add('error');
                    err.textContent = 'Invalid email';
                    err.classList.add('visible');
                    isValid = false;
                } else {
                    el.parentElement.classList.remove('error');
                    err.classList.remove('visible');
                }
            });

            if (isValid) {
                generateResults();
            }
        });

        // Clear errors on input
        reqFields.forEach(id => {
            const el = document.getElementById(id);
            el.addEventListener('input', () => {
                el.parentElement.classList.remove('error');
                document.getElementById(`${id}-error`).classList.remove('visible');
            });
        });

        resetBtn.addEventListener('click', () => {
            pathwayForm.reset();
            resultsSection.classList.add('hidden');
            reqFields.forEach(id => {
                document.getElementById(id).parentElement.classList.remove('error');
                document.getElementById(`${id}-error`).classList.remove('visible');
            });
            window.scrollTo({ top: pathwayForm.offsetTop - 100, behavior: 'smooth' });
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

            // Push to pathwayResults/{uid}
            const pathwayRef = ref(database, `pathwayResults/${uid}`);
            push(pathwayRef, pathwayData)
                .then(() => {
                    addAlert(alertsContainer, 'alert-success', 'fa-save', 'Your pathway result has been securely saved to your account!');
                })
                .catch((error) => console.error("Error saving pathway result:", error));

            // Update student profile
            const studentUpdates = {
                educationLevel: eduLevel,
                interestArea: interest,
                futureGoal: goal,
                updatedAt: serverTimestamp()
            };
            update(ref(database, `students/${uid}`), studentUpdates).catch(e => console.error(e));

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
