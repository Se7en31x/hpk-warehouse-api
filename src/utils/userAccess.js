/**
 * Helpers for role-based access control.
 * Works with the user object attached by auth middleware (req.user).
 *
 * Expected shape:
 *   req.user = {
 *     sub:         string  (Supabase user UUID)
 *     role:        { id: number|null, name: string }
 *     departments: Array<{ id: number, name: string }>
 *   }
 */

/**
 * Returns true when the user has the 'admin' role.
 * @param {object|null} user  req.user
 */
const isAdmin = (user) =>
  (user?.role?.name || '').toString().toLowerCase() === 'admin';

/**
 * Returns the numeric department IDs the user belongs to.
 * @param {object|null} user  req.user
 * @returns {number[]}
 */
const getUserDepartmentIds = (user) =>
  (user?.departments || [])
    .map((d) => Number(d.id))
    .filter((id) => Number.isInteger(id) && id > 0);

module.exports = { isAdmin, getUserDepartmentIds };
