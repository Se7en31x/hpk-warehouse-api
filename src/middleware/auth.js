const jwt = require('jsonwebtoken');

// 1. Middleware สำหรับเช็ค Token อย่างเดียว
const verifyToken = (req, res, next) => {
    const authHeader = req.headers.authorization;
    // console.log("🔑 DB Secret Key:", process.env.JWT_SECRET);
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Unauthorized' });
    }
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET.trim());
        req.user = decoded;
        next(); // ผ่านไปเช็ค Role ต่อ
    } catch (err) {
        console.log("❌ JWT Error:", err.message);
        return res.status(401).json({ message: 'Token invalid' });
    }
};

// 2. ฟังก์ชันช่วยเช็ค Role (Helper)
const checkRole = (groupEnv) => {
    return (req, res, next) => {
        const allowed = process.env[groupEnv].split(',');
        if (allowed.includes(req.user.role)) {
            return next();
        }
        res.status(403).json({ message: `Forbidden: ${groupEnv} only` });
    };
};

// 3. Export Middleware ที่รวมทั้งเช็ค Token และ Role
exports.authWarehouse = [verifyToken, checkRole('ROLE_WAREHOUSE_GROUP')];
exports.authUser = [verifyToken, checkRole('ROLE_HEALTHCARE_GROUP')];
exports.authProc = [verifyToken, checkRole('ROLE_PROCUREMENT_GROUP')];
exports.auth = [verifyToken, checkRole('ROLE_ALL_GROUPS')];