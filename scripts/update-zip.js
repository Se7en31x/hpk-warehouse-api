/**
 * update-zip.js
 *
 * Populates lookup_subdistrict.zip_code in three layers:
 *
 *   1. CODE MATCH   — direct 6-digit subdistrict code match from kongvut source
 *   2. NAME MATCH   — subdistrict name + district name match (cross-district safe)
 *   3. NAME OVERRIDE — hardcoded name-based SQL for district 5703 (Chiang Khong /
 *                      Wiang Kaen), applied last so it always wins regardless of
 *                      what the source says.
 *
 * Usage:  node scripts/update-zip.js
 */

'use strict';

const https  = require('https');
const { PrismaClient } = require('@prisma/client');

// ── Name-based overrides for district 5703 ───────────────────────────────────
// Applied via SQL UPDATE WHERE value = ANY(...) — keys off your DB's own
// value column, so code/name mismatches in the source are irrelevant.
const DISTRICT_5703_OVERRIDES = [
  { zip: '57140', names: ['ศรีดอนชัย'] },
  { zip: '57150', names: ['เวียง', 'สถาน', 'ครึ่ง', 'บุญเรือง', 'ห้วยซ้อ', 'ริมโขง'] },
  { zip: '57230', names: ['ม่วงยาย', 'ปอ', 'หล่ายงาว'] },
];

const SOURCE_SUBDISTRICT_URL =
  'https://raw.githubusercontent.com/kongvut/thai-province-data/refs/heads/master/api/latest/sub_district.json';
const SOURCE_DISTRICT_URL =
  'https://raw.githubusercontent.com/kongvut/thai-province-data/refs/heads/master/api/latest/district.json';

