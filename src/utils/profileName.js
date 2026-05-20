/**
 * รวมชื่อจาก profiles (ไม่มี email ใน model — ใช้ชื่อไทย/อังกฤษ)
 */
const formatProfileName = (profile) => {
    if (!profile) return null;
    const th = [profile.firstname_th, profile.lastname_th].filter(Boolean).join(' ').trim();
    const en = [profile.firstname_en, profile.lastname_en].filter(Boolean).join(' ').trim();
    return th || en || null;
};

const selectProfileDisplayName = async (profileId, tx) => {
    if (!profileId || !tx) return null;
    const profile = await tx.profiles.findUnique({
        where: { id: String(profileId) },
        select: {
            firstname_th: true,
            lastname_th: true,
            firstname_en: true,
            lastname_en: true,
        },
    });
    return formatProfileName(profile);
};

module.exports = { formatProfileName, selectProfileDisplayName };
