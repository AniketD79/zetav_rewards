const express = require('express');
const pool = require('../config/db');
const { verifyToken, requireRole } = require('../middleware/auth');
const logAudit = require('../utils/logger');
const fs = require('fs');
const path = require('path');

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

// Reward Assigned Employee with Auto Post
router.post('/rewardpoint', verifyToken, requireRole('manager'), async (req, res) => {
  const { receiver_id, points, reason, reason_id, caption } = req.body; 

  try {
    const isAssigned = await isMyEmployee(req.user.id, receiver_id);
    if (!isAssigned) return res.status(403).json({ message: 'Not your assigned employee' });

    const [[{ remaining }]] = await pool.query(
      'SELECT COALESCE(SUM(remaining_points), 0) AS remaining FROM manager_points WHERE manager_id = ?',
      [req.user.id]
    );
    if (!remaining || points > remaining)
      return res.status(400).json({ message: 'Not enough points' });

    let reasonImage = null;
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
        req.body.reason = reasonRow.reason;
      }
    }

    await pool.query(
      'INSERT INTO reward_points (giver_id, receiver_id, points, reason, reason_id) VALUES (?, ?, ?, ?, ?)',
      [req.user.id, receiver_id, points, reason || '', reason_id || null]
    );

    await pool.query(
      'UPDATE manager_points SET remaining_points = remaining_points - ? WHERE manager_id = ? LIMIT 1',
      [points, req.user.id]
    );

    // Use only the image associated with the reason_id, no fallback!
    let imageUrl = null;
    if (reasonImage) {
      const imagePath = path.join(__dirname, '..', 'post_images', reasonImage);
      if (fs.existsSync(imagePath)) {
        imageUrl = `/post_images/${reasonImage}`;
      } else {
        // If image file is missing, do NOT assign any image URL
        imageUrl = null;
      }
    }

    // Insert the post with imageUrl that is either the reasonImage (if file exists) or null — no random
    await pool.query(
      'INSERT INTO posts (giver_id, receiver_id, points, reason, image_url, caption) VALUES (?, ?, ?, ?, ?, ?)',
      [req.user.id, receiver_id, points, reason || '', imageUrl, caption || null]
    );

    await logAudit(req.user.id, 'manager', 'Reward Given with Post',
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
