const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');
require('dotenv').config();
// ตั้งค่าดึงกุญแจจาก Supabase (ใช้ URL ที่คุณเคยส่งมา)
const client = jwksClient({
  jwksUri: `https://${process.env.SUPABASE_PROJECT_ID}.supabase.co/auth/v1/.well-known/jwks.json`,
  cache: true,        // เก็บกุญแจไว้ใน Cache จะได้ไม่ต้องวิ่งไปถามบ่อยๆ
  rateLimit: true,
  jwksRequestsPerMinute: 5
});

// ฟังก์ชันสำหรับหา Signing Key ที่ตรงกับ Token ที่ส่งมา
function getKey(header, callback) {
  client.getSigningKey(header.kid, (err, key) => {
    if (err) {
      callback(err, null);
    } else {
      const signingKey = key.getPublicKey();
      callback(null, signingKey);
    }
  });
}

const mw = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Unauthorized: no token provided' });
  }

  const token = authHeader.split(' ')[1];

  // ✅ ใช้ getKey แทนการใส่กุญแจตรงๆ
  jwt.verify(token, getKey, { algorithms: ['ES256'] }, (err, decoded) => {
    if (err) {
      console.error('❌ [Backend] JWT Verification Error:', err.message);
      return res.status(401).json({ success: false, message: `Unauthorized: ${err.message}` });
    }

    const meta = decoded.app_metadata || {};

    req.user = {
      sub: decoded.sub,
      email: decoded.email || null,
      // role: { id, name } — used for admin/user branching
      role: meta.role && typeof meta.role === 'object'
              ? { id: Number(meta.role.id) || null, name: String(meta.role.name || 'guest') }
              : { id: null, name: 'guest' },
      // departments: [{ id, name }] — user's allowed department IDs
      departments: Array.isArray(meta.departments)
                    ? meta.departments.map(d => ({ id: Number(d.id), name: String(d.name || '') }))
                    : [],
      // systems: [{ id, name }] — kept for backwards compatibility
      systems: Array.isArray(meta.systems) ? meta.systems : [],
    };

    next();
  });
};

module.exports = { mw };