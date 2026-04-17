const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

/** Zero-pad an Int code to a fixed-length string to match lookup table PKs */
const padCode = (val, len) =>
  val != null ? String(val).padStart(len, '0') : null;

/** Calculate age in years from a birth date */
const calcAge = (birthDate) => {
  if (!birthDate) return null;
  const now = new Date();
  const bd  = new Date(birthDate);
  let age   = now.getFullYear() - bd.getFullYear();
  const m   = now.getMonth() - bd.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < bd.getDate())) age--;
  return age;
};

/** Format a DateTime value to a Thai locale date string */
const formatThaiDate = (dt) => {
  if (!dt) return null;
  return new Date(dt).toLocaleDateString('th-TH', {
    year:  'numeric',
    month: 'long',
    day:   'numeric',
  });
};

/**
 * Build the full user profile by:
 *  1. Fetching the profiles row for the authenticated user
 *  2. Running parallel lookups for all coded fields
 *  3. Returning a clean, human-readable object
 *
 * @param {object} userSession  req.user (populated by auth middleware)
 */
const getProfile = async (userSession) => {
  const userId = userSession?.sub   || null;
  const email  = userSession?.email || null;

  console.log(`[profile.service] getProfile called — userId: ${userId} | email: ${email}`);

  if (!userId) {
    console.warn('[profile.service] No userId in session — returning guest profile');
    return { id: null, email, role: { id: null, name: 'guest' }, departments: [] };
  }

  // 1. Fetch the profiles row
  const profile = await prisma.profiles.findUnique({ where: { id: userId } });
  console.log(`[profile.service] profiles row found: ${profile ? 'YES' : 'NO (missing row for this UUID)'}`);

  // 2. Run all lookup queries in parallel (null-safe — each resolves to null when the FK is absent)
  const [
    titleRow,
    sexRow,
    nationRow,
    raceRow,
    provinceRow,
    districtRow,
    subdistrictRow,
    deptRows,
    roleRow,
  ] = await Promise.all([
    // title_code is a string PK — direct match
    profile?.title_code
      ? prisma.lookup_titles.findUnique({ where: { title_code: profile.title_code } })
      : null,

    // sex_id is Int; sex_code is VarChar(1) — convert String(sex_id)
    profile?.sex_id != null
      ? prisma.lookup_sex.findFirst({ where: { sex_code: String(profile.sex_id) } })
      : null,

    // nationality is Int; nation_code is VarChar(3) — zero-pad to 3 chars
    profile?.nationality != null
      ? prisma.lookup_nations.findFirst({ where: { nation_code: padCode(profile.nationality, 3) } })
      : null,

    // race uses the same lookup_nations table
    profile?.race != null
      ? prisma.lookup_nations.findFirst({ where: { nation_code: padCode(profile.race, 3) } })
      : null,

    // province_code is Int; province PK is VarChar(2) — zero-pad to 2 chars
    profile?.province_code != null
      ? prisma.lookup_province.findFirst({ where: { province: padCode(profile.province_code, 2) } })
      : null,

    // district_code is Int; district PK is VarChar(4) — zero-pad to 4 chars
    profile?.district_code != null
      ? prisma.lookup_district.findFirst({ where: { district: padCode(profile.district_code, 4) } })
      : null,

    // subdistrict_code is Int; subdistrict PK is VarChar(6) — zero-pad to 6 chars
    profile?.subdistrict_code != null
      ? prisma.lookup_subdistrict.findFirst({ where: { subdistrict: padCode(profile.subdistrict_code, 6) } })
      : null,

    // department_id is Int[] — fetch all matching rows
    profile?.department_id?.length > 0
      ? prisma.departments.findMany({
          where:   { id: { in: profile.department_id }, is_disable: false },
          select:  { id: true, name: true, code: true },
          orderBy: { id: 'asc' },
        })
      : Promise.resolve([]),

    // role_id is Int — join with roles table for Thai name
    profile?.role_id != null
      ? prisma.roles.findUnique({ where: { id: profile.role_id } })
      : null,
  ]);

  return {
    id:           userId,
    email,
    firstname_th: profile?.firstname_th  || null,
    lastname_th:  profile?.lastname_th   || null,
    firstname_en: profile?.firstname_en  || null,
    lastname_en:  profile?.lastname_en   || null,

    title: titleRow
      ? { code: titleRow.title_code, short_name: titleRow.short_name ?? null, name: titleRow.name }
      : null,

    sex: sexRow ? { code: sexRow.sex_code, name: sexRow.sex } : null,

    birth_date: profile?.birth_date ? formatThaiDate(profile.birth_date) : null,
    age:        calcAge(profile?.birth_date),

    nationality: nationRow?.nation ?? null,
    race:        raceRow?.nation   ?? null,

    phone:         profile?.phone         || null,
    cid:           profile?.cid           || null,
    profession_id: profile?.profession_id || null,

    address: {
      detail:      profile?.address_detail  || null,
      subdistrict: subdistrictRow?.value    || null,
      district:    districtRow?.value       || null,
      province:    provinceRow?.value       || null,
      zip_code:    profile?.zip_code        || null,
    },

    departments: deptRows,

    role: roleRow
      ? { id: roleRow.id, name: roleRow.role_name_th, name_en: roleRow.role_name_en }
      : (userSession?.role ?? { id: null, name: 'guest' }),

    created_at: formatThaiDate(profile?.created_at ?? null),
  };
};

module.exports = { getProfile };
