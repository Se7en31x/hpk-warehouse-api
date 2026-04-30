/**
 * Unit Converter — แปลงหน่วยบรรจุภัณฑ์เป็นหน่วยพื้นฐาน
 *
 * Pattern ที่รองรับ:
 *   "กล่อง 1 x (10 x 10 tab)"   → factor=100, label="เม็ด"
 *   "ลัง 1 x (24 x 1000 tab)"   → factor=24000, label="เม็ด"
 *   "กล่อง 1 x (1 x 50 amp)"    → factor=50, label="แอมป์"
 *   "ลัง 1 x (10 x 1000 ml.)"   → factor=10000, label="มล."
 *   "ลัง 1 x (50 x 100 cap)"    → factor=5000, label="แคปซูล"
 *   "ลัง 1 x (10 x 100 sachet)" → factor=1000, label="ซอง"
 *   "แพ็ค 1 x (50 pcs)"         → factor=50, label="ชิ้น"
 *   "ขวด"                        → factor=1, label="ขวด"
 *   "แพ็ค"                       → factor=1, label="แพ็ค"
 */

const BASE_UNIT_MAP = {
    tab:    'เม็ด',
    tabs:   'เม็ด',
    cap:    'แคปซูล',
    caps:   'แคปซูล',
    amp:    'แอมป์',
    amps:   'แอมป์',
    sachet: 'ซอง',
    sachets:'ซอง',
    'ml.':  'มล.',
    ml:     'มล.',
    pcs:    'ชิ้น',
    roll:   'ม้วน',
    rolls:  'ม้วน',
    'kg.':  'กก.',
    kg:     'กก.',
    boxes:  'กล่อง',
    box:    'กล่อง',
    packs:  'แพ็ค',
    pack:   'แพ็ค',
    reams:  'รีม',
    ream:   'รีม',
};

/**
 * แยก factor และ base unit label ออกจาก unit name
 * @param {string} unitName
 * @returns {{ factor: number, unitLabel: string }}
 */
const parseUnitName = (unitName) => {
    const name = (unitName || '').trim();

    // ดึงเนื้อหาใน parentheses เช่น "10 x 10 tab" จาก "กล่อง 1 x (10 x 10 tab)"
    const parenMatch = name.match(/\(([^)]+)\)/);
    if (!parenMatch) {
        // ไม่มี paren → หน่วยเดี่ยว ไม่ต้อง convert
        return { factor: 1, unitLabel: name };
    }

    const inner = parenMatch[1].trim(); // "10 x 10 tab"

    // แยก tokens
    const tokens = inner.split(/[\sx]+/i).map((t) => t.trim()).filter(Boolean);

    let factor = 1;
    let unitLabel = name; // fallback = ชื่อเดิมถ้าหา label ไม่เจอ

    for (const token of tokens) {
        const num = Number(token);
        if (!Number.isNaN(num) && num > 0) {
            factor *= num;
        } else {
            // token เป็น label — normalize lowercase แล้ว lookup
            const key = token.toLowerCase().replace(/\.$/, '') + (token.endsWith('.') ? '.' : '');
            const mapped = BASE_UNIT_MAP[token.toLowerCase()] || BASE_UNIT_MAP[key];
            if (mapped) {
                unitLabel = mapped;
            }
        }
    }

    return { factor, unitLabel };
};

/**
 * แปลงจำนวนตามหน่วยบรรจุภัณฑ์เป็นหน่วยพื้นฐาน
 * @param {string} unitName   - ชื่อหน่วยจาก units.name
 * @param {number} qty        - จำนวนที่เบิก (นับเป็น unitName)
 * @returns {{ convertedQty: number, unitLabel: string }}
 */
const resolveDispenseQty = (unitName, qty) => {
    const { factor, unitLabel } = parseUnitName(unitName);
    return {
        convertedQty: (qty || 0) * factor,
        unitLabel,
    };
};

module.exports = { resolveDispenseQty };
