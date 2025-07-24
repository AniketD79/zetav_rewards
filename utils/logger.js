const pool = require('../config/db');

async function logAudit(userId, role, action, details = '') {
  try {
    await pool.query(
      `INSERT INTO audit_logs (user_id, role, action, details) VALUES (?, ?, ?, ?)`,
      [userId, role, action, details]
    );
  } catch (e) {
    console.error('Audit logger error:', e.message);
  }
}

module.exports = logAudit;
