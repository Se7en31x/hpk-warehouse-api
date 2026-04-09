const settingsRepo = require('../repositories/settings.repo');

const getAll = async () => {
  try {
    const settings = await settingsRepo.getAllSettings();
    return settings;
  } catch (err) {
    // If table doesn't exist yet, return defaults
    console.warn('[settings.service] DB not ready, returning defaults:', err.message);
    return settingsRepo.DEFAULTS;
  }
};

const getByKey = async (key) => {
  try {
    return await settingsRepo.getSettingByKey(key);
  } catch {
    return settingsRepo.DEFAULTS[key]?.value ?? null;
  }
};

const getExpiringDays = async () => {
  const val = await getByKey('notify_expiring_days');
  return Math.max(1, parseInt(val || '30', 10));
};

const saveAll = async (payload = {}, updatedBy = null) => {
  // Validate known keys only
  const allowed = Object.keys(settingsRepo.DEFAULTS);
  const filtered = {};
  for (const [k, v] of Object.entries(payload)) {
    if (allowed.includes(k)) filtered[k] = v;
  }
  await settingsRepo.bulkUpsertSettings(filtered, updatedBy);
  return settingsRepo.getAllSettings();
};

module.exports = { getAll, getByKey, getExpiringDays, saveAll };
