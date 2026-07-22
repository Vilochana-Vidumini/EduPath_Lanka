require('./seed-category-utils.cjs').seed('sample-content-seed-data.json').catch((error) => { console.error(error.message); process.exitCode = 1; });
