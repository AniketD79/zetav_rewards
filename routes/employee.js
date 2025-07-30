const express = require('express');
const multer = require('multer');
const path = require('path');
const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const { verifyToken, requireRole } = require('../middleware/auth');
const logAudit = require('../utils/logger');

const router = express.Router();

// Setup multer storage for profile picture uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/'); // Make sure this folder exists or handle creation
  },
  filename: function (req, file, cb) {
    // Save file with userId + timestamp + original extension
    const ext = path.extname(file.originalname);
    cb(null, req.user.id + '-' + Date.now() + ext);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // limit 2MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error('Only images are allowed (jpeg, jpg, png, gif)'));
  },
});

// Get Logged-in User Info
router.get('/me', verifyToken, async (req, res) => {
  const userId = req.user.id;

  try {
    // Fetch base user info with department
    const [userRows] = await pool.query(
      `SELECT u.id, u.name, u.email, u.role, u.profile_picture,
              u.contact_info, u.employee_id, u.date_of_joining,
              d.name AS department_name,
              u.manager_id
       FROM users u
       LEFT JOIN departments d ON u.department_id = d.id
       WHERE u.id = ?`,
      [userId]
    );

    if (userRows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const user = userRows[0];

    // Fetch manager info if employee
    if (user.role === 'employee' && user.manager_id) {
      const [mgrRows] = await pool.query(
        `SELECT id, name, email, profile_picture FROM users WHERE id = ?`,
        [user.manager_id]
      );
      user.manager = mgrRows.length ? mgrRows[0] : null;
    } else {
      user.manager = null;
    }

    // Points data depending on role
    if (user.role === 'employee') {
      const [[{ earned }]] = await pool.query(
        `SELECT COALESCE(SUM(points), 0) AS earned FROM reward_points WHERE receiver_id = ?`,
        [userId]
      );
      const [[{ redeemed }]] = await pool.query(
        `SELECT COALESCE(SUM(required_points), 0) AS redeemed FROM redemptions WHERE user_id = ? AND status = 'approved'`,
        [userId]
      );
      user.employee_earned_points = earned || 0;
      user.employee_redeemed_points = redeemed || 0;
      user.employee_available_points = (earned || 0) - (redeemed || 0);
    } 
    else if (user.role === 'manager') {
      const [[{ assigned }]] = await pool.query(
        `SELECT COALESCE(SUM(points_assigned), 0) AS assigned FROM manager_points WHERE manager_id = ?`,
        [userId]
      );
      const [[{ remaining }]] = await pool.query(
        `SELECT COALESCE(SUM(remaining_points), 0) AS remaining FROM manager_points WHERE manager_id = ?`,
        [userId]
      );
      user.manager_assigned_points = assigned || 0;
      user.manager_remaining_points = remaining || 0;
    }
    else if (user.role === 'admin') {
      // Fetch admin budget info
      const [budgetRows] = await pool.query(
        `SELECT total_points, remaining_points, point_value FROM admin_budget WHERE admin_id = ?`,
        [userId]
      );

      // If no budget record found, default zeros
      const budget = budgetRows.length > 0 ? budgetRows[0] : {
        total_points: 0,
        remaining_points: 0,
        point_value: 0
      };

      // Calculate assigned points by summing all assigned manager points
      const [[{ assigned_points }]] = await pool.query(
        `SELECT COALESCE(SUM(points_assigned), 0) AS assigned_points FROM manager_points`
      );

      user.admin_total_points = budget.total_points || 0;
      user.admin_remaining_points = budget.remaining_points || 0;
      user.admin_point_value = budget.point_value || 0;
      user.admin_assigned_points = assigned_points || 0;
    }

    return res.json(user);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: err.message });
  }
});


