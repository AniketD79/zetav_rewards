const pool = require('../config/db');

async function createNotification({ sender_id = null, recipient_id, message, type }) {
  await pool.query(
    'INSERT INTO notifications (sender_id, recipient_id, message, type) VALUES (?, ?, ?, ?)',
    [sender_id, recipient_id, message, type]
  );
}

module.exports = { createNotification };
