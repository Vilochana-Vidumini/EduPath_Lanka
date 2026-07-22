# EduPath Lanka Category Backfill Report

- Migration date: 2026-07-18T14:57:06.508Z
- Mode: live-apply-approved
- Migration version: category-backfill-v1

## Summary

| Content | Scanned | Updated | Needs review |
|---|---:|---:|---:|
| Courses | 12 | 12 | 0 |
| Scholarships | 2 | 2 | 0 |
| Mentors | 7 | 7 | 1 |
| Institutes | 2 | 2 | 0 |
| Talent opportunities | 0 | 0 | 0 |

## Items requiring manual review

- `mentors/Sz92AwirtNVx8vusNYbMowbN1Bk1` - Vindya Jayasingha: No category reached the confidence threshold

## Categories used

- `academic_accounting_and_finance`
- `academic_arts_and_humanities`
- `academic_business_and_management`
- `academic_engineering_and_technology`
- `academic_foundation_and_academic_improvement`
- `academic_information_technology`
- `academic_medicine_and_health_sciences`
- `course_ai_and_machine_learning`
- `course_business_management`
- `course_digital_marketing`
- `course_graphic_design`
- `course_marketing`
- `course_software_development`
- `course_web_development`
- `mentor_accounting_mentor`
- `mentor_engineering_mentor`
- `mentor_it_mentor`
- `mentor_marketing_mentor`
- `provider_private_institute`
- `scholarship_academic_merit_scholarships`
- `scholarship_financial_aid_scholarships`
- `talent_dancing`

## Warnings

- 1 records need manual category review.
- Existing non-empty fields are preserved; migration metadata and updatedAt are refreshed.

## Next steps

- Review all records marked `needsCategoryReview: true` in the admin dashboard.
- Run recommendation regression tests after applying the migration.
- Keep legacy text fields until all clients use category IDs.