// Get current points
router.get('/points', verifyToken, requireRole('employee'), async (req, res) => {
  const uid = req.user.id;
  try {
    const [[{ earned }]] = await pool.query(
      'SELECT COALESCE(SUM(points), 0) AS earned FROM reward_points WHERE receiver_id = ?',
      [uid]
    );
    const [[{ redeemed }]] = await pool.query(
      'SELECT COALESCE(SUM(required_points), 0) AS redeemed FROM redemptions WHERE user_id = ? AND status = "approved"',
      [uid]
    );

    res.json({
      earned_points: earned || 0,
      redeemed_points: redeemed || 0,
      available_points: (earned || 0) - (redeemed || 0),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get assigned manager info
router.get('/manager', verifyToken, requireRole('employee'), async (req, res) => {
  try {
    const [[emp]] = await pool.query('SELECT manager_id FROM users WHERE id = ?', [req.user.id]);
    if (!emp.manager_id) return res.status(404).json({ message: 'No manager assigned.' });

    const [[manager]] = await pool.query('SELECT id, name, email, role FROM users WHERE id = ?', [emp.manager_id]);
    res.json(manager);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Update profile (name, picture, contact info)
// Accepts multipart/form-data with optional file 'profile_picture'
router.put('/profile', verifyToken, requireRole('employee'), upload.single('profile_picture'), async (req, res) => {
  const { name, contact_info } = req.body;
  let profile_picture;

  if (req.file) {
    profile_picture = req.file.filename; // or use req.file.path if storing full path
  }

  try {
    // Build dynamic query to update fields conditionally
    let query = 'UPDATE users SET name = ?, contact_info = ?';
    const params = [name, contact_info];

    if (profile_picture) {
      query += ', profile_picture = ?';
      params.push(profile_picture);
    }

    query += ' WHERE id = ?';
    params.push(req.user.id);

    await pool.query(query, params);

    await logAudit(req.user.id, 'employee', 'Updated Profile', name);

    res.json({ message: 'Profile updated.', profile_picture: profile_picture || null });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Change password
router.put('/password', verifyToken, requireRole('employee'), async (req, res) => {
  const { current_password, new_password } = req.body;

  try {
    const [[user]] = await pool.query('SELECT password FROM users WHERE id = ?', [req.user.id]);
    const valid = await bcrypt.compare(current_password, user.password);
    if (!valid) return res.status(400).json({ message: 'Incorrect current password' });

    const hashed = await bcrypt.hash(new_password, 10);
    await pool.query('UPDATE users SET password = ? WHERE id = ?', [hashed, req.user.id]);

    await logAudit(req.user.id, 'employee', 'Changed Password');

    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /redemptions (or similar route)
router.post('/redemptions', verifyToken, requireRole('employee'), async (req, res) => {
  const { reward_id } = req.body; // id of the reward selected from catalog

  try {
    // Fetch reward details (title, points, category_id)
    const [[reward]] = await pool.query('SELECT title, points_required, category_id FROM rewards WHERE id = ?', [reward_id]);
    if (!reward) {
      return res.status(404).json({ message: 'Reward not found' });
    }

    // Check if employee has enough points (earned - redeemed)
    const [[{ earned }]] = await pool.query('SELECT COALESCE(SUM(points), 0) AS earned FROM reward_points WHERE receiver_id = ?', [req.user.id]);
    const [[{ redeemed }]] = await pool.query('SELECT COALESCE(SUM(required_points), 0) AS redeemed FROM redemptions WHERE user_id = ? AND status = "approved"', [req.user.id]);
    const available = earned - redeemed;

    if (reward.points_required > available) {
      return res.status(400).json({ message: 'Not enough points to redeem this reward.' });
    }

    // Insert new redemption with status 'pending'
    await pool.query(
      'INSERT INTO redemptions (user_id, reward_title, required_points, status, category_id) VALUES (?, ?, ?, ?, ?)',
      [req.user.id, reward.title, reward.points_required, 'pending', reward.category_id]
    );

    await logAudit(req.user.id, 'employee', 'Redemption Requested', `Requested ${reward.title} worth ${reward.points_required} points`);

    res.json({ message: 'Redemption request submitted and pending approval.' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Request notification (to manager/admin)
router.post('/notifications/request', verifyToken, requireRole('employee'), async (req, res) => {
  const { message } = req.body;
  try {
    const [[emp]] = await pool.query('SELECT manager_id FROM users WHERE id = ?', [req.user.id]);
    if (!emp.manager_id) return res.status(400).json({ message: 'No manager assigned.' });

    await pool.query(
      'INSERT INTO notifications (sender_id, recipient_id, message, type) VALUES (?, ?, ?, ?)',
      [req.user.id, emp.manager_id, message, 'employee_request']
    );

    await logAudit(req.user.id, 'employee', 'Notification Sent', message);
    res.json({ message: 'Notification sent to manager.' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
