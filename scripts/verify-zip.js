'use strict';
const { PrismaClient } = require('@prisma/client');

async function run() {
  const p = new PrismaClient();
  try {
    // Province 57 spot-check
    const prov57 = await p.$queryRawUnsafe(
      `SELECT district, value, zip_code FROM public.lookup_district WHERE provcode = '57' ORDER BY district`
    );
    console.log('\n── Province 57 (Chiang Rai) districts ──────────────────────────');
    for (const r of prov57) {
      const marker = r.district === '5703' ? ' ← Chiang Khong (override)' : '';
      console.log(`  ${r.district}  ${(r.value || '').padEnd(28)}  ${r.zip_code || 'NULL'}${marker}`);
    }

    // Overall stats
    const [{ total }] = await p.$queryRawUnsafe(
      `SELECT COUNT(*) AS total FROM public.lookup_district`
    );
    const [{ with_zip }] = await p.$queryRawUnsafe(
      `SELECT COUNT(*) AS with_zip FROM public.lookup_district WHERE zip_code IS NOT NULL`
    );
    const [{ null_zip }] = await p.$queryRawUnsafe(
      `SELECT COUNT(*) AS null_zip FROM public.lookup_district WHERE zip_code IS NULL`
    );
    console.log('\n── Overall stats ───────────────────────────────────────────────');
    console.log(`  Total districts : ${total}`);
    console.log(`  With zip_code   : ${with_zip}`);
    console.log(`  NULL zip_code   : ${null_zip}`);

    // Confirm subdistrict table no longer has zip_code
    const col = await p.$queryRawUnsafe(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'lookup_subdistrict' AND column_name = 'zip_code'
    `);
    const hasCol = col.length > 0;
    console.log(`\n  lookup_subdistrict.zip_code exists: ${hasCol}  ${hasCol ? '✗ STILL THERE' : '✓ REMOVED'}`);

    // Confirm Chiang Khong
    const ck = prov57.find(r => r.district === '5703');
    if (ck) {
      const ok = ck.zip_code === '57140';
      console.log(`  District 5703 (${ck.value}) zip_code = ${ck.zip_code}  ${ok ? '✓ PASS' : '✗ FAIL'}`);
    } else {
      console.log('  District 5703 NOT FOUND');
    }
    console.log('────────────────────────────────────────────────────────────────\n');
  } finally {
    await p.$disconnect();
  }
}

run().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
