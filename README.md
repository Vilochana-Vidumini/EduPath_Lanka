# EduPath Lanka

EduPath Lanka is a student guidance and opportunity recommendation platform designed to help Sri Lankan students choose suitable academic, talent, and career pathways. The platform connects students with mentors, institutes, courses, scholarships, and talent opportunities through a path-based and category-based recommendation system.

---

## Project Overview

Many students face difficulties when selecting the correct academic direction, career path, talent development opportunity, or suitable mentor. Information about courses, scholarships, institutes, and opportunities is often scattered across different platforms.

EduPath Lanka provides a centralized digital platform where students can create profiles, complete a pathway selection process, and receive personalized recommendations based on their interests, skills, education level, talents, and goals.

---

## Main Objectives

- Help students identify suitable academic, talent, and career pathways.
- Provide personalized recommendations for students.
- Connect students with mentors for academic, career, research, and pathway guidance.
- Allow institutes to publish courses, scholarships, and opportunities after admin approval.
- Support talent-based students through talent opportunities, skill courses, mentors, and scholarships.
- Provide a mentor learning mode where mentors can request guidance from other mentors.
- Give admins control over users, content, approvals, categories, and platform management.

---

## User Roles

### 1. Student

Students can:

- Register and login to the platform.
- Complete personal profile details.
- Use the Pathway Finder to select a suitable path.
- Maintain path-based profiles.
- View personalized recommendations.
- Request guidance from mentors.
- Make appointments with mentors.
- Apply for courses, scholarships, and talent opportunities.
- Send messages and track progress.

Student pathway types:

- Academic Path
- Talent Path
- Combined Path
- Undecided Path
- Academic Improvement Path

---

### 2. Mentor

Mentors can:

- Register and complete mentor profile details.
- Add expertise areas, education background, experience, and availability.
- Receive student mentorship requests.
- Accept or reject guidance requests.
- View student profiles before accepting requests.
- Manage mentees.
- Manage appointments.
- Communicate with students.
- Provide academic, career, research, and pathway guidance.

---

### 3. Mentor Learning Mode

Mentor Learning Mode allows a mentor to act as a learner while keeping their main account role as Mentor.

Mentors can request guidance from other mentors for:

- Undergraduate studies
- Master’s studies
- PhD research
- Thesis or research work
- Career development
- Professional skills
- Mentoring skills

This supports mentor-to-mentor guidance without changing the user’s main account role.

---

### 4. Institute

Institutes can:

- Register through an authorized representative.
- Complete official institute profile details.
- Submit the institute profile for admin approval.
- Publish courses after approval.
- Publish scholarships after approval.
- Create events or learning opportunities.
- Manage student applications and inquiries.
- Update institute public profile information.

The system separates:

- Representative details
- Official institute details

The dashboard displays the institute name after institute profile completion, not the representative name.

---

### 5. Admin

Admins can:

- Manage student accounts.
- Manage mentor accounts.
- Approve or reject mentor profiles.
- Approve or reject institute profiles.
- Manage courses, scholarships, institutes, mentors, and talent opportunities.
- Manage category systems.
- Monitor student profile completion and recommendation readiness.
- Manage public content.
- View student details and recommendation status.
- Handle platform approvals and communication.

---

### 6. Future Coach Role

A future role called Coach is planned for practical talent-based guidance.

Coaches will support areas such as:

- Dancing
- Music
- Sports
- Art
- Public speaking
- Photography
- Creative skills

Coaches can be linked with talent opportunities when they conduct workshops, training programs, auditions, or practical sessions.

---

## Key Features

### Pathway Finder

The Pathway Finder collects student information and helps identify the most suitable student path.

It supports:

- Academic students
- Talent students
- Combined academic and talent students
- Undecided students
- Students who need academic improvement support

---

### Personalized Recommendations

EduPath Lanka uses a path-based and category-based recommendation logic.

The system checks:

- Student selected path
- Academic category
- Talent category
- Subcategory
- Specific skill
- Skill level
- Education level
- Preferred mode
- Preferred location
- Matching keywords

Based on this data, the system recommends relevant:

- Courses
- Scholarships
- Mentors
- Institutes
- Talent opportunities
- Skill courses

The recommendation system avoids showing unrelated opportunities by checking specific categories, subcategories, skills, and keywords.

---

### Talent Opportunities

Talent opportunities can include:

- Workshops
- Competitions
- Training programs
- Auditions
- Exhibitions
- Performances
- Talent scholarships
- Skill development programs

Talent opportunities are recommended based on the student’s talent profile.

Example:

A student with Visual Arts interests should receive art-related opportunities, not unrelated dancing or sports opportunities.

---

### Mentor Requests and Appointments

Students can:

- Send mentor guidance requests.
- View mentor details.
- Make appointments with mentors.
- Track request status.
- Communicate with mentors.

Mentors can:

- Accept or reject requests.
- Manage connected mentees.
- Manage appointment requests.
- Provide guidance sessions.

---

### Institute Approval Flow

Institute registration follows this process:

1. Authorized representative creates an institute account.
2. Representative completes official institute profile.
3. Institute profile is submitted for admin approval.
4. Admin approves or rejects the institute.
5. Approved institutes can publish courses, scholarships, and events.

---

## Technology Stack

- HTML
- CSS
- JavaScript
- Firebase Authentication
- Firebase Realtime Database
- Firebase Storage / Image URL support where required
- GitHub for version control

---

## Firebase Data Structure

Main Firebase nodes include:

```text
users
studentProfiles
pathwayResults
mentors
institutes
courses
scholarships
talentOpportunities
mentorRequests
mentorshipRequests
mentorshipConnections
appointments
messages
adminMessages
categories
