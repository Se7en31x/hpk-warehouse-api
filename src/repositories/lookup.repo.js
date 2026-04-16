'use strict';

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Fetch all provinces, ordered by Thai name.
 * Returns: [{ id, name }]
 */
const getProvinces = async () => {
    const rows = await prisma.$queryRawUnsafe(`
        SELECT province AS id,
               value    AS name
        FROM   public.lookup_province
        ORDER  BY value
    `);
    return rows;
};

/**
 * Fetch districts for a given province.
 * Returns: [{ id, name }]  — zip lives on subdistricts, not here.
 *
 * @param {string} provinceId  2-char province code
 */
const getDistrictsByProvince = async (provinceId) => {
    const rows = await prisma.$queryRawUnsafe(`
        SELECT district AS id,
               value    AS name
        FROM   public.lookup_district
        WHERE  provcode = $1
        ORDER  BY value
    `, String(provinceId));
    return rows;
};

/**
 * Fetch subdistricts for a given district, including zip_code.
 * Returns: [{ id, name, zip_code }]
 *
 * @param {string} districtId  4-char district code (e.g. "1001")
 */
const getSubdistrictsByDistrict = async (districtId) => {
    const code = String(districtId).padStart(4, '0');
    const prov = code.slice(0, 2);
    const dist = code.slice(2, 4);

    const rows = await prisma.$queryRawUnsafe(`
        SELECT subdistrict AS id,
               value       AS name,
               zip_code
        FROM   public.lookup_subdistrict
        WHERE  provcode = $1
          AND  distcode = $2
        ORDER  BY value
    `, prov, dist);
    return rows;
};

module.exports = {
    getProvinces,
    getDistrictsByProvince,
    getSubdistrictsByDistrict,
};