const BATCH_SIZE = 200;

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} from ${url}`));
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
        catch (e) { reject(new Error(`JSON parse: ${e.message}`)); }
      });
    }).on('error', reject);
  });
}

async function main() {
  const prisma = new PrismaClient();

  try {
    // ── A. Fetch source data ──────────────────────────────────────────────────
    console.log('Fetching source data…');
    const [subDistData, distData] = await Promise.all([
      fetchJson(SOURCE_SUBDISTRICT_URL),
      fetchJson(SOURCE_DISTRICT_URL),
    ]);
    console.log(`  sub_districts: ${subDistData.length}  districts: ${distData.length}\n`);

    // ── B. Build lookup maps ──────────────────────────────────────────────────

    // district id (numeric) → Thai name
    const distNameMap = new Map(distData.map(d => [d.id, (d.name_th || '').trim()]));

    // Primary: 6-char code → zip
    const zipByCode = new Map();
    for (const e of subDistData) {
      zipByCode.set(String(e.id).padStart(6, '0'), String(e.zip_code).padStart(5, '0'));
    }

    // Fallback: "sub_name|dist_name" → zip  (requires both names to agree)
    const zipByName = new Map();
    for (const e of subDistData) {
      const sub  = (e.name_th || '').trim();
      const dist = (distNameMap.get(e.district_id) || '').trim();
      if (!sub || !dist) continue;
      const key = `${sub}|${dist}`;
      if (!zipByName.has(key)) zipByName.set(key, String(e.zip_code).padStart(5, '0'));
    }

    console.log(`Primary code map : ${zipByCode.size} entries`);
    console.log(`Fallback name map : ${zipByName.size} entries\n`);

    // ── C. Load DB subdistricts with district name (for fallback matching) ────
    const dbRows = await prisma.$queryRawUnsafe(`
      SELECT s.subdistrict,
             s.value       AS sub_name,
             s.zip_code,
             d.value       AS dist_name
      FROM   public.lookup_subdistrict s
      JOIN   public.lookup_district    d
             ON d.district = (s.provcode || s.distcode)
    `);
    console.log(`DB has ${dbRows.length} subdistrict rows.\n`);

    // ── D. Determine target zip per row ───────────────────────────────────────
    let cntCode = 0, cntName = 0, cntSkip = 0;
    const toUpdate = [];

    for (const row of dbRows) {
      let targetZip;

      if (zipByCode.has(row.subdistrict)) {
        targetZip = zipByCode.get(row.subdistrict);
        cntCode++;
      } else {
        const key = `${(row.sub_name || '').trim()}|${(row.dist_name || '').trim()}`;
        targetZip = zipByName.get(key);
        if (targetZip) { cntName++; }
        else           { cntSkip++; continue; }
      }

      if (targetZip !== row.zip_code) {
        toUpdate.push({ code: row.subdistrict, zip: targetZip });
      }
    }

    console.log('Match summary:');
    console.log(`  Code match   : ${cntCode}`);
    console.log(`  Name match   : ${cntName}`);
    console.log(`  No match     : ${cntSkip} (left NULL)`);
    console.log(`  Rows to update : ${toUpdate.length}\n`);

    // ── E. Batch UPDATE ───────────────────────────────────────────────────────
    if (toUpdate.length > 0) {
      console.log(`Updating in batches of ${BATCH_SIZE}…`);
      let updated = 0;
      for (let i = 0; i < toUpdate.length; i += BATCH_SIZE) {
        const batch  = toUpdate.slice(i, i + BATCH_SIZE);
        const values = batch.map(r => `('${r.code}','${r.zip}')`).join(',');
        await prisma.$executeRawUnsafe(`
          UPDATE public.lookup_subdistrict AS t
          SET    zip_code = v.zip
          FROM  (VALUES ${values}) AS v(code, zip)
          WHERE  t.subdistrict = v.code
        `);
        updated += batch.length;
        process.stdout.write(`  Updated ${updated} / ${toUpdate.length}\r`);
      }
      console.log(`\nDone — ${updated} rows updated.\n`);
    } else {
      console.log('No source-based updates needed.\n');
    }

    // ── F. Name-based override for district 5703 (always applied) ────────────
    console.log('Applying district-5703 name-based overrides…');
    let overrideCount = 0;
    for (const { zip, names } of DISTRICT_5703_OVERRIDES) {
      const n = await prisma.$executeRawUnsafe(
        `UPDATE public.lookup_subdistrict
         SET    zip_code = $1
         WHERE  provcode = '57' AND distcode = '03'
           AND  value    = ANY($2::varchar[])`,
        zip, names
      );
      overrideCount += n;
      console.log(`  zip ${zip}  →  ${names.join(', ')}  (${n} row(s))`);
    }
    console.log(`  Total override rows: ${overrideCount}\n`);

    // ── G. Verification ───────────────────────────────────────────────────────
    console.log('── Verification: district 5703 ─────────────────────────────');
    console.log('  code    value             zip_code');
    console.log('  ──────  ────────────────  ────────');

    const EXPECTED = new Map([
      ['ศรีดอนชัย', '57140'],
      ['เวียง', '57150'], ['สถาน', '57150'], ['ครึ่ง', '57150'],
      ['บุญเรือง', '57150'], ['ห้วยซ้อ', '57150'], ['ริมโขง', '57150'],
      ['ม่วงยาย', '57230'], ['ปอ', '57230'], ['หล่ายงาว', '57230'],
    ]);

    const rows5703 = await prisma.$queryRawUnsafe(`
      SELECT subdistrict, value, zip_code
      FROM   public.lookup_subdistrict
      WHERE  provcode = '57' AND distcode = '03'
      ORDER  BY subdistrict
    `);

    let allOk = true;
    for (const row of rows5703) {
      const exp  = EXPECTED.get(row.value);
      const pass = !exp || row.zip_code === exp;
      if (!pass) allOk = false;
      const status = exp ? (pass ? '✓' : `✗ expected ${exp}`) : '';
      console.log(`  ${row.subdistrict}  ${(row.value ?? '').padEnd(16)}  ${row.zip_code ?? 'NULL'}  ${status}`);
    }
    console.log('────────────────────────────────────────────────────────────');
    console.log(allOk ? '  All district-5703 checks passed.' : '  One or more checks FAILED.');

  } finally {
    await prisma.$disconnect();
  }
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
