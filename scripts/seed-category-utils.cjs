const fs = require('fs');
const path = require('path');
async function seed(fileName) {
  const dryRun = process.argv.includes('--dry-run');
  const filePath = path.resolve(__dirname, '..', 'sample-data', fileName);
  const source = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const updates = {};
  const timestamp = Date.now();
  for (const [collection, records] of Object.entries(source)) {
    for (const [id, record] of Object.entries(records || {})) {
      updates[`${collection}/${id}`] = {...record, createdAt: record.createdAt || timestamp, updatedAt: timestamp};
    }
  }
  console.log(`Prepared ${Object.keys(updates).length} non-destructive multipath updates from ${fileName}.`);
  if (dryRun) { console.log('Dry run complete; no database writes were made.'); return; }
  const databaseUrl = (process.env.FIREBASE_DATABASE_URL || 'https://edupath-lanka-af6ae-default-rtdb.asia-southeast1.firebasedatabase.app').replace(/\/$/, '');
  const token = process.env.FIREBASE_DATABASE_AUTH_TOKEN;
  if (!token) throw new Error('Set FIREBASE_DATABASE_AUTH_TOKEN to an authenticated admin token, or run with --dry-run.');
  const response = await fetch(`${databaseUrl}/.json?auth=${encodeURIComponent(token)}`, {method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify(updates)});
  if (!response.ok) throw new Error(`Firebase update failed (${response.status}): ${await response.text()}`);
  console.log(`Seeded ${Object.keys(updates).length} records without deleting unrelated database data.`);
}
module.exports = { seed };
