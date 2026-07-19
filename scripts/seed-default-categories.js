require('./seed-category-utils.cjs').seed('default-category-seed-data.json').catch((error) => { console.error(error.message); process.exitCode = 1; });
