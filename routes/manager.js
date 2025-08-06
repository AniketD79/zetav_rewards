const express = require('express');
const pool = require('../config/db');
const { verifyToken, requireRole } = require('../middleware/auth');
const logAudit = require('../utils/logger');
const fs = require('fs');
const path = require('path');
const sendPushNotification = require('../sendPushNotification');
const router = express.Router();

//  Helper: Check if employee belongs to the requesting manager
async function isMyEmployee(managerId, employeeId) {
  const [[user]] = await pool.query(
    `SELECT u.id
     FROM users u
     WHERE u.id = ? AND u.manager_id = ?`,
    [employeeId, managerId]
  );
  return !!user;
}

// Get All Employees Assigned to This Manager 
router.get('/employees', verifyToken, requireRole('manager'), async (req, res) => {
  try {
    const [employees] = await pool.query(
      `SELECT 
         u.id,
         u.name,
         u.email,
         u.profile_picture,
         u.role,
         d.name AS department_name,
         u.approved,
         u.contact_info,
         u.created_at
       FROM users u
       LEFT JOIN departments d ON u.department_id = d.id
       WHERE u.manager_id = ?`,
      [req.user.id]
    );
    res.json(employees);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get Single Employee Detail 
router.get('/employees/:id', verifyToken, requireRole('manager'), async (req, res) => {
  const { id } = req.params;
  try {
    const isAssigned = await isMyEmployee(req.user.id, id);
    if (!isAssigned) return res.status(403).json({ message: 'Unauthorized access' });

    const [[employee]] = await pool.query(
      `SELECT 
         u.id,
         u.name,
         u.email,
         u.profile_picture,
         u.role,
         d.name AS department_name,
         u.approved,
         u.contact_info,
         u.created_at
       FROM users u
       LEFT JOIN departments d ON u.department_id = d.id
       WHERE u.id = ?`,
      [id]
    );

    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    const [[{ total_points }]] = await pool.query(
      `SELECT COALESCE(SUM(points), 0) AS total_points
       FROM reward_points
       WHERE receiver_id = ?`,
      [id]
    );

    res.json({
      ...employee,
      total_points
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});



// Reward Points to Employee

router.post('/rewardpoint', verifyToken, requireRole('admin', 'manager'), async (req, res) => {
  const { receiver_id, points, reason, reason_id, caption } = req.body;

  try {
    // Assigned employee check managers
    if (req.user.role === 'manager') {
      const isAssigned = await isMyEmployee(req.user.id, receiver_id);
      if (!isAssigned) {
        return res.status(403).json({ message: 'Not your assigned employee' });
      }
    }


    let remaining = 0;
    if (req.user.role === 'manager') {
      const [[managerRow]] = await pool.query(
        'SELECT COALESCE(SUM(remaining_points), 0) AS remaining FROM manager_points WHERE manager_id = ?',
        [req.user.id]
      );
      remaining = managerRow.remaining;
    } else if (req.user.role === 'admin') {
      const [[adminRow]] = await pool.query(
        'SELECT COALESCE(remaining_points, 0) AS remaining FROM admin_budget WHERE admin_id = ?',
        [req.user.id]
      );
      remaining = adminRow ? adminRow.remaining : 0;
    }

    //console.log(`Remaining points for ${req.user.role} ID ${req.user.id}:`, remaining);

    if (!remaining || points > remaining) {
      return res.status(400).json({ message: 'Not enough points' });
    }

    // Reward reason lookup
    let reasonImage = null;
    let rewardReasonText = reason;
    if (reason_id) {
      const [[reasonRow]] = await pool.query(
        'SELECT img, reason FROM rewardreason WHERE id = ?',
        [reason_id]
      );
      if (!reasonRow) {
        return res.status(400).json({ message: 'Invalid reason_id provided' });
      }
      reasonImage = reasonRow.img;
      if (!reason) {
        rewardReasonText = reasonRow.reason;
      }
    }

    // Insert reward_points record
    await pool.query(
      'INSERT INTO reward_points (giver_id, receiver_id, points, reason, reason_id) VALUES (?, ?, ?, ?, ?)',
      [req.user.id, receiver_id, points, rewardReasonText || '', reason_id || null]
    );

    // Deduct points from appropriate table
    if (req.user.role === 'manager') {
      await pool.query(
        'UPDATE manager_points SET remaining_points = remaining_points - ? WHERE manager_id = ? LIMIT 1',
        [points, req.user.id]
      );
    } else if (req.user.role === 'admin') {
      await pool.query(
        'UPDATE admin_budget SET remaining_points = remaining_points - ? WHERE admin_id = ?',
        [points, req.user.id]
      );
    }

    // Compose post image URL if file exists
    let imageUrl = null;
    if (reasonImage) {
      const imageFileName = reasonImage.replace(/^\/post_images\//, '');
      const imageDiskPath = path.join(__dirname, '..', 'post_images', imageFileName);
      if (fs.existsSync(imageDiskPath)) {
        imageUrl = `/post_images/${imageFileName}`;
      }
    }

    // Insert post record
    await pool.query(
      'INSERT INTO posts (giver_id, receiver_id, points, reason, image_url, caption) VALUES (?, ?, ?, ?, ?, ?)',
      [req.user.id, receiver_id, points, rewardReasonText || '', imageUrl, caption || null]
    );

    // Send push notification if receiver has a token
    
// Fetch giver and receiver names
const [[giver]] = await pool.query('SELECT name FROM users WHERE id = ?', [req.user.id]);
const [[receiver]] = await pool.query('SELECT name FROM users WHERE id = ?', [receiver_id]);

// Compose notification title and body with names
const notificationTitle = 'New Reward Posted!';
const notificationBody = `${giver.name} rewarded ${receiver.name} with ${points} points.`;

// Get all users having a valid fcm_token
const [rows] = await pool.query(
  "SELECT fcm_token FROM users WHERE fcm_token IS NOT NULL AND fcm_token != ''"
);

// Send push notification to all users
for (const row of rows) {
  await sendPushNotification(row.fcm_token, {
    title: notificationTitle,
    body: notificationBody
  });
}

    // Log audit entry
    await logAudit(
      req.user.id,
      req.user.role,
      'Reward Given with Post',
      `Rewarded ${points} pts to employee ${receiver_id} with reason id ${reason_id || 'N/A'}${caption ? ` and caption: ${caption}` : ''}`
    );

    res.json({ message: 'Rewarded successfully and post created.' });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});




// View Manager Points 
router.get('/points', verifyToken, requireRole('manager'), async (req, res) => {
  try {
    const [[{ assigned }]] = await pool.query(
      'SELECT COALESCE(SUM(points_assigned), 0) AS assigned FROM manager_points WHERE manager_id = ?',
      [req.user.id]
    );
    const [[{ remaining }]] = await pool.query(
      'SELECT COALESCE(SUM(remaining_points), 0) AS remaining FROM manager_points WHERE manager_id = ?',
      [req.user.id]
    );

    res.json({
      assigned_points: assigned,
      remaining_points: remaining,
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});



module.exports = router;
