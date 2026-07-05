// EduPath Lanka - mentor rating helpers

export const REVIEW_STATUSES_PUBLIC = ["published", "approved"];
export const REVIEW_STATUSES_SUMMARY = ["published", "approved"];

export function normalizeRatingStatus(value) {
    return String(value || "published").trim().toLowerCase().replace(/\s+/g, "_");
}

export function toRatingInt(value) {
    const number = typeof value === "string"
        ? Number(value.match(/[1-5](?:\.0+)?/)?.[0] || value)
        : Number(value);
    return Number.isInteger(number) && number >= 1 && number <= 5 ? number : 0;
}

export function calculateMentorRatingSummary(ratingsObject = {}) {
    const ratings = Object.values(ratingsObject || {}).filter((rating) => {
        const status = normalizeRatingStatus(rating.reviewStatus);
        return rating?.isVerified === true && REVIEW_STATUSES_SUMMARY.includes(status) && toRatingInt(rating.overallRating);
    });

    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    const empty = {
        averageRating: 0,
        totalRatings: 0,
        ratingDistribution: distribution,
        categoryAverages: {
            communication: 0,
            knowledge: 0,
            helpfulness: 0,
            professionalism: 0
        },
        recommendationPercentage: 0
    };

    if (!ratings.length) return empty;

    const categorySums = {
        communication: 0,
        knowledge: 0,
        helpfulness: 0,
        professionalism: 0
    };
    const categoryCounts = {
        communication: 0,
        knowledge: 0,
        helpfulness: 0,
        professionalism: 0
    };

    let total = 0;
    let recommends = 0;
    ratings.forEach((rating) => {
        const overall = toRatingInt(rating.overallRating);
        distribution[overall] += 1;
        total += overall;
        if (rating.wouldRecommend === true) recommends += 1;

        [
            ["communication", rating.communicationRating],
            ["knowledge", rating.knowledgeRating],
            ["helpfulness", rating.helpfulnessRating],
            ["professionalism", rating.professionalismRating]
        ].forEach(([key, value]) => {
            const categoryRating = toRatingInt(value);
            if (!categoryRating) return;
            categorySums[key] += categoryRating;
            categoryCounts[key] += 1;
        });
    });

    return {
        averageRating: roundOne(total / ratings.length),
        totalRatings: ratings.length,
        ratingDistribution: distribution,
        categoryAverages: {
            communication: averageCategory(categorySums.communication, categoryCounts.communication),
            knowledge: averageCategory(categorySums.knowledge, categoryCounts.knowledge),
            helpfulness: averageCategory(categorySums.helpfulness, categoryCounts.helpfulness),
            professionalism: averageCategory(categorySums.professionalism, categoryCounts.professionalism)
        },
        recommendationPercentage: Math.round((recommends / ratings.length) * 100)
    };
}

export function publicReviewRows(ratingsObject = {}) {
    return Object.values(ratingsObject || {})
        .filter((rating) => rating?.isVerified === true && REVIEW_STATUSES_PUBLIC.includes(normalizeRatingStatus(rating.reviewStatus)) && (rating.review || "").trim())
        .sort((a, b) => getTime(b.createdAt || b.updatedAt) - getTime(a.createdAt || a.updatedAt));
}

export function ratingLabel(summary = {}) {
    const total = Number(summary.totalRatings || 0);
    if (!total) return "New Mentor";
    return `${Number(summary.averageRating || 0).toFixed(1)} / 5 (${total} review${total === 1 ? "" : "s"})`;
}

function averageCategory(sum, count) {
    return count ? roundOne(sum / count) : 0;
}

function roundOne(value) {
    return Math.round(Number(value || 0) * 10) / 10;
}

function getTime(value) {
    if (!value) return 0;
    if (typeof value === "number") return value;
    if (typeof value === "object" && typeof value.seconds === "number") return value.seconds * 1000;
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
}
